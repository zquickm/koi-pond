import { Application, Sprite } from 'pixi.js';
import { loadConfig } from './config';
import { makeBottomTexture } from './bottom';
import { Water } from './water';
import { School } from './fish';

const cfg = loadConfig();

const app = new Application();
await app.init({
  resizeTo: window,
  antialias: true,
  background: '#7fab97',
  resolution: Math.min(window.devicePixelRatio || 1, 2),
  autoDensity: true,
});
document.body.appendChild(app.canvas);
app.ticker.maxFPS = cfg.fps;

const bottom = new Sprite(makeBottomTexture());
const water = new Water();
const school = new School(cfg.fish);
app.stage.addChild(bottom, water.caustics, school.shadows, school.layer, water.highlight);

// 光标：浏览器与独立壳走 pointer 事件；macOS 钉桌面壳 D5 改 CGEvent 轮询注入，接口不变
let cursor: { x: number; y: number } | null = null;
let lastDrop = { x: -99, y: -99 };
window.addEventListener('pointermove', (e) => {
  cursor = { x: e.clientX, y: e.clientY };
  if (Math.hypot(e.clientX - lastDrop.x, e.clientY - lastDrop.y) > 22) {
    lastDrop = { x: e.clientX, y: e.clientY };
    water.drop(e.clientX / app.screen.width, e.clientY / app.screen.height);
  }
});
document.addEventListener('mouseleave', () => (cursor = null));

function layout(W: number, H: number) {
  const bw = bottom.texture.width;
  const bh = bottom.texture.height;
  const s = Math.max(W / bw, H / bh);
  bottom.scale.set(s);
  bottom.position.set((W - bw * s) / 2, (H - bh * s) / 2);
  water.layout(W, H);
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
});
