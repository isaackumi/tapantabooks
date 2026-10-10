# 1. Start here

_What this guide is, what the research concluded, and what we are asking you to approve_

## Who this is for

This guide is for everyone on the team who has to understand, review or approve Trovesuite Accounting, **including people with no accounting background**. Nothing here assumes you know what a debit is. Every accounting word is explained the first time it appears, and there is a glossary at the end.

Reading time: about 45 minutes for the whole guide. If you only have 10 minutes, read this page and page 14, "Decisions we need".

## The short version

- Trovesuite already sells operational software: **Store Management, HR (ZelosHR), Loans (LoanDrift) and Attendance**. None of them keeps the company's official financial books.
- We researched what it would take to add a proper **accounting ERP**: the system a finance team uses to record every sale, purchase, payment and tax obligation, and to produce the reports that owners, banks, auditors and the tax authority rely on.
- The research concluded that Trovesuite Accounting should be **a standalone product that is also open**: a business can use it on its own, connect it to other Trovesuite apps, or bring its data in from QuickBooks, Xero, Odoo, Sage, Excel and similar tools.
- To make the idea concrete, we built **a working prototype of the whole product's screens**. It runs in a web browser with realistic pretend data for a Ghanaian trading company called **Kumasi Traders Ltd**. You can click through every screen, create invoices, approve entries and run reports.
- The prototype is also **the specification for the backend**. Every screen talks to a documented set of server functions (135 of them), and every rule the server must enforce is written down. The backend team builds the real server to that specification.
- **We are asking you to approve** the product direction, the scope of the first release, and a short list of business decisions (page 14).

![The sign-in screen of the prototype](img/login.png)

## What the research concluded

The research started from a product blueprint and was then sharpened in discussion. Its main conclusions are below.

### 1. One reliable "engine" for the money

At the centre is an **accounting engine**: the part of the system that records every financial event in a strict, balanced format (called double-entry, explained on page 2) and refuses anything that does not balance. Everything else (invoices, payments, imports, integrations) feeds that engine. The engine is the **single source of financial truth**: reports are always calculated from it, never typed in by hand.

### 2. Standalone, but not isolated

A customer must be able to adopt Trovesuite Accounting without buying any other Trovesuite product. The research describes three ways customers will use it:

| Way of using it | Example customer | What they do |
| --- | --- | --- |
| **Standalone** | A distributor that keeps its books in Excel today | Uses Trovesuite Accounting on its own: customers, suppliers, invoices, payments, banking, tax and reports |
| **Trovesuite ecosystem** | A retailer already on Trovesuite Store Management | Connects Store Management (and later HR, Loans, Attendance), so every sale is recorded in the books automatically |
| **External ecosystem** | A company moving off QuickBooks or Odoo | Imports its history and keeps feeding data from its point-of-sale (POS), payroll or bank systems |

### 3. "Bring your business data with you"

Moving accounting systems is painful, so customers stay with tools they dislike. The research makes **migration and integration a selling point**: customers should not feel trapped by their old system, and should not feel trapped once they move to Trovesuite either.

To keep this maintainable, every outside system is first translated into **one internal Trovesuite format** (a "canonical model"). A QuickBooks invoice, an Odoo invoice and an Excel row all become the same kind of Trovesuite invoice before the engine sees them. We write one translator per source, rather than special accounting logic for every source. Where established standards exist (for example UBL and Peppol for e-invoices, ISO 20022 for bank payments), we follow them rather than invent our own.

### 4. Never post bad data silently

Imported or synced data is **checked before it touches the books**. Rows with problems are held for a person to review and correct. They are never quietly dropped and never quietly posted.

### 5. Trust is the product

For accounting software, the audit trail is not a report; it is the reason customers trust the numbers. So the design includes, from day one:

- **No deleting or overwriting** of anything that has reached the books; mistakes are corrected with a visible reversing entry.
- **Maker-checker approvals**: large manual entries need a second person to approve them.
- **Locked months**: once a month is reviewed, nothing more can be posted into it.
- **A complete audit trail**: who did what, when, and through which channel (a person, an integration or the system).

### 6. Grow in sensible steps

The research is explicit about what **not** to build first: manufacturing, a large HR suite, a complex CRM, a full payroll engine, a no-code workflow builder, microservices for every area, and AI features "before financial correctness is proven". Correct books come first; everything else builds on them.

## What the prototype is, and what it is not

| The prototype **is** | The prototype **is not** |
| --- | --- |
| Every first-release screen, fully clickable | Connected to a real server or database (yet) |
| Running the real business rules: it refuses unbalanced entries, enforces approvals and locked months, calculates tax | Holding real customer data: everything belongs to the pretend company Kumasi Traders Ltd |
| The specification the backend team builds to | Hosted for public access (hosting is set up later) |
| Saved in your browser: what you create stays until you reset it | Shared: your changes are visible only in your browser |

Two details to know while exploring:

- **"Today" is fixed at 5 October 2026** in the prototype, so the reports and due dates always look the same.
- The pretend company has **three users** so that approvals can be demonstrated: **Ama Mensah** (Finance Manager), **Kofi Boateng** (Senior Accountant) and **Efua Owusu** (Accounts Officer). You can switch between them from the user menu at the top right.

## How to try it yourself

Hosting is not set up yet, so ask a developer to run it for you, or run it on your own machine:

```bash
git clone git@github.com:deladetech1/tvs-accounting-ft.git
cd tvs-accounting-ft
npm install
npm run dev        # then open http://localhost:3005
```

On the sign-in page, click **Continue with the demo company**. To try the new-company journey instead, click **Create an account**; every one-time code in the prototype is `123456`. To start again with fresh pretend data, open the user menu and click **Reset demo data**.

## How this guide is organised

| Page | What it covers |
| --- | --- |
| 1. Start here | This page |
| 2. Accounting in plain language | The ideas you need: accounts, debits and credits, journals, ledgers, reports, tax, currencies |
| 3. How the product fits together | The building blocks, how data flows in, and the safety rules |
| 4–11. Tour of the app | Every screen, with a screenshot, what it is for and what happens behind it |
| 12. A worked example | One sale followed from invoice to payment to the reports |
| 13. Where we are and what comes next | What is built, what is not, and the roadmap |
| 14. Decisions we need | The business decisions that need an owner, with recommendations |
| 15. Glossary | Every term, A to Z |

## What we are asking you to approve

1. **The product direction**: a standalone accounting ERP with an open integration and migration layer (this page).
2. **The first-release scope**: the modules shown in the tour (pages 4–11), with the gaps listed on page 13 coming later.
3. **The business decisions** on page 14.

Please record your questions, objections and approval as comments on the ClickUp task **(ACC-PM) Review and approve the Accounting ERP guide**.
