const G = require('./core.js')({});
const L = require('./lessons.js');
const { Board, BLACK: B, WHITE: W } = G;
function load(rows) { const N = rows.length, b = new Board(N); rows.forEach((r, y) => { if (r.length !== N) console.log('ROW LEN', r); [...r].forEach((ch, x) => { if (ch === 'X') b.a[b.p(x, y)] = B; if (ch === 'O') b.a[b.p(x, y)] = W; }); }); return b; }
function mkGoal(b, g) {
  const t = g.target ? b.p(...g.target) : b.p(...g.targets[0]);
  const tColor = b.a[t];
  const goal = { type: g.kind, target: t, tColor, me: B, escape: g.escape };
  if (g.targets) goal.targets = g.targets.map(q => b.p(...q));
  if (g.area) { const [x0, y0, x1, y1] = g.area; goal.area = []; for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) goal.area.push(b.p(x, y)); }
  return goal;
}
function judge(L1, mv) {
  const b = load(L1.board), g = L1.goal, p = b.p(...mv);
  if (!b.legal(p, B)) return 'illegal';
  b.play(p, B);
  if (g.kind === 'atari') return b.a[b.p(...g.target)] === W && b.libsOf(b.p(...g.target)) === 1;
  if (g.kind === 'connect') { const ch = b.chain(b.p(...g.a)); return ch.stones.includes(b.p(...g.b)); }
  const goal = mkGoal(load(L1.board), g);
  const st = G.status(b, goal); if (st) return st > 0;
  return G.solve(b, W, goal, g.depth - 1, new Map());
}
L.forEach((l, i) => {
  const g = l.goal;
  if (l.board) for (const r of l.board) if (r.length !== l.board.length) console.log(i + 1, 'BAD ROW', r);
  if (!l.ans) { if (g.kind === 'quiz' || g.kind === 'place' || g.kind === 'game') return; }
  const t0 = Date.now();
  const ok = judge(l, l.ans), bad = (l.wrong || []).map(w => judge(l, w));
  // 也找出所有正解
  const b = load(l.board), sols = [];
  for (const p of b.points()) { const [x, y] = b.xy(p); if (b.a[p] === 0 && judge(l, [x, y]) === true) sols.push(x + ',' + y); }
  console.log(String(i + 1).padStart(2), l.title.padEnd(10), 'ans', ok, 'wrong', bad.join('/'), 'all solutions', sols.join(' '), (Date.now() - t0) + 'ms');
});
// 數地題
const sc = G.score(load(L[28].board));
console.log('score lesson 29', sc.black, sc.white);
{ const b = load(L[28].board); let bs = 0, ws = 0; for (const p of b.points()) { if (b.a[p] === B) bs++; if (b.a[p] === W) ws++; } console.log('stones', bs, ws); }
