# 15. Glossary

_Every accounting and product term used in this guide, A to Z_

| Term | Meaning |
| --- | --- |
| **Accounts Payable (AP)** | Money the business owes suppliers. Goes up when a bill is approved, down when it is paid |
| **Accounts Receivable (AR)** | Money customers owe the business. Goes up when an invoice is approved, down when it is paid |
| **Accrual accounting** | Recording income when it is earned (invoiced) and costs when they are incurred (billed), not when cash moves |
| **Account** | One labelled "jar" in the books, such as GCB Bank or Sales Revenue, identified by a code |
| **Ageing** | Unpaid invoices or bills grouped by how late they are: current, 1–30, 31–60, 61–90, 90+ days |
| **API** | The set of functions the server offers to the screens ("give me the trial balance"). The prototype's API is specified in 135 endpoints |
| **Approval limit** | The amount at or above which a manual journal needs a second person to approve it |
| **Asset** | Something the business owns or is owed: cash, stock, equipment, receivables |
| **Audit trail** | The permanent, append-only record of who did what, when and through which channel |
| **Backend** | The server and database that store the data and enforce the rules; being built next |
| **Balance sheet** | A report of assets, liabilities and equity on one date. Assets always equal liabilities plus equity |
| **Bank reconciliation** | Matching the bank statement to the books line by line until the unexplained difference is zero |
| **Base currency** | The currency the books are kept in (GH₵ for Ghanaian companies) |
| **Bill** | A supplier's invoice to us. Creates Accounts Payable |
| **Booked rate** | The exchange rate recorded on a foreign-currency document when it was issued |
| **Canonical model** | Trovesuite's own standard format for customers, invoices, payments and so on, into which every outside system is translated |
| **Cash flow statement** | A report of where cash came from and went, grouped into operating, investing and financing activities |
| **Chart of accounts** | The full list of accounts a business uses |
| **Control account** | An account (Receivable, Payable) that only documents may change, so it always equals the sum of the unpaid documents |
| **Conversion date** | The day a company starts keeping its books in Trovesuite; opening balances are entered as at this date |
| **Cost centre** | A dimension for grouping costs by area of responsibility, such as Retail or Head Office |
| **Cost of goods sold (COGS)** | What the goods that were sold cost the business; an expense recorded when they are sold |
| **Credit (Cr)** | The right-hand column of an entry. Increases liabilities, equity and revenue; decreases assets and expenses |
| **Credit note** | A document reducing what a customer owes on an invoice (returns, corrections, discounts) |
| **Custom field** | An extra field a company adds to customers, invoices and other records, such as "Sales region" |
| **Data source** | A connected system that sends data in: a Trovesuite app, another accounting system, a bank, a file or a till |
| **Debit (Dr)** | The left-hand column of an entry. Increases assets and expenses; decreases liabilities, equity and revenue |
| **Dimension** | A tag on entry lines for reporting: legal entity, branch, department, cost centre or project |
| **Double-entry bookkeeping** | Recording every movement in at least two accounts, with total debits equal to total credits |
| **Draft** | Saved but not posted; not in the books, so it can still be changed |
| **Drill down** | Clicking a figure in a report to see the entries behind it |
| **Equity** | What belongs to the owners: capital put in plus profits kept in the business |
| **Exchange gain or loss** | The change in cedi value of a foreign-currency amount between booking and payment (realised) or month end (unrealised) |
| **Expense** | A cost of running the business, such as rent, salaries or electricity |
| **Field mapping** | The rule saying which field in an outside system corresponds to which Trovesuite field |
| **Financial year (fiscal year)** | The company's twelve-month accounting year; Kumasi Traders' runs January to December |
| **Fiscal period** | One accounting month; open, locked or closed |
| **Frontend** | The screens people use in the browser; the prototype in this guide |
| **GETFund levy, NHIL** | Ghanaian levies charged with VAT (2.5% each), included in the 20% standard rate |
| **General ledger (GL)** | Every posted movement, grouped by account, with running balances |
| **GRA** | Ghana Revenue Authority, which collects VAT, levies and withholding tax |
| **Gross profit** | Revenue minus the cost of goods sold, before operating expenses |
| **Import batch** | A group of records brought in together from a file or source, checked row by row |
| **Income statement (profit and loss, P&L)** | A report of revenue minus expenses over a period, giving net profit or loss |
| **Input tax (input VAT)** | VAT paid on purchases that can be reclaimed; an asset |
| **Integration** | An automatic connection that sends data from another system into Trovesuite |
| **Inventory** | Goods held for sale; an asset until sold |
| **Invoice** | A bill sent to a customer. Creates Accounts Receivable and revenue |
| **Journal entry (journal)** | One recorded money event with balanced debit and credit lines, numbered like `JE-2026-0354` |
| **Legal entity** | A registered company. A group may have several, such as Kumasi Traders Ltd and KT Microfinance Ltd |
| **Liability** | Something the business owes: supplier balances, tax, loans |
| **Locked period** | A month under review; nothing can be posted into it until it is reopened |
| **Maker-checker** | One person prepares, a different person approves |
| **Memo** | The description on a journal entry |
| **Mock backend** | A stand-in server running in the browser with the real rules and pretend data, used until the real backend exists |
| **Net profit** | What is left after all expenses are taken from revenue |
| **Opening Balance Equity** | A temporary account that balances opening balances while they are being entered; should end at zero |
| **Opening balances** | What a company owned, owed and was owed on its conversion date |
| **Output tax (output VAT)** | VAT charged on sales and owed to GRA; a liability |
| **Overdue** | Past its due date and not fully paid |
| **Payment terms** | How many days a customer has to pay, or we have to pay a supplier |
| **Post / posting** | Making an entry final so that it counts in the books and reports |
| **Posting rule (accounting rule)** | A template saying how an outside event, such as a store sale, becomes a balanced journal |
| **Prototype** | The working frontend described in this guide, running on pretend data |
| **Receipt** | Money received from a customer against an invoice |
| **Retained earnings** | Profits from past years kept in the business; part of equity |
| **Revaluation** | Restating unpaid foreign-currency balances at the month-end rate; reversed the next day |
| **Revenue (income)** | Money earned from selling goods or services |
| **Reversal** | A new entry with debits and credits swapped that cancels a posted entry; both stay visible |
| **Segregation of duties** | Splitting a task between people so that nobody controls it alone |
| **Source reference** | The ID a record has in the system it came from, kept so it can be traced back |
| **Statement of account** | A document listing everything with one customer or supplier and the balance due |
| **Supplier credit** | A credit note received from a supplier, reducing what we owe on a bill |
| **Tax code** | The tax treatment of an invoice or bill line, such as standard rated (20%), zero rated or exempt |
| **Tenant** | One customer company in the cloud system; tenants never see each other's data |
| **TIN** | Taxpayer identification number |
| **Trial balance** | Every account's balance in debit and credit columns; the totals must agree |
| **Unrealised gain or loss** | An estimated exchange difference on amounts not yet paid, from revaluation |
| **VAT** | Value added tax: charged on sales, reclaimed on purchases, and the difference paid to GRA monthly |
| **Void** | Cancelling an approved document by posting a reversal; the document stays visible, marked Void |
| **Withholding tax (WHT)** | Tax a payer deducts from a payment and pays to GRA on the recipient's behalf |
| **Year-end close** | Moving the year's profit or loss into retained earnings and starting the new year's income and expenses at zero |
| **YTD (year to date)** | From the start of the financial year until today |
