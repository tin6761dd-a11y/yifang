(function () {
  function enhance() {
    const buttons = document.querySelectorAll(".filters button");
    const cards = document.querySelectorAll(".machine");
    buttons.forEach((btn) => {
      btn.addEventListener("click", () => {
        const cat = btn.getAttribute("data-cat");
        buttons.forEach((b) => b.setAttribute("aria-pressed", b === btn ? "true" : "false"));
        cards.forEach((card) => {
          const show = cat === "all" || card.getAttribute("data-category") === cat;
          card.hidden = !show;
        });
      });
    });
    document.querySelectorAll(".gallery").forEach((g) => {
      const main = g.querySelector(".main-photo");
      const thumbs = g.querySelectorAll(".thumbs button");
      thumbs.forEach((btn) => {
        btn.addEventListener("click", () => {
          const src = btn.getAttribute("data-src");
          const alt = btn.getAttribute("data-alt") || (main && main.alt);
          if (src && main) {
            main.src = src;
            main.alt = alt;
          }
          thumbs.forEach((t) => t.setAttribute("aria-current", t === btn ? "true" : "false"));
        });
      });
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
