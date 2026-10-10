# 12. A worked example: one sale, start to finish

_Following one invoice through the books, the reports and the bank, so the pieces connect_

This example follows a single credit sale through every part of the product. You can repeat it in the prototype in about ten minutes.

**The story.** On 5 October 2026, Kumasi Traders delivers **100 bags of rice at GH₵300 each** to **Adom Supermarket Ltd**, which has 30 days to pay. Rice is standard-rated, so 20% VAT and levies apply. On the same day, Adom pays **GH₵20,000 by mobile money** as a first instalment.

## Step 1: Create and approve the invoice

**Where:** Sales → Invoices → **New invoice**.

- Customer: Adom Supermarket Ltd. The due date fills in as 4 November (their 30-day terms).
- Line: "Rice – 25kg bags", account 4010 Sales Revenue, quantity 100, unit price 300, tax GH-STD.
- The form shows subtotal **GH₵30,000.00**, standard rated **GH₵6,000.00**, total **GH₵36,000.00**.
- Click **Approve & post**. A message confirms the new invoice number, for example "INV-2026-0044 approved and posted".

**What the system did, without anyone typing a debit or credit:**

```
JE-2026-0355   5 Oct 2026   Sales invoice INV-2026-0044 – Adom Supermarket Ltd

Dr  1100 Accounts Receivable        36,000.00   Adom now owes us
    Cr  4010 Sales Revenue                      30,000.00   income earned
    Cr  2100 VAT & Levies Payable                6,000.00   owed to GRA
```

Debits 36,000 = credits 36,000. The invoice is **Open**, and the audit trail records "INVOICE.APPROVED" by you.

## Step 2: See it everywhere at once

Without any further action:

| Where | What changed |
| --- | --- |
| Dashboard | **Receivables** up by GH₵36,000; **Net profit (YTD)** up by GH₵30,000 (revenue, not the tax) |
| Customers → Adom Supermarket | Outstanding up by GH₵36,000; more of the credit limit used |
| Receivables ageing | GH₵36,000 more in **Current** (not yet due) for Adom |
| Tax | October's **output tax** up by GH₵6,000, due to GRA on 15 November |
| Income statement | Sales Revenue up by GH₵30,000 for October |
| Balance sheet | Accounts Receivable up GH₵36,000 (asset); VAT & Levies Payable up GH₵6,000 (liability); current earnings up GH₵30,000 (equity). 36,000 = 6,000 + 30,000, so the sheet still balances |
| Trial balance | Still **In balance** |
| General ledger | A new line on each of the three accounts, linking back to the invoice |

The same posted entry drives every report, so they cannot disagree.

## Step 3: Record the customer's payment

**Where:** open the invoice → **Record receipt**.

- Amount: GH₵20,000. Method: Mobile money. Deposited to: MTN MoMo Merchant Wallet. Reference: the MoMo transaction ID.

```
JE-2026-0356   5 Oct 2026   Receipt RCT-2026-0032 from Adom Supermarket Ltd for INV-2026-0044

Dr  1040 MTN MoMo Merchant Wallet   20,000.00   money arrived
    Cr  1100 Accounts Receivable                20,000.00   Adom owes less
```

The invoice is now **Part paid** with **GH₵16,000 outstanding**. Revenue does not change: it was earned when the goods were invoiced (accrual accounting, page 2). Cash & bank on the dashboard rises by GH₵20,000, and Receivables falls by the same amount.

If someone had tried to record GH₵40,000, the system would refuse, because that is more than the GH₵36,000 outstanding. (Customer prepayments and overpayments are a decision on page 14.)

The entry and document numbers in this example are the next ones the demo company would issue; yours may differ if you have already created records.

## Step 4: Some goods come back

Suppose 5 bags arrive damaged and Adom returns them.

**Where:** open the invoice → **Credit note**. Reason: "Damaged on delivery". Line: 5 bags at GH₵300, GH-STD.

```
Dr  4010 Sales Revenue                1,500.00   less income
Dr  2100 VAT & Levies Payable           300.00   less tax owed
    Cr  1100 Accounts Receivable                  1,800.00   Adom owes less
```

Outstanding drops to **GH₵14,200**. October's VAT falls by GH₵300 automatically. The original invoice is unchanged, and both documents remain visible and linked.

## Step 5: Reconcile the wallet

At month end the MoMo statement is imported in **Cash & Tax → Reconciliation**. It contains a line "MOMO IN ADOM SUPERMARKET 20,000.00". The system finds the receipt entry with the same amount within 7 days and shows it as **Suggested: JE-2026-0356**. Kofi clicks **Accept**. When every line is matched and the unexplained difference is **GH₵0.00**, he clicks **Complete reconciliation**.

The books and the telco now agree, and the audit trail shows who confirmed it.

## Step 6: Close the month

In November, Ama reviews October and **locks** it in **Fiscal periods**. From then on, nothing can be posted with an October date: not by people, imports or integrations. If an October mistake is found later, it is corrected with an entry in an open month, or by deliberately reopening October, which is itself recorded in the audit trail. Once the numbers are final, October is **closed**.

## The same sale from Store Management

If the rice had been sold over the counter at the Adum shop and recorded in **Trovesuite Store Management**, nobody in finance would type anything:

1. Store Management sends a `store.sale.completed` event: total 36,000, subtotal 30,000, tax 6,000, cost 22,500 (what the rice cost Kumasi Traders).
2. **Field mappings** translate its fields; the branch code becomes the Adum branch.
3. The **Store sale completed** posting rule produces the entry:

```
Dr  1040 MTN MoMo Merchant Wallet   36,000.00
    Cr  4010 Sales Revenue                      30,000.00
    Cr  2100 VAT & Levies Payable                6,000.00
Dr  5010 Cost of Goods Sold         22,500.00
    Cr  1200 Inventory                          22,500.00
```

4. The entry carries the Store Management sale ID, so anyone can trace it back to the till receipt.
5. The audit trail records it as done by the **integration**, not a person.

Notice the extra two lines: the store knows what the goods cost, so the entry also records the **cost of goods sold** and reduces **inventory**. Invoices created in Trovesuite do not do this yet, because the inventory module comes in a later phase (page 13).
