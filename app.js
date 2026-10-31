(function () {
  var reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  if (reduce) document.body.classList.add("reduce-motion");

  // Calm starfield (capped ~24fps, pauses when tab hidden or reduced-motion)
  (function initStars() {
    var canvas = document.getElementById("stars");
    if (!canvas || reduce) return;
    var ctx = canvas.getContext("2d", { alpha: true });
    var stars = [];
    var running = true;
    var last = 0;
    var fpsInterval = 1000 / 24;
    var isMobile = window.matchMedia("(max-width: 720px)").matches;
    var count = isMobile ? 28 : 48;

    function resize() {
      var dpr = Math.min(window.devicePixelRatio || 1, isMobile ? 1.25 : 1.5);
      var w = window.innerWidth;
      var h = window.innerHeight;
      canvas.width = Math.floor(w * dpr);
      canvas.height = Math.floor(h * dpr);
      canvas.style.width = w + "px";
      canvas.style.height = h + "px";
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      stars = [];
      for (var i = 0; i < count; i++) {
        stars.push({
          x: Math.random() * w,
          y: Math.random() * h * 0.62,
          r: Math.random() * 1.1 + 0.2,
          a: Math.random() * 0.35 + 0.08,
          vx: (Math.random() - 0.5) * 0.04,
          vy: Math.random() * 0.03 + 0.01,
          tw: Math.random() * Math.PI * 2
        });
      }
    }

    function frame(now) {
      if (!running) return;
      requestAnimationFrame(frame);
      if (now - last < fpsInterval) return;
      last = now;
      var w = window.innerWidth;
      var h = window.innerHeight;
      ctx.clearRect(0, 0, w, h);
      for (var i = 0; i < stars.length; i++) {
        var s = stars[i];
        s.x += s.vx;
        s.y += s.vy;
        s.tw += 0.01;
        if (s.y > h * 0.7) { s.y = 0; s.x = Math.random() * w; }
        if (s.x < 0) s.x = w;
        if (s.x > w) s.x = 0;
        var alpha = s.a * (0.65 + 0.35 * Math.sin(s.tw));
        ctx.beginPath();
        ctx.fillStyle = "rgba(200, 190, 255," + alpha.toFixed(3) + ")";
        ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    function setPaused(p) {
      running = !p;
      document.body.classList.toggle("stage-paused", p);
      if (!p) {
        last = 0;
        requestAnimationFrame(frame);
      }
    }

    document.addEventListener("visibilitychange", function () {
      setPaused(document.hidden);
    });
    window.addEventListener("resize", function () {
      isMobile = window.matchMedia("(max-width: 720px)").matches;
      count = isMobile ? 28 : 48;
      resize();
    }, { passive: true });

    resize();
    requestAnimationFrame(frame);
  })();

  var total = 6;
  var step = 0;
  var panels = Array.prototype.slice.call(document.querySelectorAll(".panel"));
  var fill = document.getElementById("progress-fill");
  var label = document.getElementById("step-label");
  var flash = document.getElementById("flash");
  var selectedPiece = null;
  var root = document.documentElement;

  function show(n) {
    step = Math.max(0, Math.min(total, n));
    panels.forEach(function (p) {
      var s = Number(p.getAttribute("data-step"));
      var on = s === step;
      p.classList.toggle("active", on);
      if (on) p.removeAttribute("hidden");
      else p.setAttribute("hidden", "");
    });
    fill.style.width = (step / total) * 100 + "%";
    label.textContent = String(step).padStart(2, "0") + " / " + String(total).padStart(2, "0");
    document.body.classList.toggle("at-end", step === total);
    if (!reduce && flash) {
      flash.classList.add("on");
      setTimeout(function () { flash.classList.remove("on"); }, 420);
    }
    window.scrollTo({ top: 0, behavior: reduce ? "auto" : "smooth" });
    var heading = document.querySelector(".panel.active h1, .panel.active h2");
    if (heading) {
      heading.setAttribute("tabindex", "-1");
      try { heading.focus({ preventScroll: true }); } catch (e) {}
    }
    var ann = document.getElementById("step-announce");
    if (ann && heading) {
      ann.textContent = "Step " + step + " of " + total + ". " + heading.textContent.replace(/\s+/g, " ").trim();
    }
  }

  document.querySelectorAll("[data-next]").forEach(function (btn) {
    btn.addEventListener("click", function () { show(step + 1); });
  });
  document.querySelectorAll("[data-back]").forEach(function (btn) {
    btn.addEventListener("click", function () { show(step - 1); });
  });
  document.querySelectorAll("[data-jump]").forEach(function (btn) {
    btn.addEventListener("click", function () {
      show(Number(btn.getAttribute("data-jump")));
    });
  });

  document.getElementById("restart").addEventListener("click", function (e) {
    e.preventDefault();
    if (typeof closeDossier === "function") {
      // force-hide without waiting (restart)
      var d0 = document.getElementById("dossier");
      if (d0) {
        d0.classList.remove("is-open", "is-closing");
        d0.hidden = true;
        d0.setAttribute("aria-hidden", "true");
      }
    }
    var od = document.getElementById("open-dossier");
    if (od) od.setAttribute("aria-expanded", "false");
    document.querySelectorAll(".choice").forEach(function (c) {
      c.setAttribute("aria-pressed", "false");
    });
    var fb1 = document.getElementById("fb1");
    fb1.classList.remove("show");
    fb1.textContent = "";
    document.getElementById("next1").disabled = true;
    resetFuse();
    resetWorkflow();
    show(0);
  });

  // Pointer parallax + glow
  if (!reduce) {
    var glow = document.querySelector(".cursor-glow");
    window.addEventListener("pointermove", function (e) {
      var x = e.clientX / window.innerWidth;
      var y = e.clientY / window.innerHeight;
      root.style.setProperty("--mx", x.toFixed(3));
      root.style.setProperty("--my", y.toFixed(3));
      if (glow) {
        glow.style.left = e.clientX + "px";
        glow.style.top = e.clientY + "px";
      }
    }, { passive: true });
  }

  // Beat 1
  document.querySelectorAll("[data-choice]").forEach(function (btn) {
    btn.addEventListener("click", function () {
      document.querySelectorAll("[data-choice]").forEach(function (b) {
        b.setAttribute("aria-pressed", "false");
      });
      btn.setAttribute("aria-pressed", "true");
      var fb = document.getElementById("fb1");
      var next = document.getElementById("next1");
      var which = btn.getAttribute("data-choice");
      if (which === "monday") {
        fb.innerHTML = "<strong>Yep.</strong> If they still need a hand the next morning, the course didn't do its job. That's the bar I hold myself to.";
      } else {
        fb.innerHTML = "<strong>Looks matter.</strong> I'm picky about polish too. But if nobody can do the job after, we just burned their time.";
      }
      fb.classList.add("show");
      next.disabled = false;
    });
  });

  // Beat 2 fuse
  var slot = document.getElementById("slot");
  var placed = { design: false, build: false };
  var ghost = null;

  function resetFuse() {
    placed = { design: false, build: false };
    selectedPiece = null;
    document.querySelectorAll(".piece").forEach(function (p) {
      p.classList.remove("used", "selected");
    });
    slot.classList.remove("done", "hot");
    slot.innerHTML = '<span class="hint" id="slot-hint">Park both pieces here</span>';
    document.getElementById("fb2").classList.remove("show");
    document.getElementById("fb2").textContent = "";
    document.getElementById("next2").disabled = true;
    announceFuse("");
  }

  function renderSlot() {
    var parts = [];
    if (placed.design) parts.push('<span class="chip">Learning design</span>');
    if (placed.design && placed.build) parts.push('<span class="plus">+</span>');
    if (placed.build) parts.push('<span class="chip purple">Tool building</span>');
    if (!placed.design && !placed.build) {
      slot.innerHTML = '<span class="hint" id="slot-hint">Park both pieces here</span>';
    } else {
      slot.innerHTML = parts.join("");
    }
    if (placed.design && placed.build) {
      slot.classList.add("done");
      var fb = document.getElementById("fb2");
      fb.innerHTML = "<strong>That's me.</strong> I design the learning and build the tools in the same week. I'm not sitting around waiting on a ticket queue.";
      fb.classList.add("show");
      document.getElementById("next2").disabled = false;
    }
  }

  function announceFuse(msg) {
    var live = document.getElementById("fuse-live");
    if (live) live.textContent = msg;
  }

  function place(name) {
    if (placed[name]) return;
    placed[name] = true;
    var el = document.querySelector('.piece[data-piece="' + name + '"]');
    var label = el ? el.textContent.trim() : name;
    if (el) {
      el.classList.add("used");
      el.classList.remove("selected");
    }
    selectedPiece = null;
    announceFuse(label + " placed in the box.");
    renderSlot();
  }

  document.querySelectorAll(".piece").forEach(function (piece) {
    piece.addEventListener("click", function () {
      if (piece.classList.contains("used")) return;
      selectedPiece = piece.getAttribute("data-piece");
      document.querySelectorAll(".piece").forEach(function (p) {
        p.classList.toggle("selected", p === piece);
      });
      announceFuse(piece.textContent.trim() + " selected. Press Enter on the box to place it.");
    });

    piece.addEventListener("pointerdown", function (e) {
      if (piece.classList.contains("used")) return;
      if (e.button != null && e.button !== 0) return;
      e.preventDefault();
      piece.setPointerCapture(e.pointerId);
      var name = piece.getAttribute("data-piece");
      ghost = document.createElement("div");
      ghost.className = "drag-ghost";
      ghost.textContent = piece.textContent;
      document.body.appendChild(ghost);
      ghost.style.left = e.clientX + "px";
      ghost.style.top = e.clientY + "px";
      piece.style.opacity = "0.35";

      function move(ev) {
        ghost.style.left = ev.clientX + "px";
        ghost.style.top = ev.clientY + "px";
        var r = slot.getBoundingClientRect();
        var over = ev.clientX >= r.left && ev.clientX <= r.right && ev.clientY >= r.top && ev.clientY <= r.bottom;
        slot.classList.toggle("hot", over);
      }
      function up(ev) {
        piece.releasePointerCapture(e.pointerId);
        piece.style.opacity = "";
        var r = slot.getBoundingClientRect();
        var over = ev.clientX >= r.left && ev.clientX <= r.right && ev.clientY >= r.top && ev.clientY <= r.bottom;
        if (ghost) { ghost.remove(); ghost = null; }
        slot.classList.remove("hot");
        piece.removeEventListener("pointermove", move);
        piece.removeEventListener("pointerup", up);
        piece.removeEventListener("pointercancel", up);
        if (over) place(name);
        else {
          selectedPiece = name;
          document.querySelectorAll(".piece").forEach(function (p) {
            p.classList.toggle("selected", p === piece);
          });
        }
      }
      piece.addEventListener("pointermove", move);
      piece.addEventListener("pointerup", up);
      piece.addEventListener("pointercancel", up);
    });

    piece.addEventListener("dragstart", function (e) {
      e.dataTransfer.setData("text/plain", piece.getAttribute("data-piece"));
      e.dataTransfer.effectAllowed = "move";
    });
  });

  slot.addEventListener("click", function () {
    if (selectedPiece) place(selectedPiece);
  });
  slot.addEventListener("keydown", function (e) {
    if ((e.key === "Enter" || e.key === " ") && selectedPiece) {
      e.preventDefault();
      place(selectedPiece);
    }
  });
  slot.addEventListener("dragover", function (e) {
    e.preventDefault();
    slot.classList.add("hot");
  });
  slot.addEventListener("dragleave", function () { slot.classList.remove("hot"); });
  slot.addEventListener("drop", function (e) {
    e.preventDefault();
    slot.classList.remove("hot");
    var name = e.dataTransfer.getData("text/plain");
    if (name) place(name);
  });

  // Beat 3 workflow
  var wfDone = false;
  function resetWorkflow() {
    wfDone = false;
    document.querySelectorAll(".wf-row").forEach(function (row) {
      row.classList.remove("gone", "kept");
    });
    var fb = document.getElementById("fb3");
    fb.classList.remove("show");
    fb.textContent = "";
    document.getElementById("next3").disabled = true;
    var btn = document.getElementById("trim-btn");
    if (btn) {
      btn.disabled = false;
      btn.textContent = "Cut the busywork";
    }
  }

  var trimBtn = document.getElementById("trim-btn");
  if (trimBtn) {
    trimBtn.addEventListener("click", function () {
      if (wfDone) return;
      wfDone = true;
      document.querySelectorAll(".wf-row.cuttable").forEach(function (row, i) {
        setTimeout(function () { row.classList.add("gone"); }, reduce ? 0 : 90 * i);
      });
      document.querySelectorAll(".wf-row:not(.cuttable)").forEach(function (row) {
        row.classList.add("kept");
      });
      trimBtn.disabled = true;
      trimBtn.textContent = "Trimmed";
      var fb = document.getElementById("fb3");
      fb.innerHTML = "<strong>That's my favorite kind of win.</strong> I automate what should be automatic and delete what shouldn't exist, so people get fewer steps and the same result.";
      fb.classList.add("show");
      document.getElementById("next3").disabled = false;
    });
  }

  function syncChromeVars() {
    var bar = document.querySelector(".bar");
    var foot = document.querySelector("footer");
    if (bar) root.style.setProperty("--bar-h", bar.getBoundingClientRect().height + "px");
    if (foot) root.style.setProperty("--foot-h", foot.getBoundingClientRect().height + "px");
  }
  syncChromeVars();
  window.addEventListener("resize", syncChromeVars, { passive: true });

  var dossier = document.getElementById("dossier");
  var dossierBtn = document.getElementById("open-dossier");
  var dossierPanel = dossier ? dossier.querySelector(".dossier-panel") : null;
  var dossierClosing = false;

  function dossierFocusables() {
    if (!dossierPanel) return [];
    return Array.prototype.slice.call(
      dossierPanel.querySelectorAll('a[href], button:not([disabled]), textarea, input, select, [tabindex]:not([tabindex="-1"])')
    ).filter(function (el) {
      return el.offsetParent !== null || el === document.activeElement;
    });
  }

  function openDossier() {
    if (!dossier || !dossierBtn) return;
    dossierClosing = false;
    dossier.hidden = false;
    dossier.setAttribute("aria-hidden", "false");
    dossierBtn.setAttribute("aria-expanded", "true");
    dossier.classList.remove("is-closing");
    // force reflow then open for transition
    void dossier.offsetWidth;
    dossier.classList.add("is-open");
    if (dossierPanel) dossierPanel.scrollTop = 0;
    var h = document.getElementById("dossier-heading");
    var closeBtn = dossier.querySelector(".dossier-close");
    setTimeout(function () {
      try { (closeBtn || h).focus({ preventScroll: true }); } catch (e) {}
    }, reduce ? 0 : 280);
  }

  function closeDossier() {
    if (!dossier || !dossier.classList.contains("is-open") || dossierClosing) return;
    dossierClosing = true;
    dossier.classList.add("is-closing");
    dossier.classList.remove("is-open");
    dossierBtn.setAttribute("aria-expanded", "false");
    var done = function () {
      dossier.hidden = true;
      dossier.setAttribute("aria-hidden", "true");
      dossier.classList.remove("is-closing");
      dossierClosing = false;
      try { dossierBtn.focus({ preventScroll: true }); } catch (e) {}
    };
    if (reduce) { done(); return; }
    var finished = false;
    var finish = function () {
      if (finished) return;
      finished = true;
      done();
    };
    dossierPanel && dossierPanel.addEventListener("transitionend", function te(e) {
      if (e.target !== dossierPanel) return;
      dossierPanel.removeEventListener("transitionend", te);
      finish();
    });
    setTimeout(finish, 280);
  }

  if (dossierBtn) {
    dossierBtn.addEventListener("click", function () {
      if (dossier.classList.contains("is-open")) closeDossier();
      else openDossier();
    });
  }
  if (dossier) {
    dossier.addEventListener("click", function (e) {
      if (e.target && e.target.hasAttribute("data-dossier-close")) closeDossier();
    });
  }

  // Formspree (same endpoint as live site)
  var form = document.getElementById("contact-form");
  var status = document.getElementById("form-status");
  form.addEventListener("submit", function (e) {
    e.preventDefault();
    status.textContent = "Sending...";
    fetch(form.action, {
      method: "POST",
      body: new FormData(form),
      headers: { Accept: "application/json" }
    }).then(function (res) {
      if (res.ok) {
        status.textContent = "Got it. I'll hit you back.";
        form.reset();
      } else {
        status.textContent = "That didn't go through. Try LinkedIn for now.";
      }
    }).catch(function () {
      status.textContent = "Network hiccup. Find me on LinkedIn if you need me fast.";
    });
  });

  document.addEventListener("keydown", function (e) {
    if (e.key === "Escape" && dossier && dossier.classList.contains("is-open")) {
      e.preventDefault();
      closeDossier();
      return;
    }
    if (e.key === "Tab" && dossier && dossier.classList.contains("is-open")) {
      var list = dossierFocusables();
      if (!list.length) return;
      var first = list[0];
      var last = list[list.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
      return;
    }
    var tag = (e.target && e.target.tagName) || "";
    if (tag === "INPUT" || tag === "TEXTAREA") return;
    if (e.key === "ArrowRight") {
      var n = document.querySelector(".panel.active [data-next]:not([disabled])");
      if (n) n.click();
    }
    if (e.key === "ArrowLeft") {
      var b = document.querySelector(".panel.active [data-back]");
      if (b) b.click();
    }
  });

  show(0);
})();
