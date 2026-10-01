// 素材锦鲤 × MeshRope，运动模型移植自 fish-d 参考实现（MIT, github 锦鲤池塘项目）：
// 每尾独立 waveFreq/waveLen/waveEnv 渲染波 + swimCycle 随速加快 + cruise 突进滑行
// + turnBias 漫游 + 200px 怕人逃离 + 游泳区域多边形（避开原画山石/荷叶）+ 撞墙反射兜底。
import { Container, MeshRope, Point, Sprite, Texture } from 'pixi.js';
import type { Food } from './food';

const ROPE_N = 18;
const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
const wrapAngle = (a: number) => Math.atan2(Math.sin(a), Math.cos(a));

/** 游泳区域（背景原画的开阔水面，比例坐标，顺时针）。鱼只在多边形内活动。 */
const ZONE: [number, number][] = [
  [0.28, 0.06], [0.7, 0.04], [0.84, 0.16], [0.93, 0.4], [0.9, 0.7], [0.74, 0.77],
  [0.7, 0.93], [0.42, 0.94], [0.38, 0.7], [0.24, 0.56], [0.13, 0.4], [0.24, 0.14],
];
const ZONE_CX = ZONE.reduce((s, p) => s + p[0], 0) / ZONE.length;
const ZONE_CY = ZONE.reduce((s, p) => s + p[1], 0) / ZONE.length;

/** 到区域边界的最近距离与内向指引（指向区域质心，近凸多边形下等价于内向） */
function zoneDist(px: number, py: number, W: number, H: number): { d: number; nx: number; ny: number } {
  const pts = ZONE.map(([x, y]) => [x * W, y * H]);
  let inside = false;
  let best = Infinity;
  let qx = px;
  let qy = py;
  for (let i = 0; i < pts.length; i++) {
    const [ax, ay] = pts[i];
    const [bx, by] = pts[(i + 1) % pts.length];
    if (ay > py !== by > py && px < ((bx - ax) * (py - ay)) / (by - ay) + ax) inside = !inside;
    const ex = bx - ax;
    const ey = by - ay;
    const len2 = ex * ex + ey * ey || 1;
    const t = clamp(((px - ax) * ex + (py - ay) * ey) / len2, 0, 1);
    const cx2 = ax + ex * t;
    const cy2 = ay + ey * t;
    const d = Math.hypot(px - cx2, py - cy2);
    if (d < best) {
      best = d;
      qx = cx2;
      qy = cy2;
    }
  }
  const cx = ZONE_CX * W;
  const cy = ZONE_CY * H;
  let nx = cx - qx;
  let ny = cy - qy;
  const nl = Math.hypot(nx, ny) || 1;
  nx /= nl;
  ny /= nl;
  return { d: inside ? best : -best, nx, ny };
}

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
  private fedTimer = 0;

  constructor(koi: Texture, W = 1600, H = 1000) {
    // 绳厚度恒等于贴图高度（MeshRope 规矩），故脊柱坐标全用贴图像素，靠容器缩放到目标体长
    const hw = koi.width / 2;
    for (let i = 0; i < ROPE_N; i++) {
      this.pts.push(new Point(hw, 0));
    }
    this.mesh = new MeshRope({ texture: koi, points: this.pts });
    this.container.addChild(this.mesh);
    this.s = (80 + Math.random() * 40) / koi.width;
    this.container.scale.set(this.s);
    this.container.alpha = 0.72 + Math.random() * 0.28; // 深浅层次
    this.bodyLenPx = koi.width * this.s;
    this.baseSpeed = 34 + Math.random() * 26;
    this.waveEnv = koi.width * (0.1 + Math.random() * 0.05);
    this.heading = Math.random() * Math.PI * 2;
    this.speed = this.baseSpeed;
    // 出生点取区域质心附近的随机散布，避免开局压在山石上
    this.x = (ZONE_CX + (Math.random() - 0.5) * 0.4) * W;
    this.y = (ZONE_CY + (Math.random() - 0.5) * 0.4) * H;
    this.container.position.set(this.x, this.y);
    this.shadow.anchor.set(0.5);
    this.shadow.alpha = 0.26;
    this.shadow.scale.set(this.bodyLenPx / 50);
  }

  update(
    dt: number,
    t: number,
    cursor: { x: number; y: number } | null,
    others: Fish[],
    W: number,
    H: number,
    foods: Food[] | null = null,
    wake?: (nx: number, ny: number, r?: number, s?: number) => void,
  ) {
    this.fedTimer = Math.max(0, this.fedTimer - dt);
    // —— 期望转向 / 期望速度 ——
    let desiredTurn = 0;
    let desiredSpeed = this.baseSpeed;
    let speedResp = 1.8;
    let fleeing = false;

    // 怕人：200px 内掉头逃离（覆盖其他行为）
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

    if (!fleeing) {
      // 漫游：转向偏置缓变 + 突进-滑行节律
      this.turnBiasTimer -= dt;
      if (this.turnBiasTimer <= 0) {
        this.turnBiasTarget = (Math.random() - 0.5) * 0.26;
        this.turnBiasTimer = 1.8 + Math.random() * 3.2;
      }
      this.turnBias += (this.turnBiasTarget - this.turnBias) * Math.min(1, dt / 1.25);
      desiredTurn += this.turnBias;
      this.burstPhase += dt * this.burstRate;
      desiredSpeed = this.baseSpeed * (0.78 + 0.34 * (0.5 + 0.5 * Math.sin(this.burstPhase)));

      // 同伴分离：私人空间按双方体长定
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

    // —— 觅食（fish-d）：460px 内锁定最近食粒，2.4× 速度冲刺；吃到后短暂满足 ——
    let target: Food | null = null;
    let targetD = Infinity;
    if (this.fedTimer <= 0 && foods && !fleeing) {
      for (const f of foods) {
        if (f.dead) continue;
        const d = Math.hypot(f.x - this.x, f.y - this.y);
        if (d < targetD) {
          targetD = d;
          target = f;
        }
      }
      if (target && targetD < 460) {
        desiredTurn = clamp(wrapAngle(Math.atan2(target.y - this.y, target.x - this.x) - this.heading) * 2.6, -1.45, 1.45);
        const near = clamp((targetD - 14) / 110, 0.34, 1);
        desiredSpeed = this.baseSpeed * 2.4 * near;
        speedResp = 4.5;
      } else {
        target = null;
      }
    }

    // —— 游泳区域：靠近边界平滑转向内，出界强拉回（替代屏幕四边探针）——
    const zone = zoneDist(this.x, this.y, W, H);
    const SOFT = 42;
    if (zone.d < SOFT) {
      const w = zone.d <= 0 ? 1 : 1 - zone.d / SOFT;
      const turnToIn = wrapAngle(Math.atan2(zone.ny, zone.nx) - this.heading) * 3;
      desiredTurn = desiredTurn * (1 - w) + clamp(turnToIn, -1.45, 1.45) * w;
      desiredSpeed *= 1 - 0.25 * w;
    }

    // —— 转向动力学（fish-d 核心）：角速度上限 = min(行为上限, 速度/转弯半径) ——
    const minimumTurnRadius = this.bodyLenPx * 2.5;
    const speedPerSecond = Math.max(this.speed, this.baseSpeed * 0.42);
    const maxTurn = Math.min(fleeing ? 1.6 : 1.15, speedPerSecond / minimumTurnRadius);
    desiredTurn = clamp(desiredTurn, -maxTurn, maxTurn);
    const turnAccel = 4.0;
    this.turnRate += clamp(desiredTurn - this.turnRate, -turnAccel * dt, turnAccel * dt);
    this.turnRate = clamp(this.turnRate, -maxTurn, maxTurn);
    this.heading = wrapAngle(this.heading + this.turnRate * dt);

    // —— 速度动力学 ——
    this.speed += (desiredSpeed - this.speed) * Math.min(1, speedResp * dt);
    this.speed = clamp(this.speed, this.baseSpeed * 0.42, this.baseSpeed * 3.2);
    this.x += Math.cos(this.heading) * this.speed * dt;
    this.y += Math.sin(this.heading) * this.speed * dt;

    // —— 撞墙反射兜底（正常被区域约束时不会触发）——
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

    // —— 进食判定 ——
    if (target && !target.dead && Math.hypot(target.x - this.x, target.y - this.y) < 26) {
      target.dead = true;
      this.fedTimer = 0.9;
      wake?.(target.x / W, target.y / H, 1.6, 0.35);
    }

    // 摆尾节拍随速度（fish-d：swimCycle += (1.45 + speed_px_per_frame*4.5)*dt）
    this.swimCycle += (1.45 + (this.speed / 60) * 4.5) * dt;

    // 渲染波：沿脊柱的正弦行波（waveEnv 波幅 / waveFreq 频率 / waveLen 波长，均逐尾随机），
    // 尾梢 30% 额外鞭扫；转弯时身体向弯内倾
    const texw = this.mesh.texture.width;
    const hw = texw / 2;
    const bendBase = -this.turnRate * 500;
    for (let i = 0; i < ROPE_N; i++) {
      const k = i / (ROPE_N - 1);
      const extraTail = 1 + 0.45 * Math.max(0, (k - 0.7) / 0.3);
      this.pts[i].x = hw - k * texw;
      this.pts[i].y = Math.sin(this.swimCycle * this.waveFreq - k * this.waveLen) * this.waveEnv * k * k * extraTail + bendBase * k * k;
    }

    this.container.position.set(this.x, this.y);
    // 素材已转为头朝 +x，游向 heading 直接对齐
    this.container.rotation = this.heading;
    this.shadow.x = this.x + 8;
    this.shadow.y = this.y + 14;
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

  update(dt: number, t: number, cursor: { x: number; y: number } | null, W: number, H: number, foods: Food[] | null = null, wake?: (nx: number, ny: number, r?: number, s?: number) => void) {
    for (const f of this.fishes) f.update(dt, t, cursor, this.fishes, W, H, foods, wake);
  }
}
