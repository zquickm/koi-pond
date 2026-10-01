// 素材锦鲤 × MeshRope，运动模型移植自 fish-d 参考实现（MIT, github 锦鲤池塘项目）：
// 每尾独立 waveFreq/waveLen/waveEnv 渲染波 + swimCycle 随速加快 + cruise 突进滑行
// + turnBias 漫游 + 200px 怕人逃离 + 探针避边（最强威胁覆盖漫游）+ 撞墙反射朝向。
// 绳脊柱坐标用贴图像素，容器缩放到目标体长。
import { Container, MeshRope, Point, Sprite, Texture } from 'pixi.js';

const ROPE_N = 18;
const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
const wrapAngle = (a: number) => Math.atan2(Math.sin(a), Math.cos(a));

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

export class Fish {
  readonly container = new Container();
  readonly shadow = new Sprite(getShadowTex());
  private mesh: MeshRope;
  private pts: Point[] = [];
  private s: number;
  private bodyLenPx: number;
  private x: number;
  private y: number;
  private heading: number;
  private turnRate = 0;
  private speed: number;
  private baseSpeed: number;
  private swimCycle = Math.random() * Math.PI * 2;
  private waveFreq = 1 + Math.random() * 0.55;
  private waveLen = 4.3 + Math.random() * 2.3;
  private waveEnv: number;
  private burstRate = 0.3 + Math.random() * 0.35;
  private burstPhase = Math.random() * Math.PI * 2;
  private turnBias = 0;
  private turnBiasTarget = (Math.random() - 0.5) * 0.2;
  private turnBiasTimer = 1.5 + Math.random() * 2.5;

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
    this.container.alpha = 0.72 + Math.random() * 0.28; // 深浅层次
    this.bodyLenPx = koi.width * this.s;
    this.baseSpeed = 34 + Math.random() * 26;
    this.waveEnv = koi.width * (0.1 + Math.random() * 0.05);
    this.heading = Math.random() * Math.PI * 2;
    this.speed = this.baseSpeed;
    this.x = W * (0.2 + Math.random() * 0.6);
    this.y = H * (0.2 + Math.random() * 0.6);
    this.container.position.set(this.x, this.y);
    this.shadow.anchor.set(0.5);
    this.shadow.alpha = 0.26;
    this.shadow.scale.set(this.bodyLenPx / 50);
  }

  update(dt: number, t: number, cursor: { x: number; y: number } | null, others: Fish[], W: number, H: number) {
    // —— 边界威胁探针（fish-d consider）：取最强的一侧 ——
    const fx = Math.cos(this.heading);
    const fy = Math.sin(this.heading);
    const safeMargin = Math.max(50, this.bodyLenPx);
    // 最小转弯半径 = 2.5×体长（fish-d turnRadius），探距与它挂钩才能提前转
    const minimumTurnRadius = this.bodyLenPx * 2.5;
    const probeDistance = Math.max(minimumTurnRadius * 1.15, this.speed * 0.9);
    let threat = 0;
    let inwardX = 0;
    let inwardY = 0;
    const consider = (room: number, comp: number, ix: number, iy: number) => {
      if (comp <= 0.02) return;
      const tt = (room - safeMargin) / (comp * probeDistance);
      if (tt < 1) {
        const w = 1 - Math.max(0, tt);
        if (w > threat) {
          threat = w;
          inwardX = ix;
          inwardY = iy;
        }
      }
    };
    consider(W - this.x, fx, -1, 0);
    consider(this.x, -fx, 1, 0);
    consider(H - this.y, fy, 0, -1);
    consider(this.y, -fy, 0, 1);
    const edgeThreat = clamp(threat, 0, 1);

    // —— 怕人：200px 内掉头逃离（覆盖其他行为）——
    let desiredTurn = 0;
    let desiredSpeed = this.baseSpeed;
    let speedResp = 1.8;
    let fleeing = false;
    if (cursor) {
      const dx = this.x - cursor.x;
      const dy = this.y - cursor.y;
      const d2 = dx * dx + dy * dy;
      if (d2 < 40000 && d2 > 1) {
        fleeing = true;
        desiredTurn = clamp(wrapAngle(Math.atan2(dy, dx) - this.heading) * 2.7, -1.35, 1.35);
        desiredSpeed = this.baseSpeed * 2.8;
        speedResp = 4.5;
      }
    }

    // —— 边缘行为：强转向内、覆盖漫游（fish-d：威胁 >0.04 即接管）——
    if (edgeThreat > 0.04 && !fleeing) {
      desiredTurn = clamp(wrapAngle(Math.atan2(inwardY, inwardX) - this.heading) * 3, -1.45, 1.45);
      desiredSpeed = this.baseSpeed * (1 - edgeThreat * 0.2);
    } else if (!fleeing) {
      // —— 漫游：转向偏置缓变 + 突进-滑行节律 ——
      this.turnBiasTimer -= dt;
      if (this.turnBiasTimer <= 0) {
        this.turnBiasTarget = (Math.random() - 0.5) * 0.26;
        this.turnBiasTimer = 1.8 + Math.random() * 3.2;
      }
      this.turnBias += (this.turnBiasTarget - this.turnBias) * Math.min(1, dt / 1.25);
      desiredTurn += this.turnBias;
      this.burstPhase += dt * this.burstRate;
      desiredSpeed = this.baseSpeed * (0.78 + 0.34 * (0.5 + 0.5 * Math.sin(this.burstPhase)));

      // 同伴分离：私人空间按双方体长定（edge 时跳过，fish-d 同款）
      let sepX = 0;
      let sepY = 0;
      let sepP = 0;
      for (const o of others) {
        // ponytail: O(n²) 分离检测，鱼 >50 条时换空间哈希
        if (o === this) continue;
        const dx = this.x - o.x;
        const dy = this.y - o.y;
        const d = Math.hypot(dx, dy);
        if (d < 0.001) continue;
        const personal = (this.bodyLenPx + o.bodyLenPx) * 0.3;
        if (d < personal) {
          const pressure = 1 - d / personal;
          sepX += (dx / d) * pressure;
          sepY += (dy / d) * pressure;
          sepP = Math.max(sepP, pressure);
        }
      }
      if (sepP > 0.02) {
        desiredTurn += wrapAngle(Math.atan2(sepY, sepX) - this.heading) * Math.min(1.45, sepP * 3);
      }
    }

    // —— 转向动力学（fish-d 核心）：角速度上限 = min(行为上限, 速度/转弯半径)。
    // 转弯必须与速度几何相容，大弧慢转才是锦鲤的从容；行为上限：巡航 1.15 / 逃离 1.6 ——
    const speedPerSecond = Math.max(this.speed, this.baseSpeed * 0.42);
    const maxTurn = Math.min(fleeing ? 1.6 : 1.15, speedPerSecond / minimumTurnRadius);
    desiredTurn = clamp(desiredTurn, -maxTurn, maxTurn);
    const turnAccel = 2.6;
    this.turnRate += clamp(desiredTurn - this.turnRate, -turnAccel * dt, turnAccel * dt);
    this.turnRate = clamp(this.turnRate, -maxTurn, maxTurn);
    this.heading = wrapAngle(this.heading + this.turnRate * dt);

    // —— 速度动力学 ——
    speedResp = desiredSpeed > this.speed ? 1.8 : 1.15;
    if (fleeing) speedResp = 4.5;
    this.speed += (desiredSpeed - this.speed) * Math.min(1, speedResp * dt);
    this.speed = clamp(this.speed, this.baseSpeed * 0.42, this.baseSpeed * 3.2);
    this.x += Math.cos(this.heading) * this.speed * dt;
    this.y += Math.sin(this.heading) * this.speed * dt;

    // —— 撞墙反射：位置钳回 + 朝向镜面反射 + 角速度清零（fish-d 同款，杜绝贴边滑）——
    const B = 6;
    if (this.x < B) {
      this.x = B;
      this.heading = Math.atan2(Math.sin(this.heading), Math.abs(Math.cos(this.heading)));
      this.turnRate = 0;
    } else if (this.x > W - B) {
      this.x = W - B;
      this.heading = Math.atan2(Math.sin(this.heading), -Math.abs(Math.cos(this.heading)));
      this.turnRate = 0;
    }
    if (this.y < B) {
      this.y = B;
      this.heading = Math.atan2(Math.abs(Math.sin(this.heading)), Math.cos(this.heading));
      this.turnRate = 0;
    } else if (this.y > H - B) {
      this.y = H - B;
      this.heading = Math.atan2(-Math.abs(Math.sin(this.heading)), Math.cos(this.heading));
      this.turnRate = 0;
    }

    // 摆尾节拍随速度（fish-d：swimCycle += (1.45 + speed_px_per_frame*4.5)*dt）
    this.swimCycle += (1.45 + (this.speed / 60) * 4.5) * dt;

    // 渲染波：沿脊柱的正弦行波（waveEnv 波幅 / waveFreq 频率 / waveLen 波长，均逐尾随机），
    // 尾梢 30% 额外鞭扫补足鱼尾摆度；转弯时身体向弯内倾
    const texw = this.mesh.texture.width;
    const hw = texw / 2;
    const bendBase = -this.turnRate * 500;
    for (let i = 0; i < ROPE_N; i++) {
      const k = i / (ROPE_N - 1);
      const extraTail = 1 + 0.6 * Math.max(0, (k - 0.7) / 0.3);
      this.pts[i].x = hw - k * texw;
      this.pts[i].y = Math.sin(this.swimCycle * this.waveFreq - k * this.waveLen) * this.waveEnv * k * k * extraTail + bendBase * k * k;
    }

    this.container.position.set(this.x, this.y);
    // 素材已转为头朝 +x，游向 heading 直接对齐
    this.container.rotation = this.heading;
    this.shadow.x = this.x + 10;
    this.shadow.y = this.y + 18;
    this.shadow.rotation = this.heading;
  }
}

export class School {
  readonly shadows = new Container();
  readonly layer = new Container();
  private fishes: Fish[] = [];

  constructor(texs: Texture[], count: number) {
    for (let i = 0; i < count; i++) {
      const f = new Fish(texs[i % texs.length]);
      this.fishes.push(f);
      this.shadows.addChild(f.shadow);
      this.layer.addChild(f.container);
    }
  }

  update(dt: number, t: number, cursor: { x: number; y: number } | null, W: number, H: number) {
    for (const f of this.fishes) f.update(dt, t, cursor, this.fishes, W, H);
  }
}
