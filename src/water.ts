// 水面：涟漪 = CPU 双缓冲波动方程（细网格、高阻尼、克制的扰动）。
// 高度场每帧编码成位移图（R=X 梯度、G=Y 梯度、0.5 中性），交给 DisplacementFilter
// 扭曲底图与鱼层——波纹靠折射显形，不叠任何白色。CPU 网格 512×320（M4 富余）。
import { Sprite, Texture } from 'pixi.js';
import type { PondZone } from './pondzone';

const SIM_W = 512;
const SIM_H = 320;
const DAMP = 0.972; // 高阻尼：环存续更久，荡得更远更从容
const GRAD_K = 550; // 高度梯度 → 位移图字节的增益

export class Water {
  private cur = new Float32Array(SIM_W * SIM_H);
  private prev = new Float32Array(SIM_W * SIM_H);
  private cv = (() => {
    const c = document.createElement('canvas');
    c.width = SIM_W;
    c.height = SIM_H;
    return c;
  })();
  /** 位移图精灵：R=X 梯度、G=Y 梯度、0.5 中性。须加入舞台（世界变换参与对齐），本身不可见 */
  readonly waveMap = new Sprite(Texture.from(this.cv));
  private ctx: CanvasRenderingContext2D;
  private img: ImageData;

  // 波纹扩散速度：模拟步进率 × 0.4——环扩散更慢、存续更久
  private static readonly STEP = 1 / 60;
  private acc = 0;
  private pond: PondZone | null = null;
  private mask: Uint8Array | null = null; // 水域掩码：1=水里，0=岸上（波传到岸即被吸收）
  private lw = 0;
  private lh = 0;

  constructor() {
    this.ctx = this.cv.getContext('2d', { willReadFrequently: true })!;
    this.img = this.ctx.createImageData(SIM_W, SIM_H);
    const d = this.img.data;
    for (let i = 0; i < d.length; i += 4) {
      d[i] = 128; // 中性灰：无波处位移为 0
      d[i + 1] = 128;
      d[i + 3] = 255;
    }
  }

  layout(W: number, H: number, pond?: PondZone) {
    // 位移图铺满屏幕（calculateSpriteMatrix 按精灵世界变换对齐滤镜帧）
    this.waveMap.position.set(0, 0);
    this.waveMap.width = W;
    this.waveMap.height = H;
    // 水域掩码：按水岸多边形逐格预计算，波只在格子里传播，不过界
    if (pond && (pond !== this.pond || W !== this.lw || H !== this.lh)) {
      this.pond = pond;
      this.lw = W;
      this.lh = H;
      const m = new Uint8Array(SIM_W * SIM_H);
      for (let y = 0; y < SIM_H; y++) {
        const sy = ((y + 0.5) / SIM_H) * H;
        for (let x = 0; x < SIM_W; x++) {
          const sx = ((x + 0.5) / SIM_W) * W;
          m[y * SIM_W + x] = pond.probe(sx, sy).d > 4 ? 1 : 0;
        }
      }
      this.mask = m;
    }
  }

  /** 落一滴扰动：nx, ny ∈ [0,1]（归一化屏幕坐标），r 为网格单位半径 */
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
    this.acc = Math.min(this.acc + dt * 0.4, Water.STEP * 3);
    let stepped = false;
    while (this.acc >= Water.STEP) {
      this.acc -= Water.STEP;
      this.simOne();
      stepped = true;
    }
    if (!stepped) return;
    // 高度梯度 → 位移图（边框一圈保持中性，不写）
    const d = this.img.data;
    const c = this.cur;
    for (let y = 1; y < SIM_H - 1; y++) {
      const row = y * SIM_W;
      for (let x = 1; x < SIM_W - 1; x++) {
        const i = row + x;
        const p = i * 4;
        const gx = (c[i + 1] - c[i - 1]) * GRAD_K;
        const gy = (c[i + SIM_W] - c[i - SIM_W]) * GRAD_K;
        d[p] = 128 + Math.max(-127, Math.min(127, gx));
        d[p + 1] = 128 + Math.max(-127, Math.min(127, gy));
      }
    }
    this.ctx.putImageData(this.img, 0, 0);
    const src = this.waveMap.texture.source as unknown as { update?: () => void };
    src.update?.();
  }

  private simOne() {
    const { cur, prev } = this;
    for (let y = 1; y < SIM_H - 1; y++) {
      const row = y * SIM_W;
      for (let x = 1; x < SIM_W - 1; x++) {
        const i = row + x;
        prev[i] = ((cur[i - 1] + cur[i + 1] + cur[i - SIM_W] + cur[i + SIM_W]) / 2 - prev[i]) * DAMP;
      }
    }
    [this.cur, this.prev] = [this.prev, this.cur];
    // 岸线吸收：掩码外强制归零，波不过界（等效于岸反射）
    const mask = this.mask;
    if (mask) {
      const cu = this.cur;
      const pv = this.prev;
      for (let i = 0; i < mask.length; i++) {
        if (!mask[i]) {
          cu[i] = 0;
          pv[i] = 0;
        }
      }
    }
  }
}
