// 象棋引擎：走法產生、將軍判斷、alpha-beta 搜尋。主畫面和 Web Worker 共用同一份程式（ENGINE.toString() 丟進 Worker）
function ENGINE(X) {
  'use strict';
  // 棋子：正數紅、負數黑。1 帥將 2 仕士 3 相象 4 傌馬 5 俥車 6 炮包 7 兵卒
  // 棋盤 index = r*9+c，r=0 是黑方底線（上方），r=9 是紅方底線（下方）
  const BASE = [0, 0, 120, 120, 270, 600, 285, 30];
  const T = rows => rows.flat();
  const PST = [null,
    T([[0,0,0,-8,-8,-8,0,0,0],[0,0,0,-8,-8,-8,0,0,0],[0,0,0,-8,-8,-8,0,0,0],[0,0,0,0,0,0,0,0,0],[0,0,0,0,0,0,0,0,0],[0,0,0,0,0,0,0,0,0],[0,0,0,0,0,0,0,0,0],[0,0,0,-9,-9,-9,0,0,0],[0,0,0,-6,-4,-6,0,0,0],[0,0,0,-2,2,-2,0,0,0]]),
    T([[0,0,0,0,0,0,0,0,0],[0,0,0,0,0,0,0,0,0],[0,0,0,0,0,0,0,0,0],[0,0,0,0,0,0,0,0,0],[0,0,0,0,0,0,0,0,0],[0,0,0,0,0,0,0,0,0],[0,0,0,0,0,0,0,0,0],[0,0,0,0,0,0,0,0,0],[0,0,0,0,4,0,0,0,0],[0,0,0,0,0,0,0,0,0]]),
    T([[0,0,0,0,0,0,0,0,0],[0,0,0,0,0,0,0,0,0],[0,0,0,0,0,0,0,0,0],[0,0,0,0,0,0,0,0,0],[0,0,0,0,0,0,0,0,0],[0,0,-2,0,0,0,-2,0,0],[0,0,0,0,0,0,0,0,0],[-2,0,0,0,4,0,0,0,-2],[0,0,0,0,0,0,0,0,0],[0,0,0,0,0,0,0,0,0]]),
    T([[4,8,16,12,4,12,16,8,4],[4,10,28,16,8,16,28,10,4],[12,14,16,20,18,20,16,14,12],[8,24,18,24,20,24,18,24,8],[6,16,14,18,16,18,14,16,6],[4,12,16,14,12,14,16,12,4],[2,6,8,6,10,6,8,6,2],[4,2,8,8,4,8,8,2,4],[0,2,4,4,-2,4,4,2,0],[0,-4,0,0,0,0,0,-4,0]]),
    T([[14,14,12,18,16,18,12,14,14],[16,20,18,24,26,24,18,20,16],[12,12,12,18,18,18,12,12,12],[12,18,16,22,22,22,16,18,12],[12,14,12,18,18,18,12,14,12],[12,16,14,20,20,20,14,16,12],[6,10,8,14,14,14,8,10,6],[4,8,6,14,12,14,6,8,4],[8,4,8,16,8,16,8,4,8],[-2,10,6,14,12,14,6,10,-2]]),
    T([[6,4,0,-10,-12,-10,0,4,6],[2,2,0,-4,-14,-4,0,2,2],[2,2,0,-10,-8,-10,0,2,2],[0,0,-2,4,10,4,-2,0,0],[0,0,0,2,8,2,0,0,0],[-2,0,4,2,6,2,4,0,-2],[0,0,0,2,4,2,0,0,0],[4,0,8,6,10,6,8,0,4],[0,2,4,6,6,6,4,2,0],[0,0,2,6,6,6,2,0,0]]),
    T([[0,0,0,2,4,2,0,0,0],[20,30,50,65,70,65,50,30,20],[20,30,45,55,55,55,45,30,20],[20,27,30,40,42,40,30,27,20],[10,18,22,35,40,35,22,18,10],[3,0,4,0,7,0,4,0,3],[-2,0,-2,0,6,0,-2,0,-2],[0,0,0,0,0,0,0,0,0],[0,0,0,0,0,0,0,0,0],[0,0,0,0,0,0,0,0,0]]),
  ];
  // PV[p+7][sq]：紅方角度的分數
  const PV = [];
  for (let p = -7; p <= 7; p++) {
    const a = new Int32Array(90);
    if (p) for (let sq = 0; sq < 90; sq++) {
      const t = Math.abs(p), r = sq / 9 | 0, c = sq % 9, idx = p > 0 ? sq : (9 - r) * 9 + c;
      a[sq] = (p > 0 ? 1 : -1) * (BASE[t] + PST[t][idx]);
    }
    PV.push(a);
  }
  // Zobrist
  let rs = 0x9e3779b9 | 0;
  const rnd32 = () => { rs ^= rs << 13; rs ^= rs >>> 17; rs ^= rs << 5; return rs | 0; };
  const Z1 = [], Z2 = [];
  for (let p = 0; p < 15; p++) { const a = new Int32Array(90), b2 = new Int32Array(90); for (let i = 0; i < 90; i++) { a[i] = rnd32(); b2[i] = rnd32(); } Z1.push(a); Z2.push(b2); }
  const ZS1 = rnd32(), ZS2 = rnd32();

  const b = new Int8Array(90);
  let side = 1, score = 0, k1 = 0, k2 = 0, kr = 85, kb = 4;
  const D4 = [[-1, 0], [1, 0], [0, -1], [0, 1]], DD = [[-1, -1], [-1, 1], [1, -1], [1, 1]];
  const NM = [[-2, -1, -1, 0], [-2, 1, -1, 0], [2, -1, 1, 0], [2, 1, 1, 0], [-1, -2, 0, -1], [1, -2, 0, -1], [-1, 2, 0, 1], [1, 2, 0, 1]];

  function setPos(arr, s) {
    score = 0; k1 = 0; k2 = 0;
    for (let i = 0; i < 90; i++) {
      b[i] = arr[i];
      if (arr[i]) { score += PV[arr[i] + 7][i]; k1 ^= Z1[arr[i] + 7][i]; k2 ^= Z2[arr[i] + 7][i]; if (arr[i] === 1) kr = i; if (arr[i] === -1) kb = i; }
    }
    side = s; if (s < 0) { k1 ^= ZS1; k2 ^= ZS2; }
  }
  function startPos() {
    const a = new Array(90).fill(0), back = [5, 4, 3, 2, 1, 2, 3, 4, 5];
    for (let c = 0; c < 9; c++) { a[c] = -back[c]; a[81 + c] = back[c]; }
    a[19] = a[25] = -6; a[64] = a[70] = 6;
    for (let c = 0; c < 9; c += 2) { a[27 + c] = -7; a[54 + c] = 7; }
    return a;
  }
  const inPal = (r, c, s) => c >= 3 && c <= 5 && (s > 0 ? r >= 7 && r <= 9 : r >= 0 && r <= 2);

  function gen(caps) {
    const mv = [], s = side;
    for (let sq = 0; sq < 90; sq++) {
      const p = b[sq];
      if (!p || (p > 0) !== (s > 0)) continue;
      const t = p > 0 ? p : -p, r = sq / 9 | 0, c = sq % 9;
      const add = to => { const q = b[to]; if (q && (q > 0) === (s > 0)) return; if (caps && !q) return; mv.push(sq << 7 | to); };
      switch (t) {
        case 1: for (const [dr, dc] of D4) { const nr = r + dr, nc = c + dc; if (inPal(nr, nc, s)) add(nr * 9 + nc); } break;
        case 2: for (const [dr, dc] of DD) { const nr = r + dr, nc = c + dc; if (inPal(nr, nc, s)) add(nr * 9 + nc); } break;
        case 3: for (const [dr, dc] of DD) {
          const nr = r + 2 * dr, nc = c + 2 * dc;
          if (nr < 0 || nr > 9 || nc < 0 || nc > 8) continue;
          if (s > 0 ? nr < 5 : nr > 4) continue;
          if (b[(r + dr) * 9 + c + dc]) continue;
          add(nr * 9 + nc);
        } break;
        case 4: for (const [dr, dc, lr, lc] of NM) {
          const nr = r + dr, nc = c + dc;
          if (nr < 0 || nr > 9 || nc < 0 || nc > 8) continue;
          if (b[(r + lr) * 9 + c + lc]) continue;
          add(nr * 9 + nc);
        } break;
        case 5: for (const [dr, dc] of D4) {
          let nr = r + dr, nc = c + dc;
          while (nr >= 0 && nr <= 9 && nc >= 0 && nc <= 8) {
            const to = nr * 9 + nc, q = b[to];
            if (!q) { if (!caps) mv.push(sq << 7 | to); }
            else { if ((q > 0) !== (s > 0)) mv.push(sq << 7 | to); break; }
            nr += dr; nc += dc;
          }
        } break;
        case 6: for (const [dr, dc] of D4) {
          let nr = r + dr, nc = c + dc, jumped = false;
          while (nr >= 0 && nr <= 9 && nc >= 0 && nc <= 8) {
            const to = nr * 9 + nc, q = b[to];
            if (!jumped) { if (!q) { if (!caps) mv.push(sq << 7 | to); } else jumped = true; }
            else if (q) { if ((q > 0) !== (s > 0)) mv.push(sq << 7 | to); break; }
            nr += dr; nc += dc;
          }
        } break;
        case 7: {
          const f = s > 0 ? -1 : 1, nr = r + f;
          if (nr >= 0 && nr <= 9) add(nr * 9 + c);
          if (s > 0 ? r <= 4 : r >= 5) { if (c > 0) add(sq - 1); if (c < 8) add(sq + 1); }
        } break;
      }
    }
    return mv;
  }

  // s 這一方的帥（將）有沒有被攻擊（含將帥對面）
  function inCheck(s) {
    const k = s > 0 ? kr : kb, r = k / 9 | 0, c = k % 9, e = -s;
    for (const [dr, dc] of D4) {
      let nr = r + dr, nc = c + dc, found = 0;
      while (nr >= 0 && nr <= 9 && nc >= 0 && nc <= 8) {
        const q = b[nr * 9 + nc];
        if (q) {
          if (!found) { if (q === e * 5 || (dc === 0 && q === e)) return true; found = 1; }
          else { if (q === e * 6) return true; break; }
        }
        nr += dr; nc += dc;
      }
    }
    for (const [dr, dc] of NM) {
      const nr = r + dr, nc = c + dc;
      if (nr < 0 || nr > 9 || nc < 0 || nc > 8 || b[nr * 9 + nc] !== e * 4) continue;
      const lr = Math.abs(dr) === 2 ? nr - Math.sign(dr) : nr, lc = Math.abs(dc) === 2 ? nc - Math.sign(dc) : nc;
      if (!b[lr * 9 + lc]) return true;
    }
    const ef = e > 0 ? -1 : 1, pr = r - ef;
    if (pr >= 0 && pr <= 9 && b[pr * 9 + c] === e * 7) return true;
    if (c > 0 && b[k - 1] === e * 7) return true;
    if (c < 8 && b[k + 1] === e * 7) return true;
    return false;
  }

  function make(m) {
    const f = m >> 7, t = m & 127, p = b[f], q = b[t];
    score += PV[p + 7][t] - PV[p + 7][f];
    k1 ^= Z1[p + 7][f] ^ Z1[p + 7][t] ^ ZS1; k2 ^= Z2[p + 7][f] ^ Z2[p + 7][t] ^ ZS2;
    if (q) { score -= PV[q + 7][t]; k1 ^= Z1[q + 7][t]; k2 ^= Z2[q + 7][t]; }
    b[t] = p; b[f] = 0;
    if (p === 1) kr = t; else if (p === -1) kb = t;
    side = -side;
    return q;
  }
  function unmake(m, q) {
    const f = m >> 7, t = m & 127, p = b[t];
    side = -side;
    b[f] = p; b[t] = q;
    if (p === 1) kr = f; else if (p === -1) kb = f;
    score -= PV[p + 7][t] - PV[p + 7][f];
    k1 ^= Z1[p + 7][f] ^ Z1[p + 7][t] ^ ZS1; k2 ^= Z2[p + 7][f] ^ Z2[p + 7][t] ^ ZS2;
    if (q) { score += PV[q + 7][t]; k1 ^= Z1[q + 7][t]; k2 ^= Z2[q + 7][t]; }
  }
  function legal() {
    const out = [];
    for (const m of gen(false)) { const q = make(m); if (!inCheck(-side)) out.push(m); unmake(m, q); }
    return out;
  }

  // ---------- 搜尋 ----------
  const MATE = 30000, TTN = 1 << 20, TTM = TTN - 1;
  const ttK = new Int32Array(TTN), ttD = new Int8Array(TTN), ttF = new Int8Array(TTN), ttS = new Int32Array(TTN), ttMv = new Int32Array(TTN);
  const hist = new Int32Array(1 << 14);
  let killers = [], nodes = 0, stopAt = 0, aborted = false, path = [], gameKeys = new Set(), enh = false;
  // 有沒有大子（車馬炮）：只剩兵士象時不做空著裁剪，免得算錯「等著」的殘局
  function hasBig(s) { for (let i = 0; i < 90; i++) { const p = b[i] * s; if (p === 4 || p === 5 || p === 6) return true; } return false; }
  const LVA = [0, 7, 2, 2, 4, 6, 5, 1], MVV = [0, 100, 20, 20, 40, 90, 45, 10];

  function order(mv, ttm, ply) {
    const sc = new Int32Array(mv.length), k = killers[ply] || [];
    for (let i = 0; i < mv.length; i++) {
      const m = mv[i], q = b[m & 127];
      if (m === ttm) sc[i] = 1e9;
      else if (q) sc[i] = 1e8 + MVV[Math.abs(q)] * 10 - LVA[Math.abs(b[m >> 7])];
      else if (m === k[0]) sc[i] = 9e7; else if (m === k[1]) sc[i] = 8e7;
      else sc[i] = hist[m];
    }
    const idx = mv.map((_, i) => i).sort((a, c) => sc[c] - sc[a]);
    return idx.map(i => mv[i]);
  }
  function quiesce(alpha, beta, qd) {
    nodes++;
    const stand = side * score;
    if (stand >= beta) return stand;
    if (stand > alpha) alpha = stand;
    if (qd > 6) return stand;
    const mv = order(gen(true), 0, 60);
    for (const m of mv) {
      const q = make(m);
      if (inCheck(-side)) { unmake(m, q); continue; }
      const v = q === 1 || q === -1 ? MATE : -quiesce(-beta, -alpha, qd + 1);
      unmake(m, q);
      if (v >= beta) return v;
      if (v > alpha) alpha = v;
    }
    return alpha;
  }
  function search(depth, alpha, beta, ply, noNull) {
    if ((++nodes & 2047) === 0 && Date.now() > stopAt) aborted = true;
    if (aborted) return 0;
    if (ply > 0 && (gameKeys.has(k1) || path.includes(k1))) return 0;   // 重複局面當和
    const chk = inCheck(side);
    if (chk) depth++;
    if (depth <= 0) return quiesce(alpha, beta, 0);
    const ti = k1 & TTM; let ttm = 0;
    if (ttK[ti] === k2) {
      ttm = ttMv[ti];
      if (ply > 0 && ttD[ti] >= depth) {
        let s = ttS[ti];
        if (s > MATE - 200) s -= ply; else if (s < -MATE + 200) s += ply;
        if (ttF[ti] === 0) return s;
        if (ttF[ti] === 1 && s >= beta) return s;
        if (ttF[ti] === 2 && s <= alpha) return s;
      }
    }
    // 空著裁剪（困難、霸王）：讓對方連走兩步都還是夠好，就不用再細算
    if (enh && !noNull && !chk && depth >= 3 && ply > 0 && beta < MATE - 200 && side * score >= beta && hasBig(side)) {
      const R = depth > 6 ? 3 : 2;
      side = -side; k1 ^= ZS1; k2 ^= ZS2;
      const v = -search(depth - 1 - R, -beta, -beta + 1, ply + 1, true);
      side = -side; k1 ^= ZS1; k2 ^= ZS2;
      if (aborted) return 0;
      if (v >= beta) return v;
    }
    const a0 = alpha;
    let best = -MATE - 1, bestM = 0, n = 0;
    path.push(k1);
    const kl = killers[ply] || [];
    for (const m of order(gen(false), ttm, ply)) {
      const q = make(m);
      if (inCheck(-side)) { unmake(m, q); continue; }
      n++;
      let v;
      if (n === 1) v = -search(depth - 1, -beta, -alpha, ply + 1);
      else {
        // 後面的普通步（不吃子、不將軍、不是殺手步）先少算一兩層，看起來有用再算足
        let red = 0;
        if (enh && n >= 4 && depth >= 3 && !chk && !q && m !== kl[0] && m !== kl[1] && !inCheck(side)) red = n >= 12 && depth >= 5 ? 2 : 1;
        v = -search(depth - 1 - red, -alpha - 1, -alpha, ply + 1);
        if (red && v > alpha) v = -search(depth - 1, -alpha - 1, -alpha, ply + 1);
        if (v > alpha && v < beta) v = -search(depth - 1, -beta, -alpha, ply + 1);
      }
      unmake(m, q);
      if (aborted) { path.pop(); return 0; }
      if (v > best) { best = v; bestM = m; }
      if (v > alpha) alpha = v;
      if (alpha >= beta) {
        if (!q) { const k = killers[ply] || (killers[ply] = [0, 0]); if (k[0] !== m) { k[1] = k[0]; k[0] = m; } hist[m] += depth * depth; }
        break;
      }
    }
    path.pop();
    if (!n) return -MATE + ply;   // 沒有合法步：將死或困斃都算輸
    let s = best;
    if (s > MATE - 200) s += ply; else if (s < -MATE + 200) s -= ply;
    ttK[ti] = k2; ttD[ti] = depth; ttS[ti] = s; ttMv[ti] = bestM;
    ttF[ti] = best <= a0 ? 2 : best >= beta ? 1 : 0;
    return best;
  }
  // 開局庫：名局裡這個局面大家怎麼走。mode 'wide'＝照出現次數隨機挑；'best'＝挑次數多又勝率高的
  function bookMove(mode) {
    const e = X.book[(k1 >>> 0).toString(36) + '.' + (k2 >>> 0).toString(36)];
    if (!e) return 0;
    const lg = legal();
    const c = e.filter(x => lg.includes(x[0]));
    if (!c.length) return 0;
    const w = c.map(([m, n, sc]) => mode === 'best' ? (sc >= .42 ? Math.pow(n, 1.6) * (0.5 + sc) : 0) : n);
    let tot = w.reduce((a, x) => a + x, 0);
    if (!tot) return 0;
    let r = Math.random() * tot;
    for (let i = 0; i < c.length; i++) { r -= w[i]; if (r <= 0) return c[i][0]; }
    return c[0][0];
  }
  // 依難度思考，回傳 { move, score, depth }
  function think(opt) {
    gameKeys = new Set(opt.keys || []);
    enh = !!opt.enh;
    if (opt.book && X.book) {
      const bm = bookMove(opt.book);
      if (bm) return { move: bm, score: 0, depth: 0, book: true };
    }
    nodes = 0; aborted = false; path = []; killers = []; hist.fill(0);
    const root = legal();
    if (!root.length) return { move: 0, score: -MATE, depth: 0 };
    if (opt.level === 'easy') {
      // 入門：每一步只看一層＋吃子延伸，再用隨機性挑一個還不錯的
      stopAt = Date.now() + 5000;
      const list = root.map(m => { const q = make(m); const v = q === 1 || q === -1 ? MATE : -search(1, -MATE, MATE, 1); unmake(m, q); return { m, v }; });
      list.sort((a, c) => c.v - a.v);
      const top = list[0].v;
      if (top > MATE - 200) return { move: list[0].m, score: top, depth: 1 };
      const w = list.map(x => Math.exp((x.v - top) / 70));
      let r = Math.random() * w.reduce((a, c) => a + c, 0);
      for (let i = 0; i < list.length; i++) { r -= w[i]; if (r <= 0) return { move: list[i].m, score: list[i].v, depth: 1 }; }
      return { move: list[0].m, score: top, depth: 1 };
    }
    stopAt = Date.now() + opt.time;
    let bestM = root[0], bestV = 0, done = 0;
    for (let d = 1; d <= opt.maxDepth; d++) {
      let alpha = -MATE - 1, curBest = 0, curV = -MATE - 1;
      const ordered = [bestM, ...root.filter(m => m !== bestM)];
      path = [k1];
      for (const m of ordered) {
        const q = make(m);
        let v;
        if (q === 1 || q === -1) v = MATE;
        else if (curV === -MATE - 1) v = -search(d - 1, -MATE - 1, -alpha, 1);
        else { v = -search(d - 1, -alpha - 1, -alpha, 1); if (v > alpha && !aborted) v = -search(d - 1, -MATE - 1, -alpha, 1); }
        unmake(m, q);
        if (aborted) break;
        if (v > curV) { curV = v; curBest = m; }
        if (v > alpha) alpha = v;
      }
      if (aborted) { if (curBest && curV > bestV && d > 1) bestM = curBest; break; }
      bestM = curBest; bestV = curV; done = d;
      if (curV > MATE - 200 || curV < -MATE + 200) break;
      if (Date.now() > stopAt - opt.time * .45) break;   // 下一層多半來不及
    }
    return { move: bestM, score: bestV, depth: done, nodes };
  }

  Object.assign(X, { setPos, startPos, gen, legal, inCheck, make, unmake, think, key2: () => k2 });
  // 用 defineProperty 才會一直讀到最新的值（Object.assign 只會複製當下的值）
  Object.defineProperties(X, { board: { get: () => b, configurable: true }, side: { get: () => side, configurable: true }, key: { get: () => k1, configurable: true } });
  if (typeof X.postMessage === 'function' && typeof window === 'undefined') {
    X.onmessage = e => { const d = e.data; if (d.bookData) { X.book = d.bookData; return; } setPos(d.pos, d.side); const r = think(d); X.postMessage({ id: d.id, ...r }); };
  }
  return X;
}
