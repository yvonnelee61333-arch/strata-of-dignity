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
    // Web fonts (Gelasio, loaded with font-display:swap) can finish
    // swapping in after the "load" event already fired, reflowing text
    // height throughout the page — which silently invalidates every
    // cached pin position below the swap, including the exploded-view
    // scrub. Refreshing again once fonts have actually settled catches
    // that case too.
    if (document.fonts && document.fonts.ready) {
      document.fonts.ready.then(function () {
        ScrollTrigger.refresh();
      });
    }
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
    var mobileMql = window.matchMedia("(max-width: 639px)");
    function isMobile() { return mobileMql.matches; }

    // On mobile, one photo fills the viewport and paging is arrow-only —
    // no auto-advance marquee. Measures the real slide+gap width rather
    // than a hardcoded value so it stays correct if the CSS width changes.
    function slideStep() {
      var slide = track.querySelector(".room-slide");
      var gap = parseFloat(getComputedStyle(track).columnGap) || 0;
      return (slide ? slide.getBoundingClientRect().width : viewport.clientWidth) + gap;
    }

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

    // Content is the same N slides duplicated once, back to back, so
    // scrolling by exactly one set's stride lands each slide on the
    // position its duplicate previously held — an invisible loop reset.
    // That stride is NOT scrollWidth/2: scrollWidth counts N slide widths
    // plus (2N-1) gaps total, and half of that over-counts by half a gap
    // (the seam between the two sets), landing the reset half a gap short
    // every time. Measuring the real offset between a slide and its
    // duplicate sidesteps the arithmetic entirely.
    function oneSetWidth() {
      var slides = track.querySelectorAll(".room-slide");
      var n = slides.length / 2;
      return slides[n].offsetLeft - slides[0].offsetLeft;
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
      if (!isPaused() && !prefersReduced && !isMobile()) {
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

      var pageAmount = isMobile() ? slideStep() : viewport.clientWidth * 0.85;
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

  /* ---------- Site plan hotspots ---------- */
  (function siteHotspots() {
    var plan = document.querySelector(".site-plan");
    var overlay = document.getElementById("siteHotspotOverlay");
    var popup = document.getElementById("siteHotspotPopup");
    if (!plan || !overlay || !popup) return;

    var closeBtn = document.getElementById("siteHotspotClose");
    var popupImage = document.getElementById("siteHotspotImage");
    var popupTitle = document.getElementById("siteHotspotTitle");
    var popupDesc = document.getElementById("siteHotspotDesc");
    var hotspots = plan.querySelectorAll(".site-hotspot");
    var activeHotspot = null;

    function open(hotspot) {
      if (activeHotspot) activeHotspot.classList.remove("is-active");
      activeHotspot = hotspot;
      hotspot.classList.add("is-active");

      popupImage.classList.add("is-loading");
      popupImage.addEventListener("load", function handleLoad() {
        popupImage.classList.remove("is-loading");
        popupImage.removeEventListener("load", handleLoad);
      });
      popupImage.src = hotspot.dataset.image;
      popupImage.alt = hotspot.dataset.title;
      popupTitle.textContent = hotspot.dataset.title;
      popupDesc.textContent = hotspot.dataset.desc;
      popup.hidden = false;
      overlay.classList.add("is-visible");
      document.body.style.overflow = "hidden";
      closeBtn.focus();
    }

    function close() {
      popup.hidden = true;
      overlay.classList.remove("is-visible");
      document.body.style.overflow = "";
      if (activeHotspot) {
        activeHotspot.classList.remove("is-active");
        activeHotspot.focus();
        activeHotspot = null;
      }
    }

    hotspots.forEach(function (hotspot) {
      hotspot.addEventListener("click", function () {
        if (activeHotspot === hotspot) { close(); return; }
        open(hotspot);
      });
    });

    closeBtn.addEventListener("click", close);
    overlay.addEventListener("click", close);
    document.addEventListener("keydown", function (e) {
      if (e.key === "Escape" && !popup.hidden) close();
    });
  })();

  /* ---------- Shared image lightbox (drawings + room photos) ---------- */
  (function lightbox() {
    var overlay = document.getElementById("lightboxOverlay");
    var popup = document.getElementById("lightboxPopup");
    if (!overlay || !popup) return;

    var closeBtn = document.getElementById("lightboxClose");
    var popupImage = document.getElementById("lightboxImage");
    var popupTitle = document.getElementById("lightboxTitle");
    var lastTrigger = null;

    function open(trigger, imageSrc, title) {
      lastTrigger = trigger;
      popupImage.src = imageSrc;
      popupImage.alt = title || "";
      popupTitle.textContent = title || "";
      popup.hidden = false;
      overlay.classList.add("is-visible");
      document.body.style.overflow = "hidden";
      closeBtn.focus();
    }

    function close() {
      popup.hidden = true;
      overlay.classList.remove("is-visible");
      document.body.style.overflow = "";
      if (lastTrigger) { lastTrigger.focus(); lastTrigger = null; }
    }

    document.querySelectorAll(".drawing-btn").forEach(function (btn) {
      btn.addEventListener("click", function () {
        open(btn, btn.dataset.image, btn.dataset.title);
      });
    });

    // Room photos open with just the image — no title/info, per the gallery's own request.
    document.querySelectorAll(".room-slide img").forEach(function (img) {
      img.addEventListener("click", function () {
        open(img, img.currentSrc || img.src, "");
      });
    });

    closeBtn.addEventListener("click", close);
    overlay.addEventListener("click", close);
    document.addEventListener("keydown", function (e) {
      if (e.key === "Escape" && !popup.hidden) close();
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

  /* ---------- Exploded-view scroll scrub ---------- */
  (function explodedScrub() {
    var wrap = document.getElementById("explodedPinWrap");
    var video = document.getElementById("explodedVideo");
    var hint = document.getElementById("explodedProgressHint");
    if (!wrap || !video) return;

    video.pause();

    function showFinalFrameStatic() {
      var reveal = function () {
        video.currentTime = Math.max(0, video.duration - 0.05);
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

      ScrollTrigger.create({
        trigger: wrap,
        start: "top top",
        end: "bottom bottom",
        scrub: 0.25,
        onUpdate: function (self) {
          video.currentTime = self.progress * duration;
          if (hint) hint.classList.toggle("is-hidden", self.progress > 0.06);
        }
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
