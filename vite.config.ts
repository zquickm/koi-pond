import { defineConfig } from 'vite';

export default defineConfig({
  // 相对路径：WE/Lively 工程包与独立壳都以 file:// 或子路径加载
  base: './',
  server: {
    // 专属端口：Plash 壁纸指向固定 URL，端口绝不能漂移，占不到就报错
    port: 5175,
    strictPort: true,
  },
  // 单文件内联（inlineDynamicImports/manualChunks 合并）试过两版都不行：
  // PixiJS v8 的模块环被 rollup 摊平后 TDZ 炸（rollup#6064，未修）。
  // 维持多文件分块——fish-d 同代包就是多文件 ES 模块上架 WE 跑了 6 版，机制已验证。
});
