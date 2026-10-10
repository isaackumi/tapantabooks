#!/usr/bin/env node
// Publishes docs/guide/*.md to the ClickUp doc "Trovesuite Accounting: guide for review and approval".
//
//   node scripts/guide/publish.mjs [--dry-run] [page-file ...]
//
// Screenshots referenced as ![alt](img/<name>.png) are uploaded once as attachments on the review task and
// replaced by their ClickUp URLs; uploads are cached in docs/guide/img/uploads.json by content hash.
// Pages are matched by name, so re-running updates them in place.

import { createHash } from "node:crypto";
import { existsSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { basename, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { FOLDER_ID, WORKSPACE_ID } from "../clickup/manifest.mjs";

const DOC_NAME = "Trovesuite Accounting: guide for review and approval";
const REVIEW_TASK_ID = "869ffay8v";

const GUIDE = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "docs", "guide");
const CACHE = join(GUIDE, "img", "uploads.json");

const args = process.argv.slice(2);
const DRY = args.includes("--dry-run");
const only = new Set(args.filter((a) => !a.startsWith("--")));

const tokenFile = join(homedir(), ".config", "clickup", "token");
const TOKEN = process.env.CLICKUP_API_TOKEN || (existsSync(tokenFile) ? readFileSync(tokenFile, "utf8").trim() : "");
if (!TOKEN && !DRY) {
  console.error(`Set CLICKUP_API_TOKEN or write the token to ${tokenFile}.`);
  process.exit(1);
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function api(method, path, body, form) {
  for (let attempt = 0; ; attempt++) {
    const res = await fetch(`https://api.clickup.com/api${path}`, {
      method,
      headers: form ? { Authorization: TOKEN } : { Authorization: TOKEN, "Content-Type": "application/json" },
      body: form ?? (body ? JSON.stringify(body) : undefined),
    });
    if (res.status === 429 && attempt < 5) {
      const reset = Number(res.headers.get("x-ratelimit-reset"));
      await sleep(reset ? Math.max(1000, reset * 1000 - Date.now()) : 15000);
      continue;
    }
    const text = await res.text();
    if (!res.ok) throw new Error(`${method} ${path} → ${res.status} ${text}`);
    return text ? JSON.parse(text) : {};
  }
}

/** Pages in order: each file starts with "# Name" and an optional "_Subtitle_" line. */
function readPages() {
  return readdirSync(GUIDE)
    .filter((f) => /^\d\d-.*\.md$/.test(f))
    .sort()
    .map((file) => {
      const lines = readFileSync(join(GUIDE, file), "utf8").split("\n");
      const name = lines.shift().replace(/^# /, "").trim();
      while (lines[0]?.trim() === "") lines.shift();
      const subtitle = /^_.+_$/.test(lines[0]?.trim() ?? "") ? lines.shift().trim().slice(1, -1) : undefined;
      return { file, name, subtitle, content: lines.join("\n").trim() + "\n" };
    });
}

const cache = existsSync(CACHE) ? JSON.parse(readFileSync(CACHE, "utf8")) : {};

async function imageUrl(rel) {
  const path = join(GUIDE, rel);
  const bytes = readFileSync(path);
  const hash = createHash("sha1").update(bytes).digest("hex");
  const key = basename(rel);
  if (cache[key]?.hash === hash) return cache[key].url;
  if (DRY) return `(upload ${rel})`;
  const form = new FormData();
  form.append("attachment", new Blob([bytes], { type: "image/png" }), key);
  const r = await api("POST", `/v2/task/${REVIEW_TASK_ID}/attachment`, undefined, form);
  cache[key] = { hash, url: r.url };
  writeFileSync(CACHE, JSON.stringify(cache, null, 2) + "\n");
  console.log(`  ↑ ${key}`);
  return r.url;
}

async function withImages(md) {
  let out = md;
  for (const [, alt, rel] of md.matchAll(/!\[([^\]]*)\]\((img\/[^)]+)\)/g)) {
    out = out.replace(`![${alt}](${rel})`, `![${alt}](${await imageUrl(rel)})`);
  }
  return out;
}

const v3 = (path) => `/v3/workspaces/${WORKSPACE_ID}${path}`;

async function findOrCreateDoc() {
  const r = await api("GET", v3(`/docs?parent_id=${FOLDER_ID}&parent_type=FOLDER&deleted=false&archived=false`));
  const found = (r.docs ?? []).find((d) => d.name === DOC_NAME);
  if (found) return found;
  const doc = await api("POST", v3("/docs"), {
    name: DOC_NAME,
    parent: { id: FOLDER_ID, type: 5 },
    visibility: "PUBLIC",
    create_page: false,
  });
  console.log(`Created doc ${DOC_NAME} (${doc.id})`);
  return doc;
}

const pages = readPages().filter((p) => !only.size || only.has(p.file));
if (DRY) {
  for (const p of pages) console.log(`+ ${p.name} (${p.content.length} chars)`);
  process.exit(0);
}

const doc = await findOrCreateDoc();
const listing = await api("GET", v3(`/docs/${doc.id}/page_listing?max_page_depth=1`));
for (const page of pages) {
  const content = await withImages(page.content);
  const existing = (listing ?? []).find((p) => p.name === page.name);
  const body = { name: page.name, sub_title: page.subtitle, content, content_format: "text/md" };
  if (existing) {
    await api("PUT", v3(`/docs/${doc.id}/pages/${existing.id}`), { ...body, content_edit_mode: "replace" });
    console.log(`~ ${page.name}`);
  } else {
    await api("POST", v3(`/docs/${doc.id}/pages`), body);
    console.log(`+ ${page.name}`);
  }
}
console.log(`https://app.clickup.com/${WORKSPACE_ID}/v/dc/${doc.id}`);
