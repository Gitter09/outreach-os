/* starfield.js — high-quality twinkling star field */
(function () {
  const canvas = document.getElementById('starfield');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');

  let W, H, stars = [];

  function resize() {
    const dpr = window.devicePixelRatio || 1;
    W = canvas.offsetWidth;
    H = canvas.offsetHeight;
    canvas.width  = W * dpr;
    canvas.height = H * dpr;
    ctx.scale(dpr, dpr);
  }

  function buildStars() {
    stars = [];
    const density = (W * H) / 3000;
    for (let i = 0; i < density; i++) {
      const base = Math.random() * 0.5 + 0.08;
      stars.push({
        x:    Math.random() * W,
        y:    Math.random() * H,
        r:    Math.random() * 1.1 + 0.15,
        base,
        amp:  base * 0.6,
        spd:  Math.random() * 0.008 + 0.003,
        off:  Math.random() * Math.PI * 2,
        vx:   (Math.random() - 0.5) * 0.03,
        vy:   (Math.random() - 0.5) * 0.02,
        // occasional brighter "cluster" star
        bright: Math.random() > 0.93,
      });
    }
  }

  // very faint "constellation" lines between nearby stars
  function drawConnections(t) {
    if (W < 800) return; // skip on mobile
    ctx.strokeStyle = 'rgba(255,255,255,0.018)';
    ctx.lineWidth = 0.5;
    const sample = stars.slice(0, 80); // only check subset
    for (let i = 0; i < sample.length; i++) {
      for (let j = i + 1; j < sample.length; j++) {
        const dx = sample[i].x - sample[j].x;
        const dy = sample[i].y - sample[j].y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist < 90) {
          const alpha = (1 - dist / 90) * 0.04;
          ctx.strokeStyle = `rgba(180,200,255,${alpha})`;
          ctx.beginPath();
          ctx.moveTo(sample[i].x, sample[i].y);
          ctx.lineTo(sample[j].x, sample[j].y);
          ctx.stroke();
        }
      }
    }
  }

  let t = 0;
  let raf;

  function frame() {
    ctx.clearRect(0, 0, W, H);
    t += 0.012;

    drawConnections(t);

    for (const s of stars) {
      // slow drift
      s.x += s.vx;
      s.y += s.vy;
      if (s.x < 0) s.x = W;
      if (s.x > W) s.x = 0;
      if (s.y < 0) s.y = H;
      if (s.y > H) s.y = 0;

      const alpha = s.base + Math.sin(t * s.spd * 55 + s.off) * s.amp;

      if (s.bright) {
        // draw a subtle cross/sparkle for brighter stars
        const r2 = s.r * 1.8;
        const grad = ctx.createRadialGradient(s.x, s.y, 0, s.x, s.y, r2 * 2.5);
        grad.addColorStop(0, `rgba(230,240,255,${alpha * 1.2})`);
        grad.addColorStop(1, 'transparent');
        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.arc(s.x, s.y, r2 * 2.5, 0, Math.PI * 2);
        ctx.fill();
      }

      ctx.beginPath();
      ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(220,232,255,${alpha})`;
      ctx.fill();
    }

    raf = requestAnimationFrame(frame);
  }

  function init() {
    resize();
    buildStars();
    cancelAnimationFrame(raf);
    frame();
  }

  window.addEventListener('resize', () => {
    resize();
    buildStars();
  });

  // start when DOM ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
