// 昼夜水墨调色：晨粉 / 昼素 / 暮赭 / 夜墨蓝，multiply 全画幅；相邻关键帧线性渐变。
// 层序在鱼/背景之上、涟漪与雾之下——夜里涟漪和雾仍亮（月色）。
import { Sprite, Texture } from 'pixi.js';

// [小时, multiply 颜色]；白 = 原画不变。黄昏段（17.5~20h）是真实的金色时刻：
// 斜阳把画面染成暖金，落日后余晖转玫瑰棕，再沉入暮色灰紫——不回到浓琥珀的老问题。
const KEYS: [number, number][] = [
  [0, 0x455482], [4.5, 0x455482], [5.5, 0x9a92a6], [7, 0xe8e2d8], [8, 0xffffff],
  [16, 0xfffaf0], [17.5, 0xf2dcba], [18.6, 0xe4c298], [19.3, 0xd4ab90], [19.9, 0xb093a0],
  [21, 0x455482], [24, 0x455482],
];

function lerpHex(a: number, b: number, k: number): number {
  const ar = (a >> 16) & 255;
  const ag = (a >> 8) & 255;
  const ab = a & 255;
  const br = (b >> 16) & 255;
  const bg = (b >> 8) & 255;
  const bb = b & 255;
  const r = Math.round(ar + (br - ar) * k);
  const g = Math.round(ag + (bg - ag) * k);
  const bl = Math.round(ab + (bb - ab) * k);
  return (r << 16) | (g << 8) | bl;
}

export function tintAt(hour: number): number {
  const h = ((hour % 24) + 24) % 24;
  for (let i = 0; i < KEYS.length - 1; i++) {
    const [h0, c0] = KEYS[i];
    const [h1, c1] = KEYS[i + 1];
    if (h >= h0 && h <= h1) return lerpHex(c0, c1, (h - h0) / (h1 - h0 || 1));
  }
  return 0xffffff;
}

export function isNight(hour: number): boolean {
  return hour >= 19 || hour < 5.5;
}

export class DayTint {
  readonly sp = new Sprite(Texture.WHITE);
  constructor() {
    this.sp.blendMode = 'multiply';
  }
  update(hour: number) {
    this.sp.tint = tintAt(hour);
  }
  layout(W: number, H: number) {
    this.sp.width = W;
    this.sp.height = H;
  }
}
