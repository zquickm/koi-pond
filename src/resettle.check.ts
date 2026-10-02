// 自检：node src/resettle.check.ts —— 全过则静默退出 0，败则打印 FAIL 并以非零码退出
import { planResettle } from './resettle.ts';

const failed: string[] = [];
function assert(name: string, cond: boolean) {
  if (!cond) {
    failed.push(name);
    console.error(`FAIL ${name}`);
  } else {
    console.log(`ok   ${name}`);
  }
}

// 1) 没变的列：雪原样保留（时针、日期行继续攒）
{
  const oldTop = Int32Array.from([10, 10, 10, -1, -1]);
  const pile = Float32Array.from([8, 9, 7, 0, 0]);
  const hold = Float32Array.from([12, 12, 12, 6, 6]);
  const runs = planResettle(oldTop, Int32Array.from([10, 10, 10, -1, -1]), pile, hold);
  assert('没变的列雪原样保留', pile[0] === 8 && pile[1] === 9 && pile[2] === 7);
  assert('无脱落段', runs.length === 0);
}

// 2) 换字后旧顶下面没字接 → 清零并报成一段脱落（体积 = Σ厚×0.85，雪面 = 旧顶+厚）
{
  const oldTop = Int32Array.from([10, 10, -1]);
  const pile = Float32Array.from([9, 8, 0]);
  const hold = Float32Array.from([12, 12, 6]);
  const runs = planResettle(oldTop, Int32Array.from([-1, -1, -1]), pile, hold);
  assert('孤儿雪清零', pile[0] === 0 && pile[1] === 0);
  assert(
    '孤儿雪报成一段（范围/体积/雪面）',
    runs.length === 1 &&
      runs[0].lo === 0 &&
      runs[0].hi === 1 &&
      Math.abs(runs[0].removed - (9 + 8) * 0.85) < 1e-4 &&
      runs[0].tops.length === 2 &&
      Math.abs(runs[0].tops[0] - 19) < 1e-4,
  );
}

// 3) 字顶落差超过 tol → 接不住，脱落
{
  const pile = Float32Array.from([9]);
  const runs = planResettle(
    Int32Array.from([10]),
    Int32Array.from([30]),
    pile,
    Float32Array.from([12]),
  );
  assert('顶差>6 脱落', runs.length === 1 && pile[0] === 0);
}

// 4) 小落差 → 落到新字顶上，且夹回 1.6×holdMax
{
  const pile = Float32Array.from([25]);
  planResettle(Int32Array.from([10]), Int32Array.from([13]), pile, Float32Array.from([12]));
  assert('小落差落上去且夹幅', Math.abs(pile[0] - 12 * 1.6) < 1e-3);
}

// 5) 两段孤儿中间隔着接得住的列 → 分成两段，接得住的保留
{
  const oldTop = Int32Array.from([10, 10, 10, 10]);
  const pile = Float32Array.from([9, 9, 9, 9]);
  const hold = Float32Array.from([12, 12, 12, 12]);
  const runs = planResettle(oldTop, Int32Array.from([-1, 10, -1, 10]), pile, hold);
  assert(
    '按片分段、中间的保留',
    runs.length === 2 &&
      runs[0].lo === 0 &&
      runs[0].hi === 0 &&
      runs[1].lo === 2 &&
      runs[1].hi === 2 &&
      pile[1] === 9 &&
      pile[3] === 9,
  );
}

// 6) 尺寸对不上 → 不动、返回空（窗口变了，清场归调用方管）
{
  const pile = Float32Array.from([9, 9]);
  const runs = planResettle(Int32Array.from([10]), Int32Array.from([10, 10]), pile, Float32Array.from([12, 12]));
  assert('尺寸不符不动手', runs.length === 0 && pile[0] === 9 && pile[1] === 9);
}

if (failed.length) throw new Error(`${failed.length} 项不过：${failed.join('、')}`);
