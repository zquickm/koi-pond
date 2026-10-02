// 时钟/农历小组件：DOM 水印式，右上角；农历/节气用 lunar-javascript（Solar→Lunar）。
// 可读性方案参照 fish-d 的时钟（浅色字+深影+错版衬影，昼夜一套通吃）：
// 宣纸米白字 + 淡墨柔影 + 淡青错版衬影（版画压印感），水墨风。
//
// 冬季额外加一层"雪"（只在这个小组件上，不动全屏那套雪）：
//   · 字顶积雪：用向上的白色 text-shadow 叠两层——阴影是字形的副本，抬几像素就正好
//     在每一笔的顶上留一道白，跟着字形走，不用去抠字形轮廓（Typekit 贺卡那类做法）。
//   · 冰壳：-webkit-text-stroke 描一圈半透明白，字像蒙了层薄冰。
//   · 局部飘雪：小组件自己的一块 canvas，雪花只落在这一小块里，边上淡出，不会看出矩形边界。
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
  private flakes: Flake[] = [];
  private pad = 34;
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
      /* 冬季：字顶积一层雪 + 一圈薄冰壳。
         text-shadow 画在字形**背后**，所以向上偏移的白影只在笔画顶上露出一道——正好是积雪。
         淡底上纯白会糊掉，所以在白影后面垫一层冷蓝影，把雪托出来。 */
      .koi-widget.koi-snowy { color: rgba(240,247,252,.97); -webkit-text-stroke: 1px rgba(255,255,255,.3); }
      .koi-widget.koi-snowy .koi-time {
        text-shadow:
          0 -5px 0 rgba(255,255,255,.98),
          0 -8px 3px rgba(255,255,255,.55),
          0 -3px 4px rgba(96,132,168,.5),
          1.5px 2.5px 0 rgba(126,196,184,.28),
          2px 5px 14px rgba(10,36,32,.5),
          -1px -1px 2px rgba(10,36,32,.35);
      }
      .koi-widget.koi-snowy .koi-date,
      .koi-widget.koi-snowy .koi-lunar {
        text-shadow:
          0 -2px 0 rgba(255,255,255,.95),
          0 -3.5px 1.5px rgba(255,255,255,.5),
          0 -1.5px 2.5px rgba(96,132,168,.5),
          1.5px 2.5px 0 rgba(126,196,184,.28),
          2px 5px 14px rgba(10,36,32,.5),
          -1px -1px 2px rgba(10,36,32,.35);
      }
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
    this.fitSnow();
  }

  start(hourOverride?: number | null, snowy = false) {
    this.update(hourOverride);
    setInterval(() => this.update(hourOverride), 1000);
    if (snowy) this.enableSnow();
  }

  // —— 冬季局部飘雪：只铺在小组件这一小块上，边上淡出 ——

  private enableSnow() {
    this.el.classList.add('koi-snowy');
    const cv = document.createElement('canvas');
    cv.className = 'koi-snowcv';
    this.el.appendChild(cv);
    this.cv = cv;
    this.cx = cv.getContext('2d');
    this.fitSnow();
    window.addEventListener('resize', () => this.fitSnow());
    const step = (now: number) => {
      const dt = Math.min((now - (this.last || now)) / 1000, 0.05);
      this.last = now;
      this.t += dt;
      this.drawSnow(dt);
      requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  }

  /** canvas 跟着文字块大小走（文字每秒更新，字号/行数都可能变） */
  private fitSnow() {
    const cv = this.cv;
    if (!cv) return;
    const r = this.el.getBoundingClientRect();
    const w = Math.max(1, Math.round(r.width + this.pad * 2));
    const h = Math.max(1, Math.round(r.height + this.pad * 2));
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    if (cv.width !== w * dpr || cv.height !== h * dpr) {
      cv.width = w * dpr;
      cv.height = h * dpr;
      cv.style.width = `${w}px`;
      cv.style.height = `${h}px`;
      cv.style.left = `${-this.pad}px`;
      cv.style.top = `${-this.pad}px`;
      this.cx?.setTransform(dpr, 0, 0, dpr, 0, 0);
      this.flakes = [];
    }
    const want = 34;
    while (this.flakes.length < want) {
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

  private drawSnow(dt: number) {
    const cx = this.cx;
    const cv = this.cv;
    if (!cx || !cv) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = cv.width / dpr;
    const h = cv.height / dpr;
    cx.clearRect(0, 0, w, h);
    // 淡底上白点会糊掉：给每颗雪一点冷色投影，雪粒才立得住
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
      // 边上淡出：看不出 canvas 的矩形
      const edge = Math.min(f.x, w - f.x, f.y, h - f.y);
      const k = Math.max(0, Math.min(1, edge / (this.pad * 0.75)));
      cx.beginPath();
      cx.arc(f.x, f.y, f.r, 0, Math.PI * 2);
      cx.fillStyle = `rgba(255,255,255,${(f.a * k).toFixed(3)})`;
      cx.fill();
    }
  }
}
