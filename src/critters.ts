// 水墨小生灵（素材版）：蝌蚪按连通域拆成独立贴图各自游弋；蜻蜓整图低空盘旋、偶发点水。
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
    this.phase += dt * 2;
    this.sp.position.set(this.x, this.y);
    this.sp.rotation = this.heading - this.fwd;
  }
}

class Dragonfly {
  readonly sp: Sprite;
  private x: number;
  private y: number;
  private heading: number;
  private speed: number;
  private phase = Math.random() * 9;
  private dartT = 0;
  private nextDart = 4 + Math.random() * 6;

  constructor(tex: Texture, W: number, H: number) {
    this.sp = new Sprite(tex);
    this.sp.anchor.set(0.5);
    const s = 100 / tex.width;
    this.sp.scale.set(s);
    this.heading = Math.random() * Math.PI * 2;
    this.speed = 26 + Math.random() * 14;
    this.x = W * (0.3 + Math.random() * 0.4);
    this.y = H * (0.3 + Math.random() * 0.4);
    this.sp.position.set(this.x, this.y);
  }

  update(dt: number, t: number, W: number, H: number, wake?: (nx: number, ny: number) => void) {
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
    this.x += Math.cos(this.heading) * sp * dt;
    this.y += Math.sin(this.heading) * sp * dt + Math.sin(t * 1.7 + this.phase) * 6 * dt;
    this.phase += dt;
    if (wake && this.dartT > 0 && Math.random() < dt * 3) wake(this.x / W, this.y / H);
    this.sp.position.set(this.x, this.y);
    // 素材蜻蜓头朝上
    this.sp.rotation = this.heading + Math.PI / 2 + Math.sin(t * 2.5 + this.phase) * 0.07;
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
    this.air.addChild(this.dfly.sp);
  }

  update(dt: number, t: number, W: number, H: number, wake?: (nx: number, ny: number) => void) {
    for (const tad of this.tads) tad.update(dt, t, W, H);
    this.dfly.update(dt, t, W, H, wake);
  }
}
