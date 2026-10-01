// 单一配置源。浏览器/独立壳走 URL 参数；WE/Lively 的 properties 注入 D6 接线。
export const SEASONS = ['v7', 'spring', 'summer', 'autumn', 'winter'] as const;
export type Season = (typeof SEASONS)[number];

export const defaults = { fish: 12, fps: 60, season: 'v7' as Season };

export type Config = { fish: number; fps: number; season: Season; hour: number | null };

export function loadConfig(): Config {
  const q = new URLSearchParams(location.search);
  const seasonRaw = q.get('season');
  const season = (SEASONS as readonly string[]).includes(seasonRaw ?? '') ? (seasonRaw as Season) : defaults.season;
  const hourRaw = q.get('hour');
  return {
    fish: Number(q.get('fish')) || defaults.fish,
    fps: Number(q.get('fps')) || defaults.fps,
    season,
    hour: hourRaw !== null && !Number.isNaN(Number(hourRaw)) ? Number(hourRaw) : null,
  };
}
