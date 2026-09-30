// 水彩池底：程序生成（青绿淡雅）。换风格只改 PALETTE / 种子，D1 先立效果。
import { Texture } from 'pixi.js';

export const PALETTE = {
  light: '#a7cbb9',
  mid: '#7fab97',
  deep: '#578877',
  ink: '#2e4a40',
  pebbles: ['#b8ae97', '#a99f89', '#c6bca6', '#8f8873'],
};

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
  const rnd = mulberry32(20261001);

  const grad = g.createLinearGradient(0, 0, w * 0.3, h);
  grad.addColorStop(0, PALETTE.light);
  grad.addColorStop(0.55, PALETTE.mid);
  grad.addColorStop(1, PALETTE.deep);
  g.fillStyle = grad;
  g.fillRect(0, 0, w, h);

  // 大块水彩渍：明暗交替的柔和椭圆
  for (let i = 0; i < 14; i++) {
    const x = rnd() * w;
    const y = rnd() * h;
    const r = 180 + rnd() * 320;
    const dark = rnd() > 0.5;
    const rg = g.createRadialGradient(x, y, 0, x, y, r);
    rg.addColorStop(0, dark ? 'rgba(46,74,64,0.10)' : 'rgba(220,235,226,0.12)');
    rg.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = rg;
    g.beginPath();
    g.ellipse(x, y, r, r * (0.6 + rnd() * 0.5), rnd() * Math.PI, 0, Math.PI * 2);
    g.fill();
  }

  // 鹅卵石
  for (let i = 0; i < 110; i++) {
    const x = rnd() * w;
    const y = rnd() * h;
    const r = 5 + rnd() * 16;
    g.globalAlpha = 0.35 + rnd() * 0.3;
    g.fillStyle = PALETTE.pebbles[(rnd() * PALETTE.pebbles.length) | 0];
    g.beginPath();
    g.ellipse(x, y, r, r * (0.7 + rnd() * 0.3), rnd() * Math.PI, 0, Math.PI * 2);
    g.fill();
    g.globalAlpha = 0.22;
    g.fillStyle = '#ffffff';
    g.beginPath();
    g.ellipse(x - r * 0.3, y - r * 0.35, r * 0.35, r * 0.2, 0, 0, Math.PI * 2);
    g.fill();
    g.globalAlpha = 1;
  }

  // 边缘暗角
  const vg = g.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.45, w / 2, h / 2, Math.max(w, h) * 0.75);
  vg.addColorStop(0, 'rgba(0,0,0,0)');
  vg.addColorStop(1, 'rgba(46,74,64,0.35)');
  g.fillStyle = vg;
  g.fillRect(0, 0, w, h);

  return Texture.from(cv);
}
