// 白底水墨素材 → 透明贴图：从边缘泛洪判定"近白低饱和"为背景，alpha 两次盒滤波羽化，
// 主体包围盒裁剪；蝌蚪图额外按连通域拆分并估朝向（头=横向展宽更大的一端）。
import { Texture } from 'pixi.js';

function isBg(r: number, g: number, b: number) {
  const mx = Math.max(r, g, b);
  const mn = Math.min(r, g, b);
  return mx > 221 && (mx - mn) / mx < 0.09;
}

/** 抠图：可选相对裁剪（crop 各值 ∈ [0,1]） */
export function cutoutCanvas(
  img: HTMLImageElement | HTMLCanvasElement,
  crop?: { x: number; y: number; w: number; h: number },
): HTMLCanvasElement {
  const iw = 'naturalWidth' in img ? img.naturalWidth : img.width;
  const ih = 'naturalHeight' in img ? img.naturalHeight : img.height;
  const sx = Math.round((crop?.x ?? 0) * iw);
  const sy = Math.round((crop?.y ?? 0) * ih);
  const sw = Math.round((crop?.w ?? 1) * iw);
  const sh = Math.round((crop?.h ?? 1) * ih);
  const cv = document.createElement('canvas');
  cv.width = sw;
  cv.height = sh;
  const g = cv.getContext('2d', { willReadFrequently: true })!;
  g.drawImage(img as CanvasImageSource, sx, sy, sw, sh, 0, 0, sw, sh);
  const id = g.getImageData(0, 0, sw, sh);
  const d = id.data;

  // 边缘泛洪填背景
  const bg = new Uint8Array(sw * sh);
  const stack: number[] = [];
  const push = (i: number) => {
    if (bg[i]) return;
    const p = i * 4;
    if (isBg(d[p], d[p + 1], d[p + 2])) {
      bg[i] = 1;
      stack.push(i);
    }
  };
  for (let x = 0; x < sw; x++) {
    push(x);
    push((sh - 1) * sw + x);
  }
  for (let y = 0; y < sh; y++) {
    push(y * sw);
    push(y * sw + sw - 1);
  }
  while (stack.length) {
    const i = stack.pop()!;
    const x = i % sw;
    const y = (i / sw) | 0;
    if (x > 0) push(i - 1);
    if (x < sw - 1) push(i + 1);
    if (y > 0) push(i - sw);
    if (y < sh - 1) push(i + sw);
  }

  // alpha 羽化（3×3 盒滤波 ×2）
  const a = new Float32Array(sw * sh);
  for (let i = 0; i < sw * sh; i++) a[i] = bg[i] ? 0 : 1;
  const blur = (src: Float32Array) => {
    const out = new Float32Array(sw * sh);
    for (let y = 0; y < sh; y++) {
      for (let x = 0; x < sw; x++) {
        let s = 0;
        let n = 0;
        for (let dy = -1; dy <= 1; dy++) {
          for (let dx = -1; dx <= 1; dx++) {
            const xx = x + dx;
            const yy = y + dy;
            if (xx < 0 || yy < 0 || xx >= sw || yy >= sh) continue;
            s += src[yy * sw + xx];
            n++;
          }
        }
        out[y * sw + x] = s / n;
      }
    }
    return out;
  };
  const a2 = blur(blur(a));
  for (let i = 0; i < sw * sh; i++) d[i * 4 + 3] = Math.round(a2[i] * 255);
  g.putImageData(id, 0, 0);
  return cv;
}

/** 只做相对裁剪（不抠底）——配合 multiply 混合用于白瓣荷花 */
export function cropCanvas(
  img: HTMLImageElement | HTMLCanvasElement,
  crop: { x: number; y: number; w: number; h: number },
): HTMLCanvasElement {
  const iw = 'naturalWidth' in img ? img.naturalWidth : img.width;
  const ih = 'naturalHeight' in img ? img.naturalHeight : img.height;
  const cv = document.createElement('canvas');
  cv.width = Math.round(crop.w * iw);
  cv.height = Math.round(crop.h * ih);
  cv.getContext('2d')!.drawImage(img as CanvasImageSource, Math.round(crop.x * iw), Math.round(crop.y * ih), cv.width, cv.height, 0, 0, cv.width, cv.height);
  return cv;
}

/** 按非透明像素包围盒裁剪 */
export function bboxCrop(cv: HTMLCanvasElement, pad = 6): HTMLCanvasElement {
  const w = cv.width;
  const h = cv.height;
  const d = cv.getContext('2d')!.getImageData(0, 0, w, h).data;
  let x0 = w;
  let y0 = h;
  let x1 = 0;
  let y1 = 0;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (d[(y * w + x) * 4 + 3] > 8) {
        if (x < x0) x0 = x;
        if (x > x1) x1 = x;
        if (y < y0) y0 = y;
        if (y > y1) y1 = y;
      }
    }
  }
  x0 = Math.max(0, x0 - pad);
  y0 = Math.max(0, y0 - pad);
  x1 = Math.min(w - 1, x1 + pad);
  y1 = Math.min(h - 1, y1 + pad);
  const out = document.createElement('canvas');
  out.width = x1 - x0 + 1;
  out.height = y1 - y0 + 1;
  out.getContext('2d')!.drawImage(cv, x0, y0, out.width, out.height, 0, 0, out.width, out.height);
  return out;
}

export interface Component {
  cv: HTMLCanvasElement;
  forward: number;
}

export interface SplitOptions {
  minPixels?: number;
  /** 头尾判定：wide-half=横向惯量大的一侧是头（蝌蚪）；narrow-tip=端梢展开小的一侧是头（锦鲤，尾鳍扇永远最宽） */
  headRule?: 'wide-half' | 'narrow-tip';
}

/** 连通域拆分（透明度通道），返回各主体画布与朝向（头向角） */
export function splitComponents(src: HTMLCanvasElement, options: SplitOptions = {}): Component[] {
  const { minPixels = 600, headRule = 'wide-half' } = options;
  const w = src.width;
  const h = src.height;
  const d = src.getContext('2d')!.getImageData(0, 0, w, h).data;
  const seen = new Uint8Array(w * h);
  const out: Component[] = [];
  const stack: number[] = [];
  for (let start = 0; start < w * h; start++) {
    if (seen[start] || d[start * 4 + 3] < 30) continue;
    stack.length = 0;
    stack.push(start);
    seen[start] = 1;
    const pts: number[] = [];
    let x0 = w;
    let y0 = h;
    let x1 = 0;
    let y1 = 0;
    while (stack.length) {
      const i = stack.pop()!;
      const x = i % w;
      const y = (i / w) | 0;
      pts.push(x, y);
      if (x < x0) x0 = x;
      if (x > x1) x1 = x;
      if (y < y0) y0 = y;
      if (y > y1) y1 = y;
      if (x > 0 && !seen[i - 1] && d[(i - 1) * 4 + 3] >= 30) {
        seen[i - 1] = 1;
        stack.push(i - 1);
      }
      if (x < w - 1 && !seen[i + 1] && d[(i + 1) * 4 + 3] >= 30) {
        seen[i + 1] = 1;
        stack.push(i + 1);
      }
      if (y > 0 && !seen[i - w] && d[(i - w) * 4 + 3] >= 30) {
        seen[i - w] = 1;
        stack.push(i - w);
      }
      if (y < h - 1 && !seen[i + w] && d[(i + w) * 4 + 3] >= 30) {
        seen[i + w] = 1;
        stack.push(i + w);
      }
    }
    const n = pts.length / 2;
    if (n < minPixels) continue;
    // 主轴 PCA
    let mx = 0;
    let my = 0;
    for (let i = 0; i < n; i++) {
      mx += pts[i * 2];
      my += pts[i * 2 + 1];
    }
    mx /= n;
    my /= n;
    let xx = 0;
    let xy = 0;
    let yy = 0;
    for (let i = 0; i < n; i++) {
      const dx = pts[i * 2] - mx;
      const dy = pts[i * 2 + 1] - my;
      xx += dx * dx;
      xy += dx * dy;
      yy += dy * dy;
    }
    const theta = 0.5 * Math.atan2(2 * xy, xx - yy);
    const ax = Math.cos(theta);
    const ay = Math.sin(theta);
    // 头尾判定：narrow-tip=端梢垂直展开小的一侧是头（锦鲤吻窄尾扇宽）；wide-half=垂向惯量大的一侧
    // 两遍扫描：先求轴投影最大值，再只统计端梢带（|t|>0.86·tMax）内的展宽
    let posSpread = 0;
    let negSpread = 0;
    let posW = 0;
    let negW = 0;
    let tMax = 0;
    for (let i = 0; i < n; i++) {
      const dx = pts[i * 2] - mx;
      const dy = pts[i * 2 + 1] - my;
      tMax = Math.max(tMax, Math.abs(dx * ax + dy * ay));
    }
    for (let i = 0; i < n; i++) {
      const dx = pts[i * 2] - mx;
      const dy = pts[i * 2 + 1] - my;
      const t = dx * ax + dy * ay;
      const u = -dx * ay + dy * ax;
      const uu = u * u;
      if (t >= 0) posW += uu;
      else negW += uu;
      if (Math.abs(t) > tMax * 0.86) {
        if (t >= 0) posSpread = Math.max(posSpread, Math.abs(u));
        else negSpread = Math.max(negSpread, Math.abs(u));
      }
    }
    const sign =
      headRule === 'narrow-tip' ? (posSpread <= negSpread ? 1 : -1) : posW >= negW ? 1 : -1;
    // 裁出组件
    const cv = document.createElement('canvas');
    cv.width = x1 - x0 + 1;
    cv.height = y1 - y0 + 1;
    cv.getContext('2d')!.drawImage(src, x0, y0, cv.width, cv.height, 0, 0, cv.width, cv.height);
    out.push({ cv, forward: Math.atan2(ay * sign, ax * sign) });
  }
  return out;
}

/** 旋转组件画布使头朝向画布左缘（MeshRope 的 u=0 端） */
export function rotateToHeadLeft(cv: HTMLCanvasElement, forward: number): HTMLCanvasElement {
  const theta = Math.PI - forward;
  const cos = Math.abs(Math.cos(theta));
  const sin = Math.abs(Math.sin(theta));
  const w = cv.width;
  const h = cv.height;
  const out = document.createElement('canvas');
  out.width = Math.ceil(w * cos + h * sin);
  out.height = Math.ceil(w * sin + h * cos);
  const g = out.getContext('2d')!;
  g.translate(out.width / 2, out.height / 2);
  g.rotate(theta);
  g.drawImage(cv, -w / 2, -h / 2);
  return out;
}

export function tex(cv: HTMLCanvasElement): Texture {
  return Texture.from(cv);
}
