// 锦鲤：细长水彩体型（脊柱节点 → 法线偏移 → 平滑轮廓多边形），克制的游动
// （低通转向 + 滑行-加速节律 + 偶发窜游）。审美基准见 2026-09-28 参考视频：鱼小型修长、
// 游姿从容、摆尾幅度小；忌分节感、忌大波纹。
import { Container, Graphics, Sprite, Texture } from 'pixi.js';

export interface Patch {
  u: number;
  side: number;
  r: number;
  ci: number;
}

export interface Coat {
  body: string;
  edge: string;
  patches: string[] | null;
  fin: string;
}

// 0 朱砂鲤 / 1 墨斑鲤 / 2 金鲤 / 3 乌鲤 / 4 丹顶 / 5 白鲤（参照水墨册页：宣纸白身、朱砂斑、墨灰鳍尾）
export const COATS: Coat[] = [
  { body: '#f7f4ec', edge: '#8d8a80', patches: ['#bf3b2b'], fin: 'rgba(70,76,80,0.4)' },
  { body: '#f6f3eb', edge: '#8d8a80', patches: ['#2f3238'], fin: 'rgba(70,76,80,0.4)' },
  { body: '#e2bd72', edge: '#9a7c46', patches: null, fin: 'rgba(70,76,80,0.38)' },
  { body: '#2f3238', edge: '#1f2226', patches: null, fin: 'rgba(40,44,48,0.5)' },
  { body: '#f7f4ec', edge: '#8d8a80', patches: ['#bf3b2b'], fin: 'rgba(70,76,80,0.4)' },
  { body: '#f3f2ea', edge: '#9a978c', patches: null, fin: 'rgba(70,76,80,0.34)' },
];

const SEGS = 12;
// 半宽/体长 沿脊柱分布：最长宽 0.119L → 全宽 0.24L，长宽比约 4:1
const WIDTH_F = [0.055, 0.088, 0.108, 0.117, 0.119, 0.116, 0.108, 0.096, 0.08, 0.06, 0.04, 0.022];

function angDiff(a: number, b: number) {
  return Math.atan2(Math.sin(a - b), Math.cos(a - b));
}

let shadowTex: Texture | null = null;
function getShadowTex(): Texture {
  if (shadowTex) return shadowTex;
  const cv = document.createElement('canvas');
  cv.width = 64;
  cv.height = 64;
  const g = cv.getContext('2d')!;
  const rg = g.createRadialGradient(32, 32, 2, 32, 32, 30);
  rg.addColorStop(0, 'rgba(20,45,38,0.42)');
  rg.addColorStop(1, 'rgba(20,45,38,0)');
  g.fillStyle = rg;
  g.fillRect(0, 0, 64, 64);
  shadowTex = Texture.from(cv);
  return shadowTex;
}

export class Fish {
  readonly gfx = new Graphics();
  readonly shadow = new Sprite(getShadowTex());
  private coat: Coat;
  private L: number; // 体长 px
  private base: number; // 基础速度
  private heading: number;
  private av = 0; // 角速度（低通后的转向）
  private phase = Math.random() * 10;
  private dartT = 0;
  private nextDart = 4 + Math.random() * 8;
  private x: number;
  private y: number;
  private px = new Float32Array(SEGS);
  private py = new Float32Array(SEGS);
  private patches: Patch[] = [];

  constructor(idx: number, W = 1600, H = 1000) {
    this.coat = COATS[idx % COATS.length];
    this.L = 52 + Math.random() * 26;
    this.base = 20 + Math.random() * 10;
    this.heading = Math.random() * Math.PI * 2;
    this.x = W * (0.2 + Math.random() * 0.6);
    this.y = H * (0.2 + Math.random() * 0.6);
    const gap = this.L / (SEGS - 1);
    for (let i = 0; i < SEGS; i++) {
      this.px[i] = this.x - Math.cos(this.heading) * gap * i;
      this.py[i] = this.y - Math.sin(this.heading) * gap * i;
    }
    if (idx % COATS.length === 4) {
      this.patches.push({ u: 0.05, side: 0, r: 1.0, ci: 0 }); // 丹顶：头顶一轮朱砂
    } else if (idx % COATS.length === 0) {
      // 朱砂鲤：肩部大斑，半数带尾斑（参照水墨锦鲤）
      this.patches.push({ u: 0.12, side: 0.05, r: 1.5, ci: 0 });
      if (Math.random() < 0.5) this.patches.push({ u: 0.62, side: -0.15, r: 0.8, ci: 0 });
    } else if (this.coat.patches) {
      const n = 2 + ((Math.random() * 2) | 0);
      for (let i = 0; i < n; i++) {
        this.patches.push({
          u: 0.14 + Math.random() * 0.55,
          side: Math.random() * 1.1 - 0.55,
          r: 0.7 + Math.random() * 0.6,
          ci: (Math.random() * this.coat.patches.length) | 0,
        });
      }
    }
    this.shadow.anchor.set(0.5);
  }

  update(
    dt: number,
    t: number,
    cursor: { x: number; y: number } | null,
    others: Fish[],
    W: number,
    H: number,
    wake?: (x: number, y: number) => void,
  ) {
    // 转向源：慢漫游 + 轻避让 + 轻分离 + 回中心；全部低通后施加
    let steer = Math.sin(t * 0.13 + this.phase) * 0.3;
    if (cursor) {
      const dx = this.x - cursor.x;
      const dy = this.y - cursor.y;
      const d = Math.hypot(dx, dy);
      if (d < 110 && d > 1) steer += angDiff(Math.atan2(dy, dx), this.heading) * ((110 - d) / 110) * 1.4;
    }
    for (const o of others) {
      // ponytail: O(n²) 分离检测，鱼 >50 条时换空间哈希
      if (o === this) continue;
      const dx = this.x - o.x;
      const dy = this.y - o.y;
      const d2 = dx * dx + dy * dy;
      if (d2 < 3000 && d2 > 1) {
        const d = Math.sqrt(d2);
        steer += angDiff(Math.atan2(dy, dx), this.heading) * (1 - d / 55) * 1.2;
      }
    }
    const margin = 115; // 别游上边框山石
    if (this.x < margin || this.x > W - margin || this.y < margin || this.y > H - margin) {
      steer += angDiff(Math.atan2(H / 2 - this.y, W / 2 - this.x), this.heading) * 2.5;
    }
    this.av += (steer - this.av) * Math.min(1, dt * 2.5);
    this.heading += this.av * dt;

    // 速度：滑行-加速节律 + 偶发窜游
    const pulse = 0.55 + 0.45 * (0.5 + 0.5 * Math.sin(t * 0.5 + this.phase)) ** 1.5;
    let sp = this.base * pulse;
    this.nextDart -= dt;
    if (this.nextDart <= 0) {
      this.dartT = 0.8;
      this.nextDart = 6 + Math.random() * 8;
    }
    if (this.dartT > 0) {
      this.dartT -= dt;
      sp *= 2.1;
    }

    this.x += Math.cos(this.heading) * sp * dt;
    this.y += Math.sin(this.heading) * sp * dt;
    this.x = Math.max(8, Math.min(W - 8, this.x));
    this.y = Math.max(8, Math.min(H - 8, this.y));
    this.phase += dt * (2.6 + sp * 0.06);

    // 链式跟随 + 沿脊柱传播的小幅摆尾波（摆幅随节点衰减，天然平滑，不要夹具）
    const gap = this.L / (SEGS - 1);
    for (let i = 1; i < SEGS; i++) {
      const a =
        Math.atan2(this.py[i] - this.py[i - 1], this.px[i] - this.px[i - 1]) +
        Math.sin(this.phase - i * 0.5) * 0.05 * (i / SEGS);
      this.px[i] = this.px[i - 1] + Math.cos(a) * gap;
      this.py[i] = this.py[i - 1] + Math.sin(a) * gap;
    }

    // 尾波：只在窜游或急转时偶发，极轻
    if (wake && (this.dartT > 0 || Math.abs(this.av) > 0.55) && Math.random() < dt * 2.2) {
      wake(this.px[SEGS - 1], this.py[SEGS - 1]);
    }

    this.shadow.x = this.x + this.L * 0.1;
    this.shadow.y = this.y + this.L * 0.16;
    this.shadow.rotation = this.heading;
    const s = this.L / 64;
    this.shadow.scale.set(s * 1.35, s * 0.95);
    this.shadow.alpha = 0.3;
    this.draw();
  }

  private draw() {
    const g = this.gfx;
    g.clear();

    // 各节点切向与法线（指向头为正方向）
    const dxs = new Float32Array(SEGS);
    const dys = new Float32Array(SEGS);
    const nxs = new Float32Array(SEGS);
    const nys = new Float32Array(SEGS);
    for (let i = 0; i < SEGS; i++) {
      const a = this.px[Math.max(i - 1, 0)] - this.px[Math.min(i + 1, SEGS - 1)];
      const b = this.py[Math.max(i - 1, 0)] - this.py[Math.min(i + 1, SEGS - 1)];
      const l = Math.hypot(a, b) || 1;
      dxs[i] = a / l;
      dys[i] = b / l;
      nxs[i] = -dys[i];
      nys[i] = dxs[i];
    }

    // 尾鳍（贴身，先画）
    const tl = SEGS - 1;
    const swayT = Math.sin(this.phase + 0.6) * 0.35;
    const tipx = this.px[tl] - dxs[tl] * this.L * 0.17 - nxs[tl] * swayT * this.L * 0.05;
    const tipy = this.py[tl] - dys[tl] * this.L * 0.17 - nys[tl] * swayT * this.L * 0.05;
    const wT = this.L * WIDTH_F[tl] * 1.9;
    g.poly([this.px[tl] + nxs[tl] * wT, this.py[tl] + nys[tl] * wT, tipx, tipy, this.px[tl] - nxs[tl] * wT, this.py[tl] - nys[tl] * wT]).fill(this.coat.fin);

    // 胸鳍（身下，只露梢）
    const pi = 3;
    const wP = this.L * WIDTH_F[pi];
    const pA = Math.atan2(dys[pi], dxs[pi]);
    for (const side of [-1, 1]) {
      const bx = this.px[pi] + nxs[pi] * side * wP * 0.85;
      const by = this.py[pi] + nys[pi] * side * wP * 0.85;
      const a = pA + side * 2.35 + Math.sin(this.phase * 1.2 + side) * 0.18;
      g.poly([
        bx, by,
        bx + Math.cos(a) * this.L * 0.11, by + Math.sin(a) * this.L * 0.11,
        bx + Math.cos(a + side * 0.55) * this.L * 0.09, by + Math.sin(a + side * 0.55) * this.L * 0.09,
      ]).fill(this.coat.fin);
    }

    // 身体轮廓：吻端 + 右缘 + 左缘（反向），一次填色描边
    const pts: number[] = [];
    pts.push(this.px[0] + dxs[0] * this.L * 0.055, this.py[0] + dys[0] * this.L * 0.055);
    for (let i = 0; i < SEGS; i++) pts.push(this.px[i] + nxs[i] * this.L * WIDTH_F[i], this.py[i] + nys[i] * this.L * WIDTH_F[i]);
    for (let i = SEGS - 1; i >= 0; i--) pts.push(this.px[i] - nxs[i] * this.L * WIDTH_F[i], this.py[i] - nys[i] * this.L * WIDTH_F[i]);
    g.poly(pts).fill(this.coat.body).stroke({ color: this.coat.edge, width: 1, alpha: 0.5 });

    // 脊线墨痕：给平面轮廓一点体积感
    g.moveTo(this.px[1], this.py[1]);
    for (let i = 2; i < SEGS - 1; i++) g.lineTo(this.px[i], this.py[i]);
    g.stroke({ color: this.coat.edge, width: this.L * 0.05, alpha: 0.16, cap: 'round' });

    // 花斑：沿脊柱的有机斑块（两圆重叠成不规则形，微透）
    if (this.coat.patches) {
      for (const p of this.patches) {
        const i = Math.min(SEGS - 2, Math.max(0, Math.round(p.u * (SEGS - 1))));
        const w = this.L * WIDTH_F[i];
        const rr = w * p.r;
        const cx = this.px[i] + nxs[i] * p.side * w * 0.55;
        const cy = this.py[i] + nys[i] * p.side * w * 0.55;
        const col = this.coat.patches[p.ci];
        g.circle(cx, cy, rr).fill({ color: col, alpha: 0.88 });
        g.circle(cx + dxs[i] * rr * 0.6, cy + dys[i] * rr * 0.6, rr * 0.72).fill({ color: col, alpha: 0.88 });
      }
    }

    // 眼睛
    const er = Math.max(1.2, this.L * 0.018);
    const ex0 = this.px[0] + dxs[0] * this.L * 0.02;
    const ey0 = this.py[0] + dys[0] * this.L * 0.02;
    for (const side of [-1, 1]) {
      g.circle(ex0 + nxs[0] * side * this.L * WIDTH_F[0] * 0.55, ey0 + nys[0] * side * this.L * WIDTH_F[0] * 0.55, er).fill('#23282b');
    }
  }
}

export class School {
  readonly shadows = new Container();
  readonly layer = new Container();
  private fishes: Fish[] = [];

  constructor(count: number) {
    for (let i = 0; i < count; i++) {
      const f = new Fish(i);
      this.fishes.push(f);
      this.shadows.addChild(f.shadow);
      this.layer.addChild(f.gfx);
    }
  }

  update(dt: number, t: number, cursor: { x: number; y: number } | null, W: number, H: number, wake?: (x: number, y: number) => void) {
    for (const f of this.fishes) f.update(dt, t, cursor, this.fishes, W, H, wake);
  }
}
