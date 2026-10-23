'use strict';
window.GameDef = (() => {
  const S = { h: null, v: null, own: null, sc: [0, 0], turn: 0, over: false, anims: [], boxes: [], hover: null };
  let ctx = null, cv = null, g = null, W = 0, pad = 0, cell = 0, dpr = 1, scoreEl = null;
  const PC = [['#a58bff', '#7b5cff', '#5b3ed6'], ['#ffd28a', '#ff9f0a', '#d97e00']];
  const myIdx = () => ctx.mode === 'ai' ? 0 : ctx.side;
  const P = (r, c) => ({ x: pad + c * cell, y: pad + r * cell });

  function newGame() {
    S.h = Array.from({ length: 5 }, () => new Array(4).fill(0));
    S.v = Array.from({ length: 4 }, () => new Array(5).fill(0));
    S.own = Array.from({ length: 4 }, () => new Array(4).fill(0));
    S.sc = [0, 0]; S.turn = 0; S.over = false; S.anims = []; S.boxes = []; S.hover = null;
  }
  function serialize() { return { g: 'dots', h: S.h.map(a => a.slice()), v: S.v.map(a => a.slice()), o: S.own.map(a => a.slice()), s: S.sc.slice(), t: S.turn }; }
  function applySnap(m) {
    S.h = m.h.map(a => a.slice()); S.v = m.v.map(a => a.slice()); S.own = m.o.map(a => a.slice());
    S.sc = m.s.slice(); S.turn = m.t || 0; S.over = false; S.anims = []; S.boxes = []; S.hover = null;
    draw(); updScore(); afterTurn();
  }
  function deserialize(s) { const m = s && (s['s' + ctx.side] || s.s0 || s.s1); if (m && m.h) applySnap(m); }

  function boxCnt(r, c) { return S.h[r][c] + S.h[r + 1][c] + S.v[r][c] + S.v[r][c + 1]; }
  function adjBoxes(t, r, c) {
    return t === 'h'
      ? (r > 0 ? [[r - 1, c]] : []).concat(r < 4 ? [[r, c]] : [])
      : (c > 0 ? [[r, c - 1]] : []).concat(c < 4 ? [[r, c]] : []);
  }
  function setEdge(t, r, c) {
    if (S.over) return;
    const arr = t === 'h' ? S.h : S.v;
    if (arr[r][c]) return;
    const p = S.turn + 1;
    arr[r][c] = p;
    S.anims.push({ t: t, r: r, c: c, t0: performance.now() });
    ctx.sfx.play('place');
    let gained = false;
    for (const [br, bc] of adjBoxes(t, r, c)) {
      if (!S.own[br][bc] && boxCnt(br, bc) === 4) {
        S.own[br][bc] = p; S.sc[p - 1]++;
        S.boxes.push({ r: br, c: bc, t0: performance.now() });
        gained = true;
        ctx.sfx.play('good');
      }
    }
    if (S.sc[0] + S.sc[1] === 16) {
      S.over = true; S.turn = -1;
      const my = myIdx(), ms = S.sc[my], os = S.sc[1 - my];
      updScore();
      requestAnimationFrame(draw);
      setTimeout(() => ctx.finish(ms > os ? 'win' : ms < os ? 'lose' : 'draw', '最终比分 ' + ms + ' : ' + os), 800);
      return;
    }
    if (!gained) S.turn = 1 - S.turn;
    updScore();
    draw();
    afterTurn();
  }
  function updScore() {
    if (scoreEl) scoreEl.innerHTML = '<span style="color:#7b5cff">● ' + S.sc[0] + '</span><span style="color:var(--ink3);margin:0 10px">:</span><span style="color:#ff9f0a">' + S.sc[1] + ' ●</span>';
  }
  function afterTurn() {
    if (S.over) return;
    const my = myIdx();
    if (S.turn === my) { ctx.turn(0); ctx.setStatus('你的回合 · 点击两点间画边'); }
    else { ctx.turn(1); ctx.setStatus('对方思考中…'); if (ctx.mode === 'ai') setTimeout(aiMove, 480 + Math.random() * 420); }
  }

  function draw(t) {
    if (!g) return;
    t = t || performance.now();
    g.clearRect(0, 0, W, W);
    const bg = g.createLinearGradient(0, 0, W, W);
    bg.addColorStop(0, '#f6f4ff'); bg.addColorStop(1, '#ebe6ff');
    g.fillStyle = bg;
    g.beginPath(); g.roundRect(0, 0, W, W, 18); g.fill();
    for (let r = 0; r < 4; r++) for (let c = 0; c < 4; c++) {
      if (!S.own[r][c]) continue;
      const pi = S.own[r][c] - 1, col = PC[pi][1];
      let a = .16, sc2 = 1;
      const b = S.boxes.find(x => x.r === r && x.c === c);
      if (b) {
        const e2 = Math.min(1, (t - b.t0) / 380);
        const ease = 1 - (1 - e2) ** 3;
        a = .16 * ease + .14 * Math.sin(ease * Math.PI);
        sc2 = .8 + .2 * ease;
        if (e2 >= 1) S.boxes = S.boxes.filter(x => !(x.r === r && x.c === c));
      }
      g.save();
      g.translate(pad + c * cell + cell / 2, pad + r * cell + cell / 2);
      g.scale(sc2, sc2);
      g.fillStyle = col; g.globalAlpha = a;
      g.beginPath(); g.roundRect(-cell / 2 + 6, -cell / 2 + 6, cell - 12, cell - 12, 10); g.fill();
      g.globalAlpha = 1;
      g.fillStyle = col; g.font = '800 ' + cell * .3 + 'px sans-serif';
      g.textAlign = 'center'; g.textBaseline = 'middle';
      g.fillText(String(S.sc[pi]), 0, 1);
      g.restore();
    }
    S.anims = S.anims.filter(a2 => t < a2.t0 + 280);
    const animMap = new Map();
    for (const a2 of S.anims) animMap.set(a2.t + a2.r + '_' + a2.c, a2);
    g.lineCap = 'round';
    for (let r = 0; r < 5; r++) for (let c = 0; c < 4; c++) {
      if (!S.h[r][c]) continue;
      const p1 = P(r, c), p2 = P(r, c + 1);
      let end = p2;
      const an = animMap.get('h' + r + '_' + c);
      if (an) {
        const e2 = Math.min(1, (t - an.t0) / 280);
        const ee = 1 - (1 - e2) ** 2;
        end = { x: p1.x + (p2.x - p1.x) * ee, y: p1.y + (p2.y - p1.y) * ee };
      }
      g.strokeStyle = PC[S.h[r][c] - 1][1]; g.lineWidth = 5;
      g.beginPath(); g.moveTo(p1.x, p1.y); g.lineTo(end.x, end.y); g.stroke();
    }
    for (let r = 0; r < 4; r++) for (let c = 0; c < 5; c++) {
      if (!S.v[r][c]) continue;
      const p1 = P(r, c), p2 = P(r + 1, c);
      let end = p2;
      const an = animMap.get('v' + r + '_' + c);
      if (an) {
        const e2 = Math.min(1, (t - an.t0) / 280);
        const ee = 1 - (1 - e2) ** 2;
        end = { x: p1.x + (p2.x - p1.x) * ee, y: p1.y + (p2.y - p1.y) * ee };
      }
      g.strokeStyle = PC[S.v[r][c] - 1][1]; g.lineWidth = 5;
      g.beginPath(); g.moveTo(p1.x, p1.y); g.lineTo(end.x, end.y); g.stroke();
    }
    if (S.hover && !S.over && S.turn === myIdx()) {
      const hv = S.hover;
      const p1 = P(hv.r, hv.c);
      const p2 = hv.t === 'h' ? P(hv.r, hv.c + 1) : P(hv.r + 1, hv.c);
      g.strokeStyle = PC[S.turn][1]; g.globalAlpha = .4; g.lineWidth = 9;
      g.beginPath(); g.moveTo(p1.x, p1.y); g.lineTo(p2.x, p2.y); g.stroke();
      g.globalAlpha = 1;
    }
    for (let r = 0; r < 5; r++) for (let c = 0; c < 5; c++) {
      const p = P(r, c);
      const grd = g.createRadialGradient(p.x - 1.5, p.y - 1.5, .5, p.x, p.y, 5.5);
      grd.addColorStop(0, '#9a93b8'); grd.addColorStop(1, '#4e4768');
      g.beginPath(); g.arc(p.x, p.y, 5, 0, 7);
      g.fillStyle = grd; g.fill();
      g.beginPath(); g.arc(p.x - 1.4, p.y - 1.6, 1.5, 0, 7);
      g.fillStyle = 'rgba(255,255,255,.55)'; g.fill();
    }
    if (S.anims.length || S.boxes.length) requestAnimationFrame(draw);
  }

  function edgeAt(x, y) {
    let best = null, bd = 1e9;
    for (let r = 0; r < 5; r++) for (let c = 0; c < 4; c++) {
      if (S.h[r][c]) continue;
      const p1 = P(r, c), p2 = P(r, c + 1);
      if (y < p1.y - cell * .32 || y > p1.y + cell * .32 || x < p1.x - cell * .12 || x > p2.x + cell * .12) continue;
      const d = Math.abs(y - p1.y);
      if (d < bd) { bd = d; best = { t: 'h', r: r, c: c }; }
    }
    for (let r = 0; r < 4; r++) for (let c = 0; c < 5; c++) {
      if (S.v[r][c]) continue;
      const p1 = P(r, c), p2 = P(r + 1, c);
      if (x < p1.x - cell * .32 || x > p1.x + cell * .32 || y < p1.y - cell * .12 || y > p2.y + cell * .12) continue;
      const d = Math.abs(x - p1.x);
      if (d < bd) { bd = d; best = { t: 'v', r: r, c: c }; }
    }
    return bd < cell * .3 ? best : null;
  }

  function sacrifice(e) { return adjBoxes(e[0], e[1], e[2]).filter(([br, bc]) => boxCnt(br, bc) === 2).length; }
  function aiMove() {
    if (S.over || S.turn !== 1 || ctx.mode !== 'ai') return;
    const edges = [];
    for (let r = 0; r < 5; r++) for (let c = 0; c < 4; c++) if (!S.h[r][c]) edges.push(['h', r, c]);
    for (let r = 0; r < 4; r++) for (let c = 0; c < 5; c++) if (!S.v[r][c]) edges.push(['v', r, c]);
    if (!edges.length) return;
    const comp = edges.filter(e => adjBoxes(e[0], e[1], e[2]).some(([br, bc]) => boxCnt(br, bc) === 3));
    if (comp.length) {
      const e = comp[Math.floor(Math.random() * comp.length)];
      setEdge(e[0], e[1], e[2]);
      return;
    }
    const safe = edges.filter(e => sacrifice(e) === 0);
    const pool = safe.length ? safe : edges;
    let best = null, bs = 1e9;
    for (const e of pool) {
      const exposure = adjBoxes(e[0], e[1], e[2]).reduce((s2, [br, bc]) => s2 + boxCnt(br, bc), 0);
      const v = exposure * 10 + sacrifice(e) * 100 + Math.random() * 5;
      if (v < bs) { bs = v; best = e; }
    }
    if (best) setEdge(best[0], best[1], best[2]);
  }

  function onResize() {
    const w = Math.min(560, ctx.root.clientWidth - 8, window.innerWidth - 48);
    dpr = Math.min(window.devicePixelRatio || 1, 2.5);
    W = w; pad = w * 0.07; cell = (w - 2 * pad) / 4;
    cv.width = Math.round(W * dpr); cv.height = Math.round(W * dpr);
    cv.style.width = W + 'px'; cv.style.height = W + 'px';
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    draw();
  }
  return {
    create(c) {
      ctx = c;
      newGame();
      scoreEl = document.createElement('div');
      scoreEl.style.cssText = 'text-align:center;font-size:17px;font-weight:800;letter-spacing:1px;margin-bottom:10px';
      c.root.appendChild(scoreEl);
      cv = document.createElement('canvas');
      cv.style.cssText = 'display:block;margin:0 auto;border-radius:18px;box-shadow:0 12px 34px rgba(90,70,190,.2),0 2px 8px rgba(0,0,0,.08);cursor:pointer;touch-action:manipulation';
      c.root.appendChild(cv);
      g = cv.getContext('2d');
      const hint = document.createElement('div');
      hint.style.cssText = 'margin-top:10px;text-align:center;font-size:13px;font-weight:600;color:var(--ink2)';
      hint.textContent = '补上一格第 4 条边即占领得分，并可继续行动';
      c.root.appendChild(hint);
      onResize();
      updScore();
      window.addEventListener('resize', onResize);
      cv.addEventListener('pointermove', e => {
        if (S.over || S.turn !== myIdx()) return;
        const r = cv.getBoundingClientRect();
        const nv = edgeAt(e.clientX - r.left, e.clientY - r.top);
        const k1 = nv ? nv.t + nv.r + nv.c : '';
        const k2 = S.hover ? S.hover.t + S.hover.r + S.hover.c : '';
        if (k1 !== k2) { S.hover = nv; if (!S.anims.length && !S.boxes.length) draw(); }
      });
      cv.addEventListener('pointerleave', () => { S.hover = null; if (!S.anims.length && !S.boxes.length) draw(); });
      cv.addEventListener('pointerdown', e => {
        if (S.over || S.turn !== myIdx()) return;
        const r = cv.getBoundingClientRect();
        const ed = edgeAt(e.clientX - r.left, e.clientY - r.top);
        if (!ed) return;
        setEdge(ed.t, ed.r, ed.c);
        if (ctx.mode === 'online') ctx.send('mv', { t: ed.t, r: ed.r, c: ed.c }, serialize());
      });
      c.onMsg((k, d) => { if (k === 'mv' && d && d.t) setEdge(d.t, d.r, d.c); });
      c.onRestore(s => deserialize(s));
      afterTurn();
      if (c.mode === 'online' && c.side === 0) c.send('hello', null, serialize());
      return { destroy() { window.removeEventListener('resize', onResize); } };
    }
  };
})();
