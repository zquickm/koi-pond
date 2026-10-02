// 鱼食：从鼠标/指定点落入水中的金黄小颗粒（大小/配色/入水 pop 参考 fish-d 的鱼食设计），
// 溅圈、缓沉微漂、临消失淡出；被鱼吃掉后 dead。
import { Container, Graphics } from 'pixi.js';

export class Food {
  readonly g = new Graphics();
  x: number;
  y: number;
  dead = false;
  private vy = 90 + Math.random() * 40;
  private inWater = false;
  private targetY: number;
  private life = 15; // 全池吸引后，最远的鱼也需要时间赶到
  private r = 1.9 + Math.random() * 1.4;
  private pop = 1;

  constructor(x: number, y: number) {
    this.x = x + (Math.random() - 0.5) * 46;
    this.y = y + (Math.random() - 0.5) * 20;
    this.targetY = this.y + 18 + Math.random() * 24;
  }

  update(dt: number, W: number, H: number, wake?: (nx: number, ny: number, r?: number, s?: number) => void) {
    this.pop = Math.max(0, this.pop - dt * 4.5); // 出现时撑大一下再缩回（fish-d 同款）
    if (!this.inWater) {
      this.y += this.vy * dt;
      if (this.y >= this.targetY) {
        this.inWater = true;
        wake?.(this.x / W, this.y / H, 1.6, 0.35);
      }
    } else {
      this.y += 4.5 * dt; // 缓沉
      this.x += Math.sin(this.y * 0.05) * 2.5 * dt; // 微漂
      this.life -= dt;
      if (this.life <= 0 || this.y > H) this.dead = true;
    }
    this.g.clear();
    if (!this.dead) {
      const fade = this.life < 1 ? Math.max(0, this.life) : 1;
      const r = this.r * (1 + this.pop * 0.55);
      this.g.circle(0, 0, r).fill({ color: 0xe0b858, alpha: 0.92 * fade });
      this.g.circle(-r * 0.3, -r * 0.35, r * 0.45).fill({ color: 0xfff3c4, alpha: 0.55 * fade });
      if (!this.inWater) this.g.circle(0, -7, 1.4).fill({ color: 0xe0b858, alpha: 0.35 * fade });
    }
    this.g.position.set(this.x, this.y);
  }
}

export class FoodLayer {
  readonly container = new Container();
  readonly foods: Food[] = [];

  spawn(x: number, y: number, count = 4) {
    for (let i = 0; i < count; i++) {
      const f = new Food(x, y);
      this.foods.push(f);
      this.container.addChild(f.g);
    }
  }

  update(dt: number, W: number, H: number, wake?: (nx: number, ny: number, r?: number, s?: number) => void) {
    for (let i = this.foods.length - 1; i >= 0; i--) {
      const f = this.foods[i];
      f.update(dt, W, H, wake);
      if (f.dead) {
        this.container.removeChild(f.g);
        f.g.destroy();
        this.foods.splice(i, 1);
      }
    }
  }
}
