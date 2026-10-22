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

  /* ---------- opening shutter, once per session ---------- */
  (function initBoot() {
    if (!root.classList.contains("intro")) return;
    var boot = qs("#boot");
    if (!boot) {
      root.classList.remove("intro");
      return;
    }
    var held = [];
    qsa("body > *").forEach(function (el) {
      if (el === boot) return;
      if (el.hasAttribute("inert")) return;
      el.setAttribute("inert", "");
      held.push(el);
    });
    var skipBtn = qs("#boot-skip");
    if (skipBtn) skipBtn.focus({ preventScroll: true });

    var done = false;
    function end() {
      if (done) return;
      done = true;
      root.classList.remove("intro");
      held.forEach(function (el) { el.removeAttribute("inert"); });
      if (boot.parentNode) boot.remove();
      document.removeEventListener("keydown", onKey);
      window.removeEventListener("wheel", blockScroll);
      window.removeEventListener("touchmove", blockScroll);
      var main = qs("#main");
      if (main) {
        if (!main.hasAttribute("tabindex")) main.setAttribute("tabindex", "-1");
        main.focus({ preventScroll: true });
      }
    }
    function onKey(e) {
      if (!root.classList.contains("intro")) return;
      e.preventDefault();
      end();
    }
    function blockScroll(e) {
      if (root.classList.contains("intro")) e.preventDefault();
    }
    boot.addEventListener("click", end);
    document.addEventListener("keydown", onKey);
    window.addEventListener("wheel", blockScroll, { passive: false });
    window.addEventListener("touchmove", blockScroll, { passive: false });
    boot.addEventListener("animationend", function (e) {
      if (e.animationName === "shutter") end();
    });
    setTimeout(end, 2800);
  })();

  /* ---------- clock + time-of-day hue (stays inside the purple range) ---------- */
  var clock = qs("#clock");
  var secSynced = false;

  function formatClock(now) {
    var h24 = now.getHours();
    var suffix = h24 >= 12 ? "PM" : "AM";
    var h12 = h24 % 12;
    if (h12 === 0) h12 = 12;
    var hour = (h12 < 10 ? "\u2007" : "") + h12;
    var mm = String(now.getMinutes()).padStart(2, "0");
    var text = hour + ":" + mm;
    if (!reduce) text += ":" + String(now.getSeconds()).padStart(2, "0");
    return text + " " + suffix;
  }

  function syncTime(resyncSweep) {
    var now = new Date();
    var hours = now.getHours() + now.getMinutes() / 60;
    var hue = 274 + Math.sin((hours / 24) * Math.PI * 2) * 16;
    root.style.setProperty("--hue", hue.toFixed(1));
    if (clock) {
      clock.textContent = formatClock(now);
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
    var veil = [qs("#main"), qs("footer"), qs(".scroll-up")].filter(Boolean);

    function collapsed() {
      return window.getComputedStyle(button).display !== "none";
    }

    function setOpen(open) {
      var docked = collapsed();
      button.setAttribute("aria-expanded", open ? "true" : "false");
      button.setAttribute("aria-label", open ? "Close menu" : "Open menu");
      nav.classList.toggle("is-open", open);
      document.body.classList.toggle("nav-open", open && docked);
      if (docked && !open) nav.setAttribute("inert", "");
      else nav.removeAttribute("inert");
      veil.forEach(function (el) {
        if (open && docked) el.setAttribute("inert", "");
        else el.removeAttribute("inert");
      });
    }

    function sync() {
      if (!collapsed()) setOpen(false);
      else if (button.getAttribute("aria-expanded") !== "true") nav.setAttribute("inert", "");
    }

    button.addEventListener("click", function () {
      setOpen(button.getAttribute("aria-expanded") !== "true");
    });
    qsa(".main-nav-link").forEach(function (link) {
      link.addEventListener("click", function () { setOpen(false); });
    });
    document.addEventListener("keydown", function (e) {
      if (e.key === "Escape" && !root.classList.contains("carrier-open")) setOpen(false);
    });
    window.addEventListener("resize", sync);
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
  var portrait = qs(".about-portrait img");
  var pointerX = window.innerWidth * 0.72;
  var pointerY = window.innerHeight * 0.28;
  var pointerOn = false;
  var docH = 0;
  var raf = 0;
  var lastDraw = 0;

  function measure() {
    docH = Math.max(document.documentElement.scrollHeight, window.innerHeight);
    if (!svg) return;
    var w = window.innerWidth;
    svg.setAttribute("viewBox", "0 0 " + w + " " + docH);
    svg.style.height = docH + "px";
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
    updateProgress();

    if (!reduce && fine && portrait && pointerOn) {
      var ox = (pointerX / window.innerWidth - 0.5) * 12;
      var oy = (pointerY / window.innerHeight - 0.5) * 8;
      portrait.style.transform = "translate3d(" + ox.toFixed(1) + "px," + oy.toFixed(1) + "px,0)";
    }

    if (!reduce) {
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
    updateProgress();
  }, { passive: true });

  window.addEventListener("resize", function () {
    measure();
    syncTime(false);
  });

  if ("ResizeObserver" in window) {
    new ResizeObserver(function () { measure(); }).observe(document.documentElement);
  }

  measure();
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

  /* A name, a chord, or a restless clock. Nothing on the page points here. */
  (function initCarrier() {
    var carrierOn = false;
    var held = [];
    var warp = null;
    var timers = [];
    var timeLoop = 0;
    var lastFocus = null;
    var chord = [];
    var spell = "";
    var lastKeyAt = 0;
    var taps = [];
    var konami = ["arrowup", "arrowup", "arrowdown", "arrowdown", "arrowleft", "arrowright", "arrowleft", "arrowright", "b", "a"];

    try {
      console.info("%c◇  a name, spelled, will answer.", "color:#d8c6ff;font:500 13px/1.4 Outfit,sans-serif;letter-spacing:.04em");
    } catch (err) {}

    function typingField(el) {
      if (!el || !el.tagName) return false;
      var tag = el.tagName.toLowerCase();
      return tag === "input" || tag === "textarea" || el.isContentEditable;
    }

    function later(fn, ms) {
      timers.push(setTimeout(fn, ms));
    }

    function clearTimers() {
      timers.forEach(function (id) { clearTimeout(id); });
      timers = [];
      if (timeLoop) clearInterval(timeLoop);
      timeLoop = 0;
    }

    function lockPage(overlay) {
      qsa("body > *").forEach(function (el) {
        if (el === overlay) return;
        el.setAttribute("inert", "");
        held.push(el);
      });
      root.classList.add("carrier-open");
    }

    function unlockPage() {
      held.forEach(function (el) { el.removeAttribute("inert"); });
      held = [];
      root.classList.remove("carrier-open");
    }

    function startWarp(canvas) {
      var ctx = canvas.getContext("2d");
      if (!ctx) return { stop: function () {}, resize: function () {} };
      var stars = [];
      var running = true;
      var rafId = 0;
      var dpr = Math.min(window.devicePixelRatio || 1, 1.75);
      var started = performance.now();

      function resize() {
        var w = canvas.clientWidth || window.innerWidth;
        var h = canvas.clientHeight || window.innerHeight;
        canvas.width = Math.max(1, Math.floor(w * dpr));
        canvas.height = Math.max(1, Math.floor(h * dpr));
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      }

      function seed() {
        var count = reduce ? 70 : (window.innerWidth < 700 ? 100 : 160);
        stars = [];
        for (var i = 0; i < count; i++) {
          stars.push({
            x: Math.random() * 2 - 1,
            y: Math.random() * 2 - 1,
            z: Math.random(),
            violet: Math.random() > 0.7
          });
        }
      }

      function frame(now) {
        if (!running) return;
        var w = canvas.clientWidth || window.innerWidth;
        var h = canvas.clientHeight || window.innerHeight;
        var age = reduce ? 1 : Math.min(1, (now - started) / 1700);
        var speed = reduce ? 0 : 0.0035 + (1 - age) * 0.02;
        ctx.clearRect(0, 0, w, h);
        var cx = w * 0.5;
        var cy = h * 0.4;
        for (var i = 0; i < stars.length; i++) {
          var s = stars[i];
          if (!reduce) {
            s.z -= speed;
            if (s.z <= 0.04) {
              s.x = Math.random() * 2 - 1;
              s.y = Math.random() * 2 - 1;
              s.z = 1;
            }
          }
          var p = 1 - s.z;
          var x = cx + s.x * cx * p * 1.4;
          var y = cy + s.y * cy * p * 1.4;
          var trail = Math.max(0, p - speed * 4);
          var px = cx + s.x * cx * trail * 1.4;
          var py = cy + s.y * cy * trail * 1.4;
          ctx.strokeStyle = s.violet ? "rgba(214, 186, 255, 0.9)" : "rgba(255,255,255,0.82)";
          ctx.lineWidth = Math.max(0.6, p * 2.15);
          ctx.beginPath();
          ctx.moveTo(px, py);
          ctx.lineTo(x, y);
          ctx.stroke();
        }
        if (!reduce) rafId = requestAnimationFrame(frame);
      }

      resize();
      seed();
      if (reduce) frame(started);
      else rafId = requestAnimationFrame(frame);
      return {
        stop: function () {
          running = false;
          if (rafId) cancelAnimationFrame(rafId);
        },
        resize: resize
      };
    }

    function closeCarrier() {
      if (!carrierOn) return;
      carrierOn = false;
      clearTimers();
      if (warp) warp.stop();
      warp = null;
      var overlay = qs("#carrier");
      if (overlay && overlay.parentNode) overlay.parentNode.removeChild(overlay);
      unlockPage();
      document.removeEventListener("keydown", onEsc);
      window.removeEventListener("resize", onResize);
      if (lastFocus && lastFocus.focus) lastFocus.focus();
      if (!reduce && !document.hidden && !raf) raf = requestAnimationFrame(frame);
      window.dispatchEvent(new Event("resize"));
    }

    function onEsc(e) {
      if (e.key !== "Escape") return;
      e.preventDefault();
      closeCarrier();
    }

    function onResize() {
      if (warp) warp.resize();
    }

    function openCarrier() {
      if (carrierOn || root.classList.contains("intro")) return;
      carrierOn = true;
      var ham = qs(".hamburger");
      var menu = qs(".navigation");
      if (ham && menu) {
        ham.setAttribute("aria-expanded", "false");
        ham.setAttribute("aria-label", "Open menu");
        menu.classList.remove("is-open");
        if (collapsedMenu()) menu.setAttribute("inert", "");
        document.body.classList.remove("nav-open");
      }
      lastFocus = document.activeElement;
      var overlay = document.createElement("div");
      overlay.id = "carrier";
      overlay.className = "carrier" + (reduce ? " is-still" : " is-lit");
      overlay.setAttribute("role", "dialog");
      overlay.setAttribute("aria-modal", "true");
      overlay.setAttribute("aria-label", "Launch window");
      overlay.innerHTML =
        '<canvas class="carrier-canvas" aria-hidden="true"></canvas>' +
        '<button class="carrier-close" type="button" aria-label="Close launch window">Return</button>' +
        '<div class="carrier-stage">' +
          '<div class="carrier-hud">' +
            '<p class="carrier-kicker">07 · Carrier lock</p>' +
            '<h2 class="carrier-title" id="carrier-title">Louby</h2>' +
            '<p class="carrier-line">the violet holds</p>' +
            '<p class="carrier-sub">Starlink · Instructional Designer II</p>' +
            '<dl class="carrier-stats"><dt>Local</dt><dd id="carrier-time"></dd><dt>Path</dt><dd>violet / nominal</dd></dl>' +
          '</div>' +
        '</div>';
      var source = qs(".margin-rocket");
      var stage = overlay.querySelector(".carrier-stage");
      var hud = overlay.querySelector(".carrier-hud");
      if (source && stage && hud) {
        var rocket = source.cloneNode(true);
        rocket.setAttribute("class", "carrier-rocket");
        stage.insertBefore(rocket, hud);
      }
      document.body.appendChild(overlay);
      lockPage(overlay);
      try { sessionStorage.setItem("vx-07", "1"); } catch (err) {}
      root.classList.add("carrier-awake");
      if (raf) cancelAnimationFrame(raf);
      raf = 0;
      warp = startWarp(overlay.querySelector(".carrier-canvas"));
      var timeEl = overlay.querySelector("#carrier-time");
      function paintTime() { if (timeEl) timeEl.textContent = formatClock(new Date()); }
      paintTime();
      timeLoop = setInterval(paintTime, reduce ? 30000 : 1000);
      if (!reduce) later(function () { overlay.classList.add("is-read"); }, 1550);
      overlay.querySelector(".carrier-close").addEventListener("click", function (e) {
        e.stopPropagation();
        closeCarrier();
      });
      overlay.addEventListener("click", function (e) {
        if (e.target.closest && e.target.closest(".carrier-stage")) return;
        closeCarrier();
      });
      document.addEventListener("keydown", onEsc);
      window.addEventListener("resize", onResize);
      var closeBtn = overlay.querySelector(".carrier-close");
      if (closeBtn) closeBtn.focus();
    }

    function collapsedMenu() {
      var button = qs(".hamburger");
      return !!(button && window.getComputedStyle(button).display !== "none");
    }

    document.addEventListener("keydown", function (e) {
      if (carrierOn || root.classList.contains("intro")) return;
      if (e.metaKey || e.ctrlKey || e.altKey || e.repeat || e.isComposing) return;
      if (typingField(e.target)) return;
      var now = Date.now();
      if (now - lastKeyAt > 12000) {
        chord = [];
        spell = "";
      }
      lastKeyAt = now;
      var key = (e.key || "").toLowerCase();
      if (!key) return;
      chord.push(key);
      if (chord.length > konami.length) chord.shift();
      var matched = chord.length === konami.length;
      for (var i = 0; matched && i < konami.length; i++) {
        if (chord[i] !== konami[i]) matched = false;
      }
      if (matched) {
        chord = [];
        spell = "";
        openCarrier();
        return;
      }
      if (key.length === 1 && key >= "a" && key <= "z") {
        spell = (spell + key).slice(-8);
        if (spell.slice(-5) === "louby") {
          spell = "";
          chord = [];
          openCarrier();
        }
      }
    });

    var readout = qs(".bar-readout");
    if (readout) {
      readout.addEventListener("click", function () {
        if (carrierOn || root.classList.contains("intro")) return;
        var now = Date.now();
        taps.push(now);
        taps = taps.filter(function (t) { return now - t < 5000; });
        if (taps.length >= 7) {
          taps = [];
          openCarrier();
        }
      });
    }
  })();
})();
