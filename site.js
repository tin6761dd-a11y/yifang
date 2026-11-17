(function () {
  function enhance() {
    if (window.YifangRender && typeof window.YifangRender.bindInteractions === "function") {
      window.YifangRender.bindInteractions(document);
      return;
    }
    var root = document.body || document;
    if (!root || root.getAttribute("data-yf-bound") === "1") return;
    root.setAttribute("data-yf-bound", "1");
    root.addEventListener("click", function (e) {
      var t = e.target;
      if (!t || !t.closest) return;
      var filterBtn = t.closest(".filters button");
      if (filterBtn) {
        var cat = filterBtn.getAttribute("data-cat");
        document.querySelectorAll(".filters button").forEach(function (b) {
          var on = b === filterBtn;
          b.setAttribute("aria-pressed", on ? "true" : "false");
          b.classList.toggle("is-active", on);
        });
        document.querySelectorAll(".machine").forEach(function (card) {
          card.hidden = !(cat === "all" || card.getAttribute("data-category") === cat);
        });
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
      var toggle = t.closest(".float-toggle");
      if (toggle) {
        var wrap = toggle.closest(".float-contact");
        if (!wrap) return;
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
    const hasCards = document.querySelector(".machine");
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
