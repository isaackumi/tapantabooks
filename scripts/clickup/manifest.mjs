// ClickUp content for the Trovesuite > Accounting folder.
// Pushed by push.mjs; safe to re-run (existing tasks are matched by name and parent).

export const WORKSPACE_ID = "90121510421";
export const FOLDER_ID = "901215522963";
export const ASSIGNEE_ID = 105653358;

export const LISTS = {
  sprint1: { id: "901223139303", status: "complete" },
  sprint2: { id: "901223139304", status: "to do" },
  backlog: { id: "901223139118", status: "backlog" },
};

const S = (name, description) => ({ name, description });

// Parents created over MCP on 2026-10-09; only their remaining subtasks are listed.
const SPRINT1_EXISTING = [
  {
    id: "869feuuyv", // Multi-currency accounting and FX revaluation
    subtasks: [
      S("Foreign-currency documents and realised FX", "Invoices, bills, parties and bank accounts in any active currency; document rate with tolerance warning; realised FX on receipts and payments (PROCESSING_RULES §8.2, §9)."),
      S("FX revaluation preview and run", "`/revaluations/preview` and `/revaluations/run`: unrealised gain / loss on open foreign balances at month end, posted with an automatic day-one reversal."),
    ],
  },
  {
    id: "869feuuz3", // Configurable custom fields
    subtasks: [
      S("Custom field definitions in settings", "Add, edit, deactivate, delete unused and reorder fields per entity (`/custom-fields/list|add|update|delete|move`)."),
      S("Custom field values on forms, details and filters", "Typed inputs on create / edit forms, values on detail views, list filters; saved with `PUT /custom-fields/values`; required fields validated."),
    ],
  },
  {
    id: "869feuv3f", // Guided product tours
    subtasks: [
      S("Ten tours with data-tour anchors", "Welcome, invoices, customers, journals, reconciliation, revaluation, month-end close, currencies, custom fields, integrations (`src/tour/tours.ts`)."),
      S("Tour centre and first-visit Welcome tour", "`src/tour/tourCenter.tsx`: launcher with completion ticks, auto-start Welcome on first dashboard visit, progress in localStorage with reset."),
    ],
  },
  {
    id: "869feuv47", // API contract layer
    subtasks: [
      S("Endpoint catalogue (src/services/catalogue.ts)", "One entry per endpoint: method, path, query, body, permission id and which collections it invalidates. Drives the client cache and the generated API_ENDPOINTS.md."),
      S("MSW mock engine and routes", "`src/mock/api/engine.ts` (all write rules, commit-or-fail per request), `routes.ts`, `http.ts` (envelope, `ApiFault`), `worker.ts`; state persisted per tenant in localStorage (`tvs-mock-db:*`)."),
      S("Trove headers and middleware-equivalent validation", "`authorization`, `app-id`, `org-id`, `bus-id`, `loc-id` on every `/api/v1` call; 400 / 401 / 403 exactly as `TroveRequestHeadersMiddleware` (commit `ad3ff80`)."),
      S("Login, sign-up, OTP and organisation setup", "Core Platform `/landingpage/*` flows, tenant verification, first-run `POST /organisation/setup`, demo company shortcut. See AUTH_AND_ONBOARDING.md."),
    ],
  },
  {
    id: "869feuv54", // Backend integration docs
    subtasks: [
      S("API_CONVENTIONS.md and AUTH_AND_ONBOARDING.md", "Hosts, headers, envelope, errors, pagination, caching; Core vs Accounting responsibilities in sign-up, login and setup."),
      S("API_ENDPOINTS.md generator and drift check", "`npm run docs:api` generates the endpoint reference from the catalogue; `-- --check` fails CI-style when they drift."),
      S("DATA_MODEL.md", "Every entity and request body field by field, enumerations, derived report shapes and suggested Postgres tables."),
      S("PROCESSING_RULES.md with open questions", "Validation messages, journals posted, audit events and report maths per write; 38 open questions (§20) and mock shortcuts the API must not copy (§21)."),
    ],
  },
  {
    id: "869feuv5c", // Opening balances
    subtasks: [
      S("Opening journal and Opening Balance Equity", "Account balances posted as one OPENING_BALANCE journal; difference to 3900; save again reverses and re-posts."),
      S("Brought-forward invoices and bills", "Unpaid items recreated as approved documents (Dr AR / Cr 3900, Dr 3900 / Cr AP) so receipts, ageing and statements work from day one."),
      S("Guards on reverse and void", "Opening journals cannot be reversed from Journals; opening items cannot be voided from Sales / Purchases; date must be on or before the first transaction."),
    ],
  },
  {
    id: "869feuv63", // Credit notes and supplier credits
    subtasks: [
      S("Customer credit notes (AR)", "`/credit-notes/*` and `/sales/credit-notes`: against an approved invoice, Dr revenue / Dr VAT output / Cr AR, capped at the amount still owed."),
      S("Supplier credits (AP)", "`/supplier-credits/*` and `/purchases/supplier-credits`: against an approved bill, Dr AP / Cr expense / Cr VAT input."),
      S("Void and effects on statements and ageing", "Void reverses the journal and the document is owed again; credits appear on statements, ageing and the document's outstanding amount."),
    ],
  },
  {
    id: "869feuv6v", // Statements
    subtasks: [
      S("Statement engine (src/lib/statements.ts)", "Opening balance, dated entries with running balance, closing balance, ageing at to_date and open documents, in document currency."),
      S("Statements page with print and CSV", "`/reports/statements`: letterhead, customer / supplier toggle, party and currency selects, date presets, print and CSV export; Statement link on party rows."),
      S("Statement endpoints", "`GET /reports/customer-statement` and `GET /reports/supplier-statement` with `party_id`, `from_date`, `to_date`, `currency`; from ≤ to validated."),
    ],
  },
  {
    id: "869feuv7r", // Bank statement CSV import
    subtasks: [
      S("CSV parser and column detection", "`src/lib/bankStatementCsv.ts`: column and date-format detection, amounts with parentheses, DR / CR and currency symbols, single or split debit / credit columns."),
      S("Import modal with preview", "Drop zone, sample statement, column mapping, new vs already-held preview, statement date and closing balance with difference callout."),
      S("Engine: dedupe, match suggestions and statement balance", "`POST /bank-statement-lines/import` (max 2,000 lines): multiset dedupe, suggested matches within ±7 days on exact amount, bank statement balance updated, audit BANK_STATEMENT.IMPORTED."),
    ],
  },
  {
    id: "869feuv8c", // Year-end close
    subtasks: [
      S("Financial years view and close preview", "`GET /fiscal-years/list` and `/close-preview`: net income, closing lines, blockers (open periods, pending drafts, next year missing) and warnings."),
      S("Close and reopen with a YEAR_END journal", "`POST /fiscal-years/close` zeroes income and expense to retained earnings and closes the periods; `/reopen` with a reason reverses it and locks the periods again."),
      S("Report treatment of the closing entry", "Income statement and monthly P&L exclude the YEAR_END entry; balance sheet includes it; YEAR_END journals cannot be reversed from Journals."),
      S("Periods page year cards and Open next year", "`/accounting/periods`: year cards, close preview modal, reopen modal, year selector and `POST /fiscal-years/add`."),
    ],
  },
];

const GOVERNANCE_NOTE = `
## Governance
tvs-accounting-bk is governed by TVS Agentic OS: start with \`tvs start "<request>"\`, get the requirements accepted, follow \`tvs next\`, and do not write under \`app/\` or \`src/\` until \`tvs write-gate <path>\` allows it and a delivery ticket exists. Branch \`dev\` only, in this repo and tvs-sqlscript; merge tvs-sqlscript first.`;

const CONTRACT_NOTE = `
## Contract
The frontend already calls these endpoints against the in-browser mock. Request, response and rules are in tvs-accounting-ft \`docs/API_ENDPOINTS.md\`, \`docs/DATA_MODEL.md\` and \`docs/PROCESSING_RULES.md\`. The API is done when the frontend works with \`NEXT_PUBLIC_USE_MOCK_API=false\`.

## Definition of done
- [ ] Schema and RBAC seeds in tvs-sqlscript (\`dev\`), deployed first
- [ ] Six audit fields on every GET row; snake_case on the wire
- [ ] Swagger updated in the same PR
- [ ] \`./scripts/compose.sh ci\` passes
- [ ] Frontend screen verified against the dev API`;

const SPRINT2 = [
  {
    name: "(ACC-BE): Bootstrap tvs-accounting-bk from the ProductTemplate",
    priority: "urgent",
    start: "2026-10-12",
    due: "2026-10-14",
    description: `## Summary
tvs-accounting-bk is still the unrenamed ProductTemplate (one commit, \`e38d679\`). Turn it into the Accounting API before any module work.

## Steps
Follow \`RENAME.md\` and \`docs/TROVESUITE_DOTNET_API_BOOTSTRAP.md\` in the repo.
${GOVERNANCE_NOTE}`,
    subtasks: [
      S("Run RENAME.md: ProductTemplate → Accounting", "Solution, projects, namespaces, Docker image, compose services, app-id. Keep `App__RunDatabaseMigrations=false` for shared environments."),
      S("Trove header middleware and app-id for Accounting", "Configure `TroveRequestHeadersMiddleware` for the Accounting app-id; the frontend mock already mirrors its 400 / 401 / 403 behaviour."),
      S("Local compose, CI and Swagger baseline green", "`./scripts/compose.sh test`, `ci` and `smoke` pass; `/navigation` matches the Swagger path count."),
      S("Update the agent kit", "`TVS_AGENT_KIT_PATH=../tvs-dev-agent-kit ./scripts/update-agent-kit.sh`."),
    ],
  },
  {
    name: "(ACC-PM): Decide the open questions that block the schema",
    priority: "urgent",
    start: "2026-10-12",
    due: "2026-10-14",
    description: `## Summary
Some answers in PROCESSING_RULES §20 change tables and keys, so they must be settled before the first migration. Record each decision in the subtask and update PROCESSING_RULES.md (and the mock if behaviour changes).`,
    subtasks: [
      S("Q3: How the API identifies control, VAT and import accounts", "New OrgSettings fields, or subtype plus `is_control` lookup."),
      S("Q4: What bus-id and loc-id scope", "The mock keys books by tenant only. Decide whether books, numbering and reports are per legal entity and branch."),
      S("Q5 and Q6: Numbering sequences and year rollover", "Move receipt / payment prefixes to OrgSettings; gaps allowed or not; how prefixes roll to a new year."),
      S("Q23: Rounding mode and money types", "numeric(18,2) money, numeric(18,6) rates, one agreed rounding mode."),
      S("Q1 and Q2: 404 for unknown ids; stable seeded ids", "Whether every unknown id returns 404, and whether the standard chart keeps stable ids or the frontend stops relying on `acc_1100`-style ids."),
      S("Q10: Which time zone defines today", "For future-date checks, period checks and overdue status."),
      S("Q35: Audit fields on every resource", "BankStatementLine, FiscalPeriod, FieldMapping, Currency and OrgSettings."),
    ],
  },
  {
    name: "(ACC-DB): Core ledger schema and RBAC seeds in tvs-sqlscript",
    priority: "urgent",
    start: "2026-10-14",
    due: "2026-10-17",
    description: `## Summary
EF migration module for Accounting in tvs-sqlscript (\`dev\`). All DDL lives there; nothing new under the API's \`app/src/Database/Migrations/\`.

Start from DATA_MODEL.md §12 Suggested Postgres tables and §8 Number sequences.

## Rules
- Every table scoped by \`tenant_id\` (and org / business / location per the Q4 decision).
- Six audit columns on every resource table.
- Unique constraint behind every document number.`,
    subtasks: [
      S("Organisation settings, dimensions and number sequences", "OrgSettings, dimensions, per-organisation per-prefix sequences."),
      S("Currencies and exchange rates", "Currencies, rates with source (manual / BoG) and date."),
      S("Accounts and fiscal periods", "Chart of accounts tree, account roles, periods with status and lock metadata."),
      S("Journals and journal lines", "Header with status, source, reversal links; lines with dimensions, currency and base amounts; indexes for reports."),
      S("Audit events and custom fields", "Append-only audit events; custom field definitions and values."),
      S("RBAC seeds 01–04", "Resource types, one permission per catalogue permission id, default roles (owner, accountant, approver, viewer)."),
    ],
  },
  {
    name: "(ACC-BE): Platform, organisation, dimensions and currency endpoints",
    priority: "high",
    start: "2026-10-16",
    due: "2026-10-20",
    description: `## Endpoints
\`GET /navigation\`, \`GET /users/list\`, \`GET /users/me\`, \`GET /organisation/get\`, \`POST /organisation/setup\`, \`PUT /organisation/update\`, \`/dimensions/list|add|update\`, \`/currencies/list|add|update\`, \`/exchange-rates/list|add|delete|fetch-reference\`.

Setup creates the chart of accounts, tax codes, currencies, periods and settings in one transaction (AUTH_AND_ONBOARDING §4).
${CONTRACT_NOTE}`,
    subtasks: [
      S("Navigation and users from cp_users", "`/navigation`, `/users/list`, `/users/me`."),
      S("Organisation get, setup and update", "Setup allowed once; base currency changeable only while nothing is posted."),
      S("Dimensions endpoints", "Branch, department, cost centre, project."),
      S("Currencies and exchange rates endpoints", "Including the reference-rate fetch (real Bank of Ghana source, not simulated)."),
    ],
  },
  {
    name: "(ACC-BE): Chart of accounts and fiscal periods endpoints",
    priority: "high",
    start: "2026-10-19",
    due: "2026-10-22",
    description: `## Endpoints
\`/accounts/list|get|add|update\`, \`/fiscal-periods/list\`, \`PUT /fiscal-periods/update-status\`.

Rules: PROCESSING_RULES §3.1–3.3 and §5.
${CONTRACT_NOTE}`,
    subtasks: [
      S("Accounts endpoints", "Posting accounts only under groups; deactivation rules (see Q32)."),
      S("Fiscal periods list and status changes", "OPEN / LOCKED / CLOSED transitions with the §3.2 guards."),
      S("Shared posting-date check", "One service used by every write, as in the mock."),
    ],
  },
  {
    name: "(ACC-BE): Journals endpoints and the shared posting service",
    priority: "high",
    start: "2026-10-20",
    due: "2026-10-25",
    description: `## Endpoints
\`/journals/list|get|add|update|submit|approve|reject|reverse|delete\`.

## Why it matters
Every later module (invoices, payments, banking, FX, opening balances, year-end) posts through the same journal service, so this sets the pattern: one DB transaction per write, row locks on the records used for decisions, balance / postability assertions on every journal including system ones, an audit event in the same transaction.

Rules: PROCESSING_RULES §4 and §21.
${CONTRACT_NOTE}`,
    subtasks: [
      S("Journal posting service", "Validate lines, assign number from a DB sequence, write header, lines and audit in one transaction."),
      S("Draft, submit, approve, reject, delete", "Maker-checker with approval threshold; preparer cannot approve."),
      S("Reverse with a dated mirror entry", "Reversal links both ways; guards for opening and YEAR_END journals."),
      S("Idempotency key on posting endpoints", "`Idempotency-Key` header stored with the result (§21)."),
    ],
  },
  {
    name: "(ACC-FE): Point the frontend at the dev API for delivered modules",
    priority: "normal",
    start: "2026-10-21",
    due: "2026-10-25",
    description: `## Summary
As each backend module lands on dev, run the frontend against it and log every difference from the mock.

- Set \`NEXT_PUBLIC_USE_MOCK_API=false\` and the hosts from \`.env.example\` in \`.env.local\`.
- Walk the screens for the delivered modules; compare network responses with API_ENDPOINTS.md.
- Each difference becomes a bug on the side that is wrong, and the doc / mock is updated when the API is right.`,
    subtasks: [
      S("Environment for the dev API", "`.env.local` with Core and Accounting hosts; real login through Core."),
      S("Contract check: organisation, accounts, periods, journals", "Screen walkthrough plus response comparison."),
      S("Log and resolve contract differences", "One bug per difference, fixed in the API or in the mock and docs."),
    ],
  },
];

const BACKEND_MODULE = (name, priority, endpoints, rules, subtasks) => ({
  name,
  priority,
  description: `## Endpoints
${endpoints}

Rules: ${rules}
${CONTRACT_NOTE}`,
  subtasks,
});

const BACKLOG = [
  BACKEND_MODULE(
    "(ACC-BE): Sales (AR) endpoints: customers, invoices, receipts and credit notes",
    "high",
    "`/customers/*`, `/invoices/list|get|add|approve|void`, `/receipts/list|add`, `/credit-notes/list|get|add|void`.",
    "PROCESSING_RULES §6, §7, §8, §19.",
    [
      S("Customers endpoints", "Bind only editable fields (Q31); credit limit currency (Q20)."),
      S("Invoices: create, approve, void", "Line checks on account and tax code (Q17); journal per §7.4."),
      S("Receipts with realised FX and row locks", "Lock the invoice row so two receipts cannot overpay."),
      S("Credit notes", "Cap at amount owed; void reverses."),
    ],
  ),
  BACKEND_MODULE(
    "(ACC-BE): Purchases (AP) endpoints: suppliers, bills, payments and supplier credits",
    "high",
    "`/suppliers/*`, `/bills/list|get|add|approve|void`, `/supplier-payments/list|add`, `/supplier-credits/list|get|add|void`.",
    "PROCESSING_RULES §6, §7, §8, §19.",
    [
      S("Suppliers endpoints", "Same rules as customers."),
      S("Bills: create, approve, void", "Supplier status and custom field checks on approval."),
      S("Supplier payments with realised FX and row locks", "No overpayment under concurrency."),
      S("Supplier credits", "Cap at amount owed; void reverses."),
    ],
  ),
  BACKEND_MODULE(
    "(ACC-BE): Banking and reconciliation endpoints",
    "high",
    "`/bank-accounts/list|transfer`, `/bank-statement-lines/list|import`, `/reconciliation/match|unmatch|create-entry|complete`.",
    "PROCESSING_RULES §11; open questions 24–28.",
    [
      S("Bank accounts and transfers", "Decide realised FX on foreign transfers (Q24)."),
      S("Statement line import", "Structured lines as today; raw CSV / OFX / MT940 later (Q26)."),
      S("Match, unmatch, create entry, complete", "Enforce unmatched line and posted journal checks (Q28); compare balances on complete (Q27)."),
    ],
  ),
  BACKEND_MODULE(
    "(ACC-BE): FX revaluation endpoints",
    "normal",
    "`/revaluations/list|preview|run`.",
    "PROCESSING_RULES §10; open question 29.",
    [
      S("Revaluation preview", "Exclude fully paid documents and zero-balance banks (Q29)."),
      S("Revaluation run with day-one reversal", "One transaction; audit event."),
    ],
  ),
  BACKEND_MODULE(
    "(ACC-BE): Opening balances and year-end close endpoints",
    "normal",
    "`/opening-balances/get|update`, `/fiscal-years/list|close-preview|close|reopen|add`.",
    "PROCESSING_RULES §18 and §3.4.",
    [
      S("Opening balances get and update", "Reverse and re-post in one transaction; brought-forward items as approved documents."),
      S("Fiscal years list and close preview", "Blockers and warnings as in the mock."),
      S("Close, reopen and add year", "YEAR_END journal; branch-level close per Q9."),
    ],
  ),
  BACKEND_MODULE(
    "(ACC-BE): Reports and dashboard endpoints",
    "high",
    "`/dashboard/statistics`, `/reports/trial-balance|general-ledger|income-statement|balance-sheet|cash-flow|ar-ageing|ap-ageing|customer-statement|supplier-statement`.",
    "PROCESSING_RULES §17; open questions 9, 37, 38.",
    [
      S("Trial balance and general ledger", "Indexed queries or maintained balances, not full scans (§21)."),
      S("Income statement, balance sheet, cash flow", "Financial-year defaults (Q9); YEAR_END treatment as in the mock."),
      S("Ageing and dashboard", "True as-at figures (Q37); stable bucket codes (Q38)."),
      S("Customer and supplier statements", "Same maths as `src/lib/statements.ts`."),
    ],
  ),
  BACKEND_MODULE(
    "(ACC-BE): Tax, custom fields and audit log endpoints",
    "normal",
    "`/tax-codes/list`, `/custom-fields/list|add|update|delete|move|values`, `/audit-logs/list`.",
    "PROCESSING_RULES §12, §13, §16; open question 30.",
    [
      S("Tax codes", "Seeded per country at setup."),
      S("Custom fields definitions and values", "Validate on merged values; reject unknown keys; apply defaults (Q30)."),
      S("Audit log list", "Filter before paginating; actor types USER / INTEGRATION / SYSTEM."),
    ],
  ),
  BACKEND_MODULE(
    "(ACC-BE): Integrations endpoints and the real import pipeline",
    "normal",
    "`/data-sources/list|connect|disconnect|sync`, `/field-mappings/list|add|update|delete`, `/accounting-rules/list|update`, `/imports/list|add|post|reprocess`.",
    "PROCESSING_RULES §14; open questions 33 and 34.",
    [
      S("Data sources with secrets in a secret store", "Never return credentials; real syncs."),
      S("Field mappings and accounting rules", "Rules actually executed on incoming events (Q34)."),
      S("Import pipeline with server-side validation", "Replace fixed accounts and the 20% tax split; never trust client row status (Q33)."),
    ],
  ),
  {
    name: "(ACC-BE): Hardening: mock shortcuts the API must not copy",
    priority: "high",
    description: `## Summary
PROCESSING_RULES §21 lists behaviour that is fine in a single-tab mock and wrong for a multi-user API. Each item applies across modules; tick it off when the shared code handles it.`,
    subtasks: [
      S("Verify JWTs and take tenant and user from claims", "Never trust an actor id from the body or shared state."),
      S("Enforce catalogue permissions on every endpoint", "Permission id per endpoint from API_ENDPOINTS.md."),
      S("UUID ids; clients treat ids as opaque", "No derived ids like `acc_{code}`."),
      S("Number sequences with unique constraints", "Per organisation and prefix; no max-scan numbering."),
      S("One transaction per write with row locks", "Document, journal, payment, balances and audit together."),
      S("Decimal money and explicit rounding", "numeric(18,2) / numeric(18,6), one rounding mode."),
      S("Server clock in the organisation's time zone", "The mock pins today to 2026-10-05."),
      S("Store user ids; resolve names on read", "Per docs/AUDIT_FIELDS.md."),
      S("Bind only documented editable fields", "No mass assignment on party, settings, mapping or custom field updates."),
      S("400 with a message instead of 500 on bad input", "Unknown party_id, unknown entity, missing name."),
      S("Validate system-generated journals too", "Balance, non-group, existing accounts."),
    ],
  },
  {
    name: "(ACC-PM): Open questions: journals, documents and payments (Q7–Q22)",
    priority: "normal",
    description: "Decisions needed during the AR / AP and journals work. Source: PROCESSING_RULES §20. Q1–Q6, Q10 and Q23 are in Sprint ACC 2.",
    subtasks: [
      S("Q7 and Q8: Closed vs locked period posting and ordering", "Should CLOSED always block; ordering checks on LOCKED."),
      S("Q11–Q13: Maker-checker details", "Exclude submitter; self-reject; store rejection reason; audit draft edits."),
      S("Q14 and Q15: Edit / delete drafts; payment void", "Endpoints and rules for reversing payments, including FX."),
      S("Q16 and Q17: Party status and line checks on both sides", "Consistent invoice / bill approval checks and messages."),
      S("Q18 and Q19: Withholding tax and flat-rate input tax", "How WHT is calculated and posted; VFRS on purchases."),
      S("Q20–Q22: Credit limit, advances, FX tolerance", "Enforce credit limit; customer advances; reject or warn outside tolerance."),
    ],
  },
  {
    name: "(ACC-PM): Open questions: banking, FX, custom fields, integrations and settings (Q24–Q38)",
    priority: "normal",
    description: "Source: PROCESSING_RULES §20. Several are referenced from the backend module tasks.",
    subtasks: [
      S("Q24–Q29: Banking and FX", "Foreign transfers, foreign-line matching in FC, raw statement files, balance check on complete, match guards, revaluation scope and undo."),
      S("Q30–Q32: Custom fields, party updates, account deactivation", "Merged validation, editable party fields, protected accounts."),
      S("Q33 and Q34: Import pipeline and accounting rules", "Real per-entity pipeline and rule execution."),
      S("Q36–Q38: Base currency change, as-at figures, bucket codes", "Refuse or migrate; true as-at; stable codes."),
    ],
  },
  {
    name: "(ACC-PM): Auth and onboarding questions for Core Platform",
    priority: "normal",
    description: "Source: AUTH_AND_ONBOARDING.md §7. Needs answers from the Core Platform team.",
    subtasks: [
      S("Stable error codes on login outcomes", "First login, unverified tenant, MFA required."),
      S("Organisation / business / location after standalone login", "Permitted context tree from Core, or Core shell as the only entry."),
      S("When the books are created and who may run setup", "Lazy defaults vs provisioning event; owner-only setup."),
      S("Verification code delivery and sole-owner approvals", "Approval messaging; approval threshold for a single-user tenant."),
      S("Reference exchange rates outside Ghana", "Provider for NGN / KES base companies."),
    ],
  },
  {
    name: "(ACC-FE): Roles and permissions with separation of duties",
    priority: "high",
    description: "Blueprint first-version item still missing. Today there is only a demo user switch. Needs Core RBAC roles, permission-aware navigation and buttons, and separation of duties (preparer vs approver, banking vs posting).",
    subtasks: [
      S("Role model and default roles", "Owner, accountant, approver, viewer; mapped to catalogue permission ids."),
      S("Permission-aware UI", "Hide or disable actions the user cannot perform; 403 handling."),
      S("Separation of duties rules", "Which combinations a single user may not hold."),
    ],
  },
  {
    name: "(ACC-FE): Payment void and draft document edit / delete",
    priority: "normal",
    description: "Payments cannot be reversed today, and draft invoices / bills cannot be edited or deleted (PROCESSING_RULES Q14, Q15).",
    subtasks: [
      S("Edit and delete draft invoices and bills", "Endpoints, engine rules, UI."),
      S("Void a receipt or supplier payment", "Reversal date, FX treatment, document re-opened."),
    ],
  },
  {
    name: "(ACC-FE): VAT, NHIL, GETFund and WHT return workflow",
    priority: "normal",
    description: "Today there is a monthly output / input view. Needs a filing workflow: return per period, adjustments, payment of the liability, WHT certificates.",
    subtasks: [
      S("VAT return per period", "Boxes as GRA requires; lock after filing."),
      S("Withholding tax", "Deduct at payment, WHT payable, certificates."),
      S("Tax payment and settlement journals", "Clear VAT / levies payable."),
    ],
  },
  {
    name: "(ACC-FE): Quotes, sales orders, purchase orders and goods received",
    priority: "low",
    description: "Standard ERP document chain before invoices and bills. Later phase.",
    subtasks: [
      S("Quotes and sales orders", "Convert to invoice."),
      S("Purchase orders and goods received", "Three-way match with bills."),
    ],
  },
  {
    name: "(ACC-FE): Inventory and products",
    priority: "low",
    description: "Product catalogue, stock quantities, valuation and cost of sales postings. Later phase.",
    subtasks: [
      S("Products and services catalogue", "Default accounts and tax codes per item."),
      S("Stock movements and valuation", "Cost of sales journal on invoice."),
    ],
  },
  {
    name: "(ACC-FE): Fixed assets and depreciation",
    priority: "low",
    description: "Asset register, depreciation schedules and monthly depreciation journals. Later phase.",
    subtasks: [
      S("Asset register", "Acquisition, category, useful life, disposal."),
      S("Depreciation run", "Monthly journal per method."),
    ],
  },
  {
    name: "(ACC-FE): Budgets and recurring transactions",
    priority: "low",
    description: "Budget vs actual reporting; recurring invoices, bills and journals. Later phase.",
    subtasks: [
      S("Budgets by account and dimension", "Budget vs actual report."),
      S("Recurring invoices, bills and journals", "Schedules and generation."),
    ],
  },
  {
    name: "(ACC-FE): Attachments, PDF invoices by email and payment reminders",
    priority: "normal",
    description: "Attach source documents; send invoices and statements as PDF; automated reminders for overdue invoices.",
    subtasks: [
      S("Attachments on documents and journals", "Uses the platform file service (docs/FILE_MANAGEMENT.md in the API repo)."),
      S("PDF invoices and statements by email", "Branded templates."),
      S("Payment reminders", "Before due, on due, overdue."),
    ],
  },
  {
    name: "(ACC-FE): Multi-entity consolidation",
    priority: "low",
    description: "The legal entity switcher only changes the display today. Needs per-entity books (see Q4) and consolidated reports with eliminations.",
    subtasks: [
      S("Per-entity books and reports", "Depends on the bus-id / loc-id decision."),
      S("Consolidated reports and intercompany eliminations", "Later phase."),
    ],
  },
  {
    name: "(ACC-FE): Migration adapters (QuickBooks, Xero, Odoo) and data export",
    priority: "normal",
    description: "The research positions \"bring your business data with you\" as a differentiator. Opening balances and CSV imports exist; tool-specific adapters and a full export do not.",
    subtasks: [
      S("QuickBooks, Xero and Odoo adapters", "Chart, parties, open documents, history."),
      S("Full data export", "CSV / Excel per module and a complete archive."),
    ],
  },
  {
    name: "(ACC-FE): Known quirks from the MVP features",
    priority: "normal",
    description: "Small issues found while building opening balances, statements, bank import and year-end close.",
    subtasks: [
      S("Journal prefix fixed to JE-2026-", "Prefixes should roll with the financial year (Q5)."),
      S("Foreign bank lines matched in base currency", "Use `amount_fc` for foreign accounts (Q25)."),
      S("Reports default to the calendar year", "Follow `fiscal_year_start` (Q9)."),
      S("Year-end close is company-wide", "Branch-level close if needed (Q9)."),
      S("Raw bank file import", "OFX / MT940 and server-side CSV parsing (Q26)."),
    ],
  },
  {
    name: "(ACC-FE): Automated tests, repository and hosting for tvs-accounting-ft",
    priority: "high",
    description: "The frontend has no remote repository, no test suite and no hosting yet. Engine behaviour was verified with throwaway scripts and browser checks.",
    subtasks: [
      S("Create the GitHub repository and push dev", "deladetech1 organisation, branch policy as the other products."),
      S("Unit tests for the mock engine and lib", "Ledger, statements, fiscal years, CSV parser, documents."),
      S("End-to-end tests for the main flows", "Invoice to receipt, bill to payment, reconciliation, year-end."),
      S("CI and hosting", "Lint, type check, docs check, build; deploy (Amplify, as loandrift)."),
    ],
  },
];

export const TASKS = [
  ...SPRINT1_EXISTING.map((t) => ({ ...t, list: "sprint1" })),
  ...SPRINT2.map((t) => ({ ...t, list: "sprint2" })),
  ...BACKLOG.map((t) => ({ ...t, list: "backlog" })),
];
