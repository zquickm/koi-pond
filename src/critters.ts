// 水墨小生灵（素材版）：蝌蚪连通域拆分各自变速窜游；蜻蜓双曝残影振翅 + 周期点水（俯冲→触水双环涟漪→拉起）。
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
  private x: number;
  private y: number;
  private heading: number;
  private speed: number;
  private phase = Math.random() * 9;
  private flap = Math.random() * 10;
  private dartT = 0;
  private nextDart = 4 + Math.random() * 6;
  // 点水状态机：cruise → 俯冲(0.45s) → 触水(0.12s) → 拉起(0.45s) → cruise
  private dipT = -1;
  private nextDip = 3.5 + Math.random() * 3.5;

  constructor(tex: Texture, W: number, H: number) {
    this.s = 100 / tex.width;
    this.base = new Sprite(tex);
    this.base.anchor.set(0.5);
    this.base.scale.set(this.s);
    this.echo = new Sprite(tex);
    this.echo.anchor.set(0.5);
    this.echo.alpha = 0.32;
    this.echo.scale.set(this.s);
    this.root.addChild(this.base, this.echo);
    this.heading = Math.random() * Math.PI * 2;
    this.speed = 26 + Math.random() * 14;
    this.x = W * (0.3 + Math.random() * 0.4);
    this.y = H * (0.3 + Math.random() * 0.4);
    this.root.position.set(this.x, this.y);
  }

  update(dt: number, t: number, W: number, H: number, wake?: Wake) {
    this.heading += Math.sin(t * 0.23 + this.phase) * 0.5 * dt;
    const margin = 130;
    if (this.x < margin || this.x > W - margin || this.y < margin || this.y > H - margin) {
      const to = Math.atan2(H / 2 - this.y, W / 2 - this.x);
      this.heading += angDiff(to, this.heading) * 1.5 * dt;
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

    // 点水：俯冲→触水（双环涟漪）→拉起；期间减速、航向冻结
    let dipOff = 0;
    let dipScale = 1;
    this.nextDip -= dt;
    if (this.nextDip <= 0 && this.dartT <= 0) {
      this.dipT = 0;
      this.nextDip = 4 + Math.random() * 4;
    }
    if (this.dipT >= 0) {
      this.dipT += dt;
      const DUR = 1.02; // 0.45 下潜 + 0.12 触水 + 0.45 拉起
      const p = this.dipT / DUR;
      if (p >= 1) {
        this.dipT = -1;
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
    this.x = Math.max(margin, Math.min(W - margin, this.x));
    this.y = Math.max(margin, Math.min(H - margin, this.y));
    this.phase += dt;
    this.flap += dt * 42;

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
    this.dfly = new Dragonfly(dflyTex, 1600, 1000);
    this.air.addChild(this.dfly.root);
  }

  update(dt: number, t: number, W: number, H: number, wake?: Wake) {
    for (const tad of this.tads) tad.update(dt, t, W, H);
    this.dfly.update(dt, t, W, H, wake);
  }
}
