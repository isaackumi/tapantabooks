# Trovesuite Accounting — frontend

Clickable MVP of the Trovesuite Accounting ERP: a double-entry ledger with sales, purchases, banking, tax, reports, and an integration layer that brings in data from Trovesuite apps (Store Management, LoanDrift, ZelosHR, Attendance), other accounting systems (QuickBooks, Odoo, Xero, Sage), files, banks and the public API.

Design, layout and fonts follow `tvs-loandrift-ft`. All data is dummy data held in memory; there is no backend yet.

## Run

```bash
npm install
npm run dev        # http://localhost:3005
```

Also available: `npm run build`, `npm run start`, `npm run lint`.

Stack: Next.js 15 (App Router), React 19, TypeScript, Tailwind CSS v4, Headless UI, TanStack Table, Recharts.

## How the demo behaves

- **Everything is a journal.** Invoices, bills, receipts, payments, transfers, imports and integration events each post a balanced journal. Every report (trial balance, balance sheet, income statement, cash flow, ageing, tax) is calculated from posted journals, so a change on one page shows up everywhere.
- **Controls are enforced.** Unbalanced entries, postings to control accounts (AR 1100, AP 2010) from manual journals, postings into locked or closed periods and future-dated entries are all rejected. Posted entries are corrected by reversal, never edited.
- **Maker-checker.** Manual journals at or above the approval threshold (GH₵ 50,000, configurable in Settings) need a second person. Use the profile menu (top right) or **Settings → Users & roles** to switch user and approve an entry someone else prepared.
- **Audit trail.** Every action is recorded with who, when, channel and before/after values.
- **State lives in memory.** Navigating inside the app keeps your changes; a full browser reload restores the seed data. **Profile menu → Reset demo data** does the same on purpose.
- **Demo date** is 5 October 2026; amounts are in GH₵.

## Things worth trying

1. **Integrations → Imports → New import**, then **Use a sample file**. The sample contains deliberately bad rows (unknown customer, invalid date, duplicate reference, closed period) to show validation. Post the good rows, then fix the rest from the batch.
2. **Cash & Tax → Reconciliation**: accept suggested matches, find matches for the rest, and create entries for bank charges.
3. **Accounting → Journals → New journal** above GH₵ 50,000, then switch user and approve it.
4. **Integrations → Accounting Rules**: change the sample amounts in *Try it* to see a rule produce, or fail to produce, a balanced journal.
5. **Accounting → Fiscal Periods**: lock a period, then try posting into it.

## Layout

```
src/
  app/(app)/        pages, one folder per route
  components/       shared UI, plus accounting/, documents/, reports/, integrations/, charts/
  store/            ledgerStore: in-memory state and every mutation (with validation and audit)
  lib/              pure ledger maths: balances, statements, ageing, cash flow
  mock/seed.ts      the demo company (Kumasi Traders) and its 2026 transactions
  models/           TypeScript types for the domain
```
