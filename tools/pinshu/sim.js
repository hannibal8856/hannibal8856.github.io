const RK = require('./core.js');
const { T, valid, arrange } = RK;
const ex = (ids) => ids.map(id => RK.isJ(id) ? 'J' : 'RBOK'[T[id].c] + T[id].n).join(' ');
// 單元測試
const find = (c, n, k = 0) => T.filter(t => t.c === c && t.n === n)[k].id;
const J1 = 104, J2 = 105;
const cases = [
  [[find(0,5), find(1,5), find(2,5)], true], [[find(0,5), find(0,5,1), find(2,5)], false],
  [[find(0,3), find(0,4), find(0,5)], true], [[find(0,12), find(0,13), find(0,1)], false],
  [[find(0,3), J1, find(0,5)], true], [[find(0,12), find(0,13), J1], true], [[find(0,5), J1, J2], true],
  [[find(0,5), find(1,5), find(2,5), find(3,5), J1], false], [[find(0,1), find(0,2)], false],
];
for (const [s, want] of cases) { const a = arrange(s); if (!!a !== want) console.log('FAIL', ex(s), want); }
console.log('arrange 12,13,J ->', arrange([find(0,12), find(0,13), J1]).vals, ' 5,J,J ->', arrange([find(0,5), J1, J2]).vals);
// 整局模擬
function round(levels, seed) {
  let s = seed; const rnd = () => (s = (s * 1103515245 + 12345) % 2147483648) / 2147483648;
  const pool = T.map(t => t.id).sort(() => rnd() - .5);
  const P = levels.map(l => ({ l, hand: pool.splice(0, 14), ice: false }));
  let table = [], turn = 0, passes = 0, turns = 0;
  while (turns++ < 600) {
    const p = P[turn];
    const t0 = Date.now();
    const r = RK.aiTurn(table, p.hand, p.ice, p.l);
    const dt = Date.now() - t0; if (dt > 1500) console.log('slow', dt);
    if (r) {
      const all = [...r.table.flat(), ...r.hand].sort((a, b) => a - b).join(), was = [...table.flat(), ...p.hand].sort((a, b) => a - b).join();
      if (all !== was) { console.log('TILE MISMATCH'); return null; }
      if (!r.table.every(valid)) { console.log('INVALID TABLE'); return null; }
      table = r.table; p.hand = r.hand; p.ice = true; passes = 0;
      if (!p.hand.length) return { winner: turn, turns };
    } else {
      if (pool.length) p.hand.push(pool.pop()); else if (++passes >= P.length) return { winner: -1, turns };
    }
    turn = (turn + 1) % P.length;
  }
  return { winner: -2, turns };
}
const wins = {}; let t0 = Date.now();
for (let g = 0; g < 40; g++) { const r = round([1, 2, 3, 3], 1000 + g * 7); if (!r) break; const k = r.winner < 0 ? 'none' : 'L' + [1, 2, 3, 3][r.winner] + '#' + r.winner; wins[k] = (wins[k] || 0) + 1; }
console.log(wins, (Date.now() - t0) + 'ms');
