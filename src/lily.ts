// 国风点缀：素材莲叶/荷花直接上屏（白底抠图），墨梅枝与莲蕾仍为程序绘制。
// 动效：荷叶三频漂移+呼吸+蛙落地回弹；蛙三落脚点弹跳循环（压腿→腾空→落地涟漪）+鼓腮。
import { Container, Sprite, Texture } from 'pixi.js';

function mulberry32(seed: number) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** 莲蕾：墨茎带点，白底粉尖水滴形（素材里没有小蕾，保留程序绘制） */
function budTexture(): Texture {
  const sz = 100;
  const cv = document.createElement('canvas');
  cv.width = sz;
  cv.height = sz;
  const g = cv.getContext('2d')!;
  g.strokeStyle = '#3a3230';
  g.lineWidth = 3.5;
  g.lineCap = 'round';
  g.beginPath();
  g.moveTo(sz * 0.5, sz);
  g.quadraticCurveTo(sz * 0.47, sz * 0.75, sz * 0.52, sz * 0.5);
  g.stroke();
  g.fillStyle = '#2c2624';
  for (let i = 0; i < 5; i++) {
    const t = 0.25 + i * 0.14;
    const x = (1 - t) ** 2 * sz * 0.5 + 2 * (1 - t) * t * sz * 0.47 + t ** 2 * sz * 0.52;
    const y = (1 - t) ** 2 * sz + 2 * (1 - t) * t * sz * 0.75 + t ** 2 * sz * 0.5;
    g.beginPath();
    g.arc(x, y, 1.3, 0, Math.PI * 2);
    g.fill();
  }
  const grad = g.createLinearGradient(0, sz * 0.5, 0, sz * 0.12);
  grad.addColorStop(0, '#fdfbf5');
  grad.addColorStop(1, '#e8a2b2');
  g.fillStyle = grad;
  g.strokeStyle = 'rgba(150,125,135,0.4)';
  g.lineWidth = 1.2;
  g.beginPath();
  g.moveTo(sz * 0.52, sz * 0.12);
  g.quadraticCurveTo(sz * 0.68, sz * 0.34, sz * 0.52, sz * 0.5);
  g.quadraticCurveTo(sz * 0.36, sz * 0.34, sz * 0.52, sz * 0.12);
  g.closePath();
  g.fill();
  g.stroke();
  return Texture.from(cv);
}

/** 墨梅枝：主枝由右上方探入，枯笔枝干 + 粉梅 + 花蕾 */
function plumTexture(): Texture {
  const w = 820;
  const h = 430;
  const cv = document.createElement('canvas');
  cv.width = w;
  cv.height = h;
  const g = cv.getContext('2d')!;
  const rnd = mulberry32(77);
  g.lineCap = 'round';

  const branch = (p0: [number, number], cp: [number, number], p1: [number, number], w0: number, w1: number, pts: [number, number][]) => {
    const steps = 26;
    for (let i = 0; i < steps; i++) {
      const t0 = i / steps;
      const t1 = (i + 1) / steps;
      const q = (t: number): [number, number] => [
        (1 - t) ** 2 * p0[0] + 2 * (1 - t) * t * cp[0] + t ** 2 * p1[0],
        (1 - t) ** 2 * p0[1] + 2 * (1 - t) * t * cp[1] + t ** 2 * p1[1],
      ];
      const a = q(t0);
      const b = q(t1);
      g.strokeStyle = 'rgba(58,50,48,0.92)';
      g.lineWidth = w0 + (w1 - w0) * t0;
      g.beginPath();
      g.moveTo(a[0], a[1]);
      g.lineTo(b[0], b[1]);
      g.stroke();
      pts.push(a);
    }
  };

  const main: [number, number][] = [];
  branch([w + 20, 30], [w * 0.55, -20], [w * 0.08, h * 0.62], 15, 3, main);
  const s1: [number, number][] = [];
  branch([w * 0.72, 30], [w * 0.6, 150], [w * 0.5, h * 0.72], 7, 2, s1);
  const s2: [number, number][] = [];
  branch([w * 0.45, 55], [w * 0.35, 90], [w * 0.2, h * 0.3], 6, 2, s2);
  const s3: [number, number][] = [];
  branch([w * 0.2, h * 0.6], [w * 0.16, h * 0.8], [w * 0.3, h * 0.95], 4, 2, s3);

  const blossom = (x: number, y: number, r: number) => {
    for (let i = 0; i < 5; i++) {
      const a = (i / 5) * Math.PI * 2 + rnd() * 0.4;
      g.fillStyle = 'rgba(231,164,176,0.92)';
      g.beginPath();
      g.arc(x + Math.cos(a) * r * 0.55, y + Math.sin(a) * r * 0.55, r * 0.52, 0, Math.PI * 2);
      g.fill();
    }
    g.fillStyle = '#c25e78';
    g.beginPath();
    g.arc(x, y, r * 0.3, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = '#8a4a5e';
    for (let i = 0; i < 5; i++) {
      const a = (i / 5) * Math.PI * 2 + 0.5;
      g.beginPath();
      g.arc(x + Math.cos(a) * r * 0.16, y + Math.sin(a) * r * 0.16, r * 0.07, 0, Math.PI * 2);
      g.fill();
    }
  };

  for (let i = 0; i < 13; i++) {
    const src = [main, s1, s2, s3][(rnd() * 4) | 0];
    const p = src[(rnd() * src.length) | 0];
    blossom(p[0] + (rnd() - 0.5) * 26, p[1] + (rnd() - 0.5) * 26, 9 + rnd() * 8);
  }
  for (let i = 0; i < 7; i++) {
    const src = [main, s1, s2, s3][(rnd() * 4) | 0];
    const p = src[(rnd() * src.length) | 0];
    g.fillStyle = '#d98a9c';
    g.beginPath();
    g.arc(p[0] + (rnd() - 0.5) * 30, p[1] + (rnd() - 0.5) * 30, 4 + rnd() * 3, 0, Math.PI * 2);
    g.fill();
  }

  return Texture.from(cv);
}

interface Pad {
  s: Sprite;
  baseRot: number;
  wobble: number;
  hx: number;
  hy: number;
  dip: number; // 蛙落地时的下沉量
  bsx: number; // 基准缩放
  bsy: number;
}

export class Lilies {
  readonly layer = new Container();
  private pads: Pad[] = [];
  private flower: Sprite;
  private branch = new Sprite(plumTexture());
  private bud = new Sprite(budTexture());
  private frog: Sprite;
  private frogSpots: { x: number; y: number }[] = [];
  private frogAt = 0;
  private hopT = -1;
  private hopFrom = 0;
  private hopTo = 0;
  private nextHop = 5 + Math.random() * 5;
  private landT = 0;
  private croakT = 9 + Math.random() * 6;
  private croakAnim = 0;
  private frogBase = 1;

  constructor(leaf: Texture, lotus: Texture, frogTex: Texture) {
    this.layer.addChild(this.branch);
    const spots = [
      { rx: 0.1, ry: 0.15, size: 190, rot: 0.6 },
      { rx: 0.87, ry: 0.79, size: 250, rot: 2.1 },
      { rx: 0.88, ry: 0.09, size: 155, rot: 4.0 },
      { rx: 0.13, ry: 0.88, size: 175, rot: 5.2 },
    ];
    for (const sp of spots) {
      const s = new Sprite(leaf);
      s.anchor.set(0.5);
      s.width = sp.size;
      s.height = sp.size;
      s.rotation = sp.rot;
      s.position.set(sp.rx * 1600, sp.ry * 1000);
      this.layer.addChild(s);
      this.pads.push({ s, baseRot: sp.rot, wobble: Math.random() * 10, hx: sp.rx * 1600, hy: sp.ry * 1000, dip: 0, bsx: sp.size / leaf.width, bsy: sp.size / leaf.height });
    }
    // 蛙蹲右下大叶：三个落脚点轮流跳
    const bigSize = spots[1].size;
    this.frogSpots = [
      { x: bigSize * 0.2, y: bigSize * 0.15 },
      { x: -bigSize * 0.17, y: bigSize * 0.09 },
      { x: bigSize * 0.02, y: -bigSize * 0.16 },
    ];
    this.frog = new Sprite(frogTex);
    this.frog.anchor.set(0.5, 0.72);
    this.frogBase = (bigSize * 0.5) / frogTex.width;
    this.frog.scale.set(this.frogBase);
    this.frog.position.set(this.frogSpots[0].x, this.frogSpots[0].y);
    this.pads[1].s.addChild(this.frog);

    this.flower = new Sprite(lotus);
    this.flower.anchor.set(0.5);
    this.flower.blendMode = 'multiply';
    this.flower.width = 150;
    this.flower.height = 150;
    this.layer.addChild(this.flower);

    this.bud.anchor.set(0.5);
    this.bud.width = 82;
    this.bud.height = 82;
    this.layer.addChild(this.bud);
  }

  layout(W: number, H: number) {
    const spots = [
      [0.1, 0.15],
      [0.87, 0.79],
      [0.88, 0.09],
      [0.13, 0.88],
    ];
    this.pads.forEach((p, i) => {
      p.hx = spots[i][0] * W;
      p.hy = spots[i][1] * H;
      p.s.position.set(p.hx, p.hy);
    });
    this.branch.width = W * 0.42;
    this.branch.height = this.branch.width * (430 / 820);
    this.branch.position.set(0, -6);
    this.flower.position.set(0.87 * W, 0.79 * H - 125);
    this.bud.position.set(0.1 * W + 128, 0.15 * H + 46);
  }

  update(dt: number, t: number, wake?: (nx: number, ny: number) => void) {
    // 荷叶：三频漂移 + 呼吸 + 落地下沉回弹
    for (const p of this.pads) {
      if (p.dip > 0) p.dip = Math.max(0, p.dip - dt * 0.25);
      p.s.x = p.hx + Math.sin(t * 0.31 + p.wobble) * 6;
      p.s.y = p.hy + Math.cos(t * 0.23 + p.wobble) * 5 + p.dip * 14;
      p.s.rotation = p.baseRot + Math.sin(t * 0.19 + p.wobble) * 0.03;
      const breathe = 1 + Math.sin(t * 0.27 + p.wobble) * 0.008;
      const sc = breathe - p.dip * 0.05;
      p.s.scale.set(p.bsx * sc, p.bsy * sc);
    }

    this.flower.rotation = Math.sin(t * 0.2) * 0.02;

    // 蛙：闲时呼吸；到点压腿起跳→抛物线→落地涟漪+叶沉
    const pad = this.pads[1];
    if (this.hopT >= 0) {
      this.hopT += dt;
      const k = Math.min(1, this.hopT / 0.55);
      const a = this.frogSpots[this.hopFrom];
      const b = this.frogSpots[this.hopTo];
      const lift = Math.sin(k * Math.PI);
      this.frog.position.set(a.x + (b.x - a.x) * k, a.y + (b.y - a.y) * k - lift * 22);
      this.frog.scale.set(this.frogBase * (1 - 0.1 * lift), this.frogBase * (1 + 0.16 * lift));
      this.frog.rotation = (b.x >= a.x ? 1 : -1) * 0.12 * lift;
      if (k >= 1) {
        this.hopT = -1;
        this.frogAt = this.hopTo;
        this.landT = 0.2;
        pad.dip = 0.5;
        wake?.(0.87, 0.79);
      }
    } else {
      this.nextHop -= dt;
      if (this.landT > 0) {
        this.landT -= dt;
        const q = this.landT / 0.2;
        this.frog.scale.set(this.frogBase * (1 + 0.1 * q), this.frogBase * (1 - 0.12 * q));
      } else {
        this.frog.scale.set(this.frogBase, this.frogBase * (1 + 0.014 * Math.sin(t * 2.3)));
        this.frog.rotation = 0;
      }
      if (this.nextHop <= 0) {
        this.nextHop = 6 + Math.random() * 8;
        this.hopFrom = this.frogAt;
        this.hopTo = (this.frogAt + 1 + ((Math.random() * (this.frogSpots.length - 1)) | 0)) % this.frogSpots.length;
        this.hopT = 0;
      }
    }

    // 蛙鸣：鼓腮一次（不与跳跃/落地打架）
    this.croakT -= dt;
    if (this.croakT <= 0) {
      this.croakAnim = 0.7;
      this.croakT = 11 + Math.random() * 8;
      wake?.(0.87, 0.79);
    }
    if (this.croakAnim > 0 && this.hopT < 0 && this.landT <= 0) {
      this.croakAnim -= dt;
      const k = 1 - Math.max(0, this.croakAnim) / 0.7;
      this.frog.scale.set(this.frogBase * (1 + 0.06 * Math.sin(k * Math.PI)));
    }
  }
}
