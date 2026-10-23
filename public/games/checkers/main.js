'use strict';
window.GameDef = (() => {
  const D4 = [[1, 1], [1, -1], [-1, 1], [-1, -1]];
  const S = { g: null, turn: 0, over: false, sel: -1, legal: [], chain: null, anim: null, my: 0 };
  let ctx = null, cv = null, g = null, cw = 0, cell = 0, dpr = 1;
  const pside = p => (p === 1 || p === 3) ? 0 : 1;

  function start() {
    S.g = new Array(64).fill(0);
    for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) {
      if ((x + y) % 2 === 0) continue;
      if (y < 3) S.g[y * 8 + x] = 2;
      else if (y > 4) S.g[y * 8 + x] = 1;
    }
    S.turn = 0; S.over = false; S.sel = -1; S.legal = []; S.chain = null; S.anim = null;
  }

  function jumpsFor(bd, x, y) {
    const out = [];
    const s = pside(bd[y * 8 + x]);
    (function rec(b, cx, cy, caps) {
      const q = b[cy * 8 + cx];
      const dirs = q >= 3 ? D4 : (s === 0 ? [[-1, -1], [1, -1]] : [[-1, 1], [1, 1]]);
      let ext = false;
      for (const d of dirs) {
        const mx = cx + d[0], my = cy + d[1], tx = cx + 2 * d[0], ty = cy + 2 * d[1];
        if (tx < 0 || tx > 7 || ty < 0 || ty > 7) continue;
        const mid = b[my * 8 + mx];
        if (!mid || pside(mid) === s || b[ty * 8 + tx] !== 0) continue;
        const nb = b.slice();
        nb[ty * 8 + tx] = nb[cy * 8 + cx];
        nb[cy * 8 + cx] = 0;
        nb[my * 8 + mx] = 0;
        if (nb[ty * 8 + tx] === 1 && ty === 0) nb[ty * 8 + tx] = 3;
        else if (nb[ty * 8 + tx] === 2 && ty === 7) nb[ty * 8 + tx] = 4;
        const promoted = nb[ty * 8 + tx] !== q;
        ext = true;
        const nc = caps.concat([[mx, my]]);
        if (promoted) out.push({ f: [x, y], t: [tx, ty], caps: nc, b: nb });
        else rec(nb, tx, ty, nc);
      }
      if (!ext && caps.length) out.push({ f: [x, y], t: [cx, cy], caps, b });
    })(bd, x, y, []);
    return out;
  }

  function stepsFor(bd, x, y) {
    const p = bd[y * 8 + x], s = pside(p);
    const dirs = p >= 3 ? D4 : (s === 0 ? [[-1, -1], [1, -1]] : [[-1, 1], [1, 1]]);
    const out = [];
    for (const d of dirs) {
      const tx = x + d[0], ty = y + d[1];
      if (tx < 0 || tx > 7 || ty < 0 || ty > 7 || bd[ty * 8 + tx] !== 0) continue;
      const nb = bd.slice();
      nb[ty * 8 + tx] = nb[y * 8 + x];
      nb[y * 8 + x] = 0;
      if (nb[ty * 8 + tx] === 1 && ty === 0) nb[ty * 8 + tx] = 3;
      else if (nb[ty * 8 + tx] === 2 && ty === 7) nb[ty * 8 + tx] = 4;
      out.push({ f: [x, y], t: [tx, ty], caps: [], b: nb });
    }
    return out;
  }

  function genAll(bd, s) {
    const js = [];
    for (let i = 0; i < 64; i++) {
      const p = bd[i];
      if (p && pside(p) === s) {
        for (const j of jumpsFor(bd, i % 8, (i / 8) | 0)) js.push(j);
      }
    }
    if (js.length) return js;
    const out = [];
    for (let i = 0; i < 64; i++) {
      const p = bd[i];
      if (p && pside(p) === s) {
        for (const m of stepsFor(bd, i % 8, (i / 8) | 0)) out.push(m);
      }
    }
    return out;
  }

  function boardAfter(m) {
    if (m.b) return m.b.slice();
    const nb = S.g.slice();
    const fx = m.f[0], fy = m.f[1], tx = m.t[0], ty = m.t[1];
    let v = nb[fy * 8 + fx];
    nb[fy * 8 + fx] = 0;
    for (const cc of m.caps) nb[cc[1] * 8 + cc[0]] = 0;
    if (v === 1 && ty === 0) v = 3;
    else if (v === 2 && ty === 7) v = 4;
    nb[ty * 8 + tx] = v;
    return nb;
  }

  function applyMove(m, net) {
    const fx = m.f[0], fy = m.f[1], tx = m.t[0], ty = m.t[1];
    const v = S.g[fy * 8 + fx];
    S.g = boardAfter(m);
    const np = S.g[ty * 8 + tx];
    S.sel = -1; S.legal = [];
    S.anim = { fx, fy, tx, ty, v: np, caps: m.caps.slice(), t0: performance.now() };
    ctx.sfx.play(m.caps.length ? 'pop' : 'place');
    const promoted = np !== v;
    const cont = m.caps.length > 0 && !promoted && jumpsFor(S.g, tx, ty).length > 0;
    if (cont) S.chain = [tx, ty];
    else {
      S.chain = null;
      S.turn = 1 - S.turn;
      checkEnd();
    }
    if (ctx.mode === 'online' && !net) ctx.send('mv', { f: m.f, t: m.t, caps: m.caps }, ser());
    afterTurn();
  }

  function checkEnd() {
    if (S.over) return;
    const op = S.turn;
    let cnt = 0;
    for (const p of S.g) if (p && pside(p) === op) cnt++;
    if (cnt === 0 || genAll(S.g, op).length === 0) {
      S.over = true;
      const meWin = 1 - op === S.my;
      setTimeout(() => ctx.finish(meWin ? 'win' : 'lose', meWin ? '对方棋子耗尽，大获全胜！' : '你的棋子耗尽或无路可走。'), 500);
    }
  }

  function ser() { return { g: 'checkers', q: S.g.slice(), t: S.turn, c: S.chain }; }
  function restore(s) {
    const mine = s && (s['s' + S.my] || s.s0 || s.s1);
    if (!mine || !mine.q) return;
    S.g = mine.q.slice();
    S.turn = mine.t || 0;
    S.chain = mine.c || null;
    S.over = false; S.sel = -1; S.legal = []; S.anim = null;
    draw();
    afterTurn();
  }

  function afterTurn() {
    if (S.over) return;
    draw();
    if (S.turn === S.my) {
      S.legal = S.chain ? jumpsFor(S.g, S.chain[0], S.chain[1]) : genAll(S.g, S.my);
      if (S.chain) S.sel = S.chain[1] * 8 + S.chain[0];
      ctx.turn(0);
      ctx.setStatus(S.chain ? '跳吃成功，继续跳！' : (mustCap() ? '存在吃子机会，必须吃！' : '你的回合'));
    } else {
      S.legal = [];
      ctx.turn(1); ctx.setStatus('等待对方行动…');
      if (ctx.mode === 'ai') setTimeout(aiGo, 500 + Math.random() * 400);
    }
  }

  function mustCap() { return S.legal.length > 0 && S.legal[0].caps.length > 0; }

  function evalBoard(bd) {
    let sc = 0;
    for (let i = 0; i < 64; i++) {
      const p = bd[i];
      if (!p) continue;
      const s = pside(p), x = i % 8, y = (i / 8) | 0;
      let v = p >= 3 ? 1.6 : 1;
      if (p < 3) v += (s === 1 ? y : 7 - y) * .035;
      v += (3.5 - Math.abs(3.5 - x)) * .012;
      sc += s === 1 ? v : -v;
    }
    return sc;
  }

  function search(bd, s, d, a, b2) {
    const ms = genAll(bd, s);
    if (!ms.length) return s === 1 ? -2000 - d : 2000 + d;
    if (d === 0) return evalBoard(bd);
    if (s === 1) {
      let best = -1e9;
      for (const m of ms) {
        const v = search(m.b, 0, d - 1, a, b2);
        if (v > best) best = v;
        if (best > a) a = best;
        if (a >= b2) break;
      }
      return best;
    }
    let best = 1e9;
    for (const m of ms) {
      const v = search(m.b, 1, d - 1, a, b2);
      if (v < best) best = v;
      if (best < b2) b2 = best;
      if (b2 <= a) break;
    }
    return best;
  }

  function aiGo() {
    if (S.over || S.turn === S.my || ctx.mode !== 'ai') return;
    let pc = 0;
    for (const p of S.g) if (p) pc++;
    const d = pc > 12 ? 4 : pc > 8 ? 5 : 6;
    const ms = genAll(S.g, 1);
    let best = null, bv = -1e9;
    for (const m of ms) {
      const v = search(m.b, 0, d - 1, -1e9, 1e9) + Math.random() * .05;
      if (v > bv) { bv = v; best = m; }
    }
    if (best) applyMove(best, false);
  }

  function disc(cx, cy, p, sc, al) {
    const s = pside(p), k = p >= 3, r = cell * .38 * (sc || 1);
    g.save();
    g.globalAlpha = al == null ? 1 : al;
    g.beginPath(); g.arc(cx, cy + r * .14, r, 0, 7);
    g.fillStyle = 'rgba(60,35,20,.3)'; g.filter = 'blur(3px)'; g.fill(); g.filter = 'none';
    const gr = g.createRadialGradient(cx - r * .35, cy - r * .45, r * .1, cx, cy, r);
    if (s === 0) { gr.addColorStop(0, '#e8766b'); gr.addColorStop(.55, '#c0392b'); gr.addColorStop(1, '#7f1d12'); }
    else { gr.addColorStop(0, '#ffffff'); gr.addColorStop(.55, '#f0ead9'); gr.addColorStop(1, '#c9bfa4'); }
    g.beginPath(); g.arc(cx, cy, r, 0, 7);
    g.fillStyle = gr; g.fill();
    g.lineWidth = Math.max(1.5, r * .1);
    g.strokeStyle = s === 0 ? 'rgba(255,190,180,.55)' : 'rgba(120,100,70,.5)';
    g.stroke();
    g.beginPath(); g.arc(cx - r * .3, cy - r * .38, r * .22, 0, 7);
    g.fillStyle = s === 0 ? 'rgba(255,255,255,.3)' : 'rgba(255,255,255,.85)'; g.fill();
    g.beginPath(); g.arc(cx, cy, r * .55, 0, 7);
    g.strokeStyle = s === 0 ? 'rgba(255,220,210,.35)' : 'rgba(140,120,90,.35)';
    g.lineWidth = 1.2; g.stroke();
    if (k) {
      g.font = Math.round(r * .9) + 'px system-ui';
      g.textAlign = 'center'; g.textBaseline = 'middle';
      g.fillText('👑', cx, cy + r * .04);
    }
    g.restore();
  }

  function draw(t) {
    if (!g) return;
    const tt = t || performance.now();
    g.clearRect(0, 0, cw, cw);
    g.fillStyle = '#f6ecdb';
    g.beginPath(); g.roundRect(0, 0, cw, cw, 16); g.fill();
    for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) {
      g.fillStyle = (x + y) % 2 ? '#a8785a' : '#f3e7cf';
      g.fillRect(x * cell, y * cell, cell + .5, cell + .5);
    }
    g.strokeStyle = 'rgba(90,60,30,.3)'; g.lineWidth = 1.5;
    g.strokeRect(1, 1, cw - 2, cw - 2);
    const capFrom = new Set(S.legal.filter(m => m.caps.length).map(m => m.f[1] * 8 + m.f[0]));
    if (S.sel >= 0 && !S.anim) {
      const sx = S.sel % 8, sy = (S.sel / 8) | 0;
      g.strokeStyle = 'rgba(255,190,50,.95)'; g.lineWidth = 3;
      g.strokeRect(sx * cell + 2, sy * cell + 2, cell - 4, cell - 4);
      for (const m of S.legal) {
        if (m.f[0] !== sx || m.f[1] !== sy) continue;
        g.beginPath();
        g.arc(m.t[0] * cell + cell / 2, m.t[1] * cell + cell / 2, m.caps.length ? cell * .4 : cell * .13, 0, 7);
        g.fillStyle = m.caps.length ? 'rgba(220,60,50,.22)' : 'rgba(70,150,90,.3)';
        g.fill();
      }
    }
    for (let i = 0; i < 64; i++) {
      if (!S.g[i]) continue;
      if (S.anim && i === S.anim.ty * 8 + S.anim.tx) continue;
      const sc = capFrom.has(i) && S.turn === S.my && !S.over ? 1 + .05 * Math.sin(tt / 150) : 1;
      disc(i % 8 * cell + cell / 2, ((i / 8) | 0) * cell + cell / 2, S.g[i], sc, 1);
    }
    if (S.anim) {
      const p = Math.min(1, (tt - S.anim.t0) / 300);
      const e = 1 - Math.pow(1 - p, 3);
      for (const c of S.anim.caps) {
        disc(c[0] * cell + cell / 2, c[1] * cell + cell / 2, S.anim.v, 1 - .5 * e, 1 - e);
      }
      const gx = (S.anim.fx + (S.anim.tx - S.anim.fx) * e) * cell + cell / 2;
      const gy = (S.anim.fy + (S.anim.ty - S.anim.fy) * e) * cell + cell / 2;
      const lift = S.anim.caps.length ? Math.sin(e * Math.PI) * cell * .25 : 0;
      disc(gx, gy - lift, S.anim.v, 1 + .06 * Math.sin(e * Math.PI), 1);
      if (p < 1) requestAnimationFrame(draw); else { S.anim = null; draw(); }
    } else if (capFrom.size && S.turn === S.my && !S.over) {
      requestAnimationFrame(draw);
    }
  }

  function onResize() {
    const w = Math.min(520, ctx.root.clientWidth - 8, window.innerWidth - 48);
    dpr = Math.min(window.devicePixelRatio || 1, 2.5);
    cw = w; cell = w / 8;
    cv.width = cw * dpr; cv.height = cw * dpr;
    cv.style.width = cw + 'px'; cv.style.height = cw + 'px';
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
      cv.style.cssText = 'border-radius:16px;box-shadow:0 10px 30px rgba(110,70,40,.18),0 2px 6px rgba(0,0,0,.08);touch-action:manipulation';
      c.root.appendChild(cv);
      g = cv.getContext('2d');
      const hint = document.createElement('div');
      hint.style.cssText = 'font-size:13px;color:var(--ink2);font-weight:600;margin-top:10px;text-align:center';
      hint.textContent = '吃子强制 · 连跳不断 · 抵达底线升王 👑 · 无子可动判负';
      c.root.appendChild(hint);
      onResize();
      window.addEventListener('resize', onResize);
      cv.addEventListener('pointerdown', e => {
        if (S.over || S.anim || S.turn !== S.my || !S.legal.length) return;
        const r = cv.getBoundingClientRect();
        const x = Math.floor((e.clientX - r.left) / cell), y = Math.floor((e.clientY - r.top) / cell);
        if (x < 0 || x > 7 || y < 0 || y > 7) return;
        const i = y * 8 + x;
        if (S.sel >= 0) {
          const m = S.legal.find(mm => mm.f[0] === S.sel % 8 && mm.f[1] === (S.sel / 8 | 0) && mm.t[0] === x && mm.t[1] === y);
          if (m) { applyMove(m, false); return; }
        }
        if (S.g[i] && pside(S.g[i]) === S.my && S.legal.some(mm => mm.f[0] === x && mm.f[1] === y)) {
          S.sel = i;
          ctx.sfx.play('click');
        } else S.sel = -1;
        draw();
      });
      c.onMsg((k, d) => {
        if (k === 'mv' && d && d.f && !S.over) {
          applyMove({ f: d.f, t: d.t, caps: d.caps || [], b: null }, true);
        }
      });
      c.onRestore(s => restore(s));
      afterTurn();
      if (c.mode === 'online' && c.side === 0) c.send('hello', null, ser());
      return { destroy() { window.removeEventListener('resize', onResize); } };
    }
  };
})();
