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
  var PART_CATEGORIES = ["封口機零件", "果糖機零件"];
  var CHANNEL_TYPES = [
    { value: "phone", label: "電話" },
    { value: "facebook", label: "Facebook" },
    { value: "line", label: "LINE" },
    { value: "other", label: "其他連結" }
  ];

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
      "X-GitHub-Api-Version": CONFIG.apiVersion,
      "Cache-Control": "no-cache, no-store",
      Pragma: "no-cache"
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

  function repoPath(suffix) {
    return "/repos/" + CONFIG.owner + "/" + CONFIG.repo + suffix;
  }

  async function latestBranchSha() {
    var ref = await gh(repoPath("/git/refs/heads/" + CONFIG.branch));
    if (!ref || !ref.object || !ref.object.sha) {
      throw new Error("無法取得目前官網版本，請稍後再試。");
    }
    return ref.object.sha;
  }

  async function loadTextAtCommit(path, commitSha) {
    var commit = await gh(repoPath("/git/commits/" + commitSha));
    var tree = await gh(repoPath("/git/trees/" + commit.tree.sha + "?recursive=1"));
    var entry = (tree.tree || []).filter(function (item) {
      return item && item.path === path;
    })[0];
    if (!entry || !entry.sha) {
      throw new Error("找不到 " + path + "，請稍後再試。");
    }
    var blob = await gh(repoPath("/git/blobs/" + entry.sha));
    var raw = blob && blob.content ? String(blob.content).replace(/\s/g, "") : "";
    return decodeBase64Utf8(raw);
  }

  async function commitFiles(files, deletes, message) {
    var prepared = [];
    var i;
    for (i = 0; i < files.length; i++) {
      var file = files[i];
      var blob = await gh(repoPath("/git/blobs"), {
        method: "POST",
        body: { content: file.contentBase64, encoding: "base64" }
      });
      prepared.push({ path: file.path, mode: "100644", type: "blob", sha: blob.sha });
    }
    (deletes || []).forEach(function (path) {
      prepared.push({ path: path, mode: "100644", type: "blob", sha: null });
    });

    var refPath = repoPath("/git/refs/heads/" + CONFIG.branch);
    var attempt = 0;
    var maxAttempts = 3;
    var lastError;
    while (attempt < maxAttempts) {
      attempt += 1;
      try {
        var latestSha = await latestBranchSha();
        var commit = await gh(repoPath("/git/commits/" + latestSha));
        var newTree = await gh(repoPath("/git/trees"), {
          method: "POST",
          body: { base_tree: commit.tree.sha, tree: prepared }
        });
        var newCommit = await gh(repoPath("/git/commits"), {
          method: "POST",
          body: { message: message, tree: newTree.sha, parents: [latestSha] }
        });
        await gh(refPath, {
          method: "PATCH",
          body: { sha: newCommit.sha, force: false }
        });
        return newCommit.sha;
      } catch (err) {
        lastError = err;
        var retryable = err && (err.status === 409 || err.status === 422);
        if (!retryable || attempt >= maxAttempts) throw err;
        if (els.loadStatus) {
          els.loadStatus.textContent =
            "遠端資料有更新，正在重新提交您的修改（第 " + attempt + " 次）…";
        }
        setBanner(
          "status",
          "遠端資料有更新，正在重新提交您的修改，不會丟掉這次填的內容…"
        );
      }
    }
    throw lastError;
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
    if (els.editorError) {
      els.editorError.hidden = kind !== "error";
      if (kind === "error") els.editorError.textContent = text || "";
    }
    if (els.editorOk) {
      els.editorOk.hidden = kind !== "ok";
      if (kind === "ok") els.editorOk.textContent = text || "";
    }
    if (els.editorStatus) {
      els.editorStatus.hidden = kind !== "status";
      els.editorStatus.textContent = kind === "status" ? text || "" : "";
    }
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

  var CLASSIFICATION_OPTIONS = [
    { value: "new", kind: "new", label: "全新封口機" },
    { value: "used:二手封口機", kind: "used", label: "中古機｜二手封口機" },
    { value: "used:二手果糖機", kind: "used", label: "中古機｜二手果糖機" },
    { value: "used:其他設備", kind: "used", label: "中古機｜其他設備" },
    { value: "used:__custom__", kind: "used", label: "中古機｜其他（自行填寫）" },
    { value: "parts:封口機零件", kind: "parts", label: "零件｜封口機零件" },
    { value: "parts:果糖機零件", kind: "parts", label: "零件｜果糖機零件" },
    { value: "parts:__custom__", kind: "parts", label: "零件｜其他（自行填寫）" }
  ];

  function parseClassification(value) {
    value = String(value || "");
    if (!value || value === "new") return { kind: "new", category: "" };
    var idx = value.indexOf(":");
    if (idx === -1) return { kind: value, category: "" };
    return { kind: value.slice(0, idx), category: value.slice(idx + 1) };
  }

  function classificationValue(kind, category) {
    if (kind === "new") return "new";
    var presets = kind === "used" ? CATEGORIES : PART_CATEGORIES;
    if (category && presets.indexOf(category) !== -1) return kind + ":" + category;
    if (category) return kind + ":__custom__";
    return kind === "used" ? "used:二手封口機" : "parts:封口機零件";
  }

  function isCustomClassification(kind, category) {
    if (kind === "new") return false;
    var presets = kind === "used" ? CATEGORIES : PART_CATEGORIES;
    return !!(category && presets.indexOf(category) === -1);
  }

  function classificationLabel(value) {
    var found = CLASSIFICATION_OPTIONS.filter(function (opt) {
      return opt.value === value;
    })[0];
    return found ? found.label : value;
  }

  function classificationPickerHtml(kind, category) {
    var current = classificationValue(kind, category);
    var custom = kind !== "new" && (isCustomClassification(kind, category) || parseClassification(current).category === "__custom__");
    var options = CLASSIFICATION_OPTIONS.map(function (opt) {
      var sel = opt.value === current ? " selected" : "";
      return (
        '<option value="' +
        YifangRender.escapeHtml(opt.value) +
        '"' +
        sel +
        ">" +
        YifangRender.escapeHtml(opt.label) +
        "</option>"
      );
    }).join("");
    return (
      '<label>分類 <select data-field="classification">' +
      options +
      "</select></label>" +
      '<label class="custom-cat"' +
      (custom ? "" : " hidden") +
      '>自訂分類 <input data-field="categoryCustom" type="text" value="' +
      YifangRender.escapeHtml(isCustomClassification(kind, category) ? category : "") +
      '"></label>'
    );
  }

  function kindListKey(kind) {
    if (kind === "new") return "newMachines";
    if (kind === "used") return "groups";
    return "parts";
  }

  function kindAttr(kind) {
    if (kind === "new") return "data-new";
    if (kind === "used") return "data-group";
    return "data-part";
  }

  function firstImage(item) {
    if (!item) return "";
    if (item.image) return item.image;
    if (item.images && item.images.length) return item.images[0];
    return "";
  }

  function allImages(item) {
    if (!item) return [];
    if (item.images && item.images.length) return item.images.slice();
    if (item.image) return [item.image];
    return [];
  }

  function defaultCategory(kind) {
    if (kind === "used") return "二手封口機";
    if (kind === "parts") return "封口機零件";
    return "";
  }

  function resolveCategory(kind, requested, item) {
    if (kind === "new") return "";
    if (requested && requested !== "__custom__") return requested;
    if (requested === "__custom__") {
      var current = item && item.category;
      var presets = kind === "used" ? CATEGORIES : PART_CATEGORIES;
      if (current && presets.indexOf(current) === -1) return current;
      return "";
    }
    return (item && item.category) || defaultCategory(kind);
  }

  function convertItem(item, fromKind, toKind, category) {
    item = item || {};
    var title = item.title || item.name || "";
    var price = item.price || "";
    var images = allImages(item);
    if (toKind === "new") {
      return {
        id: uniqueCatalogId("new-", state.content.newMachines || []),
        title: title,
        price: price,
        url: item.url || "",
        badge: item.badge || "",
        hidden: !!item.hidden,
        image: images[0] || "",
        images: images
      };
    }
    if (toKind === "used") {
      return {
        id: uniqueGroupId(title, state.content.groups || []),
        name: title,
        category: resolveCategory("used", category, item) || defaultCategory("used"),
        sealerType: item.sealerType || "微電腦",
        price: price,
        description: item.description || "",
        notes: Array.isArray(item.notes) ? item.notes.slice() : [],
        images: images
      };
    }
    return {
      id: uniqueCatalogId("part-", state.content.parts || []),
      title: title,
      price: price,
      url: item.url || "",
      category: resolveCategory("parts", category, item) || defaultCategory("parts"),
      hidden: !!item.hidden,
      image: images[0] || "",
      images: images
    };
  }

  function readCategoryFromCard(card, kind, existing) {
    existing = existing || {};
    var sel = card.querySelector('[data-field="classification"]') || card.querySelector('[data-field="category"]');
    if (!sel) return existing.category || "";
    if (sel.getAttribute("data-field") === "classification") {
      var parsed = parseClassification(sel.value);
      if (parsed.kind !== kind) return existing.category || "";
      if (parsed.category === "__custom__") {
        var custom = card.querySelector('[data-field="categoryCustom"]');
        return ((custom && custom.value) || existing.category || "").trim();
      }
      return parsed.category;
    }
    if (sel.value === "__custom__") {
      var customLegacy = card.querySelector('[data-field="categoryCustom"]');
      return ((customLegacy && customLegacy.value) || existing.category || "").trim();
    }
    return sel.value;
  }

  function focusMovedCard(kind) {
    var attr = kindAttr(kind);
    var list = kind === "used" ? els.groupsList : kind === "new" ? els.newList : els.partsList;
    if (!list) return;
    var cards = list.querySelectorAll("[" + attr + "]");
    var last = cards[cards.length - 1];
    if (!last) return;
    last.scrollIntoView({ behavior: "smooth", block: "start" });
    last.classList.add("just-moved");
    setTimeout(function () {
      last.classList.remove("just-moved");
    }, 2500);
  }

  function applyClassificationChange(kind, index, newValue) {
    var parsed = parseClassification(newValue);
    if (parsed.kind === kind) return false;
    syncFormsToState();
    var sourceKey = kindListKey(kind);
    var destKey = kindListKey(parsed.kind);
    var list = state.content[sourceKey] || [];
    var item = list[index];
    if (!item) return false;
    var converted = convertItem(item, kind, parsed.kind, parsed.category);
    list.splice(index, 1);
    state.content[sourceKey] = list;
    state.content[destKey] = state.content[destKey] || [];
    state.content[destKey].push(converted);
    refreshLists();
    focusMovedCard(parsed.kind);
    var name = converted.title || converted.name || "這筆商品";
    setBanner(
      "ok",
      "已將「" +
        name +
        "」改到「" +
        classificationLabel(newValue) +
        "」。請再按「儲存並發布」才會出現在官網。"
    );
    return true;
  }

  function onClassificationEvent(kind, event) {
    var el = event.target;
    if (!el || !el.matches || !el.matches('[data-field="classification"]')) return;
    var card = el.closest("[" + kindAttr(kind) + "]");
    if (!card) return;
    var parsed = parseClassification(el.value);
    var wrap = card.querySelector(".custom-cat");
    if (wrap) wrap.hidden = parsed.kind === "new" || parsed.category !== "__custom__";
    if (parsed.kind === kind) return;
    var index = Number(card.getAttribute(kindAttr(kind)));
    applyClassificationChange(kind, index, el.value);
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
          classificationPickerHtml("used", g.category) +
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


  function catalogPhotoHtml(src) {
    if (!src) return '<div class="photos"></div>';
    return (
      '<div class="photos"><div class="photo" data-image="0">' +
      '<img src="' +
      YifangRender.escapeHtml(imageSrc(src)) +
      '" alt="">' +
      '<div class="photo-actions">' +
      '<button type="button" class="btn btn-tiny btn-danger" data-act="img-del">刪</button>' +
      "</div></div></div>"
    );
  }

  function renderNewMachines() {
    var items = (state.content && state.content.newMachines) || [];
    if (!els.newList) return;
    els.newList.innerHTML = items
      .map(function (item, i) {
        return (
          '<article class="card" data-new="' +
          i +
          '">' +
          '<div class="card-head">' +
          '<span class="title">' +
          YifangRender.escapeHtml(item.title || "未命名商品") +
          "</span>" +
          '<button type="button" class="btn btn-tiny btn-ghost" data-act="up">上移</button>' +
          '<button type="button" class="btn btn-tiny btn-ghost" data-act="down">下移</button>' +
          '<button type="button" class="btn btn-tiny btn-danger" data-act="del">刪除</button>' +
          "</div>" +
          '<label>品名 <input data-field="title" type="text" value="' +
          YifangRender.escapeHtml(item.title || "") +
          '"></label>' +
          classificationPickerHtml("new", "") +
          '<label>售價（例如 NT$17,800） <input data-field="price" type="text" value="' +
          YifangRender.escapeHtml(item.price || "") +
          '"></label>' +
          '<label>標籤（選填，例如：展示機 9.99成新．保固一年） <input data-field="badge" type="text" value="' +
          YifangRender.escapeHtml(item.badge || "") +
          '"></label>' +
          '<label class="check"><input data-field="hidden" type="checkbox"' +
          (item.hidden ? " checked" : "") +
          "> 隱藏，不在官網顯示</label>" +
          '<p class="hint">照片</p>' +
          catalogPhotoHtml(item.image) +
          '<label class="file-btn btn btn-secondary">上傳或更換照片<input type="file" accept="image/*" data-act="img-add"></label>' +
          "</article>"
        );
      })
      .join("");
  }

  function renderPartsAdmin() {
    var items = (state.content && state.content.parts) || [];
    if (!els.partsList) return;
    els.partsList.innerHTML = items
      .map(function (item, i) {
        return (
          '<article class="card" data-part="' +
          i +
          '">' +
          '<div class="card-head">' +
          '<span class="title">' +
          YifangRender.escapeHtml(item.title || "未命名零件") +
          "</span>" +
          '<button type="button" class="btn btn-tiny btn-ghost" data-act="up">上移</button>' +
          '<button type="button" class="btn btn-tiny btn-ghost" data-act="down">下移</button>' +
          '<button type="button" class="btn btn-tiny btn-danger" data-act="del">刪除</button>' +
          "</div>" +
          '<label>品名 <input data-field="title" type="text" value="' +
          YifangRender.escapeHtml(item.title || "") +
          '"></label>' +
          '<label>售價（例如 NT$400） <input data-field="price" type="text" value="' +
          YifangRender.escapeHtml(item.price || "") +
          '"></label>' +
          classificationPickerHtml("parts", item.category) +
          '<label class="check"><input data-field="hidden" type="checkbox"' +
          (item.hidden ? " checked" : "") +
          "> 隱藏，不在官網顯示</label>" +
          '<p class="hint">照片</p>' +
          catalogPhotoHtml(item.image) +
          '<label class="file-btn btn btn-secondary">上傳或更換照片<input type="file" accept="image/*" data-act="img-add"></label>' +
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


  function normalizeLogoChar(value) {
    var raw = String(value == null ? "" : value).trim();
    var chars = typeof Array.from === "function" ? Array.from(raw) : raw.split("");
    chars = chars.slice(0, 2);
    return chars.join("") || "維";
  }

  function updateLogoPreview() {
    var input = $("store-logo-char");
    var preview = $("logo-preview");
    if (!preview) return;
    var ch = normalizeLogoChar(input ? input.value : "維");
    preview.textContent = ch;
    preview.setAttribute("data-len", String(ch.length));
  }

  function defaultChannels(store) {
    var list = [];
    ((store && store.phones) || []).forEach(function (item) {
      if (!item || !item.number) return;
      list.push({
        type: "phone",
        label: item.label || "電話",
        value: item.number,
        enabled: true
      });
    });
    list.push({
      type: "facebook",
      label: "Facebook",
      value: "https://www.facebook.com/wf.tin827888",
      enabled: true
    });
    list.push({ type: "line", label: "LINE ID：wf.827888", value: "https://line.me/ti/p/~wf.827888", enabled: true });
    return list;
  }

  function logoFontFamily() {
    return '"Noto Sans TC","Noto Sans CJK TC","PingFang TC","Microsoft JhengHei",sans-serif';
  }

  function drawLogoIcon(size, char) {
    var canvas = document.createElement("canvas");
    canvas.width = size;
    canvas.height = size;
    var ctx = canvas.getContext("2d");
    ctx.fillStyle = "#1d4ed8";
    ctx.fillRect(0, 0, size, size);
    var glyphs = normalizeLogoChar(char);
    var fontSize = glyphs.length > 1 ? Math.round(size * 0.36) : Math.round(size * 0.52);
    ctx.fillStyle = "#ffffff";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.font = '800 ' + fontSize + "px " + logoFontFamily();
    ctx.fillText(glyphs, size / 2, size / 2 + size * 0.02);
    return canvas;
  }

  function canvasToBytes(canvas) {
    return new Promise(function (resolve, reject) {
      canvas.toBlob(function (blob) {
        if (!blob) {
          reject(new Error("無法產生圖示"));
          return;
        }
        blob.arrayBuffer().then(function (buf) {
          resolve(new Uint8Array(buf));
        }, reject);
      }, "image/png");
    });
  }

  async function generateLogoIcons(char) {
    try {
      if (document.fonts && document.fonts.load) {
        await document.fonts.load('800 120px "Noto Sans TC"');
        if (document.fonts.ready) await document.fonts.ready;
      }
    } catch (err) {}
    var favicon = await canvasToBytes(drawLogoIcon(32, char));
    var touch = await canvasToBytes(drawLogoIcon(180, char));
    return [
      { path: "favicon.png", contentBase64: bytesToBase64(favicon) },
      { path: "apple-touch-icon.png", contentBase64: bytesToBase64(touch) }
    ];
  }

  function renderChannels() {
    var list = (state.content && state.content.channels) || [];
    els.channelsList.innerHTML = list
      .map(function (item, i) {
        item = item || {};
        var type = String(item.type || "other").toLowerCase();
        var options = CHANNEL_TYPES.map(function (opt) {
          return (
            '<option value="' +
            opt.value +
            '"' +
            (opt.value === type ? " selected" : "") +
            ">" +
            opt.label +
            "</option>"
          );
        }).join("");
        var checked = item.enabled !== false ? " checked" : "";
        return (
          '<article class="card channel-card" data-channel="' +
          i +
          '">' +
          '<div class="card-head">' +
          '<span class="title">管道 ' +
          (i + 1) +
          "</span>" +
          '<button type="button" class="btn btn-tiny btn-ghost" data-act="ch-up">上移</button>' +
          '<button type="button" class="btn btn-tiny btn-ghost" data-act="ch-down">下移</button>' +
          '<button type="button" class="btn btn-tiny btn-danger" data-act="ch-del">刪除</button>' +
          "</div>" +
          '<div class="grid">' +
          "<label>類型 <select data-field=\"type\">" +
          options +
          "</select></label>" +
          '<label>名稱 <input data-field="label" type="text" value="' +
          YifangRender.escapeHtml(item.label || "") +
          '"></label>' +
          '<label class="wide">電話、網址或 LINE ID <input data-field="value" type="text" value="' +
          YifangRender.escapeHtml(item.value || item.url || "") +
          '" placeholder="電話號碼、https 連結或 LINE ID"></label>' +
          '<label class="toggle-row wide"><input data-field="enabled" type="checkbox"' +
          checked +
          "> 顯示在官網上</label>" +
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
    $("store-years").value = store.years == null ? "" : store.years;
    $("store-area").value = store.usedMachineArea || "";
    $("store-hero").value = store.heroText || "";
    $("store-about-lead").value = store.aboutLead || "";
    $("store-about-body").value = store.aboutBody || "";
    $("store-note").value = store.usedMachineNote || "";
    $("contact-lead").value = contact.lead || "";
    $("used-lead").value = used.lead || "";
    $("new-lead").value = (c.newSection && c.newSection.lead) || "";
    $("parts-lead").value = (c.partsSection && c.partsSection.lead) || "";
    $("services-lead").value = (c.services && c.services.lead) || "";
    $("site-title").value = site.title || "";
    $("site-desc").value = site.description || "";
    $("store-street").value = store.streetAddress || "";
    $("store-locality").value = store.addressLocality || "";
    $("store-region").value = store.addressRegion || "";
    $("store-logo-char").value = (window.YifangRender && YifangRender.logoChar)
      ? YifangRender.logoChar(store)
      : (store.logoChar || store.mark || "維");
    updateLogoPreview();
    var labels = c.labels || {};
    $("label-about").value = labels.about || "關於我們";
    $("label-services").value = labels.services || (c.services && c.services.title) || "服務項目";
    $("label-new").value = labels.new || (c.newSection && c.newSection.title) || "全新封口機";
    $("label-used").value = labels.used || used.title || "中古機專區";
    $("label-parts").value = labels.parts || (c.partsSection && c.partsSection.title) || "零件專區";
    $("label-support").value = labels.support || "客服諮詢";
    $("label-contact").value = labels.contact || contact.title || "聯絡我們";
    $("label-faq").value = labels.faq || "常見問題";
    $("label-hero-new").value = labels.heroNew || labels.new || "全新封口機";
    $("label-hero-used").value = labels.heroUsed || "中古機專區";
    $("label-hero-parts").value = labels.heroParts || labels.parts || "零件專區";
    $("label-filter-all").value = labels.filterAll || "全部";
    $("label-parts-search").value = labels.partsSearch || (c.partsSection && c.partsSection.searchPlaceholder) || "搜尋零件名稱";
    $("label-float").value = labels.floatToggle || labels.support || "客服諮詢";
    $("label-call").value = used.callLabel || labels.call || "電話詢問";
    var chat = c.chat || {};
    $("chat-property-id").value = chat.propertyId || "";
    $("chat-widget-id").value = chat.widgetId || "";
    $("chat-label").value = chat.label || "💬 線上文字客服（免費）";
    var announcement = c.announcement || {};
    $("announce-enabled").checked = announcement.enabled !== false;
    $("announce-text").value = announcement.text || c.paymentNote || "付款方式：僅接受匯款與現金（付現）";
    $("payment-note").value = c.paymentNote || announcement.text || "付款方式：僅接受匯款與現金（付現）";
    if (!Array.isArray(c.channels) || !c.channels.length) {
      c.channels = defaultChannels(store);
    }
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
    store.shopeeUrl = "";
    delete store.shopeeRating;
    delete store.shopeeReviews;
    store.years = Number($("store-years").value || 0);
    store.usedMachineArea = $("store-area").value.trim();
    store.heroText = $("store-hero").value.trim();
    store.aboutLead = $("store-about-lead").value.trim();
    store.aboutBody = $("store-about-body").value.trim();
    store.usedMachineNote = $("store-note").value.trim();
    store.streetAddress = $("store-street").value.trim();
    store.addressLocality = $("store-locality").value.trim();
    store.addressRegion = $("store-region").value.trim();
    store.logoChar = normalizeLogoChar($("store-logo-char").value);
    store.mark = store.logoChar;
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
    usedSection.callLabel = $("label-call").value.trim() || "電話詢問";

    var groups = Array.prototype.map.call(els.groupsList.querySelectorAll("[data-group]"), function (card, i) {
      var existing = (prev.groups || [])[Number(card.getAttribute("data-group"))] || (prev.groups || [])[i] || {};
      var category = readCategoryFromCard(card, "used", existing);
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
    contact.title = $("label-contact").value.trim() || "聯絡我們";

    var labels = Object.assign({}, prev.labels);
    labels.about = $("label-about").value.trim() || "關於我們";
    labels.services = $("label-services").value.trim() || "服務項目";
    labels.new = $("label-new").value.trim() || "全新封口機";
    labels.used = $("label-used").value.trim() || "中古機專區";
    labels.parts = $("label-parts").value.trim() || "零件專區";
    labels.support = $("label-support").value.trim() || "客服諮詢";
    labels.contact = $("label-contact").value.trim() || "聯絡我們";
    labels.faq = $("label-faq").value.trim() || "常見問題";
    labels.heroNew = $("label-hero-new").value.trim() || "全新封口機";
    labels.heroUsed = $("label-hero-used").value.trim() || "中古機專區";
    labels.heroParts = $("label-hero-parts").value.trim() || "零件專區";
    labels.filterAll = $("label-filter-all").value.trim() || "全部";
    labels.partsSearch = $("label-parts-search").value.trim() || "搜尋零件名稱";
    labels.floatToggle = $("label-float").value.trim() || labels.support || "客服諮詢";
    services.title = labels.services;
    usedSection.title = labels.used;

    var newSection = Object.assign({}, prev.newSection);
    newSection.lead = $("new-lead").value.trim();
    newSection.callLabel = $("label-call").value.trim() || "電話詢問";
    newSection.title = labels.new;

    var partsSection = Object.assign({}, prev.partsSection);
    partsSection.lead = $("parts-lead").value.trim();
    partsSection.searchPlaceholder = labels.partsSearch;
    partsSection.title = labels.parts;

    var newMachines = Array.prototype.map.call(els.newList.querySelectorAll("[data-new]"), function (card, i) {
      var existing = (prev.newMachines || [])[Number(card.getAttribute("data-new"))] || (prev.newMachines || [])[i] || {};
      var collectedNew = {
        id: existing.id,
        title: card.querySelector('[data-field="title"]').value.trim(),
        price: card.querySelector('[data-field="price"]').value.trim(),
        url: existing.url || "",
        badge: card.querySelector('[data-field="badge"]').value.trim(),
        hidden: card.querySelector('[data-field="hidden"]').checked,
        image: existing.image || ""
      };
      if (existing.images && existing.images.length) collectedNew.images = existing.images.slice();
      return collectedNew;
    });

    var parts = Array.prototype.map.call(els.partsList.querySelectorAll("[data-part]"), function (card, i) {
      var existing = (prev.parts || [])[Number(card.getAttribute("data-part"))] || (prev.parts || [])[i] || {};
      var collectedPart = {
        id: existing.id,
        title: card.querySelector('[data-field="title"]').value.trim(),
        price: card.querySelector('[data-field="price"]').value.trim(),
        url: existing.url || "",
        category: readCategoryFromCard(card, "parts", existing),
        hidden: card.querySelector('[data-field="hidden"]').checked,
        image: existing.image || ""
      };
      if (existing.images && existing.images.length) collectedPart.images = existing.images.slice();
      return collectedPart;
    });

    var announcement = Object.assign({}, prev.announcement);
    announcement.enabled = $("announce-enabled").checked;
    announcement.text = $("announce-text").value.trim();
    var paymentNote = $("payment-note").value.trim();

    var channels = Array.prototype.map.call(els.channelsList.querySelectorAll("[data-channel]"), function (card) {
      return {
        type: card.querySelector('[data-field="type"]').value,
        label: card.querySelector('[data-field="label"]').value.trim(),
        value: card.querySelector('[data-field="value"]').value.trim(),
        enabled: card.querySelector('[data-field="enabled"]').checked
      };
    });

    var chat = Object.assign({ provider: "tawk", propertyId: "", widgetId: "", label: "💬 線上文字客服（免費）" }, prev.chat || {});
    chat.provider = "tawk";
    chat.propertyId = $("chat-property-id").value.trim();
    chat.widgetId = $("chat-widget-id").value.trim();
    chat.label = $("chat-label").value.trim() || "💬 線上文字客服（免費）";

    return {
      site: site,
      store: store,
      labels: labels,
      announcement: announcement,
      paymentNote: paymentNote,
      channels: channels,
      chat: chat,
      services: services,
      usedSection: usedSection,
      newSection: newSection,
      partsSection: partsSection,
      contact: contact,
      groups: groups,
      newMachines: newMachines,
      parts: parts,
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
    renderChannels();
    renderServices();
    renderGroups();
    renderNewMachines();
    renderPartsAdmin();
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

  function pathStillUsed(path, content) {
    content = content || state.content || {};
    var groups = Array.isArray(content) ? content : content.groups;
    if ((groups || []).some(function (g) {
      return (g.images || []).indexOf(path) !== -1;
    })) return true;
    function itemUsesPath(item) {
      if (!item) return false;
      if (item.image === path) return true;
      return (item.images || []).indexOf(path) !== -1;
    }
    if ((content.newMachines || []).some(itemUsesPath)) return true;
    if ((content.parts || []).some(itemUsesPath)) return true;
    return false;
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
      state.loadedCommitSha = await latestBranchSha();
      // Load the blob at this exact commit so the editor never gets a cached/stale content.json.
      var jsonText = await loadTextAtCommit(CONFIG.contentPath, state.loadedCommitSha);
      state.content = JSON.parse(jsonText);
      if (!Array.isArray(state.content.groups)) state.content.groups = [];
      if (!Array.isArray(state.content.faq)) state.content.faq = [];
      if (!Array.isArray(state.content.newMachines)) state.content.newMachines = [];
      if (!Array.isArray(state.content.parts)) state.content.parts = [];
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
    var catalogMissing = (state.content.newMachines || []).concat(state.content.parts || []).some(function (item) {
      return item && item.hidden !== true && (!item.title || !item.price);
    });
    if (catalogMissing) {
      setBanner("error", "全新封口機和零件如果要顯示在官網，都需要填寫品名和售價。");
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
    if (els.saveBtn) {
      els.saveBtn.disabled = true;
      els.saveBtn.setAttribute("aria-busy", "true");
      els.saveBtn.textContent = "正在儲存…";
    }
    if (els.previewBtn) els.previewBtn.disabled = true;
    if (els.loadStatus) els.loadStatus.textContent = "正在儲存到 GitHub，請稍候，不要關閉頁面…";
    setBanner("status", "正在儲存到 GitHub，請稍候…");
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
      try {
        var iconFiles = await generateLogoIcons(state.content.store && state.content.store.logoChar);
        iconFiles.forEach(function (file) {
          files.push(file);
        });
      } catch (iconErr) {
        console.warn("logo icons not regenerated", iconErr);
      }
      var deletes = state.pendingDeletes.filter(function (path) {
        return !pathStillUsed(path, state.content);
      });
      var sha = await commitFiles(files, deletes, "更新官網內容");
      state.loadedCommitSha = sha;
      Object.keys(state.pendingBlobs).forEach(function (path) {
        try {
          URL.revokeObjectURL(state.pendingBlobs[path].url);
        } catch (err) {}
      });
      state.pendingBlobs = Object.create(null);
      state.pendingDeletes = [];
      var okMsg =
        "已儲存到 GitHub。GitHub Pages 通常要 1–2 分鐘（有時更久）才會更新官網，請稍候再重新整理查看，不必再按一次儲存。";
      setBanner("ok", okMsg);
      if (els.loadStatus) els.loadStatus.textContent = okMsg;
    } catch (err) {
      setBanner("error", err.message || "儲存失敗，請稍後再試。");
      if (els.loadStatus) els.loadStatus.textContent = "儲存失敗，請看上方說明後再試。";
    } finally {
      state.saving = false;
      if (els.saveBtn) {
        els.saveBtn.disabled = false;
        els.saveBtn.removeAttribute("aria-busy");
        els.saveBtn.textContent = "儲存並發布";
      }
      if (els.previewBtn) els.previewBtn.disabled = false;
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
    onClassificationEvent("used", event);
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

  function onChannelsClick(event) {
    var btn = event.target.closest("button");
    if (!btn) return;
    var card = event.target.closest("[data-channel]");
    if (!card) return;
    var index = Number(card.getAttribute("data-channel"));
    var act = btn.getAttribute("data-act");
    syncFormsToState();
    var channels = state.content.channels || [];
    if (act === "ch-del") {
      channels.splice(index, 1);
    }
    if (act === "ch-up") channels = moveItem(channels, index, -1);
    if (act === "ch-down") channels = moveItem(channels, index, 1);
    state.content.channels = channels;
    renderChannels();
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


  function uniqueCatalogId(prefix, existing) {
    var base = (prefix || "item-") + Date.now().toString(36);
    var ids = {};
    (existing || []).forEach(function (item) {
      if (item && item.id) ids[item.id] = true;
    });
    var id = base;
    var n = 1;
    while (ids[id]) {
      n += 1;
      id = base + "-" + n;
    }
    return id;
  }

  async function setCatalogImage(kind, index, file, dir, maxSize) {
    syncFormsToState();
    var list = state.content[kind] || [];
    var item = list[index];
    if (!item || !file) return;
    var resized = await resizeImage(file, maxSize || 800, 0.85);
    var path = dir + fileNameSafe(item.id || kind) + "-" + Date.now().toString(36) + ".jpg";
    if (item.image) markImageDeleted(item.image);
    var url = URL.createObjectURL(resized.blob);
    state.pendingBlobs[path] = { bytes: resized.bytes, url: url };
    item.image = path;
    if (kind === "newMachines") renderNewMachines();
    else renderPartsAdmin();
  }

  function onCatalogClick(kind, attr, event) {
    var btn = event.target.closest("button");
    if (!btn) return;
    var act = btn.getAttribute("data-act");
    var card = event.target.closest("[" + attr + "]");
    if (!card) return;
    var index = Number(card.getAttribute(attr));
    syncFormsToState();
    var list = state.content[kind] || [];
    var item = list[index];
    if (act === "del") {
      var label = (item && item.title) || "這筆商品";
      if (!confirm("確定要刪除「" + label + "」嗎？")) return;
      if (item && item.image) markImageDeleted(item.image);
      list.splice(index, 1);
    } else if (act === "up") {
      state.content[kind] = moveItem(list, index, -1);
    } else if (act === "down") {
      state.content[kind] = moveItem(list, index, 1);
    } else if (act === "img-del") {
      if (item && item.image) {
        markImageDeleted(item.image);
        item.image = "";
      }
    } else {
      return;
    }
    if (kind === "newMachines") renderNewMachines();
    else renderPartsAdmin();
  }

  function onCatalogChange(kind, event) {
    var el = event.target;
    onClassificationEvent(kind === "newMachines" ? "new" : "parts", event);
    if (el.matches('[data-field="title"]')) {
      var title = el.closest("article").querySelector(".card-head .title");
      if (title) title.textContent = el.value.trim() || (kind === "parts" ? "未命名零件" : "未命名商品");
    }
  }

  function onCatalogFile(kind, attr, dir, maxSize, event) {
    var input = event.target;
    if (!input.matches('[data-act="img-add"]')) return;
    var card = input.closest("[" + attr + "]");
    if (!card) return;
    var index = Number(card.getAttribute(attr));
    var file = input.files && input.files[0];
    setCatalogImage(kind, index, file, dir, maxSize).catch(function (err) {
      setBanner("error", err.message || "照片上傳失敗，請換一張再試。");
    });
    input.value = "";
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
    els.channelsList = $("channels-list");
    els.servicesList = $("services-list");
    els.groupsList = $("groups-list");
    els.newList = $("new-list");
    els.partsList = $("parts-list");
    els.faqList = $("faq-list");
    els.saveBtn = $("save-btn");
    els.preview = $("preview-overlay");
    els.previewFrame = $("preview-frame");
    els.previewBtn = $("preview-btn");
    els.editorStatus = $("editor-status");

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
    $("add-channel").addEventListener("click", function () {
      syncFormsToState();
      state.content.channels = state.content.channels || [];
      state.content.channels.push({ type: "line", label: "LINE", value: "", enabled: false });
      renderChannels();
    });
    els.channelsList.addEventListener("click", onChannelsClick);
    $("store-logo-char").addEventListener("input", updateLogoPreview);
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
    $("add-new").addEventListener("click", function () {
      syncFormsToState();
      state.content.newMachines = state.content.newMachines || [];
      state.content.newMachines.push({
        id: uniqueCatalogId("new-", state.content.newMachines),
        title: "",
        price: "NT$",
        url: "",
        badge: "",
        hidden: false,
        image: ""
      });
      renderNewMachines();
      var cards = els.newList.querySelectorAll("[data-new]");
      var last = cards[cards.length - 1];
      if (last) last.scrollIntoView({ behavior: "smooth", block: "start" });
    });
    $("add-part").addEventListener("click", function () {
      syncFormsToState();
      state.content.parts = state.content.parts || [];
      state.content.parts.push({
        id: uniqueCatalogId("part-", state.content.parts),
        title: "",
        price: "NT$",
        url: "",
        category: "封口機零件",
        hidden: false,
        image: ""
      });
      renderPartsAdmin();
      var cards = els.partsList.querySelectorAll("[data-part]");
      var last = cards[cards.length - 1];
      if (last) last.scrollIntoView({ behavior: "smooth", block: "start" });
    });
    els.newList.addEventListener("click", function (e) { onCatalogClick("newMachines", "data-new", e); });
    els.newList.addEventListener("input", function (e) { onCatalogChange("newMachines", e); });
    els.newList.addEventListener("change", function (e) {
      onCatalogChange("newMachines", e);
      onCatalogFile("newMachines", "data-new", "images/new/", 800, e);
    });
    els.partsList.addEventListener("click", function (e) { onCatalogClick("parts", "data-part", e); });
    els.partsList.addEventListener("change", function (e) {
      onCatalogChange("parts", e);
      onCatalogFile("parts", "data-part", "images/parts/", 400, e);
    });
    els.partsList.addEventListener("input", function (e) { onCatalogChange("parts", e); });
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

  window.YifangAdmin = {
    collectContent: collectContent,
    fillAll: fillAll,
    syncFormsToState: syncFormsToState,
    parseClassification: parseClassification,
    classificationValue: classificationValue,
    convertItem: convertItem,
    applyClassificationChange: applyClassificationChange,
    generateLogoIcons: generateLogoIcons,
    normalizeLogoChar: normalizeLogoChar,
    getContent: function () {
      return state.content;
    },
    loadLocalContent: function (content) {
      state.content = JSON.parse(JSON.stringify(content));
      if (!Array.isArray(state.content.groups)) state.content.groups = [];
      if (!Array.isArray(state.content.faq)) state.content.faq = [];
      if (!Array.isArray(state.content.newMachines)) state.content.newMachines = [];
      if (!Array.isArray(state.content.parts)) state.content.parts = [];
      if (!Array.isArray(state.content.channels)) state.content.channels = defaultChannels(state.content.store);
      state.loadedCommitSha = "local-test";
      showEditor();
      fillAll();
      if (els.loadStatus) els.loadStatus.textContent = "本地測試模式";
    }
  };

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start);
  else start();
})();
