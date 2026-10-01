// 时钟/农历小组件：DOM 水印式（楷体+白晕），右上角；夜间自动换浅色字。
// 农历/节气用 lunar-javascript（Solar→Lunar）。
import { Solar } from 'lunar-javascript';
import { isNight } from './daycycle';

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
        position: fixed; top: 26px; right: 34px; text-align: right;
        color: #2f3e36; font-family: "Kaiti SC", "STKaiti", "KaiTi", serif;
        user-select: none; pointer-events: none; z-index: 10;
        text-shadow: 0 0 8px rgba(255,255,255,.6), 0 0 2px rgba(255,255,255,.5);
        transition: color .8s, text-shadow .8s;
      }
      .koi-widget.koi-night { color: #dfe4da; text-shadow: 0 0 8px rgba(20,35,50,.8); }
      .koi-time { font-size: 42px; letter-spacing: 5px; line-height: 1; opacity: .9; }
      .koi-date { font-size: 15px; margin-top: 7px; letter-spacing: 2px; opacity: .75; }
      .koi-lunar { font-size: 15px; margin-top: 2px; letter-spacing: 2px; opacity: .75; }
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
    const hour = hourOverride ?? hh + mm / 60;
    this.time.textContent = `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
    this.date.textContent = `${now.getMonth() + 1}月${now.getDate()}日 ${WEEK[now.getDay()]}`;
    try {
      const lunar = Solar.fromDate(now).getLunar();
      const jq = lunar.getJieQi();
      this.lunar.textContent = `${lunar.getMonthInChinese()}月${lunar.getDayInChinese()}${jq ? ` · ${jq}` : ''}`;
    } catch {
      this.lunar.textContent = '';
    }
    this.el.classList.toggle('koi-night', isNight(hour));
  }

  start(hourOverride?: number | null) {
    this.update(hourOverride);
    setInterval(() => this.update(hourOverride), 1000);
  }
}
