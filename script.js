/* Living trace, clock, and page behavior.
   The trace listens to the pointer, scroll position, and the clock.
   Everything here is optional: the page stays readable without it. */
(function () {
  "use strict";

  var root = document.documentElement;
  var reduce = false;
  var fine = false;
  try {
    reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    fine = window.matchMedia("(hover: hover) and (pointer: fine)").matches;
  } catch (e) {
    reduce = false;
    fine = false;
  }

  function qs(sel) { return document.querySelector(sel); }
  function qsa(sel) {
    try { return Array.prototype.slice.call(document.querySelectorAll(sel)); }
    catch (e) { return []; }
  }

  /* ---------- clock + time-of-day hue (stays inside the purple range) ---------- */
  var clock = qs("#clock");
  var secSynced = false;

  function syncTime(resyncSweep) {
    var now = new Date();
    var hours = now.getHours() + now.getMinutes() / 60;
    var hue = 274 + Math.sin((hours / 24) * Math.PI * 2) * 16;
    root.style.setProperty("--hue", hue.toFixed(1));
    if (clock) {
      var hh = String(now.getHours()).padStart(2, "0");
      var mm = String(now.getMinutes()).padStart(2, "0");
      var ss = String(now.getSeconds()).padStart(2, "0");
      clock.textContent = reduce ? hh + ":" + mm : hh + ":" + mm + ":" + ss;
      clock.setAttribute("datetime", now.toISOString());
    }
    if (resyncSweep || !secSynced) {
      var s = now.getSeconds() + now.getMilliseconds() / 1000;
      root.style.setProperty("--sec", s.toFixed(3));
      secSynced = true;
    }
  }
  syncTime(false);
  setInterval(function () { syncTime(false); }, reduce ? 30000 : 1000);
  document.addEventListener("visibilitychange", function () {
    if (!document.hidden) syncTime(true);
  });

  /* ---------- menu ---------- */
  (function initMenu() {
    var button = qs(".hamburger");
    var nav = qs(".navigation");
    if (!button || !nav) return;
    var mq = window.matchMedia("(max-width: 860px)");

    function setOpen(open) {
      button.setAttribute("aria-expanded", open ? "true" : "false");
      button.setAttribute("aria-label", open ? "Close menu" : "Open menu");
      nav.classList.toggle("is-open", open);
      document.body.classList.toggle("nav-open", open);
      if (mq.matches && !open) nav.setAttribute("inert", "");
      else nav.removeAttribute("inert");
    }

    function sync() {
      if (!mq.matches) setOpen(false);
      else if (button.getAttribute("aria-expanded") !== "true") nav.setAttribute("inert", "");
    }

    button.addEventListener("click", function () {
      setOpen(button.getAttribute("aria-expanded") !== "true");
    });
    qsa(".main-nav-link").forEach(function (link) {
      link.addEventListener("click", function () { setOpen(false); });
    });
    document.addEventListener("keydown", function (e) {
      if (e.key === "Escape") setOpen(false);
    });
    if (mq.addEventListener) mq.addEventListener("change", sync);
    sync();
  })();

  /* ---------- in-page anchors, with the sticky bar offset ---------- */
  document.addEventListener("click", function (e) {
    var link = e.target.closest && e.target.closest('a[href*="#"]');
    if (!link) return;
    if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    if (link.target && link.target !== "_self") return;
    var href = link.getAttribute("href");
    if (!href) return;
    var url;
    try { url = new URL(href, window.location.href); }
    catch (err) { return; }
    if (url.origin !== window.location.origin) return;
    if (url.pathname.replace(/\/index\.html$/, "").replace(/\/+$/, "") !==
        window.location.pathname.replace(/\/index\.html$/, "").replace(/\/+$/, "")) return;
    if (!url.hash || url.hash === "#") return;
    var target = qs(url.hash);
    if (!target) return;
    e.preventDefault();
    var bar = qs(".bar");
    var offset = (bar ? bar.offsetHeight : 0) + 12;
    var top = target.getBoundingClientRect().top + window.scrollY - offset;
    window.scrollTo({ top: Math.max(0, top), behavior: reduce ? "auto" : "smooth" });
    if (!target.hasAttribute("tabindex")) target.setAttribute("tabindex", "-1");
    target.focus({ preventScroll: true });
    history.pushState(null, "", url.hash);
  });

  /* ---------- section wake (progressive: visible if JS never runs) ---------- */
  (function initRise() {
    var nodes = qsa("[data-rise]");
    if (!nodes.length) return;
    if (reduce || !("IntersectionObserver" in window)) {
      nodes.forEach(function (el) { el.classList.add("in"); });
      return;
    }
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (!entry.isIntersecting) return;
        entry.target.classList.add("in");
        io.unobserve(entry.target);
      });
    }, { threshold: 0.14, rootMargin: "0px 0px -8% 0px" });
    nodes.forEach(function (el) { io.observe(el); });
  })();

  /* ---------- back to top ---------- */
  var toTop = qs(".scroll-up");
  function toggleTop() {
    if (!toTop) return;
    toTop.classList.toggle("is-shown", window.scrollY > 480);
  }

  /* ---------- expandable case-study cards ---------- */
  qsa("[data-expandable]").forEach(function (card) {
    var extra = card.querySelector("p:not(:first-of-type), ul");
    if (!extra) return;
    var btn = document.createElement("button");
    btn.type = "button";
    btn.className = "expand-toggle";
    btn.textContent = "Expand";
    btn.setAttribute("aria-expanded", "false");
    card.appendChild(btn);
    card.setAttribute("aria-expanded", "false");

    function set(open) {
      card.setAttribute("aria-expanded", open ? "true" : "false");
      btn.setAttribute("aria-expanded", open ? "true" : "false");
      btn.textContent = open ? "Collapse" : "Expand";
    }
    btn.addEventListener("click", function (e) {
      e.stopPropagation();
      set(card.getAttribute("aria-expanded") !== "true");
    });
    card.addEventListener("click", function (e) {
      if (e.target.closest("a, button, img, video")) return;
      set(card.getAttribute("aria-expanded") !== "true");
    });
  });

  /* ---------- lightbox ---------- */
  (function initLightbox() {
    var images = qsa("img[data-lightbox]");
    if (!images.length) return;
    var overlay = null;
    var imgEl = null;
    var capEl = null;
    var last = null;

    function build() {
      overlay = document.createElement("div");
      overlay.className = "lb-overlay";
      overlay.setAttribute("role", "dialog");
      overlay.setAttribute("aria-modal", "true");
      overlay.setAttribute("aria-label", "Image preview");
      overlay.innerHTML =
        '<div class="lb-backdrop" data-lb-close="true"></div>' +
        '<div class="lb-content" role="document">' +
        '<button class="lb-close" type="button" aria-label="Close image" data-lb-close="true">Close</button>' +
        '<img class="lb-img" alt="">' +
        '<p class="lb-caption"></p></div>';
      document.body.appendChild(overlay);
      imgEl = overlay.querySelector(".lb-img");
      capEl = overlay.querySelector(".lb-caption");
      overlay.addEventListener("click", function (e) {
        if (e.target.getAttribute && e.target.getAttribute("data-lb-close") === "true") hide();
      });
      document.addEventListener("keydown", function (e) {
        if (overlay.classList.contains("open") && e.key === "Escape") hide();
      });
    }
    function show(src, alt) {
      if (!overlay) build();
      last = document.activeElement;
      imgEl.src = src;
      imgEl.alt = alt || "Expanded image";
      capEl.textContent = alt || "";
      overlay.classList.add("open");
      document.body.classList.add("lb-noscroll");
      overlay.querySelector(".lb-close").focus();
    }
    function hide() {
      if (!overlay) return;
      overlay.classList.remove("open");
      document.body.classList.remove("lb-noscroll");
      imgEl.src = "";
      if (last && last.focus) last.focus();
    }
    images.forEach(function (img) {
      if (img.closest("a")) return;
      img.addEventListener("click", function (e) {
        e.preventDefault();
        e.stopPropagation();
        var src = img.currentSrc || img.getAttribute("src");
        if (src) show(src, img.getAttribute("alt") || "");
      });
    });
  })();

  /* ---------- play case-study video only while it is on screen ---------- */
  if ("IntersectionObserver" in window) {
    var vids = qsa("video[data-inview]");
    if (vids.length) {
      var vio = new IntersectionObserver(function (entries) {
        entries.forEach(function (entry) {
          var v = entry.target;
          if (entry.isIntersecting) {
            if (v.preload === "none") v.preload = "auto";
            if (!reduce) v.play().catch(function () {});
          } else {
            v.pause();
          }
        });
      }, { threshold: 0.45 });
      vids.forEach(function (v) { vio.observe(v); });
    }
  }

  /* ---------- the trace: cursor, scroll, and time ---------- */
  var svg = qs("#trace");
  var glow = qs(".trace-glow");
  var core = qs(".trace-core");
  var bead = qs(".trace-bead");
  var gate = qs("#gate");
  var lens = gate ? gate.querySelector(".gate-media") : null;
  var reticle = gate ? gate.querySelector(".reticle") : null;
  var focusEl = qs("#focus");
  var portrait = qs(".about-portrait img");
  var pointerX = window.innerWidth * 0.72;
  var pointerY = window.innerHeight * 0.28;
  var pointerOn = false;
  var docH = 0;
  var gateRect = null;
  var lastFocus = "";
  var pulsing = false;
  var pulseStart = 0;
  var pulsePts = null;
  var stationYs = [];
  var pinged = [];
  var raf = 0;
  var lastDraw = 0;

  function measure() {
    docH = Math.max(document.documentElement.scrollHeight, window.innerHeight);
    if (!svg) return;
    var w = window.innerWidth;
    svg.setAttribute("viewBox", "0 0 " + w + " " + docH);
    svg.style.height = docH + "px";
    if (gate && lens) gateRect = lens.getBoundingClientRect();
  }

  function cacheStations() {
    stationYs = qsa("[data-station]").map(function (el) {
      return { el: el, y: el.getBoundingClientRect().top + window.scrollY };
    });
  }

  function pointAt(pts, y) {
    if (!pts.length) return { x: 24, y: y };
    if (y <= pts[0].y) return pts[0];
    for (var i = 0; i < pts.length - 1; i++) {
      var a = pts[i], b = pts[i + 1];
      if (y <= b.y) {
        var t = (y - a.y) / Math.max(1, b.y - a.y);
        return { x: a.x + (b.x - a.x) * t, y: y };
      }
    }
    return pts[pts.length - 1];
  }

  function buildPoints(now) {
    var w = window.innerWidth;
    var h = docH || window.innerHeight;
    var n = w < 700 ? 10 : 16;
    var base = Math.min(34, w * 0.075);
    var amp = reduce ? 0 : Math.min(22, w * 0.035);
    var scrollY = window.scrollY;
    var py = pointerY + scrollY;
    var pts = [];
    for (var i = 0; i < n; i++) {
      var y = (h * i) / (n - 1);
      var breath = reduce ? 0 : Math.sin(now / 1400 + i * 0.62) * amp * 0.55;
      var attract = 0;
      if (!reduce && pointerOn) {
        attract = Math.max(0, 1 - Math.abs(y - py) / 420);
      }
      var lean = attract * amp * (pointerX > w * 0.5 ? 1 : -0.35);
      var x = Math.max(8, base + breath + lean);
      pts.push({ x: x, y: y });
    }
    return pts;
  }

  function pathFrom(pts) {
    var d = "M " + pts[0].x.toFixed(1) + " " + pts[0].y.toFixed(1);
    for (var i = 0; i < pts.length - 1; i++) {
      var a = pts[i], b = pts[i + 1];
      var mx = (a.x + b.x) / 2;
      var my = (a.y + b.y) / 2;
      d += " Q " + a.x.toFixed(1) + " " + a.y.toFixed(1) + " " + mx.toFixed(1) + " " + my.toFixed(1);
    }
    var last = pts[pts.length - 1];
    d += " T " + last.x.toFixed(1) + " " + last.y.toFixed(1);
    return d;
  }

  function setFocus(value) {
    if (!focusEl) return;
    var shown = String(Math.max(0, Math.min(100, Math.round(value)))).padStart(3, "0");
    if (shown !== lastFocus) {
      focusEl.textContent = shown;
      lastFocus = shown;
    }
  }

  function updateLens(now) {
    if (!lens) return;
    var lx = 50, ly = 46;
    if (reduce) {
      lx = 50; ly = 46;
      setFocus(100);
    } else if (!fine || !pointerOn || !gateRect || gateRect.width < 2) {
      lx = 50 + Math.sin(now / 1800) * 10;
      ly = 46 + Math.cos(now / 2200) * 7;
      setFocus(70 + Math.sin(now / 900) * 8);
    } else {
      lx = ((pointerX - gateRect.left) / gateRect.width) * 100;
      ly = ((pointerY - gateRect.top) / gateRect.height) * 100;
      lx = Math.max(8, Math.min(92, lx));
      ly = Math.max(8, Math.min(78, ly));
      var cx = gateRect.left + gateRect.width / 2;
      var cy = gateRect.top + gateRect.height / 2;
      var dist = Math.hypot(pointerX - cx, pointerY - cy);
      var reach = Math.max(gateRect.width, gateRect.height);
      setFocus(100 * (1 - Math.min(1, dist / (reach * 1.15))));
    }
    lens.style.setProperty("--lx", lx.toFixed(1) + "%");
    lens.style.setProperty("--ly", ly.toFixed(1) + "%");
    if (reticle && gateRect) {
      var x = (lx / 100) * gateRect.width;
      var y = (ly / 100) * gateRect.height;
      reticle.style.transform = "translate3d(" + x.toFixed(1) + "px," + y.toFixed(1) + "px,0) translate(-50%,-50%)";
    }
  }

  function updateProgress() {
    if (!core) return;
    var h = docH || 1;
    var seen = (window.scrollY + window.innerHeight * 0.35) / h;
    seen = Math.max(0.04, Math.min(1, seen));
    core.style.strokeDashoffset = String(1000 * (1 - seen));
  }

  function draw(now) {
    if (!glow || !core) return;
    var pts = buildPoints(now || 0);
    var d = pathFrom(pts);
    glow.setAttribute("d", d);
    core.setAttribute("d", d);
    pulsePts = pts;
    updateProgress();
    updateLens(now || 0);

    if (!reduce && fine && portrait && pointerOn) {
      var ox = (pointerX / window.innerWidth - 0.5) * 12;
      var oy = (pointerY / window.innerHeight - 0.5) * 8;
      portrait.style.transform = "translate3d(" + ox.toFixed(1) + "px," + oy.toFixed(1) + "px,0)";
    }

    if (pulsing && pulsePts && bead) {
      var t = Math.min(1, (now - pulseStart) / 1700);
      var eased = t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
      var y = eased * (docH || 0);
      var p = pointAt(pulsePts, y);
      bead.setAttribute("cx", p.x.toFixed(1));
      bead.setAttribute("cy", p.y.toFixed(1));
      bead.style.opacity = "1";
      root.style.setProperty("--px", p.x.toFixed(1) + "px");
      root.style.setProperty("--py", (p.y - window.scrollY).toFixed(1) + "px");
      stationYs.forEach(function (st, i) {
        if (pinged[i]) return;
        if (st.y <= y + 8) {
          pinged[i] = true;
          st.el.classList.add("ping");
          setTimeout(function () { st.el.classList.remove("ping"); }, 700);
        }
      });
      if (t >= 1) {
        pulsing = false;
        bead.style.opacity = "0";
      }
    } else if (!reduce) {
      root.style.setProperty("--px", pointerX.toFixed(1) + "px");
      root.style.setProperty("--py", pointerY.toFixed(1) + "px");
    }
  }

  function frame(now) {
    raf = requestAnimationFrame(frame);
    if (now - lastDraw < 32) return;
    lastDraw = now;
    draw(now);
  }

  function startPulse() {
    cacheStations();
    if (reduce) {
      stationYs.forEach(function (st) {
        st.el.classList.add("ping");
        setTimeout(function () { st.el.classList.remove("ping"); }, 450);
      });
      return;
    }
    if (pulsing) return;
    pulsing = true;
    pulseStart = performance.now();
    pinged = stationYs.map(function () { return false; });
  }

  var pulseBtn = qs("#pulse");
  if (pulseBtn) pulseBtn.addEventListener("click", startPulse);

  document.addEventListener("keydown", function (e) {
    if (e.key !== "p" && e.key !== "P") return;
    var tag = (e.target.tagName || "").toLowerCase();
    if (tag === "input" || tag === "textarea" || e.target.isContentEditable) return;
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    startPulse();
  });

  window.addEventListener("pointermove", function (e) {
    pointerX = e.clientX;
    pointerY = e.clientY;
    pointerOn = true;
  }, { passive: true });

  document.addEventListener("focusin", function (e) {
    if (!fine || !e.target.getBoundingClientRect) return;
    var r = e.target.getBoundingClientRect();
    if (!r.width && !r.height) return;
    pointerX = r.left + r.width / 2;
    pointerY = r.top + Math.min(r.height / 2, 40);
    pointerOn = true;
  });

  window.addEventListener("scroll", function () {
    toggleTop();
    if (lens) gateRect = lens.getBoundingClientRect();
    updateProgress();
  }, { passive: true });

  window.addEventListener("resize", function () {
    measure();
    cacheStations();
  });

  if ("ResizeObserver" in window) {
    new ResizeObserver(function () { measure(); }).observe(document.documentElement);
  }

  measure();
  cacheStations();
  toggleTop();
  draw(reduce ? 0 : performance.now());
  if (!reduce) raf = requestAnimationFrame(frame);

  document.addEventListener("visibilitychange", function () {
    if (document.hidden) {
      if (raf) cancelAnimationFrame(raf);
      raf = 0;
    } else if (!reduce && !raf) {
      raf = requestAnimationFrame(frame);
    }
  });
})();
