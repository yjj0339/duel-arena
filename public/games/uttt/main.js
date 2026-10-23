'use strict';
window.GameDef = (() => {
  const LINES = [[0, 1, 2], [3, 4, 5], [6, 7, 8], [0, 3, 6], [1, 4, 7], [2, 5, 8], [0, 4, 8], [2, 4, 6]];
  const WB = [1.35, 1, 1.35, 1, 1.8, 1, 1.35, 1, 1.35];
  const S = { s: null, b: null, act: -1, turn: 0, over: false, last: null, winLine: null };
  let ctx = null, cv = null, g = null, W = 0, m0 = 0, B = 0, dpr = 1;
  const myIdx = () => ctx.mode === 'ai' ? 0 : ctx.side;
  const bx0 = b => m0 + (b % 3) * B;
  const by0 = b => m0 + Math.floor(b / 3) * B;

  function newGame() {
    S.s = Array.from({ length: 9 }, () => new Array(9).fill(0));
    S.b = new Array(9).fill(0); S.act = -1; S.turn = 0; S.over = false; S.last = null; S.winLine = null;
  }
  function serialize() { return { g: 'uttt', s: S.s.map(a => a.slice()), b: S.b.slice(), a: S.act, t: S.turn }; }
  function applySnap(m) {
    S.s = m.s.map(a => a.slice()); S.b = m.b.slice();
    S.act = typeof m.a === 'number' ? m.a : -1; S.turn = m.t || 0;
    S.over = false; S.winLine = null; S.last = null;
    draw(); afterTurn();
  }
  function deserialize(s) { const m = s && (s['s' + ctx.side] || s.s0 || s.s1); if (m && m.s) applySnap(m); }

  function lineWin(arr, p) { for (const L of LINES) if (arr[L[0]] === p && arr[L[1]] === p && arr[L[2]] === p) return L; return null; }
  function bigWin(p) { for (const L of LINES) if (S.b[L[0]] === p && S.b[L[1]] === p && S.b[L[2]] === p) return L; return null; }
  function legalList() {
    const out = [], bs = [];
    if (S.act >= 0 && S.b[S.act] === 0) bs.push(S.act);
    else for (let b = 0; b < 9; b++) if (!S.b[b]) bs.push(b);
    for (const b of bs) for (let i = 0; i < 9; i++) if (!S.s[b][i]) out.push([b, i]);
    return out;
  }
  function doMove(b, i) {
    if (S.over) return;
    if (S.s[b][i] || S.b[b]) return;
    if (S.act >= 0 && S.b[S.act] === 0 && S.act !== b) return;
    const p = S.turn + 1;
    S.s[b][i] = p;
    S.last = [b, i];
    ctx.sfx.play('place');
    if (lineWin(S.s[b], p)) { S.b[b] = p; ctx.sfx.play('good'); }
    else if (S.s[b].every(v => v)) S.b[b] = 3;
    S.act = S.b[i] === 0 ? i : -1;
    const wl = bigWin(p);
    if (wl) {
      S.over = true; S.winLine = wl; S.turn = -1;
      requestAnimationFrame(draw);
      const my = myIdx();
      setTimeout(() => ctx.finish(p === my + 1 ? 'win' : 'lose', p === my + 1 ? '三连大格，胜局已定！' : '对方三连大格获胜。'), 900);
      return;
    }
    if (S.b.every(v => v)) {
      S.over = true; S.turn = -1;
      requestAnimationFrame(draw);
      setTimeout(() => ctx.finish('draw', '棋局胶着，平分秋色。'), 700);
      return;
    }
    S.turn = 1 - S.turn;
    afterTurn();
  }
  function afterTurn() {
    if (S.over) return;
    const my = myIdx();
    if (S.turn === my) {
      ctx.turn(0);
      ctx.setStatus(S.act >= 0 ? '你的回合 · 须在高亮大格中落子' : '你的回合 · 可任意大格落子');
    } else {
      ctx.turn(1); ctx.setStatus('对方思考中…');
      if (ctx.mode === 'ai') setTimeout(aiMove, 500 + Math.random() * 400);
    }
  }

  function mark(x, y, r, p, lw, grad) {
    g.save();
    g.lineCap = 'round'; g.lineWidth = lw;
    if (grad) {
      const gr = g.createLinearGradient(x - r, y - r, x + r, y + r);
      gr.addColorStop(0, p === 1 ? '#00e0d2' : '#ff87a2');
      gr.addColorStop(1, p === 1 ? '#0090a8' : '#e0406a');
      g.strokeStyle = gr;
    } else g.strokeStyle = p === 1 ? '#00a8b0' : '#ff6482';
    if (p === 1) {
      g.beginPath(); g.moveTo(x - r, y - r); g.lineTo(x + r, y + r);
      g.moveTo(x + r, y - r); g.lineTo(x - r, y + r); g.stroke();
    } else {
      g.beginPath(); g.arc(x, y, r, 0, 7); g.stroke();
    }
    g.restore();
  }
  function draw() {
    if (!g) return;
    g.clearRect(0, 0, W, W);
    const bg = g.createLinearGradient(0, 0, W, W);
    bg.addColorStop(0, '#f4fcfc'); bg.addColorStop(1, '#e0f3f3');
    g.fillStyle = bg;
    g.beginPath(); g.roundRect(0, 0, W, W, 18); g.fill();
    for (let b = 0; b < 9; b++) {
      const x = bx0(b), y = by0(b);
      if (S.b[b]) {
        g.fillStyle = S.b[b] === 1 ? 'rgba(0,199,190,.10)' : S.b[b] === 2 ? 'rgba(255,100,130,.10)' : 'rgba(120,128,140,.08)';
        g.beginPath(); g.roundRect(x + 3, y + 3, B - 6, B - 6, 10); g.fill();
      } else if (S.act === b && !S.over) {
        g.fillStyle = 'rgba(0,199,190,.08)';
        g.beginPath(); g.roundRect(x + 3, y + 3, B - 6, B - 6, 10); g.fill();
        g.strokeStyle = 'rgba(0,180,190,.6)'; g.lineWidth = 2;
        g.beginPath(); g.roundRect(x + 4, y + 4, B - 8, B - 8, 9); g.stroke();
      } else if (S.act < 0 && !S.over && S.turn === myIdx()) {
        g.fillStyle = 'rgba(0,199,190,.05)';
        g.beginPath(); g.roundRect(x + 3, y + 3, B - 6, B - 6, 10); g.fill();
      }
      if (S.b[b] === 1 || S.b[b] === 2) {
        g.save(); g.globalAlpha = .92;
        g.shadowColor = S.b[b] === 1 ? 'rgba(0,199,190,.55)' : 'rgba(255,100,130,.55)';
        g.shadowBlur = 10;
        mark(x + B / 2, y + B / 2, B * .26, S.b[b], B * .085, true);
        g.restore();
      } else if (S.b[b] === 3) {
        g.fillStyle = 'rgba(110,120,132,.4)';
        g.font = '800 ' + B * .28 + 'px sans-serif';
        g.textAlign = 'center'; g.textBaseline = 'middle';
        g.fillText('＝', x + B / 2, y + B / 2);
      }
      if (!S.b[b]) {
        for (let i = 0; i < 9; i++) {
          const v = S.s[b][i];
          if (!v) continue;
          const ix = x + (i % 3) * B / 3 + B / 6, iy = y + Math.floor(i / 3) * B / 3 + B / 6;
          mark(ix, iy, B * .075, v, B * .032, false);
        }
      }
    }
    g.strokeStyle = 'rgba(90,140,150,.3)'; g.lineWidth = 1;
    for (let i = 1; i < 9; i++) {
      if (i % 3 === 0) continue;
      g.beginPath(); g.moveTo(m0 + i * B / 3, m0); g.lineTo(m0 + i * B / 3, m0 + 3 * B); g.stroke();
      g.beginPath(); g.moveTo(m0, m0 + i * B / 3); g.lineTo(m0 + 3 * B, m0 + i * B / 3); g.stroke();
    }
    g.strokeStyle = 'rgba(20,110,120,.75)'; g.lineWidth = 3;
    for (let i = 1; i < 3; i++) {
      g.beginPath(); g.moveTo(m0 + i * B, m0); g.lineTo(m0 + i * B, m0 + 3 * B); g.stroke();
      g.beginPath(); g.moveTo(m0, m0 + i * B); g.lineTo(m0 + 3 * B, m0 + i * B); g.stroke();
    }
    if (S.last && !S.over) {
      const [b, i] = S.last;
      const ix = bx0(b) + (i % 3) * B / 3 + B / 6, iy = by0(b) + Math.floor(i / 3) * B / 3 + B / 6;
      g.beginPath(); g.arc(ix, iy, B * .15, 0, 7);
      g.strokeStyle = 'rgba(255,159,10,.9)'; g.lineWidth = 2; g.stroke();
    }
    if (S.winLine) {
      const a = S.winLine[0], b2 = S.winLine[2];
      const ax = bx0(a) + B / 2, ay = by0(a) + B / 2, ax2 = bx0(b2) + B / 2, ay2 = by0(b2) + B / 2;
      const grad = g.createLinearGradient(ax, ay, ax2, ay2);
      grad.addColorStop(0, 'rgba(255,238,150,.2)'); grad.addColorStop(.5, 'rgba(255,200,60,.95)'); grad.addColorStop(1, 'rgba(255,238,150,.2)');
      g.save(); g.strokeStyle = grad; g.lineWidth = B * .16; g.lineCap = 'round';
      g.shadowColor = 'rgba(255,220,120,.85)'; g.shadowBlur = 16;
      g.beginPath(); g.moveTo(ax, ay); g.lineTo(ax2, ay2); g.stroke(); g.restore();
    }
  }

  function evalState(ai) {
    const op = 3 - ai;
    let s = 0;
    for (let b = 0; b < 9; b++) {
      if (S.b[b] === ai) s += WB[b] * 100;
      else if (S.b[b] === op) s -= WB[b] * 100;
      else if (!S.b[b]) {
        for (const L of LINES) {
          let m = 0, o = 0, e = 0;
          for (const i of L) { const v = S.s[b][i]; if (v === ai) m++; else if (v === op) o++; else e++; }
          if (m === 2 && e === 1) s += 9;
          if (o === 2 && e === 1) s -= 11;
        }
        if (S.s[b][4] === ai) s += 4;
        if (S.s[b][4] === op) s -= 4;
      }
    }
    for (const L of LINES) {
      let m = 0, o = 0, bl = 0;
      for (const i of L) { const v = S.b[i]; if (v === ai) m++; else if (v === op) o++; else if (v === 3) bl++; }
      if (m === 2 && !o && !bl) s += 48;
      if (o === 2 && !m && !bl) s -= 58;
      if (m === 1 && !o && !bl) s += 6;
      if (o === 1 && !m && !bl) s -= 7;
    }
    return s;
  }
  function tMove(b, i, p, ai, depth, a, beta) {
    const pv = S.s[b][i], ob = S.b[b], oa = S.act;
    S.s[b][i] = p;
    if (lineWin(S.s[b], p)) S.b[b] = p;
    else if (S.s[b].every(v => v)) S.b[b] = 3;
    S.act = S.b[i] === 0 ? i : -1;
    let v;
    if (bigWin(p)) v = (p === ai ? 1 : -1) * (1e6 + depth * 1e3);
    else if (S.b.every(x => x)) v = 0;
    else v = mm(depth - 1, a, beta, p !== ai, ai);
    S.s[b][i] = pv; S.b[b] = ob; S.act = oa;
    return v;
  }
  function mm(depth, a, beta, aiTurn, ai) {
    if (depth === 0) return evalState(ai);
    const moves = legalList();
    if (!moves.length) return evalState(ai);
    if (aiTurn) {
      let best = -Infinity;
      for (const [b, i] of moves) {
        const v = tMove(b, i, ai, ai, depth, a, beta);
        if (v > best) best = v;
        if (best > a) a = best;
        if (a >= beta) break;
      }
      return best;
    }
    let best = Infinity;
    for (const [b, i] of moves) {
      const v = tMove(b, i, 3 - ai, ai, depth, a, beta);
      if (v < best) best = v;
      if (best < beta) beta = best;
      if (a >= beta) break;
    }
    return best;
  }
  function aiMove() {
    if (S.over || S.turn !== 1 || ctx.mode !== 'ai') return;
    const moves = legalList();
    if (!moves.length) return;
    let best = null, bs = -Infinity;
    for (const [b, i] of moves) {
      const v = tMove(b, i, 2, 2, 3, -Infinity, Infinity) + Math.random() * 5;
      if (v > bs) { bs = v; best = [b, i]; }
    }
    if (best) doMove(best[0], best[1]);
  }

  function onResize() {
    const w = Math.min(560, ctx.root.clientWidth - 8, window.innerWidth - 48);
    dpr = Math.min(window.devicePixelRatio || 1, 2.5);
    W = w; m0 = w * 0.03; B = (w - 2 * m0) / 3;
    cv.width = Math.round(W * dpr); cv.height = Math.round(W * dpr);
    cv.style.width = W + 'px'; cv.style.height = W + 'px';
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    draw();
  }
  function cellAt(e) {
    const r = cv.getBoundingClientRect();
    const x = e.clientX - r.left, y = e.clientY - r.top;
    if (x < m0 || y < m0 || x >= m0 + 3 * B || y >= m0 + 3 * B) return null;
    const b = Math.floor((x - m0) / B) + Math.floor((y - m0) / B) * 3;
    if (S.b[b]) return null;
    const i = Math.floor(((x - m0) % B) / (B / 3)) + Math.floor(((y - m0) % B) / (B / 3)) * 3;
    return [b, i];
  }
  return {
    create(c) {
      ctx = c;
      newGame();
      cv = document.createElement('canvas');
      cv.style.cssText = 'display:block;margin:0 auto;border-radius:18px;box-shadow:0 12px 34px rgba(0,160,170,.2),0 2px 8px rgba(0,0,0,.08);cursor:pointer;touch-action:manipulation';
      c.root.appendChild(cv);
      g = cv.getContext('2d');
      const hint = document.createElement('div');
      hint.style.cssText = 'margin-top:10px;text-align:center;font-size:13px;font-weight:600;color:var(--ink2)';
      hint.textContent = '落子位置决定对手下一步的大格 · 赢下三个大格即胜';
      c.root.appendChild(hint);
      onResize();
      window.addEventListener('resize', onResize);
      cv.addEventListener('pointerdown', e => {
        if (S.over || S.turn !== myIdx()) return;
        const rc = cellAt(e);
        if (!rc) return;
        const [b, i] = rc;
        if (S.s[b][i] || S.b[b]) return;
        if (S.act >= 0 && S.b[S.act] === 0 && S.act !== b) return;
        doMove(b, i);
        if (ctx.mode === 'online') ctx.send('mv', { b, i }, serialize());
      });
      c.onMsg((k, d) => { if (k === 'mv' && d && typeof d.b === 'number') doMove(d.b, d.i); });
      c.onRestore(s => deserialize(s));
      afterTurn();
      if (c.mode === 'online' && c.side === 0) c.send('hello', null, serialize());
      return { destroy() { window.removeEventListener('resize', onResize); } };
    }
  };
})();
