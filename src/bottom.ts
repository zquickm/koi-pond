// 水墨国风池底：淡青留白水面 + 边缘水墨山石框景（石青/赭石/干笔皴）+ 烟波 + 墨点鱼苗。
// 参照国风水墨竞技场皮肤：水淡、石浓、雾白、留白多。
import { Texture } from 'pixi.js';

export const PALETTE = {
  waterLight: '#dfe9e2',
  waterMid: '#c2d4c9',
  waterDeep: '#a8c0b4',
  ink: '#2e4443',
  inkSoft: '#48625f',
  rock: '#35504f',
  rockLight: '#4d6c68',
  ochre: '#b98d54',
  paper: '#eef2ea',
};

// 主水面色的数值形式（给水色罩 tint 用）
export const WATER_TINT = 0xc2d4c9;

function mulberry32(seed: number) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function makeBottomTexture(w = 1600, h = 1024): Texture {
  const cv = document.createElement('canvas');
  cv.width = w;
  cv.height = h;
  const g = cv.getContext('2d')!;
  const rnd = mulberry32(20261002);

  // 水面底色：淡青渐变（留白感）
  const grad = g.createLinearGradient(0, 0, w * 0.4, h);
  grad.addColorStop(0, PALETTE.waterLight);
  grad.addColorStop(0.55, PALETTE.waterMid);
  grad.addColorStop(1, PALETTE.waterDeep);
  g.fillStyle = grad;
  g.fillRect(0, 0, w, h);

  // 水墨渍：灰青大斑与纸白留白交替
  for (let i = 0; i < 16; i++) {
    const x = rnd() * w;
    const y = rnd() * h;
    const r = 160 + rnd() * 320;
    const rg = g.createRadialGradient(x, y, 0, x, y, r);
    const ink = rnd() > 0.42;
    rg.addColorStop(0, ink ? 'rgba(72,98,95,0.07)' : 'rgba(238,242,234,0.12)');
    rg.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = rg;
    g.beginPath();
    g.ellipse(x, y, r, r * (0.4 + rnd() * 0.4), rnd() * Math.PI, 0, Math.PI * 2);
    g.fill();
  }

  // 山石：主体石青 + 亮面 + 赭石土斑 + 干笔皴 + 淡勾边
  const rock = (x: number, y: number, rx: number, ry: number, rot: number) => {
    g.save();
    g.translate(x, y);
    g.rotate(rot);
    g.fillStyle = PALETTE.rock;
    g.beginPath();
    g.ellipse(0, 0, rx, ry, 0, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = PALETTE.rockLight;
    g.beginPath();
    g.ellipse(-rx * 0.15, -ry * 0.25, rx * 0.7, ry * 0.55, -0.2, 0, Math.PI * 2);
    g.fill();
    g.globalAlpha = 0.4;
    g.fillStyle = PALETTE.ochre;
    g.beginPath();
    g.ellipse(rx * 0.2, ry * 0.3, rx * 0.45, ry * 0.3, 0.3, 0, Math.PI * 2);
    g.fill();
    g.globalAlpha = 1;
    g.strokeStyle = 'rgba(220,235,225,0.16)';
    for (let i = 0; i < 4; i++) {
      g.lineWidth = 1.5 + rnd() * 2.5;
      const yy = -ry * 0.6 + rnd() * ry * 1.1;
      g.beginPath();
      g.moveTo(-rx * 0.8, yy);
      g.quadraticCurveTo(0, yy - ry * 0.25 * (rnd() - 0.5) * 2, rx * 0.8, yy + (rnd() - 0.5) * ry * 0.3);
      g.stroke();
    }
    g.strokeStyle = 'rgba(24,40,38,0.4)';
    g.lineWidth = 2;
    g.beginPath();
    g.ellipse(0, 0, rx, ry, 0, 0, Math.PI * 2);
    g.stroke();
    g.restore();
  };

  const edgeRocks = (count: number, pos: (t: number) => [number, number, number, number, number]) => {
    for (let i = 0; i < count; i++) {
      const t = (i + 0.5) / count + (rnd() - 0.5) * 0.08;
      const [x, y, rx, ry, rot] = pos(t);
      rock(x, y, rx * (0.75 + rnd() * 0.5), ry * (0.75 + rnd() * 0.5), rot);
    }
  };
  edgeRocks(7, (t) => [t * w, rnd() * 24 - 8, 70 + rnd() * 90, 34 + rnd() * 40, (rnd() - 0.5) * 0.5]);
  edgeRocks(7, (t) => [t * w, h + 8 - rnd() * 24, 70 + rnd() * 90, 34 + rnd() * 40, (rnd() - 0.5) * 0.5]);
  edgeRocks(5, (t) => [rnd() * 24 - 8, t * h, 34 + rnd() * 40, 70 + rnd() * 90, (rnd() - 0.5) * 0.5]);
  edgeRocks(5, (t) => [w + 8 - rnd() * 24, t * h, 34 + rnd() * 40, 70 + rnd() * 90, (rnd() - 0.5) * 0.5]);
  rock(60, 50, 170, 110, 0.4);
  rock(w - 70, 40, 190, 120, -0.5);
  rock(50, h - 60, 180, 115, -0.3);
  rock(w - 60, h - 50, 175, 110, 0.35);

  // 烟波：边缘大团雾白，往水里漫
  for (let i = 0; i < 12; i++) {
    const edge = rnd();
    let x: number;
    let y: number;
    if (edge < 0.5) {
      x = rnd() * w;
      y = edge < 0.25 ? rnd() * h * 0.08 : h - rnd() * h * 0.08;
    } else {
      x = edge < 0.75 ? rnd() * w * 0.08 : w - rnd() * w * 0.08;
      y = rnd() * h;
    }
    const r = 180 + rnd() * 220;
    const rg = g.createRadialGradient(x, y, 0, x, y, r);
    rg.addColorStop(0, 'rgba(238,242,234,0.22)');
    rg.addColorStop(1, 'rgba(238,242,234,0)');
    g.fillStyle = rg;
    g.fillRect(x - r, y - r, r * 2, r * 2);
  }

  // 墨点鱼苗：中央水面的极小墨痕
  for (let i = 0; i < 14; i++) {
    const x = w * (0.18 + rnd() * 0.64);
    const y = h * (0.18 + rnd() * 0.64);
    const a = rnd() * Math.PI;
    const l = 5 + rnd() * 5;
    g.save();
    g.translate(x, y);
    g.rotate(a);
    g.fillStyle = 'rgba(46,68,67,0.5)';
    g.beginPath();
    g.ellipse(0, 0, l, l * 0.32, 0, 0, Math.PI * 2);
    g.fill();
    g.strokeStyle = 'rgba(46,68,67,0.4)';
    g.lineWidth = 1.2;
    g.beginPath();
    g.moveTo(-l, 0);
    g.lineTo(-l * 1.8, -l * 0.35);
    g.moveTo(-l, 0);
    g.lineTo(-l * 1.8, l * 0.35);
    g.stroke();
    g.restore();
  }

  return Texture.from(cv);
}

/** 烟雾贴图（漂移雾层用） */
export function makeFogTexture(): Texture {
  const cv = document.createElement('canvas');
  cv.width = 256;
  cv.height = 256;
  const g = cv.getContext('2d')!;
  const rg = g.createRadialGradient(128, 128, 10, 128, 128, 126);
  rg.addColorStop(0, 'rgba(238,242,234,0.9)');
  rg.addColorStop(1, 'rgba(238,242,234,0)');
  g.fillStyle = rg;
  g.fillRect(0, 0, 256, 256);
  return Texture.from(cv);
}
