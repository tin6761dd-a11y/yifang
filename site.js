(function () {
  function enhance() {
    if (window.YifangRender && typeof window.YifangRender.bindInteractions === "function") {
      window.YifangRender.bindInteractions(document);
      return;
    }
    var root = document.body || document;
    if (!root || root.getAttribute("data-yf-bound") === "1") return;
    root.setAttribute("data-yf-bound", "1");

    function scopeOf(el) {
      return (el && el.closest && el.closest(".filter-scope")) || root;
    }
    function apply(scope, cat, btn) {
      scope = scope || root;
      var buttons = scope.querySelectorAll(".filters button");
      var cards = scope.querySelectorAll(".filter-item");
      var qEl = scope.querySelector(".filter-search");
      var q = qEl ? String(qEl.value || "").trim().toLowerCase() : "";
      if (cat == null) {
        var active = scope.querySelector('.filters button[aria-pressed="true"]');
        cat = (active && active.getAttribute("data-cat")) || "all";
      }
      buttons.forEach(function (b) {
        var on = btn ? b === btn : b.getAttribute("data-cat") === cat;
        b.setAttribute("aria-pressed", on ? "true" : "false");
        b.classList.toggle("is-active", on);
        if (on) cat = b.getAttribute("data-cat") || cat;
      });
      cards.forEach(function (card) {
        var matchCat = cat === "all" || card.getAttribute("data-category") === cat;
        var hay = (card.getAttribute("data-search") || card.textContent || "").toLowerCase();
        card.hidden = !(matchCat && (!q || hay.indexOf(q) !== -1));
      });
    }

    root.addEventListener("click", function (e) {
      var t = e.target;
      if (!t || !t.closest) return;
      var filterBtn = t.closest(".filters button");
      if (filterBtn) {
        apply(scopeOf(filterBtn), filterBtn.getAttribute("data-cat"), filterBtn);
        return;
      }
      var thumb = t.closest(".thumbs button");
      if (thumb) {
        var g = thumb.closest(".gallery");
        if (!g) return;
        var main = g.querySelector(".main-photo");
        if (main && thumb.getAttribute("data-src")) {
          main.src = thumb.getAttribute("data-src");
          if (thumb.getAttribute("data-alt")) main.alt = thumb.getAttribute("data-alt");
        }
        g.querySelectorAll(".thumbs button").forEach(function (x) {
          x.setAttribute("aria-current", x === thumb ? "true" : "false");
        });
        return;
      }
      var inquire = t.closest(".inquire-product");
      if (inquire) {
        e.preventDefault();
        if (window.YifangRender && typeof window.YifangRender.openProductInquiry === "function") {
          window.YifangRender.openProductInquiry(inquire);
        }
        return;
      }
      var openChatBtn = t.closest(".open-site-chat");
      if (openChatBtn) {
        e.preventDefault();
        if (window.YifangRender && typeof window.YifangRender.openTawkChat === "function") {
          window.YifangRender.openTawkChat();
        } else if (window.Tawk_API) {
          try { if (window.Tawk_API.showWidget) window.Tawk_API.showWidget(); } catch (err) {}
          try { if (window.Tawk_API.maximize) window.Tawk_API.maximize(); } catch (err2) {}
        }
        return;
      }
      var toggle = t.closest(".float-toggle");
      if (toggle) {
        var wrap = toggle.closest(".float-contact");
        if (!wrap) return;
        if (wrap.classList.contains("has-unread")) {
          if (window.YifangRender && typeof window.YifangRender.openTawkChat === "function") {
            window.YifangRender.openTawkChat();
          }
          return;
        }
        var open = !wrap.classList.contains("is-open");
        wrap.classList.toggle("is-open", open);
        toggle.setAttribute("aria-expanded", open ? "true" : "false");
        var panel = wrap.querySelector(".float-panel");
        if (panel) panel.hidden = !open;
        return;
      }
      if (!t.closest(".float-contact")) {
        var fab = document.querySelector(".float-contact");
        if (!fab) return;
        fab.classList.remove("is-open");
        var btn = fab.querySelector(".float-toggle");
        var panel = fab.querySelector(".float-panel");
        if (btn) btn.setAttribute("aria-expanded", "false");
        if (panel) panel.hidden = true;
      }
    });
    root.addEventListener("input", function (e) {
      var t = e.target;
      if (t && t.classList && t.classList.contains("filter-search")) apply(scopeOf(t));
    });
  }

  function hydrateFromContent(data) {
    if (!window.YifangRender) {
      enhance();
      return;
    }
    const html = window.YifangRender.renderDocument(data);
    const parser = new DOMParser();
    const next = parser.parseFromString(html, "text/html");
    document.replaceChild(document.importNode(next.documentElement, true), document.documentElement);
    // Scripts in the replaced document do not re-execute; bind interactions here.
    enhance();
  }

  function start() {
    const baked = document.documentElement.getAttribute("data-baked") === "1";
    const hasCards = document.querySelector(".machine, .part-card, .new-machine");
    if (baked && hasCards) {
      enhance();
      return;
    }
    fetch("content.json", { cache: "no-store" })
      .then((res) => {
        if (!res.ok) throw new Error("content.json missing");
        return res.json();
      })
      .then(hydrateFromContent)
      .catch(() => enhance());
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", start);
  } else {
    start();
  }
})();
