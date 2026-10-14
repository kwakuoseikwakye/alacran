/* Alacrán website behaviour: menus, the tour, reveals and the scroll story.
   The motion itself is CSS; this file only feeds it numbers (--s, --sp, --p, --px, --py)
   and flips classes. Nothing here runs the motion under prefers-reduced-motion. */
(() => {
  // Set here, not inline in <head>: if this file never loads, nothing stays hidden.
  document.documentElement.classList.add('js');
  const root = document.documentElement;
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const fine = matchMedia('(pointer: fine)').matches;
  const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
  let paused = reduced; // set by the Pause motion control; reduced-motion visitors start paused
  const $$ = (s, el = document) => [...el.querySelectorAll(s)];

  // Nav: a toggle on narrow screens.
  const nav = document.querySelector('.nav');
  const toggle = document.querySelector('.nav-toggle');
  toggle?.addEventListener('click', (e) => {
    e.stopPropagation();
    toggle.setAttribute('aria-expanded', String(nav.classList.toggle('open')));
  });

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
  const schedule = () => { clearTimeout(timer); if (!taken && !reduced && tabs.length > 1) timer = setTimeout(() => { show((current + 1) % tabs.length); schedule(); }, DUR); };
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

  // Pause motion (WCAG 2.2.2): one control that stops every loop, remembered per browser.
  const mt = document.querySelector('.motion-toggle');
  const setMotion = (off) => {
    paused = off;
    root.dataset.motion = off ? 'off' : 'on';
    if (mt) mt.textContent = off ? 'Play motion' : 'Pause motion';
    if (off) stop(); else if (taken && tabs.length) { taken = false; show(current); schedule(); }
    try { localStorage.setItem('alacran-motion', off ? 'off' : 'on'); } catch (e) { /* storage blocked: the choice just does not persist */ }
  };
  mt?.addEventListener('click', () => setMotion(!paused));
  try { if (!reduced && localStorage.getItem('alacran-motion') === 'off') setMotion(true); } catch (e) { /* ignore */ }

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

  // Headlines: split into words so each rides up out of a mask and the width axis opens.
  $$('[data-split]').forEach((h) => {
    if (h.children.length) return; // inline markup inside: leave it whole
    const words = h.textContent.trim().split(/\s+/);
    h.setAttribute('aria-label', h.textContent.trim());
    h.textContent = '';
    words.forEach((w, i) => {
      const o = document.createElement('span'); o.className = 'w'; o.setAttribute('aria-hidden', 'true');
      const s = document.createElement('span'); s.textContent = w; s.style.setProperty('--i', i);
      o.append(s); h.append(o, i < words.length - 1 ? ' ' : '');
    });
  });

  // Reveals: blocks rise as they arrive.
  const reveals = $$('.reveal, [data-split], .card, .dept, .folder, .stamp');
  if (reduced || !('IntersectionObserver' in window)) {
    reveals.forEach((el) => el.classList.add('in'));
  } else {
    const io = new IntersectionObserver((entries) => entries.forEach((en) => {
      if (en.isIntersecting) { en.target.classList.add('in'); io.unobserve(en.target); }
    }), { threshold: 0, rootMargin: '0px 0px -8% 0px' }); // threshold 0: a tall block can never show 15% of itself
    reveals.forEach((el) => io.observe(el));
  }

  // The depth ruler and the section spy (wide screens only; the CSS hides them elsewhere).
  const ruler = document.querySelector('.ruler-read');
  const spyItems = $$('.spy li');
  const spyTargets = spyItems.map((li) => document.getElementById(li.dataset.t));

  // Looping scenes: the companies swap, the agent swaps, the memory stays.
  const cycle = (els, ms) => {
    if (reduced || els.length < 2) return;
    let i = 0;
    setInterval(() => { if (paused) return; els[i].classList.remove('on'); i = (i + 1) % els.length; els[i].classList.add('on'); }, ms);
  };
  cycle($$('.space'), 2600);
  cycle($$('.agents li'), 1900);

  // Scroll: feed the custom properties.
  const hero = document.querySelector('.hero-home');
  const how = document.querySelector('.how');
  const scrollers = $$('[data-scroll3d]:not(.shot-hero)');
  const stages = $$('.stage');
  let ticking = false;
  const onScroll = () => {
    ticking = false;
    const vh = innerHeight, y = scrollY;
    const max = Math.max(1, document.documentElement.scrollHeight - vh);
    const sp = clamp(y / max, 0, 1);
    nav?.classList.toggle('is-scrolled', y > 12);
    if (reduced) return;
    root.style.setProperty('--sp', sp.toFixed(4));
    if (ruler) ruler.textContent = `${String(Math.round(sp * 100)).padStart(3, '0')}%`;
    if (hero) root.style.setProperty('--s', clamp(y / Math.max(1, (hero.offsetHeight - vh) * 0.8), 0, 1).toFixed(4));
    stages.forEach((s) => s.style.setProperty('--s', clamp(y / (vh * 0.7), 0, 1).toFixed(3)));
    scrollers.forEach((el) => {
      const top = el.getBoundingClientRect().top;
      el.querySelector('.shot-frame')?.style.setProperty('--p', clamp((vh - top) / (vh * 0.75), 0, 1).toFixed(3));
    });
    if (how) {
      const r = how.getBoundingClientRect();
      how.style.setProperty('--p', clamp((vh * 0.6 - r.top) / r.height, 0, 1).toFixed(3));
    }
    let on = 0;
    spyTargets.forEach((t, i) => { if (t && t.getBoundingClientRect().top < vh * 0.5) on = i; });
    spyItems.forEach((li, i) => li.classList.toggle('on', i === on));
  };
  addEventListener('scroll', () => { if (!ticking) { ticking = true; requestAnimationFrame(onScroll); } }, { passive: true });
  addEventListener('resize', onScroll);
  onScroll();

  if (reduced || !fine) return;

  // Pointer: the orbiting cards lean toward the cursor, each by its own depth.
  let raf = 0;
  addEventListener('pointermove', (e) => {
    const px = (e.clientX / innerWidth) * 2 - 1, py = (e.clientY / innerHeight) * 2 - 1;
    if (!raf) raf = requestAnimationFrame(() => {
      raf = 0;
      root.style.setProperty('--px', px.toFixed(3));
      root.style.setProperty('--py', py.toFixed(3));
    });
  }, { passive: true });
})();
