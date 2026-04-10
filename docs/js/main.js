/* main.js — interactions, scroll reveals, nav, tabs */
(function () {

  /* ── SITE HEADER & MOBILE MENU ── */
  const header = document.getElementById('site-header');
  const navToggle = document.getElementById('navbar-toggle');
  const mobileNav = document.getElementById('mobile-nav');
  const mobileLinks = document.querySelectorAll('.mobile-nav__link');

  function closeMenu() {
    header.classList.remove('is-menu-open');
    mobileNav.classList.remove('is-open');
    navToggle.setAttribute('aria-expanded', 'false');
    document.body.style.overflow = '';
    mobileNav.setAttribute('inert', 'true');
  }

  // Toggle mobile menu
  navToggle?.addEventListener('click', () => {
    const isExpanded = navToggle.getAttribute('aria-expanded') === 'true';
    navToggle.setAttribute('aria-expanded', !isExpanded);
    header.classList.toggle('is-menu-open');
    mobileNav.classList.toggle('is-open');

    // Toggle proper scrolling & inert attribute for accessibility
    if (mobileNav.classList.contains('is-open')) {
      document.body.style.overflow = 'hidden';
      // Remove inert when menu opens
      if (mobileNav.hasAttribute('inert')) mobileNav.removeAttribute('inert');
    } else {
      document.body.style.overflow = '';
      mobileNav.setAttribute('inert', 'true');
    }
  });

  // Close menu on link click
  mobileLinks.forEach(link => {
    link.addEventListener('click', () => closeMenu());
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
    entries.forEach((entry) => {
      if (entry.isIntersecting) {
        // stagger siblings inside the same parent
        const parent = entry.target.parentElement;
        const siblings = Array.from(parent.querySelectorAll('.reveal:not(.in)'));
        siblings.forEach((el) => {
          const base = parseFloat(getComputedStyle(el).transitionDelay) || 0;
          const extra = siblings.indexOf(el) * 0.07;
          el.style.transitionDelay = `${base + extra}s`;
          requestAnimationFrame(() => el.classList.add('in'));
        });
        // always trigger the observed element too
        entry.target.classList.add('in');
        observer.unobserve(entry.target);
      }
    });
  }, { threshold: 0.12, rootMargin: '0px 0px -40px 0px' });

  revealEls.forEach((el) => observer.observe(el));


  /* ── ENGINE BODY TEXT: WORD-BY-WORD SCROLL REVEAL ── */
  (function () {
    const engineSection = document.getElementById('engine');
    const engineBody = document.getElementById('engine-body');
    if (!engineSection || !engineBody) return;

    // Split text into word spans
    const rawText = engineBody.textContent.replace(/\s+/g, ' ').trim();
    const words = rawText.split(' ');
    engineBody.textContent = '';

    const wordEls = [];
    words.forEach((word, i) => {
      const span = document.createElement('span');
      span.className = 'engine-word';
      span.textContent = word;
      engineBody.appendChild(span);
      wordEls.push(span);
      if (i < words.length - 1) {
        engineBody.appendChild(document.createTextNode(' '));
      }
    });

    const totalWords = wordEls.length;

    function updateEngineText() {
      const rect = engineSection.getBoundingClientRect();
      const scrollable = engineSection.offsetHeight - window.innerHeight;
      if (scrollable <= 0) return;
      const scrolled = -rect.top;
      const progress = Math.max(0, Math.min(1, scrolled / scrollable));
      const litCount = Math.round(progress * totalWords);

      for (let i = 0; i < totalWords; i++) {
        if (i < litCount) {
          if (!wordEls[i].classList.contains('is-lit')) {
            wordEls[i].classList.add('is-lit');
          }
        } else {
          if (wordEls[i].classList.contains('is-lit')) {
            wordEls[i].classList.remove('is-lit');
          }
        }
      }
    }

    window.addEventListener('scroll', updateEngineText, { passive: true });
    updateEngineText();
  })();


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

    HEADLINE_SELECTORS.forEach((sel) => {
      document.querySelectorAll(sel).forEach((el) => {
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

    const clipObserver = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          revealClip(entry.target);
          clipObserver.unobserve(entry.target);
        }
      });
    }, { threshold: 0.12, rootMargin: '0px 0px -40px 0px' });

    allHeadlines.forEach((wrapper) => clipObserver.observe(wrapper));

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

    const typeObserver = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
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
      chip.style.minWidth = `${finalWidth}px`;

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

    const decryptObserver = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          runDecryptSequence();
          decryptObserver.unobserve(entry.target);
        }
      });
    }, { threshold: 0.5, rootMargin: '0px 0px -40px 0px' });

    decryptObserver.observe(chipsContainer);
  })();


  /* ── TEASER / COUNTDOWN LOGIC ── */
  (function () {
    const TARGET_DATE = new Date('2026-04-15T11:00:00+05:30').getTime();

    function updateCountdown() {
      const now = new Date().getTime();
      const distance = TARGET_DATE - now;

      if (distance <= 0) {
        window.JOBDEX_TEASER_ACTIVE = false;
        const countdownContainer = document.getElementById('launch-countdown');
        if (countdownContainer) {
          countdownContainer.innerHTML = '<div style="font-size: 24px; font-weight: 600;">JobDex is now available!</div>';
          setTimeout(() => { window.location.href = 'download.html'; }, 2000);
        }
        return false;
      }

      window.JOBDEX_TEASER_ACTIVE = true;
      const elDays = document.getElementById('cd-days');
      if (elDays) {
        document.getElementById('cd-days').textContent = Math.floor(distance / (1000 * 60 * 60 * 24)).toString().padStart(2, '0');
        document.getElementById('cd-hours').textContent = Math.floor((distance % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60)).toString().padStart(2, '0');
        document.getElementById('cd-minutes').textContent = Math.floor((distance % (1000 * 60 * 60)) / (1000 * 60)).toString().padStart(2, '0');
        document.getElementById('cd-seconds').textContent = Math.floor((distance % (1000 * 60)) / 1000).toString().padStart(2, '0');
      }
      return true;
    }

    if (updateCountdown()) {
      setInterval(updateCountdown, 1000);
    } else {
      // Past release date: override hardcoded "Get Notified" in HTML back to downlods
      const buttons = document.querySelectorAll('[data-download="cta"]');
      buttons.forEach(btn => {
        if (btn.dataset.fallbackHref) btn.href = btn.dataset.fallbackHref;
        if (btn.dataset.fallbackText) btn.innerHTML = btn.dataset.fallbackText;
      });
      const allDls = document.querySelector('.hero-all-downloads');
      if (allDls && allDls.dataset.fallbackHref) {
        allDls.href = allDls.dataset.fallbackHref;
      }
    }
  })();


  /* ── OS-AWARE DOWNLOAD BUTTONS ── */
  (function () {
    const GITHUB_API = 'https://api.github.com/repos/Gitter09/jobdex/releases/latest';
    const CACHE_KEY = 'jobdex_release';

    function detectOS() {
      const ua = navigator.userAgent || '';
      const platform = navigator.platform || '';
      if (/Mac|iPhone|iPad|iPod/i.test(platform) || /Macintosh/i.test(ua)) return 'mac';
      if (/Win/i.test(platform) || /Windows/i.test(ua)) return 'windows';
      return 'other';
    }

    function getRecommendedAsset(os, assets) {
      if (!assets || !assets.length) return null;
      let match = null;
      if (os === 'mac') {
        match = assets.find((a) => /_aarch64\.dmg$/.test(a.name));
      } else if (os === 'windows') {
        match = assets.find((a) => /_x64-setup\.exe$/.test(a.name));
      }
      return match || null;
    }

    function osLabel(os) {
      if (os === 'mac') return 'macOS';
      if (os === 'windows') return 'Windows';
      return null;
    }

    function fetchLatestRelease() {
      // Check sessionStorage cache first
      try {
        const cached = sessionStorage.getItem(CACHE_KEY);
        if (cached) return Promise.resolve(JSON.parse(cached));
      } catch (e) { /* sessionStorage unavailable */ }

      return fetch(GITHUB_API)
        .then((r) => {
          if (!r.ok) throw new Error(r.status);
          return r.json();
        })
        .then((data) => {
          const result = {
            tag: data.tag_name,
            version: (data.tag_name || '').replace(/^v/, ''),
            assets: (data.assets || []).map((a) => ({
              name: a.name, url: a.browser_download_url, size: a.size
            }))
          };
          try { sessionStorage.setItem(CACHE_KEY, JSON.stringify(result)); } catch (e) { /* sessionStorage unavailable */ }
          return result;
        });
    }

    function osIcon(os) {
      if (os === 'mac') {
        return '<svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" style="flex-shrink:0"><path d="M18.71 19.5c-.83 1.24-1.71 2.45-3.05 2.47-1.34.03-1.77-.79-3.29-.79-1.53 0-2 .77-3.27.82-1.31.05-2.3-1.32-3.14-2.53C4.25 17 2.94 12.45 4.7 9.39c.87-1.52 2.43-2.48 4.12-2.51 1.28-.02 2.5.87 3.29.87.78 0 2.26-1.07 3.8-.91.65.03 2.47.26 3.64 1.98-.09.06-2.17 1.28-2.15 3.81.03 3.02 2.65 4.03 2.68 4.04-.03.07-.42 1.44-1.38 2.83M13 3.5c.73-.83 1.94-1.46 2.94-1.5.13 1.17-.34 2.35-1.04 3.19-.69.85-1.83 1.51-2.95 1.42-.15-1.15.41-2.35 1.05-3.11z"/></svg>';
      }
      if (os === 'windows') {
        return '<svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" style="flex-shrink:0"><path d="M3 12V6.5l8-1.1V12H3zm0 .5h8v6.6l-8-1.1V12.5zM11.5 5.3l9.5-1.3v8h-9.5V5.3zm0 7.2h9.5v8l-9.5-1.3v-6.7z"/></svg>';
      }
      return '<span>↓</span>';
    }

    function enhanceButtons(os, asset) {
      if (window.JOBDEX_TEASER_ACTIVE) return;

      const label = osLabel(os);
      if (!label || !asset) return;

      const icon = osIcon(os);
      const buttons = document.querySelectorAll('[data-download="cta"]');
      buttons.forEach((btn) => {
        btn.href = asset.url;
        btn.innerHTML = `${icon}&nbsp;&nbsp;Download for ${label}`;
      });
    }

    // Enhance version badges on download page
    function enhanceDownloadPage(release, os) {
      const versionEls = document.querySelectorAll('[data-download="version"]');
      versionEls.forEach((el) => { el.textContent = `v${release.version}`; });

      const label = osLabel(os);
      const asset = getRecommendedAsset(os, release.assets);

      // Recommended section
      const recSection = document.getElementById('dl-recommended');
      const recFallback = document.getElementById('dl-fallback');

      function showRecommended(visible) {
        if (!recSection) return;
        recSection.style.display = visible ? '' : 'none';
        if (recFallback) recFallback.style.display = visible ? 'none' : '';
      }

      if (recSection && asset && label) {
        showRecommended(true);

        const recBtn = recSection.querySelector('[data-download="rec-btn"]');
        const recLabel = recSection.querySelector('[data-download="rec-label"]');
        const recNote = recSection.querySelector('[data-download="rec-note"]');
        const recIcon = recSection.querySelector('[data-download="rec-icon"]');
        if (recBtn) {
          recBtn.href = asset.url;
          recBtn.innerHTML = `&darr;&nbsp;&nbsp;Download for ${label}`;
        }
        if (recLabel) recLabel.textContent = label;
        if (recNote) {
          recNote.textContent = os === 'mac' ? 'Apple Silicon (M1+) · .dmg' : 'Windows 10/11 (64-bit) · .exe';
        }
        if (recIcon) recIcon.setAttribute('data-os', os);
      } else if (recSection) {
        showRecommended(false);
      }

      // All platforms grid
      const grid = document.getElementById('dl-grid');
      if (!grid) return;

      const assetMap = {
        'mac-dmg': { pattern: /_aarch64\.dmg$/, label: 'macOS (Apple Silicon)', note: '.dmg · M1+' },
        'win-exe': { pattern: /_x64-setup\.exe$/, label: 'Windows (64-bit)', note: '.exe installer' },
        'win-msi': { pattern: /_x64_en-US\.msi$/, label: 'Windows (64-bit)', note: '.msi installer' },
        'linux-deb': { pattern: /_amd64\.deb$/, label: 'Linux (Debian/Ubuntu)', note: '.deb package' },
        'linux-rpm': { pattern: /\.x86_64\.rpm$/, label: 'Linux (Fedora/RHEL)', note: '.rpm package' },
        'linux-appimage': { pattern: /_amd64\.AppImage$/, label: 'Linux (Universal)', note: '.AppImage' }
      };

      Object.keys(assetMap).forEach((key) => {
        const slot = grid.querySelector(`[data-asset="${key}"]`);
        if (!slot) return;
        const info = assetMap[key];
        const found = release.assets.find((a) => info.pattern.test(a.name));
        if (found) {
          const link = slot.querySelector('a');
          if (link) link.href = found.url;
          slot.style.display = '';
        } else {
          slot.style.display = 'none';
        }
      });
    }

    // Run
    const os = detectOS();
    fetchLatestRelease()
      .then((release) => {
        const asset = getRecommendedAsset(os, release.assets);
        enhanceButtons(os, asset);
        enhanceDownloadPage(release, os);
      })
      .catch(() => {
        // Graceful degradation — buttons keep their GitHub Releases fallback href
      });
  })();

})();
