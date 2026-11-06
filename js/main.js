/*
 * sLED – hlavný skript: smooth scroll, preloader, hero, scroll animácie, kurzor, interakcie.
 */
(() => {
  'use strict';

  const doc = document.documentElement;
  const $ = (s, c = document) => c.querySelector(s);
  const $$ = (s, c = document) => Array.from(c.querySelectorAll(s));
  const reduce = doc.classList.contains('reduced');
  const fine = matchMedia('(hover: hover) and (pointer: fine)').matches;
  const hasGsap = !!(window.gsap && window.ScrollTrigger && window.SplitText);

  window.__sledReady = true;
  window.SLED_REDUCED = reduce;
  const SLED = (window.SLED = { reduce, lenis: null });

  /* ------------------------------------------------------------------ základ (bez GSAP) */
  const yearEl = $('[data-year]');
  if (yearEl) yearEl.textContent = new Date().getFullYear();

  $$('[data-copy]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const txt = btn.dataset.copy;
      const ok = () => {
        btn.classList.add('is-done');
        btn.textContent = 'Skopírované';
        setTimeout(() => { btn.classList.remove('is-done'); btn.textContent = 'Kopírovať'; }, 1800);
      };
      if (navigator.clipboard) navigator.clipboard.writeText(txt).then(ok).catch(() => {});
    });
  });

  // živé hodiny v HUD
  const tc = $('[data-timecode]');
  if (tc) {
    const pad = (n) => String(n).padStart(2, '0');
    const tick = () => { const d = new Date(); tc.textContent = `CAM 01 — ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`; };
    tick(); setInterval(tick, 1000);
  }

  // lenivé načítanie videa na pozadí sekcie Obrazovka
  $$('video[data-lazy-video]').forEach((v) => {
    if (!('IntersectionObserver' in window)) return;
    let loaded = false;
    new IntersectionObserver(([e]) => {
      if (e.isIntersecting) {
        if (!loaded) {
          $$('source[data-src]', v).forEach((s) => { s.src = s.dataset.src; });
          v.load(); loaded = true;
        }
        if (!reduce) v.play().catch(() => {});
      } else if (loaded) v.pause();
    }, { rootMargin: '300px 0px' }).observe(v);
  });

  const heroVideo = $('.hero__video');
  if (heroVideo) {
    if (reduce) { heroVideo.removeAttribute('autoplay'); heroVideo.pause(); }
    else heroVideo.play().catch(() => {});
  }

  function initForms() {
    if (window.SLEDForms) SLEDForms.bind($('#collab-form'), { type: 'collab' });
    if (window.SLEDCalc) SLEDCalc.init($('[data-calc-root]'));
  }

  if (!hasGsap) {
    doc.classList.add('no-anim');
    initForms();
    return;
  }

  gsap.registerPlugin(ScrollTrigger, SplitText);
  gsap.defaults({ ease: 'expo.out' });

  /* ------------------------------------------------------------------ smooth scroll */
  let lenis = null;
  if (!reduce && window.Lenis) {
    lenis = new Lenis({ lerp: 0.09, smoothWheel: true, wheelMultiplier: 1 });
    lenis.on('scroll', ScrollTrigger.update);
    gsap.ticker.add((t) => lenis.raf(t * 1000));
    gsap.ticker.lagSmoothing(0);
    SLED.lenis = lenis;
  }

  SLED.scrollTo = (target, offset = 0, immediate = false) => {
    if (lenis) {
      lenis.scrollTo(target, { offset, immediate, duration: 1.6, easing: (t) => 1 - Math.pow(1 - t, 4) });
      return;
    }
    const el = typeof target === 'string' ? $(target) : target;
    const y = typeof target === 'number' ? target : el ? el.getBoundingClientRect().top + window.scrollY + offset : 0;
    window.scrollTo({ top: y, behavior: reduce || immediate ? 'auto' : 'smooth' });
  };

  /* ------------------------------------------------------------------ navigácia, kotvy */
  const header = $('.header');
  const burger = $('.burger');
  const menu = $('#menu');

  function openMenu() {
    doc.classList.add('menu-open');
    burger.setAttribute('aria-expanded', 'true');
    burger.querySelector('.sr-only').textContent = 'Zavrieť menu';
    menu.inert = false;
    if (lenis) lenis.stop();
    if (!reduce) {
      gsap.fromTo($$('.menu__list a', menu), { yPercent: 110 }, { yPercent: 0, duration: 1.1, stagger: 0.06, delay: 0.25 });
      gsap.fromTo($('.menu__foot', menu), { opacity: 0, y: 20 }, { opacity: 1, y: 0, duration: 1, delay: 0.55 });
    }
  }
  function closeMenu() {
    if (!doc.classList.contains('menu-open')) return;
    doc.classList.remove('menu-open');
    burger.setAttribute('aria-expanded', 'false');
    burger.querySelector('.sr-only').textContent = 'Otvoriť menu';
    menu.inert = true;
    if (lenis) lenis.start();
  }
  burger.addEventListener('click', () => (doc.classList.contains('menu-open') ? closeMenu() : openMenu()));
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeMenu(); });

  document.addEventListener('click', (e) => {
    const a = e.target.closest('a[href^="#"]');
    if (!a || a.classList.contains('skip-link')) return;
    const id = a.getAttribute('href');
    if (id.length < 2) return;
    const target = id === '#top' ? 0 : $(id);
    if (target === null) return;
    e.preventDefault();
    const wasOpen = doc.classList.contains('menu-open');
    closeMenu();
    setTimeout(() => SLED.scrollTo(target), wasOpen ? 250 : 0);
    history.replaceState(null, '', id === '#top' ? location.pathname + location.search : id);
    if (target && target.focus) setTimeout(() => target.focus({ preventScroll: true }), 1200);
  });

  // hlavička: skrývanie pri scrolle nadol, priebeh scrollu
  let lastY = 0;
  const progressBar = $('.header__progress');
  ScrollTrigger.create({
    start: 0,
    end: 'max',
    onUpdate: (self) => {
      const y = self.scroll();
      header.classList.toggle('is-scrolled', y > 30);
      if (Math.abs(y - lastY) > 6) {
        header.classList.toggle('is-hidden', y > lastY && y > window.innerHeight * 0.7 && !doc.classList.contains('menu-open'));
        lastY = y;
      }
      progressBar.style.transform = `scaleX(${self.progress})`;
    }
  });

  // aktívna položka menu
  $$('.nav a').forEach((a) => {
    const sec = $(a.getAttribute('href'));
    if (!sec) return;
    ScrollTrigger.create({
      trigger: sec, start: 'top 55%', end: 'bottom 55%',
      onToggle: (self) => a.classList.toggle('is-active', self.isActive)
    });
  });

  /* ------------------------------------------------------------------ hero */
  const hero = $('.hero');
  let shader = null;
  if (!reduce && window.SLEDShader && heroVideo) {
    shader = SLEDShader.init($('.hero__gl'), heroVideo, {
      pointerTarget: hero,
      lens: fine,
      maxDpr: fine ? 1.5 : 1.25,
      onFail: () => hero.classList.remove('has-gl')
    });
    if (shader) hero.classList.add('has-gl');
  }

  function heroIntro() {
    const title = $('.hero__title');
    doc.classList.add('is-loaded');
    if (reduce) return;

    const lines = $$('.line', title);
    const split = SplitText.create(lines, { type: 'chars', charsClass: 'char', aria: 'none' });
    gsap.set(title, { visibility: 'visible' });

    const tl = gsap.timeline();
    if (shader) {
      const st = { v: 0 };
      tl.to(st, { v: 1, duration: 2.8, ease: 'power2.inOut', onUpdate: () => shader.setIntro(st.v) }, 0);
    } else {
      tl.from(heroVideo, { scale: 1.25, duration: 2.6, ease: 'expo.out' }, 0);
    }
    tl.from(split.chars, { yPercent: 118, duration: 1.5, stagger: 0.026 }, 0.25)
      .fromTo(split.chars, { fontStretch: '62%' }, { fontStretch: '125%', duration: 1.8, stagger: 0.026, ease: 'expo.inOut' }, 0.25)
      .fromTo('.hero__title em', { opacity: 1 }, {
        keyframes: [
          { opacity: 0.15, duration: 0.05 }, { opacity: 1, duration: 0.06 },
          { opacity: 0.3, duration: 0.08 }, { opacity: 1, duration: 0.05 },
          { opacity: 0.6, duration: 0.05 }, { opacity: 1, duration: 0.2 }
        ], ease: 'none'
      }, 1.35)
      .fromTo('[data-hero-fade]', { opacity: 0, y: 30 }, { opacity: 1, y: 0, duration: 1.4, stagger: 0.1 }, 0.9)
      .from('.hud > *', { opacity: 0, x: 20, duration: 1, stagger: 0.08 }, 1.1)
      .from('.hero__ticker', { yPercent: 100, duration: 1.2 }, 1.2)
      .add(() => { split.revert(); title.classList.add('is-done'); }, '+=0.2');
  }

  if (!reduce) {
    const outTl = gsap.timeline({
      scrollTrigger: {
        trigger: hero, start: 'top top', end: 'bottom top', scrub: true,
        onUpdate: (self) => shader && shader.setOut(self.progress)
      }
    });
    outTl.to('.hero__content', { yPercent: -22, opacity: 0, ease: 'none' }, 0)
      .to('.hud', { opacity: 0, ease: 'none' }, 0);
    if (!shader) outTl.to(heroVideo, { scale: 1.12, ease: 'none' }, 0);
  }

  /* ------------------------------------------------------------------ preloader */
  const hashTarget = location.hash && location.hash.length > 1 ? (() => { try { return $(location.hash); } catch (e) { return null; } })() : null;

  function preloader() {
    return new Promise((resolve) => {
      const pre = $('.preloader');
      if (!pre || reduce || hashTarget || doc.classList.contains('no-preload')) {
        if (pre) pre.remove();
        resolve();
        return;
      }
      try { sessionStorage.setItem('sled-visited', '1'); } catch (e) { /* noop */ }
      if (lenis) lenis.stop();

      const count = $('.preloader__count', pre);
      const bar = $('.preloader__bar', pre);
      const matrix = new LEDMatrix($('.preloader__matrix', pre), { pitch: 12, minRows: 24, color: '#ED1566', ease: 0.28, offAlpha: 0.05 });
      const st = { p: 0 };
      const upd = () => {
        count.textContent = String(Math.round(st.p * 100)).padStart(3, '0');
        bar.style.transform = `scaleX(${st.p})`;
        matrix.setProgress(st.p);
      };
      gsap.set(pre, { clipPath: 'inset(0% 0% 0% 0%)' });

      const fontReady = document.fonts ? document.fonts.load('800 100px "Archivo Variable"').catch(() => {}) : Promise.resolve();
      const videoReady = new Promise((r) => {
        if (!heroVideo || heroVideo.readyState >= 3) return r();
        heroVideo.addEventListener('canplay', r, { once: true });
        setTimeout(r, 4500);
      });

      fontReady.then(() => {
        matrix.setText('sLED', { fill: 0.86 });
        matrix.setProgress(0);
        const tl = gsap.timeline();
        tl.to(st, { p: 0.82, duration: 1.7, ease: 'power2.inOut', onUpdate: upd });
        videoReady.then(() => {
          tl.to(st, { p: 1, duration: 0.45, ease: 'power2.out', onUpdate: upd })
            .to(pre, {
              clipPath: 'inset(0% 0% 100% 0%)', duration: 1.15, ease: 'expo.inOut',
              onStart: resolve,
              onComplete: () => { matrix.destroy(); pre.remove(); if (lenis) lenis.start(); }
            }, '+=0.3');
        });
      });
    });
  }

  /* ------------------------------------------------------------------ scroll animácie */
  function scrollAnimations() {
    if (reduce) return;

    // nadpisy po riadkoch (až po načítaní fontov, aby sedeli zalomenia)
    const fontsReady = document.fonts ? document.fonts.ready : Promise.resolve();
    fontsReady.then(() => $$('[data-split]').forEach((h) => {
      SplitText.create(h, {
        type: 'lines', mask: 'lines', autoSplit: true,
        onSplit: (self) => gsap.from(self.lines, {
          yPercent: 115, duration: 1.3, stagger: 0.1,
          scrollTrigger: { trigger: h, start: 'top 88%', once: true }
        })
      });
    }));

    // výrok v Info – slová sa rozsvecujú pri scrolle
    const statement = $('[data-scrub-words]');
    if (statement) {
      gsap.set(statement, { opacity: 0.12 });
      fontsReady.then(() => {
        const split = SplitText.create(statement, { type: 'words', wordsClass: 'word' });
        gsap.set(statement, { opacity: 1 });
        gsap.fromTo(split.words, { opacity: 0.12 }, {
          opacity: 1, stagger: 0.12, ease: 'none',
          scrollTrigger: { trigger: statement, start: 'top 82%', end: 'bottom 48%', scrub: true }
        });
        ScrollTrigger.refresh();
      });
    }

    // odhaľovanie blokov
    gsap.set('[data-reveal]', { opacity: 0, y: 44 });
    ScrollTrigger.batch('[data-reveal]', {
      start: 'top 90%', once: true,
      onEnter: (els) => gsap.to(els, { opacity: 1, y: 0, duration: 1.2, stagger: 0.08, overwrite: true })
    });

    // médiá – clip-path a parallax
    $$('[data-clip]').forEach((el) => {
      gsap.fromTo(el, { clipPath: 'inset(16% 9% 16% 9% round 24px)' }, {
        clipPath: 'inset(0% 0% 0% 0% round 24px)', ease: 'none',
        scrollTrigger: { trigger: el, start: 'top 95%', end: 'top 30%', scrub: true }
      });
    });
    $$('[data-parallax]').forEach((img) => {
      gsap.fromTo(img, { yPercent: -6 }, {
        yPercent: 6, ease: 'none',
        scrollTrigger: { trigger: img.parentElement, start: 'top bottom', end: 'bottom top', scrub: true }
      });
    });

    // počítadlá
    $$('[data-count]').forEach((el) => {
      const end = parseFloat(el.dataset.count);
      const dec = parseInt(el.dataset.decimals || '0', 10);
      const fmt = new Intl.NumberFormat('sk-SK', { minimumFractionDigits: dec, maximumFractionDigits: dec });
      const o = { v: 0 };
      el.textContent = fmt.format(0);
      ScrollTrigger.create({
        trigger: el, start: 'top 92%', once: true,
        onEnter: () => gsap.to(o, { v: end, duration: 2.2, delay: 0.2, onUpdate: () => { el.textContent = fmt.format(o.v); } })
      });
    });

    // marquee – rýchlosť a smer podľa scrollu
    const rows = $$('[data-marquee]').map((row) => ({ row, dir: Number(row.dataset.marquee) || 1, x: 0, w: 0 }));
    if (rows.length) {
      const measure = () => rows.forEach((r) => { r.w = r.row.scrollWidth / 2; });
      measure();
      window.addEventListener('resize', measure);
      let visible = false, vel = 0, sign = 1;
      new IntersectionObserver(([e]) => { visible = e.isIntersecting; }).observe($('.marquee'));
      const velST = ScrollTrigger.create({ start: 0, end: 'max' });
      gsap.ticker.add((time, dt) => {
        if (!visible) return;
        const v = velST.getVelocity() / 1000;
        vel += (v - vel) * 0.08;
        if (Math.abs(vel) > 0.15) sign = vel > 0 ? 1 : -1;
        const f = dt / 16.67;
        rows.forEach((r) => {
          r.x -= (0.7 + Math.min(Math.abs(vel) * 6, 14)) * r.dir * sign * f;
          if (r.x <= -r.w) r.x += r.w;
          if (r.x > 0) r.x -= r.w;
          r.row.style.transform = `translate3d(${r.x}px,0,0) skewX(${gsap.utils.clamp(-8, 8, -vel * 3)}deg)`;
        });
      });
    }

    // mapa – vykreslenie cesty a bodov
    const road = $('.map__road');
    if (road) {
      const glow = $('.map__road-glow');
      const len = road.getTotalLength();
      gsap.set([road, glow], { strokeDasharray: len, strokeDashoffset: len });
      gsap.timeline({ scrollTrigger: { trigger: '.map', start: 'top 82%', end: 'center 50%', scrub: 1 } })
        .from('.map__minor path', { opacity: 0, stagger: 0.05, ease: 'none' }, 0)
        .to([road, glow], { strokeDashoffset: 0, ease: 'none', duration: 1 }, 0)
        .from('.map__center', { opacity: 0, scale: 0.6, transformOrigin: '50% 50%', ease: 'none' }, 0.4)
        .from('[data-poi]', { opacity: 0, scale: 0, transformOrigin: '50% 50%', stagger: 0.12, ease: 'back.out(2)' }, 0.45)
        .from(['.map__street', '.map__cars'], { opacity: 0, ease: 'none' }, 0.85);
    }

    // billboard – 3D otočenie
    if ($('.bb')) {
      gsap.fromTo('.bb', { rotateY: -30, rotateX: 14, scale: 0.82, y: 60 }, {
        rotateY: 0, rotateX: 0, scale: 1, y: 0, ease: 'none',
        scrollTrigger: { trigger: '.bb-stage', start: 'top 96%', end: 'center 55%', scrub: 1 }
      });
      gsap.from('.bb__dim', {
        opacity: 0, duration: 1.2, stagger: 0.15,
        scrollTrigger: { trigger: '.bb-stage', start: 'center 62%', once: true }
      });
    }

    // postup – horizontálny scroll (desktop)
    const mm = gsap.matchMedia();
    mm.add('(min-width: 900px)', () => {
      const track = $('.process__track');
      const vp = $('.process__viewport');
      const dist = () => Math.max(0, track.scrollWidth - vp.clientWidth);
      if (dist() <= 0) return;
      gsap.to(track, {
        x: () => -dist(), ease: 'none',
        scrollTrigger: {
          trigger: '.process', start: 'top top', end: () => '+=' + dist(),
          pin: true, scrub: 1, invalidateOnRefresh: true, refreshPriority: 1,
          onUpdate: (self) => gsap.set('.process__bar span', { scaleX: self.progress })
        }
      });
      gsap.from('.step', {
        opacity: 0, y: 80, rotate: 2, duration: 1.3, stagger: 0.1,
        scrollTrigger: { trigger: '.process', start: 'top 70%', once: true }
      });
    });
    mm.add('(max-width: 899px)', () => {
      gsap.set('.step', { opacity: 0, y: 50 });
      ScrollTrigger.batch('.step', { start: 'top 90%', once: true, onEnter: (els) => gsap.to(els, { opacity: 1, y: 0, duration: 1.1, stagger: 0.1 }) });
    });

    // pätička
    gsap.from('.footer__title, .footer__btns, .footer__cols > *', {
      opacity: 0, y: 40, duration: 1.2, stagger: 0.08,
      scrollTrigger: { trigger: 'main', start: 'bottom 75%', once: true }
    });
  }

  /* ------------------------------------------------------------------ LED billboard + pätička */
  function ledCanvases() {
    if (!window.LEDMatrix) return;
    const stops = ['#ED1566', '#FF6A3D', '#9B5CFF', '#2F8BFF', '#ED1566'];
    const bbCanvas = $('.bb__led');
    if (bbCanvas) {
      const bb = new LEDMatrix(bbCanvas, {
        pitch: 9, minRows: 40, offAlpha: 0.09, dot: 0.78,
        gradient: (ctx, w, h, t) => {
          const shift = (t * 0.18) % 1;
          const g = ctx.createLinearGradient(-w * shift, 0, w * 2 - w * shift, h * 0.4);
          stops.concat(stops.slice(1)).forEach((c, i, arr) => g.addColorStop(i / (arr.length - 1), c));
          return g;
        }
      });
      if (reduce) bb.setText('VAŠA REKLAMA TU', { fill: 0.5 });
      else bb.setMarquee('VAŠA REKLAMA TU  ✦  sLED  ✦  STARÁ ĽUBOVŇA  ✦  ', { speed: 22, fill: 0.56 });
    }

    const fCanvas = $('.footer__word canvas');
    if (fCanvas) {
      const fm = new LEDMatrix(fCanvas, { pitch: 11, minRows: 28, color: '#ED1566', order: 'sweep', interactive: fine, offAlpha: 0.055, ease: 0.2 });
      const ready = document.fonts ? document.fonts.load('800 100px "Archivo Variable"') : Promise.resolve();
      ready.catch(() => {}).then(() => {
        fm.setText('sLED', { fill: 0.92 });
        if (reduce) { fm.setProgress(1); return; }
        fm.setProgress(0);
        const st = { p: 0 };
        ScrollTrigger.create({
          trigger: 'main', start: 'bottom 70%', once: true,
          onEnter: () => gsap.to(st, { p: 1, duration: 2.4, ease: 'power2.out', onUpdate: () => fm.setProgress(st.p) })
        });
      });
    }
  }

  // pätička ako „opona“ – iba ak sa zmestí do okna
  const footer = $('.footer');
  function footerMode() {
    const fits = footer.offsetHeight < window.innerHeight - 20 && window.innerWidth >= 900 && !reduce;
    if (fits !== footer.classList.contains('footer--reveal')) {
      footer.classList.toggle('footer--reveal', fits);
      ScrollTrigger.refresh();
    }
  }

  /* ------------------------------------------------------------------ kurzor, magnet, spotlight */
  function pointerFx() {
    $$('.spot-hover').forEach((el) => {
      el.addEventListener('pointermove', (e) => {
        const r = el.getBoundingClientRect();
        el.style.setProperty('--mx', `${e.clientX - r.left}px`);
        el.style.setProperty('--my', `${e.clientY - r.top}px`);
      });
    });
    $$('.btn--primary').forEach((el) => {
      el.addEventListener('pointermove', (e) => {
        const r = el.getBoundingClientRect();
        el.style.setProperty('--bx', `${e.clientX - r.left}px`);
        el.style.setProperty('--by', `${e.clientY - r.top}px`);
      });
    });

    if (!fine || reduce) return;

    $$('.magnetic').forEach((el) => {
      const xTo = gsap.quickTo(el, 'x', { duration: 0.8, ease: 'elastic.out(1, 0.4)' });
      const yTo = gsap.quickTo(el, 'y', { duration: 0.8, ease: 'elastic.out(1, 0.4)' });
      el.addEventListener('pointermove', (e) => {
        const r = el.getBoundingClientRect();
        xTo((e.clientX - (r.left + r.width / 2)) * 0.28);
        yTo((e.clientY - (r.top + r.height / 2)) * 0.38);
      });
      el.addEventListener('pointerleave', () => { xTo(0); yTo(0); });
    });

    doc.classList.add('has-cursor');
    const cur = $('.cursor');
    const dot = $('.cursor__dot');
    const ring = $('.cursor__ring');
    const label = $('.cursor__label');
    const dx = gsap.quickTo(dot, 'x', { duration: 0.1, ease: 'power3' });
    const dy = gsap.quickTo(dot, 'y', { duration: 0.1, ease: 'power3' });
    const rx = gsap.quickTo(ring, 'x', { duration: 0.55, ease: 'power3' });
    const ry = gsap.quickTo(ring, 'y', { duration: 0.55, ease: 'power3' });
    cur.classList.add('is-hidden');
    window.addEventListener('pointermove', (e) => {
      if (e.pointerType !== 'mouse') return;
      dx(e.clientX); dy(e.clientY); rx(e.clientX); ry(e.clientY);
      cur.classList.remove('is-hidden');
    });
    doc.addEventListener('pointerleave', () => cur.classList.add('is-hidden'));
    document.addEventListener('pointerover', (e) => {
      const el = e.target;
      if (!(el instanceof Element)) return;
      const lab = el.closest('[data-cursor]');
      const inter = el.closest('a, button, label, .chip, .toggle, [role="button"]');
      const text = el.closest('input[type="text"], input[type="email"], input[type="tel"], input[type="month"], textarea');
      cur.classList.toggle('is-label', !!lab && !inter);
      label.textContent = lab && !inter ? lab.dataset.cursor : '';
      cur.classList.toggle('is-hover', !!inter);
      cur.classList.toggle('is-text', !!text);
    });
    document.addEventListener('pointerdown', () => gsap.to(ring, { scale: 0.8, duration: 0.2 }));
    document.addEventListener('pointerup', () => gsap.to(ring, { scale: 1, duration: 0.4 }));
  }

  /* ------------------------------------------------------------------ štart */
  initForms();
  pointerFx();
  ledCanvases();
  scrollAnimations();

  if (reduce) $$('.map__svg').forEach((s) => s.pauseAnimations && s.pauseAnimations());

  ScrollTrigger.sort();
  footerMode();
  window.addEventListener('resize', () => { clearTimeout(footerMode.t); footerMode.t = setTimeout(footerMode, 200); });

  if (document.fonts) document.fonts.ready.then(() => ScrollTrigger.refresh());

  preloader().then(() => {
    heroIntro();
    if (hashTarget) {
      ScrollTrigger.refresh();
      requestAnimationFrame(() => SLED.scrollTo(hashTarget, 0, true));
    }
  });
})();
