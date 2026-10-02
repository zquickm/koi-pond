// 时钟/农历小组件：DOM 水印式，右上角；农历/节气用 lunar-javascript（Solar→Lunar）。
// 可读性方案参照 fish-d 的时钟（浅色字+深影+错版衬影，昼夜一套通吃）：
// 宣纸米白字 + 淡墨柔影 + 淡青错版衬影（版画压印感），水墨风。
//
// 冬季给这块加"雪"，两种错法都试过、都改掉了：
//   · 向上的白色 text-shadow 冒充积雪 —— 阴影是字形的副本，整块字都重影；
//   · 把字自己画进 canvas 再重画 —— 错版衬影得自己复刻，结果字外面糊了一圈深色。
//   现在的做法：DOM 文字原样保留（CSS 那套衬影一个字不动），离屏 canvas **只用来量**每一列的
//   笔画顶边，然后把雪**盖**在笔画顶上——雪是另外涂上去的一层，不会复制字形，所以不重影。
//   换字也不清场（2026-10-03 反馈）：分钟一变，旧雪跟着新字顶落位——接得住的原样落上去
//   （resettle.ts），接不住的掀成雪絮掉下去；没变的列（时针、日期）的雪继续攒。
import { Solar } from 'lunar-javascript';
import { planResettle } from './resettle';

const WEEK = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];

type Flake = { x: number; y: number; r: number; vy: number; ph: number; sw: number; a: number };

export class ClockWidget {
  private el: HTMLDivElement;
  private time: HTMLDivElement;
  private date: HTMLDivElement;
  private lunar: HTMLDivElement;
  private cv: HTMLCanvasElement | null = null;
  private cx: CanvasRenderingContext2D | null = null;
  private textCv: HTMLCanvasElement | null = null; // 离屏：只有字形（用来取积雪的顶边）
  private topY = new Int32Array(0); // 每一列笔画顶边（-1 = 这列没字）
  private pile = new Float32Array(0); // 每一列积了多厚的雪（从 0 开始长）
  private holdMax = new Float32Array(0); // 每一列最多挂得住多厚（小字挂得少，不然字被埋掉）
  private cool = new Float32Array(0); // 刚塌过的列：冷却期内不再塌，掉落才有间隔
  private slumps: {
    x: number; y: number; vy: number; r: number; a: number;
    lumps: { dx: number; dy: number; r: number }[];
  }[] = [];
  private dot: HTMLCanvasElement | null = null; // 软边白点（雪絮的笔刷）
  private dotCool: HTMLCanvasElement | null = null; // 软边冷色点（雪絮的垫底影）
  private snowy = false;
  private lastText = '';
  private flakes: Flake[] = [];
  private pad = 34;
  private cw = 0;
  private ch = 0;
  private t = 0;
  private last = 0;

  constructor() {
    const style = document.createElement('style');
    style.textContent = `
      .koi-widget {
        position: fixed; top: 5.2vh; right: 3.2vw; text-align: right;
        color: rgba(246,250,243,.95); font-family: "Kaiti SC", "STKaiti", "KaiTi", serif;
        user-select: none; pointer-events: none; z-index: 10;
        text-shadow:
          1.5px 2.5px 0 rgba(126,196,184,.28),
          2px 5px 14px rgba(10,36,32,.5),
          -1px -1px 2px rgba(10,36,32,.35);
      }
      .koi-time { font-size: clamp(34px, 6.4vmin, 72px); font-weight: 600; letter-spacing: 5px; line-height: 1; }
      .koi-date { font-size: clamp(13px, 2.2vmin, 19px); margin-top: .35em; letter-spacing: 3px; opacity: .92; }
      .koi-lunar { font-size: clamp(13px, 2.2vmin, 19px); margin-top: .15em; letter-spacing: 3px; opacity: .8; }
      .koi-snowcv { position: absolute; pointer-events: none; }
    `;
    document.head.appendChild(style);
    const el = document.createElement('div');
    this.el = el;
    el.className = 'koi-widget';
    this.time = document.createElement('div');
    this.time.className = 'koi-time';
    this.date = document.createElement('div');
    this.date.className = 'koi-date';
    this.lunar = document.createElement('div');
    this.lunar.className = 'koi-lunar';
    el.append(this.time, this.date, this.lunar);
    document.body.appendChild(el);
  }

  update(hourOverride?: number | null) {
    const now = new Date();
    let hh: number;
    let mm: number;
    if (hourOverride != null) {
      hh = Math.floor(hourOverride) % 24;
      mm = Math.floor((hourOverride - Math.floor(hourOverride)) * 60);
    } else {
      hh = now.getHours();
      mm = now.getMinutes();
    }
    this.time.textContent = `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
    this.date.textContent = `${now.getMonth() + 1}月${now.getDate()}日 ${WEEK[now.getDay()]}`;
    try {
      const lunar = Solar.fromDate(now).getLunar();
      const jq = lunar.getJieQi();
      this.lunar.textContent = `${lunar.getMonthInChinese()}月${lunar.getDayInChinese()}${jq ? ` · ${jq}` : ''}`;
    } catch {
      this.lunar.textContent = '';
    }
    if (this.snowy) this.fitSnow();
  }

  start(hourOverride?: number | null, snowy = false) {
    this.update(hourOverride);
    setInterval(() => this.update(hourOverride), 1000);
    if (snowy) this.enableSnow();
  }

  // —— 冬季：canvas 重画这三行字 + 字顶积雪 + 局部飘雪 ——

  /** 软边圆点：雪絮由几个它拼出来，比硬圆好看。冷色那枚用来垫底 */
  private softDot(cool = false) {
    if (cool && this.dotCool) return this.dotCool;
    if (!cool && this.dot) return this.dot;
    const S = 64;
    const c = document.createElement('canvas');
    c.width = c.height = S;
    const g = c.getContext('2d')!;
    const rgb = cool ? '104,136,172' : '255,255,255';
    const grd = g.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2);
    grd.addColorStop(0, `rgba(${rgb},${cool ? 0.75 : 1})`);
    grd.addColorStop(0.45, `rgba(${rgb},${cool ? 0.6 : 0.92})`);
    grd.addColorStop(0.78, `rgba(${rgb},${cool ? 0.24 : 0.42})`);
    grd.addColorStop(1, `rgba(${rgb},0)`);
    g.fillStyle = grd;
    g.fillRect(0, 0, S, S);
    if (cool) this.dotCool = c;
    else this.dot = c;
    return c;
  }

  private enableSnow() {
    this.snowy = true;
    this.el.classList.add('koi-snowy');
    const cv = document.createElement('canvas');
    cv.className = 'koi-snowcv';
    this.el.appendChild(cv);
    this.cv = cv;
    this.cx = cv.getContext('2d');
    this.textCv = document.createElement('canvas');
    this.fitSnow();
    this.drawSnow(0);
    const step = (now: number) => {
      const dt = Math.min((now - (this.last || now)) / 1000, 0.05);
      this.last = now;
      this.t += dt;
      this.drawSnow(dt);
      requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  }

  /** canvas 跟着文字块大小走；尺寸变了就重画字形层 */
  private fitSnow() {
    const cv = this.cv;
    if (!cv) return;
    const r = this.el.getBoundingClientRect();
    const w = Math.max(1, Math.round(r.width + this.pad * 2));
    const h = Math.max(1, Math.round(r.height + this.pad * 2));
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const changed = this.cw !== w || this.ch !== h || cv.width !== w * dpr;
    if (changed) {
      this.cw = w;
      this.ch = h;
      for (const c of [cv, this.textCv!]) {
        c.width = Math.round(w * dpr);
        c.height = Math.round(h * dpr);
      }
      cv.style.width = `${w}px`;
      cv.style.height = `${h}px`;
      cv.style.left = `${-this.pad}px`;
      cv.style.top = `${-this.pad}px`;
      const tx = this.textCv!.getContext('2d')!;
      tx.setTransform(dpr, 0, 0, dpr, 0, 0);
      this.cx?.setTransform(dpr, 0, 0, dpr, 0, 0);
      this.lastText = '';
      if (!this.flakes.length) {
        for (let i = 0; i < 34; i++) {
          this.flakes.push({
            x: Math.random() * w,
            y: Math.random() * h,
            r: 1.3 + Math.random() * 1.8,
            vy: 7 + Math.random() * 13,
            ph: Math.random() * Math.PI * 2,
            sw: 0.8 + Math.random() * 1.8,
            a: 0.45 + Math.random() * 0.5,
          });
        }
      }
    }
    const text = `${this.time.textContent}|${this.date.textContent}|${this.lunar.textContent}`;
    if (text !== this.lastText) {
      this.lastText = text;
      this.renderText();
    }
  }

  /** 把三行字按 DOM 的位置/字体画进离屏 canvas（连错版衬影一起），再取积雪用的顶边 */
  private renderText() {
    const tx = this.textCv?.getContext('2d');
    if (!tx || !this.cw) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const W = this.cw;
    const H = this.ch;
    tx.setTransform(dpr, 0, 0, dpr, 0, 0);
    tx.clearRect(0, 0, W, H);
    const box = this.el.getBoundingClientRect();
    // widget 的右边缘在 canvas 坐标里的位置：文字本来就是右对齐的
    const right = W - this.pad;
    const lines: [HTMLDivElement, number][] = [
      [this.time, 1],
      [this.date, 0.92],
      [this.lunar, 0.8],
    ];
    const bands: [number, number, number][] = []; // [上, 下, 最多挂多厚]
    for (const [el] of lines) {
      const t = el.textContent ?? '';
      if (!t) continue;
      const cs = getComputedStyle(el);
      const fs = parseFloat(cs.fontSize);
      tx.font = `${cs.fontWeight} ${fs}px ${cs.fontFamily}`;
      type Spaced = CanvasRenderingContext2D & { letterSpacing?: string };
      (tx as Spaced).letterSpacing = cs.letterSpacing === 'normal' ? '0px' : cs.letterSpacing;
      tx.textAlign = 'right';
      tx.textBaseline = 'alphabetic';
      const m = tx.measureText(t);
      const asc = m.fontBoundingBoxAscent || fs * 0.8;
      const desc = m.fontBoundingBoxDescent || fs * 0.2;
      const r = el.getBoundingClientRect();
      const top = r.top - box.top + this.pad;
      bands.push([top, top + r.height, Math.max(3.2, Math.min(12, fs * 0.17))]);
      const baseY = top + (r.height - (asc + desc)) / 2 + asc;
      // 只画剪影：这一层永远不显示，只用来量笔画顶边
      tx.fillStyle = '#000';
      tx.fillText(t, right, baseY);
    }
    // 每列笔画顶边 → 积雪厚度（波浪状，别是一条直线）
    const img = tx.getImageData(0, 0, this.textCv!.width, this.textCv!.height).data;
    const pw = this.textCv!.width;
    const ph = this.textCv!.height;
    const oldTop = this.topY; // 上一轮的字形顶边，换字时旧雪靠它找新位置
    this.topY = new Int32Array(W).fill(-1);
    for (let x = 0; x < W; x++) {
      const px = Math.min(pw - 1, Math.round(x * dpr));
      for (let y = 0; y < ph; y++) {
        if (img[(y * pw + px) * 4 + 3] > 40) {
          this.topY[x] = y / dpr;
          break;
        }
      }
    }
    // 每列"挂得住多厚"：看这列的笔画顶边落在哪一行（大字挂得多，小字挂得少）
    this.holdMax = new Float32Array(W);
    for (let x = 0; x < W; x++) {
      const t = this.topY[x];
      if (t < 0) continue;
      let hold = 6.5;
      for (const [b0, b1, h] of bands) if (t >= b0 - 1 && t <= b1) hold = h;
      this.holdMax[x] = hold;
    }
    if (this.pile.length !== W) {
      // 首次/窗口尺寸变了：画布坐标系全变，从 0 长起
      this.pile = new Float32Array(W);
      this.cool = new Float32Array(W);
      this.slumps = [];
    } else {
      // 换字（每分钟）不清场：旧雪落到新字上（接不住的掀成雪絮）
      for (const r of planResettle(oldTop, this.topY, this.pile, this.holdMax)) {
        this.shedChunks(r.lo, r.hi, r.tops, r.removed);
      }
    }
  }

  /** 把 [lo,hi] 这片雪（体积分 removed）掀成 1-3 块雪絮，从 tops 给的雪面处垂直落下去 */
  private shedChunks(lo: number, hi: number, tops: number[], removed: number) {
    const chunks = Math.max(1, Math.min(3, Math.round((hi - lo + 1) / 12)));
    for (let c = 0; c < chunks; c++) {
      const cxp = Math.round(lo + ((hi - lo) * (c + 0.5)) / chunks);
      const R = Math.max(2.6, Math.min(11, 2 + Math.sqrt(removed / chunks) * 1.1));
      const lumps: { dx: number; dy: number; r: number }[] = [];
      const nl = 3 + Math.floor(Math.random() * 3);
      for (let i = 0; i < nl; i++) {
        const ang = (i / nl) * Math.PI * 2 + Math.random() * 0.6;
        const dist = Math.random() * 0.45;
        lumps.push({
          dx: Math.cos(ang) * dist,
          dy: Math.sin(ang) * dist * 1.15,
          r: R * (0.45 + Math.random() * 0.4),
        });
      }
      this.slumps.push({
        // 从雪面起步（不从字里冒出来），只垂直往下掉
        x: cxp,
        y: tops[Math.min(tops.length - 1, Math.max(0, cxp - lo))],
        r: R,
        vy: 0,
        a: 0.95,
        lumps,
      });
    }
  }

  private drawSnow(dt: number) {
    const cx = this.cx;
    const cv = this.cv;
    if (!cx || !cv) return;
    const w = this.cw;
    const h = this.ch;
    cx.clearRect(0, 0, w, h);
    if (this.topY.length !== w) return; // 还没量好字形

    this.growPile(dt);
    this.updateFlakes(dt);
    this.updateSlumps(dt);

    // 1) 积雪：从笔画顶边往下盖 pile[x] 这么厚
    cx.save();
    const cap = new Path2D();
    for (let x = 0; x < w; x++) {
      if (this.topY[x] < 0 || this.pile[x] <= 0.05) continue;
      cap.rect(x, this.topY[x] - 0.6, 1.15, this.pile[x]);
    }
    cx.save();
    cx.translate(0, 1.6);
    cx.fillStyle = 'rgba(104,136,172,.4)'; // 雪自己的冷影：淡底上纯白会糊
    cx.fill(cap);
    cx.restore();
    cx.fillStyle = 'rgba(255,255,255,.97)';
    cx.fill(cap);
    cx.restore();

    // 2) 滑落下来的雪：一团小絮（几个软边点拼成），先垫冷影再上白
    const white = this.softDot();
    const cool = this.softDot(true);
    cx.save();
    for (const d of this.slumps) {
      const a = Math.max(0, Math.min(1, d.a));
      for (const [img, off, al] of [
        [cool, 1.8, a * 0.5],
        [white, 0, a],
      ] as [HTMLCanvasElement, number, number][]) {
        cx.globalAlpha = Math.max(0, Math.min(1, al));
        for (const L of d.lumps) {
          const px = L.dx * d.r + d.x;
          const py = L.dy * d.r + d.y + off;
          cx.drawImage(img, px - L.r, py - L.r, L.r * 2, L.r * 2);
        }
      }
    }
    cx.restore();

    // 3) 飘雪（在最前）
    cx.save();
    cx.shadowColor = 'rgba(104,136,172,.55)';
    cx.shadowBlur = 3;
    cx.shadowOffsetY = 1;
    for (const f of this.flakes) {
      const edge = Math.min(f.x, w - f.x, f.y, h - f.y);
      const k = Math.max(0, Math.min(1, edge / (this.pad * 0.75)));
      cx.beginPath();
      cx.arc(f.x, f.y, f.r, 0, Math.PI * 2);
      cx.fillStyle = `rgba(255,255,255,${(f.a * k).toFixed(3)})`;
      cx.fill();
    }
    cx.restore();
  }

  /** 越积越厚：每列慢慢长雪 → 相互塌陷变圆 → 超过能挂住的厚度就滑落 */
  private growPile(dt: number) {
    const w = this.cw;
    const n = this.pile.length;
    if (n !== w) return;
    // 1) 长雪：速率跟着"挂得住多厚"走，大小两行差不多同时积满
    for (let x = 0; x < w; x++) {
      if (this.cool[x] > 0) this.cool[x] -= dt;
      if (this.topY[x] < 0) {
        this.pile[x] = 0;
        continue;
      }
      const nz = 0.4 + 1.3 * (Math.sin(x * 0.055) * 0.5 + Math.sin(x * 0.23 + 2.1) * 0.35 + Math.sin(x * 0.71) * 0.15 + 1) * 0.5;
      this.pile[x] = Math.min(this.pile[x] + this.holdMax[x] * 0.05 * nz * dt, this.holdMax[x] * 1.6);
    }
    // 2) 塌陷：厚的地方往旁边淌一点，堆成圆丘而不是一排尖
    const k = Math.min(1, dt * 1.6);
    const src = this.pile.slice();
    for (let x = 1; x < w - 1; x++) {
      if (this.topY[x] < 0) continue;
      const nb = [src[x - 1], src[x + 1]].filter((_, i) => this.topY[x - 1 + i * 2] >= 0);
      if (!nb.length) continue;
      const avg = nb.reduce((a, b) => a + b, 0) / nb.length;
      this.pile[x] += (avg - src[x]) * 0.32 * k;
    }
    // 3) 挂不住了：整"堆"一起滑下来（一次掀掉一大片，掉落才有间隔，不会一直滴滴答答）
    for (let x = 0; x < w; x++) {
      if (this.topY[x] < 0 || this.cool[x] > 0) continue;
      const hold = this.holdMax[x] * (0.86 + 0.28 * ((Math.sin(x * 0.07 + 0.8) + 1) * 0.5));
      if (this.pile[x] <= hold) continue;
      // 这一堆的范围：往两边扩到雪明显变薄为止（一次最多 29 列）
      let lo = x;
      let hi = x;
      const th = this.holdMax[x] * 0.45;
      while (lo > Math.max(0, x - 14) && this.topY[lo - 1] >= 0 && this.pile[lo - 1] > th) lo--;
      while (hi < Math.min(w - 1, x + 14) && this.topY[hi + 1] >= 0 && this.pile[hi + 1] > th) hi++;
      // 先把这一片"雪面"在哪记下来（等会儿雪块就从这儿脱开往下掉），再削雪
      const tops: number[] = [];
      let removed = 0;
      for (let j = lo; j <= hi; j++) {
        tops.push(this.topY[j] + this.pile[j]);
        removed += this.pile[j] * 0.85;
      }
      // 掀下来的雪：按体积分成几块往下掉
      this.shedChunks(lo, hi, tops, removed);
      // 雪块的位置定好之后再削雪、上冷却
      for (let j = lo; j <= hi; j++) {
        this.pile[j] *= 0.15; // 只留一点点，重新积起来才有"从 0 开始"的感觉
        this.cool[j] = 6 + Math.random() * 4;
      }
      break; // 一帧只塌一处，掉落是一个一个来的
    }
  }

  private updateFlakes(dt: number) {
    const w = this.cw;
    const h = this.ch;
    for (const f of this.flakes) {
      f.y += f.vy * dt;
      f.x += Math.sin(this.t * 0.7 + f.ph) * f.sw * dt;
      const col = Math.round(f.x);
      const top = col >= 0 && col < this.topY.length ? this.topY[col] : -1;
      // 落在笔画上：粘住（给那一列加厚）后重新从顶上飘下来
      if (top >= 0 && f.y >= top - f.r && this.pile[col] < this.holdMax[col] * 1.5) {
        this.pile[col] = Math.min(this.pile[col] + this.holdMax[col] * 0.07, this.holdMax[col] * 1.6);
        f.y = -4;
        f.x = Math.random() * w;
        continue;
      }
      if (f.y > h + 4) {
        f.y = -4;
        f.x = Math.random() * w;
      }
    }
  }

  private updateSlumps(dt: number) {
    for (const d of this.slumps) {
      // 雪絮轻轻往下飘：重力很小、很快到终速，还带一点左右摆
      d.vy = Math.min(d.vy + 46 * dt, 32); // 自由落体 + 空气阻力（到终速）
      d.y += d.vy * dt; // 只往下：不横飘、不自转
      d.a -= 0.22 * dt;
    }
    this.slumps = this.slumps.filter((d) => d.a > 0 && d.y < this.ch + 24);
  }
}
