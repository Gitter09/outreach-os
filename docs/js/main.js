/* main.js — interactions, scroll reveals, nav, tabs */
(function () {

  /* ── CUSTOM CURSOR ── */
  const dot = document.getElementById('cursor-dot');
  const ring = document.getElementById('cursor-ring');

  let mouseX = 0, mouseY = 0;
  let ringX = 0, ringY = 0;
  let cursorVisible = false;
  let rafCursor;

  function tickCursor() {
    // Spring follow for the ring: 14% of remaining distance per frame
    ringX += (mouseX - ringX) * 0.14;
    ringY += (mouseY - ringY) * 0.14;

    dot.style.left = mouseX + 'px';
    dot.style.top = mouseY + 'px';
    ring.style.left = ringX + 'px';
    ring.style.top = ringY + 'px';

    rafCursor = requestAnimationFrame(tickCursor);
  }

  window.addEventListener('mousemove', e => {
    mouseX = e.clientX;
    mouseY = e.clientY;

    if (!cursorVisible) {
      // Snap ring to dot position on first move to prevent it flying in from 0,0
      ringX = mouseX;
      ringY = mouseY;
      dot.style.opacity = '1';
      ring.style.opacity = '1';
      cursorVisible = true;
      tickCursor();
    }
  });

  // Hover detection — interactive elements
  const interactiveSelectors = 'a, button, .tab-btn, label, [role="button"]';

  document.addEventListener('mouseover', e => {
    const overAppWindow = e.target.closest('.app-window');
    const overInteractive = e.target.closest(interactiveSelectors);

    // Clear all states first
    dot.classList.remove('is-hovering');
    ring.classList.remove('is-hovering', 'is-on-window');

    if (overInteractive) {
      dot.classList.add('is-hovering');
      ring.classList.add('is-hovering');
    } else if (overAppWindow) {
      ring.classList.add('is-on-window');
    }
  });

  // Hide cursor when leaving the window
  document.addEventListener('mouseleave', () => {
    dot.style.opacity = '0';
    ring.style.opacity = '0';
    cursorVisible = false;
    cancelAnimationFrame(rafCursor);
  });

  document.addEventListener('mouseenter', () => {
    if (!cursorVisible) return;
    dot.style.opacity = '1';
    ring.style.opacity = '1';
  });


  /* ── HERO PARALLAX ── */
  const hero = document.getElementById('hero');

  // Only run parallax when the hero is in view
  let heroInView = true;
  const heroObserver = new IntersectionObserver(entries => {
    heroInView = entries[0].isIntersecting;
  }, { threshold: 0 });
  if (hero) heroObserver.observe(hero);

  const parallaxLayers = [
    { el: document.querySelector('.n1'), tx: 0, ty: 0, mx: 0.018, my: 0.012 },
    { el: document.querySelector('.n2'), tx: 0, ty: 0, mx: -0.014, my: -0.010 },
    { el: document.querySelector('.n3'), tx: 0, ty: 0, mx: 0.022, my: 0.016 },
    { el: document.querySelector('.hero-content'), tx: 0, ty: 0, mx: -0.010, my: -0.007 },
    { el: document.querySelector('.hero-preview'), tx: 0, ty: 0, mx: -0.006, my: -0.004 },
  ];

  // Filter out any nulls in case selectors don't match
  const activeLayers = parallaxLayers.filter(l => l.el !== null);

  let heroMouseX = 0, heroMouseY = 0;   // raw target offsets from center
  let rafParallax;

  function tickParallax() {
    if (!heroInView) {
      rafParallax = requestAnimationFrame(tickParallax);
      return;
    }

    for (const layer of activeLayers) {
      const targetX = heroMouseX * layer.mx;
      const targetY = heroMouseY * layer.my;

      // Lerp current position toward target at 6% per frame
      layer.tx += (targetX - layer.tx) * 0.06;
      layer.ty += (targetY - layer.ty) * 0.06;

      layer.el.style.transform = `translate(${layer.tx}px, ${layer.ty}px)`;
    }

    rafParallax = requestAnimationFrame(tickParallax);
  }

  // Reuse the existing mousemove listener's coordinates
  // by reading from the already-tracked mouseX/mouseY values.
  // We update heroMouseX/Y as offset from viewport center.
  window.addEventListener('mousemove', e => {
    heroMouseX = e.clientX - window.innerWidth / 2;
    heroMouseY = e.clientY - window.innerHeight / 2;
  });

  // Start the parallax loop immediately (runs even before first mousemove,
  // just lerps toward 0 which is a no-op)
  tickParallax();

  // On resize, reset all layer positions to avoid drift
  window.addEventListener('resize', () => {
    for (const layer of activeLayers) {
      layer.tx = 0;
      layer.ty = 0;
      layer.el.style.transform = 'translate(0px, 0px)';
    }
    heroMouseX = 0;
    heroMouseY = 0;
  });


  /* ── NAV scroll behaviour ── */
  const nav = document.getElementById('nav');
  function onScroll() {
    if (window.scrollY > 60) nav.classList.add('scrolled');
    else nav.classList.remove('scrolled');
  }
  window.addEventListener('scroll', onScroll, { passive: true });
  onScroll();

  /* ── PANE ENTRY ANIMATIONS ── */
  function onPaneEnter(id) {
    if (id === 'pipeline') {
      const sarahCard = document.getElementById('sarah-card');
      if (!sarahCard) return;
      sarahCard.classList.remove('card-pulse');
      void sarahCard.offsetWidth;
      sarahCard.classList.add('card-pulse');
      setTimeout(() => sarahCard.classList.remove('card-pulse'), 520);
    }

    if (id === 'outreach') {
      triggerOutreachEntry();
    }

    if (id === 'intel') {
      triggerIntelEntry();
    }
  }

  function triggerOutreachEntry() {
    const composeBody = document.querySelector('#pane-outreach .compose-body');
    if (composeBody) {
      const vars = composeBody.querySelectorAll('em');
      vars.forEach((v, i) => {
        v.classList.remove('var-pulse');
        void v.offsetWidth;
        setTimeout(() => {
          v.classList.add('var-pulse');
          setTimeout(() => v.classList.remove('var-pulse'), 720);
        }, i * 160);
      });
    }

    const trackingRow = document.querySelector('#pane-outreach .tracking-row');
    if (trackingRow) {
      trackingRow.classList.remove('tracking-visible');
      setTimeout(() => {
        trackingRow.classList.add('tracking-visible');
      }, 420);
    }
  }

  function triggerIntelEntry() {
    const activityLine = document.getElementById('activity-line');
    if (!activityLine) return;
    activityLine.classList.remove('activity-shimmer');
    void activityLine.offsetWidth;
    activityLine.classList.add('activity-shimmer');
    setTimeout(() => activityLine.classList.remove('activity-shimmer'), 780);
  }

  /* ── HERO INTERACTIVE TABS ── */
  const tabBtns = document.querySelectorAll('.tab-btn');
  const tabPanes = document.querySelectorAll('.tab-pane');

  function switchTab(id) {
    tabBtns.forEach(b => {
      b.classList.toggle('active', b.dataset.tab === id);
    });

    const current = document.querySelector('.tab-pane.active');
    const next = document.getElementById('pane-' + id);
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

      onPaneEnter(id);

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


  /* ── CLIP-PATH HEADLINE REVEALS ── */
  (function () {
    const HEADLINE_SELECTORS = [
      '.feat-header h2',
      '#privacy .privacy-inner h2',
      '#pricing .pricing-head h2',
      '#cta .cta-inner h2',
      '.feat-text h3',
    ];

    function wrapHeadline(el) {
      if (el.parentElement.classList.contains('clip-reveal-outer')) return;
      const wrapper = document.createElement('div');
      wrapper.className = 'clip-reveal-outer clip-pending';
      el.parentNode.insertBefore(wrapper, el);
      wrapper.appendChild(el);
    }

    const allHeadlines = [];

    HEADLINE_SELECTORS.forEach(sel => {
      document.querySelectorAll(sel).forEach(el => {
        wrapHeadline(el);
        allHeadlines.push(el.parentElement);
      });
    });

    function revealClip(wrapper, delay = 0) {
      setTimeout(() => {
        wrapper.style.transition = 'clip-path 0.72s cubic-bezier(0.16, 1, 0.3, 1)';
        wrapper.classList.remove('clip-pending');
        wrapper.classList.add('clip-done');
        setTimeout(() => {
          wrapper.style.transition = '';
        }, 730);
      }, delay);
    }

    const clipObserver = new IntersectionObserver(entries => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          revealClip(entry.target);
          clipObserver.unobserve(entry.target);
        }
      });
    }, { threshold: 0.12, rootMargin: '0px 0px -40px 0px' });

    allHeadlines.forEach(wrapper => clipObserver.observe(wrapper));

    const h1line1 = document.querySelector('.h1-line1');
    const h1line2 = document.querySelector('.h1-line2');

    function wrapHeroSpan(span) {
      if (!span) return null;
      const wrapper = document.createElement('div');
      wrapper.className = 'clip-reveal-outer clip-pending';
      wrapper.style.display = 'inline-block';
      span.parentNode.insertBefore(wrapper, span);
      wrapper.appendChild(span);
      return wrapper;
    }

    const w1 = wrapHeroSpan(h1line1);
    const w2 = wrapHeroSpan(h1line2);

    function fireHeroReveal() {
      if (w1) revealClip(w1, 120);
      if (w2) revealClip(w2, 300);
    }

    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', fireHeroReveal);
    } else {
      fireHeroReveal();
    }
  })();


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
