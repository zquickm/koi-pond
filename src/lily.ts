// 荷叶角饰：静态水彩荷叶 + 一朵荷花，垫在鱼层之上（鱼从叶下过）。
// D4 再加风摆/雨打，本层只管构图。
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
  sh.addColorStop(0, 'rgba(20,45,38,0.22)');
  sh.addColorStop(1, 'rgba(20,45,38,0)');
  g.fillStyle = sh;
  g.fillRect(0, 0, sz, sz);

  // 叶身
  const a0 = rnd() * Math.PI * 2; // 缺口方向
  const body = new Path2D();
  body.arc(c, c, r, a0 + 0.28, a0 - 0.28 + Math.PI * 2);
  body.lineTo(c, c);
  body.closePath();
  const rg = g.createRadialGradient(c - r * 0.2, c - r * 0.25, r * 0.1, c, c, r);
  rg.addColorStop(0, '#6f9166');
  rg.addColorStop(1, '#54784e');
  g.fillStyle = rg;
  g.fill(body);

  // 叶缘亮边 + 叶脉
  g.save();
  g.clip(body);
  g.strokeStyle = 'rgba(147,177,132,0.5)';
  g.lineWidth = sz * 0.014;
  g.beginPath();
  g.arc(c, c, r * 0.97, a0 + 0.3, a0 - 0.3 + Math.PI * 2);
  g.stroke();
  g.strokeStyle = 'rgba(255,255,255,0.08)';
  g.lineWidth = sz * 0.008;
  for (let i = 0; i < 7; i++) {
    const a = a0 + 0.35 + (i / 7) * (Math.PI * 2 - 0.7);
    g.beginPath();
    g.moveTo(c, c);
    g.lineTo(c + Math.cos(a) * r * 0.92, c + Math.sin(a) * r * 0.92);
    g.stroke();
  }
  // 水渍
  g.fillStyle = 'rgba(30,55,42,0.10)';
  g.beginPath();
  g.ellipse(c + (rnd() - 0.5) * r, c + (rnd() - 0.5) * r, r * 0.3, r * 0.18, rnd() * Math.PI, 0, Math.PI * 2);
  g.fill();
  g.restore();

  return Texture.from(cv);
}

function blossomTexture(): Texture {
  const sz = 72;
  const cv = document.createElement('canvas');
  cv.width = sz;
  cv.height = sz;
  const g = cv.getContext('2d')!;
  const c = sz / 2;
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    g.save();
    g.translate(c + Math.cos(a) * sz * 0.16, c + Math.sin(a) * sz * 0.16);
    g.rotate(a);
    g.fillStyle = '#f4efe6';
    g.beginPath();
    g.ellipse(0, 0, sz * 0.17, sz * 0.09, 0, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = 'rgba(232,201,206,0.55)';
    g.beginPath();
    g.ellipse(sz * 0.08, 0, sz * 0.07, sz * 0.08, 0, 0, Math.PI * 2);
    g.fill();
    g.restore();
  }
  g.fillStyle = '#e6b44c';
  g.beginPath();
  g.arc(c, c, sz * 0.08, 0, Math.PI * 2);
  g.fill();
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

  constructor() {
    // 相对屏幕位置的角部构图（左上/右下大叶，右上/左下小叶），一朵荷花点缀右下
    const spots = [
      { rx: 0.07, ry: 0.13, size: 230, seed: 11 },
      { rx: 0.93, ry: 0.84, size: 260, seed: 22, flower: true },
      { rx: 0.9, ry: 0.07, size: 150, seed: 33 },
      { rx: 0.09, ry: 0.9, size: 175, seed: 44 },
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
      if (sp.flower) {
        const f = new Sprite(blossomTexture());
        f.anchor.set(0.5);
        f.width = 64;
        f.height = 64;
        f.position.set(sp.size * 0.18, -sp.size * 0.16);
        s.addChild(f);
      }
    }
  }

  layout(W: number, H: number) {
    const spots = [
      [0.07, 0.13],
      [0.93, 0.84],
      [0.9, 0.07],
      [0.09, 0.9],
    ];
    this.pads.forEach((p, i) => {
      p.s.position.set(spots[i][0] * W, spots[i][1] * H);
    });
  }

  step(_dt: number, t: number) {
    for (const p of this.pads) p.s.rotation = p.baseRot + Math.sin(t * 0.25 + p.wobble) * 0.012;
  }
}
