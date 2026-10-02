import { Application, BlurFilter, Container, DisplacementFilter, Graphics, Sprite, Texture } from 'pixi.js';
import { loadConfig } from './config';
import { makeFogTexture, WATER_TINT } from './bottom';
import { Water } from './water';
import { School } from './fish';
import { Frog } from './lily';
import { Critters, Fireflies, Rainfall, Snowfall, SnowPiles } from './critters';
import { FoodLayer } from './food';
import { darknessAt, DayTint } from './daycycle';
import { ClockWidget } from './widget';
import { Caustics } from './caustic';
import { PERCHES, PondZone, ZONES } from './pondzone';
import { bboxCrop, cutoutCanvas, reblushKoi, rotateToHeadLeft, splitComponents, tex, washTowardWhite } from './cutout';
import type { KoiVariant } from './cutout';
import koi1Url from './assets/koi-1.png';
import koi3Url from './assets/koi-3.png';
import bgDefaultUrl from './assets/bg-wallpaper-v8.png';
import bgSpringUrl from './assets/bg-spring.png';
import bgAutumnUrl from './assets/bg-autumn.png';
import bgWinterUrl from './assets/bg-winter.png';
import frogUrl from './assets/frog.jpg';
import tadUrl from './assets/tadpoles.jpg';
import dflyUrl from './assets/dragonfly.jpg';

const cfg = loadConfig();
// ?rain / ?rain=light|heavy / ?snow / ?calm 预览开关（可跨季节）
const seasonQuery = new URLSearchParams(location.search);
const rainParam = seasonQuery.get('rain'); // null=没要雨；''/'heavy'=大雨；'light'=小雨
const forceRain = rainParam !== null;
const forceSnow = seasonQuery.has('snow');
// ?calm=1：静水（不起涟漪、不晃、无焦散）——只是预览开关，四季默认都是活水
const calmWater = seasonQuery.has('calm');
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

// 池塘背景：手绘水墨原画（默认底图为用户新绘荷塘 bg-wallpaper-v8，它就是夏景；另含春/秋/冬），
// ?season=spring|autumn|winter 切换；?season=summer 归一到默认夏景（夏天就是默认）
const loadImg = (url: string) =>
  new Promise<HTMLImageElement>((res, rej) => {
    const im = new Image();
    im.onload = () => res(im);
    im.onerror = rej;
    im.src = url;
  });
const [bgDefaultI, bgSpringI, bgAutumnI, bgWinterI] = await Promise.all(
  [bgDefaultUrl, bgSpringUrl, bgAutumnUrl, bgWinterUrl].map(loadImg),
);

/** 冬季烘焙两张图：底图（冬画+积雪盖，进 bgTexs 走换季溶解）与冰层（冰膜+冰裂+霜斑，
 *  单独一层盖在鱼之上——鱼在冰下，2026-10-03 反馈）。
 *  冰裂 = Voronoi 拼块分界线（真实湖冰的裂纹形态，2026-10-03 调研 Blender Artists/80.lv）：
 *  散点 → 相邻种子的中垂线段 → 抖动成微弯折线，"宽软反光底 + 主裂暗线 + 偏移高光棱"
 *  三层描边假深度，随机长次级枝裂；全部裁在标定水岸内、低透明度，不盖画的冰湖水色。 */
function bakeWinterArt(): { base: Texture; ice: Texture } {
  const c = document.createElement('canvas');
  c.width = bgWinterI.width;
  c.height = bgWinterI.height;
  const g = c.getContext('2d')!;
  g.drawImage(bgWinterI, 0, 0);
  // 冰层画布（透明底）：只装水面上那层东西
  const iceC = document.createElement('canvas');
  iceC.width = c.width;
  iceC.height = c.height;
  const gi = iceC.getContext('2d')!;
  // 固定种子的伪随机：烘焙结果稳定，刷新不换裂纹
  let seed = 20261003;
  const rnd = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296);
  // 水域：四季图与 v8 同构图，直接用标定过的水岸（比例坐标 → 画布像素）
  const poly = (ZONES.v7 as readonly (readonly [number, number])[]).map(([x, y]) => [x * c.width, y * c.height]);
  const inPoly = (x: number, y: number) => {
    let inside = false;
    for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
      const [xi, yi] = poly[i];
      const [xj, yj] = poly[j];
      if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
    }
    return inside;
  };
  // 冰排种子
  const pts: { x: number; y: number }[] = [];
  for (let i = 0; i < 34; i++) {
    let x = 0;
    let y = 0;
    do {
      x = rnd() * c.width;
      y = rnd() * c.height;
    } while (!inPoly(x, y));
    pts.push({ x, y });
  }
  // Voronoi 边：中垂线上被其他种子约束出的线段（|p-a|≤|p-q| 逐点夹 t 区间）
  const T = c.width + c.height;
  const edges: { x0: number; y0: number; x1: number; y1: number }[] = [];
  for (let i = 0; i < pts.length; i++) {
    for (let j = i + 1; j < pts.length; j++) {
      const a = pts[i];
      const b = pts[j];
      const mx = (a.x + b.x) / 2;
      const my = (a.y + b.y) / 2;
      let dx = b.x - a.x;
      let dy = b.y - a.y;
      const L = Math.hypot(dx, dy) || 1;
      dx /= L;
      dy /= L;
      const nx = -dy;
      const ny = dx;
      let t0 = -T;
      let t1 = T;
      for (let k = 0; k < pts.length; k++) {
        if (k === i || k === j) continue;
        const q = pts[k];
        const A = (mx - a.x) ** 2 + (my - a.y) ** 2 - ((mx - q.x) ** 2 + (my - q.y) ** 2);
        const B = 2 * (nx * (a.x - q.x) + ny * (a.y - q.y));
        if (Math.abs(B) < 1e-9) {
          if (A > 0) t1 = -1;
          continue;
        }
        const tc = -A / B;
        if (B > 0) t1 = Math.min(t1, tc);
        else t0 = Math.max(t0, tc);
      }
      if (t0 < t1) edges.push({ x0: mx + nx * t0, y0: my + ny * t0, x1: mx + nx * t1, y1: my + ny * t1 });
    }
  }
  gi.save();
  gi.beginPath();
  poly.forEach(([x, y], idx) => (idx ? gi.lineTo(x, y) : gi.moveTo(x, y)));
  gi.closePath();
  gi.clip();
  // 冰膜：整片水面一层极淡的冷白——压在鱼身上，鱼自然显得在冰下
  gi.fillStyle = 'rgba(233,242,250,0.09)';
  gi.fillRect(0, 0, iceC.width, iceC.height);
  const jit = () => (rnd() - 0.5) * 2;
  for (const e of edges) {
    const len = Math.hypot(e.x1 - e.x0, e.y1 - e.y0);
    if (len < 26) continue;
    // 抖动 + 二次曲线平滑：主裂不是尺子直线
    const steps = Math.max(2, Math.round(len / 34));
    const nodes: [number, number][] = [];
    for (let s = 0; s <= steps; s++) {
      const k = s / steps;
      nodes.push([e.x0 + (e.x1 - e.x0) * k + jit() * 3.4, e.y0 + (e.y1 - e.y0) * k + jit() * 3.4]);
    }
    const path = new Path2D();
    path.moveTo(nodes[0][0], nodes[0][1]);
    for (let s = 1; s < nodes.length - 1; s++) {
      const xc = (nodes[s][0] + nodes[s + 1][0]) / 2;
      const yc = (nodes[s][1] + nodes[s + 1][1]) / 2;
      path.quadraticCurveTo(nodes[s][0], nodes[s][1], xc, yc);
    }
    gi.strokeStyle = 'rgba(206,226,238,0.10)';
    gi.lineWidth = 5;
    gi.stroke(path); // 宽软底：裂纹下的反光带
    gi.strokeStyle = 'rgba(88,116,140,0.32)';
    gi.lineWidth = 1.2;
    gi.stroke(path); // 主裂暗线
    gi.save();
    gi.translate(1.1, -1.1);
    gi.strokeStyle = 'rgba(255,255,255,0.16)';
    gi.lineWidth = 0.8;
    gi.stroke(path); // 偏移高光棱：裂纹立体感
    gi.restore();
    // 次级枝裂：从主裂中段斜出去的短细纹
    if (rnd() < 0.55) {
      const k = 0.3 + rnd() * 0.4;
      const bx = e.x0 + (e.x1 - e.x0) * k;
      const by = e.y0 + (e.y1 - e.y0) * k;
      const base = Math.atan2(e.y1 - e.y0, e.x1 - e.x0);
      const ang = base + (rnd() < 0.5 ? 1 : -1) * (0.6 + rnd() * 0.6);
      const bl = 46 + rnd() * 80;
      const bend = (rnd() - 0.5) * 0.8;
      const bpath = new Path2D();
      bpath.moveTo(bx, by);
      bpath.quadraticCurveTo(
        bx + Math.cos(ang + bend * 0.5) * bl * 0.5,
        by + Math.sin(ang + bend * 0.5) * bl * 0.5,
        bx + Math.cos(ang + bend) * bl,
        by + Math.sin(ang + bend) * bl,
      );
      gi.strokeStyle = 'rgba(110,138,160,0.2)';
      gi.lineWidth = 0.7;
      gi.stroke(bpath);
    }
  }
  // 霜斑：几块极淡的白色薄膜，冰面的呼吸感
  for (let i = 0; i < 7; i++) {
    let x = 0;
    let y = 0;
    do {
      x = rnd() * c.width;
      y = rnd() * c.height;
    } while (!inPoly(x, y));
    const r = 60 + rnd() * 120;
    const grd = gi.createRadialGradient(x, y, 0, x, y, r);
    grd.addColorStop(0, 'rgba(246,250,254,0.05)');
    grd.addColorStop(1, 'rgba(246,250,254,0)');
    gi.fillStyle = grd;
    gi.fillRect(x - r, y - r, r * 2, r * 2);
  }
  gi.restore();
  // 积雪盖：软白椭圆压在荷叶/石头/草丛的上缘（比例坐标取自 PERCH_SEEDS 一带的落点）
  const spots: [number, number, number][] = [
    // 左上莲叶群
    [0.03, 0.05, 46], [0.135, 0.05, 40], [0.035, 0.115, 36], [0.075, 0.145, 30],
    // 右上石滩与崖石
    [0.85, 0.04, 42], [0.928, 0.135, 34], [0.908, 0.31, 30], [0.9, 0.45, 28], [0.948, 0.525, 30],
    // 右下荷叶群
    [0.848, 0.865, 46], [0.928, 0.695, 38], [0.9, 0.935, 42],
    // 左下大石
    [0.24, 0.7, 44], [0.3, 0.78, 40], [0.115, 0.895, 46],
    // 草丛与底缘荷叶
    [0.06, 0.33, 26], [0.045, 0.6, 30], [0.94, 0.03, 30], [0.55, 0.965, 34], [0.66, 0.93, 30],
  ];
  for (const [fx, fy, r] of spots) {
    const x = fx * c.width;
    const y = fy * c.height;
    g.save();
    g.translate(x, y);
    g.scale(1, 0.45); // 压扁成盖在物体上缘的雪
    const grd = g.createRadialGradient(0, 0, 0, 0, 0, r);
    grd.addColorStop(0, 'rgba(248,252,255,0.9)');
    grd.addColorStop(0.55, 'rgba(244,249,253,0.5)');
    grd.addColorStop(1, 'rgba(240,247,252,0)');
    g.fillStyle = grd;
    g.beginPath();
    g.arc(0, 0, r, 0, Math.PI * 2);
    g.fill();
    g.restore();
  }
  return { base: Texture.from(c), ice: Texture.from(iceC) };
}
const winterBaked = bakeWinterArt();
/** 春图校色（2026-10-03 四轮定稿，按修图界标准配方：Hue/Sat 定向 + 色偏品红 + S 曲线）：
 *  ①绿区色相(55°-175°)整体 +30° 转向青蓝——黄绿的池塘/荷叶直接变蓝绿，不是减淡绿；
 *  ②全局绿通道轻收(品红向色偏补偿)——治近中性水面的绿灰底；
 *  ③亮度过 smoothstep 的 S 曲线(混 40%)——对比拉开，石头墨色沉下去。 */
function softenGreen(im: HTMLImageElement): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = im.width;
  c.height = im.height;
  const g = c.getContext('2d')!;
  g.drawImage(im, 0, 0);
  const d = g.getImageData(0, 0, c.width, c.height);
  const p = d.data;
  const cl = (v: number) => Math.max(0, Math.min(255, v));
  for (let i = 0; i < p.length; i += 4) {
    let r = p[i] / 255;
    let gch = (p[i + 1] / 255) * 0.965; // 品红向：先收一点全局绿
    let b = p[i + 2] / 255;
    const max = Math.max(r, gch, b);
    const min = Math.min(r, gch, b);
    const d0 = max - min;
    const l = (max + min) / 2;
    let s = d0 === 0 ? 0 : d0 / (1 - Math.abs(2 * l - 1));
    let h = 0;
    if (d0 > 0) {
      if (max === r) h = 60 * (((gch - b) / d0) % 6);
      else if (max === gch) h = 60 * ((b - r) / d0 + 2);
      else h = 60 * ((r - gch) / d0 + 4);
      if (h < 0) h += 360;
      if (h >= 55 && h <= 175) {
        h += 35; // 绿区转向青蓝
        s *= 0.9;
      }
    }
    // 定向增彩：池塘的青蓝更饱和（用户: 池塘再蓝些）、荷花的粉更足（用户: 荷花粉些）
    if (h >= 165 && h <= 265) s *= 1.25;
    if (h >= 320 || h <= 22) s *= 1.3;
    // S 曲线加对比
    const L = l + (l * l * (3 - 2 * l) - l) * 0.4;
    const C = (1 - Math.abs(2 * L - 1)) * s;
    const X = C * (1 - Math.abs(((h / 60) % 2) - 1));
    const m = L - C / 2;
    let rr: number;
    let gg: number;
    let bb: number;
    if (h < 60) { rr = C; gg = X; bb = 0; }
    else if (h < 120) { rr = X; gg = C; bb = 0; }
    else if (h < 180) { rr = 0; gg = C; bb = X; }
    else if (h < 240) { rr = 0; gg = X; bb = C; }
    else if (h < 300) { rr = X; gg = 0; bb = C; }
    else { rr = C; gg = 0; bb = X; }
    // 低彩暗部再压一成（石头/墨色）
    const dark = s < 0.1 && L < 0.6 ? 0.92 : 1;
    p[i] = cl((rr + m) * 255 * dark);
    p[i + 1] = cl((gg + m) * 255 * dark);
    p[i + 2] = cl((bb + m) * 255 * dark);
  }
  g.putImageData(d, 0, 0);
  return c;
}

const bgTexs: Record<string, Texture> = {
  // season id 仍沿用 'v7'（URL ?season=v7 与壳配置的既有取值）；v7=默认荷塘=夏景。
  // 四季图与 v7 是同一构图的换季重绘，直接用原画不洗白——换季交叉溶解时色调才连得上。
  v7: Texture.from(bgDefaultI),
  spring: Texture.from(softenGreen(bgSpringI)),
  autumn: Texture.from(bgAutumnI),
  winter: winterBaked.base,
};
// 冰层：盖在鱼之上（鱼在冰下），冬季才浮现，alpha 在 ticker 里跟换季溶解同步
const iceLayer = new Sprite(winterBaked.ice);
iceLayer.alpha = 0;
// 冬季点击玩雪：撒雪 + 积雪成堆 + 堆雪人（鱼在冰下吃不到食，点击不再是投喂）
const snowPiles = new SnowPiles();
const bottom = new Sprite(bgTexs[cfg.season] ?? bgTexs.v7);
const bottomNext = new Sprite(); // 换季溶解：目标季图淡入，结束后落到底图
bottomNext.alpha = 0;
const pondLayer = new Container(); // 底图两层一起做折射与摆放
pondLayer.addChild(bottom, bottomNext);
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

/** 底图 cover-fit 摆放（含换季溶解层）；水面围栏跟着同一套变换走（鱼出生前也要先摆一次） */
function placeBottom(W: number, H: number) {
  const bw = bottom.texture.width;
  const bh = bottom.texture.height;
  const s = Math.max(W / bw, H / bh);
  pondLayer.scale.set(s);
  pondLayer.position.set((W - bw * s) / 2, (H - bh * s) / 2);
  iceLayer.scale.set(s); // 冰层跟底图同一套 cover-fit
  iceLayer.position.set((W - bw * s) / 2, (H - bh * s) / 2);
  pond.layout(pondLayer.x, pondLayer.y, s, bw, bh);
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
const dispBottom = new DisplacementFilter({ sprite: water.waveMap, scale: 40 });
pondLayer.filters = [dispBottom];
const school = new School(koiTexs, cfg.fish, pond);
const dispSchool = new DisplacementFilter({ sprite: water.waveMap, scale: 40 });
school.layer.filters = [dispSchool];
// 静水：折射归零（水面不晃）
if (calmWater) {
  dispBottom.scale.set(0);
  dispSchool.scale.set(0);
}
// 青蛙：默认荷塘就是夏景——只有夏景有青蛙活动，春/秋/冬图没有；
// ?frog=1 可在其他季节底图上强制预览。实现与落脚点标定在 lily.ts / pondzone.PERCHES。
const frog = new Frog(frogTex);
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
caustics.layer.visible = !calmWater;
swells.layer.visible = !calmWater;
waterFx.mask = waterMask;
// 萤火虫光点（夜间）
const fireflies = new Fireflies();
// 季节降雪（冬季氛围场）
const snowfall = new Snowfall();
snowfall.calm = calmWater; // 静水上不化成一圈圈波纹，只留一个小融点
// 季节降雨（春季氛围场）
const rainfall = new Rainfall();
// 夏季大雨的闪电：全屏白幕抖闪一下（亮-暗-更亮-指数衰减）
const lightning = new Sprite(Texture.WHITE);
lightning.tint = 0xf5f8ff;
lightning.alpha = 0;
app.stage.addChild(
  pondLayer,
  water.waveMap,
  waterBody,
  waterFx,
  school.shadows,
  school.layer,
  foodLayer.container,
  frog.sp,
  iceLayer, // 冰面：鱼/食/蛙都压在它下面（冬季鱼在冰下）
  snowPiles.container, // 冰上的雪堆与小雪人
  veil,
  dayTint.sp,
  ...fogs,
  critters.air,
  snowfall.container,
  rainfall.container,
  fireflies.container,
  lightning,
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
// 静水时所有落水扰动都静音：鱼尾波、投喂、蜻蜓点水都不再起波纹。
// 冬季湖面结冰同理（waterStill 每帧按季节刷新）。
let waterStill = calmWater;
const wake = (nx: number, ny: number, r = 1.1, s = 0.12) => {
  if (!waterStill) water.drop(nx, ny, r, s);
};

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
window.addEventListener('pointerdown', (e) => {
  // 冬天冰封：鱼吃不到食，点击改玩雪（撒雪/积堆/堆雪人）
  if (seasonCur === 'winter') {
    snowPiles.click(e.clientX, e.clientY);
    return;
  }
  feedAt(e.clientX, e.clientY);
});

// —— 换季：交叉溶解；数字键 1-4=春/夏/秋/冬 现场切（壳面板日后接同一入口 setSeason）——
// 夏=2 是默认荷塘（v7）
let seasonCur: string = cfg.season;
let seasonNext = '';
let fadeLeft = 0;
const SEASON_FADE = 2;
function setSeason(id: string) {
  if (id === seasonCur || !bgTexs[id]) return;
  seasonNext = id;
  bottomNext.texture = bgTexs[id];
  bottomNext.alpha = 0;
  fadeLeft = SEASON_FADE;
  // 围栏与落脚点跟目标季节走（溶解刚开始就切，肉眼无感）
  pond.setZone(ZONES[id] ?? ZONES.v7, PERCHES[id] ?? []);
  placeBottom(app.screen.width, app.screen.height);
}
const KEY_SEASON: Record<string, string> = { '1': 'spring', '2': 'v7', '3': 'autumn', '4': 'winter' };
window.addEventListener('keydown', (e) => {
  const id = KEY_SEASON[e.key];
  if (id) setSeason(id);
});

function layout(W: number, H: number) {
  placeBottom(W, H);
  pond.setViewport(W, H);
  snowPiles.clear(); // 雪堆是屏幕坐标，窗口变了就清场重堆
  water.layout(W, H, pond);
  caustics.layout(W, H);
  swells.layout(W, H);
  snowfall.layout(W, H);
  rainfall.layout(W, H);
  fireflies.layout(W, H);
  frog.layout(W, H, pond);
  veil.width = W;
  veil.height = H;
  lightning.width = W; // Texture.WHITE 只有 1x1，不铺满全屏就看不见
  lightning.height = H;
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
// 季节氛围场：春/夏降雨（夏天分小雨·大雨两档）/ 冬季降雪（?rain / ?rain=light|heavy / ?snow 常开预览）
let seasonT = 8 + Math.random() * 12;
let seasonLeft = 0;
let seasonElapsed = 0;
let rainPeak = 1; // 本场雨的强度峰值：小雨 0.4 / 大雨 1（春天固定小雨档，夏天每场随机）
// 大雨偶发闪电：本场 1-2 道，首道在开场 3-17s，道间至少隔 10s
let boltLeft = 0;
let boltT = 0;
let flashT = -1; // ≥0 = 正在抖闪，值为一瞬起的秒数
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
    const fr = frog.pose;
    frogSpots = fr.spots;
    if (fr.hops > frogHops) {
      frogHops = fr.hops;
      frogMinHop = Math.min(frogMinHop, fr.lastDist);
      frogMaxHop = Math.max(frogMaxHop, fr.lastDist);
    }
    if (!fr.onLand) frogBad++;
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
        ` | frog spots=${frogSpots} hops=${frogHops} hopDist=${frogMinHop === Infinity ? '-' : frogMinHop.toFixed(0)}~${frogMaxHop.toFixed(0)} notOnLand=${frogBad}` +
        ` rain=${rainfall.dropCount}` +
        ` flash=${flashT >= 0 ? flashT.toFixed(2) : "-"}`;
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
  // 换季溶解推进：目标季图淡入，走完后落到底图、复位溶解层
  if (fadeLeft > 0) {
    fadeLeft -= dt;
    bottomNext.alpha = Math.min(1, 1 - fadeLeft / SEASON_FADE);
    if (fadeLeft <= 0) {
      bottom.texture = bgTexs[seasonNext];
      bottomNext.alpha = 0;
      seasonCur = seasonNext;
      seasonNext = '';
    }
  }
  // 冰层跟季节走：冬季=1；向冬溶解按进度升、离冬按进度降（与底图同步）
  iceLayer.alpha = seasonNext
    ? seasonNext === 'winter'
      ? 1 - fadeLeft / SEASON_FADE
      : seasonCur === 'winter'
        ? fadeLeft / SEASON_FADE
        : 0
    : seasonCur === 'winter'
      ? 1
      : 0;
  // 点击积雪跟冰层同生共灭：冰化了雪堆雪人也跟着没了
  snowPiles.container.alpha = iceLayer.alpha;
  if (iceLayer.alpha <= 0) snowPiles.clear();
  snowPiles.update(dt);
  // 悬停撒食已撤（2026-10-02）：只有点击才有食物

  water.step(dt);
  // 冬季结冰：冰面无波——焦散/微波/折射全静，雪落只留融点不化圈
  const frozen = seasonCur === 'winter';
  waterStill = calmWater || frozen;
  caustics.layer.visible = !waterStill;
  swells.layer.visible = !waterStill;
  dispBottom.scale.set(waterStill ? 0 : 40);
  dispSchool.scale.set(waterStill ? 0 : 40);
  snowfall.calm = waterStill;
  if (!calmWater) stepGlints(dt, W, H); // 静水没有随机微波
  // 夏天=默认荷塘（v7）：蜻蜓在夏景白天 7:00–18:30 造访（?dfly=1 强制预览）；
  // 青蛙在夏景昼夜都出来（夜里鼓腮正是蛙鸣，?frog=1 强制预览）——同一套"夏天"定义
  const nfHour = cfg.hour ?? nowHour();
  const summerScene = seasonCur === 'v7';
  const dflyOn = seasonQuery.has('dfly') || (summerScene && nfHour >= 7 && nfHour <= 18.5);
  const frogOn = seasonQuery.has('frog') || summerScene;
  // 焦散推进：正午最亮、夜里只剩月光级光网（fish-d dayPhase causticMul 1.0↔0.22）
  const wxHour = cfg.hour ?? nowHour();
  const dayness = Math.max(0, Math.min(1, 1 - Math.abs(wxHour - 12) / 9));
    if (!waterStill) {
      caustics.update(T, 0.22 + 0.78 * dayness);
      swells.update(T, 1);
    }
  foodLayer.update(dt, W, H, wake);
  school.update(dt, T, cursor, W, H, foodLayer.foods, wake);
  audit?.();
  frog.setSeasonal(frogOn);
  frog.update(dt, T, wake);
  critters.update(dt, T, W, H, wake, dflyOn);
  // 蜻蜓跟昼夜色调一起染（它在 dayTint 层之上，不染就会下午比四周亮）
  critters.air.tint = dayTint.sp.tint;
  // 萤火虫按中国真实情况（2026-10-03）：日落后约 19:20 渐现、上半夜最盛，午夜后渐稀、1:30 前收场；
  // 密度=夏景(默认)12 只、春末/初秋零星 4 只、冬无（萤火虫盛发季就是夏天，冬天没有萤火虫）
  const ffK = nfHour >= 12 ? Math.max(0, Math.min(1, nfHour - 19.2)) : Math.max(0, Math.min(1, 1.5 - nfHour));
  const ffCount = seasonCur === 'v7' ? 12 : seasonCur === 'spring' || seasonCur === 'autumn' ? 4 : 0;
  fireflies.update(T, ffK, ffCount);
  // 季节氛围：春季小雨 / 夏季随机小雨·大雨 / 冬季随机降雪，每场约 1 分钟、间隔随机
  if (seasonCur === 'spring' || seasonCur === 'v7' || seasonCur === 'winter') {
    seasonT -= dt;
    if (seasonT <= 0 && seasonLeft <= 0) {
      seasonLeft = 55 + Math.random() * 15;
      seasonElapsed = 0;
      seasonT = 50 + Math.random() * 130;
      // 春天=小雨（2026-10-03 拍板）；夏天小雨·大雨各半
      rainPeak = seasonCur === 'v7' ? (Math.random() < 0.5 ? 0.4 : 1) : 0.4;
      // 只有大雨场配闪电
      boltLeft = seasonCur === 'v7' && rainPeak === 1 ? 1 + ((Math.random() < 0.5 ? 1 : 0)) : 0;
      boltT = 3 + Math.random() * 14;
    }
  }
  if (forceRain || forceSnow) seasonLeft = Math.max(seasonLeft, 60);
  if (forceRain) {
    rainPeak = rainParam === 'light' ? 0.4 : 1;
    // 预览大雨也配闪电：用完隔一阵再补，方便守着看
    if (rainPeak === 1 && boltLeft === 0 && boltT <= 0) {
      boltLeft = 1 + (Math.random() < 0.5 ? 1 : 0);
      boltT = 3 + Math.random() * 10;
    }
  }
  if (seasonLeft > 0) {
    seasonLeft -= dt;
    seasonElapsed += dt;
    const ramp = Math.max(0, Math.min(1, seasonElapsed / 6, seasonLeft / 6));
    // 预览参数优先于季节：?snow 在春天也下雪，?rain 在冬天也下雨
    const rainOn = forceRain || (!forceSnow && (seasonCur === 'spring' || seasonCur === 'v7'));
    if (rainOn) {
      // 可见雨丝 + 落点水花；部分落点转化成真实涟漪（雨强峰值只作用于雨）。
      // 雪层也要收一帧 k=0——否则刚从冬切过来时，半空的雪会冻在屏上不消失
      snowfall.update(dt, T, 0);
      rainfall.update(dt, ramp * rainPeak, (nx, ny) => {
        if (pond.probe(nx * W, ny * H).d > 10 && Math.random() < 0.4) {
          water.drop(nx, ny, 0.8 + Math.random() * 0.8, 0.08 + Math.random() * 0.08);
        }
      });
      // 大雨正下着才放闪电（boltT 一直倒数，用完由 forceRain 分支补货）
      if (flashT < 0 && rainPeak > 0.9) {
        boltT -= dt;
        if (boltT <= 0 && boltLeft > 0) {
          flashT = 0;
          boltLeft--;
          boltT = 10 + Math.random() * 15; // 道间间隔
        }
      }
    } else {
      // 降雪：雪粒飘到水面化成融痕（融痕画在 Snowfall 里，这里只判断落点是不是水，
      // 并让其中一部分落点变成真实的涟漪）
      snowfall.update(dt, T, ramp, (nx, ny) => {
        const wet = pond.probe(nx * W, ny * H).d > 12;
        if (wet && !calmWater && Math.random() < 0.3) water.drop(nx, ny, 1 + Math.random(), 0.08);
        return wet;
      });
    }
  } else {
    // 没有正下的天气：雪层收 k=0 把自己藏起来（也让融痕淡完）——不管什么季节都跑
    snowfall.update(dt, T, 0);
  }
  // 雪压在 dayTint 之上，不受夜景调色，所以要按"此刻夜色有多深"单独压淡：
  // 不压的话白点在深蓝夜色里比白天还跳（2026-10-02 反馈：晚上的雪太白了）。
  // 用底图当前乘色算深浅，而不是用萤火虫的 nightK——那个 19:12 就满了，那会儿天还暖着。
  snowfall.container.alpha = 1 - 0.85 * darknessAt(nfHour);
  // 闪电抖闪包络：亮-暗-更亮-指数衰减，约 1.3s（全场雨 1-2 道）
  if (flashT >= 0) {
    flashT += dt;
    const s = flashT;
    lightning.alpha = s < 0.08 ? 0.5 : s < 0.16 ? 0.1 : s < 0.3 ? 0.62 : Math.max(0, 0.62 * Math.exp(-(s - 0.3) * 5));
    if (s > 1.3) {
      flashT = -1;
      lightning.alpha = 0;
    }
  }
  // 昼夜：?hour=22 可强制预览
  // 冬季去黄：雪景吃晨昏暖金色会发黄（2026-10-03 反馈），multiply 色往白回退 75%
  dayTint.update(cfg.hour ?? nowHour(), seasonCur === 'winter' ? 0.75 : 0);
  fogs.forEach((f, i) => {
    f.tint = seasonCur === 'winter' ? 0xe8f2fc : 0xffffff; // 纸白雾在雪景里也调成冷色
    f.x = W * (0.5 + 0.28 * Math.sin(T * 0.021 + i * 2.1));
    f.y = H * (0.5 + 0.3 * Math.sin(T * 0.017 + i * 1.7));
  });
});

// 时钟/农历小组件（DOM 水印式，右上角）：冬季额外给这块加一层"雪"
const widget = new ClockWidget();
widget.start(cfg.hour, cfg.season === 'winter' || forceSnow);
