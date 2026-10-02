// 时钟/农历小组件：DOM 水印式，右上角；农历/节气用 lunar-javascript（Solar→Lunar）。
// 可读性方案参照 fish-d 的时钟（浅色字+深影+错版衬影，昼夜一套通吃）：
// 宣纸米白字 + 淡墨柔影 + 淡青错版衬影（版画压印感），水墨风。
import { Solar } from 'lunar-javascript';

const WEEK = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];

export class ClockWidget {
  private el: HTMLDivElement;
  private time: HTMLDivElement;
  private date: HTMLDivElement;
  private lunar: HTMLDivElement;

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
  }

  start(hourOverride?: number | null) {
    this.update(hourOverride);
    setInterval(() => this.update(hourOverride), 1000);
  }
}
