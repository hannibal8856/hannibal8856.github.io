// 從 DhtmlXQ 棋譜做開局庫：node book.js 資料夾 最多幾步 輸出檔
const fs = require('fs'), path = require('path');
const E = new Function(fs.readFileSync(__dirname + '/engine.js', 'utf8') + '\nreturn ENGINE;')()({});
const [dir, plyMax, out] = [process.argv[2], +process.argv[3] || 24, process.argv[4]];
const STD = '0919293949596979891777062646668600102030405060708012720323436383';
const files = [];
(function walk(d) { for (const f of fs.readdirSync(d, { withFileTypes: true })) { const p = path.join(d, f.name); if (f.isDirectory()) walk(p); else if (!f.name.endsWith('.json') && !f.name.endsWith('.md')) files.push(p); } })(dir);
const T = new Map();   // key -> Map(move -> [n, pts])
let used = 0, bad = 0, seen = new Set();
for (const f of files) {
  const s = fs.readFileSync(f, 'utf8');
  const bi = (s.match(/\[DhtmlXQ_binit\](.*?)\[/) || [])[1];
  if (bi && bi !== STD) continue;
  const ml = (s.match(/\[DhtmlXQ_movelist\](\d*)\[/) || [])[1];
  const rs = (s.match(/\[DhtmlXQ_result\](.*?)\[/) || [])[1] || '';
  if (!ml || ml.length < 40) continue;
  const res = /红胜|紅勝/.test(rs) ? 1 : /黑胜|黑勝/.test(rs) ? -1 : /和/.test(rs) ? 0 : null;
  if (res === null) continue;
  if (seen.has(ml)) continue; seen.add(ml);   // 同一局重複收錄只算一次
  E.setPos(E.startPos(), 1);
  const steps = [];
  let ok = true;
  for (let i = 0; i + 4 <= ml.length && i / 4 < plyMax; i += 4) {
    const fx = +ml[i], fy = +ml[i + 1], tx = +ml[i + 2], ty = +ml[i + 3];
    const m = (fy * 9 + fx) << 7 | (ty * 9 + tx);
    if (!E.legal().includes(m)) { ok = false; break; }
    steps.push([(E.key >>> 0).toString(36) + '.' + (E.key2() >>> 0).toString(36), m, E.side]);
    E.make(m);
  }
  if (!ok) { bad++; continue; }
  used++;
  for (const [k, m, side] of steps) {
    let mm = T.get(k); if (!mm) T.set(k, mm = new Map());
    const e = mm.get(m) || [0, 0]; e[0]++; e[1] += res === 0 ? .5 : (res === side ? 1 : 0); mm.set(m, e);
  }
}
const book = {}; let pos = 0, mv = 0;
for (const [k, mm] of T) {
  let tot = 0; for (const e of mm.values()) tot += e[0];
  if (tot < +(process.argv[5] || 6)) continue;
  const list = [...mm].filter(([m, e]) => e[0] >= 3 && e[0] >= tot * .03).map(([m, e]) => [m, e[0], Math.round(e[1] / e[0] * 100) / 100]).sort((a, b) => b[1] - a[1]);
  if (!list.length) continue;
  book[k] = list; pos++; mv += list.length;
}
fs.writeFileSync(out, JSON.stringify(book));
console.log({ files: files.length, used, bad, positions: pos, moves: mv, bytes: fs.statSync(out).size });
