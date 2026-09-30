// 水面两层：涟漪高光 = CPU 双缓冲波动方程；焦散 = 两层噪声纹理慢旋。
// ponytail: CPU 网格上限 320×200（每帧 <0.5ms）；要全屏位移折射时升级为 GPU framebuffer，对外接口不变。
import { Container, Sprite, Texture } from 'pixi.js';

const SIM_W = 320;
const SIM_H = 200;
const DAMP = 0.986;

function makeNoiseTexture(): Texture {
  const cv = document.createElement('canvas');
  cv.width = 256;
  cv.height = 256;
  const g = cv.getContext('2d')!;
  for (let i = 0; i < 55; i++) {
    const x = Math.random() * 256;
    const y = Math.random() * 256;
    const r = 18 + Math.random() * 55;
    const rg = g.createRadialGradient(x, y, 0, x, y, r);
    rg.addColorStop(0, 'rgba(255,255,250,0.30)');
    rg.addColorStop(1, 'rgba(255,255,250,0)');
    g.fillStyle = rg;
    g.fillRect(x - r, y - r, r * 2, r * 2);
  }
  return Texture.from(cv);
}

export class Water {
  readonly caustics = new Container();
  readonly highlight: Sprite;
  private c1: Sprite;
  private c2: Sprite;
  private cur = new Float32Array(SIM_W * SIM_H);
  private prev = new Float32Array(SIM_W * SIM_H);
  private cv: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private img: ImageData;
  private t = 0;
  private nextAmbient = 2;

  constructor() {
    this.cv = document.createElement('canvas');
    this.cv.width = SIM_W;
    this.cv.height = SIM_H;
    this.ctx = this.cv.getContext('2d')!;
    this.img = this.ctx.createImageData(SIM_W, SIM_H);

    this.highlight = new Sprite(Texture.from(this.cv));
    this.highlight.blendMode = 'add';
    this.highlight.alpha = 0.55;

    const n = makeNoiseTexture();
    this.c1 = new Sprite(n);
    this.c1.blendMode = 'add';
    this.c1.alpha = 0.07;
    this.c2 = new Sprite(n);
    this.c2.blendMode = 'add';
    this.c2.alpha = 0.05;
    this.caustics.addChild(this.c1, this.c2);
  }

  layout(W: number, H: number) {
    this.highlight.width = W;
    this.highlight.height = H;
    for (const c of [this.c1, this.c2]) {
      c.anchor.set(0.5);
      c.width = W * 1.8;
      c.height = H * 1.8;
      c.position.set(W / 2, H / 2);
    }
  }

  /** nx, ny ∈ [0,1]（归一化屏幕坐标） */
  drop(nx: number, ny: number, r = 2.8, strength = 1) {
    const cx = nx * SIM_W;
    const cy = ny * SIM_H;
    for (let y = Math.max(1, Math.floor(cy - r)); y < Math.min(SIM_H - 1, cy + r + 1); y++) {
      for (let x = Math.max(1, Math.floor(cx - r)); x < Math.min(SIM_W - 1, cx + r + 1); x++) {
        const d2 = (x - cx) ** 2 + (y - cy) ** 2;
        if (d2 < r * r) this.cur[y * SIM_W + x] -= strength * (1 - d2 / (r * r));
      }
    }
  }

  step(dt: number) {
    this.t += dt;
    this.nextAmbient -= dt;
    if (this.nextAmbient <= 0) {
      this.drop(Math.random(), Math.random(), 2 + Math.random() * 3, 0.6 + Math.random() * 0.8);
      this.nextAmbient = 2.5 + Math.random() * 3;
    }

    const { cur, prev } = this;
    for (let y = 1; y < SIM_H - 1; y++) {
      const row = y * SIM_W;
      for (let x = 1; x < SIM_W - 1; x++) {
        const i = row + x;
        prev[i] = ((cur[i - 1] + cur[i + 1] + cur[i - SIM_W] + cur[i + SIM_W]) / 2 - prev[i]) * DAMP;
      }
    }
    [this.cur, this.prev] = [this.prev, this.cur];

    // 高光着色：波峰偏白、波谷偏深
    const d = this.img.data;
    const c = this.cur;
    for (let i = 0, p = 0; i < c.length; i++, p += 4) {
      const v = c[i];
      if (v > 0.02) {
        const a = Math.min(1, v * 3);
        d[p] = 255;
        d[p + 1] = 255;
        d[p + 2] = 245;
        d[p + 3] = (a * 255) | 0;
      } else if (v < -0.02) {
        const a = Math.min(1, -v * 3);
        d[p] = 20;
        d[p + 1] = 60;
        d[p + 2] = 50;
        d[p + 3] = (a * 160) | 0;
      } else {
        d[p + 3] = 0;
      }
    }
    this.ctx.putImageData(this.img, 0, 0);
    const src = this.highlight.texture.source as unknown as { update?: () => void };
    src.update?.();

    this.c1.rotation += dt * 0.02;
    this.c2.rotation -= dt * 0.015;
    this.c1.alpha = 0.06 + 0.02 * Math.sin(this.t * 0.4);
    this.c2.alpha = 0.05 + 0.015 * Math.sin(this.t * 0.3 + 2);
  }
}
