// 水面：涟漪 = CPU 双缓冲波动方程（细网格、强阻尼、克制的扰动）。
// 池塘底景已换成手绘水墨原画（自带焦散质感），本层只负责互动涟漪高光。
// ponytail: CPU 网格 512×320（每帧 ~2ms，M4 富余）；要全屏位移折射时升级 GPU framebuffer，接口不变。
import { Sprite, Texture } from 'pixi.js';

const SIM_W = 512;
const SIM_H = 320;
const DAMP = 0.956;
const CREST_T = 0.045;

export class Water {
  readonly highlight: Sprite;
  private cur = new Float32Array(SIM_W * SIM_H);
  private prev = new Float32Array(SIM_W * SIM_H);
  private cv: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private img: ImageData;
  private nextAmbient = 18;

  constructor() {
    this.cv = document.createElement('canvas');
    this.cv.width = SIM_W;
    this.cv.height = SIM_H;
    this.ctx = this.cv.getContext('2d')!;
    this.img = this.ctx.createImageData(SIM_W, SIM_H);

    this.highlight = new Sprite(Texture.from(this.cv));
    this.highlight.blendMode = 'add';
    this.highlight.alpha = 0.36;
  }

  layout(W: number, H: number) {
    this.highlight.width = W;
    this.highlight.height = H;
  }

  /** nx, ny ∈ [0,1]（归一化屏幕坐标）。默认小而轻。 */
  drop(nx: number, ny: number, r = 1.8, strength = 0.5) {
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
    this.nextAmbient -= dt;
    if (this.nextAmbient <= 0) {
      // 极罕见的偶发涟漪（一片落叶），轻到几乎注意不到
      this.drop(Math.random(), Math.random(), 1.4, 0.18);
      this.nextAmbient = 14 + Math.random() * 16;
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

    // 高光着色：只有明显的波峰才显形，波谷极淡
    const d = this.img.data;
    const c = this.cur;
    for (let i = 0, p = 0; i < c.length; i++, p += 4) {
      const v = c[i];
      if (v > CREST_T) {
        const a = Math.min(1, (v - CREST_T) * 4);
        d[p] = 235;
        d[p + 1] = 245;
        d[p + 2] = 240;
        d[p + 3] = (a * 255) | 0;
      } else if (v < -CREST_T) {
        const a = Math.min(1, (-v - CREST_T) * 2.5);
        d[p] = 30;
        d[p + 1] = 60;
        d[p + 2] = 55;
        d[p + 3] = (a * 110) | 0;
      } else {
        d[p + 3] = 0;
      }
    }
    this.ctx.putImageData(this.img, 0, 0);
    const src = this.highlight.texture.source as unknown as { update?: () => void };
    src.update?.();
  }
}
