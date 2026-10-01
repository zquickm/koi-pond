// 鱼食：从空中落到指定水面点，入水溅圈、缓沉微漂、超时消散；被鱼吃掉后 dead。
import { Container, Graphics } from 'pixi.js';

export class Food {
  readonly g = new Graphics();
  x: number;
  y: number;
  dead = false;
  private vy = 90 + Math.random() * 40;
  private inWater = false;
  private targetY: number;
  private life = 9;

  constructor(x: number, y: number) {
    this.x = x + (Math.random() - 0.5) * 46;
    this.y = -12;
    this.targetY = Math.max(40, y + (Math.random() - 0.5) * 40);
  }

  update(dt: number, W: number, H: number, wake?: (nx: number, ny: number, r?: number, s?: number) => void) {
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
      this.g.circle(0, 0, 3.2).fill({ color: 0x33413a, alpha: 0.85 });
      if (!this.inWater) this.g.circle(0, -7, 1.4).fill({ color: 0x33413a, alpha: 0.35 });
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
