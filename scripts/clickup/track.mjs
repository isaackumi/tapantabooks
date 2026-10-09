#!/usr/bin/env node
// Keep ClickUp in step with the work.
//
//   node scripts/clickup/track.mjs find "<text>"                 tasks in the Accounting folder whose name contains text
//   node scripts/clickup/track.mjs show <task-id>                status, list, subtasks
//   node scripts/clickup/track.mjs status <task-id> "<status>"   backlog | to do | in progress | block | bug | review | complete | Closed
//   node scripts/clickup/track.mjs comment <task-id> "<text>"    markdown comment
//   node scripts/clickup/track.mjs move <task-id> <sprint1|sprint2|backlog|list-id>
//   node scripts/clickup/track.mjs create <sprint1|sprint2|backlog|list-id> "<name>" "<markdown>" ["<status>"]
//   node scripts/clickup/track.mjs subtask <parent-id> "<name>" "<markdown>" ["<status>"]
//
// Token: CLICKUP_API_TOKEN or ~/.config/clickup/token.

import { readFileSync, existsSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { ASSIGNEE_ID, WORKSPACE_ID, LISTS } from "./manifest.mjs";

const tokenFile = join(homedir(), ".config", "clickup", "token");
const TOKEN = process.env.CLICKUP_API_TOKEN || (existsSync(tokenFile) ? readFileSync(tokenFile, "utf8").trim() : "");
if (!TOKEN) {
  console.error(`Set CLICKUP_API_TOKEN or write the token to ${tokenFile}.`);
  process.exit(1);
}

async function api(method, path, body) {
  const res = await fetch(`https://api.clickup.com/api${path}`, {
    method,
    headers: { Authorization: TOKEN, "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`${method} ${path} → ${res.status} ${text}`);
  return text ? JSON.parse(text) : {};
}

async function allTasks() {
  const out = [];
  for (const list of Object.values(LISTS)) {
    for (let page = 0; ; page++) {
      const r = await api("GET", `/v2/list/${list.id}/task?include_closed=true&subtasks=true&page=${page}`);
      out.push(...r.tasks);
      if (r.last_page !== false || r.tasks.length === 0) break;
    }
  }
  return out;
}

const line = (t) => `${t.id}  [${t.status.status}]  ${t.parent ? "  " : ""}${t.name}  (${t.list.name})`;

const [cmd, id, ...rest] = process.argv.slice(2);
const arg = rest.join(" ");

switch (cmd) {
  case "find": {
    const needle = [id, arg].filter(Boolean).join(" ").toLowerCase();
    (await allTasks()).filter((t) => t.name.toLowerCase().includes(needle)).forEach((t) => console.log(line(t)));
    break;
  }
  case "show": {
    const t = await api("GET", `/v2/task/${id}?include_subtasks=true`);
    console.log(line(t));
    console.log(t.url);
    (t.subtasks ?? []).forEach((s) => console.log(`  ${s.id}  [${s.status.status}]  ${s.name}`));
    break;
  }
  case "status": {
    const t = await api("PUT", `/v2/task/${id}`, { status: arg });
    console.log(line(t));
    break;
  }
  case "comment": {
    await api("POST", `/v2/task/${id}/comment`, { comment_text: arg, notify_all: false });
    console.log(`Commented on ${id}`);
    break;
  }
  case "move": {
    const listId = LISTS[arg]?.id ?? arg;
    await api("PUT", `/v3/workspaces/${WORKSPACE_ID}/tasks/${id}/home_list/${listId}`);
    const t = await api("GET", `/v2/task/${id}`);
    console.log(line(t));
    break;
  }
  case "create":
  case "subtask": {
    const [name, description = "", status] = rest;
    let listId;
    let parent;
    if (cmd === "subtask") {
      parent = await api("GET", `/v2/task/${id}`);
      listId = parent.list.id;
    } else {
      listId = LISTS[id]?.id ?? id;
    }
    const listStatus = Object.values(LISTS).find((l) => l.id === listId)?.status;
    const t = await api("POST", `/v2/list/${listId}/task`, {
      name,
      markdown_description: description,
      status: status ?? listStatus,
      assignees: [ASSIGNEE_ID],
      ...(parent ? { parent: parent.id } : {}),
    });
    console.log(line(t));
    console.log(t.url);
    break;
  }
  default:
    console.error("Commands: find, show, status, comment, move, create, subtask");
    process.exit(1);
}
