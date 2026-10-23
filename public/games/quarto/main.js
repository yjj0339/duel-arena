'use strict';
window.GameDef = (() => {
  const S = { grid: null, rest: null, pending: -1, turn: 0, phase: 'pick', over: false, winLine: null, hover: -1 };
  let ctx = null, cv = null, g = null, W = 0, H = 0, dpr = 1, L = null;
  const myIdx = () => ctx.mode === 'ai' ? 0 : ctx.side;
  const LINES4 = [];
  for (let r = 0; r < 4; r++) LINES4.push([0, 1, 2, 3].map(c => r * 4 + c));
  for (let c = 0; c < 4; c++) LINES4.push([0, 1, 2, 3].map(r => r * 4 + c));
  LINES4.push([0, 5, 10, 15]); LINES4.push([3, 6, 9, 12]);

  function newGame() {
    S.grid = new Array(16).fill(-1); S.rest = new Array(16).fill(true);
    S.pending = -1; S.turn = 0; S.phase = 'pick'; S.over = false; S.winLine = null; S.hover = -1;
  }
  function serialize() { return { g: 'quarto', gd: S.grid.slice(), rs: S.rest.slice(), pd: S.pending, t: S.turn, ph: S.phase }; }
  function applySnap(m) {
    S.grid = m.gd.slice(); S.rest = m.rs.slice(); S.pending = m.pd;
    S.turn = m.t || 0; S.phase = m.ph === 'place' ? 'place' : 'pick';
    S.over = false; S.winLine = null; S.hover = -1;
    draw(); afterTurn();
  }
  function deserialize(s) { const m = s && (s['s' + ctx.side] || s.s0 || s.s1); if (m && m.gd) applySnap(m); }
  function actor() { return S.phase === 'pick' ? S.turn : 1 - S.turn; }

  function lineShares(cells) {
    if (cells.some(v => v < 0)) return -1;
    for (let bit = 0; bit < 4; bit++) {
      const v0 = (cells[0] >> bit) & 1;
      if (cells.every(p => ((p >> bit) & 1) === v0)) return bit;
    }
    return -1;
  }
  function linesAt(ci) {
    const row = Math.floor(ci / 4), col = ci % 4;
    const cands = [LINES4[row], LINES4[4 + col]];
    if (row === col) cands.push(LINES4[8]);
    if (row + col === 3) cands.push(LINES4[9]);
    return cands;
  }
  function winAt(ci) {
    for (const Ln of linesAt(ci)) if (lineShares(Ln.map(i => S.grid[i])) >= 0) return Ln;
    return null;
  }
  function doPick(pi) {
    if (S.over || S.phase !== 'pick' || !S.rest[pi]) return;
    S.rest[pi] = false; S.pending = pi; S.phase = 'place'; S.hover = -1;
    ctx.sfx.play('click');
    draw();
    afterTurn();
  }
  function doPlace(ci) {
    if (S.over || S.phase !== 'place' || S.grid[ci] >= 0 || S.pending < 0) return;
    S.grid[ci] = S.pending; S.pending = -1;
    ctx.sfx.play('place');
    const w = winAt(ci);
    if (w) {
      S.over = true; S.winLine = w;
      requestAnimationFrame(draw);
      const winner = 1 - S.turn, my = myIdx();
      setTimeout(() => ctx.finish(winner === my ? 'win' : 'lose', winner === my ? '四子共享特征，夸托！' : '对手达成夸托获胜。'), 900);
      return;
    }
    if (S.grid.every(v => v >= 0)) {
      S.over = true;
      requestAnimationFrame(draw);
      setTimeout(() => ctx.finish('draw', '棋子已放完，未分胜负。'), 700);
      return;
    }
    S.turn = 1 - S.turn; S.phase = 'pick';
    draw();
    afterTurn();
  }
  function afterTurn() {
    if (S.over) return;
    const a = actor(), my = myIdx();
    if (a === my) ctx.turn(0); else ctx.turn(1);
    if (S.phase === 'pick') ctx.setStatus(a === my ? '选择一枚棋子交给对手' : '对手正在选子…');
    else ctx.setStatus(a === my ? '把对手给的棋子放入空格' : '对手放置中…');
    if (ctx.mode === 'ai' && a === 1) {
      if (S.phase === 'pick') setTimeout(aiPick, 500 + Math.random() * 400);
      else setTimeout(aiPlace, 500 + Math.random() * 400);
    }
  }

  function drawPiece(x, y, r, pc) {
    const dark = pc & 2, sq = pc & 4, hollow = pc & 8;
    g.save(); g.translate(x, y);
    const body = () => { g.beginPath(); if (sq) g.roundRect(-r, -r, 2 * r, 2 * r, r * .3); else g.arc(0, 0, r, 0, 7); };
    g.beginPath(); g.arc(0, r * .14, r * .96, 0, 7);
    g.fillStyle = 'rgba(90,60,20,.20)'; g.filter = 'blur(3px)'; g.fill(); g.filter = 'none';
    body();
    const grd = g.createLinearGradient(-r, -r, r, r);
    if (dark) { grd.addColorStop(0, '#63636b'); grd.addColorStop(.55, '#33333a'); grd.addColorStop(1, '#17171c'); }
    else { grd.addColorStop(0, '#ffffff'); grd.addColorStop(.55, '#ededf2'); grd.addColorStop(1, '#c4c4d0'); }
    g.fillStyle = grd; g.fill();
    g.lineWidth = 1; g.strokeStyle = 'rgba(0,0,0,.2)'; g.stroke();
    g.save(); body(); g.clip();
    g.beginPath();
    if (sq) g.roundRect(-r * .82, -r * .82, r * 1.64, r * .55, r * .2);
    else g.ellipse(-r * .3, -r * .42, r * .5, r * .28, -.5, 0, 7);
    g.fillStyle = dark ? 'rgba(255,255,255,.24)' : 'rgba(255,255,255,.85)';
    g.fill(); g.restore();
    if (hollow) {
      g.save(); g.globalCompositeOperation = 'destination-out';
      g.beginPath();
      if (sq) g.roundRect(-r * .38, -r * .38, r * .76, r * .76, r * .18);
      else g.arc(0, 0, r * .38, 0, 7);
      g.fill(); g.restore();
    }
    g.restore();
  }
  function draw() {
    if (!g || !L) return;
    g.clearRect(0, 0, W, H);
    const bgrad = g.createLinearGradient(L.bx, L.by, L.bx + 4 * L.cellB, L.by + 4 * L.cellB);
    bgrad.addColorStop(0, '#fff8ec'); bgrad.addColorStop(1, '#f5e9d2');
    g.fillStyle = bgrad;
    g.beginPath(); g.roundRect(L.bx, L.by, 4 * L.cellB, 4 * L.cellB, 18); g.fill();
    for (let i = 0; i < 16; i++) {
      const r = Math.floor(i / 4), c = i % 4;
      const x = L.bx + c * L.cellB, y = L.by + r * L.cellB;
      g.fillStyle = S.phase === 'place' && actor() === myIdx() && S.grid[i] < 0 ? 'rgba(255,244,220,.95)' : 'rgba(255,255,255,.7)';
      g.beginPath(); g.roundRect(x + 4, y + 4, L.cellB - 8, L.cellB - 8, 12); g.fill();
      g.strokeStyle = 'rgba(190,150,90,.3)'; g.lineWidth = 1;
      g.beginPath(); g.roundRect(x + 4.5, y + 4.5, L.cellB - 9, L.cellB - 9, 12); g.stroke();
      if (S.grid[i] >= 0) drawPiece(x + L.cellB / 2, y + L.cellB / 2, L.cellB * ((S.grid[i] & 1) ? .37 : .27), S.grid[i]);
    }
    if (S.winLine) {
      const a = S.winLine[0], b2 = S.winLine[3];
      const ax = L.bx + (a % 4) * L.cellB + L.cellB / 2, ay = L.by + Math.floor(a / 4) * L.cellB + L.cellB / 2;
      const ax2 = L.bx + (b2 % 4) * L.cellB + L.cellB / 2, ay2 = L.by + Math.floor(b2 / 4) * L.cellB + L.cellB / 2;
      const grad = g.createLinearGradient(ax, ay, ax2, ay2);
      grad.addColorStop(0, 'rgba(255,238,150,.2)'); grad.addColorStop(.5, 'rgba(255,190,60,.95)'); grad.addColorStop(1, 'rgba(255,238,150,.2)');
      g.save(); g.strokeStyle = grad; g.lineWidth = L.cellB * .18; g.lineCap = 'round';
      g.shadowColor = 'rgba(255,220,120,.85)'; g.shadowBlur = 16;
      g.beginPath(); g.moveTo(ax, ay); g.lineTo(ax2, ay2); g.stroke(); g.restore();
    }
    const pbx = L.px, pby = L.py, pbw = L.pw, pbh = L.pendH;
    g.fillStyle = 'rgba(255,159,10,.1)';
    g.beginPath(); g.roundRect(pbx, pby, pbw, pbh, 12); g.fill();
    g.setLineDash([6, 5]); g.strokeStyle = 'rgba(230,140,10,.55)'; g.lineWidth = 1.5;
    g.beginPath(); g.roundRect(pbx + .75, pby + .75, pbw - 1.5, pbh - 1.5, 12); g.stroke();
    g.setLineDash([]);
    g.fillStyle = 'rgba(170,115,30,.85)'; g.font = '700 12px sans-serif';
    g.textAlign = 'left'; g.textBaseline = 'top';
    g.fillText(S.phase === 'place' ? '待放置棋子' : '棋子池 · 点选一枚', pbx + 10, pby + 8);
    if (S.pending >= 0) drawPiece(pbx + pbw / 2, pby + pbh / 2 + 9, Math.min(pbh * .32, pbw * .16), S.pending);
    for (let i = 0; i < 16; i++) {
      const p = slotXY(i);
      g.fillStyle = 'rgba(140,120,90,.07)';
      g.beginPath(); g.roundRect(p.x + 2, p.y + 2, L.cellP - 4, L.cellP - 4, 9); g.fill();
      if (S.rest[i]) {
        drawPiece(p.x + L.cellP / 2, p.y + L.cellP / 2, L.cellP * ((i & 1) ? .33 : .24), i);
        if (S.hover === i && S.phase === 'pick' && actor() === myIdx()) {
          g.strokeStyle = 'rgba(255,159,10,.9)'; g.lineWidth = 2;
          g.beginPath(); g.roundRect(p.x + 2, p.y + 2, L.cellP - 4, L.cellP - 4, 9); g.stroke();
        }
      }
    }
  }
  function slotXY(i) {
    if (L.side) return { x: L.px + (i % 4) * L.cellP, y: L.py + L.pendH + Math.floor(i / 4) * L.cellP };
    return { x: (i % 8) * L.cellP, y: L.py + L.pendH + Math.floor(i / 8) * L.cellP };
  }

  function givesWin(p) {
    for (let i = 0; i < 16; i++) if (S.grid[i] < 0) {
      S.grid[i] = p;
      const w = winAt(i);
      S.grid[i] = -1;
      if (w) return true;
    }
    return false;
  }
  function threatCount(i, p) {
    S.grid[i] = p;
    let n = 0;
    for (const Ln of linesAt(i)) {
      const cells = Ln.map(k => S.grid[k]);
      const filled = cells.filter(v => v >= 0);
      if (filled.length === 3 && lineShares(cells) >= 0) n++;
    }
    S.grid[i] = -1;
    return n;
  }
  function aiPick() {
    if (S.over || S.phase !== 'pick' || S.turn !== 1 || ctx.mode !== 'ai') return;
    const avail = [];
    for (let i = 0; i < 16; i++) if (S.rest[i]) avail.push(i);
    if (!avail.length) return;
    const safe = avail.filter(p => !givesWin(p));
    const pool = safe.length ? safe : avail;
    doPick(pool[Math.floor(Math.random() * pool.length)]);
  }
  function aiPlace() {
    if (S.over || S.phase !== 'place' || S.turn !== 0 || ctx.mode !== 'ai') return;
    const p = S.pending;
    if (p < 0) return;
    for (let i = 0; i < 16; i++) if (S.grid[i] < 0) {
      S.grid[i] = p;
      const w = winAt(i);
      S.grid[i] = -1;
      if (w) { doPlace(i); return; }
    }
    let best = null, bs = -1e9;
    for (let i = 0; i < 16; i++) if (S.grid[i] < 0) {
      const v = threatCount(i, p) * 100 + ((i === 5 || i === 6 || i === 9 || i === 10) ? 4 : 0) + Math.random() * 8;
      if (v > bs) { bs = v; best = i; }
    }
    if (best != null) doPlace(best);
  }

  function poolAt(x, y) {
    for (let i = 0; i < 16; i++) {
      const p = slotXY(i);
      if (x >= p.x && x < p.x + L.cellP && y >= p.y && y < p.y + L.cellP) return i;
    }
    return -1;
  }
  function boardAt(x, y) {
    if (x < L.bx || y < L.by || x >= L.bx + 4 * L.cellB || y >= L.by + 4 * L.cellB) return -1;
    return Math.floor((y - L.by) / L.cellB) * 4 + Math.floor((x - L.bx) / L.cellB);
  }
  function layout() {
    const w = Math.min(560, ctx.root.clientWidth - 8, window.innerWidth - 48);
    dpr = Math.min(window.devicePixelRatio || 1, 2.5);
    if (w >= 470) {
      const bw = w * .66, pw = w - bw - 14, cellP = pw / 4;
      let pendH = pw * .75;
      if (pendH + 4 * cellP > bw) pendH = bw - 4 * cellP;
      L = { side: true, bx: 0, by: 0, cellB: bw / 4, px: bw + 14, py: 0, pw: pw, cellP: cellP, pendH: pendH };
      W = w; H = bw;
    } else {
      const cellP = w / 8;
      L = { side: false, bx: 0, by: 0, cellB: w / 4, px: 0, py: w + 16, pw: w, cellP: cellP, pendH: 64 };
      W = w; H = w + 16 + 64 + 2 * cellP;
    }
    cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr);
    cv.style.width = W + 'px'; cv.style.height = H + 'px';
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    draw();
  }
  return {
    create(c) {
      ctx = c;
      newGame();
      cv = document.createElement('canvas');
      cv.style.cssText = 'display:block;margin:0 auto;border-radius:18px;box-shadow:0 12px 34px rgba(210,140,30,.2),0 2px 8px rgba(0,0,0,.08);cursor:pointer;touch-action:manipulation';
      c.root.appendChild(cv);
      g = cv.getContext('2d');
      const hint = document.createElement('div');
      hint.style.cssText = 'margin-top:10px;text-align:center;font-size:13px;font-weight:600;color:var(--ink2)';
      hint.textContent = '选子交给对手放置 · 同行/列/斜 4 子共任一特征即胜';
      c.root.appendChild(hint);
      layout();
      window.addEventListener('resize', layout);
      cv.addEventListener('pointermove', e => {
        if (S.over || S.phase !== 'pick' || actor() !== myIdx()) return;
        const r = cv.getBoundingClientRect();
        const i = poolAt(e.clientX - r.left, e.clientY - r.top);
        const nv = i >= 0 && S.rest[i] ? i : -1;
        if (nv !== S.hover) { S.hover = nv; draw(); }
      });
      cv.addEventListener('pointerleave', () => { if (S.hover >= 0) { S.hover = -1; draw(); } });
      cv.addEventListener('pointerdown', e => {
        if (S.over || actor() !== myIdx()) return;
        const r = cv.getBoundingClientRect();
        const x = e.clientX - r.left, y = e.clientY - r.top;
        if (S.phase === 'pick') {
          const i = poolAt(x, y);
          if (i >= 0 && S.rest[i]) {
            doPick(i);
            if (ctx.mode === 'online') ctx.send('mv', { a: 'pick', p: i }, serialize());
          }
        } else {
          const i = boardAt(x, y);
          if (i >= 0 && S.grid[i] < 0) {
            doPlace(i);
            if (ctx.mode === 'online') ctx.send('mv', { a: 'place', i: i }, serialize());
          }
        }
      });
      c.onMsg((k, d) => {
        if (k === 'mv' && d) {
          if (d.a === 'pick') doPick(d.p);
          else if (d.a === 'place') doPlace(d.i);
        }
      });
      c.onRestore(s => deserialize(s));
      draw();
      afterTurn();
      if (c.mode === 'online' && c.side === 0) c.send('hello', null, serialize());
      return { destroy() { window.removeEventListener('resize', layout); } };
    }
  };
})();
