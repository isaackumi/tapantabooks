// Pages for the ClickUp doc: three written here, the rest mirrored from docs/ and split by "## " section.

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { execSync } from "node:child_process";

export const DOC_NAME = "Trovesuite Accounting: product and engineering";

const OVERVIEW = `# Trovesuite Accounting

Trovesuite is a modular business ERP that connects operational systems (store management, HR, loans, attendance) to a reliable, configurable double-entry accounting engine. The accounting engine is the financial system of record; operational products stay operational and send events into it when the organisation turns an integration on. (From the product blueprint.)

## Status on 9 October 2026

| Part | Repository | State |
| --- | --- | --- |
| Frontend | [deladetech1/tvs-accounting-ft](https://github.com/deladetech1/tvs-accounting-ft) (\`dev\`) | MVP complete: every first-version module, running on an in-browser mock of the API |
| API contract | tvs-accounting-ft \`docs/\` | 111 endpoints documented with rules, data model and 38 open questions |
| Backend | tvs-accounting-bk (\`dev\`) | Not started: still the unrenamed ProductTemplate |
| Schema | tvs-sqlscript (\`dev\`) | Not started |

## Where the work is tracked

| ClickUp list | Contents |
| --- | --- |
| Sprint ACC 1 (Frontend MVP) (9/23 - 10/9) | Everything built so far, marked complete, with the commit for each feature |
| Sprint ACC 2 (Backend foundation) (10/12 - 10/25) | Next: bootstrap the API repo, settle blocking questions, core schema, first endpoints |
| acc_backlogs | Remaining backend modules, open questions, ERP gaps, known quirks, tests and hosting |

Task prefixes: **(ACC-FE)** frontend, **(ACC-BE)** backend, **(ACC-DB)** schema in tvs-sqlscript, **(ACC-PM)** product decisions.

## Trying the frontend

\`\`\`bash
cd tvs-accounting-ft
npm install
npm run dev            # http://localhost:3005, mock backend
\`\`\`

Sign in with **Continue with the demo company**, or create an account at \`/auth/sign-up\` (every one-time code in the mock is \`123456\`). The demo company is a Ghanaian business with GHS as base currency; "today" in the mock is 5 October 2026. Clearing the \`tvs-mock-db:*\` keys in localStorage resets the demo books.

## Modules in the MVP

- **Accounting:** chart of accounts, journals with maker-checker approval and reversal, general ledger, trial balance, fiscal periods and financial years with year-end close, opening balances, FX revaluation.
- **Sales:** customers, invoices, receipts, credit notes.
- **Purchases:** suppliers, bills, supplier payments, supplier credits.
- **Banking:** bank, cash and mobile money accounts, transfers, reconciliation with CSV statement import.
- **Tax:** Ghana tax codes (VAT, NHIL, GETFund, flat rate, exempt, WHT) and a monthly VAT view.
- **Reports:** dashboard, income statement, balance sheet, cash flow, AR and AP ageing, customer and supplier statements.
- **Integrations:** data sources, CSV imports, field mappings, accounting rules.
- **Platform:** audit trail, settings, dimensions, currencies, custom fields, guided tours, sign-up and onboarding.
`;

const ARCHITECTURE = `# Architecture and ways of working

## Three layers (blueprint)

- **Operational layer:** store management, HR, loans, attendance and future modules.
- **Integration and data layer:** connectors, imports, field mapping, custom fields, transformation rules, validation, synchronisation.
- **Financial layer:** chart of accounts, journals, general ledger, AR / AP, tax, payments, reconciliation, assets, reporting.

## Frontend (tvs-accounting-ft)

- Next.js 15 App Router, React 19, TypeScript strict, Tailwind v4 with a \`brand-*\` scale from #ce1440; port 3005.
- **Every screen calls the API contract.** \`src/services/catalogue.ts\` lists each endpoint (method, path, query, body, permission, cache invalidation); the client sends \`authorization\`, \`app-id\`, \`org-id\`, \`bus-id\` and \`loc-id\` on every \`/api/v1\` call.
- **The mock is the reference implementation.** An MSW service worker answers in the browser. \`src/mock/api/engine.ts\` holds every write rule and commits each request as one all-or-nothing change; \`routes.ts\` maps paths to handlers; \`http.ts\` builds the response envelope and errors. Header checks match the backend's \`TroveRequestHeadersMiddleware\`.
- **Switching to the real API** is configuration: \`NEXT_PUBLIC_USE_MOCK_API=false\` plus the hosts in \`.env.example\`.
- **Docs are generated or checked from code.** \`npm run docs:api\` regenerates API_ENDPOINTS.md from the catalogue; \`-- --check\` fails when they differ. PROCESSING_RULES.md is written from the engine, DATA_MODEL.md from \`src/models/accounting.ts\`.

### Adding a feature (frontend)

1. Model types in \`src/models\`.
2. Engine operation (validation, journal, audit event).
3. Catalogue entry and route.
4. Store action and UI.
5. \`npm run docs:api\`; update PROCESSING_RULES.md and DATA_MODEL.md.
6. Type check, lint, docs check, production build, browser check, then commit on \`dev\`.

## Backend (tvs-accounting-bk)

- .NET 10, PostgreSQL, Trovesuite.Package, Azure Container Apps; started from the ProductTemplate.
- **Branch \`dev\` only** in the API repo and tvs-sqlscript. Merge tvs-sqlscript first, wait for the schema deploy, then the API.
- **All DDL in tvs-sqlscript** (EF migration module plus RBAC seeds \`01\`–\`04\`). \`App__RunDatabaseMigrations=false\` in production; nothing new under \`app/src/Database/Migrations/\`.
- **Swagger in the same PR** as API changes (Swashbuckle 10.x); \`/navigation\` should match the Swagger path count.
- **Six audit fields** on every GET resource row: \`created_at\`, \`updated_at\`, \`created_by_id\`, \`updated_by_id\`, \`created_by\`, \`updated_by\` (names resolved from \`cp_users\` at read time).
- **snake_case** JSON and query parameters.
- Local checks: \`./scripts/compose.sh test\`, \`ci\`, \`smoke\`.

### Governance

The backend repo is governed by TVS Agentic OS. A request starts with \`tvs start "<request>"\`; a person accepts the requirements; \`tvs next\` decides the next step; product code under \`app/\` or \`src/\` is written only after \`tvs write-gate <path>\` allows it and a delivery ticket exists. The frontend MVP was built outside this flow at the product owner's request.

## Rules the API must keep from the mock

Read PROCESSING_RULES §21 before writing any endpoint: verified JWTs, enforced permissions, UUIDs, database sequences for numbers, one transaction per write with row locks, idempotency keys on posting endpoints, decimal money with one rounding mode, the server clock, stored user ids, and no mass assignment.
`;

const DELIVERY_LOG = `# Delivery log

All commits are on \`dev\` in tvs-accounting-ft. Each has a matching task in Sprint ACC 1.

| Date | Commit | Change |
| --- | --- | --- |
| 2026-10-06 | \`b1530dc\` | Accounting frontend MVP with the #ce1440 brand colour |
| 2026-10-06 | \`562c744\` | Multi-currency accounting and configurable custom fields |
| 2026-10-06 | \`e72f1e7\` | Guided product tours with driver.js |
| 2026-10-06 | \`b70e37f\` | Run the app against the accounting API contract, with sign-up and onboarding |
| 2026-10-06 | \`397ee7c\` | Document the accounting API for the backend team |
| 2026-10-06 | \`ad3ff80\` | Validate Trove headers in the mock exactly like the API middleware |
| 2026-10-06 | \`0dd4b6c\` | Opening balances: conversion date, account balances, brought-forward invoices and bills |
| 2026-10-09 | \`2197ba2\` | Customer credit notes and supplier credits |
| 2026-10-09 | \`0163e34\` | Customer and supplier statements |
| 2026-10-09 | \`39fcacd\` | Import bank statement CSV files into reconciliation |
| 2026-10-09 | \`80633c4\` | Financial years and year-end close |

## How the latest features were verified

- **Statements:** every customer and supplier statement, in every currency, closes at the outstanding amount shown in ageing; split periods chain correctly.
- **Bank import:** a 6-line import in the browser suggested 4 ledger matches and left an unexplained difference of GH₵ 0.00.
- **Year-end close:** 29 of 29 engine checks against a constructed FY 2025 (closing entry, balanced balance sheet, post-closing trial balance, reopen and reclose, opening the following years); preview and "Open FY 2027" checked in the browser.
- Type check, lint, the API docs check and a production build pass after every feature.
`;

const commit = (dir) => {
  try {
    return execSync("git rev-parse --short HEAD", { cwd: dir }).toString().trim();
  } catch {
    return "unknown";
  }
};

const splitSections = (md) => {
  const lines = md.replace(/^# .*\n+/, "").split("\n");
  const preamble = [];
  const sections = [];
  for (const line of lines) {
    if (line.startsWith("## ")) sections.push({ title: line.slice(3).trim(), lines: [line] });
    else (sections.at(-1)?.lines ?? preamble).push(line);
  }
  return {
    preamble: preamble.join("\n").trim(),
    sections: sections.map((s) => ({ title: s.title, body: s.lines.join("\n").trim() })),
  };
};

export function buildPages(docsDir) {
  const sha = commit(docsDir);
  const source = (file) =>
    `> Mirrored from \`tvs-accounting-ft/docs/${file}\` at commit \`${sha}\`. The repository copy is the source of truth; links between documents point to the repository files.\n\n`;
  const read = (file) => readFileSync(join(docsDir, file), "utf8");

  const whole = (name, file, subtitle) => ({ name, subtitle, content: source(file) + read(file).replace(/^# .*\n+/, "") });

  const split = (name, file, subtitle, keepInParent = []) => {
    const { preamble, sections } = splitSections(read(file));
    const parentSections = sections.filter((s) => keepInParent.includes(s.title));
    return {
      name,
      subtitle,
      content: [source(file) + preamble, ...parentSections.map((s) => s.body)].join("\n\n"),
      children: sections
        .filter((s) => !keepInParent.includes(s.title))
        .map((s) => ({ name: s.title, content: source(file) + s.body })),
    };
  };

  return [
    { name: "Overview", subtitle: "What the product is, where it stands and where work is tracked", content: OVERVIEW },
    { name: "Architecture and ways of working", subtitle: "Frontend, mock API, backend conventions and governance", content: ARCHITECTURE },
    { name: "Delivery log", subtitle: "Commits and verification", content: DELIVERY_LOG },
    whole("Backend integration guide", "README.md", "Start here: reading order and where the truth lives"),
    whole("API conventions", "API_CONVENTIONS.md", "Hosts, headers, envelope, errors, pagination, caching"),
    whole("Auth and onboarding", "AUTH_AND_ONBOARDING.md", "Sign-up, login, OTP, first-run setup"),
    split("API endpoints", "API_ENDPOINTS.md", "Every endpoint by module (generated from the catalogue)", ["Index"]),
    split("Data model", "DATA_MODEL.md", "Entities, request bodies, enumerations and suggested tables"),
    split("Processing rules", "PROCESSING_RULES.md", "What every write validates and posts; open questions", ["Contents"]),
  ];
}
