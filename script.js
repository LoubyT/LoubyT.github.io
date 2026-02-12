/* script.js - robust site behavior
   Smooth scroll, reveal, hamburger, expandable cards, lightbox
   Drop-in replacement (defensive + delegated handlers)
*/
(function () {
  "use strict";

  /* =========================
     Helpers
  ========================= */
  function isHomePage() {
    // Accepts "/", "/index.html", "index.html" variants
    const p = (window.location.pathname || "/").replace(/\/+$/, "");
    return p === "" || p === "/" || p === "/index.html" || p === "index.html";
  }

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
    // Remove query/hash and trailing slashes
    try {
      const u = new URL(path, window.location.origin);
      let p = u.pathname.replace(/\/+$/, "");
      if (p === "" || p === "/index.html" || p === "/") return "/";
      return p;
    } catch (e) {
      // fallback for relative paths
      let p = path.split("?")[0].split("#")[0].replace(/\/+$/, "");
      if (p === "" || p === "index.html") return "/";
      return p;
    }
  }

  function debugLog(...args) {
    if (window && window.location && window.location.hostname === "localhost") {
      console.debug("[site script]", ...args);
    } else {
      // minimal logging on non-local
      // console.debug("[site script]", ...args);
    }
  }

  /* =========================
     Hamburger menu toggle + accessibility
  ========================= */
  (function initHamburgerMenu() {
    try {
      const hamburger = document.querySelector(".hamburger");
      const navigation = document.querySelector(".navigation");
      if (!hamburger || !navigation) {
        debugLog("hamburger or navigation not found, skipping hamburger init");
        return;
      }

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

      // close menu when nav links clicked
      safeQueryAll(".main-nav-link").forEach((link) => link.addEventListener("click", closeMenu));

      setExpanded(hamburger.classList.contains("active"));
      debugLog("hamburger initialized");
    } catch (err) {
      console.warn("Hamburger init failed:", err);
    }
  })();

  /* =========================
     Smooth scroll for in-page links (delegated)
     - Handles anchors like #x, /#x, index.html#x, /index.html#x
     - Only intercepts same-document anchors
  ========================= */
  (function initSmoothScroll() {
    try {
      if (prefersReducedMotion()) {
        debugLog("prefers-reduced-motion enabled: skipping smooth scroll");
        return;
      }

      document.addEventListener("click", function (event) {
        const link = event.target.closest && event.target.closest('a[href*="#"]');
        if (!link) return;

        // opt-out data attribute
        if (link.hasAttribute("data-skip-smooth")) return;

        const hash = link.hash;
        if (!hash || hash === "#") return;

        // Only handle same-origin links
        const linkHost = link.hostname || window.location.hostname;
        if (linkHost !== window.location.hostname) return;

        // Normalize pathnames: treat "/" and "/index.html" as equal
        const linkPath = normalizePathForComparison(link.getAttribute("href") || link.pathname || "");
        const currentPath = normalizePathForComparison(window.location.pathname || "/");

        if (linkPath !== currentPath) {
          // not the same document (let browser navigate)
          return;
        }

        const target = document.querySelector(hash);
        if (!target) return;

        event.preventDefault();

        const headerHeight = getHeaderOffset();
        const rect = target.getBoundingClientRect();
        const targetY = rect.top + window.pageYOffset - headerHeight - 8;

        window.scrollTo({ top: Math.max(0, Math.round(targetY)), behavior: "smooth" });

        // remove fragment from URL on homepage to keep it clean
        if (history.replaceState && isHomePage()) {
          const cleanUrl = window.location.origin + window.location.pathname;
          // small delay so browser completes scroll behavior nicely
          setTimeout(() => {
            try {
              history.replaceState(null, "", cleanUrl);
            } catch (e) {
              /* ignore history errors */
            }
          }, 450);
        }
      });

      debugLog("smooth scroll initialized (delegated)");
    } catch (err) {
      console.warn("Smooth scroll init failed:", err);
    }
  })();

  /* =========================
     Scroll reveal
     - data-reveal attribute used on elements
     - Adds .reveal class then uses IntersectionObserver
  ========================= */
  (function initScrollReveal() {
    try {
      const boot = () => {
        const revealEls = safeQueryAll("[data-reveal]");
        if (!revealEls.length) {
          debugLog("no [data-reveal] elements found");
          return;
        }

        if (prefersReducedMotion() || typeof IntersectionObserver === "undefined") {
          revealEls.forEach((el) => el.classList.add("reveal-visible"));
          debugLog("reveal: reduced-motion or no IO -> showing all immediately");
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
        debugLog("reveal: IntersectionObserver observing", revealEls.length, "elements");
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
      if (!cards.length) {
        debugLog("no expandable cards found");
        return;
      }

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
          // let links inside card behave normally
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

      debugLog("expandable cards initialized:", cards.length);
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
      if (!candidates.length) {
        debugLog("no lightbox images present");
        return;
      }

      let overlayEl = null;
      let imgEl = null;
      let closeBtn = null;
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
        closeBtn = overlayEl.querySelector(".lb-close");
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
        closeBtn.focus();
      }

      function hide() {
        if (!overlayEl) return;
        overlayEl.classList.remove("open");
        document.body.classList.remove("lb-noscroll");
        if (imgEl) imgEl.src = "";
        if (lastFocused && typeof lastFocused.focus === "function") lastFocused.focus();
      }

      candidates.forEach((img) => {
        // skip linked images
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

      debugLog("lightbox initialized for", candidates.length, "images");
    } catch (err) {
      console.warn("Lightbox init failed:", err);
    }
  })();

  /* Final small message */
  try {
    setTimeout(() => {
      console.debug("site script loaded — features: smooth scroll, reveal, hamburger, expandable cards, lightbox (if present)");
    }, 250);
  } catch (e) {
    /* ignore */
  }
})();
