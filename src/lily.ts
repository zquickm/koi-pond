// 青蛙：蹲在背景原画右下的大莲叶上（锚点用"艺术图比例坐标"，经背景 cover-fit 映射到屏幕），
// 弹跳循环（压腿→腾空→落地涟漪）+ 鼓腮。涟漪强度通过 wake 的 r/s 参数放大。
import { Sprite, Texture } from 'pixi.js';

export type ArtMap = (fx: number, fy: number) => { x: number; y: number };

export class Frog {
  readonly sp = new Sprite();
  // 叶心在艺术图中的比例坐标（bg-v7 与四季变体构图一致）
  private anchorF = { x: 0.836, y: 0.926 };
  private spots: { x: number; y: number }[] = [];
  private frogAt = 0;
  private hopT = -1;
  private hopFrom = 0;
  private hopTo = 0;
  private nextHop = 5 + Math.random() * 5;
  private landT = 0;
  private croakT = 8 + Math.random() * 6;
  private croakAnim = 0;
  private frogBase = 1;
  private tex: Texture;

  constructor(frogTex: Texture) {
    this.tex = frogTex;
    this.sp.texture = frogTex;
    this.sp.anchor.set(0.5, 0.72);
  }

  layout(W: number, H: number, map: ArtMap) {
    this.frogBase = (H * 0.075) / this.tex.width;
    this.sp.scale.set(this.frogBase);
    const a = map(this.anchorF.x, this.anchorF.y);
    this.spots = [
      { x: a.x + W * 0.008, y: a.y + H * 0.004 },
      { x: a.x - W * 0.012, y: a.y + H * 0.002 },
      { x: a.x + W * 0.001, y: a.y - H * 0.012 },
    ];
    this.sp.position.set(this.spots[this.frogAt].x, this.spots[this.frogAt].y);
  }

  update(dt: number, t: number, wake?: (nx: number, ny: number, r?: number, s?: number) => void) {
    if (this.hopT >= 0) {
      this.hopT += dt;
      const k = Math.min(1, this.hopT / 0.55);
      const a = this.spots[this.hopFrom];
      const b = this.spots[this.hopTo];
      const lift = Math.sin(k * Math.PI);
      this.sp.position.set(a.x + (b.x - a.x) * k, a.y + (b.y - a.y) * k - lift * 20);
      this.sp.scale.set(this.frogBase * (1 - 0.1 * lift), this.frogBase * (1 + 0.16 * lift));
      this.sp.rotation = (b.x >= a.x ? 1 : -1) * 0.12 * lift;
      if (k >= 1) {
        this.hopT = -1;
        this.frogAt = this.hopTo;
        this.landT = 0.2;
        wake?.(this.anchorF.x, this.anchorF.y, 2.6, 0.5);
      }
    } else {
      this.nextHop -= dt;
      if (this.landT > 0) {
        this.landT -= dt;
        const q = this.landT / 0.2;
        this.sp.scale.set(this.frogBase * (1 + 0.1 * q), this.frogBase * (1 - 0.12 * q));
      } else {
        this.sp.scale.set(this.frogBase, this.frogBase * (1 + 0.014 * Math.sin(t * 2.3)));
        this.sp.rotation = 0;
      }
      if (this.nextHop <= 0) {
        this.nextHop = 6 + Math.random() * 8;
        this.hopFrom = this.frogAt;
        this.hopTo = (this.frogAt + 1 + ((Math.random() * (this.spots.length - 1)) | 0)) % this.spots.length;
        this.hopT = 0;
      }
    }

    // 鼓腮（不与跳跃/落地打架）
    this.croakT -= dt;
    if (this.croakT <= 0) {
      this.croakAnim = 0.7;
      this.croakT = 10 + Math.random() * 8;
      wake?.(this.anchorF.x, this.anchorF.y, 2.2, 0.4);
    }
    if (this.croakAnim > 0 && this.hopT < 0 && this.landT <= 0) {
      this.croakAnim -= dt;
      const k = 1 - Math.max(0, this.croakAnim) / 0.7;
      this.sp.scale.set(this.frogBase * (1 + 0.06 * Math.sin(k * Math.PI)));
    }
  }
}
