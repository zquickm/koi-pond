import { defineConfig } from 'vite';

export default defineConfig({
  // 相对路径：WE/Lively 工程包与独立壳都以 file:// 或子路径加载
  base: './',
  server: {
    // 专属端口：Plash 壁纸指向固定 URL，端口绝不能漂移，占不到就报错
    port: 5175,
    strictPort: true,
  },
});
