import type { IconType } from "react-icons";
import type { Alignment, Side } from "driver.js";
import {
  FiBookOpen,
  FiCalendar,
  FiCompass,
  FiDatabase,
  FiFileText,
  FiGlobe,
  FiRefreshCw,
  FiRepeat,
  FiSliders,
  FiUsers,
} from "react-icons/fi";

export type TourCategory = "Getting started" | "Daily work" | "Month end" | "Setup";

export const TOUR_CATEGORIES: TourCategory[] = ["Getting started", "Daily work", "Month end", "Setup"];

export interface TourStep {
  /**
   * What to spotlight. A bare name matches `data-tour="name"`, `nav:/path` a sidebar link,
   * `group:Sales` a sidebar section, `tab:ID` a tab button; anything else is a CSS selector.
   * Leave empty for a centred card.
   */
  target?: string;
  /** Page the step lives on. Defaults to the tour's route. */
  route?: string;
  /** Tab to select (by `data-tour-tab`) before the step is shown. */
  tab?: string;
  title: string;
  /** Trusted HTML from this file only. */
  body: string;
  side?: Side;
  align?: Alignment;
}

export interface Tour {
  id: string;
  title: string;
  summary: string;
  category: TourCategory;
  icon: IconType;
  route: string;
  steps: TourStep[];
}

const p = (...lines: string[]) => lines.map((l) => `<p>${l}</p>`).join("");
const list = (...items: string[]) => `<ul>${items.map((i) => `<li>${i}</li>`).join("")}</ul>`;
const tip = (text: string) => `<div class="tvs-tour-tip"><strong>Tip</strong><span>${text}</span></div>`;

export const TOURS: Tour[] = [
  {
    id: "welcome",
    title: "Welcome to Trovesuite Accounting",
    summary: "Find your way around: navigation, scope, the current period and the dashboard.",
    category: "Getting started",
    icon: FiCompass,
    route: "/dashboard",
    steps: [
      {
        title: "Welcome to Trovesuite Accounting",
        body:
          p(
            "One general ledger for the whole business. Sales from Store Management, loans from LoanDrift, payroll from ZelosHR and anything you import all post here as balanced journals.",
            "This tour covers:",
          ) +
          list("Where everything lives", "What the header controls do", "How to read the dashboard", "Where to find more tours") +
          tip("Press <kbd>Esc</kbd> to leave at any time. Nothing you click during a tour changes your data."),
      },
      {
        target: "sidebar",
        side: "right",
        title: "The menu follows the accounting cycle",
        body: p(
          "Sections run from recording transactions (Sales, Purchases, Cash &amp; Tax) through to the ledger (Accounting), reporting (Insights) and setup (Integrations, System).",
          "Numbered badges show work waiting for you, such as journals awaiting approval or bank lines to reconcile.",
        ),
      },
      {
        target: "group:Accounting",
        side: "right",
        title: "Accounting",
        body:
          p("The ledger itself.") +
          list(
            "<b>Chart of Accounts</b>: the accounts everything posts to",
            "<b>Journals</b>: every entry, with maker-checker approval",
            "<b>General Ledger</b> and <b>Trial Balance</b>: balances by account",
            "<b>Currency Revaluation</b> and <b>Fiscal Periods</b>: month-end controls",
          ),
      },
      {
        target: "group:Sales",
        side: "right",
        title: "Sales and Purchases",
        body: p(
          "Customers, invoices and receipts on the sales side; suppliers, bills and payments on the purchase side.",
          "Approving an invoice or bill posts it to the ledger straight away, so receivables and payables are always up to date.",
        ),
      },
      {
        target: "group:Integrations",
        side: "right",
        title: "Integrations",
        body: p(
          "Connected Trovesuite apps, imports from other accounting systems, field mappings and the posting rules that turn business events into journals.",
        ),
      },
      {
        target: "global-search",
        title: "Search this page",
        body: p("Filters whatever list you are looking at: invoices, journals, customers and so on. It also searches custom field values."),
      },
      {
        target: "entity-switcher",
        align: "end",
        title: "Legal entity and branch",
        body: p("Choose which company and branch you are looking at. Reports, lists and the dashboard follow this scope."),
      },
      {
        target: "period-pill",
        align: "end",
        title: "The current period",
        body: p(
          "Shows the month you are posting into and whether it is open. Locked and closed months reject new entries, so last month's numbers cannot change after you sign them off.",
        ),
      },
      {
        target: "user-menu",
        align: "end",
        title: "Your account",
        body:
          p("See who you are signed in as.") +
          tip("In this demo you can switch user to try maker-checker: post a large journal as one person and approve it as another. <b>Reset demo data</b> restores the starting figures."),
      },
      {
        target: "stats",
        title: "Your position at a glance",
        body: p(
          "Cash, money owed to you, money you owe and profit for the year, all calculated live from posted journals.",
          "Hover the <b>(i)</b> next to a figure to see exactly what it includes.",
        ),
      },
      {
        target: "attention",
        title: "Needs attention",
        body: p("Your work queue: overdue invoices, journals waiting for approval, unreconciled bank lines and imports to review. Each item links to the list it refers to."),
      },
      {
        target: "integration-health",
        title: "Integration health",
        body: p("Shows whether each connected system is sending data and whether any records were held back for review."),
      },
      {
        target: "page-actions",
        align: "end",
        title: "Quick actions",
        body: p("Start a journal entry or an invoice from here without leaving the dashboard."),
      },
      {
        target: "help-button",
        align: "end",
        title: "Tours are always here",
        body:
          p("Open this any time for step-by-step tours of invoices, journals, bank reconciliation, currencies, custom fields and month-end close.") +
          tip("Press <kbd>?</kbd> anywhere to open the tour list. A dot appears on this button when the page you are on has a tour you haven't taken."),
      },
    ],
  },

  {
    id: "invoices",
    title: "Sales invoices",
    summary: "Raise invoices in any currency, take receipts and follow each invoice to the ledger.",
    category: "Daily work",
    icon: FiFileText,
    route: "/sales/invoices",
    steps: [
      {
        target: "page-header",
        title: "Sales invoices",
        body: p(
          "Every credit sale to a customer. When an invoice is approved it posts Accounts Receivable, revenue and output VAT in one balanced entry. You never write that journal yourself.",
        ),
      },
      {
        target: "stats",
        title: "What's owed",
        body: p("Outstanding and overdue balances, what falls due this week and what you have collected this month. Foreign-currency invoices are counted in GH₵ at the rate they were booked at."),
      },
      {
        target: "doc-new",
        align: "end",
        title: "Create an invoice",
        body:
          list(
            "Pick the customer. Their default currency and payment terms fill in automatically",
            "For foreign currency, the day's Bank of Ghana rate is suggested. You can override it, and you get a warning if it is far from the reference rate",
            "Add lines with a revenue account and tax code, plus any custom fields your team uses",
          ) +
          p("<b>Save draft</b> keeps it off the ledger. <b>Approve &amp; post</b> posts it."),
      },
      {
        target: "doc-pay",
        align: "end",
        title: "Record a receipt",
        body:
          p("Choose the invoice, the bank account the money went into and the amount. Part payments are fine.") +
          tip("If a US$ invoice is paid at a different rate from the one it was booked at, the realised exchange gain or loss is calculated and posted for you."),
      },
      {
        target: "tab-strip",
        title: "Filter by status",
        body: p("Draft, open, part paid, overdue, paid and void. Counts update as invoices move through their life."),
      },
      {
        target: "tab-filters",
        align: "end",
        title: "Currency and custom field filters",
        body: p("Narrow the list to one currency, or by any dropdown or yes/no custom field marked <b>Show in lists</b>, such as delivery route."),
      },
      {
        target: "table",
        side: "top",
        title: "Open any invoice",
        body: p(
          "Click a row to see its lines, payments, exchange differences and the exact journal it posted. From there you can record a payment, void it (which posts a reversal) or correct its custom fields.",
        ),
      },
      {
        target: "export",
        align: "end",
        title: "Export",
        body:
          p("Download the filtered list as CSV, including currency, rate, GH₵ totals and every custom field.") +
          tip("Supplier bills under <b>Purchases</b> work exactly the same way."),
      },
    ],
  },

  {
    id: "customers",
    title: "Customers and suppliers",
    summary: "Keep customer details, payment terms, default currency and balances in one place.",
    category: "Daily work",
    icon: FiUsers,
    route: "/sales/customers",
    steps: [
      {
        target: "page-header",
        title: "Customers",
        body: p("Everyone you sell to on credit. Balances here come from approved invoices and receipts, so they always agree with Accounts Receivable."),
      },
      {
        target: "stats",
        title: "Who owes what",
        body: p("Active customers, total owed, overdue balances, and how many came from other systems such as Store Management or QuickBooks."),
      },
      {
        target: "page-actions",
        align: "end",
        title: "Add a customer",
        body: list(
          "Contact details and TIN (Ghana Revenue Authority taxpayer number)",
          "<b>Payment terms</b>: sets the due date on new invoices",
          "<b>Default currency</b>: new invoices for this customer start in it",
          "Any custom fields your team has set up, such as sales region",
        ),
      },
      {
        target: "tabs",
        title: "Status and custom filters",
        body: p("Active, with a balance, overdue or inactive. Filter further by custom fields such as sales region or key account."),
      },
      {
        target: "table",
        side: "top",
        title: "Customer details",
        body:
          p("Click a customer to see their balance, contact details, custom fields and recent documents in their own currency.") +
          tip("Suppliers under <b>Purchases</b> have the same layout."),
      },
    ],
  },

  {
    id: "journals",
    title: "Journals and approvals",
    summary: "Post manual entries, approve large ones and trace integration postings.",
    category: "Daily work",
    icon: FiBookOpen,
    route: "/accounting/journals",
    steps: [
      {
        target: "page-header",
        title: "Every entry in one place",
        body: p("Manual journals, entries generated by invoices and payments, and postings from connected systems all appear here."),
      },
      {
        target: "stats",
        title: "Maker-checker",
        body: p(
          "Manual entries at or above the approval threshold need a second person to approve them before they reach the ledger. <b>Awaiting approval</b> shows how many are waiting.",
        ),
      },
      {
        target: "journal-new",
        align: "end",
        title: "Create a journal",
        body:
          list(
            "Add debit and credit lines. The entry must balance before it can be posted",
            "Tag lines with branch or other dimensions for reporting",
            "Lines on a foreign-currency bank account also need the amount in that currency",
          ) +
          p("Save it as a draft, or submit it to post (or to go for approval)."),
      },
      {
        target: "tab-strip",
        title: "Drafts, approvals and reversals",
        body:
          p("Use <b>Awaiting approval</b> as the approver's inbox. Posted entries are never edited; you reverse them instead, so the history stays intact.") +
          tip("Switch user from the top-right menu to approve an entry someone else made."),
      },
      {
        target: "tab-filters",
        align: "end",
        title: "Find the entry you need",
        body: p("Filter by source (manual, Store, LoanDrift, ZelosHR, imports, FX revaluation), by date range or by custom field."),
      },
      {
        target: "table",
        side: "top",
        title: "Open a journal",
        body: p("See every line, the document or system it came from, who created and approved it, and the reversal if there is one."),
      },
    ],
  },

  {
    id: "reconciliation",
    title: "Bank reconciliation",
    summary: "Match statement lines to the ledger and explain every difference.",
    category: "Month end",
    icon: FiRepeat,
    route: "/banking/reconciliation",
    steps: [
      {
        target: "page-header",
        title: "Bank reconciliation",
        body: p("Prove that the ledger agrees with the bank. Each statement line is matched to a ledger entry, or posted from here if it is new, such as a bank charge."),
      },
      {
        target: "rec-bank",
        align: "end",
        title: "Choose the account",
        body: p("Each bank, mobile money and cash account is reconciled separately against its own statement."),
      },
      {
        target: "rec-summary",
        title: "The reconciliation",
        body: p(
          "Starts from the ledger balance, adjusts for items not yet on the statement and lines not yet matched, and compares the result with the statement balance.",
          "You are done when <b>Unexplained difference</b> reaches zero.",
        ),
      },
      {
        target: "rec-transit",
        side: "left",
        title: "Not yet on the statement",
        body: p("Cheques and transfers already in the ledger that the bank hasn't processed yet. Watch for old items here."),
      },
      {
        target: "tab-strip",
        title: "Lines to review",
        body: p("Suggested matches are found by amount, date and reference. Accept them one by one, or all at once with <b>Accept all suggestions</b>."),
      },
      {
        target: "rec-lines",
        side: "top",
        title: "Match or post each line",
        body: p("For each line, accept the suggestion, use <b>Find match</b> to pick a different ledger entry, or post a new entry for charges, interest or deposits that aren't in the ledger yet."),
      },
      {
        target: "rec-complete",
        align: "end",
        title: "Complete it",
        body: p("Once every line is matched, complete the reconciliation. The date and the person who did it are recorded in the audit trail."),
      },
    ],
  },

  {
    id: "revaluation",
    title: "Month-end currency revaluation",
    summary: "Restate open foreign balances at the month-end rate, reversed automatically next month.",
    category: "Month end",
    icon: FiRefreshCw,
    route: "/accounting/revaluation",
    steps: [
      {
        target: "page-header",
        title: "Why revalue?",
        body: p(
          "A US$ invoice booked at 12.50 is worth more in cedis if the rate rises to 13.00. Revaluation updates the balance sheet to month-end rates so it shows what foreign balances are worth today.",
        ),
      },
      {
        target: "stats",
        title: "What's exposed",
        body: p("Open foreign receivables, payables and bank balances at the rates they were booked at, plus the unrealised gain or loss at the selected month end."),
      },
      {
        target: "reval-periods",
        side: "right",
        title: "Pick a month end",
        body: p("A tick means that month has been revalued. Locked or closed months can't be revalued until they are reopened."),
      },
      {
        target: "reval-rates",
        side: "right",
        title: "Closing rates",
        body: p("The rate on or before the month-end date for each currency. If a rate is missing, record it under Settings → Currencies first."),
      },
      {
        target: "reval-preview",
        side: "top",
        title: "Line-by-line preview",
        body: p("Every open invoice, bill and foreign bank balance, showing its booked cedi value, value at the closing rate and the difference."),
      },
      {
        target: "reval-post",
        align: "end",
        title: "Post it",
        body:
          p("Posts one journal dated the last day of the month to your unrealised gain/loss account, and its reversal on the first day of the next month.") +
          tip("The reversal means that when the invoice is finally paid, the realised gain or loss is still measured against the original booked rate, so nothing is counted twice."),
      },
      {
        target: "reval-history",
        side: "top",
        title: "History",
        body: p("Each revaluation, who posted it and links to both journals."),
      },
    ],
  },

  {
    id: "month-end",
    title: "Month-end close",
    summary: "A walk through the close checklist, page by page, from reconciliation to locking the month.",
    category: "Month end",
    icon: FiCalendar,
    route: "/dashboard",
    steps: [
      {
        title: "Closing the month",
        body:
          p("A clean close follows the same order every month. This tour takes you to each page in turn:") +
          list(
            "Reconcile every bank account",
            "Clear journals awaiting approval and old drafts",
            "Revalue foreign-currency balances",
            "Check the trial balance",
            "Lock the month, review, then close it",
            "Run the reports",
          ),
      },
      {
        route: "/banking/reconciliation",
        target: "rec-summary",
        title: "1. Reconcile the banks",
        body: p("For each account, match every statement line until the unexplained difference is zero, then complete the reconciliation."),
      },
      {
        route: "/accounting/journals",
        target: "tab-strip",
        tab: "PENDING_APPROVAL",
        title: "2. Clear approvals and drafts",
        body: p("Anything awaiting approval isn't in the ledger yet. Approve or reject it, and post or delete old drafts, so nothing for the month is left out."),
      },
      {
        route: "/accounting/revaluation",
        target: "reval-periods",
        side: "right",
        title: "3. Revalue foreign balances",
        body: p("Choose the month end and post the revaluation. It reverses itself on the 1st, so it is safe to run once the rates are in."),
      },
      {
        route: "/accounting/trial-balance",
        target: "tb-status",
        title: "4. Check the trial balance",
        body: p("Debits must equal credits. Scan for balances in unexpected places, such as a credit balance on a bank account or suspense accounts that aren't zero."),
      },
      {
        route: "/accounting/periods",
        target: "periods-table",
        side: "top",
        title: "5. Lock, then close",
        body: p(
          "<b>Lock</b> the month while you review: nothing more can be posted into it. When the numbers are final, <b>close</b> it.",
          "Reopening is allowed but recorded in the audit trail.",
        ),
      },
      {
        route: "/accounting/periods",
        target: "period-locks",
        title: "Enforce locks",
        body: p("With this on, every route into the ledger respects period locks: manual entries, documents, integrations and imports."),
      },
      {
        route: "/reports",
        target: "report-group",
        title: "6. Run the reports",
        body:
          p("Balance sheet, income statement, cash flow and ageing reports are all calculated live from the ledger, so they agree with each other.") +
          tip("Every report can be printed or exported to CSV."),
      },
    ],
  },

  {
    id: "currencies",
    title: "Currencies and exchange rates",
    summary: "Turn on currencies, keep daily rates and choose where exchange differences post.",
    category: "Setup",
    icon: FiGlobe,
    route: "/settings",
    steps: [
      {
        target: "tab-strip",
        tab: "CURRENCIES",
        title: "Currency settings",
        body: p("Everything about foreign currency lives on this tab: which currencies you use, their rates and how exchange differences are posted."),
      },
      {
        target: "fx-base",
        tab: "CURRENCIES",
        side: "right",
        title: "Base currency",
        body: p("The ledger, reports and tax returns are all in GH₵. Foreign documents keep their own currency but post in cedis at their exchange rate."),
      },
      {
        target: "fx-reference",
        tab: "CURRENCIES",
        title: "Daily reference rates",
        body:
          p("Today's rate for each active currency. New documents suggest this rate automatically.") +
          tip("<b>Fetch Bank of Ghana rates</b> pulls the day's rates in one click. In production this runs every morning."),
      },
      {
        target: "fx-currencies",
        tab: "CURRENCIES",
        side: "top",
        title: "Your currencies",
        body: p(
          "Latest rate, 30-day movement and how much is open in each currency across invoices, bills and bank accounts.",
          "Click a row to see its rate history. Switch a currency off to hide it from new documents; existing documents keep it.",
        ),
      },
      {
        target: "fx-add",
        tab: "CURRENCIES",
        align: "end",
        title: "Add a currency",
        body: p("Enter the ISO code, name, symbol and, optionally, today's rate."),
      },
      {
        target: "fx-history",
        tab: "CURRENCIES",
        side: "top",
        title: "Rate history",
        body: p("A chart and table of every rate. Record a rate by hand for a specific date, for example a negotiated bank rate. Documents always keep the rate they were posted at."),
      },
      {
        target: "fx-posting",
        tab: "CURRENCIES",
        side: "top",
        title: "Exchange differences",
        body: list(
          "<b>Realised</b>: posted when a foreign document is paid at a different rate",
          "<b>Unrealised</b>: posted by month-end revaluation and reversed the next day",
          "<b>Rate tolerance</b>: warns when someone types a rate too far from the reference",
        ),
      },
    ],
  },

  {
    id: "custom-fields",
    title: "Custom fields",
    summary: "Capture your own information on customers, documents, journals and accounts.",
    category: "Setup",
    icon: FiSliders,
    route: "/settings",
    steps: [
      {
        target: "cf-intro",
        tab: "FIELDS",
        title: "Your own fields",
        body: p(
          "Add the details your business tracks, such as sales region, delivery route or PO number, without waiting for a software change.",
          "Custom fields never change how an entry posts, so they can still be corrected after approval.",
        ),
      },
      {
        target: "cf-entities",
        tab: "FIELDS",
        title: "Where fields can go",
        body: p("Customers, suppliers, invoices, bills, journals and accounts each have their own set. The number shows active fields."),
      },
      {
        target: "cf-new",
        tab: "FIELDS",
        align: "end",
        title: "Create a field",
        body:
          list(
            "Types: short or long text, number, date, dropdown and yes/no",
            "Help text and a default value",
            "<b>Required</b> to make it mandatory, <b>Show in lists</b> to add it as a column and filter",
            "<b>Source reference</b> scope for IDs from another system",
          ) + p("A live preview shows exactly how the field will look on the form."),
      },
      {
        target: "cf-table",
        tab: "FIELDS",
        side: "top",
        title: "Manage fields safely",
        body:
          p("Reorder with the arrows; forms follow the same order. <b>Used on</b> shows how many records hold a value.") +
          list(
            "The type locks once a field is in use",
            "Deactivating hides a field from forms but keeps its values",
            "Delete is only possible while a field is unused and not mapped from an integration",
          ),
      },
      {
        route: "/sales/invoices",
        target: "tab-filters",
        align: "end",
        title: "Fields show up across the app",
        body: p("Fields marked <b>Show in lists</b> become filters here and columns in the table. Every field appears on the form, the detail drawer and CSV exports."),
      },
    ],
  },

  {
    id: "integrations",
    title: "Integrations and imports",
    summary: "See how connected apps and file imports flow into the ledger, and fix held records.",
    category: "Setup",
    icon: FiDatabase,
    route: "/integrations/sources",
    steps: [
      {
        target: "page-header",
        title: "Data sources",
        body: p("Trovesuite apps, other accounting systems, bank feeds and file uploads. Each one goes through the same validation and posting rules."),
      },
      {
        target: "stats",
        title: "Health at a glance",
        body: p("How many sources are connected, how many records have arrived, and how many were held back because they failed validation."),
      },
      {
        target: "sources-grid",
        side: "top",
        title: "Each connection",
        body: p("Status, last sync and volume. <b>Sync now</b> pulls the latest records; <b>Details</b> shows errors and lets you reconnect or disconnect."),
      },
      {
        route: "/integrations/imports",
        target: "page-actions",
        align: "end",
        title: "Import files and migrate",
        body: p("Upload a CSV file or pull history from another accounting system. Every row is checked before anything posts."),
      },
      {
        route: "/integrations/imports",
        target: "table",
        side: "top",
        title: "Review batches",
        body: p("Every batch shows rows posted and rows held. Open a batch to fix held rows and post them, so every row stays traceable to its source file."),
      },
      {
        route: "/integrations/mappings",
        target: "page-header",
        title: "Field mappings",
        body: p("Translate each source's fields into Trovesuite's: for example, map Store's <code>branch_code</code> to the Branch dimension, or into a custom field."),
      },
      {
        route: "/integrations/rules",
        target: "page-header",
        title: "Posting rules",
        body: p("Each business event, such as a POS sale, loan disbursement or payroll run, becomes a balanced journal through a rule. Rules are versioned and audited."),
      },
    ],
  },
];

export const tourById = (id: string) => TOURS.find((t) => t.id === id);

export const selectorFor = (target: string) => {
  if (target.startsWith("nav:")) return `[data-nav="${target.slice(4)}"]`;
  if (target.startsWith("group:")) return `[data-nav-group="${target.slice(6)}"]`;
  if (target.startsWith("tab:")) return `[data-tour-tab="${target.slice(4)}"]`;
  if (/^[a-z][a-z0-9-]*$/.test(target)) return `[data-tour="${target}"]`;
  return target;
};
