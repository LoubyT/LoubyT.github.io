/* script.js - robust site behavior
   Smooth scroll, reveal, hamburger, expandable cards, lightbox
   Drop-in replacement (defensive + delegated handlers)
*/
(function () {
  "use strict";

  /* =========================
     Helpers
  ========================= */
  function getHeaderOffset() {
    const nav = document.querySelector("nav");
    return nav ? nav.offsetHeight : 0;
  }

  function prefersReducedMotion() {
    try {
      return window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    } catch (e) {
      return false;
    }
  }

  function safeQueryAll(selector) {
    try {
      return Array.from(document.querySelectorAll(selector));
    } catch (e) {
      return [];
    }
  }

  function normalizePathForComparison(path) {
    if (!path) return "/";
    try {
      const u = new URL(path, window.location.origin);
      let p = u.pathname.replace(/\/+$/, "");
      if (p === "" || p === "/index.html" || p === "/") return "/";
      return p;
    } catch (e) {
      let p = path.split("?")[0].split("#")[0].replace(/\/+$/, "");
      if (p === "" || p === "index.html") return "/";
      return p;
    }
  }

  function debugLog(...args) {
    if (window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1") {
      console.debug("[site script]", ...args);
    }
  }

  function sanitizeHashFromUrl() {
    if (!history.replaceState) return;
    const cleanUrl = window.location.pathname + window.location.search;
    try {
      history.replaceState(null, "", cleanUrl);
    } catch (e) {
      /* ignore */
    }
  }

  /* =========================
     Hamburger menu toggle + accessibility
  ========================= */
  (function initHamburgerMenu() {
    try {
      const hamburger = document.querySelector(".hamburger");
      const navigation = document.querySelector(".navigation");
      if (!hamburger || !navigation) return;

      const setExpanded = (expanded) => {
        hamburger.setAttribute("aria-expanded", expanded ? "true" : "false");
      };

      const closeMenu = () => {
        hamburger.classList.remove("active");
        navigation.classList.remove("active");
        setExpanded(false);
      };

      const toggleMenu = () => {
        const isActive = hamburger.classList.toggle("active");
        navigation.classList.toggle("active", isActive);
        setExpanded(isActive);
      };

      hamburger.addEventListener("click", toggleMenu);
      hamburger.addEventListener("keydown", (e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          toggleMenu();
        }
      });

      safeQueryAll(".main-nav-link").forEach((link) => link.addEventListener("click", closeMenu));
      setExpanded(hamburger.classList.contains("active"));
    } catch (err) {
      console.warn("Hamburger init failed:", err);
    }
  })();

  /* =========================
     Anchor behavior + URL sanitizing (ALL pages)
     - Smooth scroll when possible
     - ALWAYS strip the hash after navigation via hashchange fallback
  ========================= */
  (function initAnchors() {
    try {
      // 1) If page loads with a hash (direct link), strip it after load.
      window.addEventListener("load", () => {
        if (window.location.hash) {
          // Let initial jump happen, then clean URL.
          setTimeout(sanitizeHashFromUrl, 0);
        }
      });

      // 2) If hash changes for any reason, clean it.
      // This makes sanitizing work even when click handlers don't run.
      window.addEventListener("hashchange", () => {
        // Only sanitize if the hash actually points to an element on THIS page
        const hash = window.location.hash;
        if (!hash || hash === "#") return;

        const el = document.querySelector(hash);
        if (!el) return;

        // Give the browser one tick to finish the built-in anchor jump
        setTimeout(sanitizeHashFromUrl, 0);
      });

      // 3) Smooth scroll interception (nice-to-have). Sanitizing is handled above regardless.
      document.addEventListener(
        "click",
        function (event) {
          const link = event.target.closest && event.target.closest('a[href*="#"]');
          if (!link) return;

          // allow new tab / modifier clicks
          if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
          if (link.target && link.target !== "_self") return;

          if (link.hasAttribute("data-skip-smooth")) return;

          const href = link.getAttribute("href");
          if (!href) return;

          let u;
          try {
            u = new URL(href, window.location.href);
          } catch (e) {
            return;
          }

          // same-origin only
          if (u.origin !== window.location.origin) return;

          // same-document only (treat "/" and "/index.html" as the same)
          const linkPathNorm = normalizePathForComparison(u.pathname || "/");
          const currentPathNorm = normalizePathForComparison(window.location.pathname || "/");
          if (linkPathNorm !== currentPathNorm) return;

          // must have a hash target
          if (!u.hash || u.hash === "#") return;

          const target = document.querySelector(u.hash);
          if (!target) return;

          // If reduced motion is on, allow default jump; hashchange listener will sanitize.
          if (prefersReducedMotion()) return;

          // Smooth scroll ourselves
          event.preventDefault();

          const headerHeight = getHeaderOffset();
          const rect = target.getBoundingClientRect();
          const targetY = rect.top + window.pageYOffset - headerHeight - 8;

          window.scrollTo({ top: Math.max(0, Math.round(targetY)), behavior: "smooth" });

          // Clean URL shortly after scroll begins
          setTimeout(sanitizeHashFromUrl, 450);
        },
        true // capture: helps when something else stops propagation
      );

      debugLog("anchor behavior initialized");
    } catch (err) {
      console.warn("Anchors init failed:", err);
    }
  })();

  /* =========================
     Scroll reveal
  ========================= */
  (function initScrollReveal() {
    try {
      const boot = () => {
        const revealEls = safeQueryAll("[data-reveal]");
        if (!revealEls.length) return;

        if (prefersReducedMotion() || typeof IntersectionObserver === "undefined") {
          revealEls.forEach((el) => el.classList.add("reveal-visible"));
          return;
        }

        revealEls.forEach((el) => {
          if (!el.classList.contains("reveal")) el.classList.add("reveal");
          const d = el.getAttribute("data-reveal-delay");
          if (d) {
            const n = Number(d);
            if (!Number.isNaN(n) && n > 0) el.style.transitionDelay = `${n * 120}ms`;
          }
        });

        const io = new IntersectionObserver(
          (entries, observer) => {
            entries.forEach((entry) => {
              if (!entry.isIntersecting) return;
              entry.target.classList.add("reveal-visible");
              observer.unobserve(entry.target);
            });
          },
          { threshold: 0.12, rootMargin: "0px 0px -8% 0px" }
        );

        revealEls.forEach((el) => io.observe(el));
      };

      if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", boot, { once: true });
      } else {
        boot();
      }
    } catch (err) {
      console.warn("Scroll reveal init failed:", err);
    }
  })();

  /* =========================
     Expandable cards (data-expandable)
  ========================= */
  (function initExpandableCards() {
    try {
      const cards = safeQueryAll("[data-expandable]");
      if (!cards.length) return;

      cards.forEach((card) => {
        const contents = Array.from(card.querySelectorAll("p, ul"));
        if (!contents.length) return;

        if (!card.hasAttribute("role")) card.setAttribute("role", "button");
        if (!card.hasAttribute("tabindex")) card.setAttribute("tabindex", "0");
        if (!card.hasAttribute("aria-expanded")) card.setAttribute("aria-expanded", "false");

        const setExpanded = (expanded) => {
          card.setAttribute("aria-expanded", expanded ? "true" : "false");
          contents.forEach((el) => el.classList.toggle("expanded", expanded));
        };

        const toggle = () => {
          const expanded = card.getAttribute("aria-expanded") === "true";
          setExpanded(!expanded);
        };

        card.addEventListener("click", (e) => {
          if (e.target.closest && e.target.closest("a")) return;
          toggle();
        });

        card.addEventListener("keydown", (e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            toggle();
          }
        });
      });
    } catch (err) {
      console.warn("Expandable cards init failed:", err);
    }
  })();

  /* =========================
     Lightbox for images (img[data-lightbox])
  ========================= */
  (function initLightbox() {
    try {
      const candidates = safeQueryAll("img[data-lightbox]");
      if (!candidates.length) return;

      let overlayEl = null;
      let imgEl = null;
      let captionEl = null;
      let lastFocused = null;

      function build() {
        overlayEl = document.createElement("div");
        overlayEl.className = "lb-overlay";
        overlayEl.setAttribute("role", "dialog");
        overlayEl.setAttribute("aria-modal", "true");
        overlayEl.setAttribute("aria-label", "Image preview");

        overlayEl.innerHTML = `
          <div class="lb-backdrop" data-lb-close="true"></div>
          <div class="lb-content" role="document">
            <button class="lb-close" type="button" aria-label="Close image" data-lb-close="true">×</button>
            <img class="lb-img" alt="">
            <div class="lb-caption" aria-live="polite"></div>
          </div>
        `;

        document.body.appendChild(overlayEl);

        imgEl = overlayEl.querySelector(".lb-img");
        captionEl = overlayEl.querySelector(".lb-caption");

        overlayEl.addEventListener("click", (e) => {
          const close = e.target && e.target.getAttribute && e.target.getAttribute("data-lb-close") === "true";
          if (close) hide();
        });

        document.addEventListener("keydown", (e) => {
          if (!overlayEl.classList.contains("open")) return;
          if (e.key === "Escape") hide();
        });
      }

      function show({ src, alt = "" }) {
        if (!overlayEl) build();
        lastFocused = document.activeElement;

        imgEl.src = src;
        imgEl.alt = alt || "Image preview";
        captionEl.textContent = alt || "";

        overlayEl.classList.add("open");
        document.body.classList.add("lb-noscroll");

        const btn = overlayEl.querySelector(".lb-close");
        if (btn) btn.focus();
      }

      function hide() {
        if (!overlayEl) return;
        overlayEl.classList.remove("open");
        document.body.classList.remove("lb-noscroll");
        if (imgEl) imgEl.src = "";
        if (lastFocused && typeof lastFocused.focus === "function") lastFocused.focus();
      }

      candidates.forEach((img) => {
        if (img.closest && img.closest("a")) return;
        img.style.cursor = "zoom-in";
        img.addEventListener("click", (e) => {
          e.preventDefault();
          e.stopPropagation();
          const src = img.getAttribute("src");
          if (!src) return;
          const alt = img.getAttribute("alt") || "";
          show({ src, alt });
        });
      });
    } catch (err) {
      console.warn("Lightbox init failed:", err);
    }
  })();
})();
