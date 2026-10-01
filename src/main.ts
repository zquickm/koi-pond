import { Application, Sprite, Texture } from 'pixi.js';
import { loadConfig } from './config';
import { makeBottomTexture, makeFogTexture, WATER_TINT } from './bottom';
import { Water } from './water';
import { School } from './fish';
import { Lilies } from './lily';
import { Critters } from './critters';
import { bboxCrop, cropCanvas, cutoutCanvas, rotateToHeadLeft, splitComponents, tex } from './cutout';
import koi1Url from './assets/koi-1.png';
import koi3Url from './assets/koi-3.png';
import leafUrl from './assets/leaf.jpg';
import lotusUrl from './assets/lotus.jpg';
import tadUrl from './assets/tadpoles.jpg';
import frogUrl from './assets/frog.jpg';
import dflyUrl from './assets/dragonfly.jpg';

const cfg = loadConfig();

const app = new Application();
await app.init({
  resizeTo: window,
  antialias: true,
  background: '#c2d4c9',
  resolution: Math.min(window.devicePixelRatio || 1, 2),
  autoDensity: true,
});
document.body.appendChild(app.canvas);
app.ticker.maxFPS = cfg.fps;

const bottom = new Sprite(makeBottomTexture());
const water = new Water();

// 素材抠图（一次性）：白底水墨册页 → 透明贴图
const loadImg = (url: string) =>
  new Promise<HTMLImageElement>((res, rej) => {
    const im = new Image();
    im.onload = () => res(im);
    im.onerror = rej;
    im.src = url;
  });
const [koiI1, koiI3, leafI, lotusI, tadI, frogI, dflyI] = await Promise.all(
  [koi1Url, koi3Url, leafUrl, lotusUrl, tadUrl, frogUrl, dflyUrl].map(loadImg),
);
// 两张单尾直鱼素材，过连通域拆分统一转到头朝左
const koiTexs: Texture[] = [];
for (const im of [koiI1, koiI3]) {
  const cut = cutoutCanvas(im);
  const comps = splitComponents(cut, { minPixels: cut.width * cut.height * 0.004, headRule: 'narrow-tip' });
  for (const c of comps) koiTexs.push(tex(bboxCrop(rotateToHeadLeft(c.cv, c.forward))));
}
const leafTex = tex(bboxCrop(cutoutCanvas(leafI, { x: 0.12, y: 0.22, w: 0.76, h: 0.55 })));
// 荷花白瓣与纸底同色、抠图会漏，改走 multiply 混合：白融进水、粉尖墨线显形
const lotusTex = tex(cropCanvas(lotusI, { x: 0.24, y: 0.14, w: 0.52, h: 0.46 }));
const frogTex = tex(bboxCrop(cutoutCanvas(frogI)));
const dflyTex = tex(bboxCrop(cutoutCanvas(dflyI)));
const tadArts = splitComponents(cutoutCanvas(tadI)).map((c) => ({ tex: tex(c.cv), forward: c.forward }));

const school = new School(koiTexs, cfg.fish);
const lilies = new Lilies(leafTex, lotusTex, frogTex);
const critters = new Critters(tadArts, dflyTex);
// 水色罩：薄薄一层水色压在鱼和荷叶上，让它们"沉"在水里
const veil = new Sprite(Texture.WHITE);
veil.tint = WATER_TINT;
veil.alpha = 0.07;
// 烟波雾层：缓慢漂移的纸白大团
const fogTex = makeFogTexture();
const fogs = [0, 1, 2].map((i) => {
  const s = new Sprite(fogTex);
  s.anchor.set(0.5);
  s.alpha = 0.05 + i * 0.008;
  return s;
});
app.stage.addChild(
  bottom,
  water.caustics,
  critters.water,
  school.shadows,
  school.layer,
  lilies.layer,
  veil,
  water.highlight,
  ...fogs,
  critters.air,
);

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

// 鱼尾波：传归一化坐标给水面
const wake = (x: number, y: number) => water.drop(x / app.screen.width, y / app.screen.height, 1.1, 0.12);

function layout(W: number, H: number) {
  const bw = bottom.texture.width;
  const bh = bottom.texture.height;
  const s = Math.max(W / bw, H / bh);
  bottom.scale.set(s);
  bottom.position.set((W - bw * s) / 2, (H - bh * s) / 2);
  water.layout(W, H);
  lilies.layout(W, H);
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
  lilies.update(dt, T, wake);
  critters.update(dt, T, W, H, wake);
  fogs.forEach((f, i) => {
    f.x = W * (0.5 + 0.28 * Math.sin(T * 0.021 + i * 2.1));
    f.y = H * (0.5 + 0.3 * Math.sin(T * 0.017 + i * 1.7));
  });
});
