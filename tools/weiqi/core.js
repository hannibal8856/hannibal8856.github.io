// 圍棋核心: 規則 (提子, 禁著, 打劫), 解題搜尋 (吃子, 做活, 殺棋), Benson 無條件活棋, 9 路電腦 (UCT + RAVE), 數地
// 主畫面和 Web Worker 共用 (GOCORE.toString() 丟進 Worker)
function GOCORE(X) {
  'use strict';
  const EMPTY = 0, BLACK = 1, WHITE = 2, EDGE = 3;
  const opp = c => 3 - c;

  // ---------- 棋盤 ----------
  // 外圍多一圈 EDGE, index = (y+1)*W + (x+1), W = N+2
  class Board {
    constructor(N) {
      this.N = N; this.W = N + 2; const L = this.W * this.W;
      this.a = new Uint8Array(L).fill(EDGE);
      for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) this.a[this.p(x, y)] = EMPTY;
      this.ko = -1; this.caps = [0, 0, 0]; this.dirs = [1, -1, this.W, -this.W];
      // 找棋塊用的暫存 (共用, 避免一直配置記憶體)
      this.mk = new Int32Array(L); this.lm = new Int32Array(L); this.gen = 1; this.stk = new Int32Array(L); this.ns = 0;
      this.lastCaptured = [];
    }
    p(x, y) { return (y + 1) * this.W + x + 1; }
    xy(p) { return [p % this.W - 1, (p / this.W | 0) - 1]; }
    clone() { const b = new Board(this.N); b.a.set(this.a); b.ko = this.ko; b.caps = this.caps.slice(); return b; }
    points() { if (!this._pts) { const r = []; for (let y = 0; y < this.N; y++) for (let x = 0; x < this.N; x++) r.push(this.p(x, y)); this._pts = r; } return this._pts; }
    // 快速: 數棋塊的氣 (最多數到 max 就停), 棋塊的子放在 stk[0..ns)
    libCount(p, max = 99) {
      const a = this.a, c = a[p], g = ++this.gen, stk = this.stk, mk = this.mk, lm = this.lm, d0 = 1, d1 = -1, d2 = this.W, d3 = -this.W;
      let n = 0, libs = 0; stk[n++] = p; mk[p] = g;
      for (let i = 0; i < n; i++) {
        const s = stk[i];
        for (const q of [s + d0, s + d1, s + d2, s + d3]) {
          const v = a[q];
          if (v === c) { if (mk[q] !== g) { mk[q] = g; stk[n++] = q; } }
          else if (v === EMPTY && lm[q] !== g) { lm[q] = g; if (++libs >= max) { this.ns = n; return libs; } }
        }
      }
      this.ns = n; return libs;
    }
    // 找一整塊棋和它的氣 (解題用, 回傳物件)
    chain(p) {
      const c = this.a[p], stones = [p], seen = new Set([p]), libs = new Set();
      for (let i = 0; i < stones.length; i++) for (const d of this.dirs) {
        const q = stones[i] + d, v = this.a[q];
        if (v === c && !seen.has(q)) { seen.add(q); stones.push(q); }
        else if (v === EMPTY) libs.add(q);
      }
      return { stones, libs, color: c };
    }
    libsOf(p) { return this.libCount(p); }
    // 落子: 不合法回傳 false (有子, 打劫, 自殺)
    play(p, c) {
      if (p < 0) { this.ko = -1; this.lastCaptured = []; return true; }
      const a = this.a;
      if (a[p] !== EMPTY || p === this.ko) return false;
      a[p] = c;
      const o = 3 - c, captured = [];
      for (const d of this.dirs) {
        const q = p + d;
        if (a[q] === o && this.libCount(q, 1) === 0) { for (let i = 0; i < this.ns; i++) { a[this.stk[i]] = EMPTY; captured.push(this.stk[i]); } }
      }
      const myLibs = this.libCount(p, 2), mySize = this.ns;
      if (!myLibs) { a[p] = EMPTY; return false; }
      this.caps[c] += captured.length;
      // 打劫: 提一子, 自己這顆也只剩一口氣
      this.ko = captured.length === 1 && mySize === 1 && myLibs === 1 ? captured[0] : -1;
      this.lastCaptured = captured;
      return true;
    }
    legal(p, c) {
      const a = this.a;
      if (a[p] !== EMPTY || p === this.ko) return false;
      for (const d of this.dirs) if (a[p + d] === EMPTY) return true;
      a[p] = c; let ok = this.libCount(p, 1) > 0;
      if (!ok) for (const d of this.dirs) { const q = p + d; if (a[q] === 3 - c && this.libCount(q, 1) === 0) { ok = true; break; } }
      a[p] = EMPTY; return ok;
    }
    key() { return this.a.join('') + this.ko; }
    // 真眼: 四周都是自己的子, 斜角夠多也是自己的
    isEye(p, c) {
      const a = this.a;
      if (a[p] !== EMPTY) return false;
      for (const d of this.dirs) { const v = a[p + d]; if (v !== c && v !== EDGE) return false; }
      let bad = 0, edge = 0; const W = this.W;
      for (const d of [W + 1, W - 1, -W + 1, -W - 1]) { const v = a[p + d]; if (v === EDGE) edge = 1; else if (v === 3 - c) bad++; }
      return bad + edge < 2;
    }
  }

  // ---------- Benson: 無條件活棋 ----------
  // 回傳 Set: 這個顏色無論對方怎麼下都不會被吃的棋子位置
  function benson(b, c) {
    const pts = b.points();
    // 棋塊
    const chainId = new Map(), chains = [];
    for (const p of pts) if (b.a[p] === c && !chainId.has(p)) { const ch = b.chain(p); const id = chains.length; chains.push(ch); ch.stones.forEach(s => chainId.set(s, id)); }
    // 區域: 不是 c 的點連成一片
    const regId = new Map(), regs = [];
    for (const p of pts) if (b.a[p] !== c && !regId.has(p)) {
      const id = regs.length, r = { pts: [p], empties: [], adj: new Set() }; regId.set(p, id); regs.push(r);
      for (let i = 0; i < r.pts.length; i++) {
        const q = r.pts[i]; if (b.a[q] === EMPTY) r.empties.push(q);
        for (const d of b.dirs) { const s = q + d, v = b.a[s]; if (v === EDGE) continue; if (v === c) r.adj.add(chainId.get(s)); else if (!regId.has(s)) { regId.set(s, id); r.pts.push(s); } }
      }
    }
    // 區域對某塊棋是不是 "vital": 區域裡每個空點都是那塊棋的氣
    let aliveC = new Set(chains.map((_, i) => i)), aliveR = new Set(regs.map((_, i) => i));
    const vital = (ri, ci) => regs[ri].empties.every(e => b.dirs.some(d => chainId.get(e + d) === ci));
    let changed = true;
    while (changed) {
      changed = false;
      for (const ci of [...aliveC]) {
        let n = 0; for (const ri of aliveR) if (regs[ri].adj.has(ci) && vital(ri, ci)) n++;
        if (n < 2) { aliveC.delete(ci); changed = true; }
      }
      for (const ri of [...aliveR]) { for (const ci of regs[ri].adj) if (!aliveC.has(ci)) { aliveR.delete(ri); changed = true; break; } }
    }
    const out = new Set(); for (const ci of aliveC) chains[ci].stones.forEach(s => out.add(s));
    return out;
  }

  // ---------- 解題搜尋 ----------
  // goal: { type: 'capture'|'save'|'live'|'kill', target: p, me: 顏色, area?: [p...], depth }
  // 回傳 true = 輪到 toMove 時, me 這方能達成目標
  function solve(b, toMove, goal, depth, cache) {
    const key = b.key() + toMove + depth;
    if (cache.has(key)) return cache.get(key);
    const r = solveInner(b, toMove, goal, depth, cache);
    cache.set(key, r);
    return r;
  }
  function status(b, goal) {
    // 回傳 1 = me 贏, -1 = me 輸, 0 = 還沒定
    const tgtColor = goal.tColor, t = goal.target, ts = goal.targets || [t];
    const gone = ts.some(q => b.a[q] !== tgtColor);
    if (goal.type === 'capture' || goal.type === 'kill') {
      if (gone) return 1;
      if (goal.type === 'capture' && ts.every(q => b.libsOf(q) >= (goal.escape || 3))) return -1;
      if (goal.type === 'kill' && benson(b, tgtColor).has(t)) return -1;
      return 0;
    } else {   // save, live
      if (gone) return -1;
      if (goal.type === 'save' && b.libsOf(t) >= (goal.escape || 3)) return 1;
      if (goal.type === 'live' && benson(b, tgtColor).has(t)) return 1;
      return 0;
    }
  }
  function candidates(b, c, goal) {
    let pts;
    if (goal.area) pts = goal.area.filter(p => b.a[p] === EMPTY);
    else {
      // 沒指定範圍 (吃子/逃跑題): 攻方下目標的氣, 守方下目標的氣或吃掉包圍它而只剩一氣的棋
      const s = new Set();
      for (const tp of goal.targets || [goal.target]) if (b.a[tp] === goal.tColor) {
        const t = b.chain(tp);
        t.libs.forEach(l => s.add(l));
        if (c === goal.tColor) for (const st of t.stones) for (const d of b.dirs) { const q = st + d; if (b.a[q] === opp(goal.tColor)) { const ch = b.chain(q); if (ch.libs.size === 1) ch.libs.forEach(l => s.add(l)); } }
      }
      pts = [...s];
    }
    const out = pts.filter(p => b.legal(p, c));
    const tl = b.a[goal.target] === goal.tColor ? b.chain(goal.target).libs : new Set();
    out.sort((x, y) => (tl.has(y) ? 1 : 0) - (tl.has(x) ? 1 : 0));
    return out;
  }
  function solveInner(b, toMove, goal, depth, cache) {
    const st = status(b, goal);
    if (st) return st > 0;
    // 步數用完: 逃跑題活著就算成功; 殺棋題對方還沒活就算成功 (小空間裡他有足夠步數做眼)
    if (depth <= 0) return goal.type === 'save' ? b.a[goal.target] === goal.tColor : goal.type === 'kill';
    const meTurn = toMove === goal.me;
    const moves = candidates(b, toMove, goal);
    // 對方也可以不理 (虛手或下別處); 吃子題只在剩下步數不多時才考慮, 不然征子這種長手順會算太久
    if (!meTurn && (goal.type === 'live' || goal.type === 'kill' || depth <= 8)) moves.push(-1);
    if (meTurn) {
      for (const m of moves) { const nb = b.clone(); nb.play(m, toMove); if (solve(nb, opp(toMove), goal, depth - 1, cache)) return true; }
      return false;
    } else {
      if (!moves.length) { const nb = b.clone(); nb.play(-1, toMove); return solve(nb, opp(toMove), goal, depth - 1, cache); }
      for (const m of moves) { const nb = b.clone(); nb.play(m, toMove); if (!solve(nb, opp(toMove), goal, depth - 1, cache)) return false; }
      return true;
    }
  }
  // 對方最頑強的應手 (讓 me 最難成功的那一步); 都擋不住時挑最能拖的
  function bestDefense(b, toMove, goal, depth) {
    const moves = candidates(b, toMove, goal);
    if (!moves.length) return -1;
    let fallback = moves[0], best = null;
    for (const m of moves) {
      const nb = b.clone(); nb.play(m, toMove);
      if (!solve(nb, opp(toMove), goal, depth - 1, new Map())) { best = m; break; }
      if (goal.type === 'capture' || goal.type === 'kill') { if (nb.a[goal.target] === goal.tColor && nb.libsOf(goal.target) > (b.a[goal.target] === goal.tColor ? 0 : 0)) fallback = fallback; }
    }
    if (best !== null) return best;
    // 擋不住: 挑讓目標氣最多的一步, 看起來比較自然
    if (goal.type === 'capture' || goal.type === 'save') {
      let mx = -1;
      for (const m of moves) { const nb = b.clone(); nb.play(m, toMove); if (nb.a[goal.target] !== goal.tColor) continue; const l = nb.libsOf(goal.target); if (l > mx) { mx = l; fallback = m; } }
    }
    return fallback;
  }

  // ---------- 數地 (數子法: 活子 + 圍住的空點) ----------
  function score(b, dead) {
    const a = b.a.slice(); dead = dead || new Set();
    for (const p of dead) a[p] = EMPTY;
    const own = new Int8Array(a.length);   // 1 黑 2 白 0 單官
    const seen = new Set();
    let sb = 0, sw = 0;
    for (const p of b.points()) {
      if (a[p] === BLACK) { sb++; own[p] = 1; } else if (a[p] === WHITE) { sw++; own[p] = 2; }
      else if (!seen.has(p)) {
        const reg = [p], touch = new Set(); seen.add(p);
        for (let i = 0; i < reg.length; i++) for (const d of b.dirs) { const q = reg[i] + d; if (a[q] === EMPTY && !seen.has(q)) { seen.add(q); reg.push(q); } else if (a[q] === BLACK || a[q] === WHITE) touch.add(a[q]); }
        if (touch.size === 1) { const c = [...touch][0]; reg.forEach(q => own[q] = c); if (c === BLACK) sb += reg.length; else sw += reg.length; }
      }
    }
    return { black: sb, white: sw, own };
  }

  // ---------- 電腦 (UCT + RAVE, 隨機下完數地) ----------
  function playout(b, c, amaf, maxMoves) {
    const pts = b.points(), L = pts.length, a = b.a;
    let passes = 0, moves = 0;
    while (passes < 2 && moves < maxMoves) {
      let mv = -1;
      // 對方剛下的子旁邊有只剩一口氣的棋: 吃掉或逃跑 (簡單的打吃反應)
      if (b.last >= 0 && Math.random() < .7) {
        for (const d of b.dirs) {
          const q = b.last + d;
          if ((a[q] === BLACK || a[q] === WHITE) && b.libCount(q, 2) === 1) {
            // 找那口氣
            const g = b.gen; let lib = -1;
            for (let i = 0; i < b.ns && lib < 0; i++) for (const d2 of b.dirs) { const r = b.stk[i] + d2; if (a[r] === EMPTY) { lib = r; break; } }
            if (lib >= 0 && !b.isEye(lib, c) && b.play(lib, c)) { mv = lib; break; }
          }
        }
      }
      if (mv < 0) {
        const start = Math.random() * L | 0;
        for (let i = 0; i < L; i++) {
          const p = pts[(start + i) % L];
          if (a[p] !== EMPTY || b.isEye(p, c)) continue;
          if (b.play(p, c)) { mv = p; break; }
        }
      }
      if (mv < 0) { b.play(-1, c); passes++; b.last = -1; } else { passes = 0; b.last = mv; if (amaf && !amaf.has(mv)) amaf.set(mv, c); }
      c = 3 - c; moves++;
    }
    return b;
  }
  // 快速數子 (模擬結束時用: 空點只看鄰居)
  function quickScore(b) {
    const a = b.a; let sb = 0, sw = 0;
    for (const p of b.points()) {
      const v = a[p];
      if (v === BLACK) sb++; else if (v === WHITE) sw++;
      else { let nb = 0, nw = 0; for (const d of b.dirs) { const q = a[p + d]; if (q === BLACK) nb++; else if (q === WHITE) nw++; } if (nb && !nw) sb++; else if (nw && !nb) sw++; }
    }
    return { black: sb, white: sw };
  }
  function think(pos, opt) {
    const N = pos.N, root = new Board(N); root.a.set(pos.a); root.ko = pos.ko;
    const me = pos.toMove, komi = pos.komi, t0 = Date.now();
    const node = () => ({ n: 0, w: 0, kids: null, rn: new Map(), rw: new Map() });
    const R = node();
    const legalMoves = (b, c) => { const m = []; for (const p of b.points()) if (b.a[p] === EMPTY && !b.isEye(p, c) && b.legal(p, c)) m.push(p); return m; };
    let iters = 0;
    const maxIt = opt.playouts || 3000, maxMs = opt.ms || 3000;
    const own = new Float32Array(root.a.length);
    while (iters < maxIt && Date.now() - t0 < maxMs) {
      iters++;
      const b = root.clone(); b.last = pos.last ?? -1; let c = me; const path = [R]; let nd = R;
      const amaf = new Map();
      // 選擇
      while (nd.kids && nd.n > 0) {
        let best = null, bv = -1;
        for (const [m, k] of nd.kids) {
          const rn = nd.rn.get(m) || 0, rw = nd.rw.get(m) || 0;
          const beta = rn / (rn + k.n + rn * k.n / 3000 + 1e-9);
          const q = k.n ? k.w / k.n : .5, rq = rn ? rw / rn : .5;
          const v = (1 - beta) * q + beta * rq + .35 * Math.sqrt(Math.log(nd.n + 1) / (k.n + 1));
          if (v > bv) { bv = v; best = [m, k]; }
        }
        if (!best) break;
        b.play(best[0], c); b.last = best[0]; amaf.set(best[0], c); c = opp(c); nd = best[1]; path.push(nd);
      }
      // 展開
      if (!nd.kids) { nd.kids = new Map(); for (const m of legalMoves(b, c)) nd.kids.set(m, node()); }
      // 模擬
      playout(b, c, amaf, N * N * 3);
      const sc = quickScore(b);
      const blackWin = sc.black - sc.white - komi > 0 ? 1 : 0;
      if (opt.own) for (const p of b.points()) { const v = b.a[p]; own[p] += v === BLACK ? 1 : v === WHITE ? -1 : (b.isEye(p, BLACK) ? 1 : b.isEye(p, WHITE) ? -1 : 0); }
      // 回傳: 每個節點記 "走到這個節點的那一方" 贏了沒
      let mover = me;
      for (let i = 1; i < path.length; i++) { const k = path[i]; k.n++; k.w += (mover === BLACK ? blackWin : 1 - blackWin); mover = opp(mover); }
      R.n++;
      // RAVE
      mover = me;
      for (let i = 0; i < path.length; i++) {
        const k = path[i];
        if (k.kids) for (const [m, col] of amaf) if (col === mover && k.kids.has(m)) { k.rn.set(m, (k.rn.get(m) || 0) + 1); k.rw.set(m, (k.rw.get(m) || 0) + (mover === BLACK ? blackWin : 1 - blackWin)); }
        mover = opp(mover);
      }
    }
    let best = -1, bn = -1, bw = 0;
    if (R.kids) for (const [m, k] of R.kids) if (k.n > bn) { bn = k.n; best = m; bw = k.n ? k.w / k.n : 0; }
    const ownership = Array.from(own, v => v / Math.max(1, iters));
    // 下一步也沒用 (贏面很大而且對方剛虛手, 或已經沒地方下) 就虛手
    let winrate = best < 0 ? (R.n ? 0 : .5) : bw;
    return { move: best, winrate, iters, ownership };
  }
  // 終局判斷死子: 用模擬的地盤歸屬, 在對方地盤裡的子算死
  function deadStones(b, toMove, komi, ms = 1500) {
    const r = think({ N: b.N, a: b.a, ko: b.ko, toMove, komi }, { playouts: 1500, ms, own: true });
    const dead = new Set();
    for (const p of b.points()) {
      const v = r.ownership[p];
      if (b.a[p] === BLACK && v < -.5) dead.add(p);
      if (b.a[p] === WHITE && v > .5) dead.add(p);
    }
    return dead;
  }

  Object.assign(X, { EMPTY, BLACK, WHITE, Board, benson, solve, bestDefense, score, think, deadStones, status });
  if (typeof X.postMessage === 'function' && typeof window === 'undefined') {
    X.onmessage = e => {
      const d = e.data;
      if (d.kind === 'think') X.postMessage({ id: d.id, ...think(d.pos, d.opt) });
      else if (d.kind === 'dead') { const b = new Board(d.pos.N); b.a.set(d.pos.a); X.postMessage({ id: d.id, dead: [...deadStones(b, d.pos.toMove, d.pos.komi)] }); }
    };
  }
  return X;
}
if (typeof module !== 'undefined') module.exports = GOCORE;
