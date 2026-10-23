'use strict';
window.GameDef = (() => {
  const W = 480, H = 720, MID = H / 2, PAD_R = 34, PUCK_R = 16, GW = 160, WIN = 7;
  let ctx = null, cv = null, g = null, dpr = 1, scale = 1, rafId = 0, stopped = false, lastSend = 0, lastIn = 0;
  const S = {
    pads: [
      { x: W / 2, y: H - 130, vx: 0, vy: 0, tx: W / 2, ty: H - 130 },
      { x: W / 2, y: 130, vx: 0, vy: 0, tx: W / 2, ty: 130 }
    ],
    puck: { x: W / 2, y: MID, vx: 0, vy: 0 },
    trail: [], parts: [], scores: [0, 0], serveT: 100, over: false,
    flash: [0, 0], pop: [0, 0], goalT: 0, hitT: 0, aiErr: 0, aiT: 0, done: false
  };
  const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
  const isHost = () => ctx.mode !== 'online' || ctx.side === 0;
  const myIdx = () => ctx.mode === 'online' ? ctx.side : 0;
  const flipped = () => ctx.mode === 'online' && ctx.side === 1;

  function padLim(i) {
    return i === 0
      ? { x0: PAD_R + 6, x1: W - PAD_R - 6, y0: MID, y1: H - PAD_R - 6 }
      : { x0: PAD_R + 6, x1: W - PAD_R - 6, y0: PAD_R + 6, y1: MID };
  }
  function resetPuck() {
    S.puck.x = W / 2; S.puck.y = MID; S.puck.vx = 0; S.puck.vy = 0;
    S.trail.length = 0; S.serveT = 60;
  }
  function serve() {
    const a = Math.random() * Math.PI * 2;
    S.puck.vx = Math.cos(a) * 4.6; S.puck.vy = Math.sin(a) * 4.6;
    ctx.sfx.play('pop');
  }
  function burst(x, y, n, col) {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2, sp = 1.5 + Math.random() * 4;
      S.parts.push({ x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, life: 1, r: 2 + Math.random() * 3.5, col });
    }
  }
  function snap() {
    return {
      g: 'airhockey',
      puck: [S.puck.x, S.puck.y, S.puck.vx, S.puck.vy],
      pads: [S.pads[0].x, S.pads[0].y, S.pads[1].x, S.pads[1].y],
      s: S.scores.slice(), sv: S.serveT, ov: S.over ? 1 : 0
    };
  }
  function endGame(w, remote) {
    if (S.done) return;
    S.done = true; S.over = true;
    const iWin = ctx.mode === 'ai' ? w === 0 : w === ctx.side;
    const name = iWin ? '你' : (ctx.mode === 'ai' ? 'AI' : ctx.opp.name);
    if (ctx.mode === 'online' && !remote) {
      ctx.send('end', { w, s: S.scores.slice() });
      ctx.send('st', snap(), snap());
    }
    setTimeout(() => {
      if (stopped) return;
      ctx.finish(iWin ? 'win' : 'lose', name + '获胜 · 比分 ' + S.scores[0] + ' : ' + S.scores[1]);
    }, 950);
  }
  function goal(winner) {
    S.scores[winner]++; S.pop[winner] = 1; S.flash[winner === 0 ? 0 : 1] = 1; S.goalT = 1;
    burst(W / 2, winner === 0 ? 6 : H - 6, 36, winner === 0 ? '#5aa7ff' : '#ff6482');
    ctx.sfx.play(winner === myIdx() ? 'good' : 'bad');
    if (S.scores[winner] >= WIN) { S.over = true; endGame(winner, false); return; }
    resetPuck();
  }
  function physPads() {
    for (let i = 0; i < 2; i++) {
      const p = S.pads[i], lim = padLim(i);
      const nx = clamp(p.tx, lim.x0, lim.x1), ny = clamp(p.ty, lim.y0, lim.y1);
      p.vx = (nx - p.x) * .5; p.vy = (ny - p.y) * .5;
      p.x += p.vx; p.y += p.vy;
    }
  }
  function physPuck() {
    const k = S.puck;
    for (let i = 0; i < 2; i++) {
      const p = S.pads[i];
      const dx = k.x - p.x, dy = k.y - p.y, d = Math.hypot(dx, dy), min = PAD_R + PUCK_R;
      if (d < min && d > .01) {
        const nx = dx / d, ny = dy / d;
        k.x = p.x + nx * min; k.y = p.y + ny * min;
        const rel = (k.vx - p.vx) * nx + (k.vy - p.vy) * ny;
        if (rel < 0) {
          k.vx -= 1.85 * rel * nx; k.vy -= 1.85 * rel * ny;
          S.hitT = 1;
          burst(k.x - nx * PUCK_R, k.y - ny * PUCK_R, 5, '#cfe8ff');
          ctx.sfx.play('pop');
        }
      }
    }
    const sp = Math.hypot(k.vx, k.vy);
    if (sp > 19) { k.vx *= 19 / sp; k.vy *= 19 / sp; }
    k.vx *= .995; k.vy *= .995;
    k.x += k.vx; k.y += k.vy;
    if (k.x < PUCK_R) { k.x = PUCK_R; k.vx = Math.abs(k.vx); ctx.sfx.play('tick'); }
    if (k.x > W - PUCK_R) { k.x = W - PUCK_R; k.vx = -Math.abs(k.vx); ctx.sfx.play('tick'); }
    const mouth = Math.abs(k.x - W / 2) < GW / 2 - 4;
    if (k.y < PUCK_R) {
      if (mouth && k.y < -PUCK_R) { goal(0); return; }
      if (!mouth) { k.y = PUCK_R; k.vy = Math.abs(k.vy); ctx.sfx.play('tick'); }
    }
    if (k.y > H - PUCK_R) {
      if (mouth && k.y > H + PUCK_R) { goal(1); return; }
      if (!mouth) { k.y = H - PUCK_R; k.vy = -Math.abs(k.vy); ctx.sfx.play('tick'); }
    }
  }
  function aiTick() {
    S.aiT++;
    if (S.aiT % 42 === 0) S.aiErr = Math.random() < .08 ? (Math.random() - .5) * 170 : (Math.random() - .5) * 26;
    const p = S.pads[1], k = S.puck;
    let tx, ty;
    if (k.y < MID - 10) {
      const gx = W / 2 + S.aiErr, gy = H + 60;
      const dx = gx - k.x, dy = gy - k.y, dl = Math.hypot(dx, dy) || 1;
      if (dl < 250) { tx = k.x - dx / dl * 46; ty = k.y - dy / dl * 46; }
      else { tx = k.x; ty = k.y - 34; }
    } else {
      tx = W / 2 + (k.x - W / 2) * .4 + S.aiErr; ty = 98;
    }
    const lim = padLim(1);
    const nx = clamp(tx, lim.x0, lim.x1), ny = clamp(ty, lim.y0, lim.y1);
    const ddx = nx - p.tx, ddy = ny - p.ty, dd = Math.hypot(ddx, ddy);
    if (dd > 10.5) { p.tx += ddx / dd * 10.5; p.ty += ddy / dd * 10.5; }
    else { p.tx = nx; p.ty = ny; }
  }
  function applySnap(st) {
    if (!st || st.g !== 'airhockey') return;
    if (st.ov && !S.over) {
      const w = st.s[0] >= WIN ? 0 : 1;
      S.scores = st.s.slice();
      endGame(w, true);
      return;
    }
    S.pads[0].tx = st.pads[0]; S.pads[0].ty = st.pads[1];
    S.pads[1].tx = st.pads[2]; S.pads[1].ty = st.pads[3];
    S.puck.x = st.puck[0]; S.puck.y = st.puck[1];
    S.puck.vx = st.puck[2]; S.puck.vy = st.puck[3];
    S.scores = st.s.slice(); S.serveT = st.sv;
  }
  function updFx() {
    S.flash[0] *= .93; S.flash[1] *= .93;
    S.pop[0] *= .9; S.pop[1] *= .9;
    S.goalT *= .965; S.hitT *= .88;
    S.trail.push({ x: S.puck.x, y: S.puck.y });
    if (S.trail.length > 16) S.trail.shift();
    for (let i = S.parts.length - 1; i >= 0; i--) {
      const p = S.parts[i];
      p.x += p.vx; p.y += p.vy; p.vx *= .96; p.vy *= .96; p.life -= .022;
      if (p.life <= 0) S.parts.splice(i, 1);
    }
  }
  function glow(x, y, r, col, a) {
    const gr = g.createRadialGradient(x, y, 0, x, y, r);
    gr.addColorStop(0, col); gr.addColorStop(1, 'rgba(0,0,0,0)');
    g.globalAlpha = a; g.fillStyle = gr;
    g.beginPath(); g.arc(x, y, r, 0, 7); g.fill();
    g.globalAlpha = 1;
  }
  function Y(y) { return flipped() ? H - y : y; }
  function drawGoalLine(top, flash, col) {
    const gy = top ? 4 : H - 4;
    g.save();
    g.strokeStyle = col; g.lineWidth = 5;
    g.shadowColor = col; g.shadowBlur = 12 + flash * 26;
    g.globalAlpha = .55 + flash * .45;
    g.beginPath();
    g.moveTo(W / 2 - GW / 2, gy); g.lineTo(W / 2 + GW / 2, gy);
    g.stroke();
    g.restore();
    if (flash > .02) glow(W / 2, top ? 10 : H - 10, 130, 'rgba(255,255,255,.55)', flash);
  }
  function drawPad(p, col, col2) {
    const x = p.x, y = Y(p.y);
    g.save();
    g.shadowColor = 'rgba(0,0,0,.45)'; g.shadowBlur = 14; g.shadowOffsetY = 5;
    const gr = g.createRadialGradient(x - 10, y - 12, 4, x, y, PAD_R);
    gr.addColorStop(0, col); gr.addColorStop(1, col2);
    g.fillStyle = gr;
    g.beginPath(); g.arc(x, y, PAD_R, 0, 7); g.fill();
    g.shadowBlur = 0; g.shadowOffsetY = 0;
    g.fillStyle = 'rgba(255,255,255,.28)';
    g.beginPath(); g.ellipse(x, y - PAD_R * .42, PAD_R * .55, PAD_R * .3, 0, 0, 7); g.fill();
    g.strokeStyle = 'rgba(255,255,255,.35)'; g.lineWidth = 2;
    g.beginPath(); g.arc(x, y, PAD_R - 4, 0, 7); g.stroke();
    g.restore();
  }
  function draw() {
    if (!g) return;
    g.clearRect(0, 0, W, H);
    const bg = g.createLinearGradient(0, 0, 0, H);
    bg.addColorStop(0, flipped() ? '#12324b' : '#0e2740');
    bg.addColorStop(.5, '#0d2136');
    bg.addColorStop(1, flipped() ? '#0e2740' : '#12324b');
    g.fillStyle = bg;
    g.beginPath(); g.roundRect(0, 0, W, H, 20); g.fill();
    g.save();
    g.beginPath(); g.roundRect(0, 0, W, H, 20); g.clip();
    g.strokeStyle = 'rgba(180,220,255,.09)'; g.lineWidth = 1.5;
    for (let i = 1; i < 8; i++) { g.beginPath(); g.moveTo(0, H / 8 * i); g.lineTo(W, H / 8 * i); g.stroke(); }
    g.strokeStyle = 'rgba(255,255,255,.35)'; g.lineWidth = 3; g.setLineDash([16, 14]);
    g.beginPath(); g.moveTo(0, Y(MID)); g.lineTo(W, Y(MID)); g.stroke();
    g.setLineDash([]);
    g.strokeStyle = 'rgba(255,255,255,.2)'; g.lineWidth = 2.5;
    g.beginPath(); g.arc(W / 2, Y(MID), 58, 0, 7); g.stroke();
    g.beginPath(); g.arc(W / 2, Y(MID), 6, 0, 7); g.fillStyle = 'rgba(255,255,255,.3)'; g.fill();
    g.strokeStyle = 'rgba(255,255,255,.12)';
    g.beginPath(); g.arc(W / 2, Y(6), 110, 0, Math.PI); g.stroke();
    g.beginPath(); g.arc(W / 2, Y(H - 6), 110, Math.PI, Math.PI * 2); g.stroke();
    drawGoalLine(true, S.flash[0], '#ff6482');
    drawGoalLine(false, S.flash[1], '#5aa7ff');
    g.font = '900 110px -apple-system, "Segoe UI", sans-serif';
    g.textAlign = 'center';
    const sc = (v, x, pop, col) => {
      g.save();
      g.translate(x, Y(MID)); g.scale(1 + pop * .45, 1 + pop * .45);
      g.fillStyle = col;
      g.fillText(v, 0, 40);
      g.restore();
    };
    sc(S.scores[0], W / 2 - 100, S.pop[0], 'rgba(120,190,255,.16)');
    sc(S.scores[1], W / 2 + 100, S.pop[1], 'rgba(255,140,170,.16)');
    for (let i = 0; i < S.trail.length; i++) {
      const t = S.trail[i], a = i / S.trail.length;
      g.globalAlpha = a * .3;
      g.fillStyle = '#9fd4ff';
      g.beginPath(); g.arc(t.x, Y(t.y), PUCK_R * a * .9, 0, 7); g.fill();
    }
    g.globalAlpha = 1;
    for (const p of S.parts) {
      g.globalAlpha = p.life;
      g.fillStyle = p.col;
      g.beginPath(); g.arc(p.x, Y(p.y), p.r, 0, 7); g.fill();
    }
    g.globalAlpha = 1;
    if (S.hitT > .03) glow(S.puck.x, Y(S.puck.y), 60, 'rgba(160,210,255,.5)', S.hitT);
    if (!S.over && S.serveT > 0) glow(W / 2, Y(MID), 70, 'rgba(120,190,255,.4)', .4 + .3 * Math.sin(performance.now() / 150));
    drawPad(S.pads[1], '#ff8ba0', '#c2455f');
    drawPad(S.pads[0], '#7cc0ff', '#2c62b8');
    const k = S.puck;
    g.save();
    g.shadowColor = 'rgba(0,0,0,.5)'; g.shadowBlur = 12; g.shadowOffsetY = 4;
    const pg = g.createRadialGradient(k.x - 5, Y(k.y) - 6, 2, k.x, Y(k.y), PUCK_R);
    pg.addColorStop(0, '#5a636e'); pg.addColorStop(1, '#171c22');
    g.fillStyle = pg;
    g.beginPath(); g.arc(k.x, Y(k.y), PUCK_R, 0, 7); g.fill();
    g.restore();
    g.strokeStyle = 'rgba(255,255,255,.4)'; g.lineWidth = 2;
    g.beginPath(); g.arc(k.x, Y(k.y), PUCK_R - 3.5, 0, 7); g.stroke();
    if (S.goalT > .04) {
      g.save();
      g.globalAlpha = S.goalT;
      g.translate(W / 2, Y(MID));
      g.scale(1 + (1 - S.goalT) * .6, 1 + (1 - S.goalT) * .6);
      g.fillStyle = '#fff';
      g.font = '900 64px -apple-system, "Segoe UI", sans-serif';
      g.shadowColor = 'rgba(120,190,255,.9)'; g.shadowBlur = 24;
      g.fillText('GOAL!', 0, -100);
      g.restore();
    }
    if (!S.over && S.serveT > 0) {
      g.fillStyle = 'rgba(255,255,255,.9)';
      g.font = '800 46px -apple-system, sans-serif';
      g.fillText(Math.ceil(S.serveT / 60), W / 2, Y(MID) + 110);
    }
    g.restore();
    g.strokeStyle = 'rgba(255,255,255,.14)'; g.lineWidth = 2;
    g.beginPath(); g.roundRect(2, 2, W - 4, H - 4, 19); g.stroke();
  }
  function resize() {
    const w = Math.min(480, window.innerWidth - 44, 520);
    const h = w * H / W;
    dpr = Math.min(window.devicePixelRatio || 1, 2.5);
    cv.width = W * dpr; cv.height = H * dpr;
    cv.style.width = w + 'px'; cv.style.height = h + 'px';
    scale = w / W;
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
  }
  function onPtr(e) {
    const r = cv.getBoundingClientRect();
    let x = (e.clientX - r.left) / scale, y = (e.clientY - r.top) / scale;
    if (flipped()) y = H - y;
    const p = S.pads[myIdx()];
    p.tx = x; p.ty = y;
  }
  function loop() {
    if (stopped) return;
    const now = performance.now();
    if (!S.over) {
      if (isHost()) {
        if (ctx.mode === 'ai') aiTick();
        physPads();
        if (S.serveT > 0) { S.serveT--; if (S.serveT === 0) serve(); }
        else physPuck();
        if (ctx.mode === 'online' && now - lastSend > 50) { lastSend = now; ctx.send('st', snap(), snap()); }
      } else {
        for (const p of S.pads) { p.x += (p.tx - p.x) * .45; p.y += (p.ty - p.y) * .45; }
        if (now - lastIn > 60) {
          lastIn = now;
          const p = S.pads[myIdx()];
          ctx.send('in', { x: p.tx, y: p.ty });
        }
      }
    }
    updFx();
    draw();
    rafId = requestAnimationFrame(loop);
  }
  return {
    create(c) {
      ctx = c;
      cv = document.createElement('canvas');
      cv.className = 'gk-cv';
      cv.style.cssText = 'display:block;margin:0 auto;border-radius:20px;cursor:crosshair;touch-action:none';
      c.root.appendChild(cv);
      g = cv.getContext('2d');
      resize();
      window.addEventListener('resize', resize);
      cv.addEventListener('pointermove', onPtr);
      cv.addEventListener('pointerdown', onPtr);
      c.onMsg((k, d) => {
        if (k === 'in' && d && isHost()) {
          const lim = padLim(1);
          S.pads[1].tx = clamp(d.x, lim.x0, lim.x1);
          S.pads[1].ty = clamp(d.y, lim.y0, lim.y1);
        } else if (k === 'st' && d) applySnap(d);
        else if (k === 'end' && d) {
          S.scores = d.s || S.scores;
          endGame(d.w, true);
        }
      });
      c.onRestore(s => {
        const st = s && (s.s0 || s.s1);
        if (st) applySnap(st);
      });
      c.onPeer(() => {});
      c.turn(-1);
      c.setStatus('拖动推杆击打冰球 · 先得 7 分获胜');
      c.setOppStatus(isHost() ? '等待中' : '对战中');
      if (c.mode === 'online' && c.side === 0) c.send('hello', null, snap());
      loop();
      return {
        destroy() {
          stopped = true;
          cancelAnimationFrame(rafId);
          window.removeEventListener('resize', resize);
        }
      };
    }
  };
})();
