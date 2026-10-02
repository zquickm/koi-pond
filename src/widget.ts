// 时钟/农历小组件：DOM 水印式，右上角；农历/节气用 lunar-javascript（Solar→Lunar）。
// 可读性方案参照 fish-d 的时钟（浅色字+深影+错版衬影，昼夜一套通吃）：
// 宣纸米白字 + 淡墨柔影 + 淡青错版衬影（版画压印感），水墨风。
//
// 冬季给这块加"雪"，两种错法都试过、都改掉了：
//   · 向上的白色 text-shadow 冒充积雪 —— 阴影是字形的副本，整块字都重影；
//   · 把字自己画进 canvas 再重画 —— 错版衬影得自己复刻，结果字外面糊了一圈深色。
//   现在的做法：DOM 文字原样保留（CSS 那套衬影一个字不动），离屏 canvas **只用来量**每一列的
//   笔画顶边，然后把雪**盖**在笔画顶上——雪是另外涂上去的一层，不会复制字形，所以不重影。
import { Solar } from 'lunar-javascript';

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
  private capDepth = new Float32Array(0); // 每一列积雪厚度
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
            sw: 2 + Math.random() * 5,
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
      const baseY = r.top - box.top + this.pad + (r.height - (asc + desc)) / 2 + asc;
      // 只画剪影：这一层永远不显示，只用来量笔画顶边
      tx.fillStyle = '#000';
      tx.fillText(t, right, baseY);
    }
    // 每列笔画顶边 → 积雪厚度（波浪状，别是一条直线）
    const img = tx.getImageData(0, 0, this.textCv!.width, this.textCv!.height).data;
    const pw = this.textCv!.width;
    const ph = this.textCv!.height;
    this.topY = new Int32Array(W).fill(-1);
    this.capDepth = new Float32Array(W);
    for (let x = 0; x < W; x++) {
      const px = Math.min(pw - 1, Math.round(x * dpr));
      for (let y = 0; y < ph; y++) {
        if (img[(y * pw + px) * 4 + 3] > 40) {
          this.topY[x] = y / dpr;
          break;
        }
      }
    }
    // 厚度用两段正弦叠出来（比随机数顺，也不会随时间抖）
    for (let x = 0; x < W; x++) {
      const w1 = Math.sin(x * 0.045) * 0.5 + Math.sin(x * 0.13 + 1.7) * 0.5;
      this.capDepth[x] = 2.2 + w1 * 1.1 + 1.4;
    }
  }

  private drawSnow(dt: number) {
    const cx = this.cx;
    const cv = this.cv;
    if (!cx || !cv) return;
    const w = this.cw;
    const h = this.ch;
    cx.clearRect(0, 0, w, h);
    if (this.snowy && this.lastText === '') this.fitSnow();
    // 字顶积雪：盖在笔画顶上（DOM 文字本身照旧由 CSS 渲染，这里只叠雪）
    if (this.topY.length === w) {
      const cap = new Path2D();
      for (let x = 0; x < w; x++) {
        const t = this.topY[x];
        if (t < 0) continue;
        cap.rect(x, t - 0.6, 1.2, this.capDepth[x]);
      }
      cx.save();
      // 雪自己的冷影：淡底上纯白会糊掉，垫一层才有厚度
      cx.translate(0, 1.4);
      cx.fillStyle = 'rgba(104,136,172,.42)';
      cx.fill(cap);
      cx.restore();
      cx.save();
      cx.filter = 'blur(0.7px)';
      cx.fillStyle = 'rgba(255,255,255,.97)';
      cx.fill(cap);
      cx.restore();
    }
    // 飘雪：只在这一小块里，边上淡出
    cx.save();
    cx.shadowColor = 'rgba(104,136,172,.55)';
    cx.shadowBlur = 3;
    cx.shadowOffsetY = 1;
    for (const f of this.flakes) {
      f.y += f.vy * dt;
      f.x += Math.sin(this.t * 0.7 + f.ph) * f.sw * dt;
      if (f.y > h + 4) {
        f.y = -4;
        f.x = Math.random() * w;
      }
      const edge = Math.min(f.x, w - f.x, f.y, h - f.y);
      const k = Math.max(0, Math.min(1, edge / (this.pad * 0.75)));
      cx.beginPath();
      cx.arc(f.x, f.y, f.r, 0, Math.PI * 2);
      cx.fillStyle = `rgba(255,255,255,${(f.a * k).toFixed(3)})`;
      cx.fill();
    }
    cx.restore();
  }
}
