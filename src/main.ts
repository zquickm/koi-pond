import { Application, Sprite, Texture } from 'pixi.js';
import { loadConfig } from './config';
import { makeFogTexture, WATER_TINT } from './bottom';
import { Water } from './water';
import { School } from './fish';
import { Frog } from './lily';
import { Critters } from './critters';
import { bboxCrop, cutoutCanvas, rotateToHeadLeft, splitComponents, tex } from './cutout';
import koi1Url from './assets/koi-1.png';
import koi3Url from './assets/koi-3.png';
import bgV7Url from './assets/bg-v7.png';
import bgSpringUrl from './assets/bg-spring.png';
import bgSummerUrl from './assets/bg-summer.png';
import bgAutumnUrl from './assets/bg-autumn.png';
import bgWinterUrl from './assets/bg-winter.png';
import frogUrl from './assets/frog.jpg';
import tadUrl from './assets/tadpoles.jpg';
import dflyUrl from './assets/dragonfly.jpg';

const cfg = loadConfig();

const app = new Application();
await app.init({
  resizeTo: window,
  antialias: true,
  background: '#cdd9cf',
  resolution: Math.min(window.devicePixelRatio || 1, 2),
  autoDensity: true,
});
document.body.appendChild(app.canvas);
app.ticker.maxFPS = cfg.fps;

// 池塘背景：手绘水墨原画（含四季），?season=spring|summer|autumn|winter 切换
const loadImg = (url: string) =>
  new Promise<HTMLImageElement>((res, rej) => {
    const im = new Image();
    im.onload = () => res(im);
    im.onerror = rej;
    im.src = url;
  });
const [bgV7I, bgSpringI, bgSummerI, bgAutumnI, bgWinterI] = await Promise.all(
  [bgV7Url, bgSpringUrl, bgSummerUrl, bgAutumnUrl, bgWinterUrl].map(loadImg),
);
const bgTexs: Record<string, Texture> = {
  v7: Texture.from(bgV7I),
  spring: Texture.from(bgSpringI),
  summer: Texture.from(bgSummerI),
  autumn: Texture.from(bgAutumnI),
  winter: Texture.from(bgWinterI),
};
const bottom = new Sprite(bgTexs[cfg.season] ?? bgTexs.v7);
const water = new Water();

// 素材抠图（一次性）：白底水墨册页 → 透明贴图
const [koiI1, koiI3, tadI, frogI, dflyI] = await Promise.all(
  [koi1Url, koi3Url, tadUrl, frogUrl, dflyUrl].map(loadImg),
);
// 两张单尾直鱼素材，过连通域拆分统一转到头朝左
const koiTexs: Texture[] = [];
for (const im of [koiI1, koiI3]) {
  const cut = cutoutCanvas(im);
  const comps = splitComponents(cut, { minPixels: cut.width * cut.height * 0.004, headRule: 'narrow-tip' });
  for (const c of comps) koiTexs.push(tex(bboxCrop(rotateToHeadLeft(c.cv, c.forward))));
}
const frogTex = tex(bboxCrop(cutoutCanvas(frogI)));
const dflyTex = tex(bboxCrop(cutoutCanvas(dflyI)));
const tadArts = splitComponents(cutoutCanvas(tadI), { headRule: 'wide-half' }).map((c) => ({
  tex: tex(c.cv),
  forward: c.forward,
}));

const school = new School(koiTexs, cfg.fish);
const frog = new Frog(frogTex);
const critters = new Critters(tadArts, dflyTex);
// 水色罩：薄薄一层水色压在鱼上，让它们"沉"进画里
const veil = new Sprite(Texture.WHITE);
veil.tint = WATER_TINT;
veil.alpha = 0.05;
// 烟波雾层：缓慢漂移的纸白大团
const fogTex = makeFogTexture();
const fogs = [0, 1, 2].map((i) => {
  const s = new Sprite(fogTex);
  s.anchor.set(0.5);
  s.alpha = 0.05 + i * 0.008;
  return s;
});
app.stage.addChild(bottom, school.shadows, school.layer, frog.sp, veil, water.highlight, ...fogs, critters.air);

// 光标：浏览器与独立壳走 pointer 事件；macOS 钉桌面壳 D5 改 CGEvent 轮询注入，接口不变
let cursor: { x: number; y: number } | null = null;
let lastDrop = { x: -99, y: -99 };
window.addEventListener('pointermove', (e) => {
  cursor = { x: e.clientX, y: e.clientY };
  if (Math.hypot(e.clientX - lastDrop.x, e.clientY - lastDrop.y) > 26) {
    lastDrop = { x: e.clientX, y: e.clientY };
    water.drop(e.clientX / app.screen.width, e.clientY / app.screen.height, 1.6, 0.4);
  }
});
document.addEventListener('mouseleave', () => (cursor = null));

// 涟漪回调：r/s 可选强度（鱼尾波小圈，蛙鸣/蜻蜓点水大圈）
const wake = (x: number, y: number, r = 1.1, s = 0.12) => water.drop(x / app.screen.width, y / app.screen.height, r, s);

function layout(W: number, H: number) {
  const bw = bottom.texture.width;
  const bh = bottom.texture.height;
  const s = Math.max(W / bw, H / bh);
  bottom.scale.set(s);
  bottom.position.set((W - bw * s) / 2, (H - bh * s) / 2);
  water.layout(W, H);
  // 蛙锚点用艺术图比例坐标 → 经背景 cover-fit 映射到屏幕
  frog.layout(W, H, (fx, fy) => ({
    x: bottom.x + bottom.scale.x * fx * bottom.texture.width,
    y: bottom.y + bottom.scale.y * fy * bottom.texture.height,
  }));
  veil.width = W;
  veil.height = H;
  for (const f of fogs) {
    f.width = W * 1.1;
    f.height = H * 0.8;
  }
}

let T = 0;
let lastW = 0;
let lastH = 0;
app.ticker.add((tk) => {
  const dt = Math.min(tk.deltaMS / 1000, 0.05);
  T += dt;
  const { width: W, height: H } = app.screen;
  if (W !== lastW || H !== lastH) {
    lastW = W;
    lastH = H;
    layout(W, H);
  }
  water.step(dt);
  school.update(dt, T, cursor, W, H);
  frog.update(dt, T, wake);
  critters.update(dt, T, W, H, wake);  fogs.forEach((f, i) => {
    f.x = W * (0.5 + 0.28 * Math.sin(T * 0.021 + i * 2.1));
    f.y = H * (0.5 + 0.3 * Math.sin(T * 0.017 + i * 1.7));
  });
});
