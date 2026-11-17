#!/usr/bin/env node
"use strict";

const fs = require("fs");
const path = require("path");
const render = require("../js/render.js");
const { execFileSync } = require("child_process");

function generateIcons() {
  const script = path.join(__dirname, "generate-icons.py");
  execFileSync("python3", [script, ROOT], { stdio: "inherit" });
}


const ROOT = path.join(__dirname, "..");
const DIST = path.join(ROOT, "dist");

const STATIC_FILES = [
  "styles.css",
  "site.js",
  "content.json",
  "favicon.png",
  "apple-touch-icon.png",
  "og.jpg",
  ".nojekyll"
];

const STATIC_DIRS = ["images", "js", "admin"];

function rmrf(dir) {
  fs.rmSync(dir, { recursive: true, force: true });
}

function copyFile(src, dest) {
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.copyFileSync(src, dest);
}

function copyDir(src, dest) {
  if (!fs.existsSync(src)) return;
  fs.mkdirSync(dest, { recursive: true });
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    const from = path.join(src, entry.name);
    const to = path.join(dest, entry.name);
    if (entry.isDirectory()) copyDir(from, to);
    else copyFile(from, to);
  }
}

function writeBoth(rel, contents) {
  const rootPath = path.join(ROOT, rel);
  const distPath = path.join(DIST, rel);
  fs.mkdirSync(path.dirname(rootPath), { recursive: true });
  fs.mkdirSync(path.dirname(distPath), { recursive: true });
  fs.writeFileSync(rootPath, contents);
  fs.writeFileSync(distPath, contents);
}

function main() {
  generateIcons();
  const contentPath = path.join(ROOT, "content.json");
  const content = JSON.parse(fs.readFileSync(contentPath, "utf8"));
  const lastmod = render.todayStamp("Asia/Taipei");

  const indexHtml = render.renderDocument(content);
  const sitemap = render.renderSitemap(content, lastmod);
  const robots = render.renderRobots(content);
  const page404 = render.render404(content);

  rmrf(DIST);
  fs.mkdirSync(DIST, { recursive: true });

  writeBoth("index.html", indexHtml);
  writeBoth("sitemap.xml", sitemap);
  writeBoth("robots.txt", robots);
  writeBoth("404.html", page404);

  for (const file of STATIC_FILES) {
    const src = path.join(ROOT, file);
    if (fs.existsSync(src)) copyFile(src, path.join(DIST, file));
  }
  for (const dir of STATIC_DIRS) {
    copyDir(path.join(ROOT, dir), path.join(DIST, dir));
  }

  const names = (content.groups || []).map((g) => g.name + " " + g.price);
  console.log("Built official site from content.json");
  console.log("  groups: " + names.length);
  names.forEach((n) => console.log("  - " + n));
  console.log("  lastmod: " + lastmod);
  console.log("  wrote index.html, sitemap.xml, robots.txt, 404.html and dist/");
}

main();
