// 池塘背景为手绘水墨原画（bg-*.png，含四季）；本文件只保留雾贴图与水色调。
import { Texture } from 'pixi.js';

export const WATER_TINT = 0xc9d6cc;

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
