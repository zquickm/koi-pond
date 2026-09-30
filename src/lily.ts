// 国风点缀：莲叶、荷花、莲蕾、墨梅枝。垫在鱼层之上（鱼从叶下过）。
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

function padTexture(seed = 1): Texture {
  const rnd = mulberry32(seed);
  const sz = 240;
  const cv = document.createElement('canvas');
  cv.width = sz;
  cv.height = sz;
  const g = cv.getContext('2d')!;
  const c = sz / 2;
  const r = sz * 0.42;

  // 叶影
  const sh = g.createRadialGradient(c + sz * 0.04, c + sz * 0.06, r * 0.2, c + sz * 0.04, c + sz * 0.06, r * 1.05);
  sh.addColorStop(0, 'rgba(30,55,45,0.20)');
  sh.addColorStop(1, 'rgba(30,55,45,0)');
  g.fillStyle = sh;
  g.fillRect(0, 0, sz, sz);

  // 叶身
  const a0 = rnd() * Math.PI * 2;
  const body = new Path2D();
  body.arc(c, c, r, a0 + 0.28, a0 - 0.28 + Math.PI * 2);
  body.lineTo(c, c);
  body.closePath();
  const rg = g.createRadialGradient(c - r * 0.2, c - r * 0.25, r * 0.1, c, c, r);
  rg.addColorStop(0, '#63906f');
  rg.addColorStop(1, '#4c7358');
  g.fillStyle = rg;
  g.fill(body);

  g.save();
  g.clip(body);
  g.strokeStyle = 'rgba(120,160,125,0.45)';
  g.lineWidth = sz * 0.014;
  g.beginPath();
  g.arc(c, c, r * 0.97, a0 + 0.3, a0 - 0.3 + Math.PI * 2);
  g.stroke();
  g.strokeStyle = 'rgba(240,248,240,0.10)';
  g.lineWidth = sz * 0.008;
  for (let i = 0; i < 7; i++) {
    const a = a0 + 0.35 + (i / 7) * (Math.PI * 2 - 0.7);
    g.beginPath();
    g.moveTo(c, c);
    g.lineTo(c + Math.cos(a) * r * 0.92, c + Math.sin(a) * r * 0.92);
    g.stroke();
  }
  g.fillStyle = 'rgba(40,70,52,0.12)';
  g.beginPath();
  g.ellipse(c + (rnd() - 0.5) * r, c + (rnd() - 0.5) * r, r * 0.3, r * 0.18, rnd() * Math.PI, 0, Math.PI * 2);
  g.fill();
  g.restore();

  return Texture.from(cv);
}

/** 尖瓣荷花的单瓣：底部暖白、瓣尖粉，绕花心排布（调用前需 translate 到花心） */
function lotusPetal(g: CanvasRenderingContext2D, len: number, wid: number, rot: number, tip: string) {
  g.save();
  g.rotate(rot);
  const grad = g.createLinearGradient(0, 0, 0, -len);
  grad.addColorStop(0, '#f7ead9');
  grad.addColorStop(1, tip);
  g.fillStyle = grad;
  g.strokeStyle = 'rgba(190,110,125,0.35)';
  g.lineWidth = 1.2;
  g.beginPath();
  g.moveTo(0, 0);
  g.quadraticCurveTo(wid, -len * 0.45, 0, -len);
  g.quadraticCurveTo(-wid, -len * 0.45, 0, 0);
  g.closePath();
  g.fill();
  g.stroke();
  g.restore();
}

function lotusTexture(): Texture {
  const sz = 160;
  const cv = document.createElement('canvas');
  cv.width = sz;
  cv.height = sz;
  const g = cv.getContext('2d')!;
  const c = sz / 2;

  // 花影
  g.fillStyle = 'rgba(30,55,45,0.16)';
  g.beginPath();
  g.ellipse(c + 4, c + 8, sz * 0.26, sz * 0.14, 0, 0, Math.PI * 2);
  g.fill();

  // 外层 8 瓣 + 内层 6 瓣（以花心为原点）
  g.save();
  g.translate(c, c);
  for (let i = 0; i < 8; i++) lotusPetal(g, sz * 0.42, sz * 0.13, (i / 8) * Math.PI * 2, '#e08fa2');
  for (let i = 0; i < 6; i++) lotusPetal(g, sz * 0.28, sz * 0.1, ((i + 0.5) / 6) * Math.PI * 2 + 0.3, '#eab3c0');

  // 莲蓬心
  g.fillStyle = '#d9c063';
  g.beginPath();
  g.arc(0, 0, sz * 0.085, 0, Math.PI * 2);
  g.fill();
  g.fillStyle = '#8a7430';
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2;
    g.beginPath();
    g.arc(Math.cos(a) * sz * 0.04, Math.sin(a) * sz * 0.04, sz * 0.012, 0, Math.PI * 2);
    g.fill();
  }
  g.restore();
  return Texture.from(cv);
}

function budTexture(): Texture {
  const sz = 90;
  const cv = document.createElement('canvas');
  cv.width = sz;
  cv.height = sz;
  const g = cv.getContext('2d')!;
  // 茎
  g.strokeStyle = '#4c7358';
  g.lineWidth = 4;
  g.beginPath();
  g.moveTo(sz * 0.5, sz);
  g.quadraticCurveTo(sz * 0.46, sz * 0.7, sz * 0.52, sz * 0.5);
  g.stroke();
  // 花蕾（水滴形，白底粉尖）
  const grad = g.createLinearGradient(0, sz * 0.5, 0, sz * 0.12);
  grad.addColorStop(0, '#faf6ef');
  grad.addColorStop(1, '#e5a3b0');
  g.fillStyle = grad;
  g.beginPath();
  g.moveTo(sz * 0.52, sz * 0.12);
  g.quadraticCurveTo(sz * 0.68, sz * 0.34, sz * 0.52, sz * 0.5);
  g.quadraticCurveTo(sz * 0.36, sz * 0.34, sz * 0.52, sz * 0.12);
  g.fill();
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

  // 采样二次贝塞尔并按宽度渐变描成枯笔
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

  constructor() {
    this.layer.addChild(this.branch);
    // 相对屏幕位置：两角莲叶群 + 荷花/莲蕾点缀
    const spots = [
      { rx: 0.1, ry: 0.15, size: 190, seed: 11 },
      { rx: 0.87, ry: 0.79, size: 230, seed: 22 },
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
    this.flowers[0].s.position.set(0.87 * W, 0.79 * H - 110);
    this.flowers[0].s.width = 110;
    this.flowers[0].s.height = 110;
    this.flowers[1].s.position.set(0.1 * W + 120, 0.15 * H + 40);
    this.flowers[1].s.width = 78;
    this.flowers[1].s.height = 78;
  }

  step(_dt: number, t: number) {
    for (const p of this.pads) p.s.rotation = p.baseRot + Math.sin(t * 0.25 + p.wobble) * 0.012;
    for (const f of this.flowers) f.s.rotation = f.baseRot + Math.sin(t * 0.2 + f.wobble) * 0.02;
  }
}
