// 水面：涟漪 = CPU 双缓冲波动方程（细网格、强阻尼、克制的扰动）；焦散 = 脉络纹理慢旋。
// 审美基准：水面近乎静止，只有 interactions 的细波纹；忌大圈、忌亮环。
// ponytail: CPU 网格 512×320（每帧 ~2ms，M4 富余）；要全屏位移折射时升级 GPU framebuffer，接口不变。
import { Container, Sprite, Texture } from 'pixi.js';

const SIM_W = 512;
const SIM_H = 320;
const DAMP = 0.956;
const CREST_T = 0.045;

function makeCausticTexture(): Texture {
  const cv = document.createElement('canvas');
  cv.width = 512;
  cv.height = 512;
  const g = cv.getContext('2d')!;
  g.lineCap = 'round';
  // 细脉络（焦散网）
  for (let i = 0; i < 130; i++) {
    const x = Math.random() * 512;
    const y = Math.random() * 512;
    const a = Math.random() * Math.PI * 2;
    const len = 40 + Math.random() * 90;
    g.strokeStyle = `rgba(255,255,248,${0.04 + Math.random() * 0.05})`;
    g.lineWidth = 2 + Math.random() * 6;
    g.beginPath();
    g.moveTo(x, y);
    g.quadraticCurveTo(x + Math.cos(a) * len * 0.5 + (Math.random() - 0.5) * 60, y + Math.sin(a) * len * 0.5 + (Math.random() - 0.5) * 60, x + Math.cos(a) * len, y + Math.sin(a) * len);
    g.stroke();
  }
  // 宽软带（大尺度明暗）
  for (let i = 0; i < 26; i++) {
    const x = Math.random() * 512;
    const y = Math.random() * 512;
    const a = Math.random() * Math.PI * 2;
    const len = 120 + Math.random() * 160;
    g.strokeStyle = 'rgba(255,255,248,0.028)';
    g.lineWidth = 14 + Math.random() * 14;
    g.beginPath();
    g.moveTo(x, y);
    g.quadraticCurveTo(x + Math.cos(a) * len * 0.5 + (Math.random() - 0.5) * 80, y + Math.sin(a) * len * 0.5 + (Math.random() - 0.5) * 80, x + Math.cos(a) * len, y + Math.sin(a) * len);
    g.stroke();
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
  private nextAmbient = 18;

  constructor() {
    this.cv = document.createElement('canvas');
    this.cv.width = SIM_W;
    this.cv.height = SIM_H;
    this.ctx = this.cv.getContext('2d')!;
    this.img = this.ctx.createImageData(SIM_W, SIM_H);

    this.highlight = new Sprite(Texture.from(this.cv));
    this.highlight.blendMode = 'add';
    this.highlight.alpha = 0.42;

    const n = makeCausticTexture();
    this.c1 = new Sprite(n);
    this.c1.blendMode = 'add';
    this.c1.alpha = 0.05;
    this.c2 = new Sprite(n);
    this.c2.blendMode = 'add';
    this.c2.alpha = 0.032;
    this.caustics.addChild(this.c1, this.c2);
  }

  layout(W: number, H: number) {
    this.highlight.width = W;
    this.highlight.height = H;
    for (const c of [this.c1, this.c2]) {
      c.anchor.set(0.5);
      c.width = W * 2.2;
      c.height = H * 2.2;
      c.position.set(W / 2, H / 2);
    }
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
    this.t += dt;
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
        d[p] = 255;
        d[p + 1] = 255;
        d[p + 2] = 246;
        d[p + 3] = (a * 255) | 0;
      } else if (v < -CREST_T) {
        const a = Math.min(1, (-v - CREST_T) * 2.5);
        d[p] = 22;
        d[p + 1] = 58;
        d[p + 2] = 48;
        d[p + 3] = (a * 120) | 0;
      } else {
        d[p + 3] = 0;
      }
    }
    this.ctx.putImageData(this.img, 0, 0);
    const src = this.highlight.texture.source as unknown as { update?: () => void };
    src.update?.();

    this.c1.rotation += dt * 0.006;
    this.c2.rotation -= dt * 0.0045;
    this.c1.alpha = 0.05 + 0.006 * Math.sin(this.t * 0.3);
    this.c2.alpha = 0.032 + 0.005 * Math.sin(this.t * 0.23 + 2);
  }
}
