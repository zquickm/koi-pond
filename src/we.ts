// Wallpaper Engine 属性桥：project.json 的属性经 index.html 里的内联监听落到 __weProps，
// 这里提供订阅与读取。所有属性一律运行时应用（WE 加载时全量推一次 + 用户改动时再推），
// 不依赖启动时序——监听晚到也没关系，改到的每一项都能当场生效。
declare global {
  interface Window {
    __weProps?: Record<string, { value: unknown }>;
  }
}

export type WeProps = Record<string, { value: unknown } | undefined>;

export const weProps = (): WeProps => window.__weProps ?? {};

export function onWeProps(cb: (p: WeProps) => void) {
  window.addEventListener('we-props', () => cb(weProps()));
  cb(weProps()); // 监听注册前就已推送过的属性，立刻补应用一次
}

/** 自动季：按真实月份映射（3-5 春 / 6-8 夏 / 9-11 秋 / 其余冬） */
export function seasonOfMonth(d = new Date()): string {
  const m = d.getMonth() + 1;
  return m >= 3 && m <= 5 ? 'spring' : m >= 6 && m <= 8 ? 'v7' : m >= 9 && m <= 11 ? 'autumn' : 'winter';
}

export const weNum = (p: WeProps, k: string): number | null => {
  const v = p[k]?.value;
  return typeof v === 'number' && Number.isFinite(v) ? v : null;
};

export const weBool = (p: WeProps, k: string): boolean | null => {
  const v = p[k]?.value;
  return typeof v === 'boolean' ? v : null;
};
