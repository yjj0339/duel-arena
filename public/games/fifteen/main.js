'use strict';
window.GameDef = (() => {
  const S = { board: [], moves: 0, done: false, over: false, t0: 0, elapsed: 0, oppPlaced: 0, aiBoard: [], aiBusy: false };
  let ctx = null, boardEl = null, tiles = [], statEl = null, oppEl = null, timeInt = 0, aiInt = 0, keyHandler = null, resizeHandler = null, winTimer = null;

  function idx(r, c) { return r * 4 + c; }
  function blank(b) { return b.indexOf(0); }

  function scramble() {
    const rng = ctx.rng;
    S.board = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 0];
    let bp = 15;
    for (let i = 0; i < 80; i++) {
      const r = Math.floor(bp / 4), c = bp % 4;
      const opts = [];
      if (r > 0) opts.push(bp - 4);
      if (r < 3) opts.push(bp + 4);
      if (c > 0) opts.push(bp - 1);
      if (c < 3) opts.push(bp + 1);
      const pick = opts[Math.floor(rng() * opts.length)];
      S.board[bp] = S.board[pick];
      S.board[pick] = 0;
      bp = pick;
    }
  }

  function placed(b) {
    let n = 0;
    for (let i = 0; i < 15; i++) if (b[i] === i + 1) n++;
    return n;
  }

  function snap() {
    return { g: 'fifteen', board: S.board.slice(), moves: S.moves, done: S.done ? 1 : 0, t: Math.round(S.elapsed) };
  }

  function restore(s) {
    const mine = s && s['s' + ctx.side];
    if (!mine || !mine.board) return;
    S.board = mine.board.slice();
    S.moves = mine.moves || 0;
    S.done = !!mine.done;
    S.elapsed = mine.t || 0;
    S.t0 = performance.now() - S.elapsed;
    S.over = false;
    render();
    updateStatus();
  }

  function doSlide(i, silent) {
    const bp = blank(S.board);
    const br = Math.floor(bp / 4), bc = bp % 4, ir = Math.floor(i / 4), ic = i % 4;
    if (Math.abs(br - ir) + Math.abs(bc - ic) !== 1) return false;
    S.board[bp] = S.board[i];
    S.board[i] = 0;
    S.moves++;
    if (!silent) ctx.sfx.play('place');
    render();
    const n = placed(S.board);
    ctx.send('mv', { b: S.board.slice(), m: S.moves }, snap());
    ctx.send('ev', { placed: n });
    if (n === 15) onMyFinish();
    return true;
  }

  function onMyFinish() {
    if (S.done) return;
    S.done = true;
    ctx.sfx.play('good');
    if (boardEl) boardEl.classList.add('won');
    ctx.send('ev', { done: 1 });
    ctx.send('mv', null, snap());
    if (S.oppDone) { settle(-1, null); return; }
    winTimer = setTimeout(() => { if (!S.over) { S.over = true; ctx.finish('win', S.moves + ' 步 · ' + (S.elapsed / 1000).toFixed(1) + ' 秒复原成功！'); } }, 700);
  }

  function settle(myT, opT) {
    if (S.over) return;
    S.over = true;
    if (winTimer) { clearTimeout(winTimer); winTimer = null; }
    if (opT == null) { setTimeout(() => ctx.finish('lose', '对方先完成复原'), 400); return; }
    const win = myT <= opT;
    setTimeout(() => ctx.finish(win ? 'win' : 'lose', '我 ' + myT + ' 步 : 对方 ' + opT + ' 步'), 400);
  }

  function updateStatus() {
    if (S.over) return;
    const mm = Math.floor(S.elapsed / 60000), ss = Math.floor(S.elapsed / 1000) % 60;
    ctx.setStatus(S.done ? '已复原！' : '步数 ' + S.moves + ' · ⏱ ' + mm + ':' + String(ss).padStart(2, '0'));
    const n = placed(S.board);
    ctx.setOppStatus('对方已归位 ' + (ctx.mode === 'ai' ? placed(S.aiBoard) : S.oppPlaced) + '/15');
    if (statEl && !S.done) statEl.textContent = '已归位 ' + n + '/15';
  }

  function render() {
    if (!boardEl) return;
    for (let i = 0; i < 16; i++) {
      const t = tiles[i], v = S.board[i];
      if (v === 0) { t.style.display = 'none'; continue; }
      t.style.display = '';
      t.querySelector('.fif-n').textContent = v;
      const r = Math.floor(i / 4), c = i % 4;
      t.style.transform = 'translate(' + c * 100 + '%,' + r * 100 + '%)';
      t.classList.toggle('ok', v === i + 1);
    }
  }

  function keyMove(dir) {
    if (S.done || S.over) return;
    const bp = blank(S.board), r = Math.floor(bp / 4), c = bp % 4;
    let from = -1;
    if (dir === 'L' && c < 3) from = bp + 1;
    if (dir === 'R' && c > 0) from = bp - 1;
    if (dir === 'U' && r < 3) from = bp + 4;
    if (dir === 'D' && r > 0) from = bp - 4;
    if (from >= 0) doSlide(from);
  }

  function aiStep() {
    if (ctx.mode !== 'ai' || S.done || S.over) return;
    const b = S.aiBoard;
    let target = 0;
    for (let v = 1; v <= 15; v++) if (b[v - 1] !== v) { target = v; break; }
    if (!target) { aiWin(); return; }
    let moveIdx = -1;
    if (Math.random() > .08) {
      const goal = target - 1;
      const isPlaced = bb => { for (let v = 1; v < target; v++) if (bb[v - 1] !== v) return false; return true; };
      const start = b.join(',');
      const seen = new Set([start]);
      let frontier = [{ b: b.slice(), bp: b.indexOf(0), first: -1 }];
      for (let d = 0; d < 6 && moveIdx < 0; d++) {
        const next = [];
        for (const st of frontier) {
          const r = Math.floor(st.bp / 4), c = st.bp % 4;
          for (const ni of [r > 0 ? st.bp - 4 : -1, r < 3 ? st.bp + 4 : -1, c > 0 ? st.bp - 1 : -1, c < 3 ? st.bp + 1 : -1]) {
            if (ni < 0) continue;
            const nb = st.b.slice();
            nb[st.bp] = nb[ni]; nb[ni] = 0;
            const key = nb.join(',');
            if (seen.has(key)) continue;
            seen.add(key);
            const first = st.first < 0 ? ni : st.first;
            if (nb[goal] === target && isPlaced(nb)) { moveIdx = first; break; }
            next.push({ b: nb, bp: ni, first });
          }
          if (moveIdx >= 0) break;
        }
        frontier = next;
      }
    }
    const bp = b.indexOf(0);
    const r = Math.floor(bp / 4), c = bp % 4;
    const opts = [r > 0 ? bp - 4 : -1, r < 3 ? bp + 4 : -1, c > 0 ? bp - 1 : -1, c < 3 ? bp + 1 : -1].filter(x => x >= 0);
    if (moveIdx < 0) moveIdx = opts[Math.floor(Math.random() * opts.length)];
    b[bp] = b[moveIdx]; b[moveIdx] = 0;
    if (placed(b) === 15) aiWin();
  }

  function aiWin() {
    if (S.done || S.over || ctx.mode !== 'ai') return;
    S.over = true;
    setTimeout(() => ctx.finish('lose', 'AI 先完成复原'), 400);
  }

  return {
    create(c) {
      ctx = c;
      scramble();
      S.moves = 0; S.done = false; S.over = false;
      S.t0 = performance.now(); S.elapsed = 0; S.oppPlaced = 0;
      if (c.mode === 'ai') {
        const rng = mulberry32(hashSeed(String(c.seed) + ':aifif'));
        S.aiBoard = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 0];
        let bp = 15;
        for (let i = 0; i < 80; i++) {
          const r = Math.floor(bp / 4), cc = bp % 4;
          const opts = [];
          if (r > 0) opts.push(bp - 4);
          if (r < 3) opts.push(bp + 4);
          if (cc > 0) opts.push(bp - 1);
          if (cc < 3) opts.push(bp + 1);
          const pick = opts[Math.floor(rng() * opts.length)];
          S.aiBoard[bp] = S.aiBoard[pick];
          S.aiBoard[pick] = 0;
          bp = pick;
        }
      }
      const css = document.createElement('style');
      css.textContent = `
      .fif-wrap{width:min(430px,88vw);margin:0 auto}
      .fif-board{position:relative;width:100%;aspect-ratio:1;background:linear-gradient(160deg,#eef1f7,#e2e7f0);border-radius:18px;box-shadow:inset 0 2px 8px rgba(80,90,120,.18)}
      .fif-board.won{animation:fifGlow 1.6s ease infinite}
      @keyframes fifGlow{0%,100%{box-shadow:inset 0 2px 8px rgba(80,90,120,.18)}50%{box-shadow:0 0 34px rgba(255,190,60,.75),inset 0 0 24px rgba(255,220,120,.5)}}
      .fif-tile{position:absolute;width:25%;height:25%;padding:4px;transition:transform .15s ease;cursor:pointer}
      .fif-in{width:100%;height:100%;border-radius:12px;display:grid;place-items:center;background:linear-gradient(180deg,#ffffff,#e9edf5);box-shadow:0 3px 8px rgba(60,70,100,.22),inset 0 1px 0 rgba(255,255,255,.9);border:1px solid rgba(255,255,255,.6);font-weight:800;color:#3a4358;position:relative}
      .fif-tile:hover .fif-in{background:linear-gradient(180deg,#ffffff,#dfe7f5)}
      .fif-tile.ok .fif-in{background:linear-gradient(180deg,#f0fbf3,#dcf3e4);color:#1f7a3d}
      .fif-tile.ok .fif-in::after{content:"✓";position:absolute;top:3px;right:6px;font-size:11px;color:#30b15c;font-weight:800}
      .fif-head{display:flex;justify-content:space-between;font-size:14px;font-weight:800;color:var(--ink2);margin-bottom:10px}
      `;
      document.head.appendChild(css);
      const wrap = document.createElement('div');
      wrap.className = 'fif-wrap';
      const head = document.createElement('div');
      head.className = 'fif-head';
      statEl = document.createElement('span');
      oppEl = document.createElement('span');
      oppEl.style.color = 'var(--acc)';
      head.appendChild(statEl);
      head.appendChild(oppEl);
      boardEl = document.createElement('div');
      boardEl.className = 'fif-board';
      tiles = [];
      for (let i = 0; i < 16; i++) {
        const t = document.createElement('div');
        t.className = 'fif-tile';
        t.innerHTML = '<div class="fif-in"><span class="fif-n"></span></div>';
        t.addEventListener('pointerdown', () => { if (!S.done && !S.over) doSlide(i); });
        boardEl.appendChild(t);
        tiles.push(t);
      }
      const hint = document.createElement('div');
      hint.style.cssText = 'font-size:13px;color:var(--ink2);font-weight:600;text-align:center;margin-top:10px';
      hint.textContent = '点击空格旁的滑块（或方向键）滑动 · 全部归位即胜';
      wrap.appendChild(head);
      wrap.appendChild(boardEl);
      wrap.appendChild(hint);
      c.root.appendChild(wrap);
      const setFont = () => {
        const w = boardEl.clientWidth / 4;
        boardEl.style.fontSize = Math.round(w * .38) + 'px';
      };
      setFont();
      resizeHandler = () => setFont();
      window.addEventListener('resize', resizeHandler);
      keyHandler = e => {
        const map = { ArrowLeft: 'L', ArrowRight: 'R', ArrowUp: 'U', ArrowDown: 'D', a: 'L', d: 'R', w: 'U', s: 'D', A: 'L', D: 'R', W: 'U', S: 'D' };
        if (map[e.key]) { e.preventDefault(); keyMove(map[e.key]); }
      };
      window.addEventListener('keydown', keyHandler);
      c.onMsg((k, d) => {
        if (!d) return;
        if (k === 'ev') {
          if (d.done) {
            S.oppDone = true;
            if (!S.done) settle(-1, null);
          } else if (d.placed != null) {
            S.oppPlaced = d.placed;
            updateStatus();
          }
        } else if (k === 'mv' && d && d.b) {
          S.oppMoves = d.m || 0;
        }
      });
      c.onRestore(s => restore(s));
      c.turn(-1);
      timeInt = setInterval(() => {
        if (!S.done && !S.over) S.elapsed = performance.now() - S.t0;
        updateStatus();
      }, 250);
      render();
      updateStatus();
      if (c.mode === 'ai') aiInt = setInterval(aiStep, 350);
      if (c.mode === 'online' && c.side === 0) c.send('hello', null, snap());
      return {
        destroy() {
          clearInterval(timeInt);
          if (aiInt) clearInterval(aiInt);
          if (winTimer) clearTimeout(winTimer);
          window.removeEventListener('keydown', keyHandler);
          window.removeEventListener('resize', resizeHandler);
          if (css.parentNode) css.remove();
        }
      };
    }
  };
})();
