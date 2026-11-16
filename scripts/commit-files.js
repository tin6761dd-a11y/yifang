#!/usr/bin/env node
"use strict";

/**
 * Commit one or more files to the yifang repo with the Git Trees API.
 * This is the same approach the admin page uses in the browser.
 *
 * Token is read from GITHUB_TOKEN or GH_TOKEN only — never from a URL or a repo file.
 */

const fs = require("fs");
const path = require("path");

const DEFAULTS = {
  owner: "tin6761dd-a11y",
  repo: "yifang",
  branch: "main",
  api: "https://api.github.com",
  apiVersion: "2022-11-28"
};

function apiErrorMessage(status, bodyText) {
  let msg = "";
  try {
    msg = JSON.parse(bodyText).message || "";
  } catch (err) {}
  if (status === 401) return "登入權杖無效或已過期，請重新登入並建立新的權杖。";
  if (status === 403) {
    return "沒有權限寫入這個網站。請確認權杖只選了 yifang，並且 Contents 是 Read and write（讀寫）。";
  }
  if (status === 404) {
    return "找不到官網資料。請確認權杖有選擇 yifang 這個專案，而且是用 tin6761dd-a11y 帳號建立的。";
  }
  if (status === 409 || status === 422) {
    if (/fast forward|not a fast forward|Update is not a fast forward/i.test(bodyText + " " + msg)) {
      return "儲存失敗：官網資料在您編輯時已被更新。請重新載入頁面後再試一次，以免覆蓋別人的修改。";
    }
    return "儲存失敗：資料衝突或權限不足。請重新載入後再試一次。" + (msg ? "（" + msg + "）" : "");
  }
  if (!status) return "網路連線失敗，請檢查網路後再試一次。";
  return "發生錯誤（" + status + "）" + (msg ? "：" + msg : "，請稍後再試。");
}

async function gh(token, apiPath, options, cfg) {
  options = options || {};
  cfg = cfg || DEFAULTS;
  const headers = {
    Accept: "application/vnd.github+json",
    Authorization: "Bearer " + token,
    "X-GitHub-Api-Version": cfg.apiVersion
  };
  if (options.body) headers["Content-Type"] = "application/json";
  let res;
  try {
    res = await fetch(cfg.api + apiPath, {
      method: options.method || "GET",
      headers,
      body: options.body ? JSON.stringify(options.body) : undefined
    });
  } catch (err) {
    const error = new Error(apiErrorMessage(0, ""));
    error.cause = err;
    throw error;
  }
  const text = await res.text();
  let data = null;
  if (text) {
    try {
      data = JSON.parse(text);
    } catch (err) {
      data = text;
    }
  }
  if (!res.ok) {
    const error = new Error(apiErrorMessage(res.status, text));
    error.status = res.status;
    error.body = data;
    throw error;
  }
  return data;
}

function toBase64(buffer) {
  return Buffer.from(buffer).toString("base64");
}

async function commitFiles({ token, files, deletes, message, expectedCommitSha, owner, repo, branch }) {
  if (!token) throw new Error("缺少 GitHub 權杖。");
  const cfg = {
    ...DEFAULTS,
    owner: owner || DEFAULTS.owner,
    repo: repo || DEFAULTS.repo,
    branch: branch || DEFAULTS.branch
  };
  const refPath = `/repos/${cfg.owner}/${cfg.repo}/git/ref/heads/${cfg.branch}`;
  const ref = await gh(token, refPath, {}, cfg);
  const latestSha = ref.object && ref.object.sha;
  if (expectedCommitSha && latestSha && expectedCommitSha !== latestSha) {
    const error = new Error(
      "儲存失敗：官網資料在您編輯時已被更新。請重新載入頁面後再試一次，以免覆蓋別人的修改。"
    );
    error.status = 409;
    throw error;
  }
  const commit = await gh(token, `/repos/${cfg.owner}/${cfg.repo}/git/commits/${latestSha}`, {}, cfg);
  const treeItems = [];
  for (const file of files || []) {
    const blob = await gh(
      token,
      `/repos/${cfg.owner}/${cfg.repo}/git/blobs`,
      { method: "POST", body: { content: file.contentBase64, encoding: "base64" } },
      cfg
    );
    treeItems.push({ path: file.path, mode: "100644", type: "blob", sha: blob.sha });
  }
  for (const delPath of deletes || []) {
    treeItems.push({ path: delPath, mode: "100644", type: "blob", sha: null });
  }
  const newTree = await gh(
    token,
    `/repos/${cfg.owner}/${cfg.repo}/git/trees`,
    { method: "POST", body: { base_tree: commit.tree.sha, tree: treeItems } },
    cfg
  );
  const newCommit = await gh(
    token,
    `/repos/${cfg.owner}/${cfg.repo}/git/commits`,
    { method: "POST", body: { message, tree: newTree.sha, parents: [latestSha] } },
    cfg
  );
  await gh(
    token,
    refPath,
    { method: "PATCH", body: { sha: newCommit.sha, force: false } },
    cfg
  );
  return newCommit.sha;
}

async function cli(argv) {
  const token = process.env.GITHUB_TOKEN || process.env.GH_TOKEN;
  if (!token) {
    console.error("請用環境變數 GITHUB_TOKEN 或 GH_TOKEN 提供權杖，不要把權杖寫進指令或檔案。");
    process.exit(1);
  }
  const files = [];
  const deletes = [];
  let message = "更新官網內容";
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--message" || argv[i] === "-m") {
      message = argv[++i];
    } else if (argv[i] === "--file") {
      const rel = argv[++i];
      const abs = path.resolve(rel);
      files.push({ path: rel.replace(/^\.\//, ""), contentBase64: toBase64(fs.readFileSync(abs)) });
    } else if (argv[i] === "--delete") {
      deletes.push(argv[++i]);
    }
  }
  if (!files.length && !deletes.length) {
    console.error("請用 --file <path> 指定要提交的檔案。");
    process.exit(1);
  }
  const sha = await commitFiles({ token, files, deletes, message });
  console.log("committed " + sha);
}

module.exports = { commitFiles, toBase64, apiErrorMessage };

if (require.main === module) {
  cli(process.argv.slice(2)).catch((err) => {
    console.error(err.message);
    process.exit(1);
  });
}
