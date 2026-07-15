(function () {
  "use strict";

  var prefersReduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  var hasGSAP = typeof window.gsap !== "undefined" && typeof window.ScrollTrigger !== "undefined";

  if (hasGSAP) {
    gsap.registerPlugin(ScrollTrigger);
    // ScrollTriggers created early (e.g. the exploded-view scrub, which
    // binds as soon as the video's metadata loads) cache pixel positions
    // based on the page layout at THAT moment. Images/video further down
    // the page keep loading and shifting layout afterward, which leaves
    // those cached positions stale — every trigger below the point where
    // the page grew ends up scrubbing at the wrong scroll offset. A single
    // refresh once everything has finished loading re-measures the whole
    // page against its final layout and fixes all of them at once.
    window.addEventListener("load", function () {
      ScrollTrigger.refresh();
    });
  }

  /* ---------- Room slider: auto-advance + prev/next paging ---------- */
  (function roomSlider() {
    var viewport = document.getElementById("roomViewport");
    var track = document.getElementById("roomTrack");
    var prevBtn = document.getElementById("roomPrev");
    var nextBtn = document.getElementById("roomNext");
    if (!viewport || !track) return;

    var AUTO_SPEED = 55; // px per second
    var lastTime = null;

    // The DOM's scrollLeft rounds to the nearest integer on every write in
    // most browsers. Reading it back each frame and adding a sub-pixel
    // delta (55px/s at 100+fps is a fraction of a pixel per frame) loses
    // that fraction to rounding every time, so the position can get stuck
    // forever just under the next whole pixel. Keeping the precise value
    // in a plain JS float — and only ever writing it out, never reading it
    // back in — avoids that trap entirely.
    var pos = viewport.scrollLeft;

    // Auto-advance is paused if the pointer/focus is on a slide, OR
    // briefly after a prev/next click — tracked as two independent
    // reasons so neither one can clobber the other's resume.
    var isHovering = false;
    var isButtonPause = false;
    var resumeTimer = null;
    function isPaused() { return isHovering || isButtonPause; }

    // While a button-triggered smooth scroll is in flight, wrap() must not
    // touch scrollLeft — mutating it mid-animation interrupts the browser's
    // native smooth-scroll unpredictably. Auto-tick movement isn't an
    // animation (just direct increments), so it's unaffected either way.
    var isAnimating = false;
    var animTimer = null;

    // Content is the same 9 slides duplicated once, back to back, so the
    // halfway point is exactly where the loop can reset invisibly.
    function oneSetWidth() {
      return track.scrollWidth / 2;
    }

    function wrap() {
      if (isAnimating) return;
      var setWidth = oneSetWidth();
      if (pos >= setWidth) {
        pos -= setWidth;
        viewport.scrollLeft = pos;
      } else if (pos < 0) {
        pos += setWidth;
        viewport.scrollLeft = pos;
      }
    }

    function tick(now) {
      if (lastTime === null) lastTime = now;
      var dt = (now - lastTime) / 1000;
      lastTime = now;
      if (!isPaused() && !prefersReduced) {
        pos += AUTO_SPEED * dt;
        viewport.scrollLeft = pos;
      }
      wrap();
      window.requestAnimationFrame(tick);
    }
    window.requestAnimationFrame(tick);

    function goToPage(direction) {
      isButtonPause = true;
      if (resumeTimer) clearTimeout(resumeTimer);
      resumeTimer = setTimeout(function () { isButtonPause = false; }, 3000);

      var pageAmount = viewport.clientWidth * 0.85;
      var target = pos + direction * pageAmount;
      // Only pre-adjust the backward/negative case (scrollLeft can't go
      // negative, so it must be re-based into the duplicate set up front).
      // The forward/overshoot case is deliberately left alone: scrolling
      // past oneSetWidth is a valid, visually-seamless position, corrected
      // by wrap() only once the animation below has finished.
      if (target < 0) target += oneSetWidth();
      pos = target;

      isAnimating = true;
      if (animTimer) clearTimeout(animTimer);
      animTimer = setTimeout(function () { isAnimating = false; }, 650);
      viewport.scrollTo({ left: target, behavior: prefersReduced ? "auto" : "smooth" });
    }

    if (prevBtn) prevBtn.addEventListener("click", function () { goToPage(-1); });
    if (nextBtn) nextBtn.addEventListener("click", function () { goToPage(1); });

    var slides = track.querySelectorAll(".room-slide");
    slides.forEach(function (slide) {
      slide.addEventListener("mouseenter", function () { isHovering = true; });
      slide.addEventListener("mouseleave", function () { isHovering = false; });
      slide.addEventListener("focus", function () { isHovering = true; });
      slide.addEventListener("blur", function () { isHovering = false; });
    });
  })();

  /* ---------- Strategy card spotlight glow (pointer-tracked) ---------- */
  (function glowCards() {
    var cards = document.querySelectorAll(".strategy-card");
    if (!cards.length || prefersReduced) return;
    if (window.matchMedia && !window.matchMedia("(pointer: fine)").matches) return;

    var ticking = false;
    var lastX = 0, lastY = 0;

    function apply() {
      cards.forEach(function (card) {
        card.style.setProperty("--x", lastX.toFixed(2));
        card.style.setProperty("--xp", (lastX / window.innerWidth).toFixed(3));
        card.style.setProperty("--y", lastY.toFixed(2));
        card.style.setProperty("--yp", (lastY / window.innerHeight).toFixed(3));
      });
      ticking = false;
    }

    document.addEventListener("pointermove", function (e) {
      lastX = e.clientX;
      lastY = e.clientY;
      if (!ticking) {
        window.requestAnimationFrame(apply);
        ticking = true;
      }
    }, { passive: true });
  })();

  /* ---------- Nav: hide on scroll down, show on scroll up ---------- */
  (function navScroll() {
    var nav = document.getElementById("siteNav");
    if (!nav) return;
    var lastY = window.scrollY;
    var ticking = false;

    function update() {
      var y = window.scrollY;
      if (y > 120 && y > lastY) {
        nav.classList.add("nav-hidden");
      } else {
        nav.classList.remove("nav-hidden");
      }
      lastY = y;
      ticking = false;
    }

    window.addEventListener("scroll", function () {
      if (!ticking) {
        window.requestAnimationFrame(update);
        ticking = true;
      }
    }, { passive: true });
  })();

  /* ---------- Reveal-on-scroll ---------- */
  (function reveals() {
    var els = document.querySelectorAll(".reveal");
    if (!els.length) return;

    if (prefersReduced || !("IntersectionObserver" in window)) {
      els.forEach(function (el) { el.classList.add("is-visible"); });
      return;
    }

    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (entry.isIntersecting) {
          entry.target.classList.add("is-visible");
          io.unobserve(entry.target);
        }
      });
    }, { threshold: 0.15, rootMargin: "0px 0px -8% 0px" });

    els.forEach(function (el) { io.observe(el); });
  })();

  /* ---------- Hero parallax ---------- */
  (function heroParallax() {
    if (prefersReduced || !hasGSAP) return;
    var media = document.getElementById("heroMedia");
    if (!media) return;

    gsap.to(media, {
      yPercent: 18,
      ease: "none",
      scrollTrigger: {
        trigger: ".hero",
        start: "top top",
        end: "bottom top",
        scrub: true
      }
    });
  })();

  /* ---------- Strata layer bars: draw in on scroll ---------- */
  (function strataBars() {
    var bars = document.querySelectorAll(".strata-bars .layer");
    if (!bars.length) return;

    if (prefersReduced || !hasGSAP) {
      bars.forEach(function (b) { b.style.transform = "scaleX(1)"; });
      return;
    }

    gsap.to(bars, {
      scaleX: 1,
      duration: 0.7,
      ease: "power3.out",
      stagger: 0.12,
      scrollTrigger: {
        trigger: ".strata-bars",
        start: "top 85%",
        once: true
      }
    });
  })();

  /* ---------- Exploded-view scroll scrub ---------- */
  (function explodedScrub() {
    var wrap = document.getElementById("explodedPinWrap");
    var video = document.getElementById("explodedVideo");
    var frame = document.getElementById("explodedFrame");
    var hint = document.getElementById("explodedProgressHint");
    if (!wrap || !video || !frame) return;

    video.pause();

    // The model's bounding box within the fixed 1920x1080 source video,
    // measured at each point in the explode animation: wide/landscape when
    // assembled, narrowing to roughly portrait once fully exploded, and
    // drifting slightly off-center. w/h/cx/cy are fractions of the video's
    // own dimensions. The frame's own aspect ratio is set to match the
    // bounding box each tick, and the video is scaled + translated so that
    // box fills the frame edge to edge (with a small margin), keeping the
    // subject centered with minimal white space at every point.
    var VIDEO_W = 1920, VIDEO_H = 1080;
    var MARGIN = 0.94;
    var MAX_W_FRAC = 0.92;
    var MAX_H_FRAC = 0.88;
    // At the very start (assembled state) the crop reads as too tight
    // against the roofline and base; add extra top/bottom breathing room
    // there, tapering back to a normal crop by the time it starts exploding.
    var START_V_PAD = 1.28;
    var V_PAD_TAPER_END = 0.3;
    var FRAME_KEYS = [
      { p: 0, w: 0.844, h: 0.576, cx: 0.498, cy: 0.501 },
      { p: 0.15, w: 0.768, h: 0.604, cx: 0.523, cy: 0.513 },
      { p: 0.3, w: 0.558, h: 0.683, cx: 0.542, cy: 0.516 },
      { p: 0.5, w: 0.415, h: 0.711, cx: 0.552, cy: 0.509 },
      { p: 0.7, w: 0.355, h: 0.741, cx: 0.550, cy: 0.489 },
      { p: 0.85, w: 0.346, h: 0.746, cx: 0.549, cy: 0.482 },
      { p: 1, w: 0.346, h: 0.746, cx: 0.549, cy: 0.482 }
    ];

    function bboxAt(progress) {
      for (var i = 1; i < FRAME_KEYS.length; i++) {
        if (progress <= FRAME_KEYS[i].p) {
          var a = FRAME_KEYS[i - 1], b = FRAME_KEYS[i];
          var t = (progress - a.p) / (b.p - a.p || 1);
          return {
            w: a.w + (b.w - a.w) * t,
            h: a.h + (b.h - a.h) * t,
            cx: a.cx + (b.cx - a.cx) * t,
            cy: a.cy + (b.cy - a.cy) * t
          };
        }
      }
      return FRAME_KEYS[FRAME_KEYS.length - 1];
    }

    function vPadAt(progress) {
      if (progress >= V_PAD_TAPER_END) return 1;
      var t = progress / V_PAD_TAPER_END;
      return START_V_PAD + (1 - START_V_PAD) * t;
    }

    // The frame element itself stays a fixed size (the "stage") so that
    // per-tick scroll updates never touch width/height and never trigger
    // browser layout — only `transform` (compositor) and `clip-path`
    // (paint, no layout) change every tick, which is what keeps the scrub
    // smooth. The video is sized once at its natural 1920x1080 and moved
    // entirely via `transform: translate() scale()`.
    var stageW = 0, stageH = 0;

    function updateStage() {
      stageW = window.innerWidth * MAX_W_FRAC;
      stageH = window.innerHeight * MAX_H_FRAC;
      frame.style.width = stageW + "px";
      frame.style.height = stageH + "px";
    }

    function applyLayout(progress) {
      var box = bboxAt(progress);
      var bboxAspect = (box.w * VIDEO_W) / (box.h * VIDEO_H);
      var vPad = vPadAt(progress);
      var frameW = Math.min(stageW, (stageH / vPad) * bboxAspect);
      var frameH = (frameW / bboxAspect) * vPad;

      var scale = (frameW * MARGIN) / (box.w * VIDEO_W);
      var tx = stageW / 2 - box.cx * VIDEO_W * scale;
      var ty = stageH / 2 - box.cy * VIDEO_H * scale;
      var insetX = Math.max(0, (stageW - frameW) / 2);
      var insetY = Math.max(0, (stageH - frameH) / 2);

      video.style.transform = "translate(" + tx + "px, " + ty + "px) scale(" + scale + ")";
      frame.style.clipPath = "inset(" + insetY + "px " + insetX + "px " + insetY + "px " + insetX + "px)";
    }

    function showFinalFrameStatic() {
      var reveal = function () {
        video.currentTime = Math.max(0, video.duration - 0.05);
        updateStage();
        applyLayout(1);
        if (hint) hint.classList.add("is-hidden");
      };
      if (video.readyState >= 1) reveal();
      else video.addEventListener("loadedmetadata", reveal, { once: true });
    }

    if (prefersReduced || !hasGSAP) {
      showFinalFrameStatic();
      return;
    }

    function bind() {
      var duration = video.duration;
      if (!duration || !isFinite(duration)) return;

      updateStage();
      applyLayout(0);

      ScrollTrigger.create({
        trigger: wrap,
        start: "top top",
        end: "bottom bottom",
        scrub: 0.25,
        onUpdate: function (self) {
          video.currentTime = self.progress * duration;
          applyLayout(self.progress);
          if (hint) hint.classList.toggle("is-hidden", self.progress > 0.06);
        }
      });

      var resizeTimer;
      window.addEventListener("resize", function () {
        clearTimeout(resizeTimer);
        resizeTimer = setTimeout(function () {
          updateStage();
          applyLayout(video.currentTime / duration || 0);
        }, 150);
      });
    }

    if (video.readyState >= 1) {
      bind();
    } else {
      video.addEventListener("loadedmetadata", bind, { once: true });
    }
  })();

  /* ---------- Performance tabs ---------- */
  (function performanceTabs() {
    var tabs = document.querySelectorAll(".tab-btn");
    if (!tabs.length) return;

    function activate(tab) {
      var panelId = tab.getAttribute("aria-controls");
      var panel = document.getElementById(panelId);
      if (!panel) return;

      tabs.forEach(function (t) {
        var active = t === tab;
        t.classList.toggle("is-active", active);
        t.setAttribute("aria-selected", active ? "true" : "false");
        t.tabIndex = active ? 0 : -1;
      });

      document.querySelectorAll(".tab-panel").forEach(function (p) {
        var active = p === panel;
        p.classList.toggle("is-active", active);
        p.hidden = !active;
      });
    }

    tabs.forEach(function (tab, i) {
      tab.addEventListener("click", function () { activate(tab); });
      tab.addEventListener("keydown", function (e) {
        var dir = e.key === "ArrowRight" ? 1 : e.key === "ArrowLeft" ? -1 : 0;
        if (!dir) return;
        e.preventDefault();
        var next = tabs[(i + dir + tabs.length) % tabs.length];
        next.focus();
        activate(next);
      });
    });
  })();

  /* ---------- Video click-to-play ---------- */
  (function video() {
    var frame = document.getElementById("videoFrame");
    var btn = document.getElementById("videoPlayBtn");
    var vid = document.getElementById("strataVideo");
    if (!frame || !btn || !vid) return;

    btn.addEventListener("click", function () {
      vid.play();
    });
    vid.addEventListener("play", function () {
      frame.classList.add("is-playing");
    });
    vid.addEventListener("pause", function () {
      frame.classList.remove("is-playing");
    });
  })();

  /* ---------- Smooth-close nav on link click (mobile) ---------- */
  (function navLinks() {
    var links = document.querySelectorAll(".nav-links a, .nav-cta");
    links.forEach(function (a) {
      a.addEventListener("click", function () {
        document.getElementById("siteNav").classList.remove("nav-hidden");
      });
    });
  })();
})();
