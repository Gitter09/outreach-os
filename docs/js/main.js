/* main.js — interactions, scroll reveals, nav, tabs */
(function () {

  /* ── NAV scroll behaviour ── */
  const nav = document.getElementById('nav');
  function onScroll() {
    if (window.scrollY > 60) nav.classList.add('scrolled');
    else nav.classList.remove('scrolled');
  }
  window.addEventListener('scroll', onScroll, { passive: true });
  onScroll();

  /* ── HERO INTERACTIVE TABS ── */
  const tabBtns  = document.querySelectorAll('.tab-btn');
  const tabPanes = document.querySelectorAll('.tab-pane');

  function switchTab(id) {
    tabBtns.forEach(b => {
      b.classList.toggle('active', b.dataset.tab === id);
    });

    const current = document.querySelector('.tab-pane.active');
    const next    = document.getElementById('pane-' + id);
    if (!next || current === next) return;

    current.style.opacity = '0';
    current.style.transform = 'translateY(6px)';

    setTimeout(() => {
      current.classList.remove('active');
      current.style.opacity = '';
      current.style.transform = '';

      next.classList.add('active');
      next.style.opacity = '0';
      next.style.transform = 'translateY(6px)';
      // force reflow
      next.getBoundingClientRect();
      next.style.transition = 'opacity .28s ease, transform .28s ease';
      next.style.opacity = '1';
      next.style.transform = 'translateY(0)';

      setTimeout(() => {
        next.style.transition = '';
      }, 300);
    }, 180);
  }

  tabBtns.forEach(btn => {
    btn.addEventListener('click', () => switchTab(btn.dataset.tab));
  });

  // add transition style to all panes
  tabPanes.forEach(p => {
    p.style.transition = 'opacity .18s ease, transform .18s ease';
  });

  /* ── SCROLL REVEAL ── */
  const revealEls = document.querySelectorAll('.reveal');

  const observer = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        // stagger siblings inside the same parent
        const parent = entry.target.parentElement;
        const siblings = Array.from(parent.querySelectorAll('.reveal:not(.in)'));
        siblings.forEach((el, i) => {
          const base = parseFloat(getComputedStyle(el).transitionDelay) || 0;
          const extra = siblings.indexOf(el) * 0.07;
          el.style.transitionDelay = (base + extra) + 's';
          requestAnimationFrame(() => el.classList.add('in'));
        });
        // always trigger the observed element too
        entry.target.classList.add('in');
        observer.unobserve(entry.target);
      }
    });
  }, { threshold: 0.12, rootMargin: '0px 0px -40px 0px' });

  revealEls.forEach(el => observer.observe(el));

  /* ── SUBTLE PARALLAX on feat visuals ── */
  const featVisuals = document.querySelectorAll('.feat-visual');
  if (window.matchMedia('(min-width: 900px)').matches) {
    window.addEventListener('scroll', () => {
      const sy = window.scrollY;
      featVisuals.forEach((v, i) => {
        const rect   = v.getBoundingClientRect();
        const centre = rect.top + rect.height / 2;
        const vp     = window.innerHeight / 2;
        const dist   = (centre - vp) / window.innerHeight;
        const dir    = i % 2 === 0 ? 1 : -1;
        v.style.transform = `translateY(${dist * 28 * dir}px)`;
      });
    }, { passive: true });
  }

  /* ── AUTO cycle tabs every 4s if user hasn't interacted ── */
  const tabOrder = ['contacts', 'pipeline', 'outreach', 'intel'];
  let tabIdx = 0;
  let autoCycle = true;

  tabBtns.forEach(b => {
    b.addEventListener('click', () => { autoCycle = false; });
  });

  setInterval(() => {
    if (!autoCycle) return;
    tabIdx = (tabIdx + 1) % tabOrder.length;
    switchTab(tabOrder[tabIdx]);
  }, 4200);

})();
