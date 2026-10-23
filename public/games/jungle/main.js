'use strict';
window.GameDef = (() => {
  const C = 7, R = 9;
  const EMO = { 1: '🐭', 2: '🐱', 3: '🐺', 4: '🐶', 5: '🐆', 6: '🐯', 7: '🦁', 8: '🐘' };
  const DEN = ['3,8', '3,0'];
  const TRAPS = [['2,8', '4,8', '3,7'], ['2,0', '4,0', '3,1']];
  const VAL = [0, 25, 35, 45, 55, 75, 95, 120, 160];
  const DIRS = [[1, 0], [-1, 0], [0, 1], [0, -1]];
  const S = { b: null, turn: 0, over: false, sel: -1, mv: [], anim: null, my: 0 };
  let ctx = null, cv = null, g = null, cw = 0, chh = 0, cell = 0, dpr = 1;
  const k2 = (x, y) => x + ',' + y;
  const sideOf = v => v >= 10 ? 1 : 0;
  const isW = (x, y) => y > 2 && y < 6 && (x === 1 || x === 2 || x === 4 || x === 5);

  function start() {
    S.b = new Array(C * R).fill(0);
    const P = [[0, 0, 1, 7], [6, 0, 1, 6], [1, 1, 1, 4], [5, 1, 1, 2], [0, 2, 1, 1], [2, 2, 1, 5], [4, 2, 1, 3], [6, 2, 1, 8], [6, 6, 0, 8], [4, 6, 0, 3], [2, 6, 0, 5], [0, 6, 0, 1], [1, 7, 0, 2], [5, 7, 0, 4], [0, 8, 0, 6], [6, 8, 0, 7]];
    for (const p of P) S.b[p[1] * C + p[0]] = p[2] * 10 + p[3];
    S.turn = 0; S.over = false; S.sel = -1; S.mv = []; S.anim = null;
  }

  function effRank(v, x, y) {
    const s = sideOf(v), r = v % 10;
    if (TRAPS[0].indexOf(k2(x, y)) >= 0) return s === 0 ? r : 0;
    if (TRAPS[1].indexOf(k2(x, y)) >= 0) return s === 1 ? r : 0;
    return r;
  }

  function canEat(a, ax, ay, d, dx, dy) {
    const ar = a % 10;
    const de = effRank(d, dx, dy);
    if (de === 0) return true;
    if (isW(ax, ay) !== isW(dx, dy)) return false;
    if (ar === 8 && de === 1) return false;
    if (ar === 1 && de === 8) return true;
    return ar >= de;
  }

  function movesOn(bd, x, y) {
    const v = bd[y * C + x];
    const s = sideOf(v), r = v % 10;
    const out = [];
    const tryTo = (tx, ty) => {
      if (tx < 0 || tx >= C || ty < 0 || ty >= R) return;
      if (k2(tx, ty) === DEN[s]) return;
      const t = bd[ty * C + tx];
      if (t === 0) {
        if (isW(tx, ty) && r !== 1) return;
        out.push({ x: tx, y: ty, cap: 0 });
        return;
      }
      if (sideOf(t) === s) return;
      if (canEat(v, x, y, t, tx, ty)) out.push({ x: tx, y: ty, cap: t });
    };
    for (const d of DIRS) tryTo(x + d[0], y + d[1]);
    if ((r === 6 || r === 7) && !isW(x, y)) {
      for (const d of DIRS) {
        if (!isW(x + d[0], y + d[1])) continue;
        let i = 1, blocked = false;
        while (isW(x + d[0] * i, y + d[1] * i)) {
          if (bd[(y + d[1] * i) * C + x + d[0] * i] !== 0) { blocked = true; break; }
          i++;
        }
        if (blocked) continue;
        tryTo(x + d[0] * i, y + d[1] * i);
      }
    }
    return out;
  }

  function allMoves(s) {
    const out = [];
    for (let i = 0; i < C * R; i++) {
      const v = S.b[i];
      if (v && sideOf(v) === s) {
        for (const m of movesOn(S.b, i % C, (i / C) | 0)) out.push({ f: i, m });
      }
    }
    return out;
  }

  function doMove(fx, fy, tx, ty, net) {
    const v = S.b[fy * C + fx];
    const s = sideOf(v);
    const cap = S.b[ty * C + tx];
    S.b[ty * C + tx] = v;
    S.b[fy * C + fx] = 0;
    S.sel = -1; S.mv = [];
    S.anim = { fx, fy, tx, ty, cap, t0: performance.now() };
    ctx.sfx.play(cap ? 'pop' : 'place');
    let winner = -1, wtxt = '', ltxt = '';
    if (k2(tx, ty) === DEN[1 - s]) { winner = s; wtxt = '攻入对方兽穴，大获全胜！'; ltxt = '对方攻入你的兽穴。'; }
    else if (!S.b.some(p => p !== 0 && sideOf(p) === 1 - s)) { winner = s; wtxt = '全歼对方兽群！'; ltxt = '你的兽群被全歼。'; }
    else {
      S.turn = 1 - s;
      if (allMoves(S.turn).length === 0) { winner = s; wtxt = '对方无路可走！'; ltxt = '你无路可走。'; }
    }
    if (ctx.mode === 'online' && !net) ctx.send('mv', { f: [fx, fy, tx, ty] }, ser());
    if (winner >= 0) {
      S.over = true;
      setTimeout(() => ctx.finish(winner === S.my ? 'win' : 'lose', winner === S.my ? wtxt : ltxt), 650);
    } else afterTurn();
  }

  function ser() { return { g: 'jungle', b: S.b.slice(), t: S.turn }; }
  function restore(s) {
    const mine = s && (s['s' + S.my] || s.s0 || s.s1);
    if (!mine || !mine.b) return;
    S.b = mine.b.slice();
    S.turn = mine.t || 0;
    S.over = false; S.sel = -1; S.mv = []; S.anim = null;
    draw();
    afterTurn();
  }

  function afterTurn() {
    if (S.over) return;
    draw();
    if (S.turn === S.my) { ctx.turn(0); ctx.setStatus('你的回合'); }
    else {
      ctx.turn(1); ctx.setStatus('等待对方行动…');
      if (ctx.mode === 'ai') setTimeout(aiGo, 550 + Math.random() * 400);
    }
  }

  function aiGo() {
    if (S.over || S.turn === S.my || ctx.mode !== 'ai') return;
    const s = S.turn;
    const dp = DEN[1 - s].split(',');
    const dx = +dp[0], dy = +dp[1];
    let best = null, bs = -1e9;
    for (const a of allMoves(s)) {
      const v = S.b[a.f], r = v % 10;
      const x = a.f % C, y = (a.f / C) | 0;
      const m = a.m;
      let sc = Math.random() * 8;
      if (m.x === dx && m.y === dy) sc += 1e5;
      if (m.cap) sc += VAL[m.cap % 10];
      const nd = Math.abs(m.x - dx) + Math.abs(m.y - dy);
      const cd = Math.abs(x - dx) + Math.abs(y - dy);
      sc += (cd - nd) * 4;
      const tb = S.b.slice();
      tb[m.y * C + m.x] = v;
      tb[y * C + x] = 0;
      let danger = false;
      for (let j = 0; j < C * R; j++) {
        const p = tb[j];
        if (!p || sideOf(p) === s) continue;
        if (movesOn(tb, j % C, (j / C) | 0).some(mm => mm.x === m.x && mm.y === m.y)) { danger = true; break; }
      }
      if (danger) sc -= VAL[r] * .85;
      let curDanger = false;
      for (let j = 0; j < C * R; j++) {
        const p = S.b[j];
        if (!p || sideOf(p) === s) continue;
        if (movesOn(S.b, j % C, (j / C) | 0).some(mm => mm.x === x && mm.y === y)) { curDanger = true; break; }
      }
      if (curDanger && !danger) sc += VAL[r] * .6;
      if (sc > bs) { bs = sc; best = a; }
    }
    if (best) doMove(best.f % C, (best.f / C) | 0, best.m.x, best.m.y, false);
  }

  function piece(cx, cy, v, sc, al) {
    const s = sideOf(v), r = cell * .4 * (sc || 1);
    g.save();
    g.globalAlpha = al == null ? 1 : al;
    g.beginPath(); g.arc(cx, cy + r * .12, r, 0, 7);
    g.fillStyle = 'rgba(50,45,30,.28)'; g.filter = 'blur(3px)'; g.fill(); g.filter = 'none';
    const gr = g.createRadialGradient(cx - r * .35, cy - r * .42, r * .12, cx, cy, r);
    if (s === 0) { gr.addColorStop(0, '#ffbe6a'); gr.addColorStop(.55, '#ff8f42'); gr.addColorStop(1, '#e2562a'); }
    else { gr.addColorStop(0, '#8fb0ff'); gr.addColorStop(.55, '#5d7cf2'); gr.addColorStop(1, '#3d4fd4'); }
    g.beginPath(); g.arc(cx, cy, r, 0, 7);
    g.fillStyle = gr; g.fill();
    g.strokeStyle = 'rgba(255,255,255,.45)'; g.lineWidth = 1.2; g.stroke();
    g.beginPath(); g.arc(cx - r * .3, cy - r * .36, r * .2, 0, 7);
    g.fillStyle = 'rgba(255,255,255,.35)'; g.fill();
    g.font = Math.round(r * 1.05) + 'px system-ui,sans-serif';
    g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText(EMO[v % 10], cx, cy + r * .05);
    g.beginPath(); g.arc(cx + r * .6, cy - r * .6, r * .3, 0, 7);
    g.fillStyle = '#fffdf6'; g.fill();
    g.fillStyle = s === 0 ? '#d94f22' : '#3d4fd4';
    g.font = '700 ' + Math.round(r * .42) + 'px system-ui,sans-serif';
    g.fillText(String(v % 10), cx + r * .6, cy - r * .58);
    g.restore();
  }

  function draw(t) {
    if (!g) return;
    const tt = t || performance.now();
    g.clearRect(0, 0, cw, chh);
    const bg = g.createLinearGradient(0, 0, cw, chh);
    bg.addColorStop(0, '#fbf7ea'); bg.addColorStop(1, '#f1ecda');
    g.fillStyle = bg;
    g.beginPath(); g.roundRect(0, 0, cw, chh, 16); g.fill();
    for (let y = 0; y < R; y++) for (let x = 0; x < C; x++) {
      const px = x * cell, py = y * cell, kk = k2(x, y);
      if (isW(x, y)) {
        const wg = g.createLinearGradient(px, py, px, py + cell);
        wg.addColorStop(0, '#cde9fb'); wg.addColorStop(1, '#a3d0f0');
        g.fillStyle = wg;
        g.fillRect(px, py, cell + .5, cell + .5);
        g.strokeStyle = 'rgba(255,255,255,.6)'; g.lineWidth = 1.4;
        for (let wi = 0; wi < 2; wi++) {
          const wy = py + cell * (.36 + wi * .28);
          g.beginPath();
          g.moveTo(px + cell * .16, wy);
          g.quadraticCurveTo(px + cell * .32, wy - cell * .07, px + cell * .5, wy);
          g.quadraticCurveTo(px + cell * .68, wy + cell * .07, px + cell * .84, wy);
          g.stroke();
        }
      } else if (kk === DEN[0] || kk === DEN[1]) {
        const ow = kk === DEN[0] ? 0 : 1;
        g.fillStyle = ow === 0 ? '#ffe7d2' : '#dfe6ff';
        g.fillRect(px, py, cell + .5, cell + .5);
        g.fillStyle = ow === 0 ? 'rgba(200,90,40,.75)' : 'rgba(60,80,200,.75)';
        g.font = '700 ' + Math.round(cell * .46) + 'px system-ui,sans-serif';
        g.textAlign = 'center'; g.textBaseline = 'middle';
        g.fillText('穴', px + cell / 2, py + cell / 2 + 1);
        g.strokeStyle = ow === 0 ? 'rgba(220,110,50,.55)' : 'rgba(70,95,215,.55)';
        g.lineWidth = 2;
        g.strokeRect(px + 2.5, py + 2.5, cell - 5, cell - 5);
      } else if (TRAPS[0].indexOf(kk) >= 0 || TRAPS[1].indexOf(kk) >= 0) {
        g.fillStyle = '#efe1bd';
        g.fillRect(px, py, cell + .5, cell + .5);
        g.strokeStyle = 'rgba(176,120,50,.5)'; g.lineWidth = 2; g.lineCap = 'round';
        g.beginPath();
        g.moveTo(px + cell * .28, py + cell * .28); g.lineTo(px + cell * .72, py + cell * .72);
        g.moveTo(px + cell * .72, py + cell * .28); g.lineTo(px + cell * .28, py + cell * .72);
        g.stroke();
      } else {
        g.fillStyle = (x + y) % 2 ? '#f2eedb' : '#f8f5e8';
        g.fillRect(px, py, cell + .5, cell + .5);
      }
      g.strokeStyle = 'rgba(130,115,80,.16)'; g.lineWidth = 1;
      g.strokeRect(px + .5, py + .5, cell - 1, cell - 1);
    }
    if (S.sel >= 0 && !S.anim) {
      const sx = S.sel % C, sy = (S.sel / C) | 0;
      g.strokeStyle = 'rgba(255,180,40,.95)'; g.lineWidth = 3;
      g.strokeRect(sx * cell + 2, sy * cell + 2, cell - 4, cell - 4);
      for (const m of S.mv) {
        g.beginPath();
        g.arc(m.x * cell + cell / 2, m.y * cell + cell / 2, m.cap ? cell * .4 : cell * .14, 0, 7);
        g.fillStyle = m.cap ? 'rgba(230,70,60,.22)' : 'rgba(60,160,90,.32)';
        g.fill();
        g.strokeStyle = m.cap ? 'rgba(230,70,60,.7)' : 'rgba(60,160,90,.8)';
        g.lineWidth = 2;
        g.stroke();
      }
    }
    for (let i = 0; i < C * R; i++) {
      if (!S.b[i]) continue;
      if (S.anim && i === S.anim.ty * C + S.anim.tx) continue;
      piece(i % C * cell + cell / 2, ((i / C) | 0) * cell + cell / 2, S.b[i], 1, 1);
    }
    if (S.anim) {
      const p = Math.min(1, (tt - S.anim.t0) / 260);
      const e = 1 - Math.pow(1 - p, 3);
      if (S.anim.cap) piece(S.anim.tx * cell + cell / 2, S.anim.ty * cell + cell / 2, S.anim.cap, 1 - .45 * e, 1 - e);
      const gx = (S.anim.fx + (S.anim.tx - S.anim.fx) * e) * cell + cell / 2;
      const gy = (S.anim.fy + (S.anim.ty - S.anim.fy) * e) * cell + cell / 2;
      piece(gx, gy, S.b[S.anim.ty * C + S.anim.tx], 1 + .08 * Math.sin(e * Math.PI), 1);
      if (p < 1) requestAnimationFrame(draw); else { S.anim = null; draw(); }
    }
  }

  function onResize() {
    const w = Math.min(500, ctx.root.clientWidth - 8, window.innerWidth - 48);
    dpr = Math.min(window.devicePixelRatio || 1, 2.5);
    cell = w / C;
    cw = w; chh = cell * R;
    cv.width = cw * dpr; cv.height = chh * dpr;
    cv.style.width = cw + 'px'; cv.style.height = chh + 'px';
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    draw();
  }

  return {
    create(c) {
      ctx = c;
      start();
      S.my = c.mode === 'ai' ? 0 : c.side;
      cv = document.createElement('canvas');
      cv.className = 'gk-cv';
      cv.style.cssText = 'border-radius:16px;box-shadow:0 10px 30px rgba(90,70,20,.16),0 2px 6px rgba(0,0,0,.08);touch-action:manipulation';
      c.root.appendChild(cv);
      g = cv.getContext('2d');
      const hint = document.createElement('div');
      hint.style.cssText = 'font-size:13px;color:var(--ink2);font-weight:600;margin-top:10px;text-align:center';
      hint.textContent = '点选己方野兽 → 高亮格行棋 · 鼠可入河 · 狮虎可跳河 · 入敌穴者胜';
      c.root.appendChild(hint);
      onResize();
      window.addEventListener('resize', onResize);
      cv.addEventListener('pointerdown', e => {
        const r = cv.getBoundingClientRect();
        const x = Math.floor((e.clientX - r.left) / cell);
        const y = Math.floor((e.clientY - r.top) / cell);
        if (x < 0 || x >= C || y < 0 || y >= R || S.over || S.anim || S.turn !== S.my) return;
        const i = y * C + x, v = S.b[i];
        if (S.sel >= 0 && S.mv.some(m => m.x === x && m.y === y)) {
          doMove(S.sel % C, (S.sel / C) | 0, x, y, false);
          return;
        }
        if (v && sideOf(v) === S.my) {
          S.sel = i;
          S.mv = movesOn(S.b, x, y);
          ctx.sfx.play('click');
        } else { S.sel = -1; S.mv = []; }
        draw();
      });
      c.onMsg((k, d) => { if (k === 'mv' && d && d.f && !S.over) doMove(d.f[0], d.f[1], d.f[2], d.f[3], true); });
      c.onRestore(s => restore(s));
      afterTurn();
      if (c.mode === 'online' && c.side === 0) c.send('hello', null, ser());
      return { destroy() { window.removeEventListener('resize', onResize); } };
    }
  };
})();
