// 调试页：展示每条拆分出的鱼贴图（应头朝左）与估出的头向角，用于排查"倒着游"。
import { Application, Sprite, Text } from 'pixi.js';
import { bboxCrop, cutoutCanvas, rotateToHeadLeft, splitComponents, tex } from './cutout';
import koi1Url from './assets/koi-1.png';
import koi3Url from './assets/koi-3.png';

const app = new Application();
await app.init({ background: '#e8e8e8', resizeTo: window, antialias: true });
document.body.appendChild(app.canvas);

const loadImg = (url: string) =>
  new Promise<HTMLImageElement>((res, rej) => {
    const im = new Image();
    im.onload = () => res(im);
    im.onerror = rej;
    im.src = url;
  });

let y = 24;
let idx = 0;
for (const [name, url] of [
  ['koi-1', koi1Url],
  ['koi-3', koi3Url],
] as const) {
  const im = await loadImg(url);
  const comps = splitComponents(cutoutCanvas(im), {
    minPixels: im.naturalWidth * im.naturalHeight * 0.004,
    headRule: 'narrow-tip',
  });
  for (const c of comps) {
    const t = tex(bboxCrop(rotateToHeadLeft(c.cv, c.forward)));
    const s = new Sprite(t);
    s.scale.set(150 / t.width);
    s.position.set(70, y);
    app.stage.addChild(s);
    const label = new Text({
      text: `${name}#${idx}  forward=${Math.round((c.forward * 180) / Math.PI)}°  ${t.width}×${t.height}`,
      style: { fill: 0x333333, fontSize: 16 },
    });
    label.position.set(280, y + 60);
    app.stage.addChild(label);
    y += 200;
    idx++;
  }
}
