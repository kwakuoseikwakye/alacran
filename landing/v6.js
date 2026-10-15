/* Alacrán website behaviour: menus, the tour, reveals and the hero's pointer drift.
   The motion itself is CSS (and SMIL for the agent chip); this file flips classes and
   feeds numbers. Nothing here runs motion under prefers-reduced-motion. */
(() => {
  // Set here, not inline in <head>: if this file never loads, nothing stays hidden.
  document.documentElement.classList.add('js');
  const root = document.documentElement;
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const fine = matchMedia('(pointer: fine)').matches;
  let paused = reduced; // set by the Pause animation controls; reduced-motion visitors start paused
  const $$ = (s, el = document) => [...el.querySelectorAll(s)];

  // Nav: a toggle on narrow screens, a hairline once the page scrolls.
  const nav = document.querySelector('.nav');
  const toggle = document.querySelector('.nav-toggle');
  toggle?.addEventListener('click', (e) => {
    e.stopPropagation();
    toggle.setAttribute('aria-expanded', String(nav.classList.toggle('open')));
  });
  const onScroll = () => nav?.classList.toggle('is-scrolled', scrollY > 8);
  addEventListener('scroll', onScroll, { passive: true });
  onScroll();

  // Menus are <details>: one open at a time, closed by an outside click or Escape.
  const menus = $$('details.dl, details.guides');
  menus.forEach((d) => d.addEventListener('toggle', () => {
    if (d.open) menus.forEach((o) => { if (o !== d) o.open = false; });
  }));
  document.addEventListener('click', (e) => {
    menus.forEach((d) => { if (!d.contains(e.target)) d.open = false; });
    if (nav && !nav.contains(e.target)) { nav.classList.remove('open'); toggle?.setAttribute('aria-expanded', 'false'); }
  });
  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape') return;
    menus.forEach((d) => { if (d.open) { d.open = false; d.querySelector('summary').focus(); } });
    nav?.classList.remove('open');
  });

  // Product tour: a keyboard-operable tablist that also plays itself until the visitor takes over.
  const tabs = $$('[role="tab"]');
  const tablist = document.querySelector('[role="tablist"]');
  let current = 0, timer = 0, taken = false;
  const show = (i, focus) => {
    current = i;
    tabs.forEach((t, k) => {
      const on = k === i;
      t.setAttribute('aria-selected', String(on));
      t.tabIndex = on ? 0 : -1;
      document.getElementById(t.getAttribute('aria-controls')).hidden = !on;
      if (on && focus) t.focus();
    });
    if (tablist) { tablist.classList.remove('playing'); void tablist.offsetWidth; if (!taken) tablist.classList.add('playing'); }
  };
  const DUR = 7000;
  const schedule = () => { clearTimeout(timer); if (!taken && !paused && tabs.length > 1) timer = setTimeout(() => { show((current + 1) % tabs.length); schedule(); }, DUR); };
  const stop = () => { taken = true; clearTimeout(timer); tablist?.classList.remove('playing'); };
  tabs.forEach((t, i) => {
    t.addEventListener('click', () => { stop(); show(i); });
    t.addEventListener('keydown', (e) => {
      const step = { ArrowRight: 1, ArrowLeft: -1 }[e.key];
      if (step) { stop(); show((i + step + tabs.length) % tabs.length, true); }
      if (e.key === 'Home') { stop(); show(0, true); }
      if (e.key === 'End') { stop(); show(tabs.length - 1, true); }
    });
  });
  const tourEl = document.querySelector('.tour');
  tourEl?.addEventListener('pointerenter', () => { clearTimeout(timer); tablist?.classList.remove('playing'); });
  tourEl?.addEventListener('pointerleave', () => { if (!taken && !paused) { show(current); schedule(); } });
  tourEl?.addEventListener('focusin', stop);
  if (tourEl && tabs.length && !reduced && 'IntersectionObserver' in window) {
    tablist.style.setProperty('--dur', `${DUR}ms`);
    new IntersectionObserver((en) => {
      if (taken) return;
      if (en[0].isIntersecting) { show(current); schedule(); } else { clearTimeout(timer); tablist.classList.remove('playing'); }
    }, { threshold: 0.35 }).observe(tourEl);
  }

  // Pause animation (WCAG 2.2.2): every control stops every loop, remembered per browser.
  const art = document.querySelector('svg.art');
  const mts = $$('.motion-toggle');
  const setMotion = (off) => {
    paused = off;
    root.dataset.motion = off ? 'off' : 'on';
    mts.forEach((b) => { b.textContent = off ? 'Play animation' : 'Pause animation'; });
    if (art) { if (off) art.pauseAnimations(); else art.unpauseAnimations(); }
    if (off) stop(); else if (taken && tabs.length) { taken = false; show(current); schedule(); }
    try { localStorage.setItem('alacran-motion', off ? 'off' : 'on'); } catch (e) { /* storage blocked: the choice just does not persist */ }
  };
  mts.forEach((b) => b.addEventListener('click', () => setMotion(!paused)));
  try { if (!reduced && localStorage.getItem('alacran-motion') === 'off') setMotion(true); } catch (e) { /* ignore */ }
  if (reduced && art) art.pauseAnimations();

  // Full-screenshot viewer: a native modal <dialog> keeps focus inside and
  // closes on Escape; focus goes back to the button that opened it.
  const viewer = document.querySelector('dialog.viewer');
  if (viewer) {
    const img = viewer.querySelector('img');
    let opener = null;
    document.addEventListener('click', (e) => {
      const b = e.target.closest('.zoom');
      if (!b) return;
      opener = b;
      img.src = b.dataset.full;
      img.alt = b.dataset.alt;
      viewer.showModal();
    });
    viewer.addEventListener('click', (e) => { if (e.target === viewer) viewer.close(); });
    viewer.addEventListener('close', () => { opener?.focus(); opener = null; });
  }

  // Mac install help: a Mac download opens the xattr instructions; the download itself still goes ahead.
  const mac = document.querySelector('dialog.mac-help');
  if (mac) {
    document.addEventListener('click', (e) => {
      if (!e.target.closest('a[href$=".dmg"]')) return;
      menus.forEach((d) => { d.open = false; });
      if (!mac.open) mac.showModal();
    });
    mac.addEventListener('click', (e) => { if (e.target === mac) mac.close(); });
    mac.querySelector('[data-copy]')?.addEventListener('click', async (e) => {
      const btn = e.currentTarget, text = mac.querySelector(btn.dataset.copy).textContent;
      try { await navigator.clipboard.writeText(text); btn.textContent = 'Copied'; }
      catch (err) { const r = document.createRange(); r.selectNodeContents(mac.querySelector(btn.dataset.copy)); const sel = getSelection(); sel.removeAllRanges(); sel.addRange(r); btn.textContent = 'Press Cmd+C to copy'; }
      setTimeout(() => { btn.textContent = 'Copy command'; }, 2200);
    });
  }

  // Headlines: split into words so each rides up out of a mask.
  $$('[data-split]').forEach((h) => {
    if (h.children.length) return; // inline markup inside: leave it whole
    const words = h.textContent.trim().split(/\s+/);
    h.setAttribute('aria-label', h.textContent.trim());
    h.textContent = '';
    // One block per sentence, so a line never splits "organized. Your".
    let sent = null;
    words.forEach((w, i) => {
      if (!sent) { sent = document.createElement('span'); sent.className = 'sent'; sent.setAttribute('aria-hidden', 'true'); h.append(sent); }
      const o = document.createElement('span'); o.className = 'w';
      const s = document.createElement('span'); s.textContent = w; s.style.setProperty('--i', i);
      o.append(s); sent.append(o, /[.!?]$/.test(w) ? '' : ' ');
      if (/[.!?]$/.test(w)) sent = null;
    });
  });

  // Reveals: blocks rise out of a soft blur as they arrive.
  const reveals = $$('.reveal, [data-split]');
  if (reduced || !('IntersectionObserver' in window)) {
    reveals.forEach((el) => el.classList.add('in'));
  } else {
    const io = new IntersectionObserver((entries) => entries.forEach((en) => {
      if (en.isIntersecting) { en.target.classList.add('in'); io.unobserve(en.target); }
    }), { threshold: 0, rootMargin: '0px 0px -6% 0px' }); // threshold 0: a tall block can never show 15% of itself
    reveals.forEach((el) => io.observe(el));
  }

  // "On this page": highlight the section being read.
  const tocItems = $$('.toc li');
  if (tocItems.length) {
    const targets = tocItems.map((li) => document.getElementById(li.dataset.t));
    const spy = () => {
      let on = 0;
      targets.forEach((t, i) => { if (t && t.getBoundingClientRect().top < innerHeight * 0.35) on = i; });
      tocItems.forEach((li, i) => li.classList.toggle('on', i === on));
    };
    addEventListener('scroll', spy, { passive: true });
    spy();
  }

  // Looping scenes: the companies swap, the agent swaps, the memory stays.
  const cycle = (els, ms) => {
    if (reduced || els.length < 2) return;
    let i = 0;
    setInterval(() => { if (paused) return; els[i].classList.remove('on'); i = (i + 1) % els.length; els[i].classList.add('on'); }, ms);
  };
  cycle($$('.space'), 2600);
  cycle($$('.agents li'), 1900);

  if (reduced || !fine || !art) return;

  // Pointer: the stack drifts a few pixels toward the cursor.
  let raf = 0;
  addEventListener('pointermove', (e) => {
    const px = (e.clientX / innerWidth) * 2 - 1, py = (e.clientY / innerHeight) * 2 - 1;
    if (!raf) raf = requestAnimationFrame(() => {
      raf = 0;
      if (paused) return;
      root.style.setProperty('--px', px.toFixed(3));
      root.style.setProperty('--py', py.toFixed(3));
    });
  }, { passive: true });
})();
