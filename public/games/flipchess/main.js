'use strict';
window.GameDef = (() => {
  const C = 4, R = 8;
  const TN = ['将', '士', '相', '车', '马', '炮', '兵'];
  const RNK = [9, 8, 7, 6, 5, 4, 1];
  const TV = [100, 30, 26, 68, 45, 50, 12];
  const CNT = [1, 1, 1, 2, 2, 2, 7];
  const D4 = [[1, 0], [-1, 0], [0, 1], [0, -1]];
  const S = { b: null, turn: 0, sel: -1, acts: [], over: false, anim: null, my: 0 };
  let ctx = null, cv = null, g = null, cw = 0, chh = 0, cell = 0, dpr = 1;
  const dec = v => { const u = Math.abs(v) - 1; return { c: (u / 8) | 0, t: u % 8, h: v < 0 }; };

  function start() {
    const pool = [];
    for (let c = 0; c < 2; c++) for (let t = 0; t < 7; t++) for (let n = 0; n < CNT[t]; n++) pool.push(c * 8 + t);
    for (let i = pool.length - 1; i > 0; i--) {
      const j = Math.floor(ctx.rng() * (i + 1));
      const tmp = pool[i]; pool[i] = pool[j]; pool[j] = tmp;
    }
    S.b = pool.map(p => -(p + 1));
    S.turn = 0; S.sel = -1; S.acts = []; S.over = false; S.anim = null;
  }

  function canCap(at, dt) {
    if (at === 6 && dt === 0) return true;
    if (at === 0 && dt === 6) return false;
    return RNK[at] >= RNK[dt];
  }

  function actsFor(bd, i) {
    const v = bd[i], d = dec(v);
    const x = i % C, y = (i / C) | 0, out = [];
    for (const dd of D4) {
      const tx = x + dd[0], ty = y + dd[1];
      if (tx < 0 || tx >= C || ty < 0 || ty >= R) continue;
      const j = ty * C + tx, tv = bd[j];
      if (tv === 0) { out.push({ f: i, t: j, cap: 0 }); continue; }
      if (tv > 0) {
        const td = dec(tv);
        if (td.c !== d.c && canCap(d.t, td.t)) out.push({ f: i, t: j, cap: 1 });
      }
    }
    if (d.t === 4) {
      for (const dd of D4) {
        let st = 1, scr = 0;
        while (true) {
          const tx = x + dd[0] * st, ty = y + dd[1] * st;
          if (tx < 0 || tx >= C || ty < 0 || ty >= R) break;
          const j = ty * C + tx, tv = bd[j];
          if (tv === 0) { st++; continue; }
          if (scr === 0) { scr = 1; st++; continue; }
          const td = dec(tv);
          if (tv > 0 && td.c !== d.c) out.push({ f: i, t: j, cap: 1 });
          break;
        }
      }
    }
    return out;
  }

  function applyAct(a, net) {
    if (a.fl) {
      const d = dec(S.b[a.f]);
      S.b[a.f] = 1 + S.turn * 8 + d.t;
      S.anim = { kind: 'fl', i: a.f, t0: performance.now() };
      ctx.sfx.play('pop');
    } else {
      const capV = a.cap ? S.b[a.t] : 0;
      const v = S.b[a.f];
      S.b[a.t] = v;
      S.b[a.f] = 0;
      S.anim = { kind: a.cap ? 'cap' : 'mv', f: a.f, t: a.t, v, capV, t0: performance.now() };
      ctx.sfx.play(a.cap ? 'good' : 'place');
    }
    S.sel = -1; S.acts = [];
    S.turn = 1 - S.turn;
    if (ctx.mode === 'online' && !net) ctx.send('mv', a, ser());
    draw();
    if (checkEnd()) return;
    afterTurn();
  }

  function anyActs(s) {
    for (let i = 0; i < C * R; i++) {
      if (S.b[i] < 0) return true;
      const v = S.b[i];
      if (v > 0 && dec(v).c === s && actsFor(S.b, i).length) return true;
    }
    return false;
  }

  function checkEnd() {
    if (S.over) return false;
    if (!anyActs(S.turn)) {
      S.over = true;
      const winner = 1 - S.turn;
      setTimeout(() => {
        if (winner === S.my) ctx.finish('win', '对方无棋可走，束手就擒！');
        else ctx.finish('lose', '你无棋可走。');
      }, 550);
      return true;
    }
    return false;
  }

  function ser() { return { g: 'flipchess', b: S.b.slice(), t: S.turn }; }
  function restore(s) {
    const mine = s && (s['s' + S.my] || s.s0 || s.s1);
    if (!mine || !mine.b) return;
    S.b = mine.b.slice();
    S.turn = mine.t || 0;
    S.over = false; S.sel = -1; S.acts = []; S.anim = null;
    draw();
    afterTurn();
  }

  function afterTurn() {
    if (S.over) return;
    draw();
    if (S.turn === S.my) { ctx.turn(0); ctx.setStatus('你的回合 · 翻开暗棋或移动/吃子'); }
    else {
      ctx.turn(1); ctx.setStatus('等待对方行动…');
      if (ctx.mode === 'ai') setTimeout(aiGo, 600 + Math.random() * 400);
    }
  }

  function threatOn(bd, i, s) {
    for (let j = 0; j < C * R; j++) {
      const v = bd[j];
      if (v <= 0) continue;
      if (dec(v).c === s) continue;
      if (actsFor(bd, j).some(a => a.t === i && a.cap)) return true;
    }
    return false;
  }

  function preyNear(bd, i, s) {
    const x = i % C, y = (i / C) | 0;
    let n = 0;
    for (let j = 0; j < C * R; j++) {
      const v = bd[j];
      if (v <= 0) continue;
      if (dec(v).c === s) continue;
      if (Math.abs(j % C - x) + Math.abs(((j / C) | 0) - y) <= 2) n++;
    }
    return n;
  }

  function aiGo() {
    if (S.over || S.turn === S.my || ctx.mode !== 'ai') return;
    const s = S.turn;
    const acts = [];
    for (let i = 0; i < C * R; i++) {
      if (S.b[i] < 0) acts.push({ f: i, fl: 1 });
      else if (S.b[i] > 0 && dec(S.b[i]).c === s) {
        for (const a of actsFor(S.b, i)) acts.push(a);
      }
    }
    let best = null, bs = -1e9;
    for (const a of acts) {
      let sc = Math.random() * 9;
      if (a.fl) {
        sc += 20 + Math.random() * 16;
      } else {
        const atk = dec(S.b[a.f]);
        const tb = S.b.slice();
        tb[a.t] = tb[a.f];
        tb[a.f] = 0;
        if (a.cap) {
          const dd = dec(S.b[a.t]);
          sc += TV[dd.t];
          if (threatOn(tb, a.t, s)) sc -= TV[atk.t] * .7;
        } else {
          if (threatOn(tb, a.t, s)) sc -= TV[atk.t] * .55;
          sc += preyNear(tb, a.t, s) * 5;
        }
      }
      if (sc > bs) { bs = sc; best = a; }
    }
    if (best) applyAct(best, false);
  }

  function card(cx, cy, sx, al) {
    const w = cell * .84 * (sx == null ? 1 : sx), h = cell * .84;
    if (w < 1) return;
    g.save();
    g.globalAlpha = al == null ? 1 : al;
    g.translate(cx, cy);
    g.beginPath(); g.roundRect(-w / 2, -h / 2, w, h, cell * .14);
    const bg = g.createLinearGradient(-w / 2, -h / 2, w / 2, h / 2);
    bg.addColorStop(0, '#4a5064'); bg.addColorStop(1, '#262b3a');
    g.fillStyle = bg; g.fill();
    g.strokeStyle = 'rgba(255,255,255,.18)'; g.lineWidth = 1.2; g.stroke();
    g.save();
    g.clip();
    g.strokeStyle = 'rgba(255,255,255,.08)'; g.lineWidth = 1;
    for (let d = -h; d < w + h; d += cell * .17) {
      g.beginPath(); g.moveTo(-w / 2 + d, -h / 2); g.lineTo(-w / 2 + d + h, h / 2); g.stroke();
      g.beginPath(); g.moveTo(-w / 2 + d, h / 2); g.lineTo(-w / 2 + d + h, -h / 2); g.stroke();
    }
    g.restore();
    if (sx == null || sx > .45) {
      g.beginPath();
      g.moveTo(0, -cell * .14);
      g.lineTo(cell * .1, 0);
      g.lineTo(0, cell * .14);
      g.lineTo(-cell * .1, 0);
      g.closePath();
      g.fillStyle = 'rgba(238,196,110,.92)';
      g.fill();
    }
    g.restore();
  }

  function face(cx, cy, v, sx, al) {
    const d = dec(v);
    const r = cell * .42 * (sx == null ? 1 : sx);
    if (r < 1) return;
    const red = d.c === 0;
    g.save();
    g.globalAlpha = al == null ? 1 : al;
    g.beginPath(); g.arc(cx, cy + r * .12, r, 0, 7);
    g.fillStyle = 'rgba(60,40,20,.25)'; g.filter = 'blur(3px)'; g.fill(); g.filter = 'none';
    const gr = g.createRadialGradient(cx - r * .35, cy - r * .45, r * .12, cx, cy, r);
    gr.addColorStop(0, '#fffbef'); gr.addColorStop(.6, '#f4ecd8'); gr.addColorStop(1, '#d8cbae');
    g.beginPath(); g.arc(cx, cy, r, 0, 7);
    g.fillStyle = gr; g.fill();
    g.strokeStyle = red ? '#c0392b' : '#33343d';
    g.lineWidth = Math.max(1.5, r * .09);
    g.stroke();
    g.beginPath(); g.arc(cx - r * .3, cy - r * .4, r * .2, 0, 7);
    g.fillStyle = 'rgba(255,255,255,.7)'; g.fill();
    g.fillStyle = red ? '#c0392b' : '#2b2c36';
    g.font = '700 ' + Math.round(r * .82) + 'px "PingFang SC","Microsoft YaHei",system-ui';
    g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText(TN[d.t], cx, cy + r * .04);
    g.beginPath(); g.arc(cx + r * .62, cy - r * .62, r * .27, 0, 7);
    g.fillStyle = red ? '#c0392b' : '#2b2c36'; g.fill();
    g.fillStyle = '#fff';
    g.font = '700 ' + Math.round(r * .34) + 'px system-ui';
    g.fillText(String(RNK[d.t]), cx + r * .62, cy - r * .6);
    g.restore();
  }

  function draw(t) {
    if (!g) return;
    const tt = t || performance.now();
    g.clearRect(0, 0, cw, chh);
    const bg = g.createLinearGradient(0, 0, cw, chh);
    bg.addColorStop(0, '#f9f2e0'); bg.addColorStop(1, '#efe3c6');
    g.fillStyle = bg;
    g.beginPath(); g.roundRect(0, 0, cw, chh, 16); g.fill();
    g.strokeStyle = 'rgba(150,115,60,.22)'; g.lineWidth = 1;
    for (let x = 0; x <= C; x++) {
      g.beginPath(); g.moveTo(x * cell + .5, 0); g.lineTo(x * cell + .5, chh); g.stroke();
    }
    for (let y = 0; y <= R; y++) {
      g.beginPath(); g.moveTo(0, y * cell + .5); g.lineTo(cw, y * cell + .5); g.stroke();
    }
    if (S.sel >= 0 && !S.anim) {
      const x = S.sel % C, y = (S.sel / C) | 0;
      g.strokeStyle = 'rgba(255,170,40,.95)'; g.lineWidth = 3;
      g.strokeRect(x * cell + 2, y * cell + 2, cell - 4, cell - 4);
      for (const a of S.acts) {
        const ax = a.t % C, ay = (a.t / C) | 0;
        g.beginPath();
        if (a.cap) {
          g.arc(ax * cell + cell / 2, ay * cell + cell / 2, cell * .38, 0, 7);
          g.strokeStyle = 'rgba(220,60,50,.8)'; g.lineWidth = 2; g.stroke();
        } else {
          g.arc(ax * cell + cell / 2, ay * cell + cell / 2, cell * .12, 0, 7);
          g.fillStyle = 'rgba(90,160,90,.5)'; g.fill();
        }
      }
    }
    let animSkip = -1;
    if (S.anim && S.anim.kind !== 'fl') animSkip = S.anim.t;
    if (S.anim && S.anim.kind === 'fl') animSkip = S.anim.i;
    for (let i = 0; i < C * R; i++) {
      if (!S.b[i] || i === animSkip) continue;
      const cx = i % C * cell + cell / 2, cy = ((i / C) | 0) * cell + cell / 2;
      if (S.b[i] < 0) card(cx, cy, null, 1);
      else face(cx, cy, S.b[i], null, 1);
    }
    if (S.anim) {
      const p = Math.min(1, (tt - S.anim.t0) / (S.anim.kind === 'fl' ? 420 : 280));
      if (S.anim.kind === 'fl') {
        const i = S.anim.i;
        const cx = i % C * cell + cell / 2, cy = ((i / C) | 0) * cell + cell / 2;
        const sx = Math.abs(Math.cos(Math.PI * p)) || .02;
        if (p < .5) card(cx, cy, sx, 1);
        else face(cx, cy, S.b[i], sx, 1);
      } else {
        const e = 1 - Math.pow(1 - p, 3);
        const fx = S.anim.f % C, fy = (S.anim.f / C) | 0, tx = S.anim.t % C, ty = (S.anim.t / C) | 0;
        if (S.anim.capV) face(tx * cell + cell / 2, ty * cell + cell / 2, S.anim.capV, 1 - .5 * e, 1 - e);
        const gx = (fx + (tx - fx) * e) * cell + cell / 2;
        const gy = (fy + (ty - fy) * e) * cell + cell / 2;
        face(gx, gy, S.anim.v, 1 + .06 * Math.sin(e * Math.PI), 1);
      }
      if (p < 1) requestAnimationFrame(draw); else { S.anim = null; draw(); }
    }
  }

  function onResize() {
    const w = Math.min(460, ctx.root.clientWidth - 8, window.innerWidth - 48);
    dpr = Math.min(window.devicePixelRatio || 1, 2.5);
    cell = Math.min(76, Math.floor(w / C), Math.floor((window.innerHeight - 250) / R));
    if (cell < 40) cell = Math.max(38, Math.floor(w / C));
    cw = cell * C; chh = cell * R;
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
      cv.style.cssText = 'border-radius:16px;box-shadow:0 10px 30px rgba(140,90,30,.18),0 2px 6px rgba(0,0,0,.08);touch-action:manipulation';
      c.root.appendChild(cv);
      g = cv.getContext('2d');
      const hint = document.createElement('div');
      hint.style.cssText = 'font-size:13px;color:var(--ink2);font-weight:600;margin-top:10px;text-align:center';
      hint.textContent = '每回合：翻开一枚暗棋 / 移动一格 / 按级吃子 · 炮隔子打 · 兵可吃将';
      c.root.appendChild(hint);
      onResize();
      window.addEventListener('resize', onResize);
      cv.addEventListener('pointerdown', e => {
        if (S.over || S.anim || S.turn !== S.my) return;
        const r = cv.getBoundingClientRect();
        const x = Math.floor((e.clientX - r.left) / cell), y = Math.floor((e.clientY - r.top) / cell);
        if (x < 0 || x >= C || y < 0 || y >= R) return;
        const i = y * C + x, v = S.b[i];
        if (v < 0) { applyAct({ f: i, fl: 1 }, false); return; }
        if (S.sel >= 0) {
          const a = S.acts.find(aa => aa.t === i);
          if (a) { applyAct(a, false); return; }
        }
        if (v > 0 && dec(v).c === S.my) {
          const acts = actsFor(S.b, i);
          if (acts.length) { S.sel = i; S.acts = acts; ctx.sfx.play('click'); }
          else { S.sel = -1; S.acts = []; }
        } else { S.sel = -1; S.acts = []; }
        draw();
      });
      c.onMsg((k, d) => {
        if (k === 'mv' && d && !S.over && (d.fl || typeof d.f === 'number')) applyAct(d, true);
      });
      c.onRestore(s => restore(s));
      afterTurn();
      if (c.mode === 'online' && c.side === 0) c.send('hello', null, ser());
      return { destroy() { window.removeEventListener('resize', onResize); } };
    }
  };
})();
