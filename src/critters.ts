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

/** 季节降雪（冬季）：白圆点，三层景深（远景小 / 中景 / 近景大而虚），缓飘+融痕；k 控制强弱。
 *
 *  刻意画得简单——就是白圆点，不做花样：远景小而实、中景中等、近景大而虚（alpha 低、边更软），
 *  90 颗里三层按 50/34/16 分。唯一的小处理是色：冬季底图是一张很淡的暖白纸（正午实测 L≈220），
 *  所以圆的芯留纯白（亮过底子才看得见），只有软边收一档冷蓝（雪在阴影里本来就偏蓝），
 *  tint 再极轻地往冷里带一点，白点边缘就有了微差。 */
type Tier = 0 | 1 | 2;
type Flake = { sp: Sprite; x: number; y: number; vx: number; vy: number; ph: number; sw: number; s: number; a: number; tint: number; tier: Tier; life: number; ttl: number };

/** 两个色之间的插值（tint 只做乘法，冷蓝的深浅靠这里定） */
function mixHex(a: number, b: number, t: number) {
  const ch = (v: number, sh: number) => (v >> sh) & 255;
  const m = (sh: number) => Math.round(ch(a, sh) + (ch(b, sh) - ch(a, sh)) * t);
  return (m(16) << 16) | (m(8) << 8) | m(0);
}

/** 圆点贴图：soft=false 边略实（远/中景），soft=true 更软更散（近景虚焦） */
function snowDot(soft: boolean, S = 64) {
  const c = document.createElement('canvas');
  c.width = c.height = S;
  const g = c.getContext('2d')!;
  const h = S / 2;
  const grd = g.createRadialGradient(h, h, 0, h, h, h);
  if (!soft) {
    grd.addColorStop(0, 'rgba(255,255,255,1)');
    grd.addColorStop(0.62, 'rgba(253,254,255,0.97)');
    grd.addColorStop(0.86, 'rgba(232,242,254,0.45)'); // 冷蓝软边
    grd.addColorStop(1, 'rgba(214,230,248,0)');
  } else {
    grd.addColorStop(0, 'rgba(255,255,255,0.98)');
    grd.addColorStop(0.3, 'rgba(250,253,255,0.8)');
    grd.addColorStop(0.68, 'rgba(230,241,254,0.36)');
    grd.addColorStop(1, 'rgba(210,228,248,0)');
  }
  g.fillStyle = grd;
  g.fillRect(0, 0, S, S);
  return c;
}

export class Snowfall {
  readonly container = new Container();
  private flakes: Flake[] = [];
  private W = 800;
  private H = 600;
  private texs: Texture[];

  constructor(private count = 90) {
    this.texs = [Texture.from(snowDot(false)), Texture.from(snowDot(true))];
  }

  layout(W: number, H: number) {
    this.W = W;
    this.H = H;
  }

  update(dt: number, t: number, k: number, onMelt?: (nx: number, ny: number) => void) {
    this.container.visible = k > 0.02;
    if (k <= 0.02) return;
    while (this.flakes.length < this.count) {
      const f: Flake = { sp: new Sprite(this.texs[0]), ...this.spawn() };
      f.sp.anchor.set(0.5);
      f.sp.texture = this.texs[f.tier === 2 ? 1 : 0];
      this.container.addChild(f.sp);
      this.flakes.push(f);
    }
    for (const f of this.flakes) {
      f.life += dt;
      f.x += (f.vx + Math.sin(t * (f.tier === 2 ? 0.34 : 0.62) + f.ph) * f.sw) * dt;
      f.y += f.vy * dt;
      if (f.life > f.ttl || f.y > this.H + 40 || f.x < -60 || f.x > this.W + 60) {
        if (onMelt && f.tier > 0 && f.y < this.H + 10 && Math.random() < 0.15) onMelt(f.x / this.W, f.y / this.H);
        Object.assign(f, this.spawn());
        f.sp.texture = this.texs[f.tier === 2 ? 1 : 0];
      }
      f.sp.position.set(f.x, f.y);
      f.sp.alpha = k * f.a * Math.min(1, f.life * 1.6);
      f.sp.scale.set(f.s);
      f.sp.tint = f.tint;
    }
  }

  /** 三层景深：尺寸/落速/摆动随层变（近景大、慢、淡）；冷蓝 tint 只是浅浅一层 */
  private spawn(): Omit<Flake, 'sp'> {
    const r = Math.random();
    const j = Math.random();
    let tier: Tier;
    let s: number;
    let a: number;
    let vy: number;
    let tint: number;
    if (r < 0.5) {
      // 远景小雪：密、小、实，负责"这是在下雪"的整体质感
      tier = 0;
      s = 0.085 + Math.random() * 0.05;
      a = 1;
      vy = 9 + Math.random() * 12;
      tint = mixHex(0xfdfeff, 0xf2f8ff, j);
    } else if (r < 0.84) {
      tier = 1;
      s = 0.17 + Math.random() * 0.1;
      a = 0.85;
      vy = 12 + Math.random() * 13;
      tint = mixHex(0xfbfeff, 0xedf5ff, j);
    } else {
      // 近景虚焦：大、淡，越大越淡
      tier = 2;
      s = 0.5 + Math.random() * 0.55;
      a = 0.34 - (s - 0.5) * 0.14;
      vy = 16 + Math.random() * 18;
      tint = mixHex(0xf6fbff, 0xe6f0fd, j);
    }
    return {
      x: Math.random() * (this.W + 60) - 30,
      y: Math.random() * this.H,
      vx: (Math.random() - 0.5) * 10,
      vy,
      ph: Math.random() * Math.PI * 2,
      sw: 4 + s * 9, // 摆动幅度随颗粒大小（近景飘得更慢更沉）
      s,
      a,
      tint,
      tier,
      life: 0,
      ttl: 12 + Math.random() * 14,
    };
  }
}

/** 季节降雨（春季）：斜落的雨丝 + 落点水花圈；强度 k 由季节氛围场控制（渐入渐出） */
export class Rainfall {
  readonly container = new Container();
  private g = new Graphics();
  private drops: { x: number; y: number; vy: number; len: number; ty: number }[] = [];
  private splashes: { x: number; y: number; r: number; a: number }[] = [];
  private W = 800;
  private H = 600;

  constructor(private count = 70) {
    this.container.addChild(this.g);
  }

  layout(W: number, H: number) {
    this.W = W;
    this.H = H;
  }

  update(dt: number, k: number, onSplash?: (nx: number, ny: number) => void) {
    this.g.clear();
    this.container.visible = k > 0.02 || this.splashes.length > 0;
    if (this.container.visible === false) return;
    const slope = 0.16;
    const target = Math.round(this.count * k);
    while (this.drops.length < target) this.drops.push(this.spawn());
    if (this.drops.length > target) this.drops.length = target;
    for (const d of this.drops) {
      d.y += d.vy * dt;
      d.x += d.vy * slope * dt;
      if (d.y >= d.ty) {
        this.splashes.push({ x: d.x, y: d.ty, r: 1, a: 0.55 * k });
        if (onSplash && Math.random() < 0.2) onSplash(d.x / this.W, d.ty / this.H);
        Object.assign(d, this.spawn());
      }
    }
    for (const s of this.splashes) {
      s.r += 26 * dt;
      s.a -= 2.2 * dt;
    }
    this.splashes = this.splashes.filter((s) => s.a > 0);
    for (const d of this.drops) {
      this.g.moveTo(d.x, d.y).lineTo(d.x - slope * d.len, d.y - d.len);
    }
    // 深灰青雨丝：浅色画面上才可见（白雨丝会没进底色里）
    this.g.stroke({ color: 0x5f7580, alpha: Math.min(1, 0.2 * k + 0.03), width: 1 });
    for (const s of this.splashes) this.g.circle(s.x, s.y, s.r);
    this.g.stroke({ color: 0x5f7580, alpha: Math.min(1, 0.25 * k + 0.03), width: 1 });
  }

  private spawn() {
    return {
      x: Math.random() * (this.W + 140) - 70,
      y: -20 - Math.random() * this.H,
      vy: 380 + Math.random() * 160,
      len: 12 + Math.random() * 16,
      ty: Math.random() * this.H,
    };
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
