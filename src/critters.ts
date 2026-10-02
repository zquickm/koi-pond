// 水墨小生灵（素材版）：蝌蚪连通域拆分各自变速窜游；
// 蜻蜓双曝残影振翅，造访式出场——从屏幕外飞入，点水几次后飞走，过一会儿再来。
import { Container, Graphics, Sprite, Texture } from 'pixi.js';

interface TadArt {
  tex: Texture;
  forward: number;
}

function angDiff(a: number, b: number) {
  return Math.atan2(Math.sin(a - b), Math.cos(a - b));
}

class Tadpole {
  readonly sp: Sprite;
  private fwd: number;
  private x: number;
  private y: number;
  private heading: number;
  private phase = Math.random() * 7;
  private speed: number;

  constructor(arts: TadArt[], idx: number, W: number, H: number) {
    const art = arts[idx % arts.length];
    this.fwd = art.forward;
    this.sp = new Sprite(art.tex);
    this.sp.anchor.set(0.5);
    const s = (26 + Math.random() * 16) / Math.max(art.tex.width, art.tex.height);
    if (Math.random() < 0.5) {
      // 纵向镜像：朝向取反
      this.sp.scale.set(s, -s);
      this.fwd = -this.fwd;
    } else {
      this.sp.scale.set(s);
    }
    this.heading = Math.random() * Math.PI * 2;
    this.speed = 9 + Math.random() * 7;
    this.x = W * (0.15 + Math.random() * 0.7);
    this.y = H * (0.15 + Math.random() * 0.7);
    this.sp.position.set(this.x, this.y);
  }

  update(dt: number, t: number, W: number, H: number) {
    this.heading += Math.sin(t * 0.3 + this.phase) * 0.4 * dt + Math.sin(t * 0.13 + this.phase * 2) * 0.3 * dt;
    // 蝌蚪是"蹬一下滑一下"的节奏
    const sp = this.speed * (0.35 + 1.1 * Math.abs(Math.sin(t * 1.4 + this.phase)) ** 2);
    this.x += Math.cos(this.heading) * sp * dt;
    this.y += Math.sin(this.heading) * sp * dt;
    if (this.x < 50 || this.x > W - 50) {
      this.heading = Math.PI - this.heading;
      this.x = Math.max(50, Math.min(W - 50, this.x));
    }
    if (this.y < 50 || this.y > H - 50) {
      this.heading = -this.heading;
      this.y = Math.max(50, Math.min(H - 50, this.y));
    }
    this.phase += dt * 2;
    this.sp.position.set(this.x, this.y);
    this.sp.rotation = this.heading - this.fwd + Math.sin(t * 6 + this.phase) * 0.08;
  }
}

type Wake = (nx: number, ny: number, r?: number, s?: number) => void;

class Dragonfly {
  readonly root = new Container();
  private base: Sprite;
  private echo: Sprite; // 振翅残影
  private s: number;
  private x = -200;
  private y = -200;
  private heading = 0;
  private speed: number;
  private phase = Math.random() * 9;
  private flap = Math.random() * 10;
  private dartT = 0;
  private nextDart = 4 + Math.random() * 6;
  // 造访状态机：gone(场外歇) → fly(飞入+漫游+点水) → exit(飞离) → gone……
  private state: 'gone' | 'fly' | 'exit' = 'gone';
  private waitT = 1.5 + Math.random() * 4; // 距下次飞入
  private stayT = 0; // 在场剩余时长
  private dipsLeft = 0; // 本次造访还点几次水
  private seasonalOn = true; // 夏季白天才活动（main.ts 按月份/时刻传入）

  /** 季节/时段开关：关闭时不再飞入，在场的老个体直接飞走 */
  setSeasonal(on: boolean) {
    this.seasonalOn = on;
  }
  // 点水状态机：cruise → 俯冲(0.45s) → 触水(0.12s) → 拉起(0.45s) → cruise
  private dipT = -1;
  private nextDip = 3.5 + Math.random() * 3.5;

  constructor(tex: Texture) {
    this.s = 60 / tex.width;
    this.base = new Sprite(tex);
    this.base.anchor.set(0.5);
    this.base.scale.set(this.s);
    this.echo = new Sprite(tex);
    this.echo.anchor.set(0.5);
    this.echo.alpha = 0.32;
    this.echo.scale.set(this.s);
    this.root.addChild(this.base, this.echo);
    this.speed = 55 + Math.random() * 20;
    this.root.visible = false;
  }

  update(dt: number, t: number, W: number, H: number, wake?: Wake) {
    this.phase += dt;
    this.flap += dt * 42;
    const margin = 130;
    const inside = this.x > margin && this.x < W - margin && this.y > margin && this.y < H - margin;
    let sp = this.speed;
    let dipOff = 0;
    let dipScale = 1;

    if (this.state === 'gone') {
      this.waitT -= dt;
      if (this.waitT <= 0 && this.seasonalOn) {
        // 从随机一边的屏幕外飞入
        const side = (Math.random() * 4) | 0;
        const off = 80;
        if (side === 0) { this.x = Math.random() * W; this.y = -off; }
        else if (side === 1) { this.x = W + off; this.y = Math.random() * H; }
        else if (side === 2) { this.x = Math.random() * W; this.y = H + off; }
        else { this.x = -off; this.y = Math.random() * H; }
        this.heading = Math.atan2(H / 2 - this.y, W / 2 - this.x) + (Math.random() - 0.5) * 0.8;
        this.stayT = 9 + Math.random() * 8;
        this.dipsLeft = 2 + ((Math.random() * 3) | 0);
        this.nextDip = 2.5 + Math.random() * 2.5;
        this.nextDart = 4 + Math.random() * 4;
        this.state = 'fly';
        this.root.visible = true;
      }
    } else if (this.state === 'exit') {
      // 直线飞离，不转向不点水；出画后转入场外歇息
      sp *= 1.35;
      if (this.x < -90 || this.x > W + 90 || this.y < -90 || this.y > H + 90) {
        this.state = 'gone';
        this.waitT = 6 + Math.random() * 10;
        this.root.visible = false;
      }
    } else if (!inside) {
      // 进场段：朝画面中心飞
      const to = Math.atan2(H / 2 - this.y, W / 2 - this.x);
      this.heading += angDiff(to, this.heading) * 1.5 * dt;
    } else {
      // 在场漫游：冲刺 + 点水；待够时长或点完次数就飞走
      this.stayT -= dt;
      this.nextDart -= dt;
      if (this.nextDart <= 0) {
        this.dartT = 0.5;
        this.nextDart = 6 + Math.random() * 8;
        this.heading += (Math.random() - 0.5) * 2.4;
      }
      if (this.dartT > 0) {
        this.dartT -= dt;
        sp *= 2.6;
      }
      this.nextDip -= dt;
      if (this.nextDip <= 0 && this.dartT <= 0 && this.dipsLeft > 0) {
        this.dipT = 0;
        this.dipsLeft--;
      }
      if ((this.stayT <= 0 || this.dipsLeft <= 0 || !this.seasonalOn) && this.dipT < 0) {
        // 朝最近的边缘飞走
        const d = [
          [this.x, Math.PI],
          [W - this.x, 0],
          [this.y, -Math.PI / 2],
          [H - this.y, Math.PI / 2],
        ].sort((a, b) => a[0] - b[0])[0];
        this.heading = d[1] + (Math.random() - 0.5) * 0.5;
        this.state = 'exit';
      }
    }

    // 点水：俯冲→触水（双环涟漪）→拉起；期间减速、航向冻结
    if (this.dipT >= 0) {
      this.dipT += dt;
      const DUR = 1.02; // 0.45 下潜 + 0.12 触水 + 0.45 拉起
      const p = this.dipT / DUR;
      if (p >= 1) {
        this.dipT = -1;
        this.nextDip = 4 + Math.random() * 4;
      } else {
        sp *= 0.3;
        const lift = Math.sin(p * Math.PI);
        dipOff = lift * 26;
        dipScale = 1 - 0.16 * lift;
        const touched = p >= 0.5 && this.dipT - dt <= 0.5 * DUR;
        if (touched && wake) {
          wake(this.x / W, this.y / H, 2.2, 0.5);
          wake(this.x / W + 0.004, this.y / H + 0.004, 1.6, 0.35);
        }
      }
    }

    this.x += Math.cos(this.heading) * sp * dt;
    this.y += Math.sin(this.heading) * sp * dt + Math.sin(t * 1.7 + this.phase) * 6 * dt;
    this.root.position.set(this.x, this.y + dipOff);
    const rot = this.heading + Math.PI / 2 + Math.sin(t * 2.5 + this.phase) * 0.07;
    this.base.rotation = rot;
    this.echo.rotation = rot + Math.sin(this.flap) * 0.06;
    const wob = 1 + 0.1 * Math.sin(this.flap * 0.5);
    this.echo.scale.set(this.s * wob * dipScale, this.s * dipScale);
    this.base.scale.set(this.s * dipScale);
    this.echo.alpha = (0.22 + 0.14 * Math.abs(Math.sin(this.flap * 0.5))) * dipScale;
  }
}

/** 萤火虫光点：不是真的萤火虫——一团团缓慢游荡的黄绿色光晕。
 *  按中国真实情况设计（2026-10-03）：盛夏夜里同屏十来只（好点位量级），春末/初秋零星，
 *  冬季无；作息在 main.ts 里管（日落后渐现、午夜后渐稀）。 */
export class Fireflies {
  readonly container = new Container();
  private flies: {
    sp: Sprite; ax: number; ay: number; ra: number; ph: number; sa: number; sb: number; pr: number; big: boolean;
  }[] = [];
  private W = 800;
  private H = 600;

  constructor() {
    const c = document.createElement('canvas');
    c.width = c.height = 64;
    const g = c.getContext('2d')!;
    const grd = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    grd.addColorStop(0, 'rgba(240,252,190,0.9)'); // 黄绿光（真实萤火虫的光色）
    grd.addColorStop(0.3, 'rgba(233,246,150,0.45)');
    grd.addColorStop(0.65, 'rgba(230,240,130,0.12)');
    grd.addColorStop(1, 'rgba(228,238,120,0)');
    g.fillStyle = grd;
    g.fillRect(0, 0, 64, 64);
    const glow = Texture.from(c);
    this.container.blendMode = 'add';
    // 草丛簇中心（v8 画面的岸缘草丛/荷叶边），最后 3 只飘水面
    const clusters: [number, number][] = [
      [0.045, 0.42], [0.09, 0.8], [0.05, 0.62], [0.88, 0.8],
    ];
    for (let i = 0; i < 12; i++) {
      const overWater = i >= 9;
      const cl = clusters[i % clusters.length];
      const jit = () => Math.random() - 0.5;
      const ax = overWater ? 0.35 + Math.random() * 0.4 : cl[0] + jit() * 0.03;
      const ay = overWater ? 0.32 + Math.random() * 0.38 : cl[1] + jit() * 0.03;
      const sp = new Sprite(glow);
      sp.anchor.set(0.5);
      this.container.addChild(sp);
      this.flies.push({
        sp,
        ax,
        ay,
        ra: overWater ? 0.06 + Math.random() * 0.05 : 0.02 + Math.random() * 0.035,
        ph: Math.random() * Math.PI * 2,
        sa: 0.1 + Math.random() * 0.18,
        sb: 0.16 + Math.random() * 0.22,
        pr: 1.3 + Math.random() * 1.3, // 每 2.4-4.8 秒一闪，真实萤火虫的节奏
        big: Math.random() < 0.25,
      });
    }
  }

  layout(W: number, H: number) {
    this.W = W;
    this.H = H;
  }

  /** n = 本季出现的只数上限（按季节传：夏 12 / 春秋 4 / 冬 0），只有前 n 只会亮 */
  update(t: number, k: number, n: number) {
    this.container.visible = k > 0.01 && n > 0;
    for (let i = 0; i < this.flies.length; i++) {
      const f = this.flies[i];
      // 缓慢无规律游荡：双频正弦叠加绕簇心漂
      const x = (f.ax + Math.sin(t * f.sa + f.ph) * f.ra + Math.sin(t * f.sb * 0.6 + f.ph * 2.7) * f.ra * 0.5) * this.W;
      const y = (f.ay + Math.cos(t * f.sb + f.ph * 1.3) * f.ra * 0.7 + Math.sin(t * f.sa * 0.8 + f.ph) * f.ra * 0.35) * this.H;
      f.sp.position.set(x, y);
      const glow = Math.max(0, Math.sin(t * f.pr + f.ph * 3));
      f.sp.alpha = i < n ? k * (0.14 + 0.86 * glow * glow) : 0;
      const s = (f.big ? 1.15 : 0.8) * (0.75 + 0.4 * glow);
      f.sp.scale.set(s);
    }
  }
}

/** 季节降雪（冬季）：统一的小白点（硬边），缓飘落到水面上化成融痕；k 控制强弱。
 *
 *  统一规格——90 颗同尺寸(≈5px)、同浓淡、同一张硬边贴图：不分远近大小，不做模糊/渐隐，
 *  也不做透视放大，每颗从生到死都是同样一个小圆点。
 *  层次只留给"落水"：每颗飘到水面就消失，落点留一圈冷白融痕（落在岸上不化，接着往下飘）。
 *  静水（calm）时不画扩散的圈，只留一个原地淡掉的小融点。 */
const SNOW_SIZE = 5; // 圆点直径(px)
const SNOW_ALPHA = 0.92;
const SNOW_TINT = 0xf4faff; // 近乎白，只往冷里带一丝丝
type Flake = { sp: Sprite; x: number; y: number; ty: number; vx: number; vy: number; ph: number; sw: number; life: number; ttl: number };
type Melt = { x: number; y: number; r: number; v: number; a: number; dot: boolean };

/** 圆点贴图：硬边实心白圆——只在最外 1px 做抗锯齿，整颗没有渐隐（反馈：雪不要模糊效果） */
function snowDot(S = 64) {
  const c = document.createElement('canvas');
  c.width = c.height = S;
  const g = c.getContext('2d')!;
  const h = S / 2;
  const grd = g.createRadialGradient(h, h, 0, h, h, h);
  grd.addColorStop(0, 'rgba(254,255,255,1)');
  grd.addColorStop(0.9, 'rgba(252,253,255,1)');
  grd.addColorStop(0.97, 'rgba(240,247,255,0.88)'); // 抗锯齿过渡，别再加宽
  grd.addColorStop(1, 'rgba(230,241,252,0)');
  g.fillStyle = grd;
  g.fillRect(0, 0, S, S);
  return c;
}

export class Snowfall {
  readonly container = new Container();
  /** 静水（?calm=1）：落下的雪不再化成一圈圈波纹，只留一个慢慢淡掉的小融点 */
  calm = false;
  private g = new Graphics(); // 落水融痕（画在雪粒之下，贴着水面）
  private melts: Melt[] = [];
  private flakes: Flake[] = [];
  private W = 800;
  private H = 600;
  private tex: Texture;

  constructor(private count = 90) {
    this.tex = Texture.from(snowDot());
    this.container.addChild(this.g);
  }

  layout(W: number, H: number) {
    this.W = W;
    this.H = H;
  }

  /** onLand(nx, ny) 由调用方判断落点是不是水面；返回 false（岸上）就接着飘 */
  update(dt: number, t: number, k: number, onLand?: (nx: number, ny: number) => boolean) {
    this.container.visible = k > 0.02;
    if (k <= 0.02) return;
    while (this.flakes.length < this.count) {
      const f: Flake = { sp: new Sprite(this.tex), ...this.spawn() };
      f.sp.anchor.set(0.5);
      f.sp.tint = SNOW_TINT;
      f.sp.scale.set(SNOW_SIZE / this.tex.width);
      this.container.addChild(f.sp);
      this.flakes.push(f);
    }
    for (const f of this.flakes) {
      f.life += dt;
      f.x += (f.vx + Math.sin(t * 0.62 + f.ph) * f.sw) * dt;
      f.y += f.vy * dt;
      // 飘到落点：在水面上化成一圈融痕，岸上则接着飘
      if (f.y >= f.ty) {
        if (!onLand || onLand(f.x / this.W, f.y / this.H)) {
          this.melts.push(
            this.calm
              ? { x: f.x, y: f.y, r: 2.5, v: 0, a: 0.42, dot: true }
              : { x: f.x, y: f.y, r: 1, v: 16 + SNOW_SIZE * 1.7, a: 0.5, dot: false },
          );
          Object.assign(f, this.spawn());
        } else {
          f.ty += this.H * (0.15 + Math.random() * 0.35);
        }
      } else if (f.life > f.ttl || f.y > this.H + 40 || f.x < -60 || f.x > this.W + 60) {
        Object.assign(f, this.spawn());
      }
      f.sp.position.set(f.x, f.y);
      f.sp.alpha = k * SNOW_ALPHA * Math.min(1, f.life * 1.6);
    }
    // 融痕：由小圈扩散、淡出（冷白，贴着水面）
    for (const m of this.melts) {
      m.r += m.v * dt;
      m.a -= (m.dot ? 0.5 : 0.8) * dt;
    }
    if (this.melts.length) this.melts = this.melts.filter((m) => m.a > 0);
    this.g.clear();
    for (const m of this.melts) {
      const style = { color: 0xdce9fa, alpha: Math.min(0.55, m.a) };
      if (m.dot) this.g.circle(m.x, m.y, m.r).fill(style);
      else this.g.circle(m.x, m.y, m.r).stroke({ ...style, width: 1 });
    }
  }

  private spawn(): Omit<Flake, 'sp'> {
    const y = Math.random() * this.H * 1.1 - this.H * 0.1;
    return {
      x: Math.random() * (this.W + 60) - 30,
      y,
      ty: y + this.H * (0.15 + Math.random() * 0.6), // 落点=水面上的随机深度
      vx: (Math.random() - 0.5) * 10,
      vy: 13 + Math.random() * 8,
      ph: Math.random() * Math.PI * 2,
      sw: 4,
      life: 0,
      ttl: 30 + Math.random() * 30,
    };
  }
}

/** 季节降雨（春·夏）：斜落雨丝 + 落点水花；强度 k 由季节氛围场控制（渐入渐出）。
 *  真实感手法（网上通用做法）：远/中/近三层景深、阵风摆动、雨丝头亮尾淡的伪运动模糊、
 *  落地溅起小水珠（抛物线回落）、强度一阵一阵地脉动。 */
export class Rainfall {
  readonly container = new Container();
  private g = new Graphics();
  private t = 0; // 自走时钟：阵风/脉动用
  private drops: { x: number; y: number; vy: number; len: number; ty: number; z: number; sway: number }[] = [];
  private splashes: { x: number; y: number; r: number; a: number }[] = [];
  private pops: { x: number; y: number; vx: number; vy: number }[] = [];
  private W = 800;
  private H = 600;

  constructor(private count = 90) {
    this.container.addChild(this.g);
  }

  layout(W: number, H: number) {
    this.W = W;
    this.H = H;
  }

  /** 只读快照（?debug 核对用）：当前雨丝数 */
  get dropCount() {
    return this.drops.length;
  }

  update(dt: number, k: number, onSplash?: (nx: number, ny: number) => void) {
    this.t += dt;
    this.g.clear();
    // 强度脉动：真实的雨一阵一阵，不会匀速下
    const pulse = 0.8 + 0.14 * Math.sin(this.t * 0.9) + 0.06 * Math.sin(this.t * 0.37 + 2);
    this.container.visible = k > 0.02 || this.splashes.length > 0 || this.pops.length > 0;
    if (this.container.visible === false) return;
    const target = Math.round(this.count * k * pulse);
    while (this.drops.length < target) this.drops.push(this.spawn());
    if (this.drops.length > target) this.drops.length = target;
    // 阵风：倾角缓慢漂移，偶尔小到接近垂直甚至微反向——真实的风不会匀速斜落
    const gust = 0.13 + 0.08 * Math.sin(this.t * 0.21) + 0.05 * Math.sin(this.t * 0.53 + 1.7);
    for (const d of this.drops) {
      d.y += d.vy * dt;
      d.x += d.vy * (gust + d.sway) * dt;
      if (d.y >= d.ty) {
        // 近景大滴才配水花圈；多数落地只溅起几颗小水珠（抛物线回落）
        if (d.z > 0.55) this.splashes.push({ x: d.x, y: d.ty, r: 1, a: 0.5 * k });
        for (let n = (Math.random() * 2) | 0; n >= 0; n--) {
          this.pops.push({
            x: d.x,
            y: d.ty,
            vx: (Math.random() - 0.5) * 70,
            vy: -(30 + Math.random() * 90) * (0.4 + d.z * 0.6),
          });
        }
        if (onSplash && Math.random() < 0.2) onSplash(d.x / this.W, d.ty / this.H);
        Object.assign(d, this.spawn());
      }
    }
    for (const s of this.splashes) {
      s.r += 34 * dt;
      s.a -= 3.2 * dt;
    }
    this.splashes = this.splashes.filter((s) => s.a > 0);
    for (const p of this.pops) {
      p.vy += 900 * dt; // 重力回落
      p.x += p.vx * dt;
      p.y += p.vy * dt;
    }
    this.pops = this.pops.filter((p) => p.vy < 260 && p.y < this.H + 20); // 落回水面即消失
    // 雨丝分三档景深；每滴画"淡长尾+亮短头"两段，近似运动模糊
    const baseA = Math.min(1, 0.55 * k + 0.08);
    const bands = [
      { z0: 0, z1: 1 / 3, w: 1, am: 0.45 },
      { z0: 1 / 3, z1: 2 / 3, w: 1.25, am: 0.7 },
      { z0: 2 / 3, z1: 1.01, w: 1.5, am: 1 },
    ];
    for (const b of bands) {
      for (const d of this.drops) {
        if (d.z < b.z0 || d.z >= b.z1) continue;
        const dx = (gust + d.sway) * d.len;
        this.g.moveTo(d.x - dx * 0.55, d.y - d.len * 0.55).lineTo(d.x - dx, d.y - d.len);
      }
      this.g.stroke({ color: 0x5f7580, alpha: Math.min(1, baseA * b.am * 0.35), width: b.w * 0.8 });
      for (const d of this.drops) {
        if (d.z < b.z0 || d.z >= b.z1) continue;
        const dx = (gust + d.sway) * d.len;
        this.g.moveTo(d.x, d.y).lineTo(d.x - dx * 0.55, d.y - d.len * 0.55);
      }
      this.g.stroke({ color: 0x5f7580, alpha: Math.min(1, baseA * b.am), width: b.w });
    }
    for (const s of this.splashes) this.g.circle(s.x, s.y, s.r);
    this.g.stroke({ color: 0x5f7580, alpha: Math.min(1, 0.5 * k + 0.06), width: 1.25 });
    for (const p of this.pops) this.g.circle(p.x, p.y, 1);
    this.g.stroke({ color: 0x5f7580, alpha: Math.min(1, 0.4 * k + 0.08), width: 1 });
  }

  private spawn() {
    const z = Math.random(); // 景深：0=远 1=近
    return {
      x: Math.random() * (this.W + 140) - 70,
      y: -20 - Math.random() * this.H,
      vy: 300 + z * 260 + Math.random() * 60,
      len: 12 + z * 22 + Math.random() * 6,
      ty: Math.random() * this.H,
      z,
      sway: (Math.random() - 0.5) * 0.12,
    };
  }
}

/** 冬季点击互动：点哪儿哪儿下雪——撒一把雪粒、原地积成堆，同一处连点 5 下长出小雪人。
 *  冬天鱼在冰下吃不到食，点击从投喂换成玩雪（2026-10-03 用户点子）。 */
export class SnowPiles {
  readonly container = new Container();
  private blob: Texture;
  private piles: { x: number; y: number; lvl: number; blob: Sprite }[] = [];
  private men: Container[] = [];
  private flakes: { sp: Sprite; x: number; y: number; vx: number; vy: number; life: number }[] = [];

  constructor() {
    const c = document.createElement('canvas');
    c.width = c.height = 64;
    const g = c.getContext('2d')!;
    const grd = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    grd.addColorStop(0, 'rgba(250,253,255,0.95)');
    grd.addColorStop(0.6, 'rgba(246,250,254,0.55)');
    grd.addColorStop(1, 'rgba(242,248,253,0)');
    g.fillStyle = grd;
    g.fillRect(0, 0, 64, 64);
    this.blob = Texture.from(c);
  }

  /** 点了一下：撒一把雪 + 并入附近的堆加高；第 5 下堆出小雪人 */
  click(x: number, y: number) {
    for (let i = 0; i < 9; i++) {
      const sp = new Sprite(this.blob);
      sp.anchor.set(0.5);
      sp.scale.set(0.1 + Math.random() * 0.06);
      this.container.addChild(sp);
      this.flakes.push({
        sp,
        x: x + (Math.random() - 0.5) * 120,
        y: y - 60 - Math.random() * 120,
        vx: (Math.random() - 0.5) * 24,
        vy: 60 + Math.random() * 50,
        life: 0.9 + Math.random() * 0.7,
      });
    }
    const MERGE = 70;
    let p = this.piles.find((q) => Math.hypot(q.x - x, q.y - y) < MERGE);
    if (!p) {
      // ponytail: 上限 24 堆（雪人不限），满了新位置不再积雪；要更多改这里
      if (this.piles.length >= 24) return;
      const sp = new Sprite(this.blob);
      sp.anchor.set(0.5, 0.78);
      this.container.addChild(sp);
      p = { x, y, lvl: 0, blob: sp };
      this.piles.push(p);
    }
    p.lvl++;
    p.blob.position.set(p.x, p.y);
    const r = 10 + p.lvl * 4.5;
    p.blob.scale.set(r / 32, (r * 0.62) / 32);
    p.blob.alpha = 0.85;
    if (p.lvl === 5) this.buildMan(p);
  }

  /** 三球小雪人：软白球叠罗汉 + 墨点眼扣 + 枯枝臂 + 一点朱砂围巾 */
  private buildMan(p: { x: number; y: number }) {
    const man = new Container();
    const mk = (r: number, x: number, y: number) => {
      const s = new Sprite(this.blob);
      s.anchor.set(0.5);
      s.position.set(x, y);
      s.scale.set(r / 32);
      man.addChild(s);
    };
    mk(24, 0, -18);
    mk(16, 0, -44);
    mk(10.5, 0, -63);
    const g = new Graphics();
    g.circle(-3.4, -65, 1.5).circle(3.4, -65, 1.5).fill({ color: 0x37474f }); // 眼
    g.circle(0, -47, 1.4).circle(0, -41, 1.4).fill({ color: 0x37474f }); // 扣子
    g.moveTo(-13, -46).lineTo(-26, -56).moveTo(13, -46).lineTo(26, -56).stroke({ color: 0x5d4a3a, width: 1.4 }); // 枯枝臂
    g.arc(0, -54.5, 4.6, Math.PI * 0.15, Math.PI * 0.85).stroke({ color: 0xb0524a, width: 2.2 }); // 朱砂围巾
    man.addChild(g);
    man.position.set(p.x, p.y + 4);
    this.container.addChild(man);
    this.men.push(man);
  }

  update(dt: number) {
    for (const f of this.flakes) {
      f.life -= dt;
      f.x += f.vx * dt;
      f.y += f.vy * dt;
      f.vy += 60 * dt;
      f.sp.position.set(f.x, f.y);
      f.sp.alpha = Math.max(0, Math.min(1, f.life * 1.6));
    }
    this.flakes = this.flakes.filter((f) => {
      if (f.life > 0) return true;
      f.sp.destroy();
      return false;
    });
  }

  /** 离开冬季/窗口重排时清场（雪堆雪人都是屏幕坐标） */
  clear() {
    for (const p of this.piles) p.blob.destroy();
    for (const m of this.men) m.destroy();
    this.piles = [];
    this.men = [];
  }
}

export class Critters {
  readonly water = new Container(); // 蝌蚪（鱼层之下）
  readonly air = new Container(); // 蜻蜓（最上层）
  private tads: Tadpole[] = [];
  private dfly: Dragonfly;

  constructor(arts: TadArt[], dflyTex: Texture) {
    for (let i = 0; i < 8; i++) {
      const tad = new Tadpole(arts, i, 1600, 1000);
      this.tads.push(tad);
      this.water.addChild(tad.sp);
    }
    this.dfly = new Dragonfly(dflyTex);
    this.air.addChild(this.dfly.root);
  }

  update(dt: number, t: number, W: number, H: number, wake?: Wake, dflyOn = true) {
    this.dfly.setSeasonal(dflyOn);
    for (const tad of this.tads) tad.update(dt, t, W, H);
    this.dfly.update(dt, t, W, H, wake);
  }
}
