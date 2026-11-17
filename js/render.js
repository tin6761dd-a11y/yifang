/**
 * Shared renderer for the 益芳 official site.
 * Works in Node (build script) and in the browser (admin preview / client hydrate).
 */
(function (root, factory) {
  if (typeof module === "object" && module.exports) {
    module.exports = factory();
  } else {
    root.YifangRender = factory();
  }
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  function escapeHtml(value) {
    return String(value == null ? "" : value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function escapeAttr(value) {
    return escapeHtml(value);
  }

  function normalizePhones(store) {
    store = store || {};
    var list = [];
    var seen = Object.create(null);
    function add(label, number) {
      number = String(number || "").trim();
      if (!number) return;
      var key = number.replace(/[^0-9+]/g, "");
      if (!key || seen[key]) return;
      seen[key] = true;
      list.push({
        label: String(label || "").trim(),
        number: number
      });
    }
    if (Array.isArray(store.phones) && store.phones.length) {
      store.phones.forEach(function (item) {
        if (item == null) return;
        if (typeof item === "string") add("", item);
        else add(item.label, item.number || item.phone);
      });
    }
    if (!list.length) add("", store.phone);
    return list;
  }

  function primaryPhone(store) {
    var list = normalizePhones(store);
    return list.length ? list[0] : { label: "", number: "" };
  }

  function toTelHref(number) {
    var digits = String(number || "").replace(/[^0-9+]/g, "");
    if (!digits) return "#";
    if (digits.indexOf("+") === 0) return "tel:" + digits;
    if (digits.charAt(0) === "0") return "tel:+886" + digits.slice(1);
    return "tel:" + digits;
  }

  function phoneHref(store) {
    if (store && store.phoneLink) return store.phoneLink;
    return toTelHref(primaryPhone(store).number);
  }

  function phoneDisplay(item) {
    if (!item || !item.number) return "";
    return item.label ? item.label + " " + item.number : item.number;
  }

  function phonesPlainText(store, sep) {
    return normalizePhones(store)
      .map(phoneDisplay)
      .filter(Boolean)
      .join(sep || "、");
  }

  function toSchemaTelephone(number) {
    var phone = String(number || "").trim();
    if (!phone) return "";
    if (phone.indexOf("+") === 0) return phone;
    if (phone.charAt(0) === "0") return "+886-" + phone.slice(1);
    return phone;
  }

  function renderPhoneLinks(store, options) {
    options = options || {};
    var className = options.className || "";
    var phones = normalizePhones(store);
    if (!phones.length) return "";
    return phones
      .map(function (item) {
        var cls = className ? ' class="' + escapeAttr(className) + '"' : "";
        return (
          "<a" +
          cls +
          ' href="' +
          escapeAttr(toTelHref(item.number)) +
          '">' +
          escapeHtml(phoneDisplay(item)) +
          "</a>"
        );
      })
      .join(options.join || "");
  }

  function renderPhoneButtons(store, options) {
    options = options || {};
    var className = options.className || "btn btn-outline";
    var phones = normalizePhones(store);
    if (!phones.length) return "";
    return phones
      .map(function (item) {
        var text = phoneDisplay(item);
        if (options.singlePrefix && phones.length === 1) {
          text = options.singlePrefix + (options.singlePrefix.slice(-1) === " " ? item.number : "");
        }
        return (
          '<a class="' +
          escapeAttr(className) +
          '" href="' +
          escapeAttr(toTelHref(item.number)) +
          '">' +
          escapeHtml(text) +
          "</a>"
        );
      })
      .join(options.join || "\n      ");
  }

  function renderPhoneDefinition(store) {
    var links = renderPhoneLinks(store, { join: "<br>\n            " });
    if (!links) return "";
    return "            <dt>電話</dt>\n            <dd>" + links + "</dd>\n";
  }


  function formatInt(n) {
    var s = String(n);
    return s.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  }

  function assetUrl(path, options) {
    if (!path) return "";
    options = options || {};
    var map = options.assetMap || {};
    if (map[path]) return map[path];
    var base = options.assetBase || "";
    if (/^https?:\/\//i.test(path) || path.indexOf("blob:") === 0 || path.indexOf("data:") === 0) {
      return path;
    }
    if (!base) return path;
    return base.replace(/\/?$/, "/") + path.replace(/^\//, "");
  }

  function uniqueCategories(groups) {
    var seen = Object.create(null);
    var list = [];
    (groups || []).forEach(function (g) {
      var cat = (g.category || "").trim();
      if (cat && !seen[cat]) {
        seen[cat] = true;
        list.push(cat);
      }
    });
    return list;
  }


  function logoChar(store) {
    var raw = String((store && (store.logoChar || store.mark)) || "維").trim();
    var chars = typeof Array.from === "function" ? Array.from(raw) : raw.split("");
    chars = chars.slice(0, 2);
    return chars.join("") || "維";
  }

  function labelsOf(content) {
    var labels = (content && content.labels) || {};
    var services = (content && content.services) || {};
    var used = (content && content.usedSection) || {};
    var contact = (content && content.contact) || {};
    return {
      about: labels.about || "關於我們",
      services: labels.services || services.title || "服務項目",
      used: labels.used || used.title || "中古機專區",
      contact: labels.contact || contact.title || "聯絡我們",
      faq: labels.faq || "常見問題",
      support: labels.support || "客服諮詢",
      heroShopee: labels.heroShopee || "蝦皮賣場",
      heroUsed: labels.heroUsed || "中古機專區",
      contactShopee: labels.contactShopee || "打開蝦皮賣場",
      filterAll: labels.filterAll || "全部",
      floatToggle: labels.floatToggle || labels.support || "客服諮詢"
    };
  }

  function paymentNoteOf(content) {
    if (!content) return "";
    if (content.paymentNote != null && String(content.paymentNote).trim()) {
      return String(content.paymentNote).trim();
    }
    if (content.announcement && String(content.announcement.text || "").trim()) {
      return String(content.announcement.text).trim();
    }
    return "";
  }

  function announcementOf(content) {
    var a = (content && content.announcement) || {};
    var enabled = a.enabled !== false;
    var text = String(a.text != null && String(a.text).trim() ? a.text : paymentNoteOf(content) || "").trim();
    return { enabled: enabled && !!text, text: text };
  }

  function normalizeChannels(content) {
    var list = (content && content.channels) || [];
    if (!Array.isArray(list)) return [];
    return list.map(function (ch) {
      ch = ch || {};
      return {
        type: String(ch.type || "other").toLowerCase(),
        label: String(ch.label || "").trim(),
        value: String(ch.value || ch.url || "").trim(),
        enabled: ch.enabled !== false
      };
    });
  }

  function channelHref(ch) {
    if (!ch) return "";
    var type = String(ch.type || "").toLowerCase();
    var value = String(ch.value || ch.url || "").trim();
    if (!value) return "";
    if (type === "phone" || type === "tel") return toTelHref(value);
    if (type === "facebook") {
      return value.replace(/^https?:\/\/m\.facebook\.com/i, "https://www.facebook.com");
    }
    if (type === "line") {
      if (/^https?:\/\//i.test(value) || /^line:\/\//i.test(value)) return value;
      var id = value.replace(/^@/, "");
      return "https://line.me/ti/p/~" + encodeURIComponent(id);
    }
    if (type === "email" || type === "mailto") {
      return value.indexOf("mailto:") === 0 ? value : "mailto:" + value;
    }
    if (/^(https?:|tel:|mailto:)/i.test(value)) return value;
    return value;
  }

  function visibleChannels(content) {
    return normalizeChannels(content).filter(function (ch) {
      return ch.enabled && !!channelHref(ch);
    });
  }

  function lineIdFromValue(value) {
    var raw = String(value || "").trim();
    if (!raw) return "";
    var match = raw.match(/line\.me\/ti\/p\/~?([^/?#]+)/i);
    if (match) {
      try {
        return decodeURIComponent(match[1]);
      } catch (err) {
        return match[1];
      }
    }
    return raw.replace(/^@/, "");
  }

  function channelDisplay(ch) {
    if (!ch) return "";
    var type = String(ch.type || "").toLowerCase();
    var value = String(ch.value || ch.url || "").trim();
    if (ch.label && value && (type === "phone" || type === "tel")) {
      return ch.label + " " + value;
    }
    if (type === "line") {
      if (ch.label && /LINE\s*ID/i.test(ch.label)) return ch.label;
      var id = lineIdFromValue(value);
      return id ? "LINE ID：" + id : ch.label || "LINE";
    }
    return ch.label || value;
  }

  function renderAnnouncement(content) {
    var a = announcementOf(content);
    if (!a.enabled) return "";
    return (
      '  <div class="announce" role="status">\n' +
      '    <div class="wrap">' +
      escapeHtml(a.text) +
      "</div>\n" +
      "  </div>\n"
    );
  }

  function renderPaymentLine(content, className) {
    var note = paymentNoteOf(content);
    if (!note) return "";
    var cls = className || "note payment-note";
    return '        <p class="' + escapeAttr(cls) + '">' + escapeHtml(note) + "</p>\n";
  }

  function renderChannelLinks(content, className) {
    var cls = className || "btn btn-outline";
    return visibleChannels(content)
      .map(function (ch) {
        var extra = " channel-" + escapeAttr(ch.type);
        return (
          '<a class="' +
          escapeAttr(cls) +
          extra +
          '" href="' +
          escapeAttr(channelHref(ch)) +
          '"' +
          (ch.type === "phone" || ch.type === "tel"
            ? ""
            : ' rel="noopener noreferrer" target="_blank"') +
          ">" +
          escapeHtml(channelDisplay(ch)) +
          "</a>"
        );
      })
      .join("\n            ");
  }

  function renderSupportSection(content) {
    var channels = visibleChannels(content);
    if (!channels.length) return "";
    var labels = labelsOf(content);
    var links = renderChannelLinks(content, "btn btn-outline");
    return (
      '    <section id="support">\n' +
      '      <div class="wrap">\n' +
      "        <h2>" +
      escapeHtml(labels.support) +
      "</h2>\n" +
      '        <p class="lead">有封口機、果糖機或中古機的問題，歡迎直接透過以下方式詢問。</p>\n' +
      '        <div class="actions support-actions">\n' +
      "            " +
      links +
      "\n" +
      "        </div>\n" +
      "      </div>\n" +
      "    </section>\n"
    );
  }

  function renderFloatContact(content) {
    var channels = visibleChannels(content);
    if (!channels.length) return "";
    var labels = labelsOf(content);
    var items = channels
      .map(function (ch) {
        return (
          '<a class="float-link channel-' +
          escapeAttr(ch.type) +
          '" href="' +
          escapeAttr(channelHref(ch)) +
          '"' +
          (ch.type === "phone" || ch.type === "tel"
            ? ""
            : ' rel="noopener noreferrer" target="_blank"') +
          ">" +
          escapeHtml(channelDisplay(ch)) +
          "</a>"
        );
      })
      .join("\n      ");
    return (
      '  <div class="float-contact">\n' +
      '    <button type="button" class="float-toggle" aria-expanded="false" aria-controls="float-panel">' +
      escapeHtml(labels.floatToggle) +
      "</button>\n" +
      '    <div id="float-panel" class="float-panel" hidden>\n' +
      "      " +
      items +
      "\n" +
      "    </div>\n" +
      "  </div>\n"
    );
  }

  function applyCategoryFilter(root, cat, btn) {
    root = root || (typeof document !== "undefined" ? document : null);
    if (!root || !root.querySelectorAll) return;
    var scope = root.body || root;
    var buttons = (scope.querySelectorAll ? scope : root).querySelectorAll(".filters button");
    var cards = (scope.querySelectorAll ? scope : root).querySelectorAll(".machine");
    for (var i = 0; i < buttons.length; i++) {
      var on = btn ? buttons[i] === btn : buttons[i].getAttribute("data-cat") === cat;
      buttons[i].setAttribute("aria-pressed", on ? "true" : "false");
      if (on) buttons[i].classList.add("is-active");
      else buttons[i].classList.remove("is-active");
    }
    for (var j = 0; j < cards.length; j++) {
      var show = cat === "all" || cards[j].getAttribute("data-category") === cat;
      cards[j].hidden = !show;
    }
  }

  function bindInteractions(root) {
    if (typeof document === "undefined") return;
    root = root || document;
    var scope = root.body ? root.body : root;
    if (!scope || !scope.addEventListener) return;
    if (scope.getAttribute && scope.getAttribute("data-yf-bound") === "1") return;
    if (scope.setAttribute) scope.setAttribute("data-yf-bound", "1");

    function setFloatOpen(open) {
      var wrap = scope.querySelector(".float-contact");
      if (!wrap) return;
      var toggle = wrap.querySelector(".float-toggle");
      var panel = wrap.querySelector(".float-panel");
      if (open) wrap.classList.add("is-open");
      else wrap.classList.remove("is-open");
      if (toggle) toggle.setAttribute("aria-expanded", open ? "true" : "false");
      if (panel) panel.hidden = !open;
    }

    scope.addEventListener("click", function (e) {
      var t = e.target;
      if (!t || !t.closest) return;
      var filterBtn = t.closest(".filters button");
      if (filterBtn && scope.contains(filterBtn)) {
        applyCategoryFilter(scope, filterBtn.getAttribute("data-cat"), filterBtn);
        return;
      }
      var thumb = t.closest(".thumbs button");
      if (thumb && scope.contains(thumb)) {
        var g = thumb.closest(".gallery");
        if (!g) return;
        var main = g.querySelector(".main-photo");
        var src = thumb.getAttribute("data-src");
        if (src && main) {
          main.src = src;
          if (thumb.getAttribute("data-alt")) main.alt = thumb.getAttribute("data-alt");
        }
        var thumbs = g.querySelectorAll(".thumbs button");
        for (var i = 0; i < thumbs.length; i++) {
          thumbs[i].setAttribute("aria-current", thumbs[i] === thumb ? "true" : "false");
        }
        return;
      }
      var toggle = t.closest(".float-toggle");
      if (toggle && scope.contains(toggle)) {
        var wrap = toggle.closest(".float-contact");
        setFloatOpen(!(wrap && wrap.classList.contains("is-open")));
        return;
      }
      if (!t.closest(".float-contact")) setFloatOpen(false);
    });

    var doc = scope.ownerDocument || (scope.nodeType === 9 ? scope : document);
    if (doc && doc.addEventListener) {
      doc.addEventListener("keydown", function (e) {
        if (e.key === "Escape") setFloatOpen(false);
      });
    }
  }

  function interactionScript() {
    return (
      "  <script>(function(){var r=document,s=r.body;if(!s||s.getAttribute('data-yf-bound')==='1')return;s.setAttribute('data-yf-bound','1');\n" +
      "function apply(cat,btn){var btns=s.querySelectorAll('.filters button'),cards=s.querySelectorAll('.machine'),i;for(i=0;i<btns.length;i++){var on=btn?btns[i]===btn:btns[i].getAttribute('data-cat')===cat;btns[i].setAttribute('aria-pressed',on?'true':'false');btns[i].classList.toggle('is-active',on);}for(i=0;i<cards.length;i++){cards[i].hidden=!(cat==='all'||cards[i].getAttribute('data-category')===cat);}}\n" +
      "function setOpen(open){var w=s.querySelector('.float-contact');if(!w)return;var t=w.querySelector('.float-toggle'),p=w.querySelector('.float-panel');w.classList.toggle('is-open',open);if(t)t.setAttribute('aria-expanded',open?'true':'false');if(p)p.hidden=!open;}\n" +
      "s.addEventListener('click',function(e){var t=e.target;if(!t||!t.closest)return;var fb=t.closest('.filters button');if(fb){apply(fb.getAttribute('data-cat'),fb);return;}var th=t.closest('.thumbs button');if(th){var g=th.closest('.gallery');if(!g)return;var main=g.querySelector('.main-photo');if(main&&th.getAttribute('data-src')){main.src=th.getAttribute('data-src');if(th.getAttribute('data-alt'))main.alt=th.getAttribute('data-alt');}g.querySelectorAll('.thumbs button').forEach(function(x){x.setAttribute('aria-current',x===th?'true':'false');});return;}var tg=t.closest('.float-toggle');if(tg){var w=tg.closest('.float-contact');setOpen(!(w&&w.classList.contains('is-open')));return;}if(!t.closest('.float-contact'))setOpen(false);});\n" +
      "r.addEventListener('keydown',function(e){if(e.key==='Escape')setOpen(false);});})();</script>\\n"
    );
  }


  function siteUrl(content) {
    var base = (content.site && content.site.baseUrl) || "";
    if (!base.endsWith("/")) base += "/";
    return base;
  }

  function renderJsonLd(content) {
    var store = content.store || {};
    var site = content.site || {};
    var url = siteUrl(content);
    var image = url + (site.ogImage || "og.jpg").replace(/^\//, "");
    var hours = (store.openingHours || []).map(function (h) {
      return {
        "@type": "OpeningHoursSpecification",
        dayOfWeek: h.days,
        opens: h.opens,
        closes: h.closes
      };
    });
    var phones = normalizePhones(store);
    var telephone = phones.length ? toSchemaTelephone(phones[0].number) : "";
    var data = {
      "@context": "https://schema.org",
      "@type": "LocalBusiness",
      name: store.name || "",
      image: image,
      url: url,
      telephone: telephone,
      description: site.description || "",
      address: {
        "@type": "PostalAddress",
        streetAddress: store.streetAddress || store.address || "",
        addressLocality: store.addressLocality || "",
        addressRegion: store.addressRegion || "",
        addressCountry: store.addressCountry || "TW"
      },
      openingHoursSpecification: hours,
      sameAs: (function () {
        var list = [];
        if (store.shopeeUrl) list.push(store.shopeeUrl);
        visibleChannels(content).forEach(function (ch) {
          var href = channelHref(ch);
          if (href && /^https?:\/\//i.test(href) && list.indexOf(href) === -1) list.push(href);
        });
        return list;
      })(),
      areaServed: ["台中市", "彰化縣", "南投縣"],
      priceRange: "$$"
    };
    if (phones.length) {
      data.contactPoint = phones.map(function (item) {
        var contactType = "customer service";
        if (item.label === "手機") contactType = "mobile";
        else if (item.label && item.label !== "客服") contactType = item.label;
        return {
          "@type": "ContactPoint",
          telephone: toSchemaTelephone(item.number),
          contactType: contactType,
          areaServed: "TW",
          availableLanguage: ["zh-TW"]
        };
      });
    }
    return JSON.stringify(data);
  }

  function renderHead(content, options) {
    var site = content.site || {};
    var store = content.store || {};
    var url = siteUrl(content);
    var title = escapeHtml(site.title || store.name || "");
    var desc = escapeAttr(site.description || "");
    var image = url + (site.ogImage || "og.jpg").replace(/^\//, "");
    var verification = site.googleSiteVerification
      ? '  <meta name="google-site-verification" content="' + escapeAttr(site.googleSiteVerification) + '" />\n'
      : "";
    return (
      "<!DOCTYPE html>\n" +
      '<html lang="' + escapeAttr(site.lang || "zh-Hant-TW") + '" data-baked="1">\n' +
      "<head>\n" +
      verification +
      '  <meta charset="utf-8">\n' +
      '  <meta name="viewport" content="width=device-width, initial-scale=1">\n' +
      "  <title>" + title + "</title>\n" +
      '  <meta name="description" content="' + desc + '">\n' +
      '  <meta name="robots" content="index,follow">\n' +
      '  <link rel="canonical" href="' + escapeAttr(url) + '">\n' +
      '  <meta property="og:type" content="website">\n' +
      '  <meta property="og:locale" content="zh_TW">\n' +
      '  <meta property="og:site_name" content="' + escapeAttr(store.name || "") + '">\n' +
      '  <meta property="og:title" content="' + title + '">\n' +
      '  <meta property="og:description" content="' + desc + '">\n' +
      '  <meta property="og:url" content="' + escapeAttr(url) + '">\n' +
      '  <meta property="og:image" content="' + escapeAttr(image) + '">\n' +
      '  <meta property="og:image:width" content="1200">\n' +
      '  <meta property="og:image:height" content="630">\n' +
      '  <meta name="twitter:card" content="summary_large_image">\n' +
      '  <meta name="twitter:title" content="' + title + '">\n' +
      '  <meta name="twitter:description" content="' + desc + '">\n' +
      '  <meta name="twitter:image" content="' + escapeAttr(image) + '">\n' +
      '  <link rel="icon" href="favicon.png" type="image/png">\n' +
      '  <link rel="apple-touch-icon" href="apple-touch-icon.png">\n' +
      '  <link rel="stylesheet" href="' + escapeAttr((options && options.stylesheet) || "styles.css") + '">\n' +
      '  <script type="application/ld+json">' + renderJsonLd(content) + "</script>\n" +
      "</head>\n"
    );
  }

  function renderMachineCard(group, content, options) {
    options = options || {};
    var store = content.store || {};
    var section = content.usedSection || {};
    var images = (group.images || []).filter(Boolean);
    var name = group.name || "";
    var alt = name;
    var id = group.id || "";
    var category = group.category || "";
    var main = images[0] ? assetUrl(images[0], options) : "";
    var thumbs = "";
    if (images.length) {
      thumbs =
        '<div class="thumbs" role="group" aria-label="更多照片">' +
        images
          .map(function (src, i) {
            var url = assetUrl(src, options);
            var current = i === 0 ? ' aria-current="true"' : "";
            return (
              '<button type="button" data-src="' +
              escapeAttr(url) +
              '" data-alt="' +
              escapeAttr(name + " 照片 " + (i + 1)) +
              '"' +
              current +
              '><img src="' +
              escapeAttr(url) +
              '" alt="" width="54" height="54"></button>'
            );
          })
          .join("") +
        "</div>";
    }
    var gallery = main
      ? '<div class="gallery"><img class="main-photo" src="' +
        escapeAttr(main) +
        '" alt="' +
        escapeAttr(alt) +
        '" width="800" height="800">' +
        thumbs +
        "</div>"
      : '<div class="gallery"></div>';
    var notes = (group.notes || [])
      .filter(Boolean)
      .map(function (n) {
        return '<p class="warn">' + escapeHtml(n) + "</p>";
      })
      .join("\n    ");
    var buyLabel = section.buyLabel || "到蝦皮購買";
    var callLabel = section.callLabel || "電話詢問";
    var shopee = store.shopeeUrl || "#";
    var callButtons = renderPhoneButtons(store, {
      className: "btn btn-outline",
      singlePrefix: callLabel,
      join: "\n      "
    });
    return (
      '<article class="card machine" data-category="' +
      escapeAttr(category) +
      '" id="' +
      escapeAttr(id) +
      '">\n' +
      "  " +
      gallery +
      "\n" +
      '  <div class="machine-body">\n' +
      '    <div class="kicker">' +
      escapeHtml(category) +
      "</div>\n" +
      "    <h3>" +
      escapeHtml(name) +
      "</h3>\n" +
      '    <p class="approx">' +
      escapeHtml(group.price || "") +
      "</p>\n" +
      "    <p>" +
      escapeHtml(group.description || "") +
      "</p>\n" +
      (notes ? "    " + notes + "\n" : "    \n") +
      '    <div class="actions">\n' +
      '      <a class="btn btn-blue" href="' +
      escapeAttr(shopee) +
      '" rel="noopener noreferrer" target="_blank">' +
      escapeHtml(buyLabel) +
      "</a>\n" +
      (callButtons ? "      " + callButtons + "\n" : "") +
      "    </div>\n" +
      "  </div>\n" +
      "</article>"
    );
  }

  function renderFilters(content) {
    var cats = uniqueCategories(content.groups || []);
    var labels = labelsOf(content);
    var allLabel = labels.filterAll;
    var buttons =
      '<button type="button" data-cat="all" class="is-active" aria-pressed="true">' +
      escapeHtml(allLabel) +
      "</button>" +
      cats
        .map(function (cat) {
          return (
            '<button type="button" data-cat="' +
            escapeAttr(cat) +
            '" aria-pressed="false">' +
            escapeHtml(cat) +
            "</button>"
          );
        })
        .join("");
    return '<div class="filters" role="toolbar" aria-label="依類別篩選">\n          ' + buttons + "\n        </div>";
  }

  function renderServices(content) {
    var svc = content.services || {};
    var items = (svc.items || [])
      .map(function (item) {
        var extra = item.priceFrom
          ? '<p class="price-from">' + escapeHtml(item.priceFrom) + "</p>"
          : "";
        return (
          '<article class="card"><h3>' +
          escapeHtml(item.title || "") +
          "</h3><p>" +
          escapeHtml(item.description || "") +
          "</p>" +
          extra +
          "</article>"
        );
      })
      .join("\n");
    return (
      '    <section id="services">\n' +
      '      <div class="wrap">\n' +
      "        <h2>" +
      escapeHtml(labelsOf(content).services) +
      "</h2>\n" +
      '        <p class="lead">' +
      escapeHtml(svc.lead || "") +
      "</p>\n" +
      '        <div class="svc">\n' +
      "          " +
      items +
      "\n" +
      "        </div>\n" +
      "      </div>\n" +
      "    </section>\n"
    );
  }

  function renderUsed(content, options) {
    var section = content.usedSection || {};
    var cards = (content.groups || [])
      .map(function (g) {
        return renderMachineCard(g, content, options);
      })
      .join("\n");
    return (
      '    <section id="used">\n' +
      '      <div class="wrap">\n' +
      "        <h2>" +
      escapeHtml(labelsOf(content).used) +
      "</h2>\n" +
      '        <p class="lead">' +
      escapeHtml(section.lead || "") +
      "</p>\n" +
      '        <p class="note">' +
      escapeHtml(section.note || (content.store && content.store.usedMachineNote) || "") +
      "</p>\n" +
      renderPaymentLine(content) +
      "        " +
      renderFilters(content) +
      "\n" +
      '        <div class="cards">\n' +
      "          \n" +
      cards +
      "\n" +
      "        </div>\n" +
      "      </div>\n" +
      "    </section>\n"
    );
  }

  function renderFaq(content) {
    var faq = content.faq || [];
    if (!faq.length) return "";
    var items = faq
      .map(function (item) {
        return (
          "<article class=\"card\">\n" +
          "            <h3>" +
          escapeHtml(item.question || "") +
          "</h3>\n" +
          "            <p>" +
          escapeHtml(item.answer || "") +
          "</p>\n" +
          "          </article>"
        );
      })
      .join("\n          ");
    return (
      '    <section id="faq">\n' +
      '      <div class="wrap">\n' +
      "        <h2>" +
      escapeHtml(labelsOf(content).faq) +
      "</h2>\n" +
      '        <div class="faq-list">\n' +
      "          " +
      items +
      "\n" +
      "        </div>\n" +
      "      </div>\n" +
      "    </section>\n"
    );
  }

  function renderBody(content, options) {
    options = options || {};
    var store = content.store || {};
    var site = content.site || {};
    var contact = content.contact || {};
    var url = siteUrl(content);
    var shopee = store.shopeeUrl || "#";
    var reviews = formatInt(store.shopeeReviews || 0);
    var mapSrc =
      "https://www.google.com/maps?q=" +
      encodeURIComponent(store.address || "") +
      "&hl=zh-TW&output=embed";
    var shopeeHost = "";
    try {
      shopeeHost = shopee.replace(/^https?:\/\//i, "").replace(/\/$/, "");
    } catch (e) {
      shopeeHost = shopee;
    }

    var labels = labelsOf(content);
    var mark = logoChar(store);
    return (
      "<body>\n" +
      '  <a class="skip" href="#main">跳到主要內容</a>\n' +
      "  <header>\n" +
      '    <div class="wrap nav">\n' +
      '      <a class="brand" href="./">\n' +
      '        <span class="mark" aria-hidden="true" data-len="' +
      String(mark.length) +
      '">' +
      escapeHtml(mark) +
      "</span>\n" +
      "        <span>" +
      escapeHtml(store.name || "") +
      "</span>\n" +
      "      </a>\n" +
      '      <nav aria-label="主要">\n' +
      "        <ul>\n" +
      '          <li><a href="#about">' +
      escapeHtml(labels.about) +
      "</a></li>\n" +
      '          <li><a href="#services">' +
      escapeHtml(labels.services) +
      "</a></li>\n" +
      '          <li><a href="#used">' +
      escapeHtml(labels.used) +
      "</a></li>\n" +
      (visibleChannels(content).length
        ? '          <li><a href="#support">' +
          escapeHtml(labels.support) +
          "</a></li>\n"
        : "") +
      '          <li><a href="#contact">' +
      escapeHtml(labels.contact) +
      "</a></li>\n" +
      "        </ul>\n" +
      "      </nav>\n" +
      '      <div class="call-chips">\n        ' +
      renderPhoneButtons(store, {
        className: "call-chip",
        singlePrefix: "來電 ",
        join: "\n        "
      }) +
      "\n      </div>\n" +
      "    </div>\n" +
      "  </header>\n" +
      renderAnnouncement(content) +
      "\n" +
      '  <main id="main">\n' +
      '    <section class="hero">\n' +
      '      <div class="wrap">\n' +
      '        <p class="tag">' +
      escapeHtml(store.slogan || "") +
      "</p>\n" +
      "        <h1>" +
      escapeHtml(store.name || "") +
      "</h1>\n" +
      "        <p>" +
      escapeHtml(store.heroText || "") +
      "</p>\n" +
      '        <div class="actions">\n' +
      "          " +
      renderPhoneButtons(store, {
        className: "btn btn-light",
        singlePrefix: "電話詢問 ",
        join: "\n          "
      }) +
      "\n" +
      '          <a class="btn btn-ghost" href="' +
      escapeAttr(shopee) +
      '" rel="noopener noreferrer" target="_blank">' +
      escapeHtml(labels.heroShopee) +
      "</a>\n" +
      '          <a class="btn btn-ghost" href="#used">' +
      escapeHtml(labels.heroUsed) +
      "</a>\n" +
      "        </div>\n" +
      '        <div class="meta-row">\n' +
      "          <span>蝦皮評價 " +
      escapeHtml(store.shopeeRating || "") +
      " 星（" +
      escapeHtml(reviews) +
      " 則評價）</span>\n" +
      "          <span>經營 " +
      escapeHtml(store.years) +
      " 年</span>\n" +
      "          <span>" +
      escapeHtml(store.hours || "") +
      "</span>\n" +
      "        </div>\n" +
      "      </div>\n" +
      "    </section>\n" +
      "\n" +
      '    <section id="about">\n' +
      '      <div class="wrap grid-2">\n' +
      "        <div>\n" +
      "          <h2>" +
      escapeHtml(labels.about) +
      "</h2>\n" +
      '          <p class="lead">' +
      escapeHtml(store.aboutLead || "") +
      "</p>\n" +
      "          <p>" +
      escapeHtml(store.aboutBody || "") +
      "</p>\n" +
      "        </div>\n" +
      '        <aside class="card" aria-label="門市資料">\n' +
      "          <h3>門市資訊</h3>\n" +
      "          <dl>\n" +
      "            <dt>地址</dt>\n" +
      "            <dd>" +
      escapeHtml(store.address || "") +
      "</dd>\n" +
      renderPhoneDefinition(store) +
      "            <dt>營業時間</dt>\n" +
      "            <dd>" +
      escapeHtml(store.hours || "") +
      "</dd>\n" +
      "            <dt>蝦皮賣場</dt>\n" +
      "            <dd><a href=\"" +
      escapeAttr(shopee) +
      '" rel="noopener noreferrer" target="_blank">' +
      escapeHtml(shopeeHost) +
      "</a></dd>\n" +
      "          </dl>\n" +
      "        </aside>\n" +
      "      </div>\n" +
      "    </section>\n" +
      "\n" +
      renderServices(content) +
      "\n" +
      renderUsed(content, options) +
      (renderFaq(content) ? "\n" + renderFaq(content) : "\n") +
      '    <section id="contact">\n' +
      '      <div class="wrap contact-grid">\n' +
      "        <div>\n" +
      "          <h2>" +
      escapeHtml(labels.contact) +
      "</h2>\n" +
      '          <p class="lead">' +
      escapeHtml(contact.lead || "") +
      "</p>\n" +
      renderPaymentLine(content) +
      "          <dl>\n" +
      renderPhoneDefinition(store) +
      "            <dt>地址</dt>\n" +
      "            <dd>" +
      escapeHtml(store.address || "") +
      "</dd>\n" +
      "            <dt>營業時間</dt>\n" +
      "            <dd>" +
      escapeHtml(store.hours || "") +
      "</dd>\n" +
      "            <dt>蝦皮賣場</dt>\n" +
      '            <dd><a href="' +
      escapeAttr(shopee) +
      '" rel="noopener noreferrer" target="_blank">' +
      escapeHtml(shopee) +
      "</a>（" +
      escapeHtml(store.shopeeRating || "") +
      " 星，" +
      escapeHtml(reviews) +
      " 則評價，經營 " +
      escapeHtml(store.years) +
      " 年）</dd>\n" +
      "          </dl>\n" +
      '          <div class="actions" style="margin-top:1.2rem">\n' +
      "            " +
      renderPhoneButtons(store, {
        className: "btn btn-blue",
        singlePrefix: "電話詢問",
        join: "\n            "
      }) +
      "\n" +
      '            <a class="btn btn-outline" href="' +
      escapeAttr(shopee) +
      '" rel="noopener noreferrer" target="_blank">' +
      escapeHtml(labels.contactShopee) +
      "</a>\n" +
      "          </div>\n" +
      "        </div>\n" +
      "        <div>\n" +
      '          <iframe class="map" title="' +
      escapeAttr((store.name || "") + "位置地圖") +
      '" src="' +
      escapeAttr(mapSrc) +
      '" loading="lazy" referrerpolicy="no-referrer-when-downgrade" allowfullscreen></iframe>\n' +
      "        </div>\n" +
      "      </div>\n" +
      "    </section>\n" +
      "\n" +
      renderSupportSection(content) +
      "  </main>\n" +
      "\n" +
      "  <footer>\n" +
      '    <div class="wrap">\n' +
      "      <div>\n" +
      "        <strong>" +
      escapeHtml(store.name || "") +
      "</strong><br>\n" +
      "        " +
      escapeHtml(store.address || "") +
      "<br>\n" +
      "        " +
      renderPhoneLinks(store, { join: "<br>\n        " }) +
      "\n" +
      "      </div>\n" +
      "      <div>\n" +
      "        " +
      escapeHtml(store.footerNote || store.slogan || "") +
      "<br>\n" +
      '        <a href="' +
      escapeAttr(url + "sitemap.xml") +
      '">網站地圖</a>\n' +
      "      </div>\n" +
      "    </div>\n" +
      "  </footer>\n" +
      renderFloatContact(content) +
      (options && options.preview
        ? ""
        : "  <script src=\"" +
          escapeAttr(url + "js/render.js") +
          '" defer></script>\n  <script src="' +
          escapeAttr(url + "site.js") +
          '" defer></script>\n') +
      interactionScript() +
      "</body>\n" +
      "</html>\n"
    );
  }

  function renderDocument(content, options) {
    return renderHead(content, options) + renderBody(content, options);
  }

  function todayStamp(timeZone) {
    timeZone = timeZone || "Asia/Taipei";
    var parts = new Intl.DateTimeFormat("en-CA", {
      timeZone: timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit"
    }).formatToParts(new Date());
    var get = function (t) {
      return parts.find(function (p) {
        return p.type === t;
      }).value;
    };
    return get("year") + "-" + get("month") + "-" + get("day");
  }

  function renderSitemap(content, lastmod) {
    var url = siteUrl(content);
    lastmod = lastmod || todayStamp();
    return (
      '<?xml version="1.0" encoding="UTF-8"?>\n' +
      '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n' +
      "  <url>\n" +
      "    <loc>" +
      url +
      "</loc>\n" +
      "    <lastmod>" +
      lastmod +
      "</lastmod>\n" +
      "    <changefreq>weekly</changefreq>\n" +
      "    <priority>1.0</priority>\n" +
      "  </url>\n" +
      "</urlset>\n"
    );
  }

  function renderRobots(content) {
    var url = siteUrl(content);
    return (
      "User-agent: *\n" +
      "Allow: /\n" +
      "Disallow: /admin/\n" +
      "\n" +
      "Sitemap: " +
      url +
      "sitemap.xml\n"
    );
  }

  function render404(content) {
    var store = content.store || {};
    var url = siteUrl(content);
    var phoneLinks = renderPhoneLinks(store, { join: "<br>" });
    return (
      "<!DOCTYPE html>\n" +
      '<html lang="zh-Hant-TW">\n' +
      "<head>\n" +
      '  <meta charset="utf-8">\n' +
      '  <meta name="viewport" content="width=device-width, initial-scale=1">\n' +
      "  <title>找不到頁面｜" +
      escapeHtml(store.name || "") +
      "</title>\n" +
      '  <meta name="robots" content="noindex">\n' +
      '  <link rel="stylesheet" href="styles.css">\n' +
      '  <link rel="canonical" href="' +
      escapeAttr(url) +
      '">\n' +
      "</head>\n" +
      "<body>\n" +
      '  <main class="wrap" style="padding:4rem 0;text-align:center">\n' +
      "    <h1>找不到這個頁面</h1>\n" +
      "    <p>您要查看的頁面不存在，或已經移動位置。</p>\n" +
      '    <p><a class="btn btn-blue" href="./">回到' +
      escapeHtml(store.name || "首頁") +
      "首頁</a></p>\n" +
      "    <p>" +
      (phoneLinks ? "電話<br>" + phoneLinks : "") +
      "</p>\n" +
      "  </main>\n" +
      "</body>\n" +
      "</html>\n"
    );
  }

  function hydrate(document, content, options) {
    var html = renderDocument(content, options);
    if (typeof document.documentElement === "undefined") return html;
    var parsed;
    if (typeof DOMParser !== "undefined") {
      parsed = new DOMParser().parseFromString(html, "text/html");
      document.replaceChild(
        document.importNode(parsed.documentElement, true),
        document.documentElement
      );
    }
    return html;
  }

  return {
    escapeHtml: escapeHtml,
    assetUrl: assetUrl,
    normalizePhones: normalizePhones,
    primaryPhone: primaryPhone,
    toTelHref: toTelHref,
    phoneHref: phoneHref,
    phoneDisplay: phoneDisplay,
    phonesPlainText: phonesPlainText,
    uniqueCategories: uniqueCategories,
    logoChar: logoChar,
    labelsOf: labelsOf,
    paymentNoteOf: paymentNoteOf,
    announcementOf: announcementOf,
    normalizeChannels: normalizeChannels,
    channelHref: channelHref,
    visibleChannels: visibleChannels,
    applyCategoryFilter: applyCategoryFilter,
    bindInteractions: bindInteractions,
    siteUrl: siteUrl,
    todayStamp: todayStamp,
    renderJsonLd: renderJsonLd,
    renderMachineCard: renderMachineCard,
    renderDocument: renderDocument,
    renderSitemap: renderSitemap,
    renderRobots: renderRobots,
    render404: render404,
    hydrate: hydrate
  };
});
