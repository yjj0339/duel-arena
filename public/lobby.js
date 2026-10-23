'use strict';
(() => {
  const LS_ID = 'duel_identity';
  function identity() {
    let v;
    try { v = JSON.parse(localStorage.getItem(LS_ID)); } catch (e) {}
    if (!v || !v.pid) {
      v = { pid: 'p' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8), name: '' };
      localStorage.setItem(LS_ID, JSON.stringify(v));
    }
    if (!v.name) v.name = '玩家' + v.pid.slice(-4).toUpperCase();
    return v;
  }
  const me = identity();
  const $ = s => document.querySelector(s);
  const el = (t, c, h) => { const e = document.createElement(t); if (c) e.className = c; if (h != null) e.innerHTML = h; return e; };
  const host = $('#modalHost');

  function avatarColor(name) {
    const pal = ['#3478f6', '#ff9f0a', '#30b15c', '#7b5cff', '#ff375f', '#00c7be', '#ff6482', '#64a3ff'];
    let h = 0; for (const c of name) h = (h * 31 + c.charCodeAt(0)) | 0;
    return pal[Math.abs(h) % pal.length];
  }

  const catStyle = document.createElement('style');
  catStyle.textContent = `
    .lobby{max-width:1120px;margin:0 auto;padding:26px clamp(14px,3vw,30px) 80px}
    .hero{text-align:center;padding:34px 0 10px}
    .hero-badge{display:inline-flex;align-items:center;gap:6px;padding:7px 16px;border-radius:999px;font-size:12.5px;font-weight:700;letter-spacing:1.5px;background:rgba(52,120,246,.1);color:#3478f6;border:1px solid rgba(52,120,246,.2)}
    .hero h1{font-size:clamp(34px,6vw,52px);font-weight:850;letter-spacing:-1.5px;margin:16px 0 10px;background:linear-gradient(120deg,#1d1d1f 30%,#3478f6 75%,#7b5cff);-webkit-background-clip:text;background-clip:text;color:transparent}
    .hero-sub{color:var(--ink2);font-size:15px}
    .hero-actions{margin-top:22px;display:flex;gap:12px;justify-content:center}
    .cats{display:flex;gap:8px;justify-content:center;margin:30px 0 20px;flex-wrap:wrap}
    .cat{padding:8px 18px;border-radius:999px;font-size:13.5px;font-weight:650;background:rgba(120,120,128,.09);color:var(--ink2);border:1px solid transparent;transition:all .25s var(--ease)}
    .cat:hover{background:rgba(120,120,128,.16)}
    .cat.on{background:#1d1d1f;color:#fff;border-color:#1d1d1f}
    .grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(240px,1fr));gap:16px}
    .g-card{position:relative;padding:20px 18px 16px;border-radius:22px;background:var(--card);backdrop-filter:blur(24px) saturate(1.7);-webkit-backdrop-filter:blur(24px) saturate(1.7);border:1px solid rgba(255,255,255,.65);box-shadow:var(--shadow-1);cursor:pointer;transition:transform .3s var(--ease),box-shadow .3s var(--ease);animation:cardIn .55s var(--ease) backwards;overflow:hidden}
    .g-card:hover{transform:translateY(-5px);box-shadow:var(--shadow-2)}
    .g-card::after{content:"";position:absolute;inset:0;background:radial-gradient(420px 120px at 50% -40px,color-mix(in srgb,var(--ga) 14%,transparent),transparent 70%);pointer-events:none}
    @keyframes cardIn{from{transform:translateY(18px) scale(.96);opacity:0}to{transform:none;opacity:1}}
    .g-icon{width:52px;height:52px;border-radius:16px;display:grid;place-items:center;color:#fff;background:linear-gradient(135deg,var(--ga),color-mix(in srgb,var(--ga) 70%,#000));box-shadow:0 6px 18px color-mix(in srgb,var(--ga) 38%,transparent),inset 0 1px 0 rgba(255,255,255,.3)}
    .g-icon svg{width:28px;height:28px}
    .g-name{font-size:16.5px;font-weight:750;margin-top:13px;letter-spacing:-.2px}
    .g-desc{font-size:12.5px;color:var(--ink2);margin-top:3px}
    .g-cat{position:absolute;top:14px;right:14px;font-size:10.5px;font-weight:700;padding:4px 9px;border-radius:999px;background:color-mix(in srgb,var(--ga) 12%,transparent);color:var(--ga)}
    .g-play{margin-top:14px;display:flex;gap:8px}
    .g-play button{flex:1;padding:9px 0;border-radius:11px;font-size:13px;font-weight:700;transition:all .2s var(--ease)}
    .g-play .b1{background:#1d1d1f;color:#fff}
    .g-play .b1:hover{transform:translateY(-1px);box-shadow:0 6px 16px rgba(0,0,0,.2)}
    .g-play .b2{background:rgba(120,120,128,.1);color:var(--ink)}
    .g-play .b2:hover{background:rgba(120,120,128,.18)}
    .foot{text-align:center;color:var(--ink3);font-size:12.5px;margin-top:44px;line-height:1.8}
    .modal-mask{position:fixed;inset:0;z-index:200;display:grid;place-items:center;background:rgba(20,22,28,.32);backdrop-filter:blur(10px);-webkit-backdrop-filter:blur(10px);animation:fadeIn .28s var(--ease)}
    .modal{width:min(430px,calc(100vw - 40px));padding:32px 28px 26px;border-radius:26px;background:rgba(255,255,255,.92);backdrop-filter:blur(30px) saturate(1.8);-webkit-backdrop-filter:blur(30px) saturate(1.8);border:1px solid rgba(255,255,255,.85);box-shadow:var(--shadow-2);animation:modalIn .45s var(--ease)}
    @keyframes fadeIn{from{opacity:0}to{opacity:1}}
    @keyframes modalIn{from{transform:scale(.88) translateY(14px);opacity:0}to{transform:none;opacity:1}}
    .m-title{font-size:19px;font-weight:800;text-align:center;letter-spacing:-.3px}
    .m-sub{font-size:13px;color:var(--ink2);text-align:center;margin-top:6px}
    .m-actions{display:flex;flex-direction:column;gap:10px;margin-top:22px}
    .code-in{display:flex;gap:8px;justify-content:center;margin:20px 0 4px}
    .code-in input{width:48px;height:58px;text-align:center;font-size:26px;font-weight:800;border-radius:14px;border:1.5px solid var(--line);background:#fff;outline:none;transition:border .2s;caret-color:var(--acc)}
    .code-in input:focus{border-color:var(--acc);box-shadow:0 0 0 3px rgba(52,120,246,.15)}
    .name-row{display:flex;align-items:center;gap:12px;margin-top:18px;padding:12px 14px;border-radius:14px;background:rgba(120,120,128,.07)}
    .name-row .gk-av{width:40px;height:40px;font-size:16px}
    .name-row input{flex:1;border:none;background:none;outline:none;font-size:15px;font-weight:650}
    .gk-av{border-radius:50%;display:grid;place-items:center;font-weight:800;color:#fff;box-shadow:inset 0 1px 0 rgba(255,255,255,.35),0 3px 10px rgba(0,0,0,.14)}
  `;
  document.head.appendChild(catStyle);

  let curCat = '全部';
  const cats = ['全部', '棋类', '实时', '竞速', '反应'];

  function render() {
    const cw = $('#cats'); cw.innerHTML = '';
    cats.forEach(c => {
      const b = el('button', 'cat' + (c === curCat ? ' on' : ''), c + (c === '全部' ? ' ' + GAMES.length : ''));
      b.onclick = () => { curCat = c; render(); };
      cw.appendChild(b);
    });
    const gw = $('#grid'); gw.innerHTML = '';
    GAMES.filter(g => curCat === '全部' || g.cat === curCat).forEach((g, i) => {
      const card = el('div', 'g-card');
      card.style.setProperty('--ga', g.acc);
      card.style.animationDelay = (i * 30) + 'ms';
      card.innerHTML = `
        <div class="g-cat">${g.cat}</div>
        <div class="g-icon">${g.icon}</div>
        <div class="g-name">${g.name}</div>
        <div class="g-desc">${g.desc}</div>
        <div class="g-play"><button class="b1">🏠 创建房间</button><button class="b2">🤖 单机 AI</button></div>`;
      card.querySelector('.b1').onclick = e => { e.stopPropagation(); location.href = `/game.html?g=${g.id}&mode=create`; };
      card.querySelector('.b2').onclick = e => { e.stopPropagation(); location.href = `/game.html?g=${g.id}&mode=ai`; };
      card.onclick = () => location.href = `/game.html?g=${g.id}&mode=create`;
      gw.appendChild(card);
    });
  }

  function modal(html) {
    const m = el('div', 'modal-mask');
    m.innerHTML = `<div class="modal">${html}</div>`;
    m.onclick = e => { if (e.target === m) m.remove(); };
    host.appendChild(m);
    return m;
  }

  function nameModal(after) {
    const m = modal(`
      <div class="m-title">先设置你的昵称</div>
      <div class="m-sub">对手将看到这个名字</div>
      <div class="name-row">
        <div class="gk-av" style="background:linear-gradient(135deg,${avatarColor(me.name)},${avatarColor(me.name)}cc)" id="avPrev">${me.name.slice(0, 1).toUpperCase()}</div>
        <input id="nameIn" maxlength="8" value="${me.name}" placeholder="输入昵称">
      </div>
      <div class="m-actions"><button class="gk-btn big" id="okName" style="width:100%">开始对决 →</button></div>`);
    const input = m.querySelector('#nameIn');
    input.focus(); input.select();
    input.oninput = () => { m.querySelector('#avPrev').textContent = (input.value || '?').slice(0, 1).toUpperCase(); };
    const save = () => {
      me.name = (input.value.trim() || me.name).slice(0, 8);
      localStorage.setItem(LS_ID, JSON.stringify(me));
      m.remove(); after();
    };
    m.querySelector('#okName').onclick = save;
    input.onkeydown = e => { if (e.key === 'Enter') save(); };
  }

  function joinModal(prefill) {
    const m = modal(`
      <div class="m-title">加入房间</div>
      <div class="m-sub">输入 5 位房间码</div>
      <div class="code-in">${Array.from({ length: 5 }, (_, i) => `<input maxlength="1" data-i="${i}" ${i === 0 && prefill ? '' : ''}>`).join('')}</div>
      <div class="m-sub" id="joinErr" style="color:var(--bad);min-height:18px;font-weight:600"></div>
      <div class="m-actions"><button class="gk-btn big" id="doJoin" style="width:100%">加入 →</button></div>`);
    const ins = [...m.querySelectorAll('input')];
    if (prefill) prefill.split('').forEach((c, i) => { if (ins[i]) ins[i].value = c; });
    ins.forEach((inp, i) => {
      inp.oninput = () => { inp.value = inp.value.toUpperCase().replace(/[^A-Z0-9]/g, ''); if (inp.value && i < 4) ins[i + 1].focus(); };
      inp.onkeydown = e => { if (e.key === 'Backspace' && !inp.value && i > 0) ins[i - 1].focus(); if (e.key === 'Enter') m.querySelector('#doJoin').click(); };
      inp.onpaste = e => {
        const t = (e.clipboardData.getData('text') || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
        if (t.length > 1) { e.preventDefault(); t.slice(0, 5).split('').forEach((c, j) => { if (ins[j]) ins[j].value = c; }); ins[Math.min(t.length, 4)].focus(); }
      };
    });
    (prefill ? ins[Math.min(prefill.length, 4)] : ins[0]).focus();
    m.querySelector('#doJoin').onclick = async () => {
      const code = ins.map(x => x.value).join('');
      if (code.length < 5) { m.querySelector('#joinErr').textContent = '请输入完整房间码'; return; }
      const btn = m.querySelector('#doJoin');
      btn.disabled = true; btn.innerHTML = '<span class="spin"></span> 查找房间…';
      try {
        const r = await fetch('/api/lookup', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ code }) });
        const j = await r.json();
        if (!j.ok) { m.querySelector('#joinErr').textContent = j.msg || '房间不存在'; btn.disabled = false; btn.textContent = '加入 →'; return; }
        location.href = `/game.html?g=${j.game}&code=${code}&mode=join`;
      } catch (e) {
        m.querySelector('#joinErr').textContent = '网络错误，请重试';
        btn.disabled = false; btn.textContent = '加入 →';
      }
    };
  }

  $('#btnJoin').onclick = () => {
    if (!me.name) nameModal(() => joinModal());
    else joinModal();
  };

  const qs = new URLSearchParams(location.search);
  if (qs.get('g') && qs.get('code')) {
    const g = GAMES.find(x => x.id === qs.get('g'));
    const code = qs.get('code').toUpperCase();
    const m = modal(`
      <div class="m-title">${g ? g.name : '好友'} 邀请你对决</div>
      <div class="m-sub">房间码 <b style="letter-spacing:2px">${code}</b></div>
      <div class="m-actions"><button class="gk-btn big" id="acc" style="width:100%">⚔️ 接受挑战</button></div>`);
    m.querySelector('#acc').onclick = () => {
      if (!me.name) nameModal(() => { location.href = `/game.html?g=${qs.get('g')}&code=${code}&mode=join`; });
      else location.href = `/game.html?g=${qs.get('g')}&code=${code}&mode=join`;
    };
  }

  render();
})();
