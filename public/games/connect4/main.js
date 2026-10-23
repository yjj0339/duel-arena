'use strict';
window.GameDef = (() => {
  const C = 7, R = 6;
  const S = { f: null, turn: 0, over: false, anim: null, win: null, hover: -1 };
  let ctx = null, cv = null, g = null, cell = 0, pad = 0, top = 0, W = 0, H = 0, dpr = 1;
  const RED = ['#ff9fb2', '#ff5c7a', '#d63a5c'];
  const YEL = ['#ffe6a8', '#ffbe3d', '#e5940c'];
  const myIdx = () => ctx.mode === 'ai' ? 0 : ctx.side;
  const px = c => pad + c * cell + cell / 2;
  const py = r => top + r * cell + cell / 2;

  function newGame() { S.f = Array.from({ length: R }, () => new Array(C).fill(0)); S.turn = 0; S.over = false; S.anim = null; S.win = null; S.hover = -1; }
  function serialize() { const f = []; for (let r = 0; r < R; r++) for (let c = 0; c < C; c++) f.push(S.f[r][c]); return { g: 'connect4', f, t: S.turn }; }
  function applySnap(m) {
    let k = 0;
    for (let r = 0; r < R; r++) for (let c = 0; c < C; c++) S.f[r][c] = m.f[k++];
    S.turn = m.t || 0; S.over = false; S.anim = null; S.win = null;
    draw(); afterTurn();
  }
  function deserialize(s) { const m = s && (s['s' + ctx.side] || s.s0 || s.s1); if (m && m.f) applySnap(m); }
  function landing(c) { for (let r = R - 1; r >= 0; r--) if (!S.f[r][c]) return r; return -1; }

  function findWin(p) {
    const D = [[0, 1], [1, 0], [1, 1], [1, -1]];
    for (let r = 0; r < R; r++) for (let c = 0; c < C; c++) {
      if (S.f[r][c] !== p) continue;
      for (const [dr, dc] of D) {
        const cells = [[r, c]];
        let rr = r + dr, cc = c + dc;
        while (rr >= 0 && rr < R && cc >= 0 && cc < C && S.f[rr][cc] === p) { cells.push([rr, cc]); rr += dr; cc += dc; }
        if (cells.length >= 4) return cells;
      }
    }
    return null;
  }

  function disc(x, y, r, p, alpha) {
    const col = p === 1 ? RED : YEL;
    g.save(); g.globalAlpha = alpha == null ? 1 : alpha;
    g.beginPath(); g.arc(x, y + r * 0.12, r * 0.98, 0, 7);
    g.fillStyle = 'rgba(0,10,40,.30)'; g.filter = 'blur(3px)'; g.fill(); g.filter = 'none';
    const grd = g.createRadialGradient(x - r * .35, y - r * .42, r * .12, x, y, r);
    grd.addColorStop(0, col[0]); grd.addColorStop(.55, col[1]); grd.addColorStop(1, col[2]);
    g.beginPath(); g.arc(x, y, r, 0, 7); g.fillStyle = grd; g.fill();
    g.strokeStyle = 'rgba(0,0,0,.16)'; g.lineWidth = 1; g.stroke();
    g.beginPath(); g.ellipse(x - r * .28, y - r * .4, r * .24, r * .13, -.6, 0, 7);
    g.fillStyle = 'rgba(255,255,255,.6)'; g.fill();
    g.restore();
  }

  function draw(t) {
    if (!g) return;
    t = t || performance.now();
    g.clearRect(0, 0, W, H);
    const panelY = top - cell * 0.18;
    const bg = g.createLinearGradient(0, panelY, 0, H);
    bg.addColorStop(0, '#4a8af8'); bg.addColorStop(1, '#2b5cc4');
    g.fillStyle = bg;
    g.beginPath(); g.roundRect(0, panelY, W, H - panelY, 18); g.fill();
    const sheen = g.createLinearGradient(0, panelY, W * .7, H);
    sheen.addColorStop(0, 'rgba(255,255,255,.16)'); sheen.addColorStop(.4, 'rgba(255,255,255,0)');
    g.fillStyle = sheen;
    g.beginPath(); g.roundRect(0, panelY, W, H - panelY, 18); g.fill();
    g.strokeStyle = 'rgba(15,40,100,.35)'; g.lineWidth = 1.5;
    g.beginPath(); g.roundRect(0.75, panelY + 0.75, W - 1.5, H - panelY - 1.5, 18); g.stroke();
    if (S.hover >= 0 && !S.over && S.turn === myIdx() && landing(S.hover) >= 0 && !S.anim) {
      g.fillStyle = 'rgba(255,255,255,.14)';
      g.beginPath(); g.roundRect(pad + S.hover * cell + 2, panelY + 4, cell - 4, H - panelY - 8, 10); g.fill();
    }
    for (let r = 0; r < R; r++) for (let c = 0; c < C; c++) {
      g.beginPath(); g.arc(px(c), py(r), cell * .46, 0, 7);
      g.fillStyle = '#10244e'; g.fill();
      const rim = g.createRadialGradient(px(c), py(r) - cell * .1, cell * .1, px(c), py(r), cell * .48);
      rim.addColorStop(0, 'rgba(0,0,0,.42)'); rim.addColorStop(.75, 'rgba(0,0,0,.18)'); rim.addColorStop(1, 'rgba(120,170,255,.30)');
      g.beginPath(); g.arc(px(c), py(r), cell * .46, 0, 7);
      g.fillStyle = rim; g.fill();
      g.beginPath(); g.arc(px(c), py(r) - cell * .08, cell * .30, Math.PI * 1.1, Math.PI * 1.9);
      g.strokeStyle = 'rgba(255,255,255,.14)'; g.lineWidth = cell * .05; g.stroke();
    }
    for (let r = 0; r < R; r++) for (let c = 0; c < C; c++) {
      if (!S.f[r][c]) continue;
      if (S.anim && S.anim.r === r && S.anim.c === c) continue;
      disc(px(c), py(r), cell * .4, S.f[r][c]);
    }
    if (S.win) {
      const a = S.win[0], b = S.win[S.win.length - 1];
      const grad = g.createLinearGradient(px(a[1]), py(a[0]), px(b[1]), py(b[0]));
      grad.addColorStop(0, 'rgba(255,244,180,.15)'); grad.addColorStop(.5, 'rgba(255,238,150,.95)'); grad.addColorStop(1, 'rgba(255,244,180,.15)');
      g.save(); g.strokeStyle = grad; g.lineWidth = cell * .18; g.lineCap = 'round';
      g.shadowColor = 'rgba(255,220,120,.85)'; g.shadowBlur = 14;
      g.beginPath(); g.moveTo(px(a[1]), py(a[0])); g.lineTo(px(b[1]), py(b[0])); g.stroke(); g.restore();
    }
    if (S.anim) {
      const a = S.anim, dur = 190 + a.r * 62, tb = t - a.t0;
      if (tb < dur) {
        const e = (tb / dur) ** 2;
        disc(px(a.c), -cell * .1 + (py(a.r) + cell * .1) * e, cell * .4, a.p);
      } else {
        const e2 = Math.min(1, (tb - dur) / 170);
        disc(px(a.c), py(a.r) - Math.sin(e2 * Math.PI) * cell * .15 * (1 - e2 * .4), cell * .4, a.p);
        if (e2 >= 1) { S.anim = null; draw(); return; }
      }
      requestAnimationFrame(draw);
    } else if (S.hover >= 0 && !S.over && S.turn === myIdx() && landing(S.hover) >= 0) {
      disc(px(S.hover), top * .5, cell * .38, myIdx() + 1, .45);
    }
  }

  function doDrop(c) {
    if (S.over) return;
    const r = landing(c); if (r < 0) return;
    const p = S.turn + 1;
    S.f[r][c] = p;
    S.anim = { c, r, p, t0: performance.now() };
    S.hover = -1;
    ctx.sfx.play('place');
    const w = findWin(p);
    if (w) {
      S.over = true; S.win = w; S.turn = -1;
      requestAnimationFrame(draw);
      const my = myIdx();
      setTimeout(() => ctx.finish(p === my + 1 ? 'win' : 'lose', p === my + 1 ? '四子连线，漂亮！' : '对方四子连线。'), 950);
      return;
    }
    if (S.f[0].every(v => v)) {
      S.over = true; S.turn = -1;
      requestAnimationFrame(draw);
      setTimeout(() => ctx.finish('draw', '棋盘已满，势均力敌。'), 700);
      return;
    }
    S.turn = 1 - S.turn;
    afterTurn();
  }
  function afterTurn() {
    if (S.over) return;
    const my = myIdx();
    if (S.turn === my) { ctx.turn(0); ctx.setStatus('你的回合 · 点击列投子'); }
    else { ctx.turn(1); ctx.setStatus('等待对方投子…'); if (ctx.mode === 'ai') setTimeout(aiMove, 480 + Math.random() * 420); }
  }

  function evalBd(bd, p) {
    let s = 0;
    for (let r = 0; r < R; r++) if (bd[r][3] === p) s += 6;
    const wl = (a, b, c, d) => {
      let m = 0, o = 0;
      for (const v of [a, b, c, d]) { if (v === p) m++; else if (v) o++; }
      if (m && o) return 0;
      if (m === 3) return 60;
      if (m === 2) return 8;
      if (m === 1) return 1;
      if (o === 3) return -75;
      if (o === 2) return -9;
      if (o === 1) return -1;
      return 0;
    };
    for (let r = 0; r < R; r++) for (let c = 0; c < C; c++) {
      if (c + 3 < C) s += wl(bd[r][c], bd[r][c + 1], bd[r][c + 2], bd[r][c + 3]);
      if (r + 3 < R) s += wl(bd[r][c], bd[r + 1][c], bd[r + 2][c], bd[r + 3][c]);
      if (r + 3 < R && c + 3 < C) s += wl(bd[r][c], bd[r + 1][c + 1], bd[r + 2][c + 2], bd[r + 3][c + 3]);
      if (r + 3 < R && c >= 3) s += wl(bd[r][c], bd[r + 1][c - 1], bd[r + 2][c - 2], bd[r + 3][c - 3]);
    }
    return s;
  }
  function winBd(bd, p) {
    const D = [[0, 1], [1, 0], [1, 1], [1, -1]];
    for (let r = 0; r < R; r++) for (let c = 0; c < C; c++) {
      if (bd[r][c] !== p) continue;
      for (const [dr, dc] of D) {
        let k = 1;
        while (k < 4) {
          const rr = r + dr * k, cc = c + dc * k;
          if (rr < 0 || rr >= R || cc < 0 || cc >= C || bd[rr][cc] !== p) break;
          k++;
          if (k >= 4) return true;
        }
      }
    }
    return false;
  }
  function landBd(bd, c) { for (let r = R - 1; r >= 0; r--) if (!bd[r][c]) return r; return -1; }
  function mm(bd, depth, a, b, maxing, p, ai) {
    if (winBd(bd, ai)) return 1e6 + depth * 1e3;
    if (winBd(bd, 3 - ai)) return -1e6 - depth * 1e3;
    const moves = [3, 2, 4, 1, 5, 0, 6].filter(c => !bd[0][c]);
    if (!moves.length || depth === 0) return evalBd(bd, ai);
    if (maxing) {
      let best = -Infinity;
      for (const c of moves) {
        const r = landBd(bd, c); bd[r][c] = ai;
        const v = mm(bd, depth - 1, a, b, false, p, ai);
        bd[r][c] = 0;
        if (v > best) best = v;
        if (best > a) a = best;
        if (a >= b) break;
      }
      return best;
    }
    let best = Infinity;
    for (const c of moves) {
      const r = landBd(bd, c); bd[r][c] = p;
      const v = mm(bd, depth - 1, a, b, true, p, ai);
      bd[r][c] = 0;
      if (v < best) best = v;
      if (best < b) b = best;
      if (a >= b) break;
    }
    return best;
  }
  function aiMove() {
    if (S.over || S.turn !== 1 || ctx.mode !== 'ai') return;
    const bd = S.f.map(r => r.slice());
    let best = null, bs = -Infinity;
    for (const c of [3, 2, 4, 1, 5, 0, 6]) {
      if (bd[0][c]) continue;
      const r = landBd(bd, c); bd[r][c] = 2;
      const v = mm(bd, 4, -Infinity, Infinity, false, 1, 2) + Math.random() * 6;
      bd[r][c] = 0;
      if (v > bs) { bs = v; best = c; }
    }
    if (best != null) doDrop(best);
  }

  function onResize() {
    const w = Math.min(620, ctx.root.clientWidth - 8, window.innerWidth - 48);
    dpr = Math.min(window.devicePixelRatio || 1, 2.5);
    cell = w / 7.7; pad = w * 0.05; top = cell * 1.15;
    W = w; H = top + cell * R + w * 0.035;
    cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr);
    cv.style.width = W + 'px'; cv.style.height = H + 'px';
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    draw();
  }
  function colAt(e) {
    const r = cv.getBoundingClientRect();
    return Math.floor((e.clientX - r.left - pad) / cell);
  }
  return {
    create(c) {
      ctx = c;
      newGame();
      cv = document.createElement('canvas');
      cv.style.cssText = 'display:block;margin:0 auto;border-radius:18px;box-shadow:0 12px 34px rgba(214,58,92,.20),0 2px 8px rgba(0,0,0,.08);cursor:pointer;touch-action:manipulation';
      c.root.appendChild(cv);
      g = cv.getContext('2d');
      const hint = document.createElement('div');
      hint.style.cssText = 'margin-top:10px;text-align:center;font-size:13px;font-weight:600;color:var(--ink2)';
      hint.textContent = c.mode === 'ai' ? '你执红先行 · 点击列顶投子' : (ctx.side === 0 ? '你执红先行 · 点击列顶投子' : '你执黄后行 · 点击列顶投子');
      c.root.appendChild(hint);
      onResize();
      window.addEventListener('resize', onResize);
      cv.addEventListener('pointermove', e => {
        const col = colAt(e);
        const nv = col >= 0 && col < C ? col : -1;
        if (nv !== S.hover) { S.hover = nv; if (!S.anim) draw(); }
      });
      cv.addEventListener('pointerleave', () => { S.hover = -1; if (!S.anim) draw(); });
      cv.addEventListener('pointerdown', e => {
        if (S.over || S.anim || S.turn !== myIdx()) return;
        const col = colAt(e);
        if (col < 0 || col >= C || landing(col) < 0) return;
        doDrop(col);
        if (ctx.mode === 'online') ctx.send('mv', { c: col }, serialize());
      });
      c.onMsg((k, d) => { if (k === 'mv' && d && typeof d.c === 'number') doDrop(d.c); });
      c.onRestore(s => deserialize(s));
      afterTurn();
      if (c.mode === 'online' && c.side === 0) c.send('hello', null, serialize());
      return { destroy() { window.removeEventListener('resize', onResize); } };
    }
  };
})();
