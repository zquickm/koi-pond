// 生成 Wallpaper Engine 工程包 → we-package/
//
// 为什么用 esbuild 而不是 vite build 的产物：
//   1. vite/rollup 的多文件分块依赖运行时动态 import() 拉 chunk——WE 的 CEF 各版本
//      配置不一，动态导入在受限 webview 里可能永久挂起（实测复现过），单文件最稳；
//   2. rollup 单文件摊平（inlineDynamicImports / manualChunks 合并）会触发 PixiJS v8
//      模块环的 TDZ bug（rollup#6064，未修）；vite dev 之所以处处能跑，正是因为它用
//      esbuild 把 pixi 预捆成单文件——本脚本沿用同一机制，全程静态导入。
// 用法：pnpm build && node scripts/pack-we.mjs
import { spawnSync } from 'node:child_process';
import { cpSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const out = join(root, 'we-package');
const esbuild = join(root, 'node_modules', '.bin', 'esbuild');

rmSync(out, { recursive: true, force: true });
mkdirSync(out);

const r = spawnSync(
  esbuild,
  [
    'src/main.ts',
    '--bundle',
    '--format=esm',
    '--target=chrome105', // WE 的 CEF 偏旧，语法目标钉死
    '--minify',
    `--outdir=${out}`,
    '--entry-names=index',
    '--asset-names=assets/[name]-[hash]',
    '--loader:.png=file',
    '--loader:.jpg=file',
    '--log-level=warning',
  ],
  { cwd: root, stdio: 'inherit' },
);
if (r.status !== 0) process.exit(r.status ?? 1);

// 壳页面：与应用 index.html 同构，入口换成捆好的单文件；WE 属性监听保持内联且先于模块执行
const shell = readFileSync(join(root, 'index.html'), 'utf8').replace(
  /<script type="module"[^>]*><\/script>/,
  '<script type="module" src="./index.js"></script>',
);
writeFileSync(join(out, 'index.html'), shell);

// WE 元数据源在 we/（project.json 手写、preview.gif 由日景连拍合成），打包时拷入工程包
cpSync(join(root, 'we', 'project.json'), join(out, 'project.json'));
cpSync(join(root, 'we', 'preview.gif'), join(out, 'preview.gif'));
console.log('[pack-we] done → we-package/');
