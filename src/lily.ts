// 青蛙：只在荷叶/石头上落脚（点位在 pondzone.ts 里逐片手标 + 吸附到叶心/石面），
// 起跳时机随机、落点按"距离加权轮盘赌"随机——近的多、远的也有，方向和远近都无序；
// 跳跃带压腿→腾空→落地的挤压与落地涟漪，另外不定期鼓腮。
import { Sprite, Texture } from 'pixi.js';
import type { PondZone, Spot } from './pondzone';

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

export class Frog {
  readonly sp = new Sprite();
  /** 原画上那朵大莲叶的位置（比例坐标），青蛙的开场落点 */
  private static readonly HOME_F = { x: 0.836, y: 0.926 };
  private tex: Texture;
  private zone: PondZone | null = null;
  private W = 1600;
  private H = 1000;
  private spots: Spot[] = [];
  private at = 0;
  private hopT = -1;
  private hopFrom = 0;
  private hopTo = 0;
  private hopDur = 0.55;
  private hopLift = 20;
  private nextHop = 3.5 + Math.random() * 4;
  private landT = 0;
  private croakT = 8 + Math.random() * 6;
  private croakAnim = 0;
  private frogBase = 1;
  /** 一跳最多横跨多远（屏幕 px 比例），避免青蛙从池塘这头飞到那头 */
  private maxHop = 460;
  private hops = 0;
  private lastHopDist = 0;

  constructor(frogTex: Texture) {
    this.tex = frogTex;
    this.sp.texture = frogTex;
    this.sp.anchor.set(0.5, 0.72);
  }

  layout(W: number, H: number, zone: PondZone | null) {
    this.W = W;
    this.H = H;
    this.zone = zone;
    this.frogBase = (H * 0.075) / this.tex.width;
    this.sp.scale.set(this.frogBase);
    this.maxHop = Math.max(260, W * 0.3);

    // 只在荷叶/石头上落脚；再裁掉会跳出画面的点（青蛙朝上画，顶部留出大半个身位即可）
    const halfW = (this.tex.width * this.frogBase) / 2;
    const bodyH = this.tex.height * this.frogBase;
    const spots = (zone?.landSpots() ?? []).filter(
      (s) => s.x - halfW * 0.55 > 0 && s.x + halfW * 0.55 < W && s.y - bodyH * 0.72 > -8 && s.y < H - 6,
    );
    // 兜底：没有围栏信息时退回原来的固定莲叶点
    this.spots = spots.length
      ? spots
      : [{ x: W * Frog.HOME_F.x, y: H * Frog.HOME_F.y, depth: 0 }];

    // 开场站在离原画那朵大莲叶最近的一块落脚点上
    const home = zone ? zone.toScreen(Frog.HOME_F.x, Frog.HOME_F.y) : { x: W * Frog.HOME_F.x, y: H * Frog.HOME_F.y };
    let best = 0;
    let bestD = Infinity;
    this.spots.forEach((s, i) => {
      const d = Math.hypot(s.x - home.x, s.y - home.y);
      if (d < bestD) {
        bestD = d;
        best = i;
      }
    });
    this.at = best;
    this.sp.position.set(this.spots[best].x, this.spots[best].y);
  }

  /**
   * 挑下一块落脚点：距离加权轮盘赌——近的更可能，远的也去得成，
   * 方向和远近都无序（不会像"永远跳隔壁那块"那样排成一条线）。
   */
  private pickNext(): number {
    if (this.spots.length < 2) return this.at;
    const cur = this.spots[this.at];
    const pool = this.spots
      .map((s, i) => ({ i, d: Math.hypot(s.x - cur.x, s.y - cur.y) }))
      .filter((o) => o.i !== this.at && o.d <= this.maxHop);
    if (!pool.length) return this.at;
    // 权重 ∝ 1/(d+80)^1.5：跳距越短越常见，但整体保持随机
    const w = pool.map((o) => 1 / Math.pow(o.d + 80, 1.5));
    const sum = w.reduce((a, b) => a + b, 0);
    let t = Math.random() * sum;
    for (let k = 0; k < pool.length; k++) {
      t -= w[k];
      if (t <= 0) return pool[k].i;
    }
    return pool[pool.length - 1].i;
  }

  update(dt: number, t: number, wake?: (nx: number, ny: number, r?: number, s?: number) => void) {
    if (this.hopT >= 0) {
      this.hopT += dt;
      const k = Math.min(1, this.hopT / this.hopDur);
      const a = this.spots[this.hopFrom];
      const b = this.spots[this.hopTo];
      const lift = Math.sin(k * Math.PI);
      this.sp.position.set(a.x + (b.x - a.x) * k, a.y + (b.y - a.y) * k - lift * this.hopLift);
      this.sp.scale.set(this.frogBase * (1 - 0.1 * lift), this.frogBase * (1 + 0.16 * lift));
      this.sp.rotation = (b.x >= a.x ? 1 : -1) * 0.12 * lift;
      if (k >= 1) {
        this.hopT = -1;
        this.at = this.hopTo;
        this.landT = 0.2;
        this.sp.position.set(b.x, b.y);
        this.sp.rotation = 0;
        // 落点涟漪：wake 收归一化屏幕坐标
        wake?.(b.x / this.W, b.y / this.H, 2.6, 0.5);
      }
    } else {
      this.nextHop -= dt;
      if (this.landT > 0) {
        this.landT -= dt;
        const q = this.landT / 0.2;
        this.sp.scale.set(this.frogBase * (1 + 0.1 * q), this.frogBase * (1 - 0.12 * q));
      } else {
        this.sp.scale.set(this.frogBase, this.frogBase * (1 + 0.014 * Math.sin(t * 2.3)));
        this.sp.rotation = 0;
      }
      if (this.nextHop <= 0) {
        this.nextHop = 4 + Math.random() * 6;
        this.hopFrom = this.at;
        this.hopTo = this.pickNext();
        const a = this.spots[this.hopFrom];
        const b = this.spots[this.hopTo];
        const dist = Math.hypot(b.x - a.x, b.y - a.y);
        this.hopDur = clamp(0.42 + dist / 900, 0.42, 1.15);
        this.hopLift = clamp(16 + dist * 0.14, 16, 70);
        this.hopT = 0;
        this.hops++;
        this.lastHopDist = dist;
      }
    }

    // 鼓腮（不与跳跃/落地打架）
    this.croakT -= dt;
    if (this.croakT <= 0) {
      this.croakAnim = 0.7;
      this.croakT = 10 + Math.random() * 8;
      const p = this.spots[this.at];
      wake?.(p.x / this.W, p.y / this.H, 2.2, 0.4);
    }
    if (this.croakAnim > 0 && this.hopT < 0 && this.landT <= 0) {
      this.croakAnim -= dt;
      const k = 1 - Math.max(0, this.croakAnim) / 0.7;
      this.sp.scale.set(this.frogBase * (1 + 0.06 * Math.sin(k * Math.PI)));
    }
  }

  /** 只读快照（调试/无头核对用）：当前蹲点是否落在荷叶/石头上、跳了几次、上一跳多远 */
  get pose() {
    const p = this.spots[this.at];
    return {
      x: p?.x ?? 0,
      y: p?.y ?? 0,
      spots: this.spots.length,
      hops: this.hops,
      lastDist: this.lastHopDist,
      onLand: p && this.zone ? this.zone.probe(p.x, p.y).d < 0 : false,
    };
  }
}
