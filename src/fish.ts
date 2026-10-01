// 素材锦鲤 × MeshRope：贴图绑在 14 节脊柱点上，行波头定尾摆 + 转弯顺势内弯，真正的"甩尾"。
// 游动行为沿用：低通转向、滑行-加速、偶发窜游、避让光标与同伴。
import { Container, MeshRope, Point, Sprite, Texture } from 'pixi.js';

const ROPE_N = 18;

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
  readonly container = new Container();
  readonly shadow = new Sprite(getShadowTex());
  private mesh: MeshRope;
  private pts: Point[] = [];
  private s: number;
  private x: number;
  private y: number;
  private heading: number;
  private av = 0;
  private phase = Math.random() * 10;
  private speed: number;
  private dartT = 0;
  private nextDart = 4 + Math.random() * 8;

  constructor(koi: Texture, W = 1600, H = 1000) {
    // 绳厚度恒等于贴图高度（MeshRope 规矩），故脊柱坐标全用贴图像素，靠容器缩放到目标体长
    const hw = koi.width / 2;
    for (let i = 0; i < ROPE_N; i++) {
      this.pts.push(new Point(hw, 0));
    }
    this.mesh = new MeshRope({ texture: koi, points: this.pts });
    this.container.addChild(this.mesh);
    this.s = (100 + Math.random() * 50) / koi.width;
    this.container.scale.set(this.s);
    this.heading = Math.random() * Math.PI * 2;
    this.speed = 22 + Math.random() * 12;
    this.x = W * (0.2 + Math.random() * 0.6);
    this.y = H * (0.2 + Math.random() * 0.6);
    this.container.position.set(this.x, this.y);
    this.shadow.anchor.set(0.5);
    this.shadow.alpha = 0.26;
    this.shadow.scale.set((koi.width * this.s) / 50);
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
    // 摆尾频率：cruising ~1.5Hz，窜游 ~2.2Hz
    this.phase += dt * (9 + sp * 0.15);

    // 行波（贴图像素单位）：头端近定，幅值沿身体 k^1.7 递增到尾（≈体长 20%），
    // 全身一个波长以内（-i*0.4）才像鱼；转弯时身体向弯内倾（尾滞后）
    // 脊柱沿贴图 X 轴：头在 +x（u=0 对应贴图左缘），尾在 -x；摆动即横向 y 偏移
    const hw = this.mesh.texture.width / 2;
    const amp = this.mesh.texture.width * 0.2;
    const bendBase = -this.av * 380;
    for (let i = 0; i < ROPE_N; i++) {
      const k = i / (ROPE_N - 1);
      this.pts[i].x = hw - k * this.mesh.texture.width;
      this.pts[i].y = Math.sin(this.phase - i * 0.4) * amp * k ** 1.7 + bendBase * k * k;
    }

    this.container.position.set(this.x, this.y);
    // 素材已转为头朝 +x，游向 heading 直接对齐；头部随摆尾微偏（真鱼头会反向轻摆）
    this.container.rotation = this.heading + Math.sin(this.phase + Math.PI) * 0.045;
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
      const f = new Fish(koi);
      this.fishes.push(f);
      this.shadows.addChild(f.shadow);
      this.layer.addChild(f.container);
    }
  }

  update(dt: number, t: number, cursor: { x: number; y: number } | null, W: number, H: number) {
    for (const f of this.fishes) f.update(dt, t, cursor, this.fishes, W, H);
  }
}
