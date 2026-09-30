// 单一配置源。浏览器/独立壳走 URL 参数；WE/Lively 的 properties 注入 D6 接线，
// 到时此文件追加 schema 定义并生成三端配置（project.json / livelyProperties.json / mac 面板）。
export const defaults = { fish: 10, fps: 60 } as const;

export type Config = { fish: number; fps: number };

export function loadConfig(): Config {
  const q = new URLSearchParams(location.search);
  return {
    fish: Number(q.get('fish')) || defaults.fish,
    fps: Number(q.get('fps')) || defaults.fps,
  };
}
