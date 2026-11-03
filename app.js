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
    var prev = step;
    step = Math.max(0, Math.min(total, n));
    panels.forEach(function (p) {
      var s = Number(p.getAttribute("data-step"));
      var on = s === step;
      p.classList.toggle("active", on);
      p.classList.remove("is-enter", "is-exit");
      if (on) {
        p.removeAttribute("hidden");
        if (!reduce && prev !== step) {
          p.classList.add("is-enter");
          setTimeout(function () { p.classList.remove("is-enter"); }, 520);
        }
      } else {
        p.setAttribute("hidden", "");
      }
    });
    fill.style.width = (step / total) * 100 + "%";
    label.textContent = String(step).padStart(2, "0") + " / " + String(total).padStart(2, "0");
    var traveler = document.getElementById("progress-traveler");
    if (traveler) {
      var pct = (step / total) * 100;
      // Keep rocket fully inside the track (half-width inset), never past 100%
      var half = Math.max(8, Math.round((traveler.offsetWidth || 22) / 2));
      traveler.style.left = "calc(" + pct + "% - " + half + "px)";
      if (step === total) traveler.style.left = "calc(100% - " + (half * 2) + "px)";
      traveler.classList.toggle("is-end", step === total);
    }
    document.body.classList.toggle("at-end", step === total);
    document.body.setAttribute("data-beat", String(step));
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

  // Formspree (same endpoint as live site) + whimsy states

  // --- Whimsical contact helpers (concepts A/B/C) ---
  function prefersReduced() {
    return window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  }
  function happySeal() {
    var seals = document.querySelectorAll(".diploma .seal-portrait, .contact-seal");
    seals.forEach(function (s) {
      s.classList.add("is-happy");
      setTimeout(function () { s.classList.remove("is-happy"); }, 1200);
    });
  }
  function spawnPlane(stage) {
    if (!stage || prefersReduced()) return;
    stage.innerHTML = "";
    var el = document.createElement("div");
    el.className = "paper-plane go";
    el.innerHTML = '<svg viewBox="0 0 24 24" width="28" height="28"><path fill="currentColor" d="M3.2 11.2 20.1 3.4c.7-.3 1.4.4 1.1 1.1l-7.8 16.9c-.3.7-1.3.6-1.5-.2l-1.7-6.3-6.3-1.7c-.8-.2-.9-1.2-.2-1.5z"/></svg>';
    stage.appendChild(el);
    setTimeout(function () { el.remove(); }, 1400);
  }
  function spawnSat(stage) {
    if (!stage || prefersReduced()) return;
    stage.innerHTML = "";
    for (var i = 0; i < 3; i++) {
      var bit = document.createElement("div");
      bit.className = "sat-bit go";
      bit.style.left = (40 + i * 12) + "%";
      bit.style.bottom = (20 + i * 8) + "%";
      bit.style.animationDelay = (i * 0.08) + "s";
      stage.appendChild(bit);
    }
    setTimeout(function () { stage.innerHTML = ""; }, 1600);
  }
  function spawnEnv(stage) {
    if (!stage || prefersReduced()) return;
    stage.innerHTML = "";
    var el = document.createElement("div");
    el.className = "env-letter go";
    stage.appendChild(el);
    setTimeout(function () { el.remove(); }, 1300);
  }

  // Concept B: chat stepper (thread + typing + note preview)
  (function initChat() {
    var form = document.getElementById("contact-form");
    if (!form || !form.classList.contains("form-chat")) return;
    var chatStep = 0;
    var prompts = [
      "First up: what should I call you?",
      "Where can I email you back?",
      "Alright. What's on your mind?"
    ];
    var answers = ["", "", ""];
    var steps = form.querySelectorAll(".cq-step");
    var thread = document.getElementById("chat-thread");
    var nextBtn = document.getElementById("chat-next");
    var backBtn = document.getElementById("chat-back");
    var sendBtn = document.getElementById("send-btn");
    var noteName = document.getElementById("note-name");
    var noteEmail = document.getElementById("note-email");
    var noteMsg = document.getElementById("note-msg");
    var typing = false;

    function updateNote() {
      function setEl(el, val, empty) {
        if (!el) return;
        if (val && val.trim()) el.textContent = val.trim();
        else el.innerHTML = '<span class="note-empty">' + empty + "</span>";
      }
      setEl(noteName, answers[0], "name…");
      setEl(noteEmail, answers[1], "email…");
      setEl(noteMsg, answers[2], "message…");
    }

    function loubyBubble(text, withTyping, done) {
      if (!thread) { if (done) done(); return; }
      function addBubble() {
        var row = document.createElement("div");
        row.className = "chat-row louby";
        row.innerHTML =
          '<div class="chat-avatar" aria-hidden="true"><img src="assets/headshot.webp" alt="" width="36" height="36"></div>' +
          '<div class="chat-bubble louby-bubble">' + text + "</div>";
        thread.appendChild(row);
        thread.scrollTop = thread.scrollHeight;
        if (done) done();
      }
      if (withTyping && !reduce) {
        typing = true;
        var tip = document.createElement("div");
        tip.className = "chat-row louby is-typing";
        tip.innerHTML =
          '<div class="chat-avatar" aria-hidden="true"><img src="assets/headshot.webp" alt="" width="36" height="36"></div>' +
          '<div class="chat-bubble typing-bubble" aria-hidden="true"><span></span><span></span><span></span></div>';
        thread.appendChild(tip);
        thread.scrollTop = thread.scrollHeight;
        setTimeout(function () {
          tip.remove();
          typing = false;
          addBubble();
        }, 520);
      } else {
        addBubble();
      }
    }

    function userBubble(text) {
      if (!thread) return;
      var row = document.createElement("div");
      row.className = "chat-row user";
      row.innerHTML = '<div class="chat-bubble user-bubble">' + text.replace(/</g, "&lt;") + "</div>";
      thread.appendChild(row);
      thread.scrollTop = thread.scrollHeight;
    }

    function rebuildThread(upto, withTyping) {
      if (!thread) return;
      thread.innerHTML = "";
      for (var i = 0; i <= upto; i++) {
        if (i < upto) {
          // prior Q+A without typing
          loubyBubble(prompts[i], false);
          if (answers[i]) userBubble(answers[i]);
        } else {
          loubyBubble(prompts[i], withTyping);
        }
      }
    }

    function showStep(n, opts) {
      opts = opts || {};
      chatStep = n;
      steps.forEach(function (el, i) {
        if (i === n) el.removeAttribute("hidden");
        else el.setAttribute("hidden", "");
      });
      if (backBtn) backBtn.hidden = n === 0;
      if (nextBtn) {
        nextBtn.hidden = n >= steps.length - 1;
        var nl = nextBtn.querySelector(".btn-send-label");
        if (nl) nl.textContent = "Next";
      }
      if (sendBtn) {
        var sl = sendBtn.querySelector(".btn-send-label");
        if (sl) sl.textContent = "Send";
      }
      if (sendBtn) sendBtn.hidden = n < steps.length - 1;
      form.classList.toggle("is-chatting", n > 0);
      rebuildThread(n, opts.typing !== false && n > 0);
      updateNote();
      var focusEl = steps[n] && steps[n].querySelector("input, textarea");
      if (focusEl) setTimeout(function () { focusEl.focus(); }, 40);
    }

    // Live note as they type
    ["name", "email", "message"].forEach(function (id, i) {
      var el = document.getElementById(id);
      if (!el) return;
      el.addEventListener("input", function () {
        answers[i] = el.value;
        updateNote();
      });
    });

    if (nextBtn) nextBtn.addEventListener("click", function () {
      if (typing) return;
      var wrap = steps[chatStep];
      var field = wrap && wrap.querySelector("input, textarea");
      if (field && !field.reportValidity()) return;
      answers[chatStep] = field ? field.value : "";
      updateNote();
      userBubble(answers[chatStep]);
      happySeal();
      if (chatStep < steps.length - 1) {
        var next = chatStep + 1;
        steps.forEach(function (el, i) {
          if (i === next) el.removeAttribute("hidden");
          else el.setAttribute("hidden", "");
        });
        chatStep = next;
        form.classList.toggle("is-chatting", next > 0);
        if (backBtn) backBtn.hidden = false;
        if (nextBtn) {
          nextBtn.hidden = next >= steps.length - 1;
          var nl = nextBtn.querySelector(".btn-send-label");
          if (nl) nl.textContent = "Next";
        }
        if (sendBtn) {
          sendBtn.hidden = next < steps.length - 1;
          var sl = sendBtn.querySelector(".btn-send-label");
          if (sl) sl.textContent = "Send";
        }
        loubyBubble(prompts[next], true, function () {
          var focusEl = steps[next] && steps[next].querySelector("input, textarea");
          if (focusEl) focusEl.focus();
        });
      }
    });

    if (backBtn) backBtn.addEventListener("click", function () {
      if (chatStep > 0) {
        // keep answers; rebuild without re-typing animation
        showStep(chatStep - 1, { typing: false });
      }
    });

    // Commit message answer + user bubble right before submit
    form._chatCommitMessage = function () {
      var field = document.getElementById("message");
      var val = field ? field.value : "";
      answers[2] = val;
      updateNote();
      // Avoid duplicate user bubble if already present for this answer
      var last = thread && thread.querySelector(".chat-row.user:last-child .user-bubble");
      if (!last || last.textContent !== val) userBubble(val);
      if (last && !prefersReduced()) {
        var bubble = thread.querySelector(".chat-row.user:last-child .user-bubble");
        if (bubble) {
          bubble.classList.add("is-fold-plane");
          setTimeout(function () { bubble.classList.remove("is-fold-plane"); }, 1200);
        }
      }
    };

    // One confirmation bubble; keep note; hide composer; do not reset yet
    form._chatSuccess = function () {
      form.classList.add("is-success", "is-chatting");
      var composer = form.querySelector(".chat-composer");
      if (composer) composer.setAttribute("hidden", "");
      if (nextBtn) nextBtn.hidden = true;
      if (backBtn) backBtn.hidden = true;
      if (sendBtn) {
        sendBtn.hidden = true;
        sendBtn.classList.remove("is-sending");
        sendBtn.classList.add("is-success");
      }
      updateNote();
      loubyBubble("Got it. I will write back.", !prefersReduced());
    };

    form._chatReset = function () {
      answers = ["", "", ""];
      form.classList.remove("is-success", "is-chatting");
      var composer = form.querySelector(".chat-composer");
      if (composer) composer.removeAttribute("hidden");
      showStep(0, { typing: false });
    };

    showStep(0, { typing: true });
  })();

  // Concept C: envelope open  })();

  // Concept C: envelope open
  (function initComposer() {
    var root = document.getElementById("composer");
    if (!root) return;
    var openBtn = document.getElementById("open-composer");
    var form = document.getElementById("contact-form");
    if (!openBtn || !form) return;
    openBtn.addEventListener("click", function () {
      root.classList.add("is-open");
      openBtn.setAttribute("aria-expanded", "true");
      form.hidden = false;
      var first = form.querySelector("input, textarea");
      if (first) setTimeout(function () { first.focus(); }, 40);
    });
  })();

  var form = document.getElementById("contact-form");
  var status = document.getElementById("form-status");
  var sendBtn = document.getElementById("send-btn");
  if (form) form.addEventListener("submit", function (e) {
    e.preventDefault();
    var isChat = form.classList.contains("form-chat");
    // Chat: only submit on the message step
    if (isChat) {
      var msgStep = form.querySelector('.cq-step[data-step-field="2"]');
      if (msgStep && msgStep.hasAttribute("hidden")) return;
      var msgField = document.getElementById("message");
      if (msgField && !msgField.reportValidity()) return;
    }
    if (status) {
      status.textContent = "Sending...";
      status.classList.remove("is-success", "is-error");
    }
    if (sendBtn) {
      sendBtn.classList.remove("is-success", "is-error");
      sendBtn.classList.add("is-sending");
      sendBtn.disabled = true;
      var label = sendBtn.querySelector(".btn-send-label");
      if (label) label.textContent = "Sending...";
    }
    // Snapshot chat answers into the note before the request
    if (isChat && typeof form._chatCommitMessage === "function") {
      form._chatCommitMessage();
    }
    fetch(form.action, {
      method: "POST",
      body: new FormData(form),
      headers: { Accept: "application/json" }
    }).then(function (res) {
      if (res.ok) {
        happySeal();
        spawnPlane(form.querySelector(".plane-stage"));
        spawnSat(form.querySelector(".sat-stage"));
        spawnEnv(form.querySelector(".env-fly"));
        if (isChat && typeof form._chatSuccess === "function") {
          // One confirmation in the thread; status stays quiet (sr-only)
          if (status) {
            status.textContent = "Got it. I will write back.";
            status.classList.add("is-success", "is-sr-only-status");
          }
          form._chatSuccess();
        } else {
          if (status) {
            status.textContent = "Got it. I will write back.";
            status.classList.add("is-success");
          }
          if (sendBtn) {
            sendBtn.classList.remove("is-sending");
            sendBtn.classList.add("is-success");
            var labelOk = sendBtn.querySelector(".btn-send-label");
            if (labelOk) labelOk.textContent = "Sent";
          }
          form.reset();
        }
        setTimeout(function () {
          if (sendBtn) {
            sendBtn.disabled = false;
            sendBtn.classList.remove("is-success", "is-sending");
            var label = sendBtn.querySelector(".btn-send-label");
            var concept = document.querySelector("[data-concept]");
            var kind = concept && concept.getAttribute("data-concept");
            if (label) {
              if (kind === "chat") label.textContent = "Send";
              else if (kind === "envelope") label.textContent = "Seal and send";
              else label.textContent = "Send it";
            }
          }
        }, 2200);
      } else {
        if (status) { status.textContent = "That didn't go through. Try LinkedIn for now."; status.classList.add("is-error"); }
        if (sendBtn) {
          sendBtn.disabled = false;
          sendBtn.classList.remove("is-sending");
          sendBtn.classList.add("is-error");
          var label = sendBtn.querySelector(".btn-send-label");
          if (label) label.textContent = "Try again";
        }
      }
    }).catch(function () {
      if (status) { status.textContent = "Network hiccup. Find me on LinkedIn if you need me fast."; status.classList.add("is-error"); }
      if (sendBtn) {
        sendBtn.disabled = false;
        sendBtn.classList.remove("is-sending");
        sendBtn.classList.add("is-error");
        var label = sendBtn.querySelector(".btn-send-label");
        if (label) label.textContent = "Try again";
      }
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


  /* —— Quiet Classroom whimsy —— */
  document.body.classList.add("qc-on");

  var progressWrap = document.querySelector(".progress");
  var brand = document.querySelector(".brand");
  if (brand && !reduce) {
    requestAnimationFrame(function () {
      setTimeout(function () {
        brand.classList.add("is-tip");
        setTimeout(function () { brand.classList.remove("is-tip"); }, 700);
      }, 450);
    });
  }

  var _show = show;
  show = function (n) {
    _show(n);
    if (progressWrap) {
      progressWrap.classList.add("is-tick");
      if (fill) {
        fill.classList.add("is-bloom");
        setTimeout(function () {
          fill.classList.remove("is-bloom");
          progressWrap.classList.remove("is-tick");
        }, 700);
      }
    }
    if (n === 5) qcCountMetrics();
    qcIdlePortrait(n);
  };

  // Choice bloom / soft shake
  document.querySelectorAll("[data-choice]").forEach(function (btn) {
    btn.addEventListener("click", function () {
      if (reduce) return;
      var which = btn.getAttribute("data-choice");
      document.querySelectorAll("[data-choice]").forEach(function (b) {
        b.classList.remove("is-correct-bloom", "is-soft-shake");
      });
      if (which === "monday") {
        btn.classList.add("is-correct-bloom");
      } else {
        btn.classList.add("is-soft-shake");
        setTimeout(function () { btn.classList.remove("is-soft-shake"); }, 140);
      }
    });
  });

  // Workflow ink blot on click
  document.querySelectorAll(".wf-row").forEach(function (row) {
    if (!row.style.position) row.style.position = "relative";
    row.addEventListener("click", function (e) {
      if (reduce) return;
      var r = row.getBoundingClientRect();
      row.style.setProperty("--ink-x", (e.clientX - r.left) + "px");
      row.style.setProperty("--ink-y", (e.clientY - r.top) + "px");
      row.classList.remove("is-ink");
      void row.offsetWidth;
      row.classList.add("is-ink");
      setTimeout(function () { row.classList.remove("is-ink"); }, 560);
    });
  });

  var metricsDone = false;
  function qcCountMetrics() {
    if (metricsDone || reduce) return;
    var metrics = document.querySelectorAll(".panel[data-step='5'] .metric");
    if (!metrics.length) return;
    metricsDone = true;
    metrics.forEach(function (el) {
      var original = el.textContent;
      el.setAttribute("data-original", original);
      // Only animate leading integers when present; keep original meaning
      var all = original.match(/\d[\d,]*/g) || [];
      if (all.length !== 1) {
        el.classList.add("is-counting");
        setTimeout(function () { el.classList.remove("is-counting"); }, 700);
        return;
      }
      var m = all[0];
      var target = parseInt(m.replace(/,/g, ""), 10);
      if (!isFinite(target) || target > 20000) {
        el.classList.add("is-counting");
        setTimeout(function () { el.classList.remove("is-counting"); }, 700);
        return;
      }
      el.classList.add("is-counting");
      var start = performance.now();
      var dur = 600;
      function tick(now) {
        var t = Math.min(1, (now - start) / dur);
        var eased = 1 - Math.pow(1 - t, 3);
        var cur = Math.round(target * eased);
        el.textContent = original.replace(m, String(cur));
        if (t < 1) requestAnimationFrame(tick);
        else {
          el.textContent = original;
          setTimeout(function () { el.classList.remove("is-counting"); }, 400);
        }
      }
      requestAnimationFrame(tick);
    });
  }

  function qcIdlePortrait(n) {
    if (reduce) return;
    document.querySelectorAll(".hero-shot, .portrait, .seal-portrait, .contact-host-shot").forEach(function (el) {
      el.classList.remove("is-idle");
    });
    var sel;
    if (n === 0) sel = ".panel[data-step='0'] .portrait";
    else if (n === 6) sel = ".panel[data-step='6'] .contact-host-shot";
    else sel = null;
    var el = sel ? document.querySelector(sel) : null;
    if (!el) return;
    el.classList.add("is-idle");
    setTimeout(function () { el.classList.remove("is-idle"); }, 1800);
  }

  // Triple-click wink on diploma / hero seal
  (function () {
    var clicks = 0;
    var timer = null;
    function wink(target) {
      if (reduce || !target) return;
      target.classList.add("is-wink");
      setTimeout(function () { target.classList.remove("is-wink"); }, 500);
    }
    document.querySelectorAll(".seal-portrait, .panel[data-step='0'] .portrait").forEach(function (el) {
      el.addEventListener("click", function () {
        clicks++;
        clearTimeout(timer);
        timer = setTimeout(function () { clicks = 0; }, 600);
        if (clicks >= 3) {
          clicks = 0;
          wink(el);
        }
      });
    });
  })();

  show(0);
})();
