#!/usr/bin/env node
// Pushes manifest.mjs and the docs/ folder to the Trovesuite > Accounting folder in ClickUp.
//
//   CLICKUP_API_TOKEN=pk_... node scripts/clickup/push.mjs [--dry-run] [--tasks-only|--docs-only]
//
// The token can also be read from ~/.config/clickup/token. Re-running is safe: tasks are matched by
// name and parent in their list, and doc pages by name under their parent page.

import { readFileSync, existsSync } from "node:fs";
import { homedir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { WORKSPACE_ID, FOLDER_ID, ASSIGNEE_ID, LISTS, TASKS } from "./manifest.mjs";
import { DOC_NAME, buildPages } from "./docs.mjs";

const args = new Set(process.argv.slice(2));
const DRY = args.has("--dry-run");
const DO_TASKS = !args.has("--docs-only");
const DO_DOCS = !args.has("--tasks-only");

const tokenFile = join(homedir(), ".config", "clickup", "token");
const TOKEN = process.env.CLICKUP_API_TOKEN || (existsSync(tokenFile) ? readFileSync(tokenFile, "utf8").trim() : "");
if (!TOKEN && !DRY) {
  console.error(`Set CLICKUP_API_TOKEN or write the token to ${tokenFile}.`);
  process.exit(1);
}

const PRIORITY = { urgent: 1, high: 2, normal: 3, low: 4 };
const toMs = (d) => (d ? Date.parse(`${d}T12:00:00Z`) : undefined);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function api(method, path, body) {
  const url = path.startsWith("http") ? path : `https://api.clickup.com/api${path}`;
  for (let attempt = 0; ; attempt++) {
    const res = await fetch(url, {
      method,
      headers: { Authorization: TOKEN, "Content-Type": "application/json" },
      body: body ? JSON.stringify(body) : undefined,
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

async function listTasks(listId) {
  const all = [];
  for (let page = 0; ; page++) {
    const r = await api("GET", `/v2/list/${listId}/task?include_closed=true&subtasks=true&page=${page}`);
    all.push(...r.tasks);
    if (r.last_page !== false || r.tasks.length === 0) return all;
  }
}

async function pushTasks() {
  const existing = new Map();
  for (const [key, list] of Object.entries(LISTS)) {
    const tasks = DRY && !TOKEN ? [] : await listTasks(list.id);
    existing.set(key, tasks);
    console.log(`${key}: ${tasks.length} task(s) already in ClickUp`);
  }
  const find = (key, name, parent) =>
    existing.get(key).find((t) => t.name === name && (t.parent ?? null) === (parent ?? null));

  let created = 0;
  let skipped = 0;
  const create = async (key, task, parent) => {
    const found = find(key, task.name, parent);
    if (found) {
      skipped++;
      return found.id;
    }
    const list = LISTS[key];
    const body = {
      name: task.name,
      markdown_content: task.description,
      assignees: [ASSIGNEE_ID],
      status: list.status,
      ...(task.priority && { priority: PRIORITY[task.priority] }),
      ...(task.start && { start_date: toMs(task.start), start_date_time: false }),
      ...(task.due && { due_date: toMs(task.due), due_date_time: false }),
      ...(parent && { parent }),
    };
    created++;
    if (DRY) {
      console.log(`  + ${parent ? "  " : ""}${task.name}`);
      return `dry-${created}`;
    }
    const r = await api("POST", `/v2/list/${list.id}/task`, body);
    existing.get(key).push({ id: r.id, name: task.name, parent: parent ?? null });
    console.log(`  + ${parent ? "  " : ""}${task.name}  ${r.url}`);
    return r.id;
  };

  for (const t of TASKS) {
    const parentId = t.id ?? (await create(t.list, t));
    for (const s of t.subtasks ?? []) await create(t.list, s, parentId);
  }
  console.log(`Tasks: ${created} created, ${skipped} already present.`);
}

const v3 = (path) => `/v3/workspaces/${WORKSPACE_ID}${path}`;

async function findDoc() {
  const r = await api("GET", v3(`/docs?parent_id=${FOLDER_ID}&parent_type=FOLDER&deleted=false&archived=false`));
  return (r.docs ?? []).find((d) => d.name === DOC_NAME);
}

async function pageListing(docId) {
  const flat = [];
  const walk = (pages, parent) => {
    for (const p of pages ?? []) {
      flat.push({ id: p.id, name: p.name, parent: parent ?? null });
      walk(p.pages, p.id);
    }
  };
  walk(await api("GET", v3(`/docs/${docId}/page_listing?max_page_depth=-1`)), null);
  return flat;
}

async function pushDocs() {
  const docsDir = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "docs");
  const pages = buildPages(docsDir);
  if (DRY) {
    const show = (ps, depth) =>
      ps.forEach((p) => {
        console.log(`  ${"  ".repeat(depth)}+ ${p.name} (${p.content.length} chars)`);
        show(p.children ?? [], depth + 1);
      });
    console.log(`Doc "${DOC_NAME}"`);
    show(pages, 0);
    return;
  }

  let doc = await findDoc();
  if (!doc) {
    doc = await api("POST", v3("/docs"), {
      name: DOC_NAME,
      parent: { id: FOLDER_ID, type: 5 },
      visibility: "PUBLIC",
      create_page: false,
    });
    console.log(`Created doc ${DOC_NAME} (${doc.id})`);
  }
  const existing = await pageListing(doc.id);

  let created = 0;
  let updated = 0;
  const upsert = async (page, parentId) => {
    const found = existing.find((p) => p.name === page.name && p.parent === (parentId ?? null));
    let id = found?.id;
    if (found) {
      await api("PUT", v3(`/docs/${doc.id}/pages/${found.id}`), {
        name: page.name,
        sub_title: page.subtitle,
        content: page.content,
        content_edit_mode: "replace",
        content_format: "text/md",
      });
      updated++;
    } else {
      const r = await api("POST", v3(`/docs/${doc.id}/pages`), {
        name: page.name,
        sub_title: page.subtitle,
        content: page.content,
        content_format: "text/md",
        ...(parentId && { parent_page_id: parentId }),
      });
      id = r.id;
      created++;
    }
    console.log(`  ${found ? "~" : "+"} ${parentId ? "  " : ""}${page.name}`);
    for (const child of page.children ?? []) await upsert(child, id);
  };
  for (const p of pages) await upsert(p, null);
  console.log(`Doc pages: ${created} created, ${updated} updated.`);
}

if (DO_TASKS) await pushTasks();
if (DO_DOCS) await pushDocs();
