// 国风点缀：墨绿波缘莲叶、尖瓣荷花、莲蕾、墨梅枝、守叶青蛙（偶发鼓腮泛涟漪）。
// 参照水墨册页：荷叶墨绿波缘放射脉，荷花白底粉尖墨线勾边，蛙蹲叶上。
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

/** 莲叶：波状缘 + 放射叶脉 + 中心墨点（俯视） */
function padTexture(seed = 1): Texture {
  const rnd = mulberry32(seed);
  const ph1 = rnd() * 6.28;
  const ph2 = rnd() * 6.28;
  const ph3 = rnd() * 6.28;
  const sz = 260;
  const c = sz / 2;
  const r = sz * 0.44;
  const cv = document.createElement('canvas');
  cv.width = sz;
  cv.height = sz;
  const g = cv.getContext('2d')!;

  // 叶影
  const sh = g.createRadialGradient(c + sz * 0.03, c + sz * 0.05, r * 0.2, c + sz * 0.03, c + sz * 0.05, r * 1.05);
  sh.addColorStop(0, 'rgba(25,50,40,0.20)');
  sh.addColorStop(1, 'rgba(25,50,40,0)');
  g.fillStyle = sh;
  g.fillRect(0, 0, sz, sz);

  // 波缘叶形
  const path = new Path2D();
  const N = 48;
  for (let i = 0; i <= N; i++) {
    const a = (i / N) * Math.PI * 2;
    const bump = 1 + 0.07 * Math.sin(a * 3 + ph1) + 0.05 * Math.sin(a * 5 + ph2) + 0.035 * Math.sin(a * 8 + ph3);
    const x = c + Math.cos(a) * r * bump;
    const y = c + Math.sin(a) * r * bump;
    if (i === 0) path.moveTo(x, y);
    else path.lineTo(x, y);
  }
  path.closePath();
  const rg = g.createRadialGradient(c, c, r * 0.05, c, c, r * 1.05);
  rg.addColorStop(0, '#5c8270');
  rg.addColorStop(0.6, '#47695a');
  rg.addColorStop(1, '#365247');
  g.fillStyle = rg;
  g.fill(path);

  g.save();
  g.clip(path);
  // 放射叶脉（微弯）
  g.strokeStyle = 'rgba(18,38,30,0.4)';
  for (let i = 0; i < 18; i++) {
    const a = (i / 18) * Math.PI * 2 + 0.1;
    const rr = r * 0.92;
    g.lineWidth = 1.6;
    g.beginPath();
    g.moveTo(c, c);
    g.quadraticCurveTo(c + Math.cos(a + 0.06) * rr * 0.55, c + Math.sin(a + 0.06) * rr * 0.55, c + Math.cos(a) * rr, c + Math.sin(a) * rr);
    g.stroke();
  }
  // 中心墨点 + 斑渍
  g.fillStyle = 'rgba(16,32,26,0.65)';
  g.beginPath();
  g.arc(c, c, sz * 0.02, 0, Math.PI * 2);
  g.fill();
  g.fillStyle = 'rgba(20,44,34,0.15)';
  for (let i = 0; i < 4; i++) {
    g.beginPath();
    g.ellipse(c + (rnd() - 0.5) * r, c + (rnd() - 0.5) * r, r * 0.22, r * 0.12, rnd() * Math.PI, 0, Math.PI * 2);
    g.fill();
  }
  g.restore();

  // 轮廓 + 白缘高光
  g.strokeStyle = 'rgba(14,30,24,0.5)';
  g.lineWidth = 2.5;
  g.stroke(path);
  g.strokeStyle = 'rgba(240,248,242,0.22)';
  g.lineWidth = 2;
  for (let i = 0; i < 5; i++) {
    const a = rnd() * Math.PI * 2;
    g.beginPath();
    g.arc(c, c, r * 0.96, a, a + 0.25 + rnd() * 0.2);
    g.stroke();
  }

  return Texture.from(cv);
}

/** 尖瓣荷花的单瓣：底部暖白、瓣尖粉、淡墨勾边（调用前需 translate 到花心） */
function lotusPetal(g: CanvasRenderingContext2D, len: number, wid: number, rot: number, tip: string) {
  g.save();
  g.rotate(rot);
  const grad = g.createLinearGradient(0, 0, 0, -len);
  grad.addColorStop(0, '#fdfbf5');
  grad.addColorStop(1, tip);
  g.fillStyle = grad;
  g.strokeStyle = 'rgba(150,125,135,0.4)';
  g.lineWidth = 1.1;
  g.beginPath();
  g.moveTo(0, 0);
  g.quadraticCurveTo(wid, -len * 0.5, 0, -len);
  g.quadraticCurveTo(-wid, -len * 0.5, 0, 0);
  g.closePath();
  g.fill();
  g.stroke();
  g.restore();
}

function lotusTexture(): Texture {
  const sz = 170;
  const cv = document.createElement('canvas');
  cv.width = sz;
  cv.height = sz;
  const g = cv.getContext('2d')!;
  const c = sz / 2;

  // 花影
  g.fillStyle = 'rgba(30,55,45,0.16)';
  g.beginPath();
  g.ellipse(c + 4, c + 8, sz * 0.27, sz * 0.14, 0, 0, Math.PI * 2);
  g.fill();

  // 外层 11 瓣 + 内层 7 瓣（以花心为原点）
  g.save();
  g.translate(c, c);
  for (let i = 0; i < 11; i++) lotusPetal(g, sz * 0.44, sz * 0.095, (i / 11) * Math.PI * 2, '#e8a2b2');
  for (let i = 0; i < 7; i++) lotusPetal(g, sz * 0.3, sz * 0.075, ((i + 0.5) / 7) * Math.PI * 2 + 0.25, '#f0bcc8');

  // 莲蓬心
  g.fillStyle = '#e6d57f';
  g.beginPath();
  g.arc(0, 0, sz * 0.07, 0, Math.PI * 2);
  g.fill();
  g.strokeStyle = 'rgba(120,100,50,0.45)';
  g.lineWidth = 1.2;
  g.stroke();
  g.fillStyle = '#9a8438';
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2 + 0.3;
    g.beginPath();
    g.arc(Math.cos(a) * sz * 0.034, Math.sin(a) * sz * 0.034, sz * 0.011, 0, Math.PI * 2);
    g.fill();
  }
  g.restore();
  return Texture.from(cv);
}

/** 莲蕾：墨茎带点，白底粉尖水滴形 */
function budTexture(): Texture {
  const sz = 100;
  const cv = document.createElement('canvas');
  cv.width = sz;
  cv.height = sz;
  const g = cv.getContext('2d')!;
  // 墨茎
  g.strokeStyle = '#3a3230';
  g.lineWidth = 3.5;
  g.lineCap = 'round';
  g.beginPath();
  g.moveTo(sz * 0.5, sz);
  g.quadraticCurveTo(sz * 0.47, sz * 0.75, sz * 0.52, sz * 0.5);
  g.stroke();
  // 茎上墨点
  g.fillStyle = '#2c2624';
  for (let i = 0; i < 5; i++) {
    const t = 0.25 + i * 0.14;
    const x = (1 - t) ** 2 * sz * 0.5 + 2 * (1 - t) * t * sz * 0.47 + t ** 2 * sz * 0.52;
    const y = (1 - t) ** 2 * sz + 2 * (1 - t) * t * sz * 0.75 + t ** 2 * sz * 0.5;
    g.beginPath();
    g.arc(x, y, 1.3, 0, Math.PI * 2);
    g.fill();
  }
  // 花蕾
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

/** 墨蛙（俯视）：蹲姿，前肢小趾、后肢折叠、鼓眼 */
function frogTexture(): Texture {
  const sz = 150;
  const c = sz / 2;
  const cv = document.createElement('canvas');
  cv.width = sz;
  cv.height = sz;
  const g = cv.getContext('2d')!;
  g.lineCap = 'round';

  // 后肢（两侧折叠）
  const leg = (side: number) => {
    g.strokeStyle = 'rgba(63,92,77,0.9)';
    g.lineWidth = 11;
    g.beginPath();
    g.moveTo(c + side * sz * 0.16, c + sz * 0.1);
    g.quadraticCurveTo(c + side * sz * 0.34, c + sz * 0.16, c + side * sz * 0.3, c + sz * 0.3);
    g.stroke();
    g.lineWidth = 8;
    g.beginPath();
    g.moveTo(c + side * sz * 0.3, c + sz * 0.3);
    g.quadraticCurveTo(c + side * sz * 0.36, c + sz * 0.4, c + side * sz * 0.22, c + sz * 0.42);
    g.stroke();
    g.strokeStyle = 'rgba(50,74,62,0.85)';
    g.lineWidth = 2.5;
    for (let i = -1; i <= 1; i++) {
      const tx = c + side * sz * 0.22 + i * sz * 0.075 + side * sz * 0.02;
      const ty = c + sz * 0.47 + Math.abs(i) * sz * 0.015;
      g.beginPath();
      g.moveTo(c + side * sz * 0.22, c + sz * 0.42);
      g.lineTo(tx, ty);
      g.stroke();
      g.fillStyle = 'rgba(44,53,49,0.9)';
      g.beginPath();
      g.arc(tx, ty, 2.2, 0, Math.PI * 2);
      g.fill();
    }
  };
  // 前肢（小趾）
  const front = (side: number) => {
    g.strokeStyle = 'rgba(63,92,77,0.85)';
    g.lineWidth = 6;
    g.beginPath();
    g.moveTo(c + side * sz * 0.13, c - sz * 0.06);
    g.quadraticCurveTo(c + side * sz * 0.2, c + sz * 0.02, c + side * sz * 0.17, c + sz * 0.08);
    g.stroke();
    g.strokeStyle = 'rgba(50,74,62,0.85)';
    g.lineWidth = 2;
    for (let i = -1; i <= 1; i++) {
      g.beginPath();
      g.moveTo(c + side * sz * 0.17, c + sz * 0.08);
      g.lineTo(c + side * sz * 0.17 + i * sz * 0.045, c + sz * 0.115);
      g.stroke();
    }
  };
  leg(1);
  leg(-1);
  front(1);
  front(-1);

  // 身体
  const bg = g.createRadialGradient(c, c - sz * 0.05, sz * 0.05, c, c, sz * 0.34);
  bg.addColorStop(0, '#7d9c82');
  bg.addColorStop(0.7, '#5d7f6a');
  bg.addColorStop(1, '#48665a');
  g.fillStyle = bg;
  g.beginPath();
  g.ellipse(c, c + sz * 0.02, sz * 0.24, sz * 0.3, 0, 0, Math.PI * 2);
  g.fill();
  g.strokeStyle = 'rgba(30,48,40,0.4)';
  g.lineWidth = 2;
  g.stroke();
  // 斑渍
  g.fillStyle = 'rgba(36,56,46,0.28)';
  for (let i = 0; i < 9; i++) {
    const a = Math.random() * Math.PI * 2;
    const rr = Math.random() * sz * 0.16;
    g.beginPath();
    g.arc(c + Math.cos(a) * rr * 0.8, c + sz * 0.02 + Math.sin(a) * rr, sz * 0.012 + Math.random() * sz * 0.012, 0, Math.PI * 2);
    g.fill();
  }
  // 鼓眼
  for (const side of [-1, 1]) {
    g.fillStyle = '#2c3531';
    g.beginPath();
    g.arc(c + side * sz * 0.1, c - sz * 0.24, sz * 0.055, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = 'rgba(240,246,240,0.7)';
    g.beginPath();
    g.arc(c + side * sz * 0.1 - sz * 0.012, c - sz * 0.255, sz * 0.016, 0, Math.PI * 2);
    g.fill();
  }
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
}

export class Lilies {
  readonly layer = new Container();
  private pads: Pad[] = [];
  private flowers: { s: Sprite; baseRot: number; wobble: number }[] = [];
  private branch = new Sprite(plumTexture());
  private frog = new Sprite(frogTexture());
  private croakT = 6 + Math.random() * 6;
  private croakAnim = 0;
  private frogBase = 1;

  constructor() {
    this.layer.addChild(this.branch);
    const spots = [
      { rx: 0.1, ry: 0.15, size: 190, seed: 11 },
      { rx: 0.87, ry: 0.79, size: 240, seed: 22 },
      { rx: 0.88, ry: 0.09, size: 150, seed: 33 },
      { rx: 0.13, ry: 0.88, size: 170, seed: 44 },
    ];
    for (const sp of spots) {
      const s = new Sprite(padTexture(sp.seed));
      s.anchor.set(0.5);
      s.width = sp.size;
      s.height = sp.size;
      const baseRot = Math.random() * Math.PI * 2;
      s.rotation = baseRot;
      this.layer.addChild(s);
      this.pads.push({ s, baseRot, wobble: Math.random() * 10 });
    }
    // 蛙蹲右下大叶（避开荷花的位置）
    const big = this.pads[1].s;
    this.frogBase = (spots[1].size * 0.46) / 150;
    this.frog.scale.set(this.frogBase);
    this.frog.position.set(spots[1].size * 0.22, spots[1].size * 0.14);
    big.addChild(this.frog);

    const flower = new Sprite(lotusTexture());
    flower.anchor.set(0.5);
    this.layer.addChild(flower);
    this.flowers.push({ s: flower, baseRot: 0.3, wobble: 1 });
    const bud = new Sprite(budTexture());
    bud.anchor.set(0.5);
    this.layer.addChild(bud);
    this.flowers.push({ s: bud, baseRot: -0.15, wobble: 4 });
  }

  layout(W: number, H: number) {
    const spots = [
      [0.1, 0.15],
      [0.87, 0.79],
      [0.88, 0.09],
      [0.13, 0.88],
    ];
    this.pads.forEach((p, i) => {
      p.s.position.set(spots[i][0] * W, spots[i][1] * H);
    });
    this.branch.width = W * 0.42;
    this.branch.height = this.branch.width * (430 / 820);
    this.branch.position.set(0, -6);
    this.flowers[0].s.position.set(0.87 * W, 0.79 * H - 120);
    this.flowers[0].s.width = 116;
    this.flowers[0].s.height = 116;
    this.flowers[1].s.position.set(0.1 * W + 128, 0.15 * H + 46);
    this.flowers[1].s.width = 82;
    this.flowers[1].s.height = 82;
  }

  update(dt: number, t: number, wake?: (nx: number, ny: number) => void) {
    for (const p of this.pads) p.s.rotation = p.baseRot + Math.sin(t * 0.25 + p.wobble) * 0.012;
    for (const f of this.flowers) f.s.rotation = f.baseRot + Math.sin(t * 0.2 + f.wobble) * 0.02;

    // 蛙鸣：鼓腮一次 + 叶周涟漪
    this.croakT -= dt;
    if (this.croakT <= 0) {
      this.croakAnim = 0.7;
      this.croakT = 8 + Math.random() * 8;
      wake?.(0.87, 0.79);
    }
    if (this.croakAnim > 0) {
      this.croakAnim -= dt;
      const k = 1 - Math.max(0, this.croakAnim) / 0.7;
      this.frog.scale.set(this.frogBase * (1 + 0.06 * Math.sin(k * Math.PI)));
    }
  }
}
