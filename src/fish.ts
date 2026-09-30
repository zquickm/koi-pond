// 素材锦鲤：水墨册页原图抠图直接上屏，旋转+滑行游动（保画味优先，不做脊柱弯曲）。
// 游动行为沿用：低通转向、滑行-加速、偶发窜游、避让光标与同伴。
import { Container, Sprite, Texture } from 'pixi.js';

let shadowTex: Texture | null = null;
function getShadowTex(): Texture {
  if (shadowTex) return shadowTex;
  const cv = document.createElement('canvas');
  cv.width = 64;
  cv.height = 64;
  const g = cv.getContext('2d')!;
  const rg = g.createRadialGradient(32, 32, 2, 32, 32, 30);
  rg.addColorStop(0, 'rgba(20,45,38,0.42)');
  rg.addColorStop(1, 'rgba(20,45,38,0)');
  g.fillStyle = rg;
  g.fillRect(0, 0, 64, 64);
  shadowTex = Texture.from(cv);
  return shadowTex;
}

function angDiff(a: number, b: number) {
  return Math.atan2(Math.sin(a - b), Math.cos(a - b));
}

export class Fish {
  readonly sp: Sprite;
  readonly shadow = new Sprite(getShadowTex());
  private x: number;
  private y: number;
  private heading: number;
  private av = 0;
  private phase = Math.random() * 10;
  private speed: number;
  private dartT = 0;
  private nextDart = 4 + Math.random() * 8;

  constructor(koi: Texture, idx: number, W = 1600, H = 1000) {
    this.sp = new Sprite(koi);
    this.sp.anchor.set(0.5);
    // 贴图鱼头朝上：目标体长 100~150px 按贴图高缩放；半数镜像去重复感
    const s = (100 + Math.random() * 50) / koi.height;
    this.sp.scale.set(s, Math.random() < 0.5 ? -s : s);
    this.heading = Math.random() * Math.PI * 2;
    this.speed = 22 + Math.random() * 12;
    this.x = W * (0.2 + Math.random() * 0.6);
    this.y = H * (0.2 + Math.random() * 0.6);
    this.sp.position.set(this.x, this.y);
    this.shadow.anchor.set(0.5);
    this.shadow.alpha = 0.26;
  }

  update(dt: number, t: number, cursor: { x: number; y: number } | null, others: Fish[], W: number, H: number) {
    let steer = Math.sin(t * 0.13 + this.phase) * 0.3;
    if (cursor) {
      const dx = this.x - cursor.x;
      const dy = this.y - cursor.y;
      const d = Math.hypot(dx, dy);
      if (d < 130 && d > 1) steer += angDiff(Math.atan2(dy, dx), this.heading) * ((130 - d) / 130) * 1.4;
    }
    for (const o of others) {
      // ponytail: O(n²) 分离检测，鱼 >50 条时换空间哈希
      if (o === this) continue;
      const dx = this.x - o.x;
      const dy = this.y - o.y;
      const d2 = dx * dx + dy * dy;
      if (d2 < 8100 && d2 > 1) {
        const d = Math.sqrt(d2);
        steer += angDiff(Math.atan2(dy, dx), this.heading) * (1 - d / 90) * 1.2;
      }
    }
    const margin = 115; // 别游上边框山石
    if (this.x < margin || this.x > W - margin || this.y < margin || this.y > H - margin) {
      steer += angDiff(Math.atan2(H / 2 - this.y, W / 2 - this.x), this.heading) * 2.5;
    }
    this.av += (steer - this.av) * Math.min(1, dt * 2.5);
    this.heading += this.av * dt;

    const pulse = 0.55 + 0.45 * (0.5 + 0.5 * Math.sin(t * 0.5 + this.phase)) ** 1.5;
    let sp = this.speed * pulse;
    this.nextDart -= dt;
    if (this.nextDart <= 0) {
      this.dartT = 0.8;
      this.nextDart = 6 + Math.random() * 8;
    }
    if (this.dartT > 0) {
      this.dartT -= dt;
      sp *= 2.1;
    }
    this.x += Math.cos(this.heading) * sp * dt;
    this.y += Math.sin(this.heading) * sp * dt;
    this.x = Math.max(8, Math.min(W - 8, this.x));
    this.y = Math.max(8, Math.min(H - 8, this.y));
    this.phase += dt * (1.6 + sp * 0.02);

    this.sp.position.set(this.x, this.y);
    // 贴图鱼头朝上（-π/2），游向 heading 需补偿 +π/2；再加一点摆动感
    this.sp.rotation = this.heading + Math.PI / 2 + Math.sin(t * 1.8 + this.phase) * 0.06;
    this.shadow.x = this.x + 10;
    this.shadow.y = this.y + 18;
    this.shadow.rotation = this.heading;
  }
}

export class School {
  readonly shadows = new Container();
  readonly layer = new Container();
  private fishes: Fish[] = [];

  constructor(koi: Texture, count: number) {
    for (let i = 0; i < count; i++) {
      const f = new Fish(koi, i);
      this.fishes.push(f);
      this.shadows.addChild(f.shadow);
      this.layer.addChild(f.sp);
    }
  }

  update(dt: number, t: number, cursor: { x: number; y: number } | null, W: number, H: number) {
    for (const f of this.fishes) f.update(dt, t, cursor, this.fishes, W, H);
  }
}
