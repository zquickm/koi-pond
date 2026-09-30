import { Application, Sprite, Texture } from 'pixi.js';
import { loadConfig } from './config';
import { makeBottomTexture, makeFogTexture, WATER_TINT } from './bottom';
import { Water } from './water';
import { School } from './fish';
import { Lilies } from './lily';
import { Critters } from './critters';

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
const school = new School(cfg.fish);
const lilies = new Lilies();
const critters = new Critters();
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
  school.update(dt, T, cursor, W, H, wake);
  lilies.update(dt, T, wake);
  critters.update(dt, T, W, H, wake);
  fogs.forEach((f, i) => {
    f.x = W * (0.5 + 0.28 * Math.sin(T * 0.021 + i * 2.1));
    f.y = H * (0.5 + 0.3 * Math.sin(T * 0.017 + i * 1.7));
  });
});
