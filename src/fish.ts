// 素材锦鲤 × MeshRope，运动模型移植自 fish-d 参考实现（MIT, github 锦鲤池塘项目）：
// 每尾独立 waveFreq/waveLen/waveEnv 渲染波 + swimCycle 随速加快 + cruise 突进滑行
// + turnBias 漫游 + 200px 怕人逃离 + 水面围栏（pondzone.ts 的水岸多边形，避开山石/荷叶）+ 撞墙反射兜底。
import { Container, MeshRope, Point, Sprite, Texture } from 'pixi.js';
import type { Food } from './food';
import type { PondZone } from './pondzone';

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
  rg.addColorStop(0, 'rgba(30,60,50,0.3)');
  rg.addColorStop(1, 'rgba(30,60,50,0)');
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
  private sprintMul = 0.85 + Math.random() * 0.45; // 每条鱼的急性子：抢食冲刺倍率
  private breathT = 4 + Math.random() * 14; // 鱼呼吸：随机浮上换气，荡开一圈大小随机的涟漪
  school: { leader: SchoolLeader; frac: number; side: number; slotPhase: number } | null = null;
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
  private zone: PondZone | null;

  constructor(koi: Texture, zone: PondZone | null = null) {
    this.zone = zone;
    // 绳厚度恒等于贴图高度（MeshRope 规矩），故脊柱坐标全用贴图像素，靠容器缩放到目标体长
    const hw = koi.width / 2;
    for (let i = 0; i < ROPE_N; i++) {
      this.pts.push(new Point(hw, 0));
    }
    this.mesh = new MeshRope({ texture: koi, points: this.pts });
    this.container.addChild(this.mesh);
    this.s = (64 + Math.random() * 32) / koi.width;
    this.container.scale.set(this.s);
    this.container.alpha = 0.86 + Math.random() * 0.14; // 深浅层次（保持清晰，不发虚）
    this.bodyLenPx = koi.width * this.s;
    this.baseSpeed = 26 + Math.random() * 24; // 平时缓慢漫游，只有抢食才快（每条鱼快慢不同）
    this.waveEnv = koi.width * (0.1 + Math.random() * 0.05);
    this.heading = Math.random() * Math.PI * 2;
    this.speed = this.baseSpeed;
    // 出生点取水面内余量充足处，避免开局就压在荷叶/山石上
    const sp = zone ? zone.randomPoint(this.bodyLenPx * 0.6 + 14) : { x: 800, y: 500 };
    this.x = sp.x;
    this.y = sp.y;
    this.container.position.set(this.x, this.y);
    this.shadow.anchor.set(0.5);
    this.shadow.alpha = 0.17;
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
    // 呼吸涟漪：随机间隔、随机大小，从鱼身位置荡开
    this.breathT -= dt;
    if (this.breathT <= 0) {
      this.breathT = 9 + Math.random() * 18;
      wake?.(this.x / W, this.y / H, 2.6 + Math.random() * 2.8, 0.16 + Math.random() * 0.16);
    }
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
      if (this.school) {
        // —— 成群（fish-d schools 移植）：沿虚拟头鱼的轨迹排队跟随 ——
        // 优先级：吃食/逃离都在本块之外覆盖；轨迹点 = 弧长排队位 + 横向偏移 + 慢波动
        const sc = this.school;
        const s = sc.leader;
        const avail = Math.max(80, s.arcLive - s.trail[0].a);
        const queueLen = Math.min(avail, 900);
        const back = Math.min((0.05 + 0.9 * sc.frac) * queueLen, Math.max(30, avail - 30));
        const tp = trailPoint(s, back + Math.sin(t * 0.35 + sc.slotPhase) * 16);
        const fwd = s.curSpeed;
        let tx = this.x;
        let ty = this.y;
        let fwdx = Math.cos(s.heading);
        let fwdy = Math.sin(s.heading);
        if (tp) {
          const side = sc.side + Math.cos(t * 0.29 + sc.slotPhase) * 10;
          tx = tp.x - tp.ty * side;
          ty = tp.y + tp.tx * side;
          fwdx = tp.tx;
          fwdy = tp.ty;
        }
        const ex = tx - this.x;
        const ey = ty - this.y;
        const err = Math.hypot(ex, ey) || 1;
        const corr = Math.min(err * 1.2, 90);
        const dvx = fwdx * fwd + (ex / err) * corr;
        const dvy = fwdy * fwd + (ey / err) * corr;
        desiredTurn = clamp(wrapAngle(Math.atan2(dvy, dvx) - this.heading) * 2.2, -1.2, 1.2);
        desiredSpeed = Math.min(Math.hypot(dvx, dvy), fwd * 3.2, this.baseSpeed * 3.4);
        speedResp = 2.2;
      } else {
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
    }

    // —— 觅食（fish-d）：食物吸引鱼群——有食在附近时大胆上前，压过怕人逃离 ——
    // 吸引半径随屏幅走（至少半屏），远处的鱼也会赶来
    let target: Food | null = null;
    let targetD = Infinity;
    if (this.fedTimer <= 0 && foods) {
      const lure = Math.hypot(W, H); // 全池有效：任何角落的鱼感知到食粒都会赶来
      for (const f of foods) {
        if (f.dead) continue;
        const d = Math.hypot(f.x - this.x, f.y - this.y);
        if (d < targetD) {
          targetD = d;
          target = f;
        }
      }
      if (target && targetD < lure) {
        desiredTurn = clamp(wrapAngle(Math.atan2(target.y - this.y, target.x - this.x) - this.heading) * 2.6, -1.45, 1.45);
        const near = clamp((targetD - 14) / 110, 0.34, 1);
        // 冲刺带每条鱼自己的急性子系数，抢食时快慢分明
        desiredSpeed = this.baseSpeed * 2.75 * this.sprintMul * near;
        speedResp = 4.5;
      } else {
        target = null;
      }
    }

    // —— 水面围栏：离岸近了平滑转向水面内侧、减速；被逼到贴岸时改用更小的转弯半径 ——
    // need 按体长留整身余量（含摆尾外扩），保证整条鱼都在水里
    const need = this.bodyLenPx * 0.6 + 10;
    let shoreD = Infinity;
    if (this.zone) {
      const q = this.zone.probe(this.x, this.y);
      shoreD = q.d;
      const SOFT = need + this.bodyLenPx * 1.8; // 提前量要盖过转弯半径，否则鱼会顶到岸才转
      if (q.d < SOFT) {
        const w = clamp(1 - Math.max(0, q.d - need) / (SOFT - need), 0, 1);
        const turnToIn = wrapAngle(Math.atan2(q.ny, q.nx) - this.heading) * 3;
        desiredTurn = desiredTurn * (1 - w) + clamp(turnToIn, -1.45, 1.45) * w;
        // 贴岸时降速：越近越慢，给转向留时间
        desiredSpeed = Math.min(desiredSpeed, this.baseSpeed * (1 + 1.6 * (1 - w)));
      }
    }
    const avoiding = shoreD < need * 1.6; // 需要紧急避岸（允许更小的转弯半径）

    // —— 转向动力学（fish-d 核心）：角速度上限 = min(行为上限, 速度/转弯半径) ——
    const minimumTurnRadius = this.bodyLenPx * (avoiding ? 1.1 : 2.5);
    const speedPerSecond = Math.max(this.speed, this.baseSpeed * 0.42);
    const maxTurn = Math.min(fleeing || avoiding ? 1.6 : 1.15, speedPerSecond / minimumTurnRadius);
    desiredTurn = clamp(desiredTurn, -maxTurn, maxTurn);
    const turnAccel = 4.0;
    this.turnRate += clamp(desiredTurn - this.turnRate, -turnAccel * dt, turnAccel * dt);
    this.turnRate = clamp(this.turnRate, -maxTurn, maxTurn);
    this.heading = wrapAngle(this.heading + this.turnRate * dt);

    // —— 速度动力学 ——
    this.speed += (desiredSpeed - this.speed) * Math.min(1, speedResp * dt);
    this.speed = clamp(this.speed, this.baseSpeed * 0.42, this.baseSpeed * 3.6);
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

    // —— 兜底：万一被逃窜/挤蹭到岸上，沿法线推回水里 ——
    // 常规限幅滑回（不"瞬移"）；真被挤上岸（d<0）则一步退回岸边，绝不让鱼停在荷叶上
    if (this.zone) {
      const q = this.zone.probe(this.x, this.y);
      if (q.d < need) {
        const push = q.d < 0 ? -q.d + 1 : Math.min(need - q.d, 3);
        this.x += q.nx * push;
        this.y += q.ny * push;
      }
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
  /** 只读快照（调试/无头核对用） */
  get pose() {
    return { x: this.x, y: this.y, len: this.bodyLenPx, h: this.heading };
  }
}

/** 虚拟头鱼（fish-d schools 移植）：绕着家点缓慢巡游，留下一条轨迹供成员排队跟随 */
class SchoolLeader {
  x = 0;
  y = 0;
  heading = Math.random() * Math.PI * 2;
  curSpeed = 20;
  trail: { x: number; y: number; a: number }[] = [];
  arc = 0;
  arcLive = 0;
  private base = 14 + Math.random() * 8;
  private side = Math.random() < 0.5 ? 1 : -1;
  private escaped = false;
  private bias = (Math.random() - 0.5) * 0.036;
  private biasT = 4 + Math.random() * 7;
  private homePhase = Math.random() * Math.PI * 2;
  private homeDrift = ((Math.PI * 2) / 900) * (0.85 + Math.random() * 0.3);
  private surgePhase = Math.random() * 7;

  constructor(private hx: number, private hy: number) {}

  update(dt: number, W: number, H: number, pond: PondZone) {
    if (!this.trail.length) {
      this.x = W * this.hx;
      this.y = H * this.hy;
      this.trail.push({ x: this.x, y: this.y, a: 0 });
    }
    this.homePhase += this.homeDrift * dt;
    this.biasT -= dt;
    if (this.biasT <= 0) {
      this.bias = (Math.random() - 0.5) * 0.036;
      this.biasT = 4 + Math.random() * 7;
    }
    // 家点绕画面中心慢转，头鱼追家点；临岸时带侧偏急转避开（左右轮换防兜圈）
    const c = Math.cos(this.homePhase);
    const sn = Math.sin(this.homePhase);
    const ox = this.hx - 0.5;
    const oy = this.hy - 0.5;
    const hx = W * (0.5 + ox * c - oy * sn);
    const hy = H * (0.5 + ox * sn + oy * c);
    const px = this.x + Math.cos(this.heading) * 240;
    const py = this.y + Math.sin(this.heading) * 240;
    const q = pond.probe(px, py);
    const urgent = q.d <= 0 ? 1 : Math.max(0, 1 - q.d / 170);
    let limit = 0.72;
    if (urgent > 0) {
      if (q.d <= 0 && !this.escaped) this.side = -this.side;
      this.escaped = q.d <= 0;
      const want = Math.atan2(hy - this.y, hx - this.x) + this.side * 0.85;
      limit = 0.72 + urgent * 2.7;
      this.heading += clamp(wrapAngle(want - this.heading), -limit * dt, limit * dt);
    } else {
      this.escaped = false;
      this.heading += this.bias * dt;
    }
    this.surgePhase += dt * 0.45;
    const surge = 0.84 + 0.3 * (0.5 + 0.5 * Math.sin(this.surgePhase));
    this.curSpeed = this.base * surge;
    this.x += Math.cos(this.heading) * this.curSpeed * dt;
    this.y += Math.sin(this.heading) * this.curSpeed * dt;
    // 轨迹：每挪 ≥7px 记一个点，总弧长超过 1250 就丢最老的
    const tail = this.trail[this.trail.length - 1];
    const mv = Math.hypot(this.x - tail.x, this.y - tail.y);
    this.arcLive = tail.a + mv;
    if (mv >= 7) {
      this.arc += mv;
      this.trail.push({ x: this.x, y: this.y, a: this.arc });
      while (this.trail.length > 2 && this.arc - this.trail[0].a > 1250) this.trail.shift();
      this.arcLive = this.arc;
    }
  }
}

/** 沿头鱼轨迹回退 back 弧长处的点（含切线方向）——成员鱼的排队位 */
function trailPoint(s: SchoolLeader, back: number): { x: number; y: number; tx: number; ty: number } | null {
  const T = s.trail;
  const n = T.length;
  if (n < 2) return null;
  const want = s.arcLive - back;
  if (want <= T[0].a) {
    const dx = T[1].x - T[0].x;
    const dy = T[1].y - T[0].y;
    const m = Math.hypot(dx, dy) || 1;
    return { x: T[0].x, y: T[0].y, tx: dx / m, ty: dy / m };
  }
  for (let i = n - 1; i > 0; i--) {
    if (T[i - 1].a <= want && want <= T[i].a) {
      const seg = Math.max(1e-6, T[i].a - T[i - 1].a);
      const k = (want - T[i - 1].a) / seg;
      const dx = T[i].x - T[i - 1].x;
      const dy = T[i].y - T[i - 1].y;
      const m = Math.hypot(dx, dy) || 1;
      return { x: T[i - 1].x + dx * k, y: T[i - 1].y + dy * k, tx: dx / m, ty: dy / m };
    }
  }
  return null;
}

export class School {
  readonly shadows = new Container();
  readonly layer = new Container();
  private fishes: Fish[] = [];
  private leaders: SchoolLeader[] = [];
  private pond: PondZone | null;

  constructor(texs: Texture[], count: number, zone: PondZone | null = null) {
    this.pond = zone;
    for (let i = 0; i < count; i++) {
      const f = new Fish(texs[i % texs.length], zone);
      this.fishes.push(f);
      this.shadows.addChild(f.shadow);
      this.layer.addChild(f.container);
    }
    // 成群（fish-d）：40% 独游，其余编入 3 队跟随虚拟头鱼
    if (zone) {
      const homes: [number, number][] = [
        [0.32, 0.35],
        [0.62, 0.3],
        [0.48, 0.62],
      ];
      this.leaders = homes.map(([hx, hy]) => new SchoolLeader(hx, hy));
      let ni = 0;
      for (const f of this.fishes) {
        if (Math.random() < 0.4) continue;
        f.school = {
          leader: this.leaders[ni++ % this.leaders.length],
          frac: Math.random(),
          side: (Math.random() - 0.5) * 110,
          slotPhase: Math.random() * Math.PI * 2,
        };
      }
    }
  }

  update(dt: number, t: number, cursor: { x: number; y: number } | null, W: number, H: number, foods: Food[] | null = null, wake?: (nx: number, ny: number, r?: number, s?: number) => void) {
    if (this.pond) for (const l of this.leaders) l.update(dt, W, H, this.pond);
    for (const f of this.fishes) f.update(dt, t, cursor, this.fishes, W, H, foods, wake);
  }

  /** 只读快照（调试/无头核对用） */
  get poses() {
    return this.fishes.map((f) => f.pose);
  }
}
