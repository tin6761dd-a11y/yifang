(function () {
  "use strict";

  var CONFIG = {
    owner: "tin6761dd-a11y",
    repo: "yifang",
    branch: "main",
    contentPath: "content.json",
    tokenKey: "yifangAdminToken",
    api: "https://api.github.com",
    liveBase: "https://tin6761dd-a11y.github.io/yifang/",
    apiVersion: "2022-11-28"
  };

  var SEALER_TYPES = ["微電腦", "機械式", "碼錶機械式", "全自動", "非益芳", "未分類"];
  var CATEGORIES = ["二手封口機", "二手果糖機", "其他設備"];

  var state = {
    token: "",
    content: null,
    loadedCommitSha: "",
    pendingBlobs: Object.create(null), // path -> { bytes: Uint8Array, url: blobUrl }
    pendingDeletes: [],
    saving: false
  };

  var els = {};

  function $(id) {
    return document.getElementById(id);
  }

  function getStoredToken() {
    try {
      return window.localStorage.getItem(CONFIG.tokenKey) || "";
    } catch (err) {
      return "";
    }
  }

  function storeToken(token) {
    window.localStorage.setItem(CONFIG.tokenKey, token);
  }

  function clearToken() {
    try {
      window.localStorage.removeItem(CONFIG.tokenKey);
    } catch (err) {}
    state.token = "";
  }

  function apiErrorMessage(status, bodyText) {
    var msg = "";
    try {
      var parsed = JSON.parse(bodyText);
      msg = parsed.message || "";
    } catch (err) {}
    if (status === 401) return "登入權杖無效或已過期，請重新登入並建立新的權杖。";
    if (status === 403) return "沒有權限寫入這個網站。請確認權杖只選了 yifang，並且 Contents 是 Read and write（讀寫）。";
    if (status === 404) return "找不到官網資料。請確認權杖有選擇 yifang 這個專案，而且是用 tin6761dd-a11y 帳號建立的。";
    if (status === 409 || status === 422) {
      if (/fast forward|not a fast forward|Update is not a fast forward/i.test(bodyText + " " + msg)) {
        return "儲存失敗：官網資料在您編輯時已被更新。請重新載入頁面後再試一次，以免覆蓋別人的修改。";
      }
      return "儲存失敗：資料衝突或權限不足。請重新載入後再試一次。" + (msg ? "（" + msg + "）" : "");
    }
    if (!status) return "網路連線失敗，請檢查網路後再試一次。";
    return "發生錯誤（" + status + "）" + (msg ? "：" + msg : "，請稍後再試。");
  }

  async function gh(path, options) {
    options = options || {};
    var headers = {
      Accept: "application/vnd.github+json",
      Authorization: "Bearer " + state.token,
      "X-GitHub-Api-Version": CONFIG.apiVersion
    };
    if (options.body && typeof options.body !== "string") {
      headers["Content-Type"] = "application/json";
    }
    if (options.headers) {
      Object.keys(options.headers).forEach(function (k) {
        headers[k] = options.headers[k];
      });
    }
    var res;
    try {
      res = await fetch(CONFIG.api + path, {
        method: options.method || "GET",
        cache: "no-store",
        headers: headers,
        body: options.body
          ? typeof options.body === "string"
            ? options.body
            : JSON.stringify(options.body)
          : undefined
      });
    } catch (err) {
      var error = new Error(apiErrorMessage(0, ""));
      error.cause = err;
      throw error;
    }
    var text = await res.text();
    var data = null;
    if (text) {
      try {
        data = JSON.parse(text);
      } catch (err) {
        data = text;
      }
    }
    if (!res.ok) {
      var e = new Error(apiErrorMessage(res.status, text));
      e.status = res.status;
      e.body = data;
      throw e;
    }
    return data;
  }

  function bytesToBase64(bytes) {
    var chunk = 0x8000;
    var pieces = [];
    for (var i = 0; i < bytes.length; i += chunk) {
      pieces.push(String.fromCharCode.apply(null, bytes.subarray(i, i + chunk)));
    }
    return btoa(pieces.join(""));
  }

  function textToBase64(text) {
    return bytesToBase64(new TextEncoder().encode(text));
  }

  function decodeBase64Utf8(b64) {
    var bin = atob(b64.replace(/\s/g, ""));
    var bytes = new Uint8Array(bin.length);
    for (var i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return new TextDecoder("utf-8").decode(bytes);
  }

  async function commitFiles(files, deletes, message, expectedCommitSha) {
    var owner = CONFIG.owner;
    var repo = CONFIG.repo;
    var branch = CONFIG.branch;
    var refPath = "/repos/" + owner + "/" + repo + "/git/refs/heads/" + branch;
    var ref = await gh(refPath);
    var latestSha = ref.object && ref.object.sha;
    if (expectedCommitSha && latestSha && expectedCommitSha !== latestSha) {
      var conflict = new Error(
        "儲存失敗：官網資料在您編輯時已被更新。請重新載入頁面後再試一次，以免覆蓋別人的修改。"
      );
      conflict.status = 409;
      throw conflict;
    }
    var commit = await gh("/repos/" + owner + "/" + repo + "/git/commits/" + latestSha);
    var baseTreeSha = commit.tree.sha;

    var tree = [];
    for (var i = 0; i < files.length; i++) {
      var file = files[i];
      var blob = await gh("/repos/" + owner + "/" + repo + "/git/blobs", {
        method: "POST",
        body: { content: file.contentBase64, encoding: "base64" }
      });
      tree.push({ path: file.path, mode: "100644", type: "blob", sha: blob.sha });
    }
    (deletes || []).forEach(function (path) {
      tree.push({ path: path, mode: "100644", type: "blob", sha: null });
    });

    var newTree = await gh("/repos/" + owner + "/" + repo + "/git/trees", {
      method: "POST",
      body: { base_tree: baseTreeSha, tree: tree }
    });
    var newCommit = await gh("/repos/" + owner + "/" + repo + "/git/commits", {
      method: "POST",
      body: { message: message, tree: newTree.sha, parents: [latestSha] }
    });
    await gh(refPath, {
      method: "PATCH",
      body: { sha: newCommit.sha, force: false }
    });
    return newCommit.sha;
  }

  function showLogin(errorText) {
    els.loginView.hidden = false;
    els.editorView.hidden = true;
    els.preview.hidden = true;
    if (errorText) {
      els.loginError.hidden = false;
      els.loginError.textContent = errorText;
    } else {
      els.loginError.hidden = true;
      els.loginError.textContent = "";
    }
  }

  function showEditor() {
    els.loginView.hidden = true;
    els.editorView.hidden = false;
  }

  function setBanner(kind, text) {
    els.editorError.hidden = kind !== "error";
    els.editorOk.hidden = kind !== "ok";
    if (kind === "error") els.editorError.textContent = text || "";
    if (kind === "ok") els.editorOk.textContent = text || "";
  }

  function optionList(values, current, allowEmpty, allowCustom) {
    var html = "";
    if (allowEmpty) html += '<option value="">（不填）</option>';
    var found = !current;
    values.forEach(function (v) {
      var sel = current === v ? " selected" : "";
      if (current === v) found = true;
      html += '<option value="' + YifangRender.escapeHtml(v) + '"' + sel + ">" + YifangRender.escapeHtml(v) + "</option>";
    });
    if (allowCustom) {
      html += '<option value="__custom__"' + (!found && current ? " selected" : "") + ">其他（自行填寫）</option>";
    }
    return html;
  }

  function imageSrc(path) {
    if (!path) return "";
    if (state.pendingBlobs[path]) return state.pendingBlobs[path].url;
    if (/^https?:\/\//i.test(path) || path.indexOf("blob:") === 0) return path;
    return CONFIG.liveBase + path.replace(/^\//, "");
  }

  function renderServices() {
    var items = (state.content.services && state.content.services.items) || [];
    els.servicesList.innerHTML = items
      .map(function (item, i) {
        return (
          '<article class="card" data-service="' +
          i +
          '">' +
          '<div class="card-head">' +
          '<span class="title">服務 ' +
          (i + 1) +
          "</span>" +
          '<button type="button" class="btn btn-tiny btn-ghost" data-act="svc-up">上移</button>' +
          '<button type="button" class="btn btn-tiny btn-ghost" data-act="svc-down">下移</button>' +
          '<button type="button" class="btn btn-tiny btn-danger" data-act="svc-del">刪除</button>' +
          "</div>" +
          "<label>名稱 <input data-field=\"title\" type=\"text\" value=\"" +
          YifangRender.escapeHtml(item.title || "") +
          '"></label>' +
          "<label>說明 <textarea data-field=\"description\" rows=\"2\">" +
          YifangRender.escapeHtml(item.description || "") +
          "</textarea></label>" +
          "<label>價格標示（選填，例如 NT$800 起） <input data-field=\"priceFrom\" type=\"text\" value=\"" +
          YifangRender.escapeHtml(item.priceFrom || "") +
          '"></label>' +
          "</article>"
        );
      })
      .join("");
  }

  function renderGroups() {
    var groups = state.content.groups || [];
    els.groupsList.innerHTML = groups
      .map(function (g, i) {
        var photos = (g.images || [])
          .map(function (src, pi) {
            return (
              '<div class="photo" data-image="' +
              pi +
              '">' +
              '<img src="' +
              YifangRender.escapeHtml(imageSrc(src)) +
              '" alt="">' +
              '<div class="photo-actions">' +
              '<button type="button" class="btn btn-tiny btn-ghost" data-act="img-left" aria-label="左移">←</button>' +
              '<button type="button" class="btn btn-tiny btn-ghost" data-act="img-right" aria-label="右移">→</button>' +
              '<button type="button" class="btn btn-tiny btn-danger" data-act="img-del">刪</button>' +
              "</div></div>"
            );
          })
          .join("");
        var customCat = g.category && CATEGORIES.indexOf(g.category) === -1;
        var customType = g.sealerType && SEALER_TYPES.indexOf(g.sealerType) === -1;
        return (
          '<article class="card" data-group="' +
          i +
          '">' +
          '<div class="card-head">' +
          '<span class="title">' +
          YifangRender.escapeHtml(g.name || "未命名機型") +
          "</span>" +
          '<button type="button" class="btn btn-tiny btn-ghost" data-act="grp-up">上移</button>' +
          '<button type="button" class="btn btn-tiny btn-ghost" data-act="grp-down">下移</button>' +
          '<button type="button" class="btn btn-tiny btn-danger" data-act="grp-del">刪除這一組</button>' +
          "</div>" +
          '<label>名稱 <input data-field="name" type="text" value="' +
          YifangRender.escapeHtml(g.name || "") +
          '"></label>' +
          '<label>分類 <select data-field="category">' +
          optionList(CATEGORIES, g.category, false, true) +
          "</select></label>" +
          '<label class="custom-cat"' +
          (customCat ? "" : " hidden") +
          '>自訂分類 <input data-field="categoryCustom" type="text" value="' +
          YifangRender.escapeHtml(customCat ? g.category : "") +
          '"></label>' +
          '<label>機型種類 <select data-field="sealerType">' +
          optionList(SEALER_TYPES, g.sealerType, true, true) +
          "</select></label>" +
          '<label class="custom-type"' +
          (customType ? "" : " hidden") +
          '>自訂機型種類 <input data-field="sealerTypeCustom" type="text" value="' +
          YifangRender.escapeHtml(customType ? g.sealerType : "") +
          '"></label>' +
          '<label>參考售價（例如：約 NT$9,000 或 約 NT$10,000–15,000） <input data-field="price" type="text" value="' +
          YifangRender.escapeHtml(g.price || "") +
          '"></label>' +
          '<label>說明 <textarea data-field="description" rows="4">' +
          YifangRender.escapeHtml(g.description || "") +
          "</textarea></label>" +
          '<label>注意事項（每行一則） <textarea data-field="notes" rows="2">' +
          YifangRender.escapeHtml((g.notes || []).join("\n")) +
          "</textarea></label>" +
          "<p class=\"hint\">照片</p>" +
          '<div class="photos">' +
          photos +
          "</div>" +
          '<label class="file-btn btn btn-secondary">' +
          "上傳或更換照片" +
          '<input type="file" accept="image/*" multiple data-act="img-add">' +
          "</label>" +
          "</article>"
        );
      })
      .join("");
  }

  function renderFaq() {
    var faq = state.content.faq || [];
    els.faqList.innerHTML = faq
      .map(function (item, i) {
        return (
          '<article class="card" data-faq="' +
          i +
          '">' +
          '<div class="card-head">' +
          '<span class="title">問答 ' +
          (i + 1) +
          "</span>" +
          '<button type="button" class="btn btn-tiny btn-danger" data-act="faq-del">刪除</button>' +
          "</div>" +
          "<label>問題 <input data-field=\"question\" type=\"text\" value=\"" +
          YifangRender.escapeHtml(item.question || "") +
          '"></label>' +
          "<label>回答 <textarea data-field=\"answer\" rows=\"3\">" +
          YifangRender.escapeHtml(item.answer || "") +
          "</textarea></label>" +
          "</article>"
        );
      })
      .join("");
  }

  function phonesFromStore(store) {
    if (window.YifangRender && typeof YifangRender.normalizePhones === "function") {
      var normalized = YifangRender.normalizePhones(store || {});
      if (normalized.length) return normalized;
    }
    store = store || {};
    var list = [];
    if (Array.isArray(store.phones) && store.phones.length) {
      store.phones.forEach(function (item) {
        if (!item) return;
        if (typeof item === "string") {
          if (item.trim()) list.push({ label: "", number: item.trim() });
        } else {
          var number = String(item.number || item.phone || "").trim();
          if (number) list.push({ label: String(item.label || "").trim(), number: number });
        }
      });
    }
    if (!list.length && store.phone) {
      list.push({ label: "", number: String(store.phone).trim() });
    }
    return list;
  }

  function renderPhones() {
    var store = (state.content && state.content.store) || {};
    var items = Array.isArray(store.phones) ? store.phones.slice() : phonesFromStore(store);
    if (!items.length) items = [{ label: "客服", number: "" }];
    els.phonesList.innerHTML = items
      .map(function (item, i) {
        return (
          '<article class="card phone-card" data-phone="' +
          i +
          '">' +
          '<div class="card-head">' +
          '<span class="title">電話 ' +
          (i + 1) +
          "</span>" +
          '<button type="button" class="btn btn-tiny btn-ghost" data-act="phone-up">上移</button>' +
          '<button type="button" class="btn btn-tiny btn-ghost" data-act="phone-down">下移</button>' +
          '<button type="button" class="btn btn-tiny btn-danger" data-act="phone-del">刪除</button>' +
          "</div>" +
          '<div class="grid">' +
          "<label>名稱（選填） <input data-field=\"label\" type=\"text\" placeholder=\"例如 客服、手機\" value=\"" +
          YifangRender.escapeHtml(item.label || "") +
          '"></label>' +
          "<label>號碼 <input data-field=\"number\" type=\"text\" inputmode=\"tel\" value=\"" +
          YifangRender.escapeHtml(item.number || "") +
          '"></label>' +
          "</div>" +
          "</article>"
        );
      })
      .join("");
  }

  function fillStoreForm() {
    var c = state.content;
    var store = c.store || {};
    var site = c.site || {};
    var contact = c.contact || {};
    var used = c.usedSection || {};
    $("store-name").value = store.name || "";
    $("store-slogan").value = store.slogan || "";
    $("store-address").value = store.address || "";
    $("store-hours").value = store.hours || "";
    $("store-shopee").value = store.shopeeUrl || "";
    $("store-rating").value = store.shopeeRating || "";
    $("store-reviews").value = store.shopeeReviews == null ? "" : store.shopeeReviews;
    $("store-years").value = store.years == null ? "" : store.years;
    $("store-area").value = store.usedMachineArea || "";
    $("store-hero").value = store.heroText || "";
    $("store-about-lead").value = store.aboutLead || "";
    $("store-about-body").value = store.aboutBody || "";
    $("store-note").value = store.usedMachineNote || "";
    $("contact-lead").value = contact.lead || "";
    $("used-lead").value = used.lead || "";
    $("services-lead").value = (c.services && c.services.lead) || "";
    $("site-title").value = site.title || "";
    $("site-desc").value = site.description || "";
    $("store-street").value = store.streetAddress || "";
    $("store-locality").value = store.addressLocality || "";
    $("store-region").value = store.addressRegion || "";
  }

  function collectContent() {
    var prev = state.content;
    var store = Object.assign({}, prev.store);
    var site = Object.assign({}, prev.site);
    store.name = $("store-name").value.trim();
    store.slogan = $("store-slogan").value.trim();
    store.phones = Array.prototype.map.call(els.phonesList.querySelectorAll("[data-phone]"), function (card) {
      return {
        label: card.querySelector('[data-field="label"]').value.trim(),
        number: card.querySelector('[data-field="number"]').value.trim()
      };
    });
    var firstFilled = store.phones.filter(function (item) {
      return item.number;
    })[0];
    store.phone = firstFilled ? firstFilled.number : "";
    delete store.phoneLink;
    store.address = $("store-address").value.trim();
    store.hours = $("store-hours").value.trim();
    store.shopeeUrl = $("store-shopee").value.trim();
    store.shopeeRating = $("store-rating").value.trim();
    store.shopeeReviews = Number($("store-reviews").value || 0);
    store.years = Number($("store-years").value || 0);
    store.usedMachineArea = $("store-area").value.trim();
    store.heroText = $("store-hero").value.trim();
    store.aboutLead = $("store-about-lead").value.trim();
    store.aboutBody = $("store-about-body").value.trim();
    store.usedMachineNote = $("store-note").value.trim();
    store.streetAddress = $("store-street").value.trim();
    store.addressLocality = $("store-locality").value.trim();
    store.addressRegion = $("store-region").value.trim();
    site.title = $("site-title").value.trim();
    site.description = $("site-desc").value.trim();
    // Never drop the Google Search Console verification tag.
    if (prev.site && prev.site.googleSiteVerification) {
      site.googleSiteVerification = prev.site.googleSiteVerification;
    }

    var services = Object.assign({}, prev.services);
    services.lead = $("services-lead").value.trim();
    services.items = Array.prototype.map.call(els.servicesList.querySelectorAll("[data-service]"), function (card) {
      var item = {
        title: card.querySelector('[data-field="title"]').value.trim(),
        description: card.querySelector('[data-field="description"]').value.trim()
      };
      var priceFrom = card.querySelector('[data-field="priceFrom"]').value.trim();
      if (priceFrom) item.priceFrom = priceFrom;
      return item;
    });

    var usedSection = Object.assign({}, prev.usedSection);
    usedSection.lead = $("used-lead").value.trim();
    usedSection.note = store.usedMachineNote;

    var groups = Array.prototype.map.call(els.groupsList.querySelectorAll("[data-group]"), function (card, i) {
      var existing = (prev.groups || [])[Number(card.getAttribute("data-group"))] || (prev.groups || [])[i] || {};
      var categorySel = card.querySelector('[data-field="category"]').value;
      var category =
        categorySel === "__custom__"
          ? card.querySelector('[data-field="categoryCustom"]').value.trim()
          : categorySel;
      var typeSel = card.querySelector('[data-field="sealerType"]').value;
      var sealerType =
        typeSel === "__custom__"
          ? card.querySelector('[data-field="sealerTypeCustom"]').value.trim()
          : typeSel;
      var notes = card
        .querySelector('[data-field="notes"]')
        .value.split(/\n+/)
        .map(function (s) {
          return s.trim();
        })
        .filter(Boolean);
      return {
        id: existing.id,
        name: card.querySelector('[data-field="name"]').value.trim(),
        category: category,
        sealerType: sealerType,
        price: card.querySelector('[data-field="price"]').value.trim(),
        description: card.querySelector('[data-field="description"]').value.trim(),
        notes: notes,
        images: (existing.images || []).slice()
      };
    });

    var faq = Array.prototype.map.call(els.faqList.querySelectorAll("[data-faq]"), function (card) {
      return {
        question: card.querySelector('[data-field="question"]').value.trim(),
        answer: card.querySelector('[data-field="answer"]').value.trim()
      };
    }).filter(function (item) {
      return item.question || item.answer;
    });

    var contact = Object.assign({}, prev.contact);
    contact.lead = $("contact-lead").value.trim();

    return {
      site: site,
      store: store,
      services: services,
      usedSection: usedSection,
      contact: contact,
      groups: groups,
      faq: faq
    };
  }

  function syncFormsToState() {
    if (!state.content) return;
    state.content = collectContent();
  }

  function moveItem(arr, index, dir) {
    var next = index + dir;
    if (next < 0 || next >= arr.length) return arr;
    var copy = arr.slice();
    var tmp = copy[index];
    copy[index] = copy[next];
    copy[next] = tmp;
    return copy;
  }

  function refreshLists() {
    renderPhones();
    renderServices();
    renderGroups();
    renderFaq();
  }

  function uniqueGroupId(name, existing) {
    var base = "group-" + Date.now().toString(36);
    var ids = {};
    (existing || []).forEach(function (g) {
      if (g.id) ids[g.id] = true;
    });
    var id = base;
    var n = 1;
    while (ids[id]) {
      n += 1;
      id = base + "-" + n;
    }
    return id;
  }

  function fileNameSafe(id) {
    return String(id || "photo").replace(/[^a-zA-Z0-9_-]/g, "") || "photo";
  }

  function resizeImage(file, maxSize, quality) {
    maxSize = maxSize || 1200;
    quality = quality || 0.85;
    return new Promise(function (resolve, reject) {
      var url = URL.createObjectURL(file);
      var img = new Image();
      img.onload = function () {
        var w = img.naturalWidth || img.width;
        var h = img.naturalHeight || img.height;
        if (w > maxSize || h > maxSize) {
          if (w >= h) {
            h = Math.round((h * maxSize) / w);
            w = maxSize;
          } else {
            w = Math.round((w * maxSize) / h);
            h = maxSize;
          }
        }
        var canvas = document.createElement("canvas");
        canvas.width = Math.max(1, w);
        canvas.height = Math.max(1, h);
        var ctx = canvas.getContext("2d");
        ctx.fillStyle = "#ffffff";
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        canvas.toBlob(
          function (blob) {
            URL.revokeObjectURL(url);
            if (!blob) {
              reject(new Error("照片轉換失敗，請換一張再試。"));
              return;
            }
            blob.arrayBuffer().then(function (buf) {
              resolve({ blob: blob, bytes: new Uint8Array(buf), width: canvas.width, height: canvas.height });
            });
          },
          "image/jpeg",
          quality
        );
      };
      img.onerror = function () {
        URL.revokeObjectURL(url);
        reject(new Error("無法讀取這張照片，請換一張再試。"));
      };
      img.src = url;
    });
  }

  function markImageDeleted(path) {
    if (!path) return;
    if (state.pendingBlobs[path]) {
      try {
        URL.revokeObjectURL(state.pendingBlobs[path].url);
      } catch (err) {}
      delete state.pendingBlobs[path];
      return;
    }
    if (path.indexOf("images/") === 0 && state.pendingDeletes.indexOf(path) === -1) {
      state.pendingDeletes.push(path);
    }
  }

  function pathStillUsed(path, groups) {
    return (groups || []).some(function (g) {
      return (g.images || []).indexOf(path) !== -1;
    });
  }

  async function addPhotos(groupIndex, fileList) {
    syncFormsToState();
    var files = Array.prototype.slice.call(fileList || []);
    if (!files.length) return;
    var group = state.content.groups[groupIndex];
    if (!group) return;
    group.images = group.images || [];
    for (var i = 0; i < files.length; i++) {
      var resized = await resizeImage(files[i], 1200, 0.85);
      var path =
        "images/" +
        fileNameSafe(group.id) +
        "-" +
        Date.now().toString(36) +
        "-" +
        i +
        ".jpg";
      var url = URL.createObjectURL(resized.blob);
      state.pendingBlobs[path] = { bytes: resized.bytes, url: url };
      group.images.push(path);
    }
    renderGroups();
  }

  function fillAll() {
    fillStoreForm();
    refreshLists();
  }

  async function loadEditor() {
    showEditor();
    els.loadStatus.textContent = "正在載入官網內容…";
    setBanner("", "");
    try {
      var ref = await gh("/repos/" + CONFIG.owner + "/" + CONFIG.repo + "/git/refs/heads/" + CONFIG.branch);
      state.loadedCommitSha = ref.object.sha;
      var file = await gh(
        "/repos/" +
          CONFIG.owner +
          "/" +
          CONFIG.repo +
          "/contents/" +
          CONFIG.contentPath +
          "?ref=" +
          encodeURIComponent(CONFIG.branch)
      );
      // Do not put the token in this request URL (only the branch name).
      var jsonText = decodeBase64Utf8(file.content);
      state.content = JSON.parse(jsonText);
      if (!Array.isArray(state.content.groups)) state.content.groups = [];
      if (!Array.isArray(state.content.faq)) state.content.faq = [];
      fillAll();
      els.loadStatus.textContent = "已載入，改完後按「儲存並發布」";
    } catch (err) {
      if (err.status === 401 || err.status === 403 || err.status === 404) {
        clearToken();
        showLogin(err.message);
        return;
      }
      setBanner("error", err.message || "載入失敗，請稍後再試。");
      els.loadStatus.textContent = "載入失敗";
    }
  }

  async function handleLogin(event) {
    event.preventDefault();
    var token = $("token-input").value.trim();
    if (!token) {
      showLogin("請貼上 GitHub 權杖。");
      return;
    }
    if (token.indexOf(" ") !== -1 || token.indexOf("http") === 0) {
      showLogin("請只貼權杖本身，不要貼整段網址或額外文字。");
      return;
    }
    els.loginBtn.disabled = true;
    els.loginBtn.textContent = "正在驗證…";
    state.token = token;
    try {
      await gh("/repos/" + CONFIG.owner + "/" + CONFIG.repo);
      storeToken(token);
      $("token-input").value = "";
      await loadEditor();
    } catch (err) {
      state.token = "";
      showLogin(err.message || "登入失敗，請檢查權杖後再試。");
    } finally {
      els.loginBtn.disabled = false;
      els.loginBtn.textContent = "登入並開始編輯";
    }
  }

  function logout() {
    Object.keys(state.pendingBlobs).forEach(function (path) {
      try {
        URL.revokeObjectURL(state.pendingBlobs[path].url);
      } catch (err) {}
    });
    state.pendingBlobs = Object.create(null);
    state.pendingDeletes = [];
    state.content = null;
    state.loadedCommitSha = "";
    clearToken();
    $("token-input").value = "";
    showLogin("");
  }

  function openPreview() {
    try {
      syncFormsToState();
    } catch (err) {
      setBanner("error", "預覽前整理資料時發生問題，請檢查是否有欄位還沒填好。");
      return;
    }
    var assetMap = {};
    Object.keys(state.pendingBlobs).forEach(function (path) {
      assetMap[path] = state.pendingBlobs[path].url;
    });
    var html = window.YifangRender.renderDocument(state.content, {
      assetBase: CONFIG.liveBase,
      assetMap: assetMap,
      stylesheet: CONFIG.liveBase + "styles.css",
      preview: true
    });
    els.preview.hidden = false;
    els.previewFrame.srcdoc = html;
  }

  function closePreview() {
    els.preview.hidden = true;
    els.previewFrame.srcdoc = "";
  }

  async function saveAndPublish() {
    if (state.saving) return;
    try {
      syncFormsToState();
    } catch (err) {
      setBanner("error", "請先檢查各個欄位是否填寫正確，再儲存。");
      return;
    }
    var namesMissing = (state.content.groups || []).some(function (g) {
      return !g.name || !g.price;
    });
    if (namesMissing) {
      setBanner("error", "每一組機器都需要填寫名稱和參考售價。");
      return;
    }
    var filledPhones = ((state.content.store && state.content.store.phones) || []).filter(function (item) {
      return item && String(item.number || "").trim();
    });
    if (!state.content.store.name || !filledPhones.length) {
      setBanner("error", "請填寫店名和至少一組電話。");
      return;
    }
    state.content.store.phones = filledPhones;
    state.content.store.phone = filledPhones[0].number;

    state.saving = true;
    els.saveBtn.disabled = true;
    els.saveBtn.textContent = "正在儲存…";
    setBanner("", "");
    try {
      var files = [
        {
          path: CONFIG.contentPath,
          contentBase64: textToBase64(JSON.stringify(state.content, null, 2) + "\n")
        },
        {
          path: "index.html",
          contentBase64: textToBase64(window.YifangRender.renderDocument(state.content))
        },
        {
          path: "sitemap.xml",
          contentBase64: textToBase64(window.YifangRender.renderSitemap(state.content))
        },
        {
          path: "robots.txt",
          contentBase64: textToBase64(window.YifangRender.renderRobots(state.content))
        },
        {
          path: "404.html",
          contentBase64: textToBase64(window.YifangRender.render404(state.content))
        }
      ];
      Object.keys(state.pendingBlobs).forEach(function (path) {
        files.push({
          path: path,
          contentBase64: bytesToBase64(state.pendingBlobs[path].bytes)
        });
      });
      var deletes = state.pendingDeletes.filter(function (path) {
        return !pathStillUsed(path, state.content.groups);
      });
      var sha = await commitFiles(files, deletes, "更新官網內容", state.loadedCommitSha);
      state.loadedCommitSha = sha;
      Object.keys(state.pendingBlobs).forEach(function (path) {
        try {
          URL.revokeObjectURL(state.pendingBlobs[path].url);
        } catch (err) {}
      });
      state.pendingBlobs = Object.create(null);
      state.pendingDeletes = [];
      setBanner("ok", "已儲存，約 1–2 分鐘後官網更新");
      els.loadStatus.textContent = "已儲存，約 1–2 分鐘後官網更新";
    } catch (err) {
      setBanner("error", err.message || "儲存失敗，請稍後再試。");
    } finally {
      state.saving = false;
      els.saveBtn.disabled = false;
      els.saveBtn.textContent = "儲存並發布";
    }
  }

  function onServicesClick(event) {
    var btn = event.target.closest("button");
    if (!btn) return;
    var card = event.target.closest("[data-service]");
    if (!card) return;
    var index = Number(card.getAttribute("data-service"));
    var act = btn.getAttribute("data-act");
    syncFormsToState();
    if (act === "svc-del") state.content.services.items.splice(index, 1);
    if (act === "svc-up") state.content.services.items = moveItem(state.content.services.items, index, -1);
    if (act === "svc-down") state.content.services.items = moveItem(state.content.services.items, index, 1);
    renderServices();
  }

  function onGroupsClick(event) {
    var btn = event.target.closest("button");
    if (!btn) return;
    var act = btn.getAttribute("data-act");
    var card = event.target.closest("[data-group]");
    if (!card) return;
    var index = Number(card.getAttribute("data-group"));
    syncFormsToState();
    var group = state.content.groups[index];
    if (act === "grp-del") {
      if (!confirm("確定要刪除這一組「" + (group && group.name ? group.name : "機型") + "」嗎？")) return;
      (group.images || []).forEach(markImageDeleted);
      state.content.groups.splice(index, 1);
      renderGroups();
      return;
    }
    if (act === "grp-up") {
      state.content.groups = moveItem(state.content.groups, index, -1);
      renderGroups();
      return;
    }
    if (act === "grp-down") {
      state.content.groups = moveItem(state.content.groups, index, 1);
      renderGroups();
      return;
    }
    var photo = event.target.closest("[data-image]");
    if (!photo || !group) return;
    var pi = Number(photo.getAttribute("data-image"));
    if (act === "img-del") {
      var removed = (group.images || []).splice(pi, 1)[0];
      markImageDeleted(removed);
      renderGroups();
    }
    if (act === "img-left") {
      group.images = moveItem(group.images || [], pi, -1);
      renderGroups();
    }
    if (act === "img-right") {
      group.images = moveItem(group.images || [], pi, 1);
      renderGroups();
    }
  }

  function onGroupsChange(event) {
    var select = event.target;
    if (select.matches('[data-field="category"]')) {
      var wrap = select.closest("article").querySelector(".custom-cat");
      if (wrap) wrap.hidden = select.value !== "__custom__";
    }
    if (select.matches('[data-field="sealerType"]')) {
      var wrap2 = select.closest("article").querySelector(".custom-type");
      if (wrap2) wrap2.hidden = select.value !== "__custom__";
    }
    if (select.matches('[data-field="name"]')) {
      var title = select.closest("article").querySelector(".card-head .title");
      if (title) title.textContent = select.value.trim() || "未命名機型";
    }
  }

  function onGroupsFile(event) {
    var input = event.target;
    if (!input.matches('[data-act="img-add"]')) return;
    var card = input.closest("[data-group]");
    var index = Number(card.getAttribute("data-group"));
    addPhotos(index, input.files).catch(function (err) {
      setBanner("error", err.message || "照片上傳失敗，請換一張再試。");
    });
    input.value = "";
  }

  function onPhonesClick(event) {
    var btn = event.target.closest("button");
    if (!btn) return;
    var card = event.target.closest("[data-phone]");
    if (!card) return;
    var index = Number(card.getAttribute("data-phone"));
    var act = btn.getAttribute("data-act");
    syncFormsToState();
    var phones = state.content.store.phones || [];
    if (act === "phone-del") {
      if (phones.length <= 1) {
        setBanner("error", "至少要保留一組電話。");
        renderPhones();
        return;
      }
      phones.splice(index, 1);
    }
    if (act === "phone-up") phones = moveItem(phones, index, -1);
    if (act === "phone-down") phones = moveItem(phones, index, 1);
    state.content.store.phones = phones;
    var firstFilled = phones.filter(function (item) {
      return item && item.number;
    })[0];
    state.content.store.phone = firstFilled ? firstFilled.number : "";
    renderPhones();
  }

  function onFaqClick(event) {
    var btn = event.target.closest("button");
    if (!btn || btn.getAttribute("data-act") !== "faq-del") return;
    var card = event.target.closest("[data-faq]");
    var index = Number(card.getAttribute("data-faq"));
    syncFormsToState();
    state.content.faq.splice(index, 1);
    renderFaq();
  }

  function bind() {
    els.loginView = $("login-view");
    els.editorView = $("editor-view");
    els.loginForm = $("login-form");
    els.loginError = $("login-error");
    els.loginBtn = $("login-btn");
    els.loadStatus = $("load-status");
    els.editorError = $("editor-error");
    els.editorOk = $("editor-ok");
    els.phonesList = $("phones-list");
    els.servicesList = $("services-list");
    els.groupsList = $("groups-list");
    els.faqList = $("faq-list");
    els.saveBtn = $("save-btn");
    els.preview = $("preview-overlay");
    els.previewFrame = $("preview-frame");

    els.loginForm.addEventListener("submit", handleLogin);
    $("show-token").addEventListener("change", function () {
      $("token-input").type = this.checked ? "text" : "password";
    });
    $("logout-btn").addEventListener("click", logout);
    $("add-phone").addEventListener("click", function () {
      syncFormsToState();
      state.content.store.phones = state.content.store.phones || [];
      state.content.store.phones.push({ label: "", number: "" });
      renderPhones();
    });
    els.phonesList.addEventListener("click", onPhonesClick);
    $("add-service").addEventListener("click", function () {
      syncFormsToState();
      state.content.services.items.push({ title: "", description: "" });
      renderServices();
    });
    $("add-group").addEventListener("click", function () {
      syncFormsToState();
      var id = uniqueGroupId("", state.content.groups);
      state.content.groups.push({
        id: id,
        name: "",
        category: "二手封口機",
        sealerType: "微電腦",
        price: "約 NT$",
        description: "",
        notes: [],
        images: []
      });
      renderGroups();
      var cards = els.groupsList.querySelectorAll("[data-group]");
      var last = cards[cards.length - 1];
      if (last) last.scrollIntoView({ behavior: "smooth", block: "start" });
    });
    $("add-faq").addEventListener("click", function () {
      syncFormsToState();
      state.content.faq = state.content.faq || [];
      state.content.faq.push({ question: "", answer: "" });
      renderFaq();
    });
    els.servicesList.addEventListener("click", onServicesClick);
    els.groupsList.addEventListener("click", onGroupsClick);
    els.groupsList.addEventListener("change", onGroupsChange);
    els.groupsList.addEventListener("input", onGroupsChange);
    els.groupsList.addEventListener("change", onGroupsFile);
    els.faqList.addEventListener("click", onFaqClick);
    $("preview-btn").addEventListener("click", openPreview);
    $("close-preview").addEventListener("click", closePreview);
    $("save-btn").addEventListener("click", saveAndPublish);
  }

  function start() {
    bind();
    var token = getStoredToken();
    if (token) {
      state.token = token;
      loadEditor();
    } else {
      showLogin("");
    }
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start);
  else start();
})();
