import { Application, BlurFilter, Container, DisplacementFilter, Graphics, Sprite, Texture } from 'pixi.js';
import { loadConfig } from './config';
import { makeFogTexture, WATER_TINT } from './bottom';
import { Water } from './water';
import { School } from './fish';
import { Frog } from './lily';
import { Critters, Fireflies, Rainfall, Snowfall } from './critters';
import { FoodLayer } from './food';
import { darknessAt, DayTint } from './daycycle';
import { ClockWidget } from './widget';
import { Caustics } from './caustic';
import { PERCHES, PondZone, ZONES } from './pondzone';
import { bboxCrop, cropCanvas, cutoutCanvas, reblushKoi, regradeTeal, rotateToHeadLeft, splitComponents, tex, washTowardWhite } from './cutout';
import type { KoiVariant } from './cutout';
import koi1Url from './assets/koi-1.png';
import koi3Url from './assets/koi-3.png';
import bgDefaultUrl from './assets/bg-wallpaper-v8.png';
import bgSpringUrl from './assets/bg-spring.png';
import bgSummerUrl from './assets/bg-summer.png';
import bgAutumnUrl from './assets/bg-autumn.png';
import bgWinterUrl from './assets/bg-winter.png';
import frogUrl from './assets/frog.jpg';
import tadUrl from './assets/tadpoles.jpg';
import dflyUrl from './assets/dragonfly.jpg';

const cfg = loadConfig();
const nowHour = () => {
  const d = new Date();
  return d.getHours() + d.getMinutes() / 60;
};

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

// 池塘背景：手绘水墨原画（默认底图为用户新绘荷塘 bg-wallpaper-v8，另含四季），
// ?season=spring|summer|autumn|winter 切换
const loadImg = (url: string) =>
  new Promise<HTMLImageElement>((res, rej) => {
    const im = new Image();
    im.onload = () => res(im);
    im.onerror = rej;
    im.src = url;
  });
const [bgDefaultI, bgSpringI, bgSummerI, bgAutumnI, bgWinterI] = await Promise.all(
  [bgDefaultUrl, bgSpringUrl, bgSummerUrl, bgAutumnUrl, bgWinterUrl].map(loadImg),
);
// 背景色调重映射到 fish-d 式青绿（亮度→teal 渐变），水墨纹理保留
const bgWash = (im: HTMLImageElement) => tex(regradeTeal(washTowardWhite(cropCanvas(im, { x: 0, y: 0, w: 1, h: 1 }), 0.12), 0.78));
const bgTexs: Record<string, Texture> = {
  // season id 仍沿用 'v7'（URL ?season=v7 与壳配置的既有取值），底图已换成 v8 荷塘
  v7: Texture.from(bgDefaultI),
  spring: bgWash(bgSpringI),
  summer: bgWash(bgSummerI),
  autumn: bgWash(bgAutumnI),
  winter: bgWash(bgWinterI),
};
const bottom = new Sprite(bgTexs[cfg.season] ?? bgTexs.v7);
const pond = new PondZone(ZONES[cfg.season] ?? ZONES.v7, PERCHES[cfg.season] ?? []);
const water = new Water();

// 水感（只有 v8 底图逐点标定过）：整片水色比岸略深略冷，边缘模糊羽化——像洗染出来的，
// 没有任何清晰的边界线。随 cover-fit 布局重画。
const waterBody = new Graphics();
waterBody.filters = [new BlurFilter({ strength: 8, quality: 2 })];
const waterMask = new Graphics(); // 焦散层的水岸遮罩（同一路多边形）
function redrawWater() {
  waterBody.clear();
  waterMask.clear();
  if (!pond.calibrated) return;
  const pts = pond.screenPoly;
  if (pts.length < 6) return;
  waterBody.poly(pts).fill({ color: 0x0f3f3a, alpha: 0.14 });
  waterMask.poly(pts).fill({ color: 0xffffff });
}

/** 底图 cover-fit 摆放；水面围栏跟着同一套变换走（鱼出生前也要先摆一次） */
function placeBottom(W: number, H: number) {
  const bw = bottom.texture.width;
  const bh = bottom.texture.height;
  const s = Math.max(W / bw, H / bh);
  bottom.scale.set(s);
  bottom.position.set((W - bw * s) / 2, (H - bh * s) / 2);
  pond.layout(bottom.x, bottom.y, s, bw, bh);
  redrawWater();
}

// 素材抠图（一次性）：白底水墨册页 → 透明贴图
const [koiI1, koiI3, tadI, frogI, dflyI] = await Promise.all(
  [koi1Url, koi3Url, tadUrl, frogUrl, dflyUrl].map(loadImg),
);
// 两张单尾直鱼素材，过连通域拆分统一转到头朝左；每张出 red/gold/sumi 三花色 = 6 花色贴图
const koiTexs: Texture[] = [];
const KOI_VARIANTS: KoiVariant[] = ['red', 'gold', 'sumi'];
for (const im of [koiI1, koiI3]) {
  const cut = cutoutCanvas(im);
  const comps = splitComponents(cut, { minPixels: cut.width * cut.height * 0.004, headRule: 'narrow-tip' });
  for (const c of comps) {
    for (const v of KOI_VARIANTS) {
      koiTexs.push(tex(washTowardWhite(reblushKoi(bboxCrop(rotateToHeadLeft(c.cv, c.forward)), v), 0.38)));
    }
  }
}
const frogTex = tex(washTowardWhite(bboxCrop(cutoutCanvas(frogI)), 0.15));
const dflyTex = tex(bboxCrop(cutoutCanvas(dflyI))); // 蜻蜓保持素材原色（不洗白）
const tadArts = splitComponents(cutoutCanvas(tadI), { headRule: 'wide-half' }).map((c) => ({
  tex: tex(washTowardWhite(c.cv, 0.2)),
  forward: c.forward,
}));

placeBottom(app.screen.width, app.screen.height);
// 折射：波纹位移图扭曲底图与鱼层——真实水纹，无白色叠加
bottom.filters = [new DisplacementFilter({ sprite: water.waveMap, scale: 40 })];
const school = new School(koiTexs, cfg.fish, pond);
school.layer.filters = [new DisplacementFilter({ sprite: water.waveMap, scale: 40 })];
// 青蛙暂不出场（先不要）：整套实现与落脚点标定都留在 lily.ts / pondzone.PERCHES 里，
// 想让它回来把这里改成 true 即可。
const FROG_ENABLED = false;
const frog = FROG_ENABLED ? new Frog(frogTex) : null;
const critters = new Critters(tadArts, dflyTex);
const foodLayer = new FoodLayer();
const dayTint = new DayTint();
// 水色罩：薄薄一层水色压在鱼上，让它们"沉"进画里
const veil = new Sprite(Texture.WHITE);
veil.tint = WATER_TINT;
veil.alpha = 0.02;
// 烟波雾层：缓慢漂移的纸白大团
const fogTex = makeFogTexture();
const fogs = [0, 1, 2].map((i) => {
  const s = new Sprite(fogTex);
  s.anchor.set(0.5);
  s.alpha = 0.026 + i * 0.005; // 烟波减淡：画面要清晰，雾只留一点点
  return s;
});
// 水面焦散：fish-d 同款折射光网，裁在水岸多边形里，游动层之下。
// 第二层是大块缓波纹（风纹）：格子更大、对比更软、流动更慢。
const caustics = new Caustics();
const swells = new Caustics({ scale: 0.7, pow: 3.2, gain: 0.2, speed: 0.11, strength: 0.3 });
const waterFx = new Container();
waterFx.addChild(caustics.layer, swells.layer);
waterFx.mask = waterMask;
// 萤火虫光点（夜间）
const fireflies = new Fireflies();
// 季节降雪（冬季氛围场）
const snowfall = new Snowfall();
// 季节降雨（春季氛围场）
const rainfall = new Rainfall();
app.stage.addChild(
  bottom,
  water.waveMap,
  waterBody,
  waterFx,
  school.shadows,
  school.layer,
  foodLayer.container,
  ...(frog ? [frog.sp] : []),
  veil,
  dayTint.sp,
  ...fogs,
  critters.air,
  snowfall.container,
  rainfall.container,
  fireflies.container,
);

// 光标：浏览器与独立壳走 pointer 事件；macOS 钉桌面壳 D5 改 CGEvent 轮询注入，接口不变
let cursor: { x: number; y: number } | null = null;
window.addEventListener('pointermove', (e) => {
  cursor = { x: e.clientX, y: e.clientY }; // 只用于鱼的避让；划过不再产生涟漪（2026-10-02）
});
document.addEventListener('mouseleave', () => (cursor = null));

// 涟漪回调：wake 收【归一化屏幕坐标】(0..1)，与 Water.drop 一致（r/s 为可选强度：
// 鱼尾波小圈，蛙落/蛙鸣/蜻蜓点水大圈）。历史上这里多做了一次 /W、/H，导致鱼吃食、
// 青蛙落地、蜻蜓点水的涟漪全被画到左上角去了。
const wake = (nx: number, ny: number, r = 1.1, s = 0.12) => water.drop(nx, ny, r, s);

// —— 投喂：只有点击才撒食（2026-10-02 拍板，悬停自动撒食已撤）——
function feedAt(x: number, y: number) {
  // 撒在水里：落在荷叶/山石上时按法线挪回水面（否则鱼吃不到，还会贴岸打转）
  let fx = x;
  let fy = Math.min(y, app.screen.height - 50);
  const q = pond.probe(fx, fy);
  const need = 26;
  if (q.d < need) {
    fx += q.nx * (need - q.d);
    fy += q.ny * (need - q.d);
  }
  foodLayer.spawn(fx, fy, 4);
  wake(fx / app.screen.width, fy / app.screen.height, 1.8, 0.35);
}
window.addEventListener('pointerdown', (e) => feedAt(e.clientX, e.clientY));

function layout(W: number, H: number) {
  placeBottom(W, H);
  pond.setViewport(W, H);
  water.layout(W, H, pond);
  caustics.layout(W, H);
  swells.layout(W, H);
  snowfall.layout(W, H);
  rainfall.layout(W, H);
  fireflies.layout(W, H);
  frog?.layout(W, H, pond);
  veil.width = W;
  veil.height = H;
  dayTint.layout(W, H);
  for (const f of fogs) {
    f.width = W * 1.1;
    f.height = H * 0.8;
  }
}

let T = 0;
let lastW = 0;
let lastH = 0;

// 水波反光：随机微波荡开一圈圈渐弱的高光（与点击涟漪同一套波动方程，只是轻得多）。
// 落点采样限定在水内，不在岸上；偶尔来一圈稍大的（像风掠过/鱼摆尾）。
let glintT = 0.8;
// 季节氛围场：春季小雨 / 冬季降雪（?rain=1 / ?snow=1 常开预览）
let seasonT = 8 + Math.random() * 12;
let seasonLeft = 0;
let seasonElapsed = 0;
const seasonQuery = new URLSearchParams(location.search);
const forceRain = seasonQuery.has('rain');
const forceSnow = seasonQuery.has('snow');
function stepGlints(dt: number, W: number, H: number) {
  glintT -= dt;
  if (glintT > 0) return;
  glintT = 0.25 + Math.random() * 0.65;
  let gx = Math.random();
  let gy = Math.random();
  for (let tries = 0; tries < 6 && pond.probe(gx * W, gy * H).d <= 24; tries++) {
    gx = Math.random();
    gy = Math.random();
  }
  if (Math.random() < 0.15) water.drop(gx, gy, 2.8 + Math.random() * 1.4, 0.34 + Math.random() * 0.12);
  else water.drop(gx, gy, 1.6 + Math.random() * 1.6, 0.18 + Math.random() * 0.12);
}

// ?debug：逐帧统计各尾鱼离岸的水面余量并写进 DOM，
// 便于无头核对（chrome --headless --dump-dom "...?debug"）—— 理应永不出现负余量。
const audit = (() => {
  if (!new URLSearchParams(location.search).has('debug')) return null;
  const el = document.createElement('pre');
  el.id = 'audit';
  el.style.cssText = 'position:fixed;left:0;bottom:0;margin:0;padding:2px 6px;font:11px monospace;color:#123;background:rgba(255,255,255,.6);z-index:9';
  document.body.appendChild(el);
  let frames = 0;
  let minC = Infinity; // 中心余量最小值
  let minB = Infinity; // 头/尾余量最小值（负=身体压上岸）
  let breaches = 0; // 中心余量 < 0.75×need 的累计次数（该档位触发兜底推回）
  let onLand = 0; // 头或尾出水的累计次数
  const bucket = [0, 0, 0, 0]; // 中心余量分档：压线 / 贴岸 / 近岸 / 开阔
  let frogSpots = 0; // 岸上落脚点（荷叶/石头）数量
  let frogHops = 0; // 青蛙跳了几次
  let frogMinHop = Infinity;
  let frogMaxHop = 0;
  let frogBad = 0; // 落在不是岸上的点（=0 才对）
  return () => {
    frames++;
    if (frog) {
      const fr = frog.pose;
      frogSpots = fr.spots;
      if (fr.hops > frogHops) {
        frogHops = fr.hops;
        frogMinHop = Math.min(frogMinHop, fr.lastDist);
        frogMaxHop = Math.max(frogMaxHop, fr.lastDist);
      }
      if (!fr.onLand) frogBad++;
    }
    for (const p of school.poses) {
      const q = pond.probe(p.x, p.y);
      const need = p.len * 0.6 + 10;
      const hx = p.x + Math.cos(p.h) * p.len * 0.5;
      const hy = p.y + Math.sin(p.h) * p.len * 0.5;
      const tx = p.x - Math.cos(p.h) * p.len * 0.5;
      const ty = p.y - Math.sin(p.h) * p.len * 0.5;
      const bh = pond.probe(hx, hy).d;
      const bt = pond.probe(tx, ty).d;
      minC = Math.min(minC, q.d);
      minB = Math.min(minB, bh, bt);
      if (bh < 0 || bt < 0) onLand++;
      if (q.d < need * 0.75) breaches++;
      if (q.d < need * 0.5) bucket[0]++;
      else if (q.d < need) bucket[1]++;
      else if (q.d < need * 2) bucket[2]++;
      else bucket[3]++;
    }
    if (frames % 30 === 0) {
      el.textContent =
        `audit frames=${frames} fish=${school.poses.length} minCenter=${minC.toFixed(1)} minBody=${minB.toFixed(1)}` +
        ` onLand=${onLand} breaches=${breaches} bucket=${bucket.join('/')}` +
        (frog ? ` | frog spots=${frogSpots} hops=${frogHops} hopDist=${frogMinHop === Infinity ? '-' : frogMinHop.toFixed(0)}~${frogMaxHop.toFixed(0)} notOnLand=${frogBad}` : '');
    }
  };
})();

app.ticker.add((tk) => {
  const dt = Math.min(tk.deltaMS / 1000, 0.05);
  T += dt;
  const { width: W, height: H } = app.screen;
  if (W !== lastW || H !== lastH) {
    lastW = W;
    lastH = H;
    layout(W, H);
  }
  // 悬停撒食已撤（2026-10-02）：只有点击才有食物

  water.step(dt);
  stepGlints(dt, W, H);
  // 蜻蜓：只在夏季（6–8 月）白天 7:00–18:30 活动；?dfly=1 强制预览
  const nfHour = cfg.hour ?? nowHour();
  const month = new Date().getMonth() + 1;
  const dflyOn = new URLSearchParams(location.search).has('dfly') || (month >= 6 && month <= 8 && nfHour >= 7 && nfHour <= 18.5);
  // 焦散推进：正午最亮、夜里只剩月光级光网（fish-d dayPhase causticMul 1.0↔0.22）
  const wxHour = cfg.hour ?? nowHour();
  const dayness = Math.max(0, Math.min(1, 1 - Math.abs(wxHour - 12) / 9));
  caustics.update(T, 0.22 + 0.78 * dayness);
  swells.update(T, 1);
  foodLayer.update(dt, W, H, wake);
  school.update(dt, T, cursor, W, H, foodLayer.foods, wake);
  audit?.();
  frog?.update(dt, T, wake);
  critters.update(dt, T, W, H, wake, dflyOn);
  // 蜻蜓跟昼夜色调一起染（它在 dayTint 层之上，不染就会下午比四周亮）
  critters.air.tint = dayTint.sp.tint;
  // 萤火虫：黄昏 18h 起随暮色渐显（初萤），凌晨 5.5h 前渐隐
  const nightK = Math.max(0, Math.min(1, nfHour >= 12 ? (nfHour - 18) / 1.2 : (5.5 - nfHour) / 1.2));
  fireflies.update(T, nightK);
  // 季节氛围：春季随机小雨 / 冬季随机降雪，每场约 1 分钟、间隔随机（?rain=1 / ?snow=1 常开预览）
  if (cfg.season === 'spring' || cfg.season === 'winter') {
    seasonT -= dt;
    if (seasonT <= 0 && seasonLeft <= 0) {
      seasonLeft = 55 + Math.random() * 15;
      seasonElapsed = 0;
      seasonT = 50 + Math.random() * 130;
    }
  }
  if (forceRain || forceSnow) seasonLeft = Math.max(seasonLeft, 60);
  if (seasonLeft > 0) {
    seasonLeft -= dt;
    seasonElapsed += dt;
    const env = Math.max(0, Math.min(1, seasonElapsed / 6, seasonLeft / 6));
    // 预览参数优先于季节：?snow=1 在春天也下雪，?rain=1 在冬天也下雨
    const rainOn = forceRain || (!forceSnow && cfg.season === 'spring');
    if (rainOn) {
      // 可见雨丝 + 落点水花；部分落点转化成真实涟漪
      rainfall.update(dt, env, (nx, ny) => {
        if (pond.probe(nx * W, ny * H).d > 10 && Math.random() < 0.4) {
          water.drop(nx, ny, 0.8 + Math.random() * 0.8, 0.08 + Math.random() * 0.08);
        }
      });
    } else {
      // 降雪：雪粒飘到水面化成融痕（融痕画在 Snowfall 里，这里只判断落点是不是水，
      // 并让其中一部分落点变成真实的涟漪）
      snowfall.update(dt, T, env, (nx, ny) => {
        const wet = pond.probe(nx * W, ny * H).d > 12;
        if (wet && Math.random() < 0.3) water.drop(nx, ny, 1 + Math.random(), 0.08);
        return wet;
      });
    }
  } else if (cfg.season === 'winter' || forceSnow) {
    snowfall.update(dt, T, 0);
  }
  // 雪压在 dayTint 之上，不受夜景调色，所以要按"此刻夜色有多深"单独压淡：
  // 不压的话白点在深蓝夜色里比白天还跳（2026-10-02 反馈：晚上的雪太白了）。
  // 用底图当前乘色算深浅，而不是用萤火虫的 nightK——那个 19:12 就满了，那会儿天还暖着。
  snowfall.container.alpha = 1 - 0.85 * darknessAt(nfHour);
  // 昼夜：?hour=22 可强制预览
  dayTint.update(cfg.hour ?? nowHour());
  fogs.forEach((f, i) => {
    f.x = W * (0.5 + 0.28 * Math.sin(T * 0.021 + i * 2.1));
    f.y = H * (0.5 + 0.3 * Math.sin(T * 0.017 + i * 1.7));
  });
});

// 时钟/农历小组件（DOM 水印式，右上角）
const widget = new ClockWidget();
widget.start(cfg.hour);
