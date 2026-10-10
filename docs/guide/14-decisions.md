# 14. Decisions we need

_Business decisions that need an owner before or during the backend build, each with a recommendation_

The backend specification lists 38 open questions. Most are technical and the engineering team will settle them. The ones below change **how the product behaves for customers**, so they need a business owner. Each has a recommendation; you can approve it, choose another option, or ask for a discussion.

Please reply on the ClickUp task **(ACC-PM) Review and approve the Accounting ERP guide**, quoting the decision number, for example *"D7: agree"* or *"D9: option B, because…"*.

## A. Product direction

**D1. Positioning.** Is Trovesuite Accounting a standalone product with an open integration and migration layer (the research's conclusion, page 1), rather than only an add-on to other Trovesuite apps?
*Recommendation:* **Yes.** It widens the market to every business with spreadsheets or another accounting system, while still giving Trovesuite customers the deepest integration.

**D2. First market.** Do we launch for **Ghana first**: cedi books, GRA VAT and levies, Ghanaian withholding tax and mobile money, with other countries' tax rules later (phase 4)?
*Recommendation:* **Yes.** The prototype is already built around Ghanaian practice, and doing one country properly beats doing several partially.

**D3. When can a real customer use it?** The prototype's modules plus the real backend make a working accounting system, but without permission checks in the screens, an approvals inbox or attachments (phase 2).
- A: first pilot customer as soon as the phase 1 backend is live, with close support;
- B: first customer only after phase 2.
*Recommendation:* **A for one friendly pilot** (ideally an existing Store Management customer), **B for general sale**. The server enforces permissions from day one even before the screens hide buttons.

**D4. Which connections come first?**
*Recommendation:* **1. Store Management** (our own customers, our own data), **2. Excel/CSV imports** (every prospect has spreadsheets), **3. QuickBooks Online migration** (the most common system to move from). Then LoanDrift, ZelosHR, Odoo and Xero.

## B. Controls and approvals

**D5. Who may approve a large manual journal?** Today the approver only has to be different from the person who **created** it.
- Should the person who **submitted** it also be barred? *Recommendation:* **Yes.**
- Should the preparer be allowed to **reject** their own entry? *Recommendation:* **No.** They can withdraw it to draft instead; rejection is the checker's decision, with a reason the preparer can see.

**D6. Default approval limit.** The demo uses GH₵50,000; each company can change it.
*Recommendation:* new companies start with approval **on** and a limit of **GH₵10,000**, which the owner adjusts during setup.

**D7. Closed months.** A company can switch off "enforce period locks" (useful during migration). Should that switch also allow posting into **closed** months?
*Recommendation:* **No.** Closed means final. The switch only affects locked months; a closed month must be reopened deliberately, and that is recorded in the audit trail.

**D8. Invoice numbering.** Today a number is taken when a draft is created, so deleted drafts can leave gaps. Tax authorities and auditors generally expect issued invoice numbers to run without gaps.
- A: keep numbering at creation and accept gaps;
- B: give invoices and bills their number **when they are approved**, never reuse a number, and keep voided documents in the sequence.
*Recommendation:* **B** for invoices, credit notes and bills; journals may keep numbering at creation.

**D9. Whose "today"?** Due dates, overdue status and the "no future dates" rule all depend on what day it is.
*Recommendation:* each company has a **time zone setting**, defaulting from its country (Africa/Accra for Ghana).

## C. Money handling

**D10. Customer prepayments and overpayments.** Today a receipt cannot exceed what is owed on one invoice, and a payment settles exactly one invoice.
*Recommendation:* **support both in phase 2**: money received without an invoice (a deposit) is held as a customer credit and applied later, and one receipt can settle several invoices. Real customers do both all the time.

**D11. Correcting payments and drafts.** Today a recorded payment cannot be undone, and draft invoices and bills cannot be edited or deleted.
*Recommendation:* **both in the first backend release.** Voiding a payment posts a reversal (like voiding an invoice) and needs a reason; drafts are freely editable and deletable because they are not in the books.

**D12. Credit limits.** Each customer has a credit limit, but nothing happens when it is exceeded.
- A: warn the person creating the invoice;
- B: block approval unless a manager overrides.
*Recommendation:* **A by default, B as a per-company setting**, with the limit in the customer's own currency.

**D13. Withholding tax (WHT).** Ghanaian businesses must withhold tax when paying certain suppliers and pay it to GRA. The code exists but is never applied.
*Recommendation:* deduct WHT **at the time of payment**: the supplier receives the net amount, the withheld part goes to Withholding Tax Payable, and a WHT certificate can be printed. Build it **before general sale**, not in phase 4, because most Ghanaian businesses need it.

**D14. Exchange rates on documents.** If someone types a rate far from the day's recorded rate, the form warns (2% tolerance in the demo).
*Recommendation:* **keep it a warning**, but record the override in the audit trail. Rates legitimately differ (a bank's actual rate versus a reference rate).

**D15. Changing the base currency.** Once anything has been posted, the base currency is fixed.
*Recommendation:* **keep that rule**, and also refuse the change once customers, suppliers or drafts exist, rather than converting them silently.

## D. Reports and integrations

**D16. Financial year in reports.** Some "year to date" figures use the calendar year (January to December) rather than the company's own financial year.
*Recommendation:* **always use the company's financial year.**

**D17. Historical ageing.** An ageing report "as at 30 September" should show what was owed on 30 September, even if it was paid on 2 October. Today later payments are counted.
*Recommendation:* **make it a true historical report**; auditors rely on it.

**D18. Imports and posting rules.** In the prototype, imported rows post through a simplified placeholder, and posting rules are not run on incoming events.
*Recommendation:* the real backend turns **every imported row into proper records** (a real invoice, bill or customer) using the source's field mappings and posting rules, **before** Store Management is connected for a real customer.

## For the finance lead

These are accounting-policy details. A qualified accountant should confirm them; the recommendation is ours.

| # | Question | Recommendation |
| --- | --- | --- |
| D19 | Rounding: round half away from zero ("commercial" rounding) or half to even ("banker's" rounding)? | Half away from zero, to two decimals, applied once per line and once per tax code |
| D20 | A retailer on the 3% VAT flat-rate scheme cannot reclaim input VAT on purchases. Should that tax be added to the cost of the purchase rather than recorded as recoverable? | Yes, add it to the cost |
| D21 | Should a year-end close be done per branch, so each branch's profit is closed separately? | No; one close per legal entity, with branch reporting through dimensions |
| D22 | Should reconciliation refuse to complete when the statement balance and the books disagree, even if every line is matched? | Yes |

## Sign-off

| Name | Role | Decision (approve / approve with changes / not approved) | Date | Notes |
| --- | --- | --- | --- | --- |
| | | | | |
| | | | | |
| | | | | |
