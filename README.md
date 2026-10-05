# 锦鲤池塘

可交互水彩锦鲤池塘桌面壁纸。macOS / Windows（Wallpaper Engine · Lively · 独立壳）。

开发预览（固定端口 5175，被占用会直接报错而非换口）：

```sh
pnpm install
pnpm dev        # http://localhost:5175
```

## Wallpaper Engine 工程包（D6）

```sh
pnpm pack:we    # = tsc 类型检查 + vite build + esbuild 单文件捆 → we-package/
```

产物 `we-package/` 是一个自包含的 WE web 壁纸工程：`index.html` + 单个 `index.js`
（无运行时动态导入，规避受限 webview 的 chunk 拉取问题）+ `assets/` 底图素材 +
`project.json`（属性面板）+ `preview.gif`（工坊预览）。

WE 元数据源在 `we/`（`project.json` 手写、`preview.gif` 由正午日景连拍合成），
打包时拷入；改属性文案或换预览图改 `we/` 下的文件。

### 发布 / 更新（Windows 实体机）

1. 把 `we-package/` 整个目录拷到 Windows 的
   `Steam\steamapps\common\wallpaper_engine\projects\myprojects\koi-pond`；
2. 打开 Wallpaper Engine 编辑器 → 打开该工程 → 「文件 → 分享到创意工坊」。

- 首次发布：直接走向导（project.json 未写 workshopid，会作为新 item 上架）。
- 更新既有 item：在 project.json 里加 `"workshopid": "<数字id>"` 后再发布，
  或在编辑器里对该工程走「发布更新」。

### 设置面板（project.json ↔ 代码接线）

属性经 `index.html` 内联的 `wallpaperPropertyListener` 落到 `window.__weProps`，
`src/main.ts` 末尾统一接线，全部运行时生效：

| project.json 键 | 类型 | 默认 | 作用 |
| --- | --- | --- | --- |
| `season` | combo 0-4 | 0 | 0=按真实月份自动，1-4=春/夏/秋/冬 |
| `fishcount` | slider 10-200 | 66 | 锦鲤数量（运行时增减） |
| `fps` | slider 15-120 | 60 | 帧率上限 |
| `daycycle` | bool | true | 光随真实时间走（关=恒定白天） |
| `clockshow` | bool | true | 右上角时钟/农历显隐 |

URL 预览参数照旧可用（`?season=spring`、`?hour=22`、`?rain`、`?snow`、`?debug` 等）。

### 打包注意（为什么是 esbuild 单文件）

- rollup 的单文件摊平（`inlineDynamicImports` / `manualChunks` 合并）会触发
  PixiJS v8 模块环的 TDZ bug（rollup#6064，未修）——两版都实测炸在启动；
- vite 默认的多文件分块依赖运行时动态 `import()` 拉 chunk，受限 webview 里
  可能永久挂起（实测复现）；fish-d 旧包则是多文件 ES 模块直接上架。
- esbuild 整图捆成单文件（vite dev 预捆 pixi 的同款机制）三者中唯一既单文件
  又不触发 TDZ 的路线，且 WE 的 CEF（chrome105 目标）完全兼容。
