// 占位鱼：脊柱链 12 节 + 链式跟随 + 正弦摆尾。D2 换 SVG 图集后，本文件只留行为逻辑。
import { Container, Graphics, Sprite, Texture } from 'pixi.js';

export interface Coat {
  body: string;
  patch: string | null;
  fin: string;
}

export const COATS: Coat[] = [
  { body: '#f6f2e7', patch: '#d94a2e', fin: 'rgba(217,74,46,0.5)' }, // 红白
  { body: '#eab35c', patch: null, fin: 'rgba(234,179,92,0.5)' }, // 黄金
  { body: '#efe9dc', patch: '#c9bf9f', fin: 'rgba(214,205,184,0.55)' }, // 素白
];

const SEGS = 12;
const PROFILE = [0.42, 0.58, 0.72, 0.82, 0.88, 0.9, 0.86, 0.78, 0.66, 0.52, 0.38, 0.26];

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
  rg.addColorStop(0, 'rgba(20,45,38,0.55)');
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
  private size: number;
  private speed: number;
  private heading: number;
  private phase = Math.random() * 10;
  private x: number;
  private y: number;
  private px = new Float32Array(SEGS);
  private py = new Float32Array(SEGS);
  private patches: { seg: number; off: number; r: number }[] = [];

  constructor(idx: number, W = 1280, H = 800) {
    this.coat = COATS[idx % COATS.length];
    this.size = 26 + Math.random() * 12;
    this.speed = 34 + Math.random() * 26;
    this.heading = Math.random() * Math.PI * 2;
    this.x = W * (0.25 + Math.random() * 0.5);
    this.y = H * (0.25 + Math.random() * 0.5);
    for (let i = 0; i < SEGS; i++) {
      this.px[i] = this.x - Math.cos(this.heading) * i * this.size * 0.3;
      this.py[i] = this.y - Math.sin(this.heading) * i * this.size * 0.3;
    }
    const n = 1 + ((Math.random() * 3) | 0);
    for (let i = 0; i < n; i++) {
      this.patches.push({ seg: (Math.random() * 8) | 0, off: Math.random() * 1.2 - 0.6, r: 0.5 + Math.random() * 0.6 });
    }
    this.shadow.anchor.set(0.5);
  }

  update(dt: number, t: number, cursor: { x: number; y: number } | null, others: Fish[], W: number, H: number) {
    let steer = Math.sin(t * 0.4 + this.phase) * 0.5;
    if (cursor) {
      const dx = this.x - cursor.x;
      const dy = this.y - cursor.y;
      const d = Math.hypot(dx, dy);
      if (d < 150 && d > 1) steer += angDiff(Math.atan2(dy, dx), this.heading) * ((150 - d) / 150) * 4;
    }
    for (const o of others) {
      // ponytail: O(n²) 分离检测，鱼 >50 条时换空间哈希
      if (o === this) continue;
      const dx = this.x - o.x;
      const dy = this.y - o.y;
      const d2 = dx * dx + dy * dy;
      if (d2 < 3600 && d2 > 1) {
        const d = Math.sqrt(d2);
        steer += angDiff(Math.atan2(dy, dx), this.heading) * (1 - d / 60) * 2;
      }
    }
    const margin = 70;
    if (this.x < margin || this.x > W - margin || this.y < margin || this.y > H - margin) {
      steer += angDiff(Math.atan2(H / 2 - this.y, W / 2 - this.x), this.heading) * 3;
    }
    this.heading += steer * dt;

    const sp = this.speed * (0.85 + 0.3 * Math.sin(t * 0.23 + this.phase));
    this.x += Math.cos(this.heading) * sp * dt;
    this.y += Math.sin(this.heading) * sp * dt;
    this.x = Math.max(8, Math.min(W - 8, this.x));
    this.y = Math.max(8, Math.min(H - 8, this.y));
    this.phase += dt * (2.5 + sp * 0.07);

    // 链式跟随 + 沿脊柱传播的摆尾波
    const gap = this.size * 0.3;
    for (let i = 1; i < SEGS; i++) {
      const a =
        Math.atan2(this.py[i] - this.py[i - 1], this.px[i] - this.px[i - 1]) +
        Math.sin(this.phase - i * 0.55) * 0.2 * (i / SEGS);
      this.px[i] = this.px[i - 1] + Math.cos(a) * gap;
      this.py[i] = this.py[i - 1] + Math.sin(a) * gap;
    }

    this.shadow.x = this.x + this.size * 0.3;
    this.shadow.y = this.y + this.size * 0.55;
    this.shadow.rotation = this.heading;
    const s = this.size / 30;
    this.shadow.scale.set(s * 1.4, s);
    this.draw();
  }

  private draw() {
    const g = this.gfx;
    g.clear();

    // 尾鳍（画在身体下面）
    const b = SEGS - 4;
    const dirx = this.px[b] - this.px[SEGS - 1];
    const diry = this.py[b] - this.py[SEGS - 1];
    const dl = Math.hypot(dirx, diry) || 1;
    const fx = dirx / dl;
    const fy = diry / dl;
    const pxp = -fy;
    const pyp = fx;
    const r = this.size * 0.5 * PROFILE[b];
    const len = this.size * 0.85 * (1 + Math.sin(this.phase) * 0.18);
    g.poly([this.px[b] + pxp * r, this.py[b] + pyp * r, this.px[b] - pxp * r, this.py[b] - pyp * r, this.px[SEGS - 1] - fx * len, this.py[SEGS - 1] - fy * len]).fill(this.coat.fin);

    // 身体（尾→头，头覆盖在尾上）
    for (let i = SEGS - 1; i >= 0; i--) {
      g.circle(this.px[i], this.py[i], this.size * 0.5 * PROFILE[i]).fill(this.coat.body);
    }

    // 胸鳍
    const hdx = Math.cos(this.heading);
    const hdy = Math.sin(this.heading);
    for (const side of [-1, 1]) {
      const bx = this.px[3] - hdy * side * this.size * 0.35;
      const by = this.py[3] + hdx * side * this.size * 0.35;
      const a = this.heading + side * (1.9 + Math.sin(this.phase * 1.1 + side) * 0.25);
      g.poly([bx, by, bx + Math.cos(a) * this.size * 0.4, by + Math.sin(a) * this.size * 0.4, bx + Math.cos(a + 0.7 * side) * this.size * 0.32, by + Math.sin(a + 0.7 * side) * this.size * 0.32]).fill(this.coat.fin);
    }

    // 花斑
    if (this.coat.patch) {
      for (const p of this.patches) {
        const i = Math.min(SEGS - 2, p.seg);
        const rr = this.size * 0.5 * PROFILE[i] * p.r;
        const nx = -(this.py[i + 1] - this.py[i]);
        const ny = this.px[i + 1] - this.px[i];
        const nl = Math.hypot(nx, ny) || 1;
        g.circle(this.px[i] + (nx / nl) * p.off * rr, this.py[i] + (ny / nl) * p.off * rr, rr).fill(this.coat.patch);
      }
    }

    // 眼睛
    for (const side of [-1, 1]) {
      g.circle(
        this.px[0] + hdx * this.size * 0.18 - hdy * side * this.size * 0.16,
        this.py[0] + hdy * this.size * 0.18 + hdx * side * this.size * 0.16,
        this.size * 0.06,
      ).fill('#26332c');
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

  update(dt: number, t: number, cursor: { x: number; y: number } | null, W: number, H: number) {
    for (const f of this.fishes) f.update(dt, t, cursor, this.fishes, W, H);
  }
}
