'use strict';
window.GameDef = (() => {
  const ART = 480, TS = 120;
  const S = { perm: [], sel: -1, done: false, over: false, oppPlaced: 0, aiPerm: [] };
  let ctx = null, art = null, cv = null, g = null, dpr = 1, size = 480, scale = 1, raf = 0, anim = null, aiInt = 0, winTimer = null;

  function placed(perm) {
    let n = 0;
    for (let i = 0; i < 16; i++) if (perm[i] === i) n++;
    return n;
  }

  function buildArt() {
    art = document.createElement('canvas');
    art.width = ART; art.height = ART;
    const a = art.getContext('2d');
    const rng = mulberry32(hashSeed(String(ctx.seed) + ':art'));
    const variant = Math.floor(rng() * 3);
    if (variant === 0) drawAurora(a, rng);
    else if (variant === 1) drawGeo(a, rng);
    else drawSunset(a, rng);
  }

  function drawAurora(a, rng) {
    const bg = a.createLinearGradient(0, 0, 0, ART);
    bg.addColorStop(0, '#070b26');
    bg.addColorStop(.55, '#131c48');
    bg.addColorStop(1, '#233266');
    a.fillStyle = bg;
    a.fillRect(0, 0, ART, ART);
    for (let i = 0; i < 90; i++) {
      a.globalAlpha = .3 + rng() * .7;
      a.fillStyle = '#ffffff';
      const r = rng() * 1.6;
      a.beginPath(); a.arc(rng() * ART, rng() * ART * .8, r, 0, 7); a.fill();
    }
    a.globalAlpha = 1;
    const mx = ART * .78, my = ART * .18;
    const mg = a.createRadialGradient(mx, my, 4, mx, my, 60);
    mg.addColorStop(0, 'rgba(255,250,230,.95)');
    mg.addColorStop(.25, 'rgba(255,250,230,.5)');
    mg.addColorStop(1, 'transparent');
    a.fillStyle = mg;
    a.beginPath(); a.arc(mx, my, 60, 0, 7); a.fill();
    a.fillStyle = '#fdf6dc';
    a.beginPath(); a.arc(mx, my, 26, 0, 7); a.fill();
    const cols = [['#38f8c9', '#2a9d8f'], ['#7b5cff', '#4361ee'], ['#00e5ff', '#0096c7'], ['#b5ff5e', '#38b000'], ['#ff6ec7', '#9d4edd']];
    for (let k = 0; k < 5; k++) {
      const [c1, c2] = cols[k];
      const base = 150 + k * 58;
      const grad = a.createLinearGradient(0, base - 60, 0, base + 60);
      grad.addColorStop(0, 'transparent');
      grad.addColorStop(.5, c1);
      grad.addColorStop(1, 'transparent');
      a.save();
      a.globalAlpha = .34;
      a.shadowColor = c2;
      a.shadowBlur = 36;
      a.strokeStyle = grad;
      a.lineWidth = 34 + rng() * 22;
      a.lineCap = 'round';
      a.beginPath();
      for (let x = -20; x <= ART + 20; x += 16) {
        const y = base + Math.sin(x / 110 + k * 1.7) * 46 + Math.sin(x / 43 + k) * 16;
        if (x < 0) a.moveTo(x, y); else a.lineTo(x, y);
      }
      a.stroke();
      a.restore();
    }
    const fg = a.createLinearGradient(0, ART * .72, 0, ART);
    fg.addColorStop(0, '#101735');
    fg.addColorStop(1, '#05070f');
    a.fillStyle = fg;
    a.beginPath();
    a.moveTo(0, ART);
    a.lineTo(0, ART * .84);
    for (let x = 0; x <= ART; x += 40) a.lineTo(x, ART * .84 - Math.abs(Math.sin(x / 90 + 2)) * 46);
    a.lineTo(ART, ART);
    a.closePath();
    a.fill();
  }

  function drawGeo(a, rng) {
    const bg = a.createLinearGradient(0, 0, ART, ART);
    bg.addColorStop(0, '#faf6ee');
    bg.addColorStop(1, '#eee7d8');
    a.fillStyle = bg;
    a.fillRect(0, 0, ART, ART);
    a.fillStyle = 'rgba(60,60,80,.1)';
    for (let x = 40; x < ART; x += 40) for (let y = 40; y < ART; y += 40) {
      a.beginPath(); a.arc(x, y, 2, 0, 7); a.fill();
    }
    const pal = ['#e8635a', '#2a9d8f', '#e9c46a', '#264653', '#7b5cff', '#f4a261', '#118ab2'];
    const big = pal[Math.floor(rng() * pal.length)];
    a.globalAlpha = .92;
    a.fillStyle = big;
    a.beginPath(); a.arc(140 + rng() * 200, 140 + rng() * 200, 90 + rng() * 40, 0, 7); a.fill();
    for (let i = 0; i < 16; i++) {
      const col = pal[Math.floor(rng() * pal.length)];
      const x = rng() * ART, y = rng() * ART, s = 34 + rng() * 90, rot = rng() * Math.PI;
      a.save();
      a.translate(x, y);
      a.rotate(rot);
      a.globalAlpha = .75 + rng() * .25;
      a.fillStyle = col;
      const t = rng();
      if (t < .25) {
        a.beginPath(); a.arc(0, 0, s / 2, 0, 7); a.fill();
      } else if (t < .45) {
        a.lineWidth = s / 5;
        a.strokeStyle = col;
        a.beginPath(); a.arc(0, 0, s / 2, 0, 7); a.stroke();
      } else if (t < .68) {
        a.beginPath(); a.moveTo(0, -s / 2); a.lineTo(s / 2, s / 2); a.lineTo(-s / 2, s / 2); a.closePath(); a.fill();
      } else if (t < .85) {
        a.beginPath(); a.roundRect(-s / 2, -s / 2, s, s, s / 5); a.fill();
      } else {
        a.beginPath(); a.arc(0, 0, s / 2, Math.PI, 0); a.closePath(); a.fill();
      }
      a.restore();
    }
    a.globalAlpha = 1;
    a.strokeStyle = '#264653';
    a.lineWidth = 5;
    a.beginPath(); a.moveTo(0, ART * .78); a.bezierCurveTo(ART * .3, ART * .68, ART * .6, ART * .9, ART, ART * .74); a.stroke();
  }

  function drawSunset(a, rng) {
    const sky = a.createLinearGradient(0, 0, 0, ART * .72);
    sky.addColorStop(0, '#3a1c5c');
    sky.addColorStop(.4, '#b83b5e');
    sky.addColorStop(.75, '#f38b4a');
    sky.addColorStop(1, '#ffd07f');
    a.fillStyle = sky;
    a.fillRect(0, 0, ART, ART * .72);
    const sx = ART * .5, sy = ART * .56;
    const glow = a.createRadialGradient(sx, sy, 8, sx, sy, 150);
    glow.addColorStop(0, 'rgba(255,236,170,.95)');
    glow.addColorStop(.3, 'rgba(255,190,100,.55)');
    glow.addColorStop(1, 'transparent');
    a.fillStyle = glow;
    a.beginPath(); a.arc(sx, sy, 150, 0, 7); a.fill();
    const sun = a.createLinearGradient(0, sy - 48, 0, sy + 48);
    sun.addColorStop(0, '#fff3c4');
    sun.addColorStop(1, '#ffb347');
    a.fillStyle = sun;
    a.beginPath(); a.arc(sx, sy, 48, 0, 7); a.fill();
    for (let i = 0; i < 5; i++) {
      a.strokeStyle = 'rgba(40,20,60,.5)';
      a.lineWidth = 2.4;
      const by = 60 + rng() * 120, bx = rng() * ART;
      a.beginPath();
      a.moveTo(bx, by); a.quadraticCurveTo(bx + 9, by - 7, bx + 18, by);
      a.moveTo(bx + 18, by); a.quadraticCurveTo(bx + 27, by - 7, bx + 36, by);
      a.stroke();
    }
    const layers = ['#6a2c70', '#55286b', '#40245c', '#2b1b48'];
    for (let l = 0; l < 4; l++) {
      const baseY = ART * (.42 + l * .1);
      a.fillStyle = layers[l];
      a.beginPath();
      a.moveTo(0, baseY);
      let x = 0;
      while (x < ART) {
        const w = 70 + rng() * 110;
        const peak = baseY - (30 + rng() * (90 - l * 14));
        a.lineTo(x + w / 2, peak);
        a.lineTo(x + w, baseY + rng() * 20);
        x += w;
      }
      a.lineTo(ART, ART);
      a.lineTo(0, ART);
      a.closePath();
      a.fill();
    }
    const water = a.createLinearGradient(0, ART * .78, 0, ART);
    water.addColorStop(0, '#e8875a');
    water.addColorStop(.5, '#8a4a6b');
    water.addColorStop(1, '#3a2450');
    a.fillStyle = water;
    a.fillRect(0, ART * .78, ART, ART * .22);
    a.globalAlpha = .55;
    a.fillStyle = '#ffe9a8';
    for (let y = ART * .8; y < ART; y += 12) {
      const w2 = 30 + Math.sin(y / 20) * 14;
      a.fillRect(sx - w2 / 2 + Math.sin(y / 9) * 8, y, w2, 4.5);
    }
    a.globalAlpha = 1;
  }

  function scramblePerm(perm, rng) {
    for (let i = 0; i < 16; i++) perm[i] = i;
    for (let k = 0; k < 24; k++) {
      const i = Math.floor(rng() * 16), j = Math.floor(rng() * 16);
      const t = perm[i]; perm[i] = perm[j]; perm[j] = t;
    }
  }

  function snap() {
    return { g: 'picpuzzle', perm: S.perm.slice(), sel: S.sel, done: S.done ? 1 : 0 };
  }

  function restore(s) {
    const mine = s && s['s' + ctx.side];
    if (!mine || !mine.perm) return;
    S.perm = mine.perm.slice();
    S.sel = mine.sel != null ? mine.sel : -1;
    S.done = !!mine.done;
    S.over = false;
    anim = null;
    updateStatus();
  }

  function pieceRect(p) {
    return { sx: (p % 4) * TS, sy: Math.floor(p / 4) * TS };
  }

  function cellCenter(i) {
    return { x: (i % 4) * size / 4 + size / 8, y: Math.floor(i / 4) * size / 4 + size / 8 };
  }

  function doSwap(a, b, silent) {
    if (a === b || anim) return false;
    anim = { a, b, t0: performance.now() };
    if (!silent) ctx.sfx.play('place');
    setTimeout(() => {
      const t = S.perm[a]; S.perm[a] = S.perm[b]; S.perm[b] = t;
      anim = null;
      const n = placed(S.perm);
      ctx.send('mv', { p: S.perm.slice() }, snap());
      ctx.send('ev', { placed: n });
      if (n === 16) onMyFinish();
      updateStatus();
    }, 310);
    return true;
  }

  function onMyFinish() {
    if (S.done) return;
    S.done = true;
    S.sel = -1;
    ctx.sfx.play('good');
    ctx.send('ev', { done: 1 });
    ctx.send('mv', null, snap());
    winTimer = setTimeout(() => { if (!S.over) { S.over = true; ctx.finish('win', '率先完成拼图！'); } }, 700);
  }

  function clickCell(i) {
    if (S.over || S.done || anim) return;
    if (S.sel < 0) {
      S.sel = i;
      ctx.sfx.play('click');
      ctx.send('mv', { p: S.perm.slice(), sel: i }, snap());
      return;
    }
    if (S.sel === i) { S.sel = -1; return; }
    const a = S.sel;
    S.sel = -1;
    doSwap(a, i);
  }

  function updateStatus() {
    if (S.over) return;
    const n = placed(S.perm);
    const op = ctx.mode === 'ai' ? placed(S.aiPerm) : S.oppPlaced;
    ctx.setStatus(S.done ? '完成！' : '已归位 ' + n + '/16');
    ctx.setOppStatus('对方已归位 ' + op + '/16');
  }

  function drawTile(p, cx, cy, sc, glow) {
    const half = size / 8 * sc;
    const { sx, sy } = pieceRect(p);
    g.save();
    g.translate(cx, cy);
    if (glow) {
      g.shadowColor = '#00c7be';
      g.shadowBlur = 22;
    } else {
      g.shadowColor = 'rgba(40,60,90,.3)';
      g.shadowBlur = 8;
      g.shadowOffsetY = 3;
    }
    g.beginPath();
    g.roundRect(-half + 2, -half + 2, half * 2 - 4, half * 2 - 4, size * .03);
    g.clip();
    g.drawImage(art, sx, sy, TS, TS, -half, -half, half * 2, half * 2);
    g.restore();
    g.save();
    g.translate(cx, cy);
    g.beginPath();
    g.roundRect(-half + 2, -half + 2, half * 2 - 4, half * 2 - 4, size * .03);
    g.strokeStyle = glow ? 'rgba(0,199,190,.95)' : 'rgba(255,255,255,.65)';
    g.lineWidth = glow ? 3.5 : 1.5;
    g.stroke();
    if (p === cellIndexAt(cx, cy)) {
      const r = half * .32;
      g.fillStyle = 'rgba(48,177,92,.95)';
      g.beginPath(); g.arc(half - r - 4, -half + r + 4, r, 0, 7); g.fill();
      g.strokeStyle = '#fff';
      g.lineWidth = 2.4;
      g.lineCap = 'round';
      g.beginPath();
      g.moveTo(half - r - 4 - r * .4, -half + r + 4);
      g.lineTo(half - r - 4 - r * .05, -half + r + 4 + r * .38);
      g.lineTo(half - r - 4 + r * .45, -half + r + 4 - r * .3);
      g.stroke();
    }
    g.restore();
  }

  function cellIndexAt(cx, cy) {
    return Math.floor(cy / (size / 4)) * 4 + Math.floor(cx / (size / 4));
  }

  function draw(now) {
    if (!g) return;
    g.clearRect(0, 0, size, size);
    const bg = g.createLinearGradient(0, 0, size, size);
    bg.addColorStop(0, '#eef2f8');
    bg.addColorStop(1, '#e2e9f3');
    g.fillStyle = bg;
    g.beginPath(); g.roundRect(0, 0, size, size, 18); g.fill();
    const skip = anim ? [anim.a, anim.b] : [];
    for (let i = 0; i < 16; i++) {
      if (skip.includes(i)) continue;
      const c = cellCenter(i);
      const sel = S.sel === i;
      const sc = sel ? 1.09 + Math.sin(now / 200) * .015 : 1;
      drawTile(S.perm[i], c.x, c.y, sc, sel);
    }
    if (anim) {
      const p = Math.min(1, (now - anim.t0) / 300);
      const e = 1 - Math.pow(1 - p, 2.4);
      const ca = cellCenter(anim.a), cb = cellCenter(anim.b);
      const mx = (ca.x + cb.x) / 2, my = (ca.y + cb.y) / 2;
      const dx = cb.y - ca.y, dy = ca.x - cb.x;
      const len = Math.hypot(dx, dy) || 1;
      const kx = mx + dx / len * 34, ky = my + dy / len * 34;
      const bez = (A, K, B, t) => (1 - t) * (1 - t) * A + 2 * (1 - t) * t * K + t * t * B;
      const ax = bez(ca.x, kx, cb.x, e), ay = bez(ca.y, ky, cb.y, e);
      const bx = bez(cb.x, kx, ca.x, e), by = bez(cb.y, ky, ca.y, e);
      drawTile(S.perm[anim.a], ax, ay, 1.06, false);
      drawTile(S.perm[anim.b], bx, by, 1.06, false);
      if (p < 1) anim.p = p;
    }
    raf = requestAnimationFrame(draw);
  }

  function resize() {
    const w = Math.min(480, ctx.root.clientWidth - 8, window.innerWidth - 48);
    dpr = Math.min(window.devicePixelRatio || 1, 2.5);
    size = w;
    scale = w / ART;
    cv.width = w * dpr; cv.height = w * dpr;
    cv.style.width = w + 'px'; cv.style.height = w + 'px';
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  function aiStep() {
    if (ctx.mode !== 'ai' || S.over || S.done) return;
    const P = S.aiPerm;
    if (placed(P) === 16) {
      S.over = true;
      setTimeout(() => ctx.finish('lose', 'AI 先完成拼图'), 400);
      return;
    }
    if (Math.random() < .1) {
      const i = Math.floor(Math.random() * 16);
      let j = Math.floor(Math.random() * 16);
      if (j === i) j = (j + 1) % 16;
      const t = P[i]; P[i] = P[j]; P[j] = t;
    } else {
      let a = -1;
      for (let i = 0; i < 16; i++) if (P[i] !== i) { a = i; break; }
      if (a >= 0) {
        let b = -1;
        for (let j = 0; j < 16; j++) if (P[j] === a) { b = j; break; }
        if (b >= 0) { const t = P[a]; P[a] = P[b]; P[b] = t; }
      }
    }
    updateStatus();
  }

  return {
    create(c) {
      ctx = c;
      buildArt();
      S.perm = [];
      scramblePerm(S.perm, c.rng);
      S.sel = -1; S.done = false; S.over = false; S.oppPlaced = 0;
      if (c.mode === 'ai') {
        S.aiPerm = [];
        scramblePerm(S.aiPerm, mulberry32(hashSeed(String(c.seed) + ':aipic')));
      }
      cv = document.createElement('canvas');
      cv.className = 'gk-cv';
      cv.style.cssText = 'border-radius:18px;box-shadow:0 10px 30px rgba(0,120,120,.2);cursor:pointer;touch-action:none';
      c.root.appendChild(cv);
      g = cv.getContext('2d');
      const hint = document.createElement('div');
      hint.style.cssText = 'font-size:13px;color:var(--ink2);font-weight:600;text-align:center;margin-top:6px';
      hint.textContent = '点击选中一块，再点另一块交换 · 全部归位即胜';
      c.root.appendChild(hint);
      resize();
      window.addEventListener('resize', resize);
      cv.addEventListener('pointerdown', e => {
        const r = cv.getBoundingClientRect();
        const x = (e.clientX - r.left) / scale, y = (e.clientY - r.top) / scale;
        if (x < 0 || y < 0 || x >= ART || y >= ART) return;
        clickCell(cellIndexAt(x, y));
      });
      c.onMsg((k, d) => {
        if (!d) return;
        if (k === 'ev') {
          if (d.done) {
            if (S.done) return;
            S.over = true;
            if (winTimer) clearTimeout(winTimer);
            setTimeout(() => ctx.finish('lose', '对方先完成拼图'), 400);
          } else if (d.placed != null) {
            S.oppPlaced = d.placed;
            updateStatus();
          }
        }
      });
      c.onRestore(s => restore(s));
      c.turn(-1);
      updateStatus();
      draw(performance.now());
      if (c.mode === 'ai') aiInt = setInterval(aiStep, 450);
      if (c.mode === 'online' && c.side === 0) c.send('hello', null, snap());
      return {
        destroy() {
          cancelAnimationFrame(raf);
          if (aiInt) clearInterval(aiInt);
          if (winTimer) clearTimeout(winTimer);
          window.removeEventListener('resize', resize);
        }
      };
    }
  };
})();
