// 水面围栏：把鱼限制在原画的水面之内（荷叶、荷花、山石、芦苇都是"岸"）。
// 背景是 cover-fit 摆放的位图，所以先把屏幕坐标逆映射回原画像素，算到水岸多边形的
// 有符号距离，再乘回缩放系数得到"屏幕像素"余量，交给 fish.ts 做转向与兜底推回；
// 同一套坐标还提供给青蛙：PERCHES 里逐片手标的荷叶/石头点位 → landSpots() 落到叶心。
export type Poly = readonly (readonly [number, number])[];

/**
 * 当前底图 bg-wallpaper-v8 的水面边界（比例坐标，顺时针，逐点贴着原画水岸，2026-10-02 按网格重描）。
 * v8 的水几乎铺满全画、直通上下边缘；岸只有四角：左上荷群、右上石崖、右下荷叶群、左下大石与左缘芦苇。
 */
const WATER_DEFAULT: Poly = [
  [0.155, 0.0], [0.845, 0.0], // 水面直通上边缘
  [0.87, 0.04], [0.905, 0.08], [0.935, 0.12], [0.9, 0.17], [0.868, 0.22], // 右上石崖
  [0.853, 0.3], [0.848, 0.38], [0.852, 0.46], [0.862, 0.54], [0.878, 0.61], [0.9, 0.665],
  [0.895, 0.7], [0.85, 0.73], [0.8, 0.76], [0.772, 0.81], [0.762, 0.87], [0.775, 0.92], [0.805, 0.955], [0.86, 1.0], // 右下荷叶群+荷花
  [0.8, 0.96], [0.73, 0.99], [0.66, 0.94], [0.625, 0.9], [0.55, 0.92], [0.49, 0.98], [0.43, 1.0], // 底缘荷叶簇
  [0.418, 0.92], [0.408, 0.84], [0.398, 0.76], [0.375, 0.7], [0.335, 0.655], [0.28, 0.62], [0.22, 0.6], [0.16, 0.585], [0.1, 0.6], [0.065, 0.63], [0.045, 0.66], // 左下大石上缘
  [0.055, 0.55], [0.048, 0.45], [0.05, 0.35], [0.06, 0.27], // 左缘芦苇内缘
  [0.09, 0.235], [0.12, 0.2], [0.135, 0.13], [0.145, 0.06], // 左上荷叶群
];

/** 四季原画是各自独立的构图，尚未逐季标定水岸，沿用旧的通用粗围栏兜底 */
const FENCE_LEGACY: Poly = [
  [0.28, 0.06], [0.7, 0.04], [0.84, 0.16], [0.93, 0.4], [0.9, 0.7], [0.74, 0.77],
  [0.7, 0.93], [0.42, 0.94], [0.38, 0.7], [0.24, 0.56], [0.13, 0.4], [0.24, 0.14],
];

/**
 * 青蛙的落脚点：逐片荷叶 / 逐块石头手标（比例坐标，无序散布）。
 * 只挑能站得住的实体——荷叶、石头、石滩；芦苇丛和开阔水面不设点。
 * 标定后由 landSpots() 吸附到该处"入岸最深处"，稍微偏一点也会落回叶心/石面。
 */
const PERCH_SEEDS: readonly (readonly [number, number])[] = [
  [0.025, 0.065], [0.13, 0.065], [0.03, 0.135], [0.07, 0.165], // 左上莲叶群
  [0.845, 0.058], // 右上石滩
  [0.925, 0.155], [0.905, 0.335], [0.895, 0.475], [0.945, 0.545], // 右侧崖石
  [0.845, 0.885], [0.925, 0.715], [0.9, 0.955], // 右下荷叶群
  [0.24, 0.72], [0.3, 0.8], [0.115, 0.915], // 左下大石
];

export const ZONES: Record<string, Poly> = {
  v7: WATER_DEFAULT,
  spring: FENCE_LEGACY,
  summer: FENCE_LEGACY,
  autumn: FENCE_LEGACY,
  winter: FENCE_LEGACY,
};

/** 只有当前底图（v8）逐块标过落脚点；四季原画构图不同，退回岸线取点 */
export const PERCHES: Record<string, readonly (readonly [number, number])[]> = {
  v7: PERCH_SEEDS,
};

export type Spot = { x: number; y: number; depth: number };

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

export class PondZone {
  private poly: Poly;
  private pts: number[] = []; // 原画像素坐标，扁平 [x0,y0,x1,y1,...]
  private scr: number[] = []; // 屏幕坐标，同上
  private bx = 0;
  private by = 0;
  private s = 1; // cover-fit 缩放：屏幕 px / 原画 px
  private bw = 1;
  private bh = 1;
  private cx = 0;
  private cy = 0;
  private W = 0;
  private H = 0;

  constructor(poly: Poly = WATER_DEFAULT, private seeds: readonly (readonly [number, number])[] = []) {
    this.poly = poly;
  }

  /** 与 main.ts 中底图 cover-fit 的摆放保持一致 */
  layout(bx: number, by: number, s: number, bw: number, bh: number) {
    this.bx = bx;
    this.by = by;
    this.s = s || 1;
    this.bw = bw;
    this.bh = bh;
    this.pts = [];
    this.scr = [];
    let sx = 0;
    let sy = 0;
    for (const [fx, fy] of this.poly) {
      const x = fx * bw;
      const y = fy * bh;
      this.pts.push(x, y);
      this.scr.push(bx + x * this.s, by + y * this.s);
      sx += x;
      sy += y;
    }
    const n = this.pts.length / 2;
    this.cx = sx / n;
    this.cy = sy / n;
  }

  /** 屏幕视口尺寸（landSpots 的扫描范围） */
  setViewport(W: number, H: number) {
    this.W = W;
    this.H = H;
  }

  /** 屏幕坐标的水岸多边形（扁平 [x0,y0,x1,y1,...]），layout 后有效；供水色绘制 */
  get screenPoly(): number[] {
    return this.scr;
  }

  /** 水岸是否逐点标定过（四季底图沿用粗围栏，不能画水色层否则形状是错的） */
  get calibrated(): boolean {
    return this.poly === WATER_DEFAULT;
  }

  /** 原画比例坐标 → 屏幕坐标（与底图 cover-fit 一致） */
  toScreen(fx: number, fy: number): { x: number; y: number } {
    return { x: this.bx + fx * this.bw * this.s, y: this.by + fy * this.bh * this.s };
  }

  /**
   * 屏幕坐标处的水面余量：d > 0 在水里，单位屏幕 px；
   * (nx, ny) 是从最近的岸指向水里的单位法线。
   * 岸上时 d < 0，其绝对值即"入岸深度"。
   */
  probe(sx: number, sy: number): { d: number; nx: number; ny: number } {
    const px = (sx - this.bx) / this.s;
    const py = (sy - this.by) / this.s;
    const p = this.pts;
    let inside = false;
    let best = Infinity;
    let qx = px;
    let qy = py;
    for (let i = 0; i < p.length; i += 2) {
      const ax = p[i];
      const ay = p[i + 1];
      const j = (i + 2) % p.length;
      const bx = p[j];
      const by = p[j + 1];
      if (ay > py !== by > py && px < ((bx - ax) * (py - ay)) / (by - ay) + ax) inside = !inside;
      const ex = bx - ax;
      const ey = by - ay;
      const l2 = ex * ex + ey * ey || 1;
      const t = clamp(((px - ax) * ex + (py - ay) * ey) / l2, 0, 1);
      const cx = ax + ex * t;
      const cy = ay + ey * t;
      const d2 = (px - cx) * (px - cx) + (py - cy) * (py - cy);
      if (d2 < best) {
        best = d2;
        qx = cx;
        qy = cy;
      }
    }
    // 在水里 → 背离最近的岸；在岸上 → 指向岸的里侧（即推回水里）
    let nx = px - qx;
    let ny = py - qy;
    if (!inside) {
      nx = -nx;
      ny = -ny;
    }
    let len = Math.hypot(nx, ny);
    if (len < 1e-6) {
      // 正好压在岸线上：朝多边形质心
      nx = this.cx - px;
      ny = this.cy - py;
      len = Math.hypot(nx, ny) || 1;
    }
    return { d: (inside ? 1 : -1) * Math.sqrt(best) * this.s, nx: nx / len, ny: ny / len };
  }

  /** 随机取一个余量 ≥ minClear（屏幕 px）的水面点；拒绝采样失败则退回多边形质心 */
  randomPoint(minClear: number, tries = 80): { x: number; y: number } {
    const p = this.pts;
    let x0 = Infinity;
    let x1 = -Infinity;
    let y0 = Infinity;
    let y1 = -Infinity;
    for (let i = 0; i < p.length; i += 2) {
      x0 = Math.min(x0, p[i]);
      x1 = Math.max(x1, p[i]);
      y0 = Math.min(y0, p[i + 1]);
      y1 = Math.max(y1, p[i + 1]);
    }
    for (let k = 0; k < tries; k++) {
      const sx = this.bx + (x0 + Math.random() * (x1 - x0)) * this.s;
      const sy = this.by + (y0 + Math.random() * (y1 - y0)) * this.s;
      if (this.probe(sx, sy).d >= minClear) return { x: sx, y: sy };
    }
    return { x: this.bx + this.cx * this.s, y: this.by + this.cy * this.s };
  }

  /**
   * 岸上的落脚点（荷叶/石头）。
   * 有手标种子（当前底图）时：把每个种子吸附到附近"入岸最深处"，即叶心/石面；
   * 没有种子时（四季原画）：退回沿水岸线取样。
   */
  landSpots(opts: { snap?: number; step?: number; reach?: number; minDepth?: number; minGap?: number } = {}): Spot[] {
    const { snap = 34 } = opts;
    if (this.seeds.length) {
      const out: Spot[] = [];
      for (const [fx, fy] of this.seeds) {
        const p = this.toScreen(fx, fy);
        const s = this.snapToLand(p.x, p.y, snap);
        if (s) out.push(s);
      }
      return out;
    }
    return this.shoreSpots(opts);
  }

  /** 把一个点吸附到附近入岸最深处（保证落在岸上）；附近全是水则返回 null */
  private snapToLand(x: number, y: number, radius: number): Spot | null {
    let best: Spot | null = null;
    const step = 6;
    for (let r = 0; r <= radius; r += step) {
      const n = r === 0 ? 1 : Math.max(6, Math.round((2 * Math.PI * r) / step));
      for (let i = 0; i < n; i++) {
        const a = (i / n) * Math.PI * 2;
        const qx = x + Math.cos(a) * r;
        const qy = y + Math.sin(a) * r;
        const depth = -this.probe(qx, qy).d;
        if (depth > 0 && (!best || depth > best.depth)) best = { x: qx, y: qy, depth };
      }
      if (best && r >= step * 2) break; // 附近已有实地就不再往外找
    }
    return best;
  }

  /**
   * 无种子时的兜底：沿水岸线每隔 step 取一个采样点，向岸里探到入岸最深处
   * （对一片圆荷叶来说就是叶心，对大石头是离岸不远的实地），再去重。
   */
  private shoreSpots(opts: { step?: number; reach?: number; minDepth?: number; minGap?: number; inset?: number } = {}): Spot[] {
    const { step = 120, reach = 96, minDepth = 12, minGap = 74, inset = 16 } = opts;
    const W = this.W || this.bw * this.s;
    const H = this.H || this.bh * this.s;
    const p = this.scr;
    if (p.length < 6) return [];

    // 1) 沿闭合岸线等距取样
    const samples: { x: number; y: number }[] = [];
    let carry = 0;
    for (let i = 0; i < p.length; i += 2) {
      const j = (i + 2) % p.length;
      const ax = p[i];
      const ay = p[i + 1];
      const bx = p[j];
      const by = p[j + 1];
      const len = Math.hypot(bx - ax, by - ay);
      if (len < 1e-6) continue;
      for (let t = carry; t < len; t += step) {
        samples.push({ x: ax + ((bx - ax) * t) / len, y: ay + ((by - ay) * t) / len });
      }
      carry = (carry - len) % step;
      if (carry < 0) carry += step;
    }

    // 2) 从岸线往岸里探，取入岸最深处
    const cand: Spot[] = [];
    for (const s of samples) {
      const n = this.probe(s.x, s.y); // n 指向水里
      const ox = -n.nx;
      const oy = -n.ny;
      let best: Spot | null = null;
      let drop = 0;
      let prev = 0;
      for (let d = 4; d <= reach; d += 4) {
        const qx = s.x + ox * d;
        const qy = s.y + oy * d;
        const depth = -this.probe(qx, qy).d;
        if (depth <= 0) break;
        if (depth > prev) {
          drop = 0;
          best = { x: qx, y: qy, depth };
        } else if (++drop >= 3) {
          break; // 已经越过叶心
        }
        prev = depth;
      }
      if (best && best.depth >= minDepth) cand.push(best);
    }

    // 3) 去重（由深到浅），并裁掉视口外的点
    cand.sort((a, b) => b.depth - a.depth);
    const keep: Spot[] = [];
    for (const s of cand) {
      if (s.x < inset || s.x > W - inset || s.y < inset || s.y > H - inset) continue;
      if (keep.some((k) => Math.hypot(k.x - s.x, k.y - s.y) < minGap)) continue;
      keep.push(s);
    }
    return keep;
  }
}
