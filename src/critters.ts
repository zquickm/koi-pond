// 水墨小生灵：蝌蚪群（水中游弋）+ 蜻蜓（低空盘旋、偶发点水）。参照水墨册页。
import { Container, Graphics } from 'pixi.js';

class Tadpole {
  readonly g = new Graphics();
  private x: number;
  private y: number;
  private heading: number;
  private phase = Math.random() * 7;
  private speed: number;
  private size: number;

  constructor(W: number, H: number) {
    this.x = W * (0.15 + Math.random() * 0.7);
    this.y = H * (0.15 + Math.random() * 0.7);
    this.heading = Math.random() * Math.PI * 2;
    this.size = 4.5 + Math.random() * 3;
    this.speed = 7 + Math.random() * 6;
  }

  update(dt: number, t: number, W: number, H: number) {
    this.heading += Math.sin(t * 0.3 + this.phase) * 0.4 * dt + Math.sin(t * 0.13 + this.phase * 2) * 0.3 * dt;
    this.x += Math.cos(this.heading) * this.speed * dt;
    this.y += Math.sin(this.heading) * this.speed * dt;
    if (this.x < 50 || this.x > W - 50) {
      this.heading = Math.PI - this.heading;
      this.x = Math.max(50, Math.min(W - 50, this.x));
    }
    if (this.y < 50 || this.y > H - 50) {
      this.heading = -this.heading;
      this.y = Math.max(50, Math.min(H - 50, this.y));
    }
    this.phase += dt * (4 + this.speed * 0.3);
    this.draw();
  }

  private draw() {
    const g = this.g;
    g.clear();
    const s = this.size;
    // 墨团头
    g.ellipse(0, 0, s, s * 0.78).fill('rgba(44,53,49,0.88)');
    // 细尾：后向 4 点渐细，末端摆动
    const L = s * 3.4;
    let px = -s;
    let py = 0;
    const widths = [3.2, 2.4, 1.6, 1.0];
    for (let i = 1; i <= 4; i++) {
      const tt = i / 4;
      const nx = -s - L * tt;
      const ny = Math.sin(this.phase - tt * 2.5) * L * 0.35 * tt;
      g.moveTo(px, py).lineTo(nx, ny).stroke({ color: 'rgba(44,53,49,0.75)', width: widths[i - 1], cap: 'round' });
      px = nx;
      py = ny;
    }
    // 眼
    g.circle(s * 0.35, -s * 0.2, s * 0.14).fill('rgba(10,16,14,0.9)');
  }
}

class Dragonfly {
  readonly g = new Graphics();
  private x: number;
  private y: number;
  private heading: number;
  private speed: number;
  private phase = Math.random() * 9;
  private flap = Math.random() * 10;
  private dartT = 0;
  private nextDart = 4 + Math.random() * 6;

  constructor(W: number, H: number) {
    this.x = W * (0.3 + Math.random() * 0.4);
    this.y = H * (0.3 + Math.random() * 0.4);
    this.heading = Math.random() * Math.PI * 2;
    this.speed = 26 + Math.random() * 14;
  }

  update(dt: number, t: number, W: number, H: number, wake?: (nx: number, ny: number) => void) {
    this.heading += Math.sin(t * 0.23 + this.phase) * 0.5 * dt;
    const margin = 130;
    if (this.x < margin || this.x > W - margin || this.y < margin || this.y > H - margin) {
      const to = Math.atan2(H / 2 - this.y, W / 2 - this.x);
      this.heading += Math.atan2(Math.sin(to - this.heading), Math.cos(to - this.heading)) * 1.5 * dt;
    }
    this.nextDart -= dt;
    if (this.nextDart <= 0) {
      this.dartT = 0.5;
      this.nextDart = 6 + Math.random() * 8;
      this.heading += (Math.random() - 0.5) * 2.4;
    }
    let sp = this.speed;
    if (this.dartT > 0) {
      this.dartT -= dt;
      sp *= 2.6;
    }
    this.x += Math.cos(this.heading) * sp * dt;
    this.y += Math.sin(this.heading) * sp * dt + Math.sin(t * 1.7 + this.phase) * 6 * dt;
    this.phase += dt;
    this.flap += dt * 34;
    // 蜻蜓点水
    if (wake && this.dartT > 0 && Math.random() < dt * 3) wake(this.x / W, this.y / H);
    this.draw();
  }

  private draw() {
    const g = this.g;
    g.clear();
    const fx = Math.cos(this.heading);
    const fy = Math.sin(this.heading);
    const px = -fy;
    const py = fx;
    const flapA = Math.sin(this.flap) * 0.3;

    // 四翅：胸向两侧展开，透明墨染 + 翅尖墨点
    for (const side of [-1, 1]) {
      for (const along of [-1, 1]) {
        const bx = this.x + fx * along * 3;
        const by = this.y + fy * along * 3;
        const a = this.heading + side * (1.45 + flapA * 0.3) + along * 0.12 * side;
        const len = along < 0 ? 24 : 21;
        const tx = bx + Math.cos(a) * len;
        const ty = by + Math.sin(a) * len;
        g.moveTo(bx, by).lineTo(tx, ty).stroke({ color: 'rgba(246,250,248,0.5)', width: 7, cap: 'round' });
        g.moveTo(bx, by).lineTo(tx, ty).stroke({ color: 'rgba(70,80,84,0.35)', width: 1 });
        g.circle(bx + Math.cos(a) * len * 0.85, by + Math.sin(a) * len * 0.85, 1.4).fill('rgba(44,53,49,0.6)');
      }
    }
    // 分节尾
    let px2 = this.x;
    let py2 = this.y;
    for (let i = 1; i <= 5; i++) {
      const sag = Math.sin(this.phase * 6 - i) * 1.2;
      const nx = this.x - fx * (i * 7) + px * sag;
      const ny = this.y - fy * (i * 7) + py * sag;
      g.moveTo(px2, py2).lineTo(nx, ny).stroke({ color: 'rgba(58,68,72,0.85)', width: 3.6 - i * 0.4, cap: 'round' });
      px2 = nx;
      py2 = ny;
    }
    // 头胸
    g.circle(this.x + fx * 2, this.y + fy * 2, 4.6).fill('#3a4448');
    g.circle(this.x + fx * 4.5, this.y + fy * 4.5, 3.2).fill('#2c3531');
  }
}

export class Critters {
  readonly water = new Container(); // 蝌蚪（鱼层之下）
  readonly air = new Container(); // 蜻蜓（最上层）
  private tads: Tadpole[] = [];
  private dfly: Dragonfly;

  constructor() {
    for (let i = 0; i < 8; i++) {
      const t = new Tadpole(1600, 1000);
      this.tads.push(t);
      this.water.addChild(t.g);
    }
    this.dfly = new Dragonfly(1600, 1000);
    this.air.addChild(this.dfly.g);
  }

  update(dt: number, t: number, W: number, H: number, wake?: (nx: number, ny: number) => void) {
    for (const tad of this.tads) tad.update(dt, t, W, H);
    this.dfly.update(dt, t, W, H, wake);
  }
}
