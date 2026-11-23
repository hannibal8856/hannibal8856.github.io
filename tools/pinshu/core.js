// 拼數牌：牌組判斷、計分、電腦出牌。純函式，畫面和測試共用
// 牌：{ id, c: 0 紅 1 藍 2 橘 3 黑 / -1 鬼牌, n: 1～13 / 0 }
const RK = (() => {
  'use strict';
  function makeTiles() {
    const t = [];
    for (let k = 0; k < 2; k++) for (let c = 0; c < 4; c++) for (let n = 1; n <= 13; n++) t.push({ id: t.length, c, n });
    t.push({ id: t.length, c: -1, n: 0 }, { id: t.length + 1, c: -1, n: 0 });
    return t;
  }
  const T = makeTiles();
  const isJ = id => T[id].c < 0;
  const tileVal = id => isJ(id) ? 30 : T[id].n;   // 結算時手上的鬼牌罰 30

  // 排出牌組的順序和鬼牌代表的值；不合法回傳 null
  // 回傳 { kind: 'run'|'group', order: [id...], vals: [數字...], pts }
  function arrange(ids) {
    if (ids.length < 3) return null;
    const js = ids.filter(isJ), ns = ids.filter(id => !isJ(id));
    if (!ns.length) return null;
    const opts = [];
    // 同數：數字相同、顏色不重複、最多 4 張
    const n0 = T[ns[0]].n;
    if (ids.length <= 4 && ns.every(id => T[id].n === n0) && new Set(ns.map(id => T[id].c)).size === ns.length) {
      const order = [...ns].sort((a, b) => T[a].c - T[b].c).concat(js);
      opts.push({ kind: 'group', order, vals: order.map(() => n0), pts: n0 * ids.length });
    }
    // 順子：同一個顏色、數字不重複、可以排進 1～13 裡長度剛好的區間
    const c0 = T[ns[0]].c;
    if (ns.every(id => T[id].c === c0)) {
      const sorted = [...ns].sort((a, b) => T[a].n - T[b].n);
      const nums = sorted.map(id => T[id].n);
      if (new Set(nums).size === nums.length) {
        const L = ids.length, lo = nums[0], hi = nums[nums.length - 1];
        if (hi - lo + 1 <= L && L <= 13) {
          // 多出來的鬼牌先接在後面，接不下再放前面
          let extra = L - (hi - lo + 1), start = lo, end = hi;
          while (extra > 0 && end < 13) { end++; extra--; }
          while (extra > 0 && start > 1) { start--; extra--; }
          if (!extra) {
            const order = [], vals = []; let ji = 0, si = 0;
            for (let v = start; v <= end; v++) {
              if (si < sorted.length && T[sorted[si]].n === v) order.push(sorted[si++]); else order.push(js[ji++]);
              vals.push(v);
            }
            opts.push({ kind: 'run', order, vals, pts: vals.reduce((a, x) => a + x, 0) });
          }
        }
      }
    }
    if (!opts.length) return null;
    return opts.sort((a, b) => b.pts - a.pts)[0];
  }
  const valid = ids => !!arrange(ids);
  const pts = ids => { const a = arrange(ids); return a ? a.pts : 0; };

  // ---------- 電腦 ----------
  // 從一堆牌裡列出所有可能的牌組（同數、順子，可用鬼牌補洞）
  function candidates(ids, maxJ = 2) {
    const js = ids.filter(isJ).slice(0, maxJ), ns = ids.filter(id => !isJ(id));
    const out = [], seen = new Set();
    const push = set => { const k = set.map(id => isJ(id) ? 'J' : T[id].c + '.' + T[id].n).sort().join(',') + '|' + set.filter(isJ).length; if (seen.has(k)) return; seen.add(k); out.push(set); };
    // 每種牌（顏色＋數字）只挑一張代表，重複的另一張留著
    const byCN = new Map();
    for (const id of ns) { const k = T[id].c * 20 + T[id].n; if (!byCN.has(k)) byCN.set(k, []); byCN.get(k).push(id); }
    // 同數
    for (let n = 1; n <= 13; n++) {
      const cols = [];
      for (let c = 0; c < 4; c++) if (byCN.has(c * 20 + n)) cols.push(byCN.get(c * 20 + n)[0]);
      const subsets = [];
      const rec = (i, cur) => { if (i === cols.length) { if (cur.length) subsets.push(cur); return; } rec(i + 1, cur); rec(i + 1, [...cur, cols[i]]); };
      rec(0, []);
      for (const s of subsets) for (let j = 0; j <= js.length; j++) { const L = s.length + j; if (L >= 3 && L <= 4 && s.length >= 1) push([...s, ...js.slice(0, j)]); }
    }
    // 順子
    for (let c = 0; c < 4; c++) {
      for (let a = 1; a <= 13; a++) {
        let used = [], jUsed = 0;
        for (let b = a; b <= 13; b++) {
          const k = c * 20 + b;
          if (byCN.has(k)) used.push(byCN.get(k)[0]);
          else { if (jUsed >= js.length) break; jUsed++; }
          const L = b - a + 1;
          if (L >= 3 && used.length >= 1 && byCN.has(c * 20 + a)) {
            push([...used, ...js.slice(0, jUsed)]);
          }
          if (L >= 3 && used.length >= 2 && jUsed < js.length && b === 13) { /* 鬼牌接前面的情況由 arrange 處理 */ }
        }
      }
    }
    return out.filter(valid);
  }
  // 從手牌挑幾組互不重複的牌組；score(sets) 越大越好
  function bestCombo(hand, score, ms = 120) {
    const cands = candidates(hand).sort((a, b) => b.length - a.length);
    const t0 = Date.now();
    let best = [], bestS = score([]);
    const used = new Set();
    function dfs(i, cur) {
      if (Date.now() - t0 > ms) return;
      const s = score(cur);
      if (s > bestS) { bestS = s; best = cur.slice(); }
      for (let k = i; k < cands.length; k++) {
        const c = cands[k];
        if (c.some(id => used.has(id))) continue;
        c.forEach(id => used.add(id)); cur.push(c);
        dfs(k + 1, cur);
        cur.pop(); c.forEach(id => used.delete(id));
      }
    }
    dfs(0, []);
    return best;
  }
  const sumPts = sets => sets.reduce((a, s) => a + pts(s), 0);
  const cnt = sets => sets.reduce((a, s) => a + s.length, 0);

  // 電腦這一回合：回傳 { table, hand, played: [id...] }；沒出牌回傳 null
  // level：1 簡單（只出新牌組、接牌）、2 普通（再加拆順子插牌、換鬼牌）、3 厲害（再加借桌上的牌湊新牌組）
  function aiTurn(table, hand, ice, level, iceNeed = 30) {
    table = table.map(s => s.slice()); hand = hand.slice();
    const start = new Set(hand);
    if (!ice) {
      const combo = bestCombo(hand, sets => { const p = sumPts(sets); return p >= iceNeed ? 1000 + cnt(sets) * 10 + p / 100 : p / 1000; }, 200);
      if (sumPts(combo) < iceNeed) return null;
      for (const s of combo) { table.push(arrange(s).order); s.forEach(id => hand.splice(hand.indexOf(id), 1)); }
      return { table, hand, played: [...start].filter(id => !hand.includes(id)) };
    }
    const take = id => hand.splice(hand.indexOf(id), 1);
    let changed = true, guard = 0;
    while (changed && guard++ < 40) {
      changed = false;
      // 1. 手上的新牌組（簡單的電腦不太會留鬼牌）
      const combo = bestCombo(hand, sets => cnt(sets) * 100 + sumPts(sets), level >= 3 ? 150 : 80);
      if (combo.length) { for (const s of combo) { table.push(arrange(s).order); s.forEach(take); } changed = true; continue; }
      // 2. 接到桌上的牌組
      for (const id of hand.slice()) {
        for (let i = 0; i < table.length; i++) {
          const ns = [...table[i], id];
          if (valid(ns)) { table[i] = arrange(ns).order; take(id); changed = true; break; }
        }
      }
      if (changed) continue;
      if (level < 2) break;
      // 3. 拆順子插一張：紅 3-4-5-6-7 加紅 5 → 3-4-5、5-6-7
      outer3:
      for (const id of hand.slice()) {
        if (isJ(id)) continue;
        for (let i = 0; i < table.length; i++) {
          const a = arrange(table[i]);
          if (a.kind !== 'run' || a.order.length < 5) continue;
          const k = a.vals.indexOf(T[id].n);
          if (k < 0 || T[a.order.find(x => !isJ(x))].c !== T[id].c) continue;
          const left = a.order.slice(0, k + 1), right = [id, ...a.order.slice(k + 1)];
          // 兩邊都要合法（插的那張接右邊，原本那張留左邊）
          if (valid(left) && valid(right)) { table.splice(i, 1, arrange(left).order, arrange(right).order); take(id); changed = true; break outer3; }
          const left2 = [...a.order.slice(0, k), id], right2 = a.order.slice(k);
          if (valid(left2) && valid(right2)) { table.splice(i, 1, arrange(left2).order, arrange(right2).order); take(id); changed = true; break outer3; }
        }
      }
      if (changed) continue;
      // 4. 用真牌換下桌上的鬼牌，換到的鬼牌這一回合要用掉
      outer4:
      for (const id of hand.slice()) {
        if (isJ(id)) continue;
        for (let i = 0; i < table.length; i++) {
          const a = arrange(table[i]);
          const jk = a.order.findIndex((x, k) => isJ(x) && a.vals[k] === T[id].n);
          if (jk < 0) continue;
          const joker = a.order[jk];
          const ns = a.order.map(x => x === joker ? id : x);
          if (!valid(ns)) continue;
          // 試著把鬼牌用掉：和手牌組新牌組，或接到別組
          const trial = table.map(s => s.slice()); trial[i] = arrange(ns).order;
          const h2 = hand.filter(x => x !== id);
          const withJ = [...h2, joker];
          const cs = candidates(withJ).filter(s => s.includes(joker) && s.length - 1 >= 2);
          if (cs.length) {
            const s = cs.sort((x, y) => y.length - x.length)[0];
            trial.push(arrange(s).order);
            table.length = 0; trial.forEach(x => table.push(x));
            take(id); s.forEach(x => { if (x !== joker) take(x); });
            changed = true; break outer4;
          }
          for (let j = 0; j < trial.length; j++) {
            if (j === i) continue;
            const ns2 = [...trial[j], joker];
            if (valid(ns2)) { trial[j] = arrange(ns2).order; table.length = 0; trial.forEach(x => table.push(x)); take(id); changed = true; break outer4; }
          }
        }
      }
      if (changed) continue;
      if (level < 3) break;
      // 5. 借桌上多出來的牌（長順子的頭尾、四張同數的任一張）和手牌湊新牌組
      const spare = [];
      table.forEach((s, i) => {
        const a = arrange(s);
        if (a.order.length >= 4) {
          if (a.kind === 'run') { spare.push([a.order[0], i]); spare.push([a.order[a.order.length - 1], i]); }
          else a.order.forEach(x => spare.push([x, i]));
        }
      });
      if (!spare.length) break;
      const pool = [...hand, ...spare.map(x => x[0])];
      const cs = candidates(pool).filter(s => s.some(x => hand.includes(x)) && s.some(x => !hand.includes(x)))
        .sort((x, y) => y.filter(z => hand.includes(z)).length - x.filter(z => hand.includes(z)).length);
      for (const s of cs) {
        const trial = table.map(x => x.slice());
        let ok = true;
        for (const x of s) if (!hand.includes(x)) { const src = spare.find(p => p[0] === x)[1]; trial[src] = trial[src].filter(y => y !== x); }
        for (const t of trial) if (t.length && !valid(t)) { ok = false; break; }
        if (!ok) continue;
        const nt = trial.filter(t => t.length).map(t => arrange(t).order);
        nt.push(arrange(s).order);
        table.length = 0; nt.forEach(x => table.push(x));
        s.forEach(x => { if (hand.includes(x)) take(x); });
        changed = true; break;
      }
    }
    if (hand.length === start.size) return null;
    if (!table.every(valid)) return null;   // 保險：桌面一定要合法
    return { table, hand, played: [...start].filter(id => !hand.includes(id)) };
  }

  return { T, isJ, tileVal, arrange, valid, pts, candidates, bestCombo, aiTurn };
})();
if (typeof module !== 'undefined') module.exports = RK;
