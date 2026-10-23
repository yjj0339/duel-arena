'use strict';
window.GameDef = (() => {
  const W = 640, H = 800, PAD_W = 14, PAD_H = 120, BALL_R = 10, WIN = 7;
  const S = {
    host: false, over: false, ball: { x: W / 2, y: H / 2, vx: 0, vy: 0, spin: 0 },
    pads: [H / 2, H / 2], target: [H / 2, H / 2], scores: [0, 0], serve: 0, serveT: 0, started: false, flash: 0
  };
  let ctx = null, cv = null, g = null, dpr = 1, scale = 1, keys = {}, pointerY = null, lastSend = 0, rafId = 0;
  const acc = '#3478f6';

  function resetBall(dir) {
    S.ball.x = W / 2; S.ball.y = H / 2;
    const ang = (Math.random() * .5 - .25) + (Math.random() < .5 ? 0 : Math.PI);
    const sp = 8.5;
    S.ball.vx = Math.cos(ang) * sp * (dir || (Math.random() < .5 ? 1 : -1));
    S.ball.vy = Math.sin(ang) * sp * (Math.random() < .5 ? 1 : -1);
    S.ball.spin = 0;
    S.serveT = 90;
  }

  function stateSnap() {
    return { g: 'pong', b: { x: S.ball.x, y: S.ball.y, vx: S.ball.vx, vy: S.ball.vy }, p: [S.pads[0], S.pads[1]], s: S.scores, sv: S.serveT, ov: S.over ? 1 : 0 };
  }
  function applySnap(s) {
    const st = s && (s.s0 || s.s1);
    if (!st || !st.b) return;
    if (st.ov && !S.over) { S.over = true; endGame(st.s[0] >= WIN ? 0 : 1); return; }
    S.ball.x = st.b.x; S.ball.y = st.b.y; S.ball.vx = st.b.vx; S.ball.vy = st.b.vy;
    S.target[0] = st.p[0]; S.target[1] = st.p[1];
    S.scores = st.s.slice();
    S.serveT = st.sv;
  }

  function hostTick() {
    if (S.over) return;
    const b = S.ball;
    if (S.serveT > 0) S.serveT--;
    else {
      b.x += b.vx; b.y += b.vy;
      if (b.y < BALL_R) { b.y = BALL_R; b.vy = Math.abs(b.vy); Sfx.play('tick'); }
      if (b.y > H - BALL_R) { b.y = H - BALL_R; b.vy = -Math.abs(b.vy); Sfx.play('tick'); }
      const px = [PAD_W + 6, W - PAD_W - 6];
      if (b.vx < 0 && b.x - BALL_R < px[0] + PAD_W / 2 && b.x > px[0]) {
        if (Math.abs(b.y - S.pads[0]) < PAD_H / 2 + BALL_R) {
          b.x = px[0] + PAD_W / 2 + BALL_R;
          b.vx = Math.abs(b.vx) * 1.045;
          b.vy += (b.y - S.pads[0]) * .07;
          S.flash = 1; Sfx.play('pop');
        }
      }
      if (b.vx > 0 && b.x + BALL_R > px[1] - PAD_W / 2 && b.x < px[1]) {
        if (Math.abs(b.y - S.pads[1]) < PAD_H / 2 + BALL_R) {
          b.x = px[1] - PAD_W / 2 - BALL_R;
          b.vx = -Math.abs(b.vx) * 1.045;
          b.vy += (b.y - S.pads[1]) * .07;
          S.flash = 1; Sfx.play('pop');
        }
      }
      const sp = Math.hypot(b.vx, b.vy);
      if (sp > 17) { b.vx *= 17 / sp; b.vy *= 17 / sp; }
      if (b.x < -30) { S.scores[1]++; score(1); }
      if (b.x > W + 30) { S.scores[0]++; score(0); }
    }
  }
  function score(w) {
    Sfx.play(w === S.mySide() ? 'good' : 'bad');
    if (S.scores[w] >= WIN) {
      S.over = true;
      endGame(w);
      if (ctx.mode === 'online') ctx.send('st', null, stateSnap());
      return;
    }
    resetBall(w === 0 ? 1 : -1);
  }
  function endGame(w) {
    const iAmW = ctx.mode === 'ai' ? w === 0 : (S.host ? w === 0 : w === 1);
    setTimeout(() => ctx.finish(iAmW ? 'win' : 'lose', (S.scores[0]) + ' : ' + (S.scores[1])), 500);
  }

  function aiTick() {
    if (ctx.mode !== 'ai' || S.over) return;
    const b = S.ball;
    let aim = H / 2;
    if (b.vx > 0 && S.serveT <= 0) {
      let t = 0, x = b.x, y = b.y, vx = b.vx, vy = b.vy;
      while (x < W - PAD_W - 20 && t < 240) { x += vx; y += vy; if (y < BALL_R || y > H - BALL_R) vy = -vy; t++; }
      aim = y;
    } else aim = H / 2 + Math.sin(performance.now() / 700) * 90;
    const err = Math.max(0, Math.hypot(b.vx, b.vy) - 8) * (Math.random() < .02 ? 26 : 6);
    S.target[1] += (aim + err * (Math.random() - .5) - S.target[1]) * .11;
    S.target[1] = Math.max(PAD_H / 2, Math.min(H - PAD_H / 2, S.target[1]));
  }

  function tick() {
    if (!S.over) {
      if (S.host || ctx.mode === 'ai') {
        hostTick(); aiTick();
        S.pads[0] += (S.target[0] - S.pads[0]) * .5;
        S.pads[1] += (S.target[1] - S.pads[1]) * .35;
        const now2 = performance.now();
        if (ctx.mode === 'online' && now2 - lastSend > 50) {
          lastSend = now2;
          ctx.send('st', null, stateSnap());
        }
      } else {
        S.pads[0] += (S.target[0] - S.pads[0]) * .5;
        S.pads[1] += (S.target[1] - S.pads[1]) * .5;
        if (ctx.mode === 'online' && performance.now() - lastSend > 60) {
          lastSend = performance.now();
          ctx.send('in', { y: S.target[0] });
        }
      }
    }
    S.flash *= .86;
    draw();
    rafId = requestAnimationFrame(tick);
  }

  function draw() {
    if (!g) return;
    g.clearRect(0, 0, W, H);
    const bg = g.createLinearGradient(0, 0, W, H);
    bg.addColorStop(0, '#101725'); bg.addColorStop(1, '#0b101c');
    g.beginPath(); g.roundRect(0, 0, W, H, 20); g.fill();
    g.fillStyle = bg;
    g.beginPath(); g.roundRect(0, 0, W, H, 20); g.fill();
    g.strokeStyle = 'rgba(255,255,255,.08)'; g.lineWidth = 3; g.setLineDash([14, 18]);
    g.beginPath(); g.moveTo(W / 2, 0); g.lineTo(W / 2, H); g.stroke();
    g.setLineDash([]);
    g.strokeStyle = 'rgba(255,255,255,.16)'; g.lineWidth = 2;
    g.beginPath(); g.roundRect(4, 4, W - 8, H - 8, 18); g.stroke();
    g.font = '900 120px -apple-system, "Segoe UI", sans-serif';
    g.textAlign = 'center';
    g.fillStyle = 'rgba(255,255,255,.07)';
    g.fillText(S.scores[0], W / 2 - 110, H / 2 + 42);
    g.fillText(S.scores[1], W / 2 + 110, H / 2 + 42);
    const glow = (x, y, r, col, a) => { const gr = g.createRadialGradient(x, y, 0, x, y, r); gr.addColorStop(0, col); gr.addColorStop(1, 'transparent'); g.globalAlpha = a; g.fillStyle = gr; g.beginPath(); g.arc(x, y, r, 0, 7); g.fill(); g.globalAlpha = 1; };
    if (S.flash > .02) { glow(S.ball.x, S.ball.y, 90, 'rgba(120,180,255,.5)', S.flash); }
    if (!S.over && S.serveT > 0) {
      glow(W / 2, H / 2, 70, 'rgba(90,150,255,.4)', .5 + .3 * Math.sin(performance.now() / 160));
    }
    g.shadowColor = 'rgba(80,160,255,.8)'; g.shadowBlur = 18;
    g.fillStyle = '#eaf2ff';
    g.beginPath(); g.arc(S.ball.x, S.ball.y, BALL_R, 0, 7); g.fill();
    g.shadowBlur = 0;
    const drawPad = (x, y, col) => {
      g.fillStyle = col;
      g.beginPath(); g.roundRect(x - PAD_W / 2, y - PAD_H / 2, PAD_W, PAD_H, 8); g.fill();
      g.fillStyle = 'rgba(255,255,255,.25)';
      g.beginPath(); g.roundRect(x - PAD_W / 2 + 3, y - PAD_H / 2 + 4, 4, PAD_H - 8, 3); g.fill();
    };
    drawPad(PAD_W + 6, S.pads[0], '#5aa7ff');
    drawPad(W - PAD_W - 6, S.pads[1], '#ff6482');
    if (S.serveT > 0 && !S.over) {
      g.fillStyle = 'rgba(255,255,255,.85)';
      g.font = '800 30px -apple-system, sans-serif';
      g.fillText(Math.ceil(S.serveT / 60), W / 2, H / 2 - 70);
    }
  }

  function resize() {
    const w = Math.min(480, window.innerWidth - 44, 520);
    const h = w * H / W;
    dpr = Math.min(devicePixelRatio || 1, 2.5);
    cv.width = W * dpr; cv.height = H * dpr;
    cv.style.width = w + 'px'; cv.style.height = h + 'px';
    scale = w / W;
  }

  return {
    create(c) {
      ctx = c;
      S.host = c.mode === 'ai' || c.side === 0;
      resetBall(1); S.serveT = 120;
      cv = document.createElement('canvas');
      cv.className = 'gk-cv';
      c.root.appendChild(cv);
      g = cv.getContext('2d');
      resize();
      window.addEventListener('resize', resize);
      const myPad = () => (S.host ? 0 : 1);
      const setTarget = clientY => {
        const r = cv.getBoundingClientRect();
        S.target[myPad()] = Math.max(PAD_H / 2, Math.min(H - PAD_H / 2, (clientY - r.top) / scale));
      };
      cv.addEventListener('pointermove', e => setTarget(e.clientY));
      cv.addEventListener('pointerdown', e => setTarget(e.clientY));
      window.addEventListener('keydown', e => { keys[e.key] = true; });
      window.addEventListener('keyup', e => { keys[e.key] = false; });
      (function keyLoop() {
        const speed = 11;
        if (keys['ArrowUp'] || keys['w'] || keys['W']) S.target[myPad()] -= speed;
        if (keys['ArrowDown'] || keys['s'] || keys['S']) S.target[myPad()] += speed;
        S.target[myPad()] = Math.max(PAD_H / 2, Math.min(H - PAD_H / 2, S.target[myPad()]));
        requestAnimationFrame(keyLoop);
      })();
      c.onMsg((k, d) => {
        if (k === 'in' && d) S.target[1] = d.y;
        else if (k === 'st' && d) applySnap(d);
        else if (k === 'end' && d) { S.over = true; ctx.finish(d.w === 1 ? 'win' : 'lose', (S.scores[0]) + ' : ' + (S.scores[1])); }
      });
      c.onRestore(s => applySnap(s));
      c.onPeer(on => { if (!on) { } });
      c.turn(-1);
      c.setStatus(S.host ? 'W/S 或鼠标控制' : 'W/S 或鼠标控制');
      if (c.mode === 'online' && S.host) c.send('hello', null, stateSnap());
      tick();
      return { destroy() { cancelAnimationFrame(rafId); window.removeEventListener('resize', resize); } };
    }
  };
})();
