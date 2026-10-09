# Trovesuite Accounting frontend: architecture, inventory and roadmap

Status: October 2026. Owner: frontend. Companion to the backend contract docs in this folder ([README](./README.md)).

This document is the plan for growing the current MVP into a full accounting ERP frontend without redesigning the
accounting foundation. It records what exists, what is missing, the target structure, and the order of work.

---

## 1. Current architecture assessment

### 1.1 Stack and shape

| Concern | What exists | Verdict |
| --- | --- | --- |
| Framework | Next.js 15 App Router, React 19, TypeScript strict, Tailwind v4, Headless UI, TanStack Table, Recharts | Keep. No new framework is needed. |
| Routing | `src/app/(app)/<module>/<screen>/page.tsx`, one route per screen; auth and onboarding outside the `(app)` group | Keep. Extend with the route map in §5. |
| Auth | Core Platform login (`services/coreAuth.ts`), JWT in localStorage (`core/session.ts`), `SessionGate` around the app | Keep. |
| API client | `core/apiClient.ts`: Trove headers (`app-id`, `authorization`, `bus-id`, `loc-id`, `org-id`), envelope parsing, `ApiError`, `fetchAll` pagination | Keep. |
| API contract | `services/catalogue.ts`: 111 endpoints with method, query, body, response, permission and cache invalidation. `docs/API_ENDPOINTS.md` is generated from it and CI checks it | Keep as the single contract. Every new screen adds its endpoints here first. |
| Mock backend | MSW in the browser (`mock/api/*`): `engine.ts` holds the accounting rules (posting, approval, periods, reconciliation, year-end), `routes.ts` serves every catalogue endpoint, `db.ts` persists per tenant | Keep as the reference implementation of the contract until the API exists. |
| State | `store/ledgerStore.tsx` loads every cached collection (`COLLECTIONS`) after login and reloads the ones an endpoint invalidates after each write | **Needs refactor** at scale: see 1.3. |
| UI kit | `components/ui.tsx` (Button, Field, Panel, Callout, PageHeader, inputs), `dataTable.tsx`, `modal.tsx`, `rightDrawer.tsx`, `tabs.tsx`, `statusBadge.tsx`, `statCard.tsx`, `reports/reportKit.tsx` | Good base. Missing finance primitives listed in §7. |
| Tests | Vitest unit tests (66) for ledger maths and engine rules; Playwright end-to-end (10) for the main flows; GitHub Actions CI | Keep; every increment adds to both. |

### 1.2 The backend today

`tvs-accounting-bk` has **no accounting API yet**. It is the ProductTemplate starter with `GET /api/v1/health*` and
`GET /api/v1/navigation` only, no entities or tables, no accounting permissions, and four missing types that probably stop
it compiling. `tvs-sqlscript` has no accounting module. Its conventions (envelope, snake_case, Trove headers, `/list|get|add|update|delete`
paths, six audit fields) match what this frontend already uses.

Consequence: **the catalogue in `services/catalogue.ts` is the API contract**. The frontend must not call endpoints that
are not in it, and every new feature that needs data adds its endpoints to the catalogue, implements them in the mock
engine following `PROCESSING_RULES.md`, and regenerates `API_ENDPOINTS.md`, so the backend team has one precise list.

Contract mismatches to resolve with backend:

| Item | Frontend | Backend template | Proposed resolution |
| --- | --- | --- | --- |
| `app-id` | `app-accounting` | `app-product-template` | Backend renames to `app-accounting`. |
| Max page size | 100 (`MAX_PAGE_SIZE`); list pages ask for 25 | `PagedQuery` caps at 100 | Resolved. The mock clamps `size` to 100 like the API. |
| Pagination aliases | reads `pagination.has_next` | also emits `page_size`, `total_count`, `total_pages` | Harmless; agree one set. |
| Permissions to client | role names only | permissions only inside the JWT; no `/me/permissions` | Add `GET /users/me` returning `permissions[]` (already in the catalogue as `/users/me`; extend its shape). |

### 1.3 Weaknesses that block scale

1. **Financial figures are calculated in the browser.** The report endpoints exist in the catalogue and the mock
   (`/reports/trial-balance`, `/general-ledger`, `/income-statement`, `/balance-sheet`, `/cash-flow`, `/ar-ageing`,
   `/ap-ageing`, `/customer-statement`, `/supplier-statement`, `/dashboard/statistics`), but every report page ignores them
   and recomputes from `state.journals` with `src/lib/ledger.ts`. That breaks the rule that the backend owns balances,
   and it cannot work once a tenant has more journals than fit in one download. **Fixed in phase 1, increment 1:** the
   trial balance, general ledger, income statement, balance sheet, cash flow, AR/AP ageing, statements and dashboard
   now read their endpoints through `useReport`, which refetches after every successful write. The tax page reads the
   new `GET /reports/tax-summary`. Remaining browser calculations: document totals in forms (a preview; the server
   recomputes on save).
2. **Whole-book download.** The store fetches every journal, invoice, bill and payment on login. Lists, search and
   reports must move to server-side paging, filtering and aggregation per screen. Cached collections stay only for
   small reference data (accounts, tax codes, currencies, dimensions, periods, custom fields). **Partly fixed in
   phase 1, increment 2:** the journal, invoice, bill, receipt and supplier payment pages page, filter, search and
   sort on the server through `usePagedList`, and their cards and tab counts read the new `/statistics` endpoints.
   The store still downloads those collections for the drawers, modals and party pages that read them; removing
   them is the next step.
3. **Hard-coded calendar.** Several screens hard-coded 2026 months and presets (`"2026-10-01"`, `MONTHS` arrays). Report
   presets now come from `useReportPresets` (today plus `fiscal_year_start`). **Fixed:** no page imports `@/mock/seed`
   any more. The tax page takes its range from presets and its tax accounts from the tax codes; invoice and bill lines
   take their account and tax code from new organisation defaults (`default_sales_account_id`,
   `default_purchase_account_id`, `default_sales_tax_code_id`, `default_purchase_tax_code_id`), editable under
   Settings → Organisation with the exchange-difference accounts.
4. **No permission model in the UI.** Navigation and actions do not check permissions; the catalogue already names one
   permission per endpoint (`permission-accounting-<resource>-<verb>`), so the UI can gate on the same strings.
5. **Search is page-local.** The header search filters the current page only. There is no global search or command palette.
6. **Documents link to one payment target.** A receipt or payment settles one document; there is no allocation across
   several documents, no unapplied cash, no refunds.
7. **No attachments.** No record can carry a file, so source documents (receipts, supplier invoices, contracts) live elsewhere.

---

## 2. Existing feature inventory

Legend: **EXISTS** (usable, follows the rules), **PARTIAL** (works but incomplete against the brief), **MISSING**,
**NEEDS REFACTOR** (works but violates an architecture rule).

### 2.1 Shell and platform

| Feature | Status | Notes |
| --- | --- | --- |
| App shell, collapsible grouped sidebar, dark mode, full screen | EXISTS | `shared/mainLayout.tsx`, `components/sidebar.tsx` |
| Company / branch selector | PARTIAL | `EntitySwitcher` is display-only |
| Fiscal period context | PARTIAL | Header shows the current period and its status; not selectable |
| Global search / command palette | MISSING | Header search is page-local |
| Notifications | MISSING | |
| Tasks / approvals inbox | PARTIAL | Dashboard "Needs attention"; journal approvals only |
| Help / guided tours | EXISTS | driver.js tour centre |
| Sign-up, login, MFA, tenant verification, first-run setup | EXISTS | Core Platform flows plus organisation setup |
| Permission-aware navigation and actions | MISSING | |
| Data states (loading, error, empty, no permission, offline) | PARTIAL | Shell load and error exist; per-screen states are inconsistent |

### 2.2 Accounting

| Feature | Status | Notes |
| --- | --- | --- |
| Chart of accounts with groups, subtypes, control accounts, custom fields | EXISTS | |
| Journals: draft, submit, maker-checker approval, reject, reverse, delete draft | EXISTS | Statuses DRAFT, PENDING_APPROVAL, POSTED, REVERSED; posted entries are immutable and corrected by reversal |
| Journal lines with cost centre, branch, foreign-currency amount | EXISTS | Tax per line and attachments MISSING |
| General ledger with running balance | EXISTS | `GET /reports/general-ledger`; deep links `?account=&from=&to=` |
| Trial balance | EXISTS | `GET /reports/trial-balance`; each account drills to its ledger at the same date |
| Fiscal periods: open, lock, close in order | EXISTS | |
| Fiscal years and year-end close with preview, reopen | EXISTS | |
| Opening balances (accounts, open invoices and bills) | EXISTS | |
| Currency revaluation | EXISTS | |
| Recurring journals, journal templates | MISSING | |
| Approval history on journals | PARTIAL | Approver recorded; no timeline component |

### 2.3 Receivables and sales

| Feature | Status | Notes |
| --- | --- | --- |
| Customers list, form, balances, overdue | EXISTS | |
| Customer profile (overview, transactions, statement, contacts, attachments, activity) | PARTIAL | List plus drawer; no tabbed profile |
| Invoices: draft, approve and post, void, multi-currency, custom fields, accounting impact | EXISTS | Lifecycle DRAFT, OPEN, PARTIALLY_PAID, PAID, OVERDUE, VOID; SENT missing |
| Receipts | EXISTS | One invoice per receipt |
| Payment allocation, unapplied cash, refunds | MISSING | |
| Credit notes | EXISTS | Debit notes MISSING |
| Customer statements | EXISTS | `GET /reports/customer-statement` |
| AR ageing | EXISTS | `GET /reports/ar-ageing` with per-document detail; drills to invoices and the statement. Not yet a true historical ageing (API open question) |
| Quotes, sales orders, delivery notes, returns, recurring invoices, price lists, products and services | MISSING | |
| Collections, payment reminders | MISSING | |

### 2.4 Payables and purchasing

| Feature | Status | Notes |
| --- | --- | --- |
| Suppliers, bills, supplier payments, supplier credits, supplier statements | EXISTS | Statements and AP ageing read their endpoints |
| Duplicate supplier-invoice detection | EXISTS | |
| Purchase requests, RFQs, purchase orders, goods receipts, three-way match | MISSING | |
| Recurring bills, vendor pricing, contracts | MISSING | |

### 2.5 Banking

| Feature | Status | Notes |
| --- | --- | --- |
| Bank, MoMo and cash accounts; transfers | EXISTS | |
| Statement CSV import with column detection and duplicate check | EXISTS | |
| Reconciliation: suggestions, find match, create entry, complete | EXISTS | Split, exclude, bank rules MISSING |
| Deposits, withdrawals as first-class transactions | PARTIAL | Via journals and "create entry" |

### 2.6 Other modules

| Module | Status | Notes |
| --- | --- | --- |
| Tax: codes, VAT by month | PARTIAL | Tax periods, returns, jurisdictions, withholding certificates MISSING |
| Expenses, claims, advances, corporate cards | MISSING | |
| Inventory | MISSING | Store Management integration posts sales only |
| Fixed assets | MISSING | Fixed-asset accounts exist in the chart |
| Budgeting | MISSING | |
| Projects | PARTIAL | Projects exist as a dimension only |
| Reports centre | PARTIAL | P&L, balance sheet, cash flow, ageing, statements, trial balance, GL, all from report endpoints; comparison for P&L and balance sheet; drill to GL; cash flow lines do not drill (API returns labels only); dimension filters MISSING |
| Integrations: data sources, imports with validation, field mappings, accounting rules | EXISTS | |
| Migration centre (guided QuickBooks/Xero/Zoho/Sage/Odoo/ERPNext migration) | PARTIAL | Import wizard and mappings exist; no end-to-end migration flow |
| Custom fields (text, number, date, boolean, select) on main entities | EXISTS | Multi-select and reference MISSING |
| Dimensions: legal entity, branch, department, cost centre, project | EXISTS | Configurable dimension types MISSING |
| Audit trail | EXISTS | Per-record activity panels PARTIAL |
| Settings: organisation, controls, numbering, currencies, custom fields, dimensions, users and roles, API catalogue | EXISTS | |

---

## 3. Missing feature inventory (grouped by dependency)

1. **Foundation**: server-side reports, paged lists, permissions, global search, notifications and approvals inbox,
   attachments, configurable formats, consistent data states.
2. **Transaction depth**: payment allocation and unapplied cash, refunds, debit notes, recurring documents, journal
   templates, invoice SENT status and delivery, approval workflows beyond journals.
3. **Order-to-cash and procure-to-pay**: products and services, price lists, quotes, sales orders, delivery notes,
   returns; purchase requests, RFQs, purchase orders, goods receipts, three-way match.
4. **Operational modules**: expenses and claims, inventory, fixed assets, budgeting, project accounting.
5. **Enterprise**: configurable dimensions on every line, multi-company and intercompany, consolidation, configurable
   tax systems with returns, migration centre.

---

## 4. Information architecture

Primary navigation, in order. A module shows only when the tenant has enabled it and the user holds at least one of its
`list` permissions. A small business sees Overview, Accounting, Sales, Purchasing, Banking, Tax, Reports; larger
organisations enable the rest.

| Section | Contents | Phase |
| --- | --- | --- |
| Overview | Dashboard, Approvals inbox, Tasks, Notifications | 1–2 |
| Accounting | Chart of accounts, Journals, Recurring journals, Journal templates, General ledger, Trial balance, Fiscal years and periods, Opening balances, Revaluation | now, 3 |
| Sales | Customers, Products and services, Price lists, Quotes, Sales orders, Delivery notes, Invoices, Recurring invoices, Credit notes, Debit notes, Receipts, Refunds, Collections | now, 3–4 |
| Purchasing | Suppliers, Purchase requests, RFQs, Purchase orders, Goods receipts, Bills, Recurring bills, Supplier credits, Payments | now, 4 |
| Banking | Accounts, Transactions, Statement import, Reconciliation, Bank rules, Transfers | now, 3 |
| Expenses | Expenses, Claims, Advances, Corporate cards, Categories | 5 |
| Inventory | Items, Warehouses, Stock, Movements, Transfers, Adjustments, Counts, Valuation | 5 |
| Fixed assets | Register, Categories, Depreciation runs, Disposals, Revaluation | 5 |
| Tax | Tax codes, Jurisdictions, Tax periods, Returns, Withholding | now, 4 |
| Budgeting | Budgets, Versions, Forecasts, Variance | 6 |
| Projects | Projects, Budgets, Timesheets, Billing, Profitability | 6 |
| Reports | Report centre by category, saved reports | now, 1+ |
| Integrations | Integration centre, Migration centre, Imports, Field mappings, Accounting rules, API and webhooks | now, 5 |
| Administration | Organisation, Companies and branches, Users and roles, Controls, Numbering, Currencies, Tax configuration, Dimensions, Custom fields, Audit log | now, 2 |

Context always visible in the header: company, branch, current fiscal period and its status, signed-in user and acting role.

---

## 5. Route map

Existing URLs are kept. New routes follow the same `/<module>/<screen>` pattern; detail views open as drawers via
`?open=<id>` (already used by journals) so lists keep their filters, and get full pages only when they need tabs.

| Route | Status |
| --- | --- |
| `/dashboard` | exists |
| `/approvals` | phase 2 |
| `/accounting/chart-of-accounts`, `/journals`, `/general-ledger`, `/trial-balance`, `/periods`, `/opening-balances`, `/revaluation` | exist |
| `/accounting/recurring-journals`, `/accounting/journal-templates` | phase 3 |
| `/sales/customers`, `/sales/customers/[id]` (profile with tabs) | list exists; profile phase 2 |
| `/sales/invoices`, `/receipts`, `/credit-notes` | exist |
| `/sales/quotes`, `/sales/orders`, `/sales/delivery-notes`, `/sales/debit-notes`, `/sales/refunds`, `/sales/products`, `/sales/price-lists`, `/sales/collections` | phases 3–4 |
| `/purchases/suppliers`, `/bills`, `/payments`, `/supplier-credits` | exist (labelled "Purchasing") |
| `/purchases/requests`, `/purchases/orders`, `/purchases/receipts` | phase 4 |
| `/banking/accounts`, `/banking/reconciliation` | exist |
| `/banking/transactions`, `/banking/rules` | phase 3 |
| `/tax` | exists; `/tax/returns`, `/tax/periods` phase 4 |
| `/expenses/*`, `/inventory/*`, `/assets/*`, `/budgets/*`, `/projects/*` | phases 5–6 |
| `/reports`, `/reports/<report>` | exist; new reports added per module |
| `/integrations/sources`, `/imports`, `/mappings`, `/rules` | exist |
| `/integrations/migration` | phase 5 |
| `/settings` (Administration), `/audit-trail` | exist |

---

## 6. Accounting workflow map

Every business transaction follows one lifecycle, and every detail view shows where the record is in it:

```
Business activity → Document (draft) → Validation → Approval (if required) → Accounting rule → Journal → General ledger → Reports
```

| Workflow | Documents and states | Journal produced | Shown on the record |
| --- | --- | --- | --- |
| Order to cash | Quote → Sales order → Delivery note → Invoice (DRAFT, OPEN, PARTIALLY_PAID, PAID, OVERDUE, VOID) → Receipt → Allocation | Invoice: Dr AR, Cr revenue, Cr output tax. Receipt: Dr bank, Cr AR | Lines, totals, accounting impact, payments, credit notes, journal, audit, source reference |
| Procure to pay | Purchase request → PO → Goods receipt → Bill (three-way match) → Payment | Bill: Dr expense or asset, Dr input tax, Cr AP. Payment: Dr AP, Cr bank | Match status per line, approvals, journal, audit |
| Manual journal | DRAFT → PENDING_APPROVAL → POSTED → REVERSED | The entry itself; reversal posts the mirror | Debits, credits, difference, approver, reversal link |
| Bank reconciliation | Statement line UNMATCHED → SUGGESTED → MATCHED → reconciliation completed | Only for lines with no ledger entry | Ledger balance, in-transit items, unexplained difference |
| Period close | Period OPEN → LOCKED → CLOSED; year close preview → close → reopen | Year-end: P&L to retained earnings | Blockers, warnings, closing journal |
| Import and integration | Batch NEEDS_REVIEW → POSTED / PARTIALLY_POSTED / FAILED | Per accounting rule | Row errors, mapping, source system and external ID |

Shared approval states for every approvable document: **Pending, Approved, Rejected, Returned**, with an
`ApprovalTimeline` and the permission that allows each action.

---

## 7. Component architecture and design-system assessment

Principle: one implementation per concept, in `src/components`, used by every module. Pages compose; they do not
format money, compute balances or render their own tables.

| Component | Status | Where / plan |
| --- | --- | --- |
| DataTable (sort, paginate, row click, empty state, custom-field columns) | EXISTS | `dataTable.tsx`; add server-side paging mode (phase 1) |
| FinancialTable / ReportTable | PARTIAL | `reports/reportKit.tsx` (`StatementSection`, `TotalRow`); trial balance and GL use raw tables |
| ReportHeader (company, title, period, currency) | EXISTS | `ReportSheet` |
| QueryState (loading, error with retry, empty) | EXISTS | `components/queryState.tsx`; keeps stale data with a warning when a refetch fails. No-permission state comes with phase 2 |
| CurrencyAmount | PARTIAL | `fmtCurrency`, `fmtMoney`, `fmtAccounting` functions; add a component with negative styling and currency code |
| StatusBadge | EXISTS | `statusBadge.tsx` |
| AccountSelector | NEEDS REFACTOR | Native `<select>` with optgroups; needs search and keyboard use for large charts |
| Customer / Supplier / Product selectors | PARTIAL | Inline selects; extract a shared searchable `RecordSelector` |
| DateRangePicker with presets | EXISTS | `ReportToolbar` with `useReportPresets` (today and `fiscal_year_start`) |
| FiscalPeriodSelector | MISSING | |
| DimensionSelector | PARTIAL | Branch and cost centre selects inline |
| TaxSelector | PARTIAL | Inline select |
| JournalLines (editor and read-only view with debit, credit, difference) | PARTIAL | Inside `journalFormModal` and `journalViewer`; extract |
| PaymentAllocation | MISSING | Phase 2 |
| ApprovalTimeline, AuditTimeline, TransactionTimeline | MISSING / PARTIAL | Audit trail page exists; per-record timelines phase 2 |
| DocumentViewer | PARTIAL | `documentDrawer.tsx` |
| AttachmentUploader | MISSING | Phase 2; needs a file endpoint |
| FilterBar | PARTIAL | `tabs.tsx` plus ad-hoc selects |
| DrillDownDrawer | PARTIAL | `journalViewer` drawer; generalise |
| ConfirmationDialog / ReasonDialog | PARTIAL | `accounting/reasonModal.tsx` |

Design system: the palette (brand #ce1440 on neutral greys), type scale, spacing and dark mode are consistent and finance
appropriate, with tables first and few decorative elements. Chart axes now use `fmtAxis` (compact, no symbol; the
panel states the currency). Gaps: number formatting is
fixed to `en-GB` and the base currency (must follow organisation locale settings); some statement pages centre a narrow
sheet where a full-width table would read better on desktop.

---

## 8. Migration and integration UX architecture

One shape for every connector, so users learn it once:

```
Connection → Configuration → Mapping → Validation → Preview → Import → Reconciliation → History → Errors
```

The Migration Centre wraps that shape in a guided flow for moving a whole company:

```
Select source → Upload or connect → Detect data → Map fields → Transform → Validate → Preview → Reconcile → Import → Review results
```

| Step | Shows | Existing building block |
| --- | --- | --- |
| Select source | QuickBooks, Xero, Zoho Books, Sage, Odoo, ERPNext, Excel/CSV | `integrations/sources` catalogue |
| Detect data | Entities found and record counts per entity | `importWizard` file parsing |
| Map fields | Source field → canonical Trovesuite field, transforms, unmapped fields | `field-mappings` |
| Validate | Valid, invalid, warnings, duplicates per entity; never hidden | Import batch validation |
| Preview | Journals and documents that will be created | Accounting rules "try it" |
| Reconcile | Source trial balance and AR/AP totals vs Trovesuite after import | Trial balance and ageing endpoints |
| Results | Imported, failed, reprocess | `imports/reprocess` |

Canonical model rule: external systems never shape internal types. Each imported record keeps `source.type`,
`source.reference` (external ID) and the data source, shown as a source badge with the external ID on the record.

---

## 9. Implementation roadmap

Each phase ships working screens backed by catalogue endpoints, mock behaviour, unit tests for new engine rules and
end-to-end tests for new flows. Nothing ships as a placeholder.

| Phase | Scope | Exit criteria |
| --- | --- | --- |
| **1. Server-side figures** | Reports and dashboard KPIs read the report endpoints; shared `QueryState`; presets from today; monthly trend endpoint; chart label fix. Then paged lists for journals, invoices, bills, payments, and the store keeps only reference data | No report or KPI computed from `state.journals` in a page; lists page on the server |
| **2. Platform** | Permissions from `/users/me` gating nav and actions; global search (`GET /search`) and command palette; approvals inbox; notifications; attachments (`/attachments/*`); record activity timelines; customer and supplier profiles with tabs; payment allocation, unapplied cash, refunds | Every sensitive action checks a permission; any record findable from the header |
| **3. Transaction depth** | Recurring journals and templates; recurring invoices and bills; debit notes; invoice sending; bank transactions, rules, split and exclude in reconciliation | |
| **4. Order to cash, procure to pay, tax** | Products and services, price lists, quotes, sales orders, delivery notes, returns; purchase requests, POs, goods receipts, three-way match; tax periods and returns, configurable tax systems | |
| **5. Operations and migration** | Expenses and claims with receipt upload; inventory; fixed assets with depreciation; Migration Centre | |
| **6. Enterprise** | Budgeting and variance; project accounting; configurable dimensions; multi-company, intercompany and consolidation | |

Phase 1, increment 1 (server-side figures) is done. It added `GET /reports/monthly-trend`, per-document detail and
`party_code` on ageing, four dashboard statistics (`revenue_ytd`, `payables_due_7_days`, `overdue_invoices`,
`draft_journals`) and section totals on the balance sheet; see `PROCESSING_RULES.md` section 17. Contract gaps it
surfaced, for the API:

- Cash flow lines carry only a label; to drill down they need the contributing journal ids or a
  `GET /reports/cash-flow/lines?section=&label=` detail endpoint.
- Ageing `as_at` excludes later documents but not later payments, so it is not a true historical ageing.
- Year-to-date figures use the calendar year, not `fiscal_year_start`.

Phase 1, increment 2 (paged lists) is done for the journal, invoice, bill, receipt and supplier payment pages. It
added `GET /journals/statistics`, `/invoices/statistics`, `/bills/statistics`, `/receipts/statistics` and
`/supplier-payments/statistics`; derived fields on invoice, bill and payment list items; `cf_<key>` custom field
filters; payment list totals; and a 100-row page cap; see `PROCESSING_RULES.md` sections 1.1, 4.11, 7.8 and 8.5.
`DataTable` takes a `server` prop for server-side sorting and paging; its column ids are the API's `sort_by` names.

Next increment: remove the transaction collections from the store. The document drawer, payment and credit note
modals, party pages and the reports landing page read them today; each moves to `/get` endpoints, filtered lists
(for example `GET /invoices/list?customer_id=`) or statistics, so the store keeps only reference data.

Backend dependency: each phase's endpoints are added to the catalogue first and handed to `tvs-accounting-bk` through
`API_ENDPOINTS.md` and `PROCESSING_RULES.md`, so the API and the frontend converge on one contract.
