// 换字时的积雪交接（widget.ts 用，纯逻辑、无 DOM，node 可直跑自检）。
// 换字不清场：旧字上的雪原样交给新字——
//   · 新字顶接得住的列（|新顶-旧顶|≤tol）：雪原样落上去，超高部分夹回上限，交给常规塌陷慢慢淌；
//   · 接不住的列（那列没字了 / 字顶差得太远）：清零，并把连成片的雪报成脱落段，
//     由 widget 掀成雪絮从旧雪面处掉下去。
// 会原地改 pile；尺寸对不上时不动、返回空（那是窗口变了，调用方该整体清场重积）。

export type ShedRun = { lo: number; hi: number; tops: number[]; removed: number };

export function planResettle(
  oldTop: Int32Array,
  newTop: Int32Array,
  pile: Float32Array,
  holdMax: Float32Array,
  tol = 6,
): ShedRun[] {
  const W = newTop.length;
  const runs: ShedRun[] = [];
  if (oldTop.length !== W || pile.length !== W || holdMax.length !== W) return runs;
  let lo = -1;
  let removed = 0;
  let tops: number[] = [];
  const close = (end: number) => {
    if (lo < 0) return;
    runs.push({ lo, hi: end - 1, tops, removed });
    lo = -1;
    removed = 0;
    tops = [];
  };
  for (let x = 0; x <= W; x++) {
    const shed =
      x < W &&
      oldTop[x] >= 0 &&
      (newTop[x] < 0 || Math.abs(newTop[x] - oldTop[x]) > tol) &&
      pile[x] > 1.5;
    if (shed) {
      if (lo < 0) lo = x;
      removed += pile[x] * 0.85;
      tops.push(oldTop[x] + pile[x]);
      pile[x] = 0;
    } else {
      close(x);
      if (x < W && oldTop[x] >= 0) {
        const cap = holdMax[x] * 1.6;
        if (pile[x] > cap) pile[x] = cap;
      }
    }
  }
  return runs;
}
