# 13. Where we are and what comes next

_What the prototype covers, what it does not yet, and the order we plan to build the rest_

## Where we are (October 2026)

| Part | State |
| --- | --- |
| **Product research and blueprint** | Done; summarised on page 1 |
| **Frontend prototype** | Every first-release screen built and working against the in-browser mock, with automated tests. The first roadmap phase (all figures calculated by the server, all lists paged by the server) is complete |
| **Specification for the backend** | 160 server functions documented, with their rules, error messages and data fields; 35 open questions listed for decision (3 more already settled in the prototype) |
| **Backend (real server and database)** | Not started. Sprint ACC 2 (12–25 October 2026) sets up the server project, settles the blocking decisions, builds the core database structure and the first functions |
| **Hosting** | Not set up; planned once the backend can run the prototype end to end |

## Measured against the blueprint's own test

The blueprint says the first version succeeds when a customer can do the following. The prototype covers each one, running on the mock; the real backend still has to deliver the same behaviour.

| Success criterion from the blueprint | In the prototype |
| --- | --- |
| Set up an organisation and chart of accounts | Yes: sign-up, setup questions and a starter chart |
| Import or create customers, suppliers and opening balances | Yes: forms, CSV import and the opening balances screen |
| Record sales, purchases and payments | Yes: invoices, bills, receipts, payments, credit notes, supplier credits |
| Generate correct double-entry journals automatically | Yes: every document posts its own balanced entry |
| View a trustworthy general ledger | Yes, with drill-down to every entry |
| Produce a balance sheet and income statement | Yes, plus cash flow, ageing, statements and tax |
| Reconcile imported bank transactions | Yes: statement import, suggestions, matching and sign-off |
| Connect Store Management as a data source | **Partly**: the screens, mappings and posting rules exist, but processing real incoming events is backend work |
| Map external fields into Trovesuite | Yes for configuration; applying mappings to every import is backend work |
| Trace a financial entry back to its source | Yes: every entry shows its source and reference |
| Correct mistakes without destroying the audit history | Yes: reversals, voids, credit notes, append-only audit trail |

## Added since the first review

Everything that can be created can now also be corrected in the screens, following the accounting rule that posted entries are reversed or voided, never edited:

- **Payments**: void a receipt or supplier payment; the invoice or bill is owed again.
- **Invoices and bills**: edit or delete a draft before it is approved.
- **Bank accounts**: add, rename and deactivate (only when empty and fully reconciled). A new account gets its own ledger account.
- **Tax codes**: add, edit and deactivate. The rate is locked once a document has used it.
- **Bank reconciliation**: exclude a statement line (and restore it), delete an imported line, undo the latest import, and reopen a signed-off reconciliation with a reason.
- **Imports**: fix a failed row and discard a batch that has not been posted.
- **Posting rules**: add, edit and delete. The event and source are locked once a rule has posted; only unused rules can be deleted.
- **Data sources**: add a file, API, bank or accounting-system source, and remove it while it is disconnected and unused.
- **Settings**: rename dimensions and currencies. Deactivating, switching off and deleting now ask for confirmation first.
- **Chart of accounts**: an account cannot be deactivated while it still has a balance, pending journals or a link to a bank account, setting, tax code or posting rule.

## What is not in the prototype yet

Grouped by the order they depend on each other. Nothing here is hidden or faked in the screens; these features are simply absent.

**Platform**

- Permission-aware screens (hiding what a user may not do) and an approvals inbox
- Search across all records, notifications, file attachments (for example a scan of a supplier's bill)
- Customer and supplier profile pages with tabs (today they open in a side panel)

**Deeper transactions**

- One payment settling several invoices; customer prepayments and unapplied cash; refunds
- Debit notes; recurring invoices, bills and journals; journal templates; emailing invoices
- Bank rules, splitting a statement line

**Order to cash and procure to pay**

- Products and services, price lists, quotes, sales orders, delivery notes, returns
- Purchase requests, purchase orders, goods received, and "three-way matching" (checking a bill against what was ordered and what arrived)
- Tax periods and returns, withholding tax, tax rules for other countries

**Operations**

- Expenses and staff claims, inventory (stock), fixed assets with depreciation, a guided Migration Centre

**Enterprise**

- Budgets and variance, project accounting, user-defined dimensions, several companies with consolidation

## The roadmap

| Phase | What it delivers | Plain-language outcome |
| --- | --- | --- |
| **1. Server-side figures** (done) | All reports, dashboard figures and lists calculated and paged by the server | Works with any amount of data; the browser never calculates official figures |
| **2. Platform** | Permissions, search, approvals inbox, notifications, attachments, record timelines, full customer and supplier profiles, payment allocation, prepayments, refunds | Safe for a real team to use day to day |
| **3. Transaction depth** | Recurring documents, templates, debit notes, sending invoices, bank rules | Less repetitive work for the finance team |
| **4. Order to cash, procure to pay, tax** | Quotes, orders, deliveries, purchase orders, goods received, three-way match, tax returns | Covers the full buying and selling process, not only the invoice |
| **5. Operations and migration** | Expenses, inventory, fixed assets, Migration Centre | Covers stock and assets; moving from QuickBooks or Xero becomes a guided project |
| **6. Enterprise** | Budgets, projects, multi-company and consolidation | Ready for groups of companies |

The backend is built in the same order. Each phase's server functions are specified first, so the frontend and backend meet in the middle.

## What we are deliberately not building first

From the research, to protect the core:

- manufacturing and production planning;
- a large HR suite or a full payroll engine (HR data flows in from ZelosHR instead);
- a complex CRM;
- a no-code workflow builder;
- splitting the system into many separate services before it is needed;
- AI features before the books are proven correct. AI-assisted reconciliation and anomaly detection are on the long-term list, after the foundation is trusted.
