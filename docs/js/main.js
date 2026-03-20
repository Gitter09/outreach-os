/* main.js — interactions, scroll reveals, nav, tabs */
(function () {

  /* ── SITE HEADER & MOBILE MENU ── */
  const header = document.getElementById('site-header');
  const navToggle = document.getElementById('navbar-toggle');
  const mobileNav = document.getElementById('mobile-nav');
  const mobileLinks = document.querySelectorAll('.mobile-nav__link');

  // Toggle mobile menu
  navToggle?.addEventListener('click', () => {
    const isExpanded = navToggle.getAttribute('aria-expanded') === 'true';
    navToggle.setAttribute('aria-expanded', !isExpanded);
    header.classList.toggle('is-menu-open');
    mobileNav.classList.toggle('is-open');
    
    // Toggle proper scrolling & inert attribute for accessibility
    if (mobileNav.classList.contains('is-open')) {
      document.body.style.overflow = 'hidden';
      // If browsers support inert, remove it when open
      if (mobileNav.hasAttribute('inert')) mobileNav.removeAttribute('inert');
    } else {
      document.body.style.overflow = '';
      mobileNav.setAttribute('inert', 'true');
    }
  });

  // Close menu on link click
  mobileLinks.forEach(link => {
    link.addEventListener('click', () => {
      header.classList.remove('is-menu-open');
      mobileNav.classList.remove('is-open');
      navToggle.setAttribute('aria-expanded', 'false');
      document.body.style.overflow = '';
      mobileNav.setAttribute('inert', 'true');
    });
  });


  /* ── HEADER SCROLL STATE ── */
  function updateHeaderState() {
    if (window.scrollY > 60) {
      header.classList.add('is-scrolled');
    } else {
      header.classList.remove('is-scrolled');
    }
  }
  window.addEventListener('scroll', updateHeaderState, { passive: true });
  updateHeaderState();


  /* ── SCROLL REVEAL ── */
  const revealEls = document.querySelectorAll('.reveal');

  const observer = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        // stagger siblings inside the same parent
        const parent = entry.target.parentElement;
        const siblings = Array.from(parent.querySelectorAll('.reveal:not(.in)'));
        siblings.forEach(el => {
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

    const h1Spans = [
      document.querySelector('.h1-sm'),
      document.querySelector('.h1-xl'),
      document.querySelector('.h1-muted'),
      document.querySelector('.hero-punch'),
    ];

    function wrapHeroSpan(span) {
      if (!span) return null;
      const wrapper = document.createElement('div');
      wrapper.className = 'clip-reveal-outer clip-pending';
      span.parentNode.insertBefore(wrapper, span);
      wrapper.appendChild(span);
      return wrapper;
    }

    const heroWrappers = h1Spans.map(wrapHeroSpan);

    function fireHeroReveal() {
      const delays = [80, 220, 380, 520];
      heroWrappers.forEach((w, idx) => {
        if (w) revealClip(w, delays[idx]);
      });
    }

    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', fireHeroReveal);
    } else {
      fireHeroReveal();
    }
  })();




  /* ── TYPEWRITER — CONTACT INTELLIGENCE MOCKUP ── */
  (function () {
    const summaryEl = document.getElementById('fd-summary-text');
    if (!summaryEl) return;

    // Read the full text before emptying the element
    const fullText = summaryEl.textContent.trim();
    let hasRun = false;

    function runTypewriter() {
      if (hasRun) return;
      // Skip on mobile — element is hidden and animation was designed for desktop
      if (window.matchMedia('(max-width: 768px)').matches) return;
      hasRun = true;

      // Clear existing text
      summaryEl.textContent = '';

      // Inject the blinking cursor element
      const cursor = document.createElement('span');
      cursor.id = 'fd-cursor';
      cursor.textContent = '|';
      summaryEl.appendChild(cursor);

      let charIndex = 0;

      function typeNextChar() {
        if (charIndex < fullText.length) {
          // Insert text node before the cursor
          const textNode = summaryEl.childNodes[0];
          if (textNode && textNode.nodeType === Node.TEXT_NODE) {
            textNode.textContent += fullText[charIndex];
          } else {
            // First character — create the text node before cursor
            summaryEl.insertBefore(
              document.createTextNode(fullText[charIndex]),
              cursor
            );
          }
          charIndex++;
          setTimeout(typeNextChar, 28);
        } else {
          // Typing complete — blink 3 more times then remove cursor
          setTimeout(() => {
            cursor.style.transition = 'opacity 0.3s ease';
            cursor.style.opacity = '0';
            setTimeout(() => {
              if (cursor.parentNode) cursor.parentNode.removeChild(cursor);
            }, 320);
          }, 1600);
        }
      }

      // Initial delay before first character
      setTimeout(typeNextChar, 320);
    }

    // IntersectionObserver — fires once when the mockup enters viewport
    // Target the parent feat-mock element for a more reliable trigger area
    const triggerEl = summaryEl.closest('.feat-mock') || summaryEl;

    const typeObserver = new IntersectionObserver(entries => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          runTypewriter();
          typeObserver.unobserve(entry.target);
        }
      });
    }, { threshold: 0.3, rootMargin: '0px 0px -60px 0px' });

    typeObserver.observe(triggerEl);
  })();

  /* ── DECRYPT CHIP REVEAL — PRIVACY SECTION ── */
  (function () {
    const SCRAMBLE_CHARS = 'ABCDEF0123456789#:%@!*+=';
    const SCRAMBLE_INTERVAL_MS = 55;
    const CHIP_STAGGER_MS = 110;
    const TOTAL_SCRAMBLE_MS = 480;

    function randomChar() {
      return SCRAMBLE_CHARS[Math.floor(Math.random() * SCRAMBLE_CHARS.length)];
    }

    function decryptChip(chip, label, onComplete) {
      // Lock the chip's width to its final rendered width BEFORE clearing text
      // This prevents layout reflow during scramble
      const finalWidth = chip.offsetWidth;
      chip.style.minWidth = finalWidth + 'px';

      // Make visible and fade in
      chip.classList.add('decrypt-active');
      requestAnimationFrame(() => {
        chip.style.opacity = '1';
      });

      const len = label.length;

      // Per-character lock times: character i locks at a random time
      // between (i / len * 0.4 * TOTAL) and (i / len * TOTAL + 80ms)
      // This ensures left-to-right resolution with some natural variance
      const lockTimes = Array.from({ length: len }, (_, i) => {
        const earliest = (i / len) * TOTAL_SCRAMBLE_MS * 0.55;
        const latest = (i / len) * TOTAL_SCRAMBLE_MS + 80;
        return earliest + Math.random() * (latest - earliest);
      });
      // Always lock first character fast
      lockTimes[0] = 40 + Math.random() * 40;
      // Always lock last character at or near TOTAL_SCRAMBLE_MS
      lockTimes[len - 1] = TOTAL_SCRAMBLE_MS - 20 + Math.random() * 30;

      const resolved = new Array(len).fill(false);
      const startTime = performance.now();

      const interval = setInterval(() => {
        const elapsed = performance.now() - startTime;
        let allDone = true;

        let display = '';
        for (let i = 0; i < len; i++) {
          if (!resolved[i] && elapsed >= lockTimes[i]) {
            resolved[i] = true;
          }
          if (resolved[i]) {
            display += label[i];
          } else {
            // Preserve spaces — scramble only non-space characters
            display += label[i] === ' ' ? ' ' : randomChar();
            allDone = false;
          }
        }

        chip.textContent = display;

        if (allDone) {
          clearInterval(interval);
          chip.textContent = label;
          chip.style.minWidth = '';
          chip.classList.add('decrypt-done');
          if (onComplete) onComplete();
        }
      }, SCRAMBLE_INTERVAL_MS);
    }

    const chips = Array.from(document.querySelectorAll('.decrypt-chip'));
    if (chips.length === 0) return;

    let hasRun = false;

    function runDecryptSequence() {
      if (hasRun) return;
      hasRun = true;

      chips.forEach((chip, i) => {
        const label = chip.dataset.label || chip.textContent.trim();
        setTimeout(() => {
          decryptChip(chip, label, null);
        }, i * CHIP_STAGGER_MS);
      });
    }

    // Trigger when the privacy-chips container enters the viewport
    const chipsContainer = document.querySelector('.privacy-chips');
    if (!chipsContainer) return;

    const decryptObserver = new IntersectionObserver(entries => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          runDecryptSequence();
          decryptObserver.unobserve(entry.target);
        }
      });
    }, { threshold: 0.5, rootMargin: '0px 0px -40px 0px' });

    decryptObserver.observe(chipsContainer);
  })();

})();
