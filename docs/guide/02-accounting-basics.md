# 2. Accounting in plain language

_The ideas behind every screen, explained without jargon_

This page explains the handful of accounting ideas the whole product is built on. Once these make sense, every screen in the tour will too. The examples use the prototype's pretend company, **Kumasi Traders Ltd**, a food and household goods distributor with branches in Kumasi (head office), Accra and Takoradi. All amounts are in Ghana cedis (GH₵).

## Why businesses keep accounts

A business needs to answer a few questions reliably, at any time:

- How much money do we have, and where is it?
- Who owes us money, and who do we owe?
- Did we make a profit this month? This year?
- How much tax do we owe the Ghana Revenue Authority (GRA)?
- If an auditor or a bank asks, can we prove every number?

Accounting is the discipline of recording every money event in a consistent way so that those questions always have a correct, provable answer.

## Accounts: labelled jars

Picture the business's money as sitting in a set of **labelled jars**. Each jar is an **account**. There is a jar for "GCB Bank – Operating", a jar for "Money customers owe us", a jar for "Sales", a jar for "Rent", and so on. The full list of jars is called the **chart of accounts**. Kumasi Traders has 41.

Each account has a **code** (a number) and a **name**. The first digit of the code tells you which of the five kinds of account it is:

| Kind | Code range | What it means | Kumasi Traders examples |
| --- | --- | --- | --- |
| **Assets** | 1000s | Things the business owns or is owed | 1020 GCB Bank – Operating · 1040 MTN MoMo Merchant Wallet · 1100 Accounts Receivable · 1200 Inventory (stock) |
| **Liabilities** | 2000s | Things the business owes to others | 2010 Accounts Payable · 2100 VAT & Levies Payable · 2300 Bank Loan – Stanbic |
| **Equity** | 3000s | What belongs to the owners: money they put in plus profits kept in the business | 3100 Retained Earnings |
| **Revenue** (income) | 4000s | Money earned from selling | 4010 Sales Revenue |
| **Expenses** | 5000s–6000s | Costs of running the business | 5010 Cost of Goods Sold · 6120 Interest Expense · rent, salaries, electricity |

Assets, liabilities and equity describe **what the business has at a moment in time**. Revenue and expenses describe **what happened over a period**; their difference is the profit or loss.

## The golden rule: everything balances

The five kinds of account are tied together by one equation:

> **Assets = Liabilities + Equity**

In words: everything the business owns was paid for either with someone else's money (liabilities) or with the owners' money and kept profits (equity). Profit increases equity, so earning revenue makes the equation grow on both sides at once.

This equation must hold after every single transaction. The software enforces it.

## Double-entry: every movement has two sides

Because the equation must always balance, every money event changes **at least two accounts** by the same total. This is **double-entry bookkeeping**, and it is the reason accounting systems catch mistakes: if the two sides do not match, something was recorded wrongly.

Example: Kumasi Traders sells goods to a customer for GH₵1,000 plus GH₵200 of VAT, and the customer will pay later.

| Account | What happens | Amount |
| --- | --- | --- |
| 1100 Accounts Receivable | The customer now owes us (asset goes up) | 1,200 |
| 4010 Sales Revenue | We earned income | 1,000 |
| 2100 VAT & Levies Payable | We collected tax that belongs to GRA (liability goes up) | 200 |

The 1,200 on one side equals the 1,000 + 200 on the other side. Balanced.

## Debit and credit: just "left" and "right"

Accountants call the two sides **debit** (Dr, the left column) and **credit** (Cr, the right column). These words **do not mean good or bad**, and "credit" does not mean money coming in. They are simply the two columns, and the rule is that **total debits must equal total credits**.

Which column makes an account go up depends on its kind:

| Kind of account | A **debit** makes it… | A **credit** makes it… |
| --- | --- | --- |
| Assets | go up | go down |
| Expenses | go up | go down |
| Liabilities | go down | go up |
| Equity | go down | go up |
| Revenue | go down | go up |

So the sale above is written as:

```
Dr  1100 Accounts Receivable        1,200.00
    Cr  4010 Sales Revenue                      1,000.00
    Cr  2100 VAT & Levies Payable                 200.00
```

When the customer later pays into the bank:

```
Dr  1020 GCB Bank – Operating       1,200.00
    Cr  1100 Accounts Receivable                1,200.00
```

The bank went up (debit an asset), and what the customer owes went down to zero (credit an asset). Revenue is not touched again: the sale was already counted.

**You do not need to memorise this table.** In Trovesuite, people normally create invoices, bills and payments, and the system writes the debits and credits itself. Only accountants making manual adjustments type debits and credits directly.

## Journals, the ledger and the trial balance

- A **journal entry** (or just "journal") is one recorded money event, with its date, a description (the "memo") and its debit and credit lines. In Trovesuite every journal has a number like `JE-2026-0354`. A journal that does not balance cannot be posted.
- **Posting** means making a journal final, so that it counts in the books and reports. Before posting, a journal is a **draft** and changes nothing.
- The **general ledger** (GL) is every posted line, grouped by account. Viewing the ledger for one account is like reading the bank statement for one jar: opening balance, every movement in and out, closing balance.
- The **trial balance** lists the closing balance of every account in two columns, debit and credit. If the books are sound, the two column totals are equal. It is the accountant's first health check.

## Accrual accounting: record it when it happens, not when cash moves

Trovesuite follows **accrual accounting**, the standard for companies: revenue is recorded **when you invoice**, and costs **when you are billed**, not when the money changes hands. That is why the books need two special accounts:

- **Accounts Receivable (AR)**: money customers owe you. It goes up when you invoice and down when they pay.
- **Accounts Payable (AP)**: money you owe suppliers. It goes up when a supplier bills you and down when you pay.

| | Accounts Receivable (AR) | Accounts Payable (AP) |
| --- | --- | --- |
| Meaning | Money owed **to** you | Money **you** owe |
| The other party | Customer | Supplier |
| Document that creates it | Sales **invoice** | Supplier **bill** |
| Document that clears it | **Receipt** (customer payment) | **Payment** to the supplier |
| Kumasi Traders today | GH₵330,235.15 owed by 9 customers | GH₵287,672.22 owed to 7 suppliers |

AR and AP are **control accounts**: their balance is only ever changed through invoices, bills, receipts and payments, never by a manual journal. That guarantees the total in the account always equals the sum of the individual unpaid documents.

**Ageing** sorts unpaid documents by how late they are (not yet due, 1–30 days late, 31–60, 61–90, over 90). It shows who to chase first.

## Tax in Ghana: VAT and levies

When Kumasi Traders sells, it adds tax to the price and later pays that tax to GRA. When it buys, it pays tax to suppliers and can usually claim it back.

- **Output tax**: tax charged on sales. It is owed to GRA, so it is a liability (2100 VAT & Levies Payable).
- **Input tax**: tax paid on purchases that can be recovered. It is an asset (1400 VAT Input Recoverable).
- Each month the business pays GRA **output tax minus input tax**, by the 15th of the following month.

The prototype's standard tax code, **GH-STD (20%)**, combines VAT (15%), the NHIL levy (2.5%) and the GETFund levy (2.5%). Other codes are zero-rated, exempt, the 3% VAT flat-rate scheme for retailers, and 7.5% withholding tax on services. Each invoice line carries a tax code, so the system calculates tax per line.

**Withholding tax (WHT)** is different: a customer keeps back part of a payment and pays it to GRA on the supplier's behalf. The prototype lists the code but does not yet apply it (see page 14).

## Periods and closing the books

Accounting time is divided into **fiscal periods**, usually months, grouped into a **financial year** (Kumasi Traders' year runs January to December). Each month moves through three states:

| State | Meaning |
| --- | --- |
| **Open** | Anyone with permission can post into it |
| **Locked** | Under review; nothing can be posted, but it can be reopened |
| **Closed** | Final; the numbers have been reported |

At the end of the year, a **year-end close** moves the year's profit or loss into Retained Earnings and resets the revenue and expense accounts to zero for the new year, just as a scoreboard resets for a new season while the league table keeps the result.

## Mistakes are corrected, never erased

In accounting, posted entries are **never edited or deleted**. Think of a paper ledger written in pen: to fix a mistake you write a new entry that cancels it (a **reversal**: the same lines with debit and credit swapped) and then write the correct entry. The original stays visible. This is what makes the books auditable, and Trovesuite enforces it.

The same idea applies to documents: an approved invoice is **voided** (which posts a reversal), or reduced with a **credit note**. It is never deleted.

## Approvals: maker and checker

For important entries, one person prepares (the **maker**) and a different person approves (the **checker**). This **segregation of duties** stops one person from moving money on their own. In the prototype, manual journals of GH₵50,000 or more need approval, and the approver cannot be the person who created the entry.

## Several currencies

Kumasi Traders reports in Ghana cedis (its **base currency**), but it sells to customers in Togo (euros) and buys from China (US dollars).

- Each foreign document is recorded at the exchange rate **on the day it was issued** (the "booked rate").
- When it is paid, the rate has usually moved. The difference is a **realised exchange gain or loss**, recorded at payment. For example, paying a US$4,000 bill cost GH₵475.60 more than when the bill was booked.
- At each month end, unpaid foreign balances are restated at the month-end rate so the balance sheet shows what they are worth today. That difference is an **unrealised** gain or loss (a **revaluation**). It is reversed on the first day of the next month, because it is only an estimate until the money moves.

## Bank reconciliation: does the bank agree with us?

Every month the business compares its own record of each bank account with the **bank statement** from the bank. Differences have ordinary causes: a cheque written but not yet cashed, bank charges nobody has recorded yet, a customer who paid without telling us. **Reconciliation** matches each statement line to an entry in the books, records whatever is missing, and confirms that the unexplained difference is zero.

## The financial reports

| Report | Plain meaning | Analogy |
| --- | --- | --- |
| **Income statement** (profit and loss, P&L) | Revenue minus expenses over a period: did we make money? | A film of the period |
| **Balance sheet** (statement of financial position) | Assets, liabilities and equity on one date: what do we own and owe? | A photograph on one day |
| **Cash flow statement** | Where cash came from and where it went | A bank statement for the whole business |
| **Trial balance** | Every account's balance, debits against credits | The accountant's checksum |
| **General ledger** | Every movement on one account | A statement for one jar |
| **AR and AP ageing** | Unpaid documents by lateness | The "chase list" |
| **Customer and supplier statements** | Everything with one customer or supplier and what is still due | The letter you send asking to be paid |

All of them are **calculated from the posted journals**, so they always agree with each other. Nobody types a figure into a report.

## Dimensions: slicing the numbers

Besides the account, each line can be tagged with **dimensions**: which legal entity, branch, department, cost centre or project it belongs to. Kumasi Traders has two legal entities (the trading company and KT Microfinance), three branches, five departments, four cost centres and two projects. Dimensions let management ask "how much did the Accra branch make?" without creating separate accounts for every branch.
