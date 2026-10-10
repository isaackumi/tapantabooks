# 3. How the product fits together

_The building blocks, how data flows from a sale to a report, and the safety rules_

## Three layers

The research describes the product as three layers stacked on each other, not one big application.

```
 OPERATIONAL LAYER        Store Management · HR (ZelosHR) · Loans (LoanDrift) · Attendance
 (where business happens)  · outside systems: POS tills, QuickBooks, Odoo, Excel, banks
                                         │
                                         ▼
 INTEGRATION LAYER        Data sources · imports · field mappings · custom fields
 (translate and check)    · validation · posting rules
                                         │
                                         ▼
 FINANCIAL LAYER          Accounting engine → journals → general ledger
 (the books)              → invoices, bills, payments, banking, tax → reports
```

- The **operational layer** is where the business does its work: selling at a till, paying staff, lending to a client. These systems are good at operations and **should not have to understand accounting**.
- The **integration layer** receives data from those systems, translates it into Trovesuite's own format, checks it, and decides how it should be accounted for.
- The **financial layer** is the accounting engine and everything built on it. It is the single source of financial truth.

Keeping the layers apart lets each customer pick what they need: one may use Store Management but not HR; another imports sales from a third-party till; a third uses only the accounting product.

## The accounting engine

The engine is the strict core. Whatever arrives (a manual journal, an approved invoice, a payment, an imported row, a store sale) ends up as a **journal** that the engine checks before posting. Among other things, it checks that:

- debits equal credits;
- every account exists, is active and accepts postings (headings such as "1000 Assets" are only for grouping);
- the date falls in a month that exists and is **open**, and is not in the future;
- the entry has been approved, if it needs approval;
- control accounts (Receivable, Payable) are only touched by documents, never by manual journals.

If any check fails, nothing is saved, and the person sees a plain message such as *"September 2026 is locked. Reopen it in Fiscal periods before posting to it."*

## Every transaction follows the same path

```
Business activity → Document (draft) → Checks → Approval (if needed)
   → Accounting rule → Journal → General ledger → Reports
```

| Step | Example: selling to a customer on credit |
| --- | --- |
| Business activity | Kumasi Traders delivers rice to Adom Supermarket |
| Document (draft) | An accounts officer creates a sales invoice and saves it as a draft |
| Checks | Customer is active, dates make sense, every line has an account and a tax code |
| Approval | Someone clicks **Approve & post** |
| Accounting rule | Invoices always post: Receivable up, Sales up, VAT payable up |
| Journal | `JE-2026-0355` is written and linked to the invoice |
| General ledger | The three accounts show the new movements |
| Reports | Receivables, ageing, the income statement, the balance sheet and the tax page all include it immediately |

## Posting rules: how outside events become entries

When Store Management reports a sale, it does not know about debits and credits. A **posting rule** in Trovesuite describes how that kind of event is recorded. The prototype's rule for a completed store sale is:

| Side | Account | Amount taken from the event |
| --- | --- | --- |
| Debit | 1040 MTN MoMo Merchant Wallet | total paid (for example 1,200) |
| Credit | 4010 Sales Revenue | price before tax (1,000) |
| Credit | 2100 VAT & Levies Payable | tax (200) |
| Debit | 5010 Cost of Goods Sold | what the goods cost us (620) |
| Credit | 1200 Inventory | the same cost (620), because the stock has left the shelf |

Rules are **configuration, not code**: a finance manager can change which accounts a sale posts to without a developer. Every rule change is recorded in the audit trail.

## The integration and migration layer

Every outside source goes through the same steps, so users learn the pattern once:

```
Connect → Configure → Map fields → Validate → Preview → Import → Reconcile → History → Errors
```

- **Data sources** are the connected systems: Trovesuite apps, other accounting systems, files, banks and APIs.
- **Field mappings** say which field in the source means what in Trovesuite. For example, Store Management's `gross_amount` is Trovesuite's `amounts.total`, and its `branch_code` is the Trovesuite branch.
- **Custom fields** keep information that matters to one customer but has no standard home (for example a QuickBooks customer ID, or a "delivery route"), without cluttering the core design.
- **Validation** checks every row. Valid rows can be posted, rows with warnings can be posted after review, and rows with errors are held until someone fixes them.
- **Source references**: every imported or synced record remembers where it came from (for example "Store Management, sale SM-CUST-0045"), so any number in the books can be traced back to its origin.

## The safety rules

| Rule | What it means in practice |
| --- | --- |
| **Immutable posting** | Posted entries cannot be edited or deleted; they are reversed and re-entered |
| **Maker-checker** | Manual journals at or above the approval limit (GH₵50,000 in the demo) need a second person |
| **Period locks** | Nothing posts into a locked or closed month, including integrations and imports |
| **Control accounts** | Receivable and Payable change only through documents, so they always match the unpaid documents |
| **Duplicate protection** | The same supplier invoice number cannot be entered twice for the same supplier |
| **Audit trail** | Every action is recorded with who, when, through which channel (person, integration or system) and what changed |
| **Tenant isolation** | Each customer company sees only its own data (enforced by the server) |
| **Permissions** | Each action has a named permission (for example approving journals); the server will enforce them, and the screens will hide what a user may not do (planned for the next phase) |

## How the software itself is built

You do not need this section to review the product, but it explains what "frontend", "backend" and "mock" mean when the team talks about progress.

| Part | What it is | Status |
| --- | --- | --- |
| **Frontend** (`tvs-accounting-ft`) | The screens you see in the browser | Built: the prototype in this guide |
| **API / backend** (`tvs-accounting-bk`) | The server that will store data, run the rules and enforce permissions | Starts in Sprint ACC 2 (12–25 October 2026) |
| **Database schema** (`tvs-sqlscript`) | The structure of the PostgreSQL database tables | Starts with the backend |
| **Mock backend** | A stand-in server that runs inside your browser, with the same rules and pretend data | Built; replaced by the real backend later |

The frontend never calculates official figures itself. It always asks the server ("give me the trial balance as at 5 October"), today the mock and later the real backend. Switching from one to the other is a configuration setting, not a rewrite.

The contract between frontend and backend is written down in the repository and mirrored in the ClickUp doc **Trovesuite Accounting: product and engineering**:

- **API endpoints**: the 135 server functions, what each takes and returns, and which permission it needs.
- **Processing rules**: what each action must check and which journal it must post, including every error message.
- **Data model**: every kind of record and its fields.
