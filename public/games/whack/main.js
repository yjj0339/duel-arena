'use strict';
window.GameDef = (() => {
  const W = 480, H = 480, DUR = 60;
  const S = { hits: 0, oppHits: 0, tick: 0, over: false, startT: 0, elapsed: 0, active: null, oppTimeup: false, myTimeup: false, lastTickSec: -1 };
  let ctx = null, cv = null, g = null, dpr = 1, size = 480, scale = 1, raf = 0, hammer = { x: W / 2, y: H / 2, t0: 0 }, particles = [], aiTimer = null, statInt = 0, snapTimer = 0;

  function holePos(h) {
    return { x: (h % 3 + .5) * W / 3, y: (Math.floor(h / 3) + .5) * H / 3 };
  }

  function moleFor(tick) {
    const h = hashSeed(String(ctx.seed) + ':' + tick);
    return { hole: h % 9, dur: 800 + ((h >>> 5) % 601) };
  }

  function snap() {
    return { g: 'whack', hits: S.hits, tick: S.tick, over: S.over ? 1 : 0, t: Math.round(S.elapsed) };
  }

  function restore(s) {
    const mine = s && s['s' + ctx.side];
    if (!mine) return;
    S.hits = mine.hits || 0;
    S.elapsed = mine.t || 0;
    S.startT = performance.now() - S.elapsed;
    S.tick = Math.floor(S.elapsed / 500);
    S.over = !!mine.over;
    S.active = null;
    updateStatus();
  }

  function logic(now) {
    if (S.over) return;
    S.elapsed = now - S.startT;
    if (S.elapsed >= DUR * 1000) { endGame(); return; }
    const curTick = Math.floor(S.elapsed / 500);
    while (S.tick < curTick) {
      S.tick++;
      if (!S.active) {
        const m = moleFor(S.tick);
        S.active = { hole: m.hole, end: now + m.dur, t0: now, dur: m.dur, tick: S.tick, hit: false };
        if (ctx.mode === 'ai') scheduleAI();
      }
    }
    if (S.active && now > S.active.end) S.active = null;
    const sec = Math.ceil((DUR * 1000 - S.elapsed) / 1000);
    if (sec <= 10 && sec !== S.lastTickSec) { S.lastTickSec = sec; ctx.sfx.play('tick'); }
  }

  function scheduleAI() {
    if (ctx.mode !== 'ai' || !S.active) return;
    const mole = S.active;
    aiTimer = setTimeout(() => {
      if (S.over || S.active !== mole || mole.hit) return;
      if (Math.random() < .88) aiHit(mole);
    }, 350 + Math.random() * 200);
  }

  function aiHit(mole) {
    mole.hit = true;
    S.oppHits++;
    burst(holePos(mole.hole).x, holePos(mole.hole).y, '#ff6482');
    ctx.sfx.play('bad');
    updateStatus();
  }

  function burst(x, y, col) {
    for (let i = 0; i < 14; i++) {
      const a = Math.random() * Math.PI * 2, sp = 1.6 + Math.random() * 3;
      particles.push({ x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 2, life: 1, col, r: 2.5 + Math.random() * 3.5 });
    }
  }

  function swing(e) {
    const r = cv.getBoundingClientRect();
    hammer.x = (e.clientX - r.left) / scale;
    hammer.y = (e.clientY - r.top) / scale;
    hammer.t0 = performance.now();
    if (S.over) return;
    const cx = (e.clientX - r.left) / scale, cy = (e.clientY - r.top) / scale;
    const col = Math.floor(cx / (W / 3)), row = Math.floor(cy / (H / 3));
    const cell = row * 3 + col;
    if (S.active && !S.active.hit && cell === S.active.hole) {
      const mole = S.active;
      mole.hit = true;
      S.hits++;
      ctx.sfx.play('good');
      burst(holePos(cell).x, holePos(cell).y, '#ffd66b');
      ctx.send('ev', { hit: mole.tick });
      updateStatus();
    } else {
      ctx.sfx.play('click');
    }
  }

  function endGame() {
    if (S.over) return;
    S.over = true;
    S.active = null;
    if (aiTimer) clearTimeout(aiTimer);
    ctx.send('ev', { timeup: 1, hits: S.hits });
    ctx.send('mv', null, snap());
    if (S.oppTimeup) compare();
    else ctx.setStatus('时间到！等待对方结算…');
  }

  function compare() {
    if (!S.over) return;
    const mine = S.hits, opp = ctx.mode === 'ai' ? S.oppHits : S.oppHits;
    let result = 'draw';
    if (mine > opp) result = 'win';
    else if (mine < opp) result = 'lose';
    setTimeout(() => ctx.finish(result, '命中 ' + mine + ' : ' + opp), 300);
  }

  function updateStatus() {
    if (S.over) return;
    const left = Math.max(0, Math.ceil(DUR - S.elapsed / 1000));
    ctx.setStatus('⏱ ' + left + 's · 命中 ' + S.hits);
    ctx.setOppStatus('对方命中 ' + S.oppHits);
  }

  function drawMole(mole, now) {
    const p = mole.hit ? 1 : Math.min(1, Math.max(0, (now - mole.t0) / mole.dur));
    const pos = holePos(mole.hole);
    let sc = p < .18 ? p / .18 : p > .82 ? Math.max(0, (1 - p) / .18) : 1;
    g.save();
    g.translate(pos.x, pos.y + 26 * (1 - sc));
    g.scale(sc, mole.hit ? sc * .55 : sc);
    if (mole.hit) g.rotate(.3);
    g.font = Math.round(W / 3 * .52) + 'px serif';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    if (mole.hit) {
      g.globalAlpha = .9;
      g.fillText('😵', 0, 0);
    } else {
      g.shadowColor = 'rgba(0,0,0,.3)';
      g.shadowBlur = 10;
      g.fillText('🐹', 0, 0);
    }
    g.restore();
  }

  function drawHammer(now) {
    const sw = Math.min(1, (now - hammer.t0) / 130);
    const rot = -0.5 + Math.sin(sw * Math.PI) * -1.1;
    g.save();
    g.translate(hammer.x + 26, hammer.y + 20);
    g.rotate(rot);
    g.fillStyle = '#b98a4a';
    g.beginPath(); g.roundRect(-4, -8, 9, 52, 4); g.fill();
    const hg = g.createLinearGradient(-30, -30, 12, 0);
    hg.addColorStop(0, '#8d99ae'); hg.addColorStop(.5, '#e2e8f0'); hg.addColorStop(1, '#aab4c4');
    g.fillStyle = hg;
    g.beginPath(); g.roundRect(-30, -26, 44, 24, 8); g.fill();
    g.fillStyle = 'rgba(255,255,255,.5)';
    g.beginPath(); g.roundRect(-26, -23, 36, 6, 3); g.fill();
    g.restore();
  }

  function draw(now) {
    if (!g) return;
    logic(now);
    g.clearRect(0, 0, W, H);
    const sky = g.createLinearGradient(0, 0, 0, H);
    sky.addColorStop(0, '#bfe8ff');
    sky.addColorStop(.28, '#a8e08f');
    sky.addColorStop(1, '#6cbf4e');
    g.fillStyle = sky;
    g.beginPath(); g.roundRect(0, 0, W, H, 18); g.fill();
    g.fillStyle = 'rgba(255,255,255,.25)';
    for (let i = 0; i < 3; i++) {
      g.beginPath();
      g.ellipse(80 + i * 150 + Math.sin(now / 3000 + i) * 10, 46, 34, 12, 0, 0, 7);
      g.fill();
    }
    for (let h = 0; h < 9; h++) {
      const pos = holePos(h);
      g.save();
      g.fillStyle = 'rgba(40,80,30,.35)';
      g.beginPath(); g.ellipse(pos.x, pos.y + 30, 62, 22, 0, 0, 7); g.fill();
      const hg = g.createRadialGradient(pos.x, pos.y + 22, 4, pos.x, pos.y + 22, 56);
      hg.addColorStop(0, '#241305');
      hg.addColorStop(.75, '#3d2409');
      hg.addColorStop(1, '#5a3a14');
      g.fillStyle = hg;
      g.beginPath(); g.ellipse(pos.x, pos.y + 22, 56, 20, 0, 0, 7); g.fill();
      g.strokeStyle = 'rgba(255,255,255,.35)';
      g.lineWidth = 3;
      g.beginPath(); g.ellipse(pos.x, pos.y + 22, 56, 20, 0, Math.PI * 1.05, Math.PI * 1.95); g.stroke();
      g.restore();
    }
    if (S.active && !S.over) drawMole(S.active, now);
    for (let i = particles.length - 1; i >= 0; i--) {
      const p = particles[i];
      p.x += p.vx; p.y += p.vy; p.vy += .16; p.life -= .028;
      if (p.life <= 0) { particles.splice(i, 1); continue; }
      g.save();
      g.globalAlpha = Math.max(0, p.life);
      g.fillStyle = p.col;
      g.shadowColor = p.col; g.shadowBlur = 8;
      g.beginPath(); g.arc(p.x, p.y, p.r, 0, 7); g.fill();
      g.restore();
    }
    if (S.elapsed > (DUR - 10) * 1000 && !S.over) {
      const a = .18 + Math.sin(now / 160) * .1;
      g.save();
      const vg = g.createRadialGradient(W / 2, H / 2, H * .3, W / 2, H / 2, H * .72);
      vg.addColorStop(0, 'transparent');
      vg.addColorStop(1, 'rgba(255,55,95,' + a + ')');
      g.fillStyle = vg;
      g.beginPath(); g.roundRect(0, 0, W, H, 18); g.fill();
      g.restore();
    }
    drawHammer(now);
    raf = requestAnimationFrame(draw);
  }

  function resize() {
    const w = Math.min(460, ctx.root.clientWidth - 8, window.innerWidth - 48);
    dpr = Math.min(window.devicePixelRatio || 1, 2.5);
    size = w;
    scale = w / W;
    cv.width = W * dpr; cv.height = H * dpr;
    cv.style.width = w + 'px'; cv.style.height = w + 'px';
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  return {
    create(c) {
      ctx = c;
      S.hits = 0; S.oppHits = 0; S.tick = 0; S.over = false;
      S.startT = performance.now(); S.elapsed = 0;
      S.active = null; S.oppTimeup = false; S.myTimeup = false; S.lastTickSec = -1;
      particles = [];
      cv = document.createElement('canvas');
      cv.className = 'gk-cv';
      cv.style.cssText = 'border-radius:18px;box-shadow:0 10px 30px rgba(60,140,60,.25);cursor:none;touch-action:none';
      c.root.appendChild(cv);
      g = cv.getContext('2d');
      const hint = document.createElement('div');
      hint.style.cssText = 'font-size:13px;color:var(--ink2);font-weight:600;text-align:center;margin-top:6px';
      hint.textContent = '60 秒限时 · 点击冒头的地鼠 · 命中多者胜';
      c.root.appendChild(hint);
      resize();
      window.addEventListener('resize', resize);
      cv.addEventListener('pointermove', e => {
        const r = cv.getBoundingClientRect();
        hammer.x = (e.clientX - r.left) / scale;
        hammer.y = (e.clientY - r.top) / scale;
      });
      cv.addEventListener('pointerdown', swing);
      c.onMsg((k, d) => {
        if (!d) return;
        if (k === 'ev') {
          if (d.hit != null) {
            S.oppHits++;
            const m = moleFor(d.hit);
            const pos = holePos(m.hole);
            burst(pos.x, pos.y, '#ff6482');
            ctx.sfx.play('pop');
            updateStatus();
          } else if (d.timeup) {
            S.oppTimeup = true;
            S.oppHits = d.hits || 0;
            if (S.over) compare();
          }
        }
      });
      c.onRestore(s => restore(s));
      c.turn(-1);
      statInt = setInterval(updateStatus, 250);
      snapTimer = setInterval(() => { if (!S.over) S.elapsed = performance.now() - S.startT; }, 500);
      updateStatus();
      draw(performance.now());
      if (c.mode === 'online' && c.side === 0) c.send('hello', null, snap());
      return {
        destroy() {
          cancelAnimationFrame(raf);
          clearInterval(statInt);
          clearInterval(snapTimer);
          if (aiTimer) clearTimeout(aiTimer);
          window.removeEventListener('resize', resize);
        }
      };
    }
  };
})();
