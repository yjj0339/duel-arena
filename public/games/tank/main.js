'use strict';
window.GameDef = (() => {
  const W = 720, H = 560, TANK_R = 17, BSPEED = 7, COOL = 45, WIN = 5, INV = 80;
  const SPAWN = [[70, H - 80], [W - 70, 80]];
  let ctx = null, cv = null, g = null, dpr = 1, scale = 1, rafId = 0, stopped = false, lastSend = 0, lastIn = 0, frame = 0;
  let obstacles = [];
  const S = {
    tanks: mkTanks(), bullets: [], parts: [], s: [0, 0], over: false, done: false,
    shake: 0, aiT: 0, aiMx: .6, aiMy: -.4, fleeT: 0, fleeX: 0, fleeY: 0, lastE: [0, 0], evx: 0, evy: 0
  };
  const keys = {};
  let myAim = [W / 2, H / 2], guestAim = null, guestMask = 0, guestFire = 0;
  function mkTanks() {
    return [
      { x: SPAWN[0][0], y: SPAWN[0][1], a: 0, ta: 0, alive: 1, inv: 0, cd: 0, rec: 0 },
      { x: SPAWN[1][0], y: SPAWN[1][1], a: Math.PI, ta: Math.PI, alive: 1, inv: 0, cd: 0, rec: 0 }
    ];
  }
  const isHost = () => ctx.mode !== 'online' || ctx.side === 0;
  const myIdx = () => ctx.mode === 'online' ? ctx.side : 0;
  const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
  function lerpAng(a, b, t) {
    let d = b - a;
    while (d > Math.PI) d -= Math.PI * 2;
    while (d < -Math.PI) d += Math.PI * 2;
    return a + d * t;
  }
  function genMap() {
    obstacles = [];
    const rng = ctx.rng;
    const base = 3 + Math.floor(rng() * 2);
    for (let i = 0; i < base; i++) {
      for (let tries = 0; tries < 24; tries++) {
        const w = 40 + rng() * 100, h = 40 + rng() * 100;
        const x = 40 + rng() * (W / 2 - w - 60), y = 40 + rng() * (H / 2 - h - 60);
        if (nearSpawn(x, y, w, h)) continue;
        let bad = false;
        for (const o of obstacles) if (rectHit(x - 14, y - 14, w + 28, h + 28, o.x, o.y, o.w, o.h)) { bad = true; break; }
        if (bad) continue;
        obstacles.push({ x, y, w, h });
        obstacles.push({ x: W - x - w, y: H - y - h, w, h });
        break;
      }
    }
    if (rng() < .55) {
      const w = 50 + rng() * 40, h = 50 + rng() * 40;
      obstacles.push({ x: W / 2 - w / 2, y: H / 2 - h / 2, w, h });
    }
  }
  function nearSpawn(x, y, w, h) {
    for (const [sx, sy] of SPAWN) {
      const cx = clamp(sx, x, x + w), cy = clamp(sy, y, y + h);
      if (Math.hypot(sx - cx, sy - cy) < 70) return true;
    }
    return false;
  }
  function rectHit(x1, y1, w1, h1, x2, y2, w2, h2) {
    return x1 < x2 + w2 && x1 + w1 > x2 && y1 < y2 + h2 && y1 + h1 > y2;
  }
  function circleRect(cx, cy, r, rc) {
    const nx = clamp(cx, rc.x, rc.x + rc.w), ny = clamp(cy, rc.y, rc.y + rc.h);
    return Math.hypot(cx - nx, cy - ny) < r;
  }
  function canSee(x1, y1, x2, y2) {
    const d = Math.hypot(x2 - x1, y2 - y1), steps = Math.ceil(d / 8);
    for (let i = 1; i < steps; i++) {
      const px = x1 + (x2 - x1) * i / steps, py = y1 + (y2 - y1) * i / steps;
      for (const o of obstacles) if (px > o.x && px < o.x + o.w && py > o.y && py < o.y + o.h) return false;
    }
    return true;
  }
  function burst(x, y, n, cols, sp0, sp1) {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2, sp = sp0 + Math.random() * (sp1 - sp0);
      S.parts.push({ x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, life: 1, r: 1.5 + Math.random() * 3.5, col: cols[Math.random() * cols.length | 0], gr: .04 });
    }
  }
  function snap() {
    return {
      g: 'tank',
      tanks: S.tanks.map(t => [Math.round(t.x * 10) / 10, Math.round(t.y * 10) / 10, Math.round(t.ta * 100) / 100, t.alive, t.inv]),
      bullets: S.bullets.map(b => [Math.round(b.x * 10) / 10, Math.round(b.y * 10) / 10, b.vx, b.vy, b.owner]),
      s: S.s.slice(), ov: S.over ? 1 : 0
    };
  }
  function endGame(w, remote) {
    if (S.done) return;
    S.done = true; S.over = true;
    const iWin = ctx.mode === 'ai' ? w === 0 : w === ctx.side;
    const name = iWin ? '你' : (ctx.mode === 'ai' ? 'AI' : ctx.opp.name);
    if (ctx.mode === 'online' && !remote) {
      ctx.send('end', { w, s: S.s.slice() });
      ctx.send('st', snap(), snap());
    }
    setTimeout(() => {
      if (stopped) return;
      ctx.finish(iWin ? 'win' : 'lose', name + '获胜 · 比分 ' + S.s[0] + ' : ' + S.s[1]);
    }, 900);
  }
  function respawn() {
    for (let i = 0; i < 2; i++) {
      const t = S.tanks[i];
      t.x = SPAWN[i][0]; t.y = SPAWN[i][1]; t.inv = INV; t.alive = 1;
    }
  }
  function hitTank(victim, owner) {
    S.s[owner]++;
    burst(S.tanks[victim].x, S.tanks[victim].y, 40, ['#ff9f0a', '#ff5e3a', '#ffd60a', '#c0392b'], 1.5, 6);
    S.shake = 1;
    ctx.sfx.play(owner === myIdx() ? 'good' : 'bad');
    if (owner === myIdx()) { S.fleeT = 60; }
    if (S.s[owner] >= WIN) { S.over = true; endGame(owner, false); return; }
    respawn();
  }
  function fireShell(i) {
    const t = S.tanks[i];
    if (!t.alive || t.cd > 0 || S.over) return;
    t.cd = COOL; t.rec = 5;
    const mx = t.x + Math.cos(t.ta) * 30, my = t.y + Math.sin(t.ta) * 30;
    S.bullets.push({ x: mx, y: my, vx: Math.cos(t.ta) * BSPEED, vy: Math.sin(t.ta) * BSPEED, owner: i });
    for (let k = 0; k < 6; k++) {
      const a = t.ta + (Math.random() - .5) * .7;
      S.parts.push({ x: mx, y: my, vx: Math.cos(a) * 2.5, vy: Math.sin(a) * 2.5, life: .6, r: 2.5, col: '#ffd60a', gr: .05 });
    }
    ctx.sfx.play('pop');
  }
  function tryMove(t, mvx, mvy) {
    const r = TANK_R;
    let nx = t.x + mvx;
    if (nx > r && nx < W - r && !obstacles.some(o => circleRect(nx, t.y, r, o))) t.x = nx;
    let ny = t.y + mvy;
    if (ny > r && ny < H - r && !obstacles.some(o => circleRect(t.x, ny, r, o))) t.y = ny;
  }
  function controlTank(i, mask, ax, ay, fire) {
    const t = S.tanks[i];
    if (!t.alive) return;
    const dx = (mask & 8 ? 1 : 0) - (mask & 4 ? 1 : 0);
    const dy = (mask & 2 ? 1 : 0) - (mask & 1 ? 1 : 0);
    if (dx || dy) {
      const l = Math.hypot(dx, dy);
      tryMove(t, dx / l * 3.2, dy / l * 3.2);
      t.a = lerpAng(t.a, Math.atan2(dy, dx), .22);
    }
    if (ax != null) t.ta = lerpAng(t.ta, Math.atan2(ay - t.y, ax - t.x), .3);
    if (t.cd > 0) t.cd--;
    if (fire) fireShell(i);
  }
  function dirMask(dx, dy) {
    let m = 0;
    if (dy < -.4) m |= 1;
    if (dy > .4) m |= 2;
    if (dx < -.4) m |= 4;
    if (dx > .4) m |= 8;
    return m;
  }
  function aiControl() {
    const t = S.tanks[1], e = S.tanks[0];
    S.aiT++;
    if (S.aiT % 80 === 0) { S.aiMx = Math.random() * 2 - 1; S.aiMy = Math.random() * 2 - 1; }
    const d = Math.hypot(e.x - t.x, e.y - t.y) || 1;
    let mask;
    if (S.fleeT > 0) {
      S.fleeT--;
      mask = dirMask(S.fleeX, S.fleeY);
    } else if (d > 400) mask = dirMask(e.x - t.x, e.y - t.y);
    else if (d < 190) mask = dirMask(t.x - e.x, t.y - e.y);
    else mask = dirMask(S.aiMx, S.aiMy);
    const ox = t.x, oy = t.y;
    const lead = Math.min(d / BSPEED, 30) * .6;
    const ax = e.x + S.evx * lead + (Math.random() - .5) * 18;
    const ay = e.y + S.evy * lead + (Math.random() - .5) * 18;
    const see = canSee(t.x, t.y, e.x, e.y);
    const fire = see && d < 580 && Math.random() < .55;
    controlTank(1, mask, ax, ay, fire);
    if (Math.abs(t.x - ox) < .1 && Math.abs(t.y - oy) < .1 && S.fleeT <= 0) {
      S.aiMx = Math.random() * 2 - 1; S.aiMy = Math.random() * 2 - 1;
    }
    const ang = Math.atan2(e.y - t.y, e.x - t.x);
    S.fleeX = -Math.cos(ang); S.fleeY = -Math.sin(ang);
  }
  function physBullets() {
    for (let i = S.bullets.length - 1; i >= 0; i--) {
      const b = S.bullets[i];
      b.x += b.vx; b.y += b.vy;
      let gone = false;
      if (b.x < 3 || b.x > W - 3 || b.y < 3 || b.y > H - 3) {
        burst(b.x, b.y, 5, ['#ffd60a', '#ff9f0a'], .8, 2.5);
        gone = true;
      }
      if (!gone) for (const o of obstacles) {
        if (circleRect(b.x, b.y, 4, o)) {
          burst(b.x, b.y, 6, ['#ffd60a', '#cfd8e3'], .8, 2.8);
          gone = true;
          break;
        }
      }
      if (!gone) for (let j = 0; j < 2; j++) {
        const t = S.tanks[j];
        if (t.alive && t.inv <= 0 && j !== b.owner && Math.hypot(t.x - b.x, t.y - b.y) < TANK_R + 4) {
          hitTank(j, b.owner);
          S.fleeT = 70;
          S.fleeX = t.x - b.x; S.fleeY = t.y - b.y;
          const fl = Math.hypot(S.fleeX, S.fleeY) || 1;
          S.fleeX /= fl; S.fleeY /= fl;
          gone = true;
          break;
        }
      }
      if (gone) S.bullets.splice(i, 1);
    }
  }
  function hostStep() {
    S.evx = S.tanks[0].x - S.lastE[0];
    S.evy = S.tanks[0].y - S.lastE[1];
    S.lastE = [S.tanks[0].x, S.tanks[0].y];
    let mask = 0, fire = false;
    if (keys['w'] || keys['W'] || keys['ArrowUp']) mask |= 1;
    if (keys['s'] || keys['S'] || keys['ArrowDown']) mask |= 2;
    if (keys['a'] || keys['A'] || keys['ArrowLeft']) mask |= 4;
    if (keys['d'] || keys['D'] || keys['ArrowRight']) mask |= 8;
    if (keys[' '] || keys['Spacebar']) fire = true;
    controlTank(0, mask, myAim[0], myAim[1], false);
    if (fire) fireShell(0);
    if (ctx.mode === 'ai') aiControl();
    else controlTank(1, guestMask, guestAim ? guestAim[0] : null, guestAim ? guestAim[1] : null, guestFire);
    guestFire = 0;
    physBullets();
  }
  function applySnap(st) {
    if (!st || st.g !== 'tank') return;
    if (st.ov && !S.over) {
      const w = st.s[0] >= WIN ? 0 : 1;
      S.s = st.s.slice();
      endGame(w, true);
      return;
    }
    for (let i = 0; i < 2; i++) {
      const t = S.tanks[i], d = st.tanks[i];
      t.x += (d[0] - t.x) * .55;
      t.y += (d[1] - t.y) * .55;
      t.ta = lerpAng(t.ta, d[2], .5);
      t.alive = d[3]; t.inv = d[4];
    }
    S.bullets = st.bullets.map(b => ({ x: b[0], y: b[1], vx: b[2], vy: b[3], owner: b[4] }));
    S.s = st.s.slice();
  }
  function drawTank(t, i) {
    const cols = i === 0 ? ['#6fa8ff', '#2559b8', '#a8ccff'] : ['#ff8ba0', '#b83a55', '#ffc2cf'];
    g.save();
    g.translate(t.x, t.y);
    if (t.inv > 0) g.globalAlpha = .35 + .65 * Math.abs(Math.sin(frame * .3));
    g.save();
    g.rotate(t.a);
    g.shadowColor = 'rgba(0,0,0,.45)'; g.shadowBlur = 10; g.shadowOffsetY = 4;
    g.fillStyle = '#232a33';
    g.beginPath(); g.roundRect(-22, -17, 44, 9, 4); g.fill();
    g.beginPath(); g.roundRect(-22, 8, 44, 9, 4); g.fill();
    g.shadowBlur = 0; g.shadowOffsetY = 0;
    g.fillStyle = 'rgba(255,255,255,.12)';
    for (let k = 0; k < 6; k++) {
      g.fillRect(-21 + k * 7.4, -16, 3, 7);
      g.fillRect(-21 + k * 7.4, 9, 3, 7);
    }
    const bg = g.createLinearGradient(0, -12, 0, 12);
    bg.addColorStop(0, cols[2]); bg.addColorStop(.45, cols[0]); bg.addColorStop(1, cols[1]);
    g.fillStyle = bg;
    g.beginPath(); g.roundRect(-17, -11, 34, 22, 6); g.fill();
    g.strokeStyle = 'rgba(255,255,255,.25)'; g.lineWidth = 1.5;
    g.beginPath(); g.roundRect(-17, -11, 34, 22, 6); g.stroke();
    g.fillStyle = 'rgba(255,255,255,.22)';
    g.beginPath(); g.roundRect(-14, -9, 28, 5, 3); g.fill();
    g.restore();
    g.save();
    g.rotate(t.ta);
    const rec = t.rec * .6;
    g.fillStyle = '#39424e';
    g.beginPath(); g.roundRect(8 - rec, -3.5, 26, 7, 3); g.fill();
    g.fillStyle = 'rgba(255,255,255,.25)';
    g.fillRect(9 - rec, -2.5, 24, 2);
    const tg = g.createRadialGradient(-3, -4, 2, 0, 0, 12);
    tg.addColorStop(0, cols[2]); tg.addColorStop(.5, cols[0]); tg.addColorStop(1, cols[1]);
    g.fillStyle = tg;
    g.shadowColor = 'rgba(0,0,0,.4)'; g.shadowBlur = 8;
    g.beginPath(); g.arc(0, 0, 11, 0, 7); g.fill();
    g.shadowBlur = 0;
    g.strokeStyle = 'rgba(255,255,255,.3)'; g.lineWidth = 1.5;
    g.beginPath(); g.arc(0, 0, 11, 0, 7); g.stroke();
    g.restore();
    g.restore();
  }
  function draw() {
    if (!g) return;
    g.clearRect(0, 0, W, H);
    g.save();
    if (S.shake > .02) {
      g.translate((Math.random() - .5) * S.shake * 10, (Math.random() - .5) * S.shake * 10);
    }
    const bg = g.createLinearGradient(0, 0, W, H);
    bg.addColorStop(0, '#1e2a35'); bg.addColorStop(1, '#141d26');
    g.fillStyle = bg;
    g.beginPath(); g.roundRect(0, 0, W, H, 18); g.fill();
    g.save();
    g.beginPath(); g.roundRect(0, 0, W, H, 18); g.clip();
    g.strokeStyle = 'rgba(255,255,255,.04)'; g.lineWidth = 1;
    for (let x = 0; x < W; x += 40) { g.beginPath(); g.moveTo(x, 0); g.lineTo(x, H); g.stroke(); }
    for (let y = 0; y < H; y += 40) { g.beginPath(); g.moveTo(0, y); g.lineTo(W, y); g.stroke(); }
    for (const o of obstacles) {
      g.fillStyle = 'rgba(0,0,0,.4)';
      g.beginPath(); g.roundRect(o.x + 3, o.y + 6, o.w, o.h, 7); g.fill();
      const og = g.createLinearGradient(o.x, o.y, o.x, o.y + o.h);
      og.addColorStop(0, '#9aa5b5'); og.addColorStop(1, '#5d6875');
      g.fillStyle = og;
      g.beginPath(); g.roundRect(o.x, o.y, o.w, o.h, 7); g.fill();
      g.fillStyle = 'rgba(255,255,255,.3)';
      g.beginPath(); g.roundRect(o.x + 3, o.y + 3, o.w - 6, Math.min(9, o.h * .3), 4); g.fill();
      g.strokeStyle = 'rgba(0,0,0,.25)'; g.lineWidth = 1.5;
      g.beginPath(); g.roundRect(o.x, o.y, o.w, o.h, 7); g.stroke();
    }
    for (const b of S.bullets) {
      for (let k = 1; k <= 3; k++) {
        g.globalAlpha = .3 - k * .08;
        g.fillStyle = '#ffd60a';
        g.beginPath(); g.arc(b.x - b.vx * k * 2.2, b.y - b.vy * k * 2.2, 3.4 - k * .6, 0, 7); g.fill();
      }
      g.globalAlpha = 1;
      g.shadowColor = 'rgba(255,214,10,.9)'; g.shadowBlur = 10;
      const bgr = g.createRadialGradient(b.x - 1, b.y - 1.5, .5, b.x, b.y, 4.5);
      bgr.addColorStop(0, '#fff8d0'); bgr.addColorStop(1, '#f5a623');
      g.fillStyle = bgr;
      g.beginPath(); g.arc(b.x, b.y, 4.2, 0, 7); g.fill();
      g.shadowBlur = 0;
    }
    for (const p of S.parts) {
      g.globalAlpha = Math.max(0, p.life);
      g.fillStyle = p.col;
      g.beginPath(); g.arc(p.x, p.y, p.r, 0, 7); g.fill();
    }
    g.globalAlpha = 1;
    drawTank(S.tanks[1], 1);
    drawTank(S.tanks[0], 0);
    g.textAlign = 'center';
    g.font = '800 34px -apple-system, "Segoe UI", sans-serif';
    g.fillStyle = 'rgba(120,180,255,.55)';
    g.fillText(S.s[0], 46, 40);
    g.fillStyle = 'rgba(255,140,168,.55)';
    g.fillText(S.s[1], W - 46, 40);
    g.restore();
    g.restore();
    g.strokeStyle = 'rgba(255,255,255,.14)'; g.lineWidth = 2;
    g.beginPath(); g.roundRect(1, 1, W - 2, H - 2, 17); g.stroke();
  }
  function resize() {
    const w = Math.min(620, window.innerWidth - 44, 640);
    const h = w * H / W;
    dpr = Math.min(window.devicePixelRatio || 1, 2.5);
    cv.width = W * dpr; cv.height = H * dpr;
    cv.style.width = w + 'px'; cv.style.height = h + 'px';
    scale = w / W;
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
  }
  function onMove(e) {
    const r = cv.getBoundingClientRect();
    myAim = [(e.clientX - r.left) / scale, (e.clientY - r.top) / scale];
  }
  function onDown(e) {
    onMove(e);
    if (S.over) return;
    if (ctx.mode === 'online' && !isHost()) guestFireSend();
    else fireShell(0);
  }
  let firePend = 0;
  function guestFireSend() { firePend = 1; }
  function onKeyDown(e) {
    keys[e.key] = true;
    if (e.key === ' ') { e.preventDefault(); if (!S.over && isHost()) fireShell(0); }
  }
  function onKeyUp(e) { keys[e.key] = false; }
  function loop() {
    if (stopped) return;
    frame++;
    const now = performance.now();
    if (!S.over) {
      if (isHost()) {
        hostStep();
        for (const t of S.tanks) {
          if (t.inv > 0) t.inv--;
          t.rec *= .8;
        }
        if (ctx.mode === 'online' && now - lastSend > 50) {
          lastSend = now;
          ctx.send('st', snap(), snap());
        }
      } else {
        if (now - lastIn > 60) {
          lastIn = now;
          ctx.send('in', { k: guestMask, ax: Math.round(myAim[0]), ay: Math.round(myAim[1]), f: firePend });
          firePend = 0;
        }
      }
    }
    S.shake *= .86;
    for (let i = S.parts.length - 1; i >= 0; i--) {
      const p = S.parts[i];
      p.x += p.vx; p.y += p.vy; p.vx *= .93; p.vy *= .93;
      p.life -= p.gr || .03;
      if (p.life <= 0) S.parts.splice(i, 1);
    }
    draw();
    rafId = requestAnimationFrame(loop);
  }
  return {
    create(c) {
      ctx = c;
      genMap();
      cv = document.createElement('canvas');
      cv.className = 'gk-cv';
      cv.style.cssText = 'display:block;margin:0 auto;border-radius:18px;cursor:crosshair;touch-action:none';
      c.root.appendChild(cv);
      g = cv.getContext('2d');
      resize();
      window.addEventListener('resize', resize);
      window.addEventListener('keydown', onKeyDown);
      window.addEventListener('keyup', onKeyUp);
      cv.addEventListener('pointermove', onMove);
      cv.addEventListener('pointerdown', onDown);
      const keyMask = () => {
        let m = 0;
        if (keys['w'] || keys['W'] || keys['ArrowUp']) m |= 1;
        if (keys['s'] || keys['S'] || keys['ArrowDown']) m |= 2;
        if (keys['a'] || keys['A'] || keys['ArrowLeft']) m |= 4;
        if (keys['d'] || keys['D'] || keys['ArrowRight']) m |= 8;
        return m;
      };
      const inTimer = setInterval(() => {
        if (stopped || S.over || ctx.mode !== 'online' || isHost()) return;
        guestMask = keyMask();
      }, 30);
      c.onMsg((k, d) => {
        if (k === 'in' && d && isHost()) {
          guestMask = d.k | 0;
          if (d.ax != null) guestAim = [d.ax, d.ay];
          if (d.f) fireShell(1);
        } else if (k === 'st' && d) applySnap(d);
        else if (k === 'end' && d) {
          S.s = d.s || S.s;
          endGame(d.w, true);
        }
      });
      c.onRestore(s => {
        const st = s && (s.s0 || s.s1);
        if (st) applySnap(st);
      });
      c.onPeer(() => {});
      c.turn(-1);
      c.setStatus('WASD 移动 · 空格/点击射击 · 先得 5 分获胜');
      c.setOppStatus(isHost() ? '对战中' : '对战中');
      if (c.mode === 'online' && c.side === 0) c.send('hello', null, snap());
      loop();
      return {
        destroy() {
          stopped = true;
          cancelAnimationFrame(rafId);
          clearInterval(inTimer);
          window.removeEventListener('resize', resize);
          window.removeEventListener('keydown', onKeyDown);
          window.removeEventListener('keyup', onKeyUp);
        }
      };
    }
  };
})();
