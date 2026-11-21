/* ExoLens front end — a small single-page app (Search, Browse, How it works, About, and the planet page).
   The only thing a visitor ever types is a planet name; everything else is clicked. */
(function () {
  'use strict';
  const $ = (s, el = document) => el.querySelector(s);
  const $$ = (s, el = document) => [...el.querySelectorAll(s)];
  const view = $('#view');
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  const TYPE_COLOR = { 'Terrestrial': '#a9b4ff', 'Super-Earth': '#c9a8ff', 'Sub-Neptune': '#ff93c1', 'Neptune-like': '#ff9f7a',
                       'Gas Giant': '#ffc46b', 'Hot Jupiter': '#ffe9a8', 'Unknown': '#c4bdd3' };
  const JUPITER_MASS = 317.83, JUPITER_RADIUS = 11.21, EARTH_DENSITY = 5.51, SUN_TEFF = 5772;
  const METHODS = {
    'Transit': 'by transit: watching for the small dip in a star’s light when a planet passes in front of it',
    'Radial Velocity': 'by radial velocity: measuring the tiny wobble a planet causes in its star',
    'Microlensing': 'by microlensing: noticing a planet’s gravity briefly magnify the light of a faraway star',
    'Imaging': 'by direct imaging: taking a picture of the planet itself',
    'Transit Timing Variations': 'from transit timing: spotting small changes in when a planet’s transits happen',
    'Eclipse Timing Variations': 'from eclipse timing: spotting small changes in the timing of a star system’s eclipses',
    'Orbital Brightness Modulation': 'from small changes in a star’s brightness as its planet orbits',
    'Pulsar Timing': 'by pulsar timing: noticing tiny changes in the regular pulses of a pulsar',
    'Astrometry': 'by astrometry: measuring the tiny sideways motion of a star',
    'Pulsation Timing Variations': 'from pulsation timing: spotting changes in a pulsating star’s rhythm',
    'Disk Kinematics': 'from the motion of gas in the disk around a young star',
  };

  let meta = null, kinds = [], universe = null, current = null, typeFilter = null, reqId = 0;

  /* ---------- helpers ---------- */
  const SUP = { '0': '⁰', '1': '¹', '2': '²', '3': '³', '4': '⁴', '5': '⁵', '6': '⁶', '7': '⁷', '8': '⁸', '9': '⁹', '-': '⁻' };
  function num(v, sig = 3) {
    if (v === null || v === undefined || Number.isNaN(v)) return null;
    if (Math.abs(v) >= 1e6) { const [m, e] = v.toExponential(1).split('e'); return `${m} × 10${[...String(parseInt(e, 10))].map((c) => SUP[c] || c).join('')}`; }
    return Number(v.toPrecision(sig)).toLocaleString('en-US', { maximumFractionDigits: 6 }).replace('-', '−');
  }
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const color = (t) => TYPE_COLOR[t] || TYPE_COLOR.Unknown;
  const earths = (v) => `${num(v)} ${Number(v.toPrecision(3)) === 1 ? 'Earth' : 'Earths'}`;
  const SPARK = '<svg class="spark" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 0C12.9 7.2 16.8 11.1 24 12C16.8 12.9 12.9 16.8 12 24C11.1 16.8 7.2 12.9 0 12C7.2 11.1 11.1 7.2 12 0Z"/></svg>';
  const GLASS = '<svg class="glass-icon" viewBox="0 0 24 24" width="22" height="22" aria-hidden="true"><circle cx="10.5" cy="10.5" r="6.5" fill="none" stroke="currentColor" stroke-width="2"/><path d="M15.5 15.5 21 21" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>';

  async function api(path) {
    const r = await fetch(path);
    const body = await r.json().catch(() => ({}));
    if (!r.ok) { const e = new Error('api'); e.status = r.status; e.body = body; throw e; }
    return body;
  }
  const go = (name) => { const t = '#/planet/' + encodeURIComponent(name); if (location.hash === t) route(); else location.hash = t; };

  /* ---------- search boxes (hero + header) ---------- */
  function bindSearch(form) {
    const input = $('input', form), sug = $('.sug', form);
    let items = [], active = -1, timer = null;
    const close = () => { sug.hidden = true; input.setAttribute('aria-expanded', 'false'); input.removeAttribute('aria-activedescendant'); active = -1; };
    async function suggest() {
      const q = input.value.trim(); if (!q) { close(); return; }
      try {
        const res = await api('/api/search?q=' + encodeURIComponent(q));
        if (q !== input.value.trim()) return;
        items = res; active = -1; sug.innerHTML = '';
        if (!items.length) sug.innerHTML = `<li class="s-none">No planet matches “${esc(q)}”. Check the spelling.</li>`;
        items.forEach((it, i) => {
          const li = document.createElement('li'); li.id = `${input.id}-opt${i}`; li.setAttribute('role', 'option');
          li.innerHTML = `<span class="s-name">${esc(it.name)}</span><span class="s-meta">${esc(it.type)}</span>`;
          li.addEventListener('mousedown', (e) => { e.preventDefault(); close(); go(it.name); });
          sug.appendChild(li);
        });
        sug.hidden = false; input.setAttribute('aria-expanded', 'true');
      } catch (e) { close(); }
    }
    function move(d) {
      if (sug.hidden || !items.length) { suggest(); return; }
      active = (active + d + items.length) % items.length;
      [...sug.children].forEach((li, i) => li.setAttribute('aria-selected', String(i === active)));
      input.setAttribute('aria-activedescendant', `${input.id}-opt${active}`);
    }
    input.addEventListener('input', () => { clearTimeout(timer); timer = setTimeout(suggest, 110); });
    input.addEventListener('focus', () => { if (input.value.trim()) suggest(); });
    input.addEventListener('keydown', (e) => {
      if (e.key === 'ArrowDown') { e.preventDefault(); move(1); } else if (e.key === 'ArrowUp') { e.preventDefault(); move(-1); } else if (e.key === 'Escape') close();
    });
    document.addEventListener('click', (e) => { if (!form.contains(e.target)) close(); });
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      const picked = active >= 0 ? items[active] : null;     // read the highlighted suggestion before closing the list
      close();
      if (picked) { go(picked.name); return; }
      const v = input.value.trim(); if (v) go(v);
    });
    form.exoClose = close;
  }
  const mini = $('#miniSearch'); bindSearch(mini);
  document.addEventListener('keydown', (e) => {
    if (e.key === '/' && !/INPUT|TEXTAREA/.test(document.activeElement.tagName) && !e.metaKey && !e.ctrlKey) {
      e.preventDefault(); const t = $('#qHero') || $('#qMini'); if (t && t.offsetParent !== null) { t.focus(); t.select(); }
    }
  });

  /* ---------- menu (small screens) ---------- */
  const menuBtn = $('#menuBtn');
  menuBtn.addEventListener('click', () => { const open = document.body.classList.toggle('menu-open'); menuBtn.setAttribute('aria-expanded', String(open)); });
  $('#nav').addEventListener('click', (e) => { if (e.target.closest('a')) closeMenu(); });
  function closeMenu() { document.body.classList.remove('menu-open'); menuBtn.setAttribute('aria-expanded', 'false'); }
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeMenu(); });

  /* ---------- router ---------- */
  function parse() {
    const parts = location.hash.replace(/^#\/?/, '').split('/');
    const first = decodeURIComponent(parts[0] || ''); const rest = parts.slice(1).map(decodeURIComponent).join('/');
    if (!first) return { v: 'home' };
    if (first === 'planet') return { v: 'planet', name: rest };
    if (first === 'explore') return { v: 'explore', kind: rest || null };
    if (first === 'guide') return { v: 'guide' };
    if (first === 'about') return { v: 'about' };
    return { v: 'planet', name: [first, rest].filter(Boolean).join('/') };
  }
  function setView(html, key, title) {
    view.innerHTML = html;
    view.classList.remove('view-in'); void view.offsetWidth; view.classList.add('view-in');
    document.title = title ? `${title} — ExoLens` : 'ExoLens — look up any planet beyond our Sun';
    document.body.classList.toggle('is-home', key === 'home');
    $$('[data-nav]').forEach((a) => { const on = a.dataset.nav === (key === 'planet' ? 'home' : key); if (on) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current'); });
    if (window.ExoBG) window.ExoBG.setMood(key === 'home' ? 0.22 : 0.5);
    window.scrollTo({ top: 0, behavior: 'auto' }); closeMenu(); mini.exoClose();
  }
  function route() {
    const r = parse();
    if (r.v === 'home') return homeView();
    if (r.v === 'explore') return exploreView(r.kind);
    if (r.v === 'guide') return guideView();
    if (r.v === 'about') return aboutView();
    return planetView(r.name);
  }
  window.addEventListener('hashchange', route);
  view.addEventListener('click', (e) => {
    const g = e.target.closest('[data-go]'); if (g) { go(g.dataset.go); return; }
    if (e.target.closest('[data-random]')) { surprise(); return; }
    const sc = e.target.closest('[data-scroll]'); if (sc) { const t = document.getElementById(sc.dataset.scroll); if (t) t.scrollIntoView({ behavior: reduceMotion ? 'auto' : 'smooth', block: 'start' }); }
  });
  async function surprise() { try { const p = await api('/api/random'); go(p.name); } catch (e) { /* ignore */ } }
  $('.brand').addEventListener('click', () => { if (location.hash === '' || location.hash === '#/') route(); });

  const noServer = () => `<div class="notice" role="alert"><strong>ExoLens can’t reach its server.</strong> Start it from the project folder with <code>python webapp/app.py</code>, then reload this page.</div>`;

  /* ---------- HOME ---------- */
  function homeView() {
    const chips = (meta.featured || []).map((f) => `<button type="button" class="chip" data-go="${esc(f.name)}">${esc(f.name)}<small>${esc(f.type)}</small></button>`).join('');
    setView(`
      <section class="hero">
        <div>
          <p class="script hero-script-a">Look up</p>
          <h1>Any Planet</h1>
          <p class="script hero-script-b">and see what it weighs</p>
          <p class="lead">ExoLens is a lookup tool for ${meta.planets.toLocaleString('en-US')} confirmed planets that orbit other stars. Type a planet’s name to see its facts and a computer model’s estimate of how heavy it is.</p>
          <form class="sform" id="heroSearch" role="search" autocomplete="off">
            <label class="sr-only" for="qHero">Planet name</label>
            <div class="field">${GLASS}
              <input id="qHero" type="text" inputmode="search" spellcheck="false" placeholder="Type a planet name, like Kepler-22 b" role="combobox" aria-expanded="false" aria-autocomplete="list" aria-haspopup="listbox">
              <button class="btn" type="submit">Look up</button>
            </div>
            <ul class="sug" role="listbox" hidden></ul>
          </form>
          <p class="tipline">Tip: you only ever type a name. Everything else on this site is something you click.</p>
          <div class="try">
            <span class="try-label">Not sure what to type? Click one of these:</span>
            <div class="chips chips--scroll">${chips}<button type="button" class="chip chip--plain" data-random>Surprise me</button></div>
          </div>
        </div>
        <aside class="glass halftone hero-card" aria-hidden="true">
          <div class="tl"><span class="script">Mass</span><p>estimated by<br>a model</p></div>
          <svg class="big-star" viewBox="0 0 24 24"><path d="M12 0C12.9 7.2 16.8 11.1 24 12C16.8 12.9 12.9 16.8 12 24C11.1 16.8 7.2 12.9 0 12C7.2 11.1 11.1 7.2 12 0Z"/></svg>
          <div class="br"><span class="n">${meta.planets.toLocaleString('en-US')}</span><p>confirmed planets<br>to look up</p></div>
        </aside>
      </section>

      <section class="sec" aria-labelledby="h-how">
        <h2 class="sec-title" id="h-how"><span class="script">How it</span> works</h2>
        <p class="sec-sub">Three steps. No sign-up, nothing to install, nothing to type except a planet’s name.</p>
        <ol class="steps">
          <li class="glass"><span class="num" aria-hidden="true">1</span><h3>Type a planet’s name</h3><p>Start typing, for example “Kepler-22 b”. A list of matching planets appears. Click the one you want.</p></li>
          <li class="glass"><span class="num" aria-hidden="true">2</span><h3>See what is known about it</h3><p>You get its size, how long its year is, its star, and how it was found, all explained in plain words.</p></li>
          <li class="glass"><span class="num" aria-hidden="true">3</span><h3>Read the model’s estimate</h3><p>A machine-learning model, trained on planets whose weight has been measured, estimates how heavy this one is.</p></li>
        </ol>
      </section>

      <section class="sec" aria-labelledby="h-kinds">
        <h2 class="sec-title" id="h-kinds"><span class="script">Or browse</span> by kind</h2>
        <p class="sec-sub">Planets are grouped by how wide they are. Click a kind to see real examples.</p>
        <div class="kinds">${kinds.map((k) => `
          <a class="kind" href="#/explore/${encodeURIComponent(k.name)}">
            <h3><span class="dot" style="--c:${color(k.name)}"></span>${esc(k.name)}</h3>
            <span class="count">${k.count.toLocaleString('en-US')} planets</span>
            <span class="rule">${esc(k.rule)}</span>
            <p>${esc(k.about)}</p>
            <span class="eg">Example: ${esc(k.example)}</span>
          </a>`).join('')}</div>
      </section>

      <section class="sec" aria-labelledby="h-know">
        <h2 class="sec-title" id="h-know"><span class="script">Good</span> to know</h2>
        <div class="know">
          <div><h3>What is an exoplanet?</h3><p>A planet that orbits a star other than our Sun. Astronomers have confirmed more than six thousand so far.</p></div>
          <div><h3>What does “Earths” mean?</h3><p>Planets are weighed in Earths. 1 is the Earth itself, 17 is about Neptune, and 318 is Jupiter.</p></div>
          <div><h3>Is the estimate exact?</h3><p>No. It is a well-informed guess shown with a range. The About page explains how good it is and where it can be wrong.</p></div>
        </div>
      </section>

      <section class="glass halftone cta">
        <span class="script">Ready?</span>
        <h2>Pick a planet and see what it weighs.</h2>
        <div class="row">
          <button type="button" class="btn" data-scroll="qHero-top">Search by name</button>
          <button type="button" class="btn btn--ghost" data-random>Surprise me</button>
          <a class="btn btn--ghost" href="#/guide">How to read the results</a>
        </div>
      </section>`, 'home');
    const top = document.createElement('span'); top.id = 'qHero-top'; $('.hero').before(top);
    bindSearch($('#heroSearch'));
    $('[data-scroll="qHero-top"]').addEventListener('click', (e) => { e.stopPropagation(); window.scrollTo({ top: 0, behavior: reduceMotion ? 'auto' : 'smooth' }); setTimeout(() => $('#qHero').focus(), 350); });
  }

  /* ---------- gauge (used on planet pages and the guide) ---------- */
  const G_MIN = -1, G_MAX = 3.7;
  const gpos = (v) => Math.max(0, Math.min(100, ((Math.log10(v) - G_MIN) / (G_MAX - G_MIN)) * 100));
  function gaugeHTML(pr, kind) {
    const hasReal = pr.measured != null && kind !== 'estimated';
    return `<div class="gauge" data-gauge data-lo="${pr.low}" data-hi="${pr.high}" data-v="${pr.value}">
      <p class="g-head">Most likely between <strong>${num(pr.low)}</strong> and <strong>${num(pr.high)}</strong> Earths.</p>
      <div class="g-track">
        <div class="g-band" style="left:0;width:0"></div>
        <div class="g-pin" style="left:0">model: ${num(pr.value)}</div>
        ${hasReal ? `<div class="g-pin g-pin--real" style="left:${gpos(pr.measured)}%"><i class="stem"></i><span>${kind === 'minimum' ? 'minimum' : 'measured'}: ${num(pr.measured)}</span></div>` : ''}
      </div>
      <div class="g-ticks ${hasReal ? 'has-real' : ''}">
        ${[[1, 'Earth'], [17.15, 'Neptune'], [95.16, 'Saturn'], [317.83, 'Jupiter']].map(([v, n]) => `<div class="g-tick" style="left:${gpos(v)}%"><i></i><b>${n}</b></div>`).join('')}
      </div>
    </div>`;
  }
  function animateGauge(root) {
    $$('[data-gauge]', root).forEach((g) => {
      const lo = gpos(+g.dataset.lo), hi = gpos(+g.dataset.hi), mid = gpos(+g.dataset.v);
      const band = $('.g-band', g), pin = $('.g-pin', g);
      band.style.left = lo + '%'; band.style.width = Math.max(1.2, hi - lo) + '%'; pin.style.left = mid + '%';
      if (mid > 80) pin.style.transform = 'translateX(-85%)'; else if (mid < 12) pin.style.transform = 'translateX(-15%)';
    });
  }
  function countUp(el) {
    const target = +el.dataset.v; if (reduceMotion || !isFinite(target)) { el.textContent = num(target); return; }
    const start = performance.now(), dur = 1100;
    (function tick(now) { const t = Math.min(1, (now - start) / dur), e = 1 - Math.pow(1 - t, 4); el.textContent = num(target * e) || '0'; if (t < 1) requestAnimationFrame(tick); else el.textContent = num(target); })(start);
  }

  /* ---------- PLANET ---------- */
  function fact(label, what, value, unit, small) {
    if (value === null || value === undefined) return `<dt>${label}<span class="what">${what}</span></dt><dd class="na">not measured yet</dd>`;
    return `<dt>${label}<span class="what">${what}</span></dt><dd>${value}${unit ? `<span class="unit">${unit}</span>` : ''}${small ? `<small>${small}</small>` : ''}</dd>`;
  }
  function plainWords(p) {
    const kind = p.type === 'Unknown' ? 'planet of unknown kind' : `${p.type} planet`;
    const ly = p.light_years ? `, about <strong>${num(p.light_years, 3)} light-years</strong> from Earth` : '';
    const m = METHODS[p.method] || `using the ${esc((p.method || 'unknown').toLowerCase())} method`;
    const when = p.year ? ` in ${p.year}` : '';
    const sib = p.siblings.length ? ` It has ${p.siblings.length} known ${p.siblings.length === 1 ? 'sibling' : 'siblings'} around the same star.` : ' It is the only planet known around its star so far.';
    return `<p class="plain-words"><strong>${esc(p.name)}</strong> is a ${esc(kind)} orbiting the star <strong>${esc(p.host)}</strong>${ly}. Astronomers found it${when} ${m}.${sib}</p>`;
  }

  async function planetView(name) {
    const my = ++reqId;
    setView(`<div class="loading" role="status">${SPARK}<p>Looking up ${esc(name)}…</p></div>`, 'planet', name);
    let p;
    try { p = await api('/api/planet?name=' + encodeURIComponent(name)); }
    catch (e) {
      if (my !== reqId) return;
      if (e.status === 404) {
        const s = (e.body && e.body.suggestions) || [];
        setView(`<div class="notice" role="alert"><strong>No planet is called “${esc(name)}”.</strong> ${s.length ? 'Did you mean one of these?' : 'Check the spelling, or type a few letters in the search box and pick a name from the list.'}
          ${s.length ? `<div class="chips">${s.map((n) => `<button type="button" class="chip chip--plain" data-go="${esc(n)}">${esc(n)}</button>`).join('')}</div>` : ''}
          <div class="chips"><a class="btn btn--ghost" href="#/explore">Browse all planets</a></div></div>`, 'planet', 'Planet not found');
      } else setView(noServer(), 'planet', 'Server problem');
      return;
    }
    if (my !== reqId) return;
    current = p; typeFilter = null;
    renderPlanet(p);
  }

  function renderPlanet(p) {
    const ph = p.physical, o = p.orbit, st = p.star, sy = p.system;
    const massKind = { measured: 'measured', minimum: 'a minimum, not the exact mass', estimated: 'calculated from its size, not measured' }[ph.mass_kind] || '';
    const periodSmall = o.period === null ? null : (o.period >= 730 ? `${num(o.period / 365.25)} Earth years` : o.period < 1 ? `${num(o.period * 24)} hours` : `Earth’s year is 365 days`);
    const radiusSmall = ph.radius === null ? null : `${num(ph.radius / JUPITER_RADIUS, 2)} × Jupiter’s width`;
    const densSmall = ph.density === null ? null : (ph.density_physical === false ? 'this catalog value is not physically plausible' : `${num(ph.density / EARTH_DENSITY, 2)} × Earth’s (Earth is 5.5)`);
    const rank = p.rank.radius === null ? '' : `<li class="plain">Wider than ${Math.round(p.rank.radius)}% of known planets</li>`;
    let hint = false; try { hint = !localStorage.getItem('exolens_hint'); } catch (e) { hint = true; }

    setView(`
      <div class="crumbs"><a class="back" href="#/">← Search another planet</a><a class="back" href="#/explore/${encodeURIComponent(p.type)}">More ${esc(p.type)} planets</a></div>

      <header class="p-head reveal">
        <p class="script host">orbiting ${p.siblings.length ? `<button type="button" class="link" data-scroll="sibs">${esc(p.host)}</button>` : esc(p.host)}</p>
        <div class="pname-clip"><h1 class="pname">${esc(p.name)}</h1></div>
        <ul class="tags">
          <li class="tag-type" style="--c:${color(p.type)}"><span class="dot"></span>${esc(p.type)}</li>
          <li class="plain">Found in ${esc(p.year ?? 'an unknown year')}</li>
          ${rank}
        </ul>
        ${plainWords(p)}
      </header>

      ${hint ? `<div class="newhere" id="newhere"><p><strong>New here?</strong> This page shows one planet. First comes the computer’s estimate of its mass, then its size, the facts, and where it sits among all known planets.</p><a class="btn btn--ghost" href="#/guide">How to read this page</a><button type="button" class="x" id="hintX">Got it</button></div>` : ''}

      <section class="sec" aria-labelledby="h-est" style="margin-top:2.2rem">
        <h2 class="sec-title" id="h-est"><span class="script">Estimated</span> mass</h2>
        <p class="sec-sub">What a computer model thinks this planet weighs, based on its size, its orbit and its star.</p>
        ${predictionHTML(p)}
      </section>

      ${sizesHTML(p)}

      <section class="sec" aria-labelledby="h-facts">
        <h2 class="sec-title" id="h-facts"><span class="script">The</span> facts</h2>
        <p class="sec-sub">Everything astronomers have recorded about ${esc(p.name)}, with a short note on what each item means.</p>
        <div class="facts">
          <section><h3>The planet</h3><dl>
            ${fact('Width', 'How wide it is, in Earths', num(ph.radius), ph.radius === null ? '' : (ph.radius === 1 ? 'Earth' : 'Earths'), radiusSmall)}
            ${fact('Mass', 'How heavy it is', ph.mass === null ? null : num(ph.mass), ph.mass === null ? '' : 'Earths', massKind)}
            ${fact('Density', 'How tightly packed it is', num(ph.density), 'g/cm³', densSmall)}
            ${fact('Temperature', 'Rough heat from starlight alone', num(ph.temp), 'K', ph.temp === null ? null : `${num(ph.temp - 273.15, 3)} °C (Earth averages about 15 °C)`)}
            ${fact('Starlight received', 'How much light hits it, compared with Earth', num(ph.insol), '× Earth', null)}
          </dl></section>
          <section><h3>Its orbit</h3><dl>
            ${fact('Length of a year', 'Time to go around its star once', num(o.period), 'days', periodSmall)}
            ${fact('Distance from its star', 'How far away it orbits', num(o.smax), 'AU', o.smax === null ? null : 'Earth is 1 AU from the Sun')}
            ${fact('Orbit shape', 'How stretched the orbit is', num(o.ecc), '', o.ecc === null ? null : '0 is a perfect circle; near 1 is a long oval')}
          </dl></section>
          <section><h3>Its star</h3><dl>
            ${fact('Star temperature', 'How hot the star is', num(st.teff), 'K', st.teff === null ? null : `The Sun is ${SUN_TEFF.toLocaleString('en-US')} K`)}
            ${fact('Star width', 'Compared with the Sun', num(st.radius), '× Sun', null)}
            ${fact('Star mass', 'Compared with the Sun', num(st.mass), '× Sun', null)}
            ${fact('Heavy elements', 'How rich the star is in them', st.met === null ? null : (st.met > 0 ? '+' : '') + num(st.met), 'dex', st.met === null ? null : '0 matches the Sun')}
            ${fact('Distance from Earth', 'How far away it is from us', num(st.dist), 'parsecs', st.dist === null ? null : `${num(st.dist * 3.2616, 3)} light-years`)}
          </dl></section>
          <section><h3>The system</h3><dl>
            ${fact('Stars', 'In this system', sy.stars === null ? null : num(sy.stars), '', null)}
            ${fact('Known planets', 'Found around this star so far', sy.planets === null ? null : num(sy.planets), '', null)}
            ${fact('Discovered', 'When and where it was found', p.year === null ? null : String(p.year), '', p.facility ? esc(p.facility) : null)}
            ${fact('Method', 'How it was spotted', esc(p.method), '', null)}
          </dl></section>
        </div>
      </section>

      ${p.siblings.length ? `<section class="sec" id="sibs" aria-labelledby="h-sibs">
        <h2 class="sec-title" id="h-sibs"><span class="script">Same</span> system</h2>
        <p class="sec-sub">Other planets known around ${esc(p.host)}. Click one to open it.</p>
        <div class="sibs">${p.siblings.map((s) => `<button type="button" class="sib" data-go="${esc(s.name)}"><span class="dot" style="--c:${color(s.type)}"></span>${esc(s.name)}<small>${s.radius !== null ? num(s.radius, 2) + ' Earths wide' : esc(s.type)}</small></button>`).join('')}</div>
      </section>` : ''}

      <div class="context">
        <section aria-labelledby="h-map">
          <h2 class="sec-title" id="h-map"><span class="script">Where</span> it sits</h2>
          <p class="sec-sub" id="plotSub">A map of every known planet. Each dot is one planet, placed by how long its year is (left to right) and how wide it is (bottom to top). ${esc(p.name)} is the glowing one.</p>
          <details class="help"><summary>How do I read this map?</summary><div class="body"><p>Dots further right orbit more slowly: their “year” is longer. Dots higher up are wider planets. Colours show the kind of planet.</p><p>Hover over a dot to see its name and click it to open that planet. Use the coloured buttons below to highlight one kind.</p></div></details>
          <div class="plot-wrap glass"><canvas id="plot" role="img" aria-label="Map of all planets by orbital period and width, with ${esc(p.name)} highlighted"></canvas></div>
          <div class="legend" id="legend"></div>
        </section>
        <section class="similar" aria-labelledby="h-sim">
          <h2 class="sec-title" id="h-sim"><span class="script">Similar</span> worlds</h2>
          <p class="sec-sub">Planets with the closest size, orbit and star. Click one to open it.</p>
          <ol>${p.similar.map((s) => `
            <li><button type="button" data-go="${esc(s.name)}">
              <span class="nm"><span class="dot" style="--c:${color(s.type)}"></span>${esc(s.name)}</span>
              <span class="ms">${s.mass !== null ? earths(s.mass) : 'mass unknown'}</span>
              <span class="ty">${esc(s.type)}, ${num(s.radius, 2)} Earth ${s.radius === 1 ? 'width' : 'widths'}</span>
            </button></li>`).join('')}</ol>
        </section>
      </div>

      <section class="glass halftone cta">
        <span class="script">Keep exploring</span>
        <h2>Look up another planet.</h2>
        <div class="row"><a class="btn" href="#/">Search by name</a><button type="button" class="btn btn--ghost" data-random>Surprise me</button><a class="btn btn--ghost" href="#/explore">Browse by kind</a></div>
      </section>`, 'planet', p.name);

    const x = $('#hintX'); if (x) x.addEventListener('click', () => { try { localStorage.setItem('exolens_hint', '1'); } catch (e) { /* ignore */ } $('#newhere').remove(); });
    buildLegend();
    requestAnimationFrame(() => { animateGauge(view); const n = $('#bigN'); if (n) countUp(n); startPlot(p); });
  }

  function predictionHTML(p) {
    const pr = p.prediction, ph = p.physical;
    if (!pr.available) {
      return `<div class="predict glass" style="grid-template-columns:1fr"><div><p class="ask">There is no estimate for this planet.</p>
        <p style="margin-top:.7rem;font-size:1.25rem;max-width:52ch;color:var(--soft)">${esc(pr.reason)} Without a width, the model has nothing reliable to work from, so it stays quiet rather than guess.</p></div></div>`;
    }
    let compare = '';
    const verdict = (e) => { const a = Math.abs(e); return a < 10 ? 'within 10% of it' : `${num(a, 2)}% ${e > 0 ? 'higher' : 'lower'}`; };
    if (ph.mass_kind === 'measured' && pr.measured != null) compare = `<p>Measured mass: <strong>${earths(pr.measured)}</strong>. The model’s estimate is <strong>${verdict(pr.error_pct)}</strong>.</p>`;
    else if (ph.mass_kind === 'minimum' && pr.measured != null) compare = `<p>Measured minimum mass: <strong>${earths(pr.measured)}</strong>. The true mass can only be this or more. The model’s estimate is <strong>${verdict(pr.error_pct)}</strong>.</p>`;
    else if (ph.mass_kind === 'estimated') compare = `<p>The catalog lists ${earths(ph.mass)}, but that figure was calculated from the planet’s width, not measured, so it is not a fair answer to compare with.</p>`;
    else compare = `<p>Nobody has measured this planet’s mass yet, so this is a first estimate.</p>`;
    compare += pr.in_training ? `<p>This planet’s measured mass was part of the model’s training data, so the estimate above comes from a copy of the model that never saw it. That keeps the comparison fair.</p>` : `<p>This planet was not in the training data.</p>`;
    if (pr.imputed_count > 0) compare += `<p class="warn">${pr.imputed_count} of the 9 inputs were missing and replaced by typical values, so treat this estimate loosely.</p>`;
    const jup = pr.value / JUPITER_MASS;
    const inputs = pr.inputs.map((i) => `<li class="${i.imputed ? 'filled' : ''}"><span>${esc(i.label)}</span><b>${num(i.value, 3)} ${esc(i.unit)}</b>${i.imputed ? '<em>missing, so a typical value was used</em>' : ''}</li>`).join('');
    return `
      <div class="predict glass halftone">
        <div>
          <p class="ask"><span class="script">The model’s</span> estimate</p>
          <div class="bignum"><span class="n" id="bigN" data-v="${pr.value}">${num(pr.value)}</span><span class="u">Earths</span></div>
          <p class="jup">${jup >= 0.01 ? `about ${num(jup, 2)} Jupiters` : `about ${num(jup, 2)} Jupiters, a very light world`}</p>
          <div class="compare">${compare}</div>
        </div>
        <div>
          ${gaugeHTML(pr, ph.mass_kind)}
          <p class="g-note">The shaded band is the model’s typical margin: on planets it had not seen, the true mass landed inside a band like this 8 times out of 10. The scale is logarithmic, so each step to the right is a big jump in weight.</p>
          <details class="help"><summary>How was this estimate made?</summary><div class="body"><p>A computer model learned from ${meta.trained_on.toLocaleString('en-US')} planets whose mass astronomers have actually measured. It found patterns linking a planet’s width, orbit and star to its weight.</p><p>For ${esc(p.name)} it looked at the 9 facts listed below and produced the number on the left. It is a guess with a range, not a measurement.</p></div></details>
        </div>
        <details class="inputs"><summary>What the model looked at</summary><ul class="input-list">${inputs}</ul></details>
      </div>`;
  }

  function sizesHTML(p) {
    const r = p.physical.radius; if (r === null) return '';
    const scale = 60 / Math.max(r, JUPITER_RADIUS), c = color(p.type);
    const orb = (rad, bg, label) => { const d = Math.max(5, 2 * rad * scale); return `<div><span style="display:block;width:${d}px;height:${d}px;border-radius:50%;background:${bg};box-shadow:0 0 ${Math.min(34, d / 3)}px rgba(255,255,255,.2)"></span><span class="lbl">${label}</span></div>`; };
    return `<section class="sec" aria-labelledby="h-size"><h2 class="sec-title" id="h-size"><span class="script">Size</span> up close</h2>
      <p class="sec-sub">How wide ${esc(p.name)} is next to Earth and Jupiter, drawn to the same scale.</p>
      <figure class="sizes glass">
        <div class="orbs">
          ${orb(1, 'radial-gradient(circle at 32% 30%, #dfe4ff, #5b6dff 60%, #1b1a6b)', 'Earth')}
          ${orb(r, `radial-gradient(circle at 32% 30%, #fff, ${c} 55%, #3a0a4f)`, esc(p.name))}
          ${orb(JUPITER_RADIUS, 'radial-gradient(circle at 32% 30%, #fff1c9, #e09a3a 55%, #6b2a12)', 'Jupiter')}
        </div>
        <figcaption>${esc(p.name)} is ${r < 1 ? 'smaller than' : 'about'} <strong>${num(r)} ${r === 1 ? 'Earth' : 'Earths'}</strong> wide. Jupiter, the biggest planet in our solar system, is 11.2 Earths wide.</figcaption>
      </figure></section>`;
  }

  /* ---------- map of all planets ---------- */
  const XR = [-0.6, 5.2], YR = [-0.5, 1.65], PAD = { l: 58, r: 14, t: 14, b: 48 };
  let plot = null, pulse = null, hoverIdx = -1;
  const FONT = (w) => `${w} 15px "Outfit", system-ui, sans-serif`;
  function buildLegend() {
    const lg = $('#legend'); lg.innerHTML = '<span class="lg-label">Highlight one kind of planet:</span>';
    meta.types.filter((t) => t !== 'Unknown').forEach((t) => {
      const b = document.createElement('button'); b.type = 'button'; b.setAttribute('aria-pressed', 'false');
      b.innerHTML = `<span class="dot" style="--c:${color(t)}"></span>${t}`;
      b.addEventListener('click', () => {
        typeFilter = typeFilter === t ? null : t;
        $$('button', lg).forEach((x) => x.setAttribute('aria-pressed', String(x === b && typeFilter === t)));
        lg.classList.toggle('has-pick', typeFilter !== null); redraw();
      });
      lg.appendChild(b);
    });
  }
  function startPlot(p) {
    const cv = $('#plot'); if (!cv || !universe) return;
    plot = { cv, ctx: cv.getContext('2d'), p };
    const pp = p.position, outside = pp.x === null || pp.y === null || pp.x < XR[0] || pp.x > XR[1] || pp.y < YR[0] || pp.y > YR[1];
    if (outside) $('#plotSub').textContent += pp.x === null ? ' This planet has no known period or width, so it cannot be placed.' : ' This planet sits beyond the edge of the map, so its marker is pinned to the border.';
    pulse = performance.now();
    cv.onpointermove = onMove; cv.onpointerleave = () => { hoverIdx = -1; $('#tip').hidden = true; redraw(); }; cv.onclick = onClick;
    resizePlot(); (function loop(now) { if (!plot || plot.cv !== cv) return; redraw(now); if (!reduceMotion && now - pulse < 3200) requestAnimationFrame(loop); })(performance.now());
  }
  function resizePlot() { if (!plot) return; const dpr = window.devicePixelRatio || 1, r = plot.cv.getBoundingClientRect(); plot.cv.width = Math.round(r.width * dpr); plot.cv.height = Math.round(r.height * dpr); plot.dpr = dpr; plot.w = r.width; plot.h = r.height; }
  window.addEventListener('resize', () => { if (plot && document.body.contains(plot.cv)) { resizePlot(); redraw(); } });
  const sx = (x) => PAD.l + ((x - XR[0]) / (XR[1] - XR[0])) * (plot.w - PAD.l - PAD.r);
  const sy = (y) => plot.h - PAD.b - ((y - YR[0]) / (YR[1] - YR[0])) * (plot.h - PAD.t - PAD.b);
  function redraw(now) {
    if (!plot || !universe || !document.body.contains(plot.cv)) return;
    const { ctx, dpr, w, h } = plot;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.clearRect(0, 0, w, h);
    ctx.font = FONT(400); ctx.fillStyle = 'rgba(255,255,255,.82)'; ctx.strokeStyle = 'rgba(255,255,255,.12)'; ctx.lineWidth = 1;
    ctx.textAlign = 'center'; ctx.textBaseline = 'top';
    [[0, '1 day'], [1, '10'], [2, '100'], [3, '1,000'], [4, '10,000'], [5, '100,000']].forEach(([v, l]) => { const X = sx(v); ctx.beginPath(); ctx.moveTo(X, PAD.t); ctx.lineTo(X, h - PAD.b); ctx.stroke(); ctx.fillText(l, X, h - PAD.b + 8); });
    ctx.textAlign = 'right'; ctx.textBaseline = 'middle';
    [[0.5, '0.5'], [1, '1'], [2, '2'], [4, '4'], [8, '8'], [16, '16'], [32, '32']].forEach(([v, l]) => { const Y = sy(Math.log10(v)); ctx.beginPath(); ctx.moveTo(PAD.l, Y); ctx.lineTo(w - PAD.r, Y); ctx.stroke(); ctx.fillText(l, PAD.l - 8, Y); });
    ctx.textAlign = 'center'; ctx.textBaseline = 'alphabetic'; ctx.fillStyle = 'rgba(255,255,255,.7)';
    ctx.fillText('Length of a year (days)', PAD.l + (w - PAD.l - PAD.r) / 2, h - 8);
    ctx.save(); ctx.translate(15, PAD.t + (h - PAD.t - PAD.b) / 2); ctx.rotate(-Math.PI / 2); ctx.fillText('Width (Earths)', 0, 0); ctx.restore();
    const { x, y, t, types } = universe;
    for (let i = 0; i < x.length; i++) {
      if (x[i] < XR[0] || x[i] > XR[1] || y[i] < YR[0] || y[i] > YR[1]) continue;
      const dim = typeFilter !== null && types[t[i]] !== typeFilter;
      ctx.globalAlpha = dim ? 0.1 : 0.8; ctx.fillStyle = color(types[t[i]]); ctx.beginPath(); ctx.arc(sx(x[i]), sy(y[i]), dim ? 1.6 : 2.5, 0, 6.2832); ctx.fill();
    }
    ctx.globalAlpha = 1;
    if (hoverIdx >= 0) { ctx.strokeStyle = '#fff'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(sx(x[hoverIdx]), sy(y[hoverIdx]), 6.5, 0, 6.2832); ctx.stroke(); }
    const pp = plot.p.position;
    if (pp.x !== null && pp.y !== null) {
      const X = sx(Math.max(XR[0], Math.min(XR[1], pp.x))), Y = sy(Math.max(YR[0], Math.min(YR[1], pp.y))), c = color(plot.p.type);
      if (!reduceMotion && now) { const k = Math.min(1, (now - pulse) / 1600); ctx.strokeStyle = c; ctx.globalAlpha = 1 - k; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(X, Y, 8 + 38 * k, 0, 6.2832); ctx.stroke(); ctx.globalAlpha = 1; }
      ctx.fillStyle = c; ctx.shadowColor = c; ctx.shadowBlur = 18; ctx.beginPath(); ctx.arc(X, Y, 7, 0, 6.2832); ctx.fill(); ctx.shadowBlur = 0; ctx.strokeStyle = '#fff'; ctx.lineWidth = 2; ctx.stroke();
      ctx.fillStyle = '#fff'; ctx.textAlign = X > w - 150 ? 'right' : 'left'; ctx.textBaseline = 'bottom'; ctx.font = FONT(600);
      ctx.fillText(plot.p.name, X + (X > w - 150 ? -12 : 12), Y - 9);
    }
  }
  function nearest(ev) {
    const r = plot.cv.getBoundingClientRect(), mx = ev.clientX - r.left, my = ev.clientY - r.top; let best = -1, bd = 140; const { x, y } = universe;
    for (let i = 0; i < x.length; i++) { if (x[i] < XR[0] || x[i] > XR[1] || y[i] < YR[0] || y[i] > YR[1]) continue; const dx = sx(x[i]) - mx, dy = sy(y[i]) - my, d = dx * dx + dy * dy; if (d < bd) { bd = d; best = i; } }
    return best;
  }
  function onMove(ev) {
    const i = nearest(ev), tip = $('#tip'); if (i !== hoverIdx) { hoverIdx = i; redraw(); }
    if (i < 0) { tip.hidden = true; return; }
    tip.innerHTML = `${esc(universe.n[i])}<small>${esc(universe.types[universe.t[i]])}. Click to open.</small>`; tip.hidden = false;
    tip.style.left = Math.min(window.innerWidth - tip.offsetWidth - 8, ev.clientX + 14) + 'px'; tip.style.top = (ev.clientY + 14) + 'px';
  }
  function onClick(ev) { const i = nearest(ev); if (i >= 0) { $('#tip').hidden = true; go(universe.n[i]); } }

  /* ---------- BROWSE ---------- */
  const SORTS = [['name', 'A to Z'], ['largest', 'Widest first'], ['smallest', 'Narrowest first'], ['newest', 'Newest finds']];
  async function exploreView(kind) {
    const k = kinds.find((x) => x.name === kind) || null;
    let sort = 'name', offset = 0, total = 0;
    setView(`
      <div class="page-head"><h1><span class="script">Browse</span> planets</h1>
        <p class="lead">Not sure what to look up? Pick a kind of planet, then click any planet in the list to open its page. Nothing to type.</p></div>
      <div class="kind-tabs" role="group" aria-label="Kind of planet">
        <button type="button" class="chip chip--plain" data-kind="" aria-pressed="${k ? 'false' : 'true'}">All kinds</button>
        ${kinds.map((x) => `<button type="button" class="chip chip--plain" data-kind="${esc(x.name)}" aria-pressed="${x.name === kind ? 'true' : 'false'}"><span style="display:inline-flex;align-items:center;gap:.5rem"><span class="dot" style="--c:${color(x.name)}"></span>${esc(x.name)}</span></button>`).join('')}
      </div>
      ${k ? `<div class="kind-info glass"><h2>${esc(k.name)}</h2><span class="rule">${esc(k.rule)}</span><p>${esc(k.about)} ${k.count.toLocaleString('en-US')} planets in this group.</p></div>`
          : `<div class="kind-info glass"><h2>All planets</h2><span class="rule">${meta.planets.toLocaleString('en-US')} confirmed planets</span><p>Choose a kind above to narrow the list, or sort everything by the buttons below.</p></div>`}
      <div class="sortrow" role="group" aria-label="Sort order"><span class="lbl">Sort by:</span>
        ${SORTS.map(([v, l]) => `<button type="button" class="chip chip--plain" data-sort="${v}" aria-pressed="${v === 'name'}">${l}</button>`).join('')}</div>
      <ul class="plist" id="plist"></ul>
      <div class="more" id="more"></div>`, 'explore', k ? `${k.name} planets` : 'Browse planets');
    const list = $('#plist'), more = $('#more');
    $$('[data-kind]').forEach((b) => b.addEventListener('click', () => { location.hash = b.dataset.kind ? '#/explore/' + encodeURIComponent(b.dataset.kind) : '#/explore'; }));
    $$('[data-sort]').forEach((b) => b.addEventListener('click', () => { sort = b.dataset.sort; $$('[data-sort]').forEach((x) => x.setAttribute('aria-pressed', String(x === b))); offset = 0; list.innerHTML = ''; load(); }));
    async function load() {
      try {
        const r = await api(`/api/explore?type=${encodeURIComponent(kind || '')}&sort=${sort}&offset=${offset}&limit=24`);
        total = r.total;
        list.insertAdjacentHTML('beforeend', r.items.map((it) => `<li><button type="button" data-go="${esc(it.name)}">
          <span class="nm"><span class="dot" style="--c:${color(it.type)}"></span>${esc(it.name)}</span>
          <span class="meta">${esc(it.type)}${it.radius !== null ? `, ${num(it.radius, 2)} Earth ${it.radius === 1 ? 'width' : 'widths'}` : ''}</span>
          <span class="meta">${it.mass !== null ? `Mass ${earths(it.mass)}` : 'Mass not measured'}${it.year ? `, found ${it.year}` : ''}</span></button></li>`).join(''));
        offset += r.items.length;
        more.innerHTML = offset < total ? `<button type="button" class="btn btn--ghost" id="moreBtn">Show 24 more</button><span>Showing ${offset.toLocaleString('en-US')} of ${total.toLocaleString('en-US')}</span>` : `<span>Showing all ${total.toLocaleString('en-US')}</span>`;
        const mb = $('#moreBtn'); if (mb) mb.addEventListener('click', load);
      } catch (e) { more.innerHTML = noServer(); }
    }
    load();
  }

  /* ---------- HOW IT WORKS ---------- */
  function guideView() {
    const demo = { value: 14.5, low: 6.52, high: 32.5, measured: 9.1 };
    setView(`
      <div class="page-head"><h1><span class="script">How</span> it works</h1>
        <p class="lead">A short guide to everything on ExoLens. You can read it in two minutes, and you will know what every part of the site does.</p></div>

      <section class="sec"><h2 class="sec-title"><span class="script">What</span> is this site?</h2>
        <ul class="bullets"><li>ExoLens lets you look up any of ${meta.planets.toLocaleString('en-US')} <strong>confirmed exoplanets</strong>, planets that orbit stars other than our Sun.</li>
        <li>For each planet you see its facts and a <strong>machine-learning estimate of its mass</strong> (how heavy it is).</li>
        <li>It runs on your own computer. Nothing you do is sent anywhere else.</li></ul></section>

      <section class="sec"><h2 class="sec-title"><span class="script">What</span> can I do?</h2>
        <div class="cards">
          <div class="card glass halftone"><h3>${SPARK} Search by name</h3><p>On the Search page, type a planet’s name. Suggestions appear as you type: click one. This is the only thing you ever type.</p></div>
          <div class="card glass"><h3>${SPARK} Browse by kind</h3><p>Not sure what to search? Open <a href="#/explore">Browse planets</a>, choose a kind (like “Hot Jupiter”), and click any planet in the list.</p></div>
          <div class="card glass"><h3>${SPARK} Read a planet page</h3><p>You get a plain-words summary, the model’s mass estimate, a size comparison, the facts with short explanations, and a map showing where the planet sits among all the others.</p></div>
          <div class="card glass halftone"><h3>${SPARK} Keep clicking</h3><p>Everything is clickable: similar worlds, planets in the same system, and dots on the map all open another planet.</p></div>
        </div></section>

      <section class="sec"><h2 class="sec-title"><span class="script">Reading</span> the mass estimate</h2>
        <p class="sec-sub">Here is an example. The numbers are made up for the demonstration.</p>
        <div class="demo glass"><span class="tag-demo">Example</span>
          <div class="predict" style="margin:0;padding:0;background:none;border:0;box-shadow:none;backdrop-filter:none;border-radius:0"><div>
            <p class="ask"><span class="script">The model’s</span> estimate</p>
            <div class="bignum"><span class="n" style="-webkit-text-fill-color:#fff">14.5</span><span class="u">Earths</span></div>
            <p class="jup">about 0.046 Jupiters</p></div>
            <div>${gaugeHTML(demo, 'measured')}</div></div></div>
        <ul class="bullets">
          <li>The <strong>big number</strong> is the model’s best guess for the planet’s mass, in Earths (1 = the Earth).</li>
          <li>The <strong>white marker</strong> on the bar is that guess. The <strong>shaded band</strong> around it is the likely range.</li>
          <li>If astronomers have measured the real mass, an <strong>orange marker</strong> shows it so you can compare.</li>
          <li>The bar is <strong>logarithmic</strong>: each step to the right means many times heavier. Earth, Neptune, Saturn and Jupiter are marked for reference.</li></ul></section>

      <section class="sec"><h2 class="sec-title"><span class="script">Reading</span> the map</h2>
        <ul class="bullets"><li>Every dot on the map is one planet.</li><li>Left to right is <strong>how long its year is</strong>: dots further right orbit more slowly.</li>
        <li>Bottom to top is <strong>how wide the planet is</strong>.</li><li>The planet you are viewing glows. Hover a dot to see its name, click to open it.</li>
        <li>The colour buttons under the map highlight one kind of planet.</li></ul></section>

      <section class="sec"><h2 class="sec-title"><span class="script">Words</span> used on this site</h2>
        <dl class="gloss">
          <div><dt>Exoplanet</dt><dd>A planet that orbits a star other than the Sun.</dd></div>
          <div><dt>Earths (mass or width)</dt><dd>A unit. 1 Earth mass is the mass of our planet. Jupiter is about 318 Earth masses and 11 Earths wide.</dd></div>
          <div><dt>Length of a year</dt><dd>How many Earth days the planet takes to go around its star once. Also called its orbital period.</dd></div>
          <div><dt>AU</dt><dd>The distance from the Earth to the Sun. A planet at 0.1 AU is ten times closer to its star than we are to ours.</dd></div>
          <div><dt>Density</dt><dd>How tightly packed a planet is. Earth is about 5.5 g/cm³. Rocky planets are dense, gas planets are light.</dd></div>
          <div><dt>Starlight received</dt><dd>How much light hits the planet compared with the light Earth gets from the Sun.</dd></div>
          <div><dt>Light-year, parsec</dt><dd>Units of distance. One light-year is how far light travels in a year. One parsec is about 3.26 light-years.</dd></div>
          <div><dt>Measured, minimum, calculated mass</dt><dd><strong>Measured</strong> is the real weight. <strong>Minimum</strong> means the true mass is this or more. <strong>Calculated</strong> means it was worked out from the planet’s width, not weighed.</dd></div>
          <div><dt>Heavy elements (metallicity)</dt><dd>How rich a star is in elements heavier than hydrogen and helium, compared with the Sun. 0 means the same as the Sun.</dd></div>
          <div><dt>Transit, radial velocity</dt><dd>Two ways of finding planets: watching a star dim as a planet crosses it, or measuring the wobble a planet causes in its star.</dd></div>
        </dl></section>

      <section class="sec"><h2 class="sec-title"><span class="script">Common</span> questions</h2>
        <div class="faq">
          <details><summary>Can I type anything other than a planet name?</summary><p>No. The search box only takes a planet name, and it suggests matches as you type. Everything else is a click.</p></details>
          <details><summary>Why do some planets have no estimate?</summary><p>The model needs the planet’s width. If astronomers have not measured it, the site says so instead of guessing.</p></details>
          <details><summary>The estimate differs from the measured mass. Is it broken?</summary><p>No. The estimate is a guess with a margin of error. Typically it is off by around ${num(meta.typical_factor, 2)} times, so differences like this are expected. The About page explains more.</p></details>
          <details><summary>What if a planet name is not found?</summary><p>Check the spelling, or type just the first letters and pick from the suggestions. The site will also offer close matches.</p></details>
        </div></section>

      <section class="glass halftone cta"><span class="script">Ready?</span><h2>Try it with a real planet.</h2>
        <div class="row"><a class="btn" href="#/">Go to the search</a><button type="button" class="btn btn--ghost" data-random>Surprise me</button></div></section>`, 'guide', 'How it works');
    animateGauge(view);
  }

  /* ---------- ABOUT ---------- */
  function aboutView() {
    setView(`
      <div class="page-head"><h1><span class="script">About</span> the model</h1>
        <p class="lead">Where the data comes from, how the estimate is made, how good it is, and where it can be wrong.</p></div>

      <div class="stats">
        <div class="stat glass"><span class="v">${meta.planets.toLocaleString('en-US')}</span><p>confirmed planets in the catalog</p></div>
        <div class="stat glass"><span class="v">${meta.trained_on.toLocaleString('en-US')}</span><p>planets with a measured mass, used to train the model</p></div>
        <div class="stat glass"><span class="v">${Math.round(meta.r2 * 100)}%</span><p>of the variation in mass explained, on planets the model had not seen</p></div>
        <div class="stat glass"><span class="v">×${num(meta.typical_factor, 2)}</span><p>typical miss: the estimate is usually within this factor of the truth</p></div>
      </div>

      <section class="sec"><h2 class="sec-title"><span class="script">The</span> data</h2>
        <ul class="bullets"><li>Planet facts come from the <strong>NASA Exoplanet Archive</strong>, cleaned and checked in this project’s notebooks.</li>
        <li>Missing orbital distances and densities were recovered with physics (Kepler’s third law and the density formula) wherever possible, and flagged otherwise.</li>
        <li>Masses are labelled <strong>measured</strong>, <strong>minimum</strong> or <strong>calculated from width</strong>, and only the first two are treated as real.</li></ul></section>

      <section class="sec"><h2 class="sec-title"><span class="script">How</span> the estimate works</h2>
        <ul class="bullets"><li>The model is a <strong>Random Forest</strong>: many decision trees that each vote on a planet’s mass, and the votes are averaged.</li>
        <li>It looks at nine things: the planet’s <strong>width</strong>, <strong>length of year</strong>, <strong>orbit distance</strong>, <strong>starlight received</strong>, the star’s <strong>temperature</strong>, <strong>mass</strong>, <strong>heavy-element content</strong> and <strong>distance from Earth</strong>, and <strong>how many planets</strong> the system has.</li>
        <li>It was trained only on planets whose mass was really measured, never on masses calculated from width, so it does not simply learn a formula it was handed.</li></ul></section>

      <section class="sec"><h2 class="sec-title"><span class="script">How</span> we keep it honest</h2>
        <ul class="bullets"><li>For a planet that was in the training set, the page shows an <strong>out-of-fold</strong> estimate: from a copy of the model that never saw that planet’s mass. So the number is never a memorised answer.</li>
        <li>The <strong>range</strong> (${num(meta.band_low_factor, 2)}× to ${num(meta.band_high_factor, 2)}× the estimate) comes from real errors on unseen planets. The true mass fell inside a band like this 8 times out of 10.</li>
        <li>When inputs are missing the page says so. If the width is missing, it gives no estimate at all.</li></ul></section>

      <section class="sec"><h2 class="sec-title"><span class="script">Limits</span> to keep in mind</h2>
        <ul class="bullets"><li>The estimate is a <strong>statistical guess</strong>, not a measurement. For one planet it can be well off.</li>
        <li>Planets that are very unusual (extremely hot, extremely long orbits) have fewer look-alikes in the training data, so the guess is shakier.</li>
        <li>Width is the most important input by far, so a planet whose width is itself uncertain has an uncertain estimate.</li></ul></section>

      <section class="glass halftone cta"><span class="script">See it in action</span><h2>Look up a planet.</h2>
        <div class="row"><a class="btn" href="#/">Go to the search</a><a class="btn btn--ghost" href="#/guide">How to read a planet page</a></div></section>`, 'about', 'About the model');
  }

  /* ---------- start ---------- */
  async function init() {
    try { [meta, universe, kinds] = await Promise.all([api('/api/meta'), api('/api/universe'), api('/api/kinds')]); }
    catch (e) { setView(noServer(), 'home'); return; }
    route();
  }
  init();
})();
