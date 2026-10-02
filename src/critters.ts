// 水墨小生灵（素材版）：蝌蚪连通域拆分各自变速窜游；
// 蜻蜓双曝残影振翅，造访式出场——从屏幕外飞入，点水几次后飞走，过一会儿再来。
import { Container, Sprite, Texture } from 'pixi.js';

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

/** 萤火虫光点：不是真的萤火虫——一团团缓慢游荡的黄色光晕。
 *  夜间出现（main.ts 按小时传 nightK），多数绕草丛簇无规律飞，偶尔两只飘在水面上。 */
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
    grd.addColorStop(0, 'rgba(255,246,190,0.9)');
    grd.addColorStop(0.3, 'rgba(255,232,140,0.45)');
    grd.addColorStop(0.65, 'rgba(255,222,120,0.12)');
    grd.addColorStop(1, 'rgba(255,220,120,0)');
    g.fillStyle = grd;
    g.fillRect(0, 0, 64, 64);
    const glow = Texture.from(c);
    this.container.blendMode = 'add';
    // 草丛簇中心（v8 画面的岸缘草丛/荷叶边），最后两只飘水面
    const clusters: [number, number][] = [
      [0.045, 0.42], [0.09, 0.8], [0.05, 0.62], [0.88, 0.8],
    ];
    for (let i = 0; i < 17; i++) {
      const overWater = i >= 14;
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
        pr: 0.45 + Math.random() * 0.8,
        big: Math.random() < 0.4,
      });
    }
  }

  layout(W: number, H: number) {
    this.W = W;
    this.H = H;
  }

  update(t: number, nightK: number) {
    this.container.visible = nightK > 0.01;
    for (const f of this.flies) {
      // 缓慢无规律游荡：双频正弦叠加绕簇心漂
      const x = (f.ax + Math.sin(t * f.sa + f.ph) * f.ra + Math.sin(t * f.sb * 0.6 + f.ph * 2.7) * f.ra * 0.5) * this.W;
      const y = (f.ay + Math.cos(t * f.sb + f.ph * 1.3) * f.ra * 0.7 + Math.sin(t * f.sa * 0.8 + f.ph) * f.ra * 0.35) * this.H;
      f.sp.position.set(x, y);
      const glow = Math.max(0, Math.sin(t * f.pr + f.ph * 3));
      f.sp.alpha = nightK * (0.14 + 0.86 * glow * glow);
      const s = (f.big ? 1.15 : 0.8) * (0.75 + 0.4 * glow);
      f.sp.scale.set(s);
    }
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
