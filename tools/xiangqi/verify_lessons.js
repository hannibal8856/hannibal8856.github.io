// 驗證象棋新手村: node verify_lessons.js
const fs = require('fs');
const E = new Function(fs.readFileSync(__dirname + '/engine.js', 'utf8') + '\nreturn ENGINE;')()({});
const L = require('./lessons.js');
const P = { K: 1, A: 2, B: 3, N: 4, R: 5, C: 6, P: 7 };
function load(rows, side = 1) {
  if (rows.length !== 10 || rows.some(r => r.length !== 9)) throw new Error('board size');
  const a = []; for (const r of rows) for (const ch of r) a.push(ch === '.' ? 0 : ch === ch.toUpperCase() ? P[ch] : -P[ch.toUpperCase()]);
  E.setPos(a, side);
}
const sq = ([r, c]) => r * 9 + c;
function mateIn(n) {   // 紅方走, n 步內能將死 (或困斃) 黑方
  for (const m of E.legal()) {
    const q = E.make(m);
    let ok;
    const rep = E.legal();
    if (!rep.length) ok = true;
    else if (n === 1) ok = false;
    else { ok = true; for (const r of rep) { const q2 = E.make(r); const s = mateIn(n - 1); E.unmake(r, q2); if (!s) { ok = false; break; } } }
    E.unmake(m, q);
    if (ok) return m;
  }
  return 0;
}
function judge(l, mv) {
  load(l.board);
  const m = sq(mv[0]) << 7 | sq(mv[1]), g = l.goal;
  if (!E.legal().includes(m)) return 'illegal';
  const q = E.make(m);
  let ok;
  if (g.kind === 'capture') ok = (m & 127) === sq(g.target);
  else if (g.kind === 'check') ok = E.inCheck(-1);
  else if (g.kind === 'escape') ok = !g.mustCapture || q !== 0;
  else if (g.kind === 'mate') {
    const rep = E.legal();
    if (!rep.length) ok = true; else if (g.n === 1) ok = false;
    else { ok = true; for (const r of rep) { const q2 = E.make(r); if (!mateIn(g.n - 1)) ok = false; E.unmake(r, q2); if (!ok) break; } }
  }
  E.unmake(m, q);
  return ok;
}
L.forEach((l, i) => {
  load(l.board);
  const g = l.goal, legal = E.legal();
  const pre = (E.inCheck(1) ? '[紅被將]' : '') + (legal.length ? '' : '[紅沒步]');
  if (g.kind === 'moves') {
    const s = sq(g.sel), dest = legal.filter(m => m >> 7 === s).map(m => { const t = m & 127; return [t / 9 | 0, t % 9].join(','); });
    console.log(String(i + 1).padStart(2), l.title.padEnd(8), pre, 'moves', dest.length, dest.join(' '));
    return;
  }
  // 所有正解
  const sols = [];
  for (const m of legal) { const f = m >> 7, t = m & 127; if (judge(l, [[f / 9 | 0, f % 9], [t / 9 | 0, t % 9]]) === true) sols.push(`${f / 9 | 0},${f % 9}>${t / 9 | 0},${t % 9}`); }
  console.log(String(i + 1).padStart(2), l.title.padEnd(8), pre, 'ans', judge(l, l.ans), 'wrong', (l.wrong || []).map(w => judge(l, w)).join('/'), 'sols', sols.length, sols.slice(0, 8).join(' '));
});
