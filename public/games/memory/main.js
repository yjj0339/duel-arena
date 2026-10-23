'use strict';
window.GameDef = (() => {
  const FACES = ['🍎', '🚀', '🌈', '🎵', '⚽', '🐳', '🌵', '🍩', '🎲', '🦋', '⚡', '🌙'];
  const PAIRS = 8;
  const S = { cards: [], open: [], matched: [], scores: [0, 0], turn: 0, busy: false, over: false, lock: 0 };
  let ctx = null, grid = null, tiles = [], knownAI = new Map();

  function shuffle(rng, arr) {
    const a = arr.slice();
    for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
    return a;
  }
  function build() {
    const rng = ctx.rng;
    const pool = shuffle(rng, FACES).slice(0, PAIRS);
    S.cards = shuffle(rng, pool.concat(pool).map((f, i) => f));
    S.open = []; S.matched = new Array(PAIRS * 2).fill(false);
    S.scores = [0, 0]; S.turn = ctx.side; S.busy = false; S.over = false; S.lock = 0;
    knownAI = new Map();
  }
  function serialize() {
    return { g: 'memory', c: S.cards, m: S.matched, s: S.scores, t: S.turn, o: S.open };
  }
  function deserialize(s) {
    const mine = s && (s['s' + ctx.side] || s.s0 || s.s1);
    if (!mine || !mine.c) return;
    S.cards = mine.c; S.matched = mine.m; S.scores = mine.s; S.turn = mine.t; S.open = mine.o || [];
    S.over = false; S.busy = false;
    render();
    afterTurn();
  }

  function canClick() {
    return !S.over && !S.busy && S.turn === ctx.side && S.open.length < 2;
  }
  function open(i) {
    if (i == null || S.matched[i] || S.open.includes(i) || S.busy) return;
    S.open.push(i);
    Sfx.play('pop');
    render();
    send();
    if (S.open.length === 2) {
      S.busy = true;
      const [a, b] = S.open;
      if (S.cards[a] === S.cards[b]) {
        setTimeout(() => {
          S.matched[a] = S.matched[b] = true;
          S.scores[S.turn]++;
          S.open = [];
          S.busy = false;
          Sfx.play('good');
          render();
          if (S.matched.every(m => m)) { S.over = true; endGame(); return; }
          send();
          afterTurn(true);
        }, 500);
      } else {
        setTimeout(() => {
          S.open = [];
          S.busy = false;
          S.turn = 1 - S.turn;
          Sfx.play('bad');
          render();
          send();
          afterTurn();
        }, 950);
      }
    }
  }
  function send() {
    if (ctx.mode === 'online') ctx.send('mv', { o: S.open.slice(), t: S.turn, s: S.scores, m: S.matched }, serialize());
  }
  function afterTurn(keep) {
    if (S.over) return;
    if (S.turn === ctx.side) {
      ctx.turn(0); ctx.setStatus('你的回合');
    } else {
      ctx.turn(1); ctx.setStatus('对方思考中…');
      if (ctx.mode === 'ai') setTimeout(aiMove, 700 + Math.random() * 600);
    }
  }
  function endGame() {
    const me = ctx.side, op = 1 - me;
    if (ctx.mode === 'ai') { }
    const [a, b] = ctx.mode === 'ai' ? [S.scores[0], S.scores[1]] : [S.scores[me], S.scores[op]];
    setTimeout(() => ctx.finish(a > b ? 'win' : a < b ? 'lose' : 'draw', '配对数 ' + a + ' : ' + b), 600);
    if (ctx.mode === 'online') ctx.send('mv', { done: 1 }, serialize());
  }
  function aiMove() {
    if (S.over || S.turn !== 1 || ctx.mode !== 'ai') return;
    S.open.forEach(i => knownAI.set(i, S.cards[i]));
    S.matched.forEach((m, i) => { if (m) knownAI.delete(i); });
    const unknown = [];
    for (let i = 0; i < S.cards.length; i++) if (!S.matched[i] && !knownAI.has(i)) unknown.push(i);
    const byFace = {};
    for (const [i, f] of knownAI) if (!S.matched[i]) (byFace[f] = byFace[f] || []).push(i);
    const pair = Object.values(byFace).find(v => v.length >= 2);
    if (pair && Math.random() < .85) { open(pair[0]); setTimeout(() => open(pair[1]), 800); return; }
    const first = unknown[Math.floor(ctx.rng() * unknown.length)];
    open(first);
    knownAI.set(first, S.cards[first]);
    setTimeout(() => {
      let second = null;
      for (const [i, f] of knownAI) if (i !== first && f === S.cards[first] && !S.matched[i]) second = i;
      if (second == null) {
        const rest = [];
        for (let i = 0; i < S.cards.length; i++) if (!S.matched[i] && !S.open.includes(i)) rest.push(i);
        second = rest[Math.floor(ctx.rng() * rest.length)];
      }
      if (second != null) open(second);
    }, 800);
  }

  function render() {
    if (!grid) return;
    for (let i = 0; i < tiles.length; i++) {
      const t = tiles[i];
      const isOpen = S.matched[i] || S.open.includes(i);
      t.classList.toggle('open', isOpen);
      t.classList.toggle('done', S.matched[i]);
      t.querySelector('.f').textContent = S.cards[i];
      t.style.pointerEvents = 'none';
    }
    const sEl = document.getElementById('memScore');
    if (sEl) sEl.textContent = ctx.mode === 'ai' ? S.scores[0] + ' : ' + S.scores[1] : S.scores[0] + ' : ' + S.scores[1];
  }

  const css = document.createElement('style');
  css.textContent = `
  .mem-grid{display:grid;grid-template-columns:repeat(4,1fr);gap:12px;width:min(430px,88vw)}
  .mem-tile{aspect-ratio:3/4;perspective:600px;cursor:pointer}
  .mem-in{position:relative;width:100%;height:100%;transform-style:preserve-3d;transition:transform .5s cubic-bezier(.4,1.4,.6,1)}
  .mem-tile.open .mem-in{transform:rotateY(180deg)}
  .mem-face,.mem-back{position:absolute;inset:0;backface-visibility:hidden;border-radius:14px;display:grid;place-items:center}
  .mem-back{background:linear-gradient(135deg,var(--acc),#9b6cff);box-shadow:0 4px 14px color-mix(in srgb,var(--acc) 35%,transparent),inset 0 1px 0 rgba(255,255,255,.35);border:1px solid rgba(255,255,255,.3)}
  .mem-back::after{content:"⚡";font-size:26px;opacity:.85}
  .mem-face{background:#fff;transform:rotateY(180deg);font-size:34px;box-shadow:0 3px 10px rgba(0,0,0,.1);border:1px solid var(--line)}
  .mem-tile.done .mem-face{background:linear-gradient(180deg,#f2fbf5,#e2f6ea);border-color:rgba(48,177,92,.4)}
  .mem-tile.done{animation:donePop .45s var(--ease)}
  @keyframes donePop{50%{transform:scale(1.1)}}
  .mem-score{font-size:15px;font-weight:800;color:var(--ink2);letter-spacing:2px}
  `;
  document.head.appendChild(css);

  return {
    create(c) {
      ctx = c;
      build();
      grid = document.createElement('div');
      grid.className = 'mem-grid';
      const scoreRow = document.createElement('div');
      scoreRow.className = 'mem-score';
      scoreRow.id = 'memScore';
      c.root.appendChild(scoreRow);
      c.root.appendChild(grid);
      tiles = [];
      S.cards.forEach((f, i) => {
        const t = document.createElement('div');
        t.className = 'mem-tile';
        t.innerHTML = '<div class="mem-in"><div class="mem-back"></div><div class="f mem-face"></div></div>';
        t.onclick = () => { if (canClick()) open(i); };
        grid.appendChild(t);
        tiles.push(t);
      });
      c.onMsg((k, d) => {
        if (k === 'mv' && d) {
          if (d.done) { S.over = true; const [a, b] = [S.scores[ctx.side], S.scores[1 - ctx.side]]; setTimeout(() => ctx.finish(a > b ? 'win' : a < b ? 'lose' : 'draw', '配对数 ' + a + ' : ' + b), 500); return; }
          S.turn = d.t; S.scores = d.s; S.matched = d.m;
          if (JSON.stringify(d.o) !== JSON.stringify(S.open)) {
            S.open = d.o.slice();
            S.open.forEach(i => { if (!tiles[i].classList.contains('open')) Sfx.play('pop'); });
          }
          render();
          afterTurn();
        }
      });
      c.onRestore(s => deserialize(s));
      render();
      afterTurn();
      if (c.mode === 'online' && c.side === 0) c.send('hello', null, serialize());
      return {};
    }
  };
})();
