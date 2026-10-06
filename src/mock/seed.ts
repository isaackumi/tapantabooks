import type {
  Account,
  AccountType,
  AccountingRule,
  AuditEvent,
  AuditFields,
  BankAccount,
  BankStatementLine,
  CurrentUser,
  Currency,
  CustomField,
  Customer,
  DataSource,
  Dimension,
  DocumentLine,
  ExchangeRate,
  FieldMapping,
  FiscalPeriod,
  FxRevaluation,
  ImportBatch,
  JournalEntry,
  JournalStatus,
  OrgSettings,
  Payment,
  PaymentMethod,
  PurchaseBill,
  SalesInvoice,
  SourceRef,
  SourceType,
  Supplier,
  TaxCode,
} from "@/models/accounting";
import { documentTotals } from "@/lib/documents";
import { accountBalances, carryingBaseFor, documentJournalLines, rateOn, settlementLines, toBase, type FxLine } from "@/lib/fx";
import { round2 } from "@/utils/format";
import { addDays, DEMO_TODAY } from "@/utils/dates";

// ---------------------------------------------------------------------------
// Actors
// ---------------------------------------------------------------------------

export const USERS = {
  ama: {
    id: "usr_ama",
    name: "Ama Mensah",
    email: "ama.mensah@kumasitraders.com.gh",
    role: "Finance Manager",
  },
  kofi: {
    id: "usr_kofi",
    name: "Kofi Boateng",
    email: "kofi.boateng@kumasitraders.com.gh",
    role: "Senior Accountant",
  },
  efua: {
    id: "usr_efua",
    name: "Efua Owusu",
    email: "efua.owusu@kumasitraders.com.gh",
    role: "Accounts Officer",
  },
} satisfies Record<string, CurrentUser>;

export const CURRENT_USER: CurrentUser = USERS.ama;

type Actor = { id: string; name: string };
const INTEGRATION: Actor = { id: "svc_integrations", name: "Trovesuite Integrations" };
const SYSTEM: Actor = { id: "svc_posting_engine", name: "Posting Engine" };

const pad = (n: number) => String(n).padStart(2, "0");
const ts = (date: string, hour = 9, minute = 0) => `${date}T${pad(hour)}:${pad(minute)}:00.000Z`;

export const stamp = (at: string, by: Actor): AuditFields => ({
  created_at: at,
  updated_at: at,
  created_by_id: by.id,
  updated_by_id: by.id,
  created_by: by.name,
  updated_by: by.name,
});

const mulberry32 = (seed: number) => () => {
  let t = (seed += 0x6d2b79f5);
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};

// ---------------------------------------------------------------------------
// Chart of accounts
// ---------------------------------------------------------------------------

export const ACC = {
  cash: "acc_1010",
  gcb: "acc_1020",
  eco: "acc_1030",
  momo: "acc_1040",
  usd: "acc_1050",
  ar: "acc_1100",
  loans: "acc_1150",
  inventory: "acc_1200",
  prepaid: "acc_1300",
  vatIn: "acc_1400",
  ppe: "acc_1500",
  accDep: "acc_1510",
  ap: "acc_2010",
  vatOut: "acc_2100",
  wht: "acc_2120",
  paye: "acc_2150",
  ssnit: "acc_2160",
  accrued: "acc_2200",
  bankLoan: "acc_2300",
  capital: "acc_3010",
  retained: "acc_3100",
  sales: "acc_4010",
  services: "acc_4020",
  interest: "acc_4100",
  fees: "acc_4110",
  cogs: "acc_5010",
  salaries: "acc_6010",
  rent: "acc_6020",
  utilities: "acc_6030",
  transport: "acc_6040",
  marketing: "acc_6050",
  bankCharges: "acc_6060",
  depreciation: "acc_6070",
  professional: "acc_6080",
  office: "acc_6090",
  repairs: "acc_6100",
  telecom: "acc_6110",
  interestExp: "acc_6120",
  fxRealised: "acc_6130",
  fxUnrealised: "acc_6140",
} as const;

const coaStamp = stamp("2026-01-02T08:00:00.000Z", USERS.ama);

const A = (
  code: string,
  name: string,
  type: AccountType,
  subtype: string,
  parent: string | null,
  extra: Partial<Account> = {},
): Account => ({
  id: `acc_${code}`,
  code,
  name,
  type,
  subtype,
  parent_id: parent ? `acc_${parent}` : null,
  is_group: false,
  is_active: true,
  is_control: false,
  is_bank: false,
  ...coaStamp,
  ...extra,
});

const G = (code: string, name: string, type: AccountType) =>
  A(code, name, type, "GROUP", null, { is_group: true });

const LEGACY_ACCOUNT_CODES: Record<string, string> = {
  "1010": "QB-1000",
  "1020": "QB-1001",
  "1100": "QB-1200",
  "1200": "QB-1300",
  "1500": "QB-1500",
  "2010": "QB-2000",
  "2100": "QB-2200",
  "4010": "QB-4000",
  "5010": "QB-5000",
  "6010": "QB-6000",
  "6020": "QB-6100",
};

const buildAccounts = (): Account[] =>
  chartOfAccounts().map((a) =>
    LEGACY_ACCOUNT_CODES[a.code] ? { ...a, custom_fields: { legacy_account_code: LEGACY_ACCOUNT_CODES[a.code] } } : a,
  );

const chartOfAccounts = (): Account[] => [
  G("1000", "Assets", "ASSET"),
  A("1010", "Cash on Hand", "ASSET", "CASH", "1000", { is_bank: true }),
  A("1020", "GCB Bank – Operating", "ASSET", "CASH", "1000", { is_bank: true }),
  A("1030", "Ecobank – Payroll", "ASSET", "CASH", "1000", { is_bank: true }),
  A("1040", "MTN MoMo Merchant Wallet", "ASSET", "CASH", "1000", { is_bank: true }),
  A("1050", "Ecobank – USD Domiciliary", "ASSET", "CASH", "1000", {
    is_bank: true,
    description: "Held in US dollars. Carried in GH₵ and revalued at each month end.",
  }),
  A("1100", "Accounts Receivable", "ASSET", "RECEIVABLE", "1000", {
    is_control: true,
    description: "Control account. Posted only through sales invoices and receipts.",
  }),
  A("1150", "Loans Receivable", "ASSET", "LOAN_BOOK", "1000", {
    description: "Outstanding principal on client loans (fed by LoanDrift).",
  }),
  A("1200", "Inventory", "ASSET", "INVENTORY", "1000"),
  A("1300", "Prepaid Expenses", "ASSET", "PREPAYMENT", "1000"),
  A("1400", "VAT Input Recoverable", "ASSET", "TAX_RECOVERABLE", "1000"),
  A("1500", "Property, Plant & Equipment", "ASSET", "FIXED_ASSET", "1000"),
  A("1510", "Accumulated Depreciation", "ASSET", "FIXED_ASSET", "1000", {
    description: "Contra-asset. Carries a credit balance.",
  }),
  G("2000", "Liabilities", "LIABILITY"),
  A("2010", "Accounts Payable", "LIABILITY", "PAYABLE", "2000", {
    is_control: true,
    description: "Control account. Posted only through supplier bills and payments.",
  }),
  A("2100", "VAT & Levies Payable", "LIABILITY", "TAX_PAYABLE", "2000"),
  A("2120", "Withholding Tax Payable", "LIABILITY", "TAX_PAYABLE", "2000"),
  A("2150", "PAYE Payable", "LIABILITY", "PAYROLL", "2000"),
  A("2160", "SSNIT Payable", "LIABILITY", "PAYROLL", "2000"),
  A("2200", "Accrued Expenses", "LIABILITY", "ACCRUAL", "2000"),
  A("2300", "Bank Loan – Stanbic", "LIABILITY", "LONG_TERM", "2000"),
  G("3000", "Equity", "EQUITY"),
  A("3010", "Owner's Capital", "EQUITY", "CAPITAL", "3000"),
  A("3100", "Retained Earnings", "EQUITY", "RETAINED_EARNINGS", "3000"),
  G("4000", "Revenue", "REVENUE"),
  A("4010", "Sales Revenue", "REVENUE", "OPERATING_REVENUE", "4000"),
  A("4020", "Service Revenue", "REVENUE", "OPERATING_REVENUE", "4000"),
  A("4100", "Interest Income – Loans", "REVENUE", "OTHER_INCOME", "4000"),
  A("4110", "Loan Fees & Charges", "REVENUE", "OTHER_INCOME", "4000"),
  G("5000", "Cost of Sales", "EXPENSE"),
  A("5010", "Cost of Goods Sold", "EXPENSE", "COST_OF_SALES", "5000"),
  G("6000", "Operating Expenses", "EXPENSE"),
  A("6010", "Salaries & Wages", "EXPENSE", "OPERATING_EXPENSE", "6000"),
  A("6020", "Rent", "EXPENSE", "OPERATING_EXPENSE", "6000"),
  A("6030", "Utilities", "EXPENSE", "OPERATING_EXPENSE", "6000"),
  A("6040", "Transport & Logistics", "EXPENSE", "OPERATING_EXPENSE", "6000"),
  A("6050", "Marketing & Advertising", "EXPENSE", "OPERATING_EXPENSE", "6000"),
  A("6060", "Bank Charges", "EXPENSE", "OPERATING_EXPENSE", "6000"),
  A("6070", "Depreciation", "EXPENSE", "OPERATING_EXPENSE", "6000"),
  A("6080", "Professional Fees", "EXPENSE", "OPERATING_EXPENSE", "6000"),
  A("6090", "Office Supplies", "EXPENSE", "OPERATING_EXPENSE", "6000"),
  A("6100", "Repairs & Maintenance", "EXPENSE", "OPERATING_EXPENSE", "6000"),
  A("6110", "Internet & Telephone", "EXPENSE", "OPERATING_EXPENSE", "6000"),
  A("6120", "Interest Expense", "EXPENSE", "OPERATING_EXPENSE", "6000"),
  A("6130", "Exchange Gains & Losses – Realised", "EXPENSE", "OPERATING_EXPENSE", "6000", {
    description: "Difference between the rate on a foreign invoice or bill and the rate on the day it was settled. A credit balance is a net gain.",
  }),
  A("6140", "Exchange Gains & Losses – Unrealised", "EXPENSE", "OPERATING_EXPENSE", "6000", {
    description: "Month-end revaluation of open foreign balances. Reversed on the first day of the next month.",
  }),
];

// ---------------------------------------------------------------------------
// Tax, dimensions, periods
// ---------------------------------------------------------------------------

export const TAX = { std: "tax_std", flat: "tax_flat", zero: "tax_zero", exempt: "tax_exempt", wht: "tax_wht" };

const buildTaxCodes = (): TaxCode[] => [
  {
    id: TAX.std,
    code: "GH-STD",
    name: "Standard rated",
    rate: 0.2,
    kind: "OUTPUT_INPUT",
    output_account_id: ACC.vatOut,
    input_account_id: ACC.vatIn,
    is_active: true,
    description: "VAT 15% + NHIL 2.5% + GETFund levy 2.5%, all on the same base.",
    ...coaStamp,
  },
  {
    id: TAX.flat,
    code: "VFRS-3",
    name: "VAT flat rate (retail)",
    rate: 0.03,
    kind: "OUTPUT_INPUT",
    output_account_id: ACC.vatOut,
    input_account_id: null,
    is_active: false,
    description: "Flat rate scheme for retailers below the threshold. Input VAT not recoverable.",
    ...coaStamp,
  },
  {
    id: TAX.zero,
    code: "ZERO",
    name: "Zero rated",
    rate: 0,
    kind: "OUTPUT_INPUT",
    output_account_id: ACC.vatOut,
    input_account_id: ACC.vatIn,
    is_active: true,
    description: "Exports and other zero-rated supplies. Reported but no tax charged.",
    ...coaStamp,
  },
  {
    id: TAX.exempt,
    code: "EXEMPT",
    name: "Exempt",
    rate: 0,
    kind: "EXEMPT",
    output_account_id: null,
    input_account_id: null,
    is_active: true,
    description: "Exempt supplies (education, health, unprocessed food).",
    ...coaStamp,
  },
  {
    id: TAX.wht,
    code: "WHT-SVC",
    name: "Withholding tax – services",
    rate: 0.075,
    kind: "WITHHOLDING",
    output_account_id: ACC.wht,
    input_account_id: null,
    is_active: true,
    description: "Withheld on payments to resident service providers and remitted to GRA.",
    ...coaStamp,
  },
];

export const BR = { adum: "br_adum", osu: "br_osu", tkd: "br_tkd" };

const D = (
  id: string,
  code: string,
  name: string,
  kind: Dimension["kind"],
  description?: string,
): Dimension => ({ id, code, name, kind, is_active: true, description, ...coaStamp });

const buildDimensions = (): Dimension[] => [
  D("le_ktl", "KTL", "Kumasi Traders Ltd", "LEGAL_ENTITY", "Trading and distribution"),
  D("le_ktm", "KTM", "KT Microfinance Ltd", "LEGAL_ENTITY", "Client lending (LoanDrift)"),
  D(BR.adum, "BR-ADM", "Adum – Kumasi (HQ)", "BRANCH"),
  D(BR.osu, "BR-OSU", "Osu – Accra", "BRANCH"),
  D(BR.tkd, "BR-TKD", "Takoradi", "BRANCH"),
  D("dp_fin", "FIN", "Finance", "DEPARTMENT"),
  D("dp_sales", "SAL", "Sales", "DEPARTMENT"),
  D("dp_ops", "OPS", "Operations & Warehouse", "DEPARTMENT"),
  D("dp_hr", "HRA", "HR & Admin", "DEPARTMENT"),
  D("dp_lend", "LND", "Lending", "DEPARTMENT"),
  D("cc_100", "CC-100", "Head Office", "COST_CENTRE"),
  D("cc_200", "CC-200", "Retail", "COST_CENTRE"),
  D("cc_300", "CC-300", "Wholesale", "COST_CENTRE"),
  D("cc_400", "CC-400", "Lending", "COST_CENTRE"),
  D("pj_01", "PRJ-01", "Osu branch fit-out", "PROJECT"),
  D("pj_02", "PRJ-02", "ERP rollout", "PROJECT"),
];

const MONTH_NAMES = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

const lastDay = (month: number) => new Date(Date.UTC(2026, month, 0)).getUTCDate();
const d = (month: number, day: number) => `2026-${pad(month)}-${pad(day)}`;

const buildPeriods = (): FiscalPeriod[] =>
  MONTH_NAMES.map((name, i) => {
    const m = i + 1;
    const status = m <= 6 ? "CLOSED" : m <= 8 ? "LOCKED" : "OPEN";
    return {
      id: `per_2026_${pad(m)}`,
      name: `${name} 2026`,
      start_date: d(m, 1),
      end_date: d(m, lastDay(m)),
      status,
      locked_by: status === "OPEN" ? null : USERS.ama.name,
      locked_at: status === "OPEN" ? null : ts(addDays(d(m, lastDay(m)), 12), 16),
    };
  });

// ---------------------------------------------------------------------------
// Currencies and exchange rates (GH₵ per unit)
// ---------------------------------------------------------------------------

const buildCurrencies = (): Currency[] => [
  { code: "GHS", name: "Ghana cedi", symbol: "GH₵", is_active: true },
  { code: "USD", name: "US dollar", symbol: "US$", is_active: true },
  { code: "EUR", name: "Euro", symbol: "€", is_active: true },
  { code: "GBP", name: "British pound", symbol: "£", is_active: true },
  { code: "NGN", name: "Nigerian naira", symbol: "₦", is_active: false },
  { code: "XOF", name: "West African CFA franc", symbol: "CFA", is_active: false },
];

const RATE_CURVES: Record<string, { start: number; end: number; wobble: number }> = {
  USD: { start: 12.2, end: 12.86, wobble: 0.07 },
  EUR: { start: 13.3, end: 14.04, wobble: 0.09 },
  GBP: { start: 15.5, end: 16.31, wobble: 0.1 },
};

/** Weekly Bank of Ghana reference rates, then daily up to the last business day before the demo date. */
const buildExchangeRates = (): ExchangeRate[] => {
  const rng = mulberry32(4471);
  const dates: string[] = [];
  for (let day = "2026-01-02"; day <= "2026-09-18"; day = addDays(day, 7)) dates.push(day);
  for (let day = "2026-09-21"; day < DEMO_TODAY; day = addDays(day, 1)) {
    const dow = new Date(`${day}T00:00:00Z`).getUTCDay();
    if (dow !== 0 && dow !== 6) dates.push(day);
  }
  const span = (Date.parse(`${DEMO_TODAY}T00:00:00Z`) - Date.parse("2026-01-02T00:00:00Z")) / 86400000;
  const out: ExchangeRate[] = [];
  for (const [currency, c] of Object.entries(RATE_CURVES)) {
    for (const date of dates) {
      const t = (Date.parse(`${date}T00:00:00Z`) - Date.parse("2026-01-02T00:00:00Z")) / 86400000 / span;
      const rate = c.start + (c.end - c.start) * t + c.wobble * Math.sin(t * 9) + (rng() - 0.5) * 0.04;
      out.push({
        id: `fx_${currency}_${date}`,
        currency,
        date,
        rate: Math.round(rate * 10000) / 10000,
        source: "BANK_OF_GHANA",
        ...stamp(ts(date, 8, 30), SYSTEM),
      });
    }
  }
  return out;
};

// ---------------------------------------------------------------------------
// Parties
// ---------------------------------------------------------------------------

const party = (
  id: string,
  code: string,
  name: string,
  city: string,
  terms: number,
  credit: number,
  extra: Partial<Customer> = {},
): Customer => ({
  id,
  code,
  name,
  email: `accounts@${name.toLowerCase().replace(/[^a-z]+/g, "").slice(0, 18)}.com.gh`,
  phone: `+233 24 ${String(1000000 + ((code.charCodeAt(code.length - 1) * 7919) % 8999999)).slice(0, 3)} ${String(
    (code.charCodeAt(code.length - 2) * 131) % 9999,
  ).padStart(4, "0")}`,
  city,
  payment_terms_days: terms,
  credit_limit: credit,
  status: "ACTIVE",
  external_reference: null,
  source: "MANUAL",
  currency: "GHS",
  ...stamp("2026-01-03T10:00:00.000Z", USERS.efua),
  ...extra,
});

const buildCustomers = (): Customer[] => [
  party("cus_01", "C-0001", "Adom Supermarket Ltd", "Kumasi", 30, 120000, {
    source: "STORE_MANAGEMENT",
    external_reference: "SM-CUST-0045",
    custom_fields: { sales_region: "Ashanti", key_account: "true", store_customer_no: "SM-CUST-0045" },
  }),
  party("cus_02", "C-0002", "Nyame Dua Hardware", "Kumasi", 30, 80000, {
    custom_fields: { sales_region: "Ashanti" },
  }),
  party("cus_03", "C-0003", "Osu Fresh Mart", "Accra", 14, 60000, {
    source: "IMPORT",
    external_reference: "QB-CUS-118",
    custom_fields: { sales_region: "Greater Accra", quickbooks_id: "118" },
  }),
  party("cus_04", "C-0004", "Sankofa Catering Services", "Accra", 30, 50000, {
    custom_fields: { sales_region: "Greater Accra" },
  }),
  party("cus_05", "C-0005", "Takoradi Harbour Traders", "Takoradi", 45, 150000, {
    tin: "C0004417821",
    custom_fields: { sales_region: "Western", key_account: "true" },
  }),
  party("cus_06", "C-0006", "Akwaaba Hotels Group", "Accra", 30, 100000, {
    source: "IMPORT",
    external_reference: "QB-CUS-131",
    custom_fields: { sales_region: "Greater Accra", key_account: "true", quickbooks_id: "131" },
  }),
  party("cus_07", "C-0007", "Bekwai Rural Bank", "Bekwai", 30, 40000, {
    custom_fields: { sales_region: "Ashanti" },
  }),
  party("cus_08", "C-0008", "Ejisu Community Clinic", "Ejisu", 30, 30000, {
    custom_fields: { sales_region: "Ashanti" },
  }),
  party("cus_09", "C-0009", "Volta Agro Processors", "Ho", 30, 90000, {
    custom_fields: { sales_region: "Volta" },
  }),
  party("cus_10", "C-0010", "Tamale Northern Distributors", "Tamale", 45, 110000, {
    source: "STORE_MANAGEMENT",
    external_reference: "SM-CUST-0102",
    custom_fields: { sales_region: "Northern", store_customer_no: "SM-CUST-0102" },
  }),
  party("cus_11", "C-0011", "Cape Coast Schools Union", "Cape Coast", 60, 70000, {
    custom_fields: { sales_region: "Central" },
  }),
  party("cus_12", "C-0012", "Kasoa Building Supplies", "Kasoa", 30, 60000, {
    status: "INACTIVE",
    custom_fields: { sales_region: "Central" },
  }),
  party("cus_13", "C-0013", "Lomé Distribution SARL", "Lomé", 30, 15000, {
    currency: "EUR",
    email: "compta@lomedistribution.tg",
    phone: "+228 22 21 4471",
    custom_fields: { sales_region: "Volta" },
  }),
  party("cus_14", "C-0014", "Sahel Agro Exports", "Ouagadougou", 45, 25000, {
    currency: "USD",
    email: "finance@sahelagro.bf",
    phone: "+226 25 30 1188",
    custom_fields: { sales_region: "Northern", key_account: "true" },
  }),
];

const buildSuppliers = (): Supplier[] => {
  const cat = (supplier_category: string) => ({ custom_fields: { supplier_category } });
  return [
    party("sup_01", "S-0001", "Tema Wholesale Foods Ltd", "Tema", 30, 0, { tin: "C0001982245", ...cat("Goods for resale") }),
    party("sup_02", "S-0002", "Kumasi Packaging Co.", "Kumasi", 30, 0, cat("Goods for resale")),
    party("sup_03", "S-0003", "Volta Power Distribution", "Kumasi", 14, 0, cat("Utilities")),
    party("sup_04", "S-0004", "Aqua Supply Ghana", "Kumasi", 14, 0, cat("Utilities")),
    party("sup_05", "S-0005", "AfriNet Telecoms", "Accra", 14, 0, cat("Utilities")),
    party("sup_06", "S-0006", "Adinkra Logistics", "Kumasi", 30, 0, {
      source: "IMPORT",
      external_reference: "QB-VEN-022",
      ...cat("Logistics"),
    }),
    party("sup_07", "S-0007", "Sika Media Advertising", "Accra", 30, 0, cat("Professional services")),
    party("sup_08", "S-0008", "Boateng & Partners Chartered Accountants", "Kumasi", 30, 0, cat("Professional services")),
    party("sup_09", "S-0009", "Prime Office Supplies", "Kumasi", 14, 0, cat("Office & admin")),
    party("sup_10", "S-0010", "Nkwanta Motors Workshop", "Kumasi", 14, 0, cat("Professional services")),
    party("sup_11", "S-0011", "Guangzhou Packaging Industries", "Guangzhou", 60, 0, {
      currency: "USD",
      email: "export@gzpackaging.cn",
      phone: "+86 20 8391 4471",
      ...cat("Imports"),
    }),
  ];
};

// ---------------------------------------------------------------------------
// Ledger seed
// ---------------------------------------------------------------------------

type LineSpec = [accountId: string, debit: number, credit: number, description?: string];

interface SeedState {
  journals: JournalEntry[];
  invoices: SalesInvoice[];
  bills: PurchaseBill[];
  receipts: Payment[];
  supplierPayments: Payment[];
}

const GOODS = [
  { description: "Rice – 25kg bags", price: 420, qty: [10, 40] },
  { description: "Golden Palm vegetable oil – 25L", price: 610, qty: [8, 25] },
  { description: "Granulated sugar – 50kg bags", price: 980, qty: [5, 15] },
  { description: "Bottled water – 24 x 500ml packs", price: 38, qty: [100, 400] },
  { description: "Cement – 50kg bags", price: 98, qty: [50, 200] },
  { description: "Roofing sheets – 0.4mm", price: 145, qty: [30, 100] },
  { description: "Tomato paste – carton of 50", price: 310, qty: [10, 40] },
  { description: "Detergent – 5kg pails", price: 165, qty: [20, 80] },
];

const SERVICES = [
  { description: "Delivery & logistics services", price: 1800 },
  { description: "Bulk procurement service fee", price: 2500 },
  { description: "Warehousing – monthly", price: 3200 },
  { description: "Equipment rental", price: 1400 },
];

const EXEMPT_CUSTOMERS = new Set(["cus_08", "cus_11"]);

const actorFor = (type: SourceType): Actor => {
  switch (type) {
    case "STORE_MANAGEMENT":
    case "LOANS":
    case "HR":
      return INTEGRATION;
    case "SYSTEM":
      return SYSTEM;
    case "SALES":
      return USERS.efua;
    default:
      return USERS.kofi;
  }
};

const buildLedger = (
  customers: Customer[],
  suppliers: Supplier[],
  taxCodes: TaxCode[],
  rates: ExchangeRate[],
): SeedState => {
  const rng = mulberry32(20261005);
  const int = (min: number, max: number) => Math.floor(min + rng() * (max - min + 1));
  const money = (min: number, max: number, step = 10) => Math.round((min + rng() * (max - min)) / step) * step;

  const journals: JournalEntry[] = [];
  const invoices: SalesInvoice[] = [];
  const bills: PurchaseBill[] = [];
  let jSeq = 0;
  let lSeq = 0;

  const J = (p: {
    date: string;
    memo: string;
    source: SourceRef;
    lines: (LineSpec | FxLine)[];
    by?: Actor;
    status?: JournalStatus;
    branch?: string;
    reference?: string;
    hour?: number;
    custom_fields?: Record<string, string>;
  }) => {
    jSeq += 1;
    const id = `jn_${jSeq}`;
    const at = ts(p.date, p.hour ?? 9 + (jSeq % 8), (jSeq * 7) % 60);
    const by = p.by ?? actorFor(p.source.type);
    const status = p.status ?? "POSTED";
    const branch = p.branch ?? BR.adum;
    const posted = status === "POSTED" || status === "REVERSED";
    const entry: JournalEntry = {
      id,
      number: "",
      date: p.date,
      memo: p.memo,
      reference: p.reference ?? p.source.reference,
      status,
      source: p.source,
      branch_id: branch,
      lines: p.lines
        .map((l): FxLine => (Array.isArray(l) ? { account_id: l[0], debit: l[1], credit: l[2], description: l[3] } : l))
        .filter((l) => round2(l.debit) !== 0 || round2(l.credit) !== 0)
        .map((l) => {
          lSeq += 1;
          return {
            id: `jl_${lSeq}`,
            account_id: l.account_id,
            debit: round2(l.debit),
            credit: round2(l.credit),
            description: l.description,
            branch_id: branch,
            cost_centre_id: null,
            ...(l.currency ? { currency: l.currency, amount_fc: l.amount_fc ?? null } : {}),
          };
        }),
      posted_at: posted ? at : null,
      posted_by: posted ? by.name : null,
      approved_by: null,
      reversal_of_id: null,
      reversed_by_id: null,
      custom_fields: p.custom_fields,
      ...stamp(at, by),
    };
    journals.push(entry);
    return entry;
  };

  // Opening balances migrated from QuickBooks on go-live.
  J({
    date: d(1, 1),
    memo: "Opening balances migrated from QuickBooks Online",
    source: { type: "IMPORT", reference: "IMP-0001" },
    by: USERS.ama,
    lines: [
      [ACC.cash, 15000, 0],
      [ACC.gcb, 420000, 0],
      [ACC.eco, 60000, 0],
      [ACC.inventory, 180000, 0],
      [ACC.ppe, 350000, 0],
      [ACC.loans, 250000, 0],
      [ACC.accDep, 0, 70000],
      [ACC.bankLoan, 0, 300000],
      [ACC.capital, 0, 500000],
      [ACC.retained, 0, 405000],
    ],
  });

  // ---- Documents -----------------------------------------------------------
  let invSeq = 0;
  let billSeq = 0;
  const plannedPayments: {
    kind: "RECEIPT" | "PAYMENT";
    doc: SalesInvoice | PurchaseBill;
    date: string;
    amount: number;
    method: PaymentMethod;
    bank: string;
  }[] = [];

  const planPayment = (
    kind: "RECEIPT" | "PAYMENT",
    doc: SalesInvoice | PurchaseBill,
    total: number,
    terms: number,
    overdueChance: number,
  ) => {
    const r = rng();
    const matured = doc.due_date < addDays(DEMO_TODAY, -5);
    let amount = 0;
    let date = doc.due_date;
    if (matured) {
      if (r < overdueChance) return;
      if (r < overdueChance * 2) {
        amount = round2(total * 0.5);
        date = addDays(doc.due_date, int(1, 6));
      } else {
        amount = total;
        date = addDays(doc.due_date, int(-Math.min(7, terms - 2), 6));
      }
    } else if (r < 0.25) {
      amount = total;
      date = addDays(doc.issue_date, int(2, 10));
    } else {
      return;
    }
    if (date > DEMO_TODAY) return;
    const method: PaymentMethod = rng() < 0.15 ? "MOBILE_MONEY" : rng() < 0.08 ? "CHEQUE" : "BANK_TRANSFER";
    plannedPayments.push({
      kind,
      doc,
      date,
      amount,
      method,
      bank: method === "MOBILE_MONEY" ? "ba_momo" : "ba_gcb",
    });
  };

  const createInvoice = (customer: Customer, issue: string, draft = false) => {
    invSeq += 1;
    const exempt = EXEMPT_CUSTOMERS.has(customer.id);
    const lineCount = int(1, 3);
    const lines: DocumentLine[] = [];
    const used = new Set<number>();
    for (let i = 0; i < lineCount; i++) {
      const service = rng() < 0.25;
      if (service) {
        const s = SERVICES[int(0, SERVICES.length - 1)];
        lines.push({
          id: `il_${invSeq}_${i}`,
          description: s.description,
          quantity: int(1, 3),
          unit_price: s.price,
          tax_code_id: exempt ? TAX.exempt : TAX.std,
          account_id: ACC.services,
        });
      } else {
        let gi = int(0, GOODS.length - 1);
        while (used.has(gi)) gi = (gi + 1) % GOODS.length;
        used.add(gi);
        const g = GOODS[gi];
        lines.push({
          id: `il_${invSeq}_${i}`,
          description: g.description,
          quantity: int(g.qty[0], g.qty[1]),
          unit_price: g.price,
          tax_code_id: exempt ? TAX.exempt : TAX.std,
          account_id: ACC.sales,
        });
      }
    }
    const branch = customer.city === "Accra" ? BR.osu : customer.city === "Takoradi" ? BR.tkd : BR.adum;
    const route =
      customer.city === "Tamale" ? "Northern" : branch === BR.osu ? "Accra corridor" : branch === BR.tkd ? "Western" : "Kumasi metro";
    const invoice: SalesInvoice = {
      id: `inv_${invSeq}`,
      number: `INV-2026-${String(invSeq).padStart(4, "0")}`,
      customer_id: customer.id,
      issue_date: issue,
      due_date: addDays(issue, customer.payment_terms_days),
      state: draft ? "DRAFT" : "APPROVED",
      lines,
      currency: "GHS",
      exchange_rate: 1,
      amount_paid: 0,
      amount_paid_base: 0,
      journal_id: null,
      branch_id: branch,
      source: { type: "MANUAL" },
      custom_fields: {
        delivery_route: route,
        ...(invSeq % 3 === 0 ? { customer_po: `PO-${customer.code.slice(2)}-${String(invSeq).padStart(3, "0")}` } : {}),
      },
      ...stamp(ts(issue, 10, invSeq % 60), USERS.efua),
    };
    invoices.push(invoice);
    if (draft) return invoice;

    const totals = documentTotals(lines, taxCodes);
    const byAccount = new Map<string, number>();
    let goods = 0;
    for (const l of lines) {
      const amt = round2(l.quantity * l.unit_price);
      byAccount.set(l.account_id, (byAccount.get(l.account_id) ?? 0) + amt);
      if (l.account_id === ACC.sales) goods += amt;
    }
    const cost = round2(goods * 0.6);
    const journal = J({
      date: issue,
      memo: `Sales invoice ${invoice.number} – ${customer.name}`,
      source: { type: "SALES", reference: invoice.number, document_id: invoice.id },
      branch,
      lines: [
        [ACC.ar, totals.total, 0, customer.name],
        ...[...byAccount.entries()].map(([acc, amt]): LineSpec => [acc, 0, amt]),
        ...(totals.tax ? [[ACC.vatOut, 0, totals.tax, "VAT & levies"] as LineSpec] : []),
        ...(cost ? ([[ACC.cogs, cost, 0, "Cost of goods delivered"], [ACC.inventory, 0, cost]] as LineSpec[]) : []),
      ],
    });
    invoice.journal_id = journal.id;
    planPayment("RECEIPT", invoice, totals.total, customer.payment_terms_days, 0.08);
    return invoice;
  };

  const createBill = (
    supplier: Supplier,
    issue: string,
    lines: Omit<DocumentLine, "id">[],
    supplierRef: string,
  ) => {
    billSeq += 1;
    const docLines = lines.map((l, i) => ({ ...l, id: `bl_${billSeq}_${i}` }));
    const bill: PurchaseBill = {
      id: `bill_${billSeq}`,
      number: `BILL-2026-${String(billSeq).padStart(4, "0")}`,
      supplier_reference: supplierRef,
      supplier_id: supplier.id,
      issue_date: issue,
      due_date: addDays(issue, supplier.payment_terms_days),
      state: "APPROVED",
      lines: docLines,
      currency: "GHS",
      exchange_rate: 1,
      amount_paid: 0,
      amount_paid_base: 0,
      journal_id: null,
      branch_id: BR.adum,
      source: { type: "MANUAL" },
      custom_fields: { purchase_order_no: `PO-2026-${String(billSeq).padStart(3, "0")}` },
      ...stamp(ts(issue, 11, billSeq % 60), USERS.kofi),
    };
    bills.push(bill);
    const totals = documentTotals(docLines, taxCodes);
    const byAccount = new Map<string, number>();
    for (const l of docLines) {
      byAccount.set(l.account_id, (byAccount.get(l.account_id) ?? 0) + round2(l.quantity * l.unit_price));
    }
    const journal = J({
      date: issue,
      memo: `Supplier bill ${bill.number} – ${supplier.name}`,
      source: { type: "PURCHASES", reference: bill.number, document_id: bill.id },
      lines: [
        ...[...byAccount.entries()].map(([acc, amt]): LineSpec => [acc, amt, 0]),
        ...(totals.tax ? [[ACC.vatIn, totals.tax, 0, "Recoverable VAT & levies"] as LineSpec] : []),
        [ACC.ap, 0, totals.total, supplier.name],
      ],
    });
    bill.journal_id = journal.id;
    planPayment("PAYMENT", bill, totals.total, supplier.payment_terms_days, 0.04);
    return bill;
  };

  const cust = (id: string) => customers.find((c) => c.id === id)!;
  const sup = (id: string) => suppliers.find((s) => s.id === id)!;
  const activeCustomers = customers.filter((c) => c.status === "ACTIVE" && c.currency === "GHS");

  const fx = (currency: string, date: string) => rateOn(rates, currency, date)!.rate;
  const pay = (kind: "RECEIPT" | "PAYMENT", doc: SalesInvoice | PurchaseBill, date: string, amount: number, bank: string) =>
    plannedPayments.push({ kind, doc, date, amount, method: "BANK_TRANSFER", bank });

  const createForeignInvoice = (customer: Customer, issue: string, line: Omit<DocumentLine, "id">, po: string) => {
    invSeq += 1;
    const rate = fx(customer.currency, issue);
    const lines = [{ ...line, id: `il_${invSeq}_0` }];
    const invoice: SalesInvoice = {
      id: `inv_${invSeq}`,
      number: `INV-2026-${String(invSeq).padStart(4, "0")}`,
      customer_id: customer.id,
      issue_date: issue,
      due_date: addDays(issue, customer.payment_terms_days),
      state: "APPROVED",
      lines,
      currency: customer.currency,
      exchange_rate: rate,
      amount_paid: 0,
      amount_paid_base: 0,
      journal_id: null,
      branch_id: BR.adum,
      source: { type: "MANUAL" },
      custom_fields: { customer_po: po, delivery_route: "Export" },
      ...stamp(ts(issue, 10, invSeq % 60), USERS.efua),
    };
    invoices.push(invoice);
    const cost = round2(toBase(line.quantity * line.unit_price, rate) * 0.6);
    const journal = J({
      date: issue,
      memo: `Sales invoice ${invoice.number} – ${customer.name}`,
      source: { type: "SALES", reference: invoice.number, document_id: invoice.id },
      lines: [
        ...documentJournalLines({
          lines,
          taxCodes,
          currency: invoice.currency,
          rate,
          partyAccount: ACC.ar,
          partyName: customer.name,
          kind: "SALE",
          fallbackTaxAccount: ACC.vatOut,
        }),
        [ACC.cogs, cost, 0, "Cost of goods delivered"],
        [ACC.inventory, 0, cost],
      ],
    });
    invoice.journal_id = journal.id;
    return invoice;
  };

  const createForeignBill = (supplier: Supplier, issue: string, line: Omit<DocumentLine, "id">, ref: string) => {
    billSeq += 1;
    const rate = fx(supplier.currency, issue);
    const lines = [{ ...line, id: `bl_${billSeq}_0` }];
    const bill: PurchaseBill = {
      id: `bill_${billSeq}`,
      number: `BILL-2026-${String(billSeq).padStart(4, "0")}`,
      supplier_reference: ref,
      supplier_id: supplier.id,
      issue_date: issue,
      due_date: addDays(issue, supplier.payment_terms_days),
      state: "APPROVED",
      lines,
      currency: supplier.currency,
      exchange_rate: rate,
      amount_paid: 0,
      amount_paid_base: 0,
      journal_id: null,
      branch_id: BR.adum,
      source: { type: "MANUAL" },
      custom_fields: { purchase_order_no: `PO-2026-${String(billSeq).padStart(3, "0")}` },
      ...stamp(ts(issue, 11, billSeq % 60), USERS.kofi),
    };
    bills.push(bill);
    const journal = J({
      date: issue,
      memo: `Supplier bill ${bill.number} – ${supplier.name}`,
      source: { type: "PURCHASES", reference: bill.number, document_id: bill.id },
      lines: documentJournalLines({
        lines,
        taxCodes,
        currency: bill.currency,
        rate,
        partyAccount: ACC.ap,
        partyName: supplier.name,
        kind: "PURCHASE",
        fallbackTaxAccount: ACC.vatIn,
      }),
    });
    bill.journal_id = journal.id;
    return bill;
  };

  for (let m = 1; m <= 10; m++) {
    const monthName = MONTH_NAMES[m - 1];
    const ld = lastDay(m);
    const inMonth = (day: number) => d(m, Math.min(day, ld)) <= DEMO_TODAY;

    // Sales invoices
    const invoiceDays = m === 10 ? [1, 2] : [5, 12, 19, 26];
    invoiceDays.forEach((day, i) => {
      const c = activeCustomers[int(0, activeCustomers.length - 1)];
      createInvoice(c, d(m, day), m === 10 && i === 1);
    });
    if (m === 9) createInvoice(cust("cus_05"), d(9, 29));

    // Supplier bills
    if (inMonth(2)) {
      createBill(sup("sup_05"), d(m, 2), [
        { description: `Dedicated fibre internet – ${monthName}`, quantity: 1, unit_price: 1200, tax_code_id: TAX.std, account_id: ACC.telecom },
      ], `AFN-${2026}${pad(m)}-${int(100, 999)}`);
    }
    if (inMonth(3)) {
      createBill(sup("sup_01"), d(m, 3), [
        { description: "Rice – 25kg bags", quantity: int(45, 70), unit_price: 300, tax_code_id: TAX.std, account_id: ACC.inventory },
        { description: "Granulated sugar – 50kg bags", quantity: int(10, 18), unit_price: 720, tax_code_id: TAX.std, account_id: ACC.inventory },
        { description: "Tomato paste – carton of 50", quantity: int(20, 35), unit_price: 220, tax_code_id: TAX.std, account_id: ACC.inventory },
      ], `TWF/INV/${4400 + m * 2}`);
    }
    if (inMonth(6)) {
      createBill(sup("sup_03"), d(m, 6), [
        { description: `Electricity – ${monthName}`, quantity: 1, unit_price: money(2400, 3400), tax_code_id: TAX.std, account_id: ACC.utilities },
      ], `VPD-${int(100000, 999999)}`);
      createBill(sup("sup_04"), d(m, 6), [
        { description: `Water – ${monthName}`, quantity: 1, unit_price: money(450, 700), tax_code_id: TAX.exempt, account_id: ACC.utilities },
      ], `ASG-${int(10000, 99999)}`);
    }
    if (m % 2 === 1 && inMonth(8)) {
      createBill(sup("sup_02"), d(m, 8), [
        { description: "Shrink wrap & cartons", quantity: int(80, 140), unit_price: 45, tax_code_id: TAX.std, account_id: ACC.inventory },
      ], `KPC-${int(1000, 9999)}`);
    }
    if (m % 2 === 0 && inMonth(11)) {
      createBill(sup("sup_09"), d(m, 11), [
        { description: "Printer toner, paper & stationery", quantity: 1, unit_price: money(900, 1800), tax_code_id: TAX.std, account_id: ACC.office },
      ], `POS-${int(1000, 9999)}`);
    }
    if ([2, 5, 8].includes(m) && inMonth(9)) {
      createBill(sup("sup_07"), d(m, 9), [
        { description: "Radio & billboard campaign", quantity: 1, unit_price: money(6000, 9000, 100), tax_code_id: TAX.std, account_id: ACC.marketing },
      ], `SMA-${int(100, 999)}`);
    }
    if ([3, 6, 9].includes(m) && inMonth(15)) {
      createBill(sup("sup_08"), d(m, 15), [
        { description: "Quarterly bookkeeping & tax advisory", quantity: 1, unit_price: 7500, tax_code_id: TAX.std, account_id: ACC.professional },
      ], `BP/${2026}/${m * 11}`);
    }
    if ([4, 7, 9].includes(m) && inMonth(21)) {
      createBill(sup("sup_10"), d(m, 21), [
        { description: "Delivery van servicing & tyres", quantity: 1, unit_price: money(1500, 3000), tax_code_id: TAX.std, account_id: ACC.repairs },
      ], `NMW-${int(100, 999)}`);
    }
    if (inMonth(17)) {
      createBill(sup("sup_01"), d(m, 17), [
        { description: "Golden Palm vegetable oil – 25L", quantity: int(25, 40), unit_price: 450, tax_code_id: TAX.std, account_id: ACC.inventory },
        { description: "Bottled water – 24 x 500ml packs", quantity: int(400, 700), unit_price: 26, tax_code_id: TAX.std, account_id: ACC.inventory },
        { description: "Detergent – 5kg pails", quantity: int(60, 100), unit_price: 115, tax_code_id: TAX.std, account_id: ACC.inventory },
      ], `TWF/INV/${4401 + m * 2}`);
    }
    if (inMonth(24)) {
      createBill(sup("sup_06"), d(m, 24), [
        { description: `Inter-branch haulage – ${monthName}`, quantity: 1, unit_price: money(2800, 4200), tax_code_id: TAX.std, account_id: ACC.transport },
      ], `ADL-${int(1000, 9999)}`);
    }

    // Foreign-currency trade: imports from China in US$, exports to Togo (EUR) and Burkina Faso (US$)
    if (m === 4) {
      const b = createForeignBill(sup("sup_11"), d(4, 10), {
        description: "PET preform bottles – carton of 1,000", quantity: 130, unit_price: 50, tax_code_id: TAX.zero, account_id: ACC.inventory,
      }, "GZP-2604-118");
      pay("PAYMENT", b, d(6, 5), 6500, "ba_gcb");
    }
    if (m === 5) {
      const i = createForeignInvoice(cust("cus_13"), d(5, 6), {
        description: "Rice – 25kg bags (export)", quantity: 400, unit_price: 24.5, tax_code_id: TAX.zero, account_id: ACC.sales,
      }, "LD-PO-0512");
      pay("RECEIPT", i, d(6, 10), 9800, "ba_gcb");
    }
    if (m === 7) {
      const i = createForeignInvoice(cust("cus_14"), d(7, 14), {
        description: "Granulated sugar – 50kg bags (export)", quantity: 150, unit_price: 80, tax_code_id: TAX.zero, account_id: ACC.sales,
      }, "SAE-PO-2214");
      pay("RECEIPT", i, d(8, 25), 12000, "ba_usd");
    }
    if (m === 8) {
      const b = createForeignBill(sup("sup_11"), d(8, 12), {
        description: "Shrink film rolls – 500mm", quantity: 205, unit_price: 40, tax_code_id: TAX.zero, account_id: ACC.inventory,
      }, "GZP-2608-203");
      pay("PAYMENT", b, d(9, 20), 4000, "ba_usd");
    }
    if (m === 9) {
      createForeignInvoice(cust("cus_13"), d(9, 8), {
        description: "Golden Palm vegetable oil – 25L (export)", quantity: 149, unit_price: 50, tax_code_id: TAX.zero, account_id: ACC.sales,
      }, "LD-PO-0577");
      const i = createForeignInvoice(cust("cus_14"), d(9, 16), {
        description: "Rice – 25kg bags (export)", quantity: 300, unit_price: 31, tax_code_id: TAX.zero, account_id: ACC.sales,
      }, "SAE-PO-2291");
      pay("RECEIPT", i, d(9, 29), 5000, "ba_usd");
      createForeignBill(sup("sup_11"), d(9, 22), {
        description: "Printed labels & shipping cartons", quantity: 1800, unit_price: 3, tax_code_id: TAX.zero, account_id: ACC.inventory,
      }, "GZP-2609-247");
    }

    // Rent
    if (inMonth(1)) {
      J({
        date: d(m, 1),
        memo: `Office & warehouse rent – ${monthName} (Akoma Properties)`,
        source: { type: "BANKING", reference: `RENT-${pad(m)}` },
        lines: [
          [ACC.rent, 12000, 0],
          [ACC.gcb, 0, 12000],
        ],
      });
    }

    // Bank loan instalment
    if (inMonth(5)) {
      J({
        date: d(m, 5),
        memo: `Stanbic term loan instalment – ${monthName}`,
        source: { type: "BANKING", reference: `STB-LN-${pad(m)}` },
        lines: [
          [ACC.bankLoan, 8000, 0, "Principal"],
          [ACC.interestExp, 3000, 0, "Interest"],
          [ACC.gcb, 0, 11000],
        ],
      });
    }

    // Loan repayments from LoanDrift
    if (inMonth(10)) {
      const principal = money(16000, 21000, 50);
      const interest = money(3800, 4800, 10);
      const fees = money(250, 450, 5);
      J({
        date: d(m, 10),
        memo: `Loan repayments batch – ${monthName} (LoanDrift)`,
        source: { type: "LOANS", reference: `LD-REPAY-2026-${pad(m)}` },
        custom_fields: { loan_reference: `LD-BATCH-2026-${pad(m)}` },
        lines: [
          [ACC.gcb, principal + interest + fees, 0],
          [ACC.loans, 0, principal, "Principal recovered"],
          [ACC.interest, 0, interest, "Interest earned"],
          [ACC.fees, 0, fees, "Processing & late fees"],
        ],
      });
    }
    if ([2, 5, 8].includes(m) && inMonth(25)) {
      J({
        date: d(m, 25),
        memo: `Loan disbursements – ${monthName} (LoanDrift)`,
        source: { type: "LOANS", reference: `LD-DISB-2026-${pad(m)}` },
        lines: [
          [ACC.loans, 60000, 0, "Principal disbursed"],
          [ACC.gcb, 0, 60000],
        ],
      });
    }

    // Store Management sales summaries (twice a month, rotating branches)
    let cashTaken = 0;
    let momoTaken = 0;
    [14, ld].forEach((day, i) => {
      if (!inMonth(day)) return;
      const branch = [BR.adum, BR.osu, BR.tkd][(m + i) % 3];
      const branchCode = branch === BR.adum ? "ADM" : branch === BR.osu ? "OSU" : "TKD";
      const gross = money(48000, 62000, 10);
      const net = round2(gross / 1.2);
      const vat = round2(gross - net);
      const cash = round2(gross * 0.35);
      const momo = round2(gross - cash);
      const cost = round2(net * 0.55);
      cashTaken += cash;
      momoTaken += momo;
      J({
        date: d(m, day),
        memo: `Store sales summary – ${branchCode} branch (${i === 0 ? `1–14 ${monthName.slice(0, 3)}` : `15–${ld} ${monthName.slice(0, 3)}`})`,
        source: { type: "STORE_MANAGEMENT", reference: `SM-${branchCode}-2026${pad(m)}-${i + 1}` },
        branch,
        lines: [
          [ACC.cash, cash, 0, "Cash takings"],
          [ACC.momo, momo, 0, "MoMo takings"],
          [ACC.sales, 0, net],
          [ACC.vatOut, 0, vat, "VAT & levies"],
          [ACC.cogs, cost, 0, "Cost of goods sold"],
          [ACC.inventory, 0, cost],
        ],
      });
    });

    // Cash & MoMo sweeps into GCB
    if (inMonth(ld) && cashTaken > 0) {
      const deposit = Math.floor((cashTaken * 0.9) / 100) * 100;
      J({
        date: d(m, ld),
        memo: `Cash deposit to GCB – ${monthName}`,
        source: { type: "BANKING", reference: `DEP-${pad(m)}` },
        lines: [
          [ACC.gcb, deposit, 0],
          [ACC.cash, 0, deposit],
        ],
        hour: 17,
      });
      const sweep = Math.floor((momoTaken * 0.95) / 100) * 100;
      J({
        date: d(m, ld),
        memo: `MoMo wallet sweep to GCB – ${monthName}`,
        source: { type: "BANKING", reference: `MOMO-SWP-${pad(m)}` },
        lines: [
          [ACC.gcb, sweep, 0],
          [ACC.momo, 0, sweep],
        ],
        hour: 18,
      });
    }

    // Payroll (ZelosHR)
    if (inMonth(27)) {
      J({
        date: d(m, 27),
        memo: `Payroll funding transfer – ${monthName}`,
        source: { type: "BANKING", reference: `PAY-FUND-${pad(m)}` },
        lines: [
          [ACC.eco, 30000, 0],
          [ACC.gcb, 0, 30000],
        ],
      });
    }
    if (inMonth(28)) {
      J({
        date: d(m, 28),
        memo: `Payroll – ${monthName} 2026 (ZelosHR)`,
        source: { type: "HR", reference: `ZHR-PAY-2026-${pad(m)}` },
        lines: [
          [ACC.salaries, 40680, 0, "Gross pay + employer SSNIT 13%"],
          [ACC.paye, 0, 4200, "PAYE withheld"],
          [ACC.ssnit, 0, 6660, "SSNIT employee 5.5% + employer 13%"],
          [ACC.eco, 0, 29820, "Net pay"],
        ],
      });
    }
    if (m > 1 && inMonth(14)) {
      J({
        date: d(m, 14),
        memo: `PAYE & SSNIT remittance for ${MONTH_NAMES[m - 2]}`,
        source: { type: "BANKING", reference: `GRA-SSNIT-${pad(m - 1)}` },
        lines: [
          [ACC.paye, 4200, 0, "GRA – PAYE"],
          [ACC.ssnit, 6660, 0, "SSNIT Tier 1 & 2"],
          [ACC.gcb, 0, 10860],
        ],
      });
    }

    // Depreciation & bank charges at month end
    if (inMonth(ld)) {
      J({
        date: d(m, ld),
        memo: `Monthly depreciation – ${monthName} 2026`,
        source: { type: "SYSTEM", reference: `DEP-2026-${pad(m)}` },
        lines: [
          [ACC.depreciation, m < 5 ? 2916.67 : 3666.67, 0],
          [ACC.accDep, 0, m < 5 ? 2916.67 : 3666.67],
        ],
        hour: 23,
      });
      const charges = money(180, 420, 5);
      J({
        date: d(m, ld),
        memo: `GCB account maintenance & transfer charges – ${monthName}`,
        source: { type: "BANKING", reference: `GCB-CHG-${pad(m)}` },
        lines: [
          [ACC.bankCharges, charges, 0],
          [ACC.gcb, 0, charges],
        ],
        hour: 22,
      });
    }
  }

  // One-off entries that tell the story of the year.
  J({
    date: d(1, 15),
    memo: "Annual fire & burglary insurance – Gye Nyame Insurance",
    source: { type: "MANUAL", reference: "GNI-POL-2026-0117" },
    custom_fields: { supporting_document: "PV-2026-0117 · Finance cabinet A" },
    lines: [
      [ACC.prepaid, 9600, 0],
      [ACC.gcb, 0, 9600],
    ],
  });
  const fundRate = fx("USD", d(2, 3));
  J({
    date: d(2, 3),
    memo: "Purchase of US$5,000 for import payments (GCB → Ecobank USD)",
    source: { type: "BANKING", reference: "FX-BUY-0203" },
    by: USERS.ama,
    lines: [
      { account_id: ACC.usd, debit: toBase(5000, fundRate), credit: 0, currency: "USD", amount_fc: 5000 },
      [ACC.gcb, 0, toBase(5000, fundRate)],
    ],
  });
  const chargeRate = fx("USD", d(9, 30));
  J({
    date: d(9, 30),
    memo: "Ecobank USD account maintenance fee – September",
    source: { type: "BANKING", reference: "ECO-USD-CHG-09" },
    lines: [
      [ACC.bankCharges, toBase(35, chargeRate), 0],
      { account_id: ACC.usd, debit: 0, credit: toBase(35, chargeRate), currency: "USD", amount_fc: 35 },
    ],
    hour: 21,
  });
  J({
    date: d(5, 12),
    memo: "Delivery van purchase – Toyota Hiace (GT 4471-26)",
    source: { type: "MANUAL", reference: "PO-2026-031" },
    by: USERS.ama,
    lines: [
      [ACC.ppe, 45000, 0],
      [ACC.gcb, 0, 45000],
    ],
  });

  const wrong = J({
    date: d(8, 18),
    memo: "Van gearbox repair – Nkwanta Motors",
    source: { type: "MANUAL", reference: "NMW-CASH-0818" },
    status: "REVERSED",
    lines: [
      [ACC.marketing, 4500, 0],
      [ACC.gcb, 0, 4500],
    ],
  });
  const reversal = J({
    date: d(8, 19),
    memo: "Reversal of van gearbox repair – posted to Marketing in error",
    source: { type: "MANUAL", reference: "NMW-CASH-0818" },
    by: USERS.ama,
    lines: [
      [ACC.gcb, 4500, 0],
      [ACC.marketing, 0, 4500],
    ],
  });
  wrong.reversed_by_id = reversal.id;
  reversal.reversal_of_id = wrong.id;
  J({
    date: d(8, 19),
    memo: "Van gearbox repair – Nkwanta Motors (corrected)",
    source: { type: "MANUAL", reference: "NMW-CASH-0818" },
    lines: [
      [ACC.repairs, 4500, 0],
      [ACC.gcb, 0, 4500],
    ],
  });
  J({
    date: d(9, 30),
    memo: "POS sales – Osu branch till export (September)",
    source: { type: "IMPORT", reference: "IMP-0005" },
    branch: BR.osu,
    by: USERS.efua,
    lines: [
      [ACC.cash, 8400, 0],
      [ACC.sales, 0, 7000],
      [ACC.vatOut, 0, 1400, "VAT & levies"],
    ],
  });
  J({
    date: d(9, 30),
    memo: "Audit fee accrual – Q3 2026",
    source: { type: "MANUAL", reference: "ACR-2026-Q3" },
    lines: [
      [ACC.professional, 6000, 0],
      [ACC.accrued, 0, 6000],
    ],
  });
  J({
    date: d(10, 2),
    memo: "Staff bonus provision – FY2026",
    source: { type: "MANUAL", reference: "BON-2026" },
    status: "PENDING_APPROVAL",
    by: USERS.efua,
    lines: [
      [ACC.salaries, 65000, 0],
      [ACC.accrued, 0, 65000],
    ],
  });
  J({
    date: d(10, 4),
    memo: "Reclass van tyres from Office Supplies to Repairs",
    source: { type: "MANUAL" },
    status: "DRAFT",
    lines: [
      [ACC.repairs, 850, 0],
      [ACC.office, 0, 850],
    ],
  });

  // ---- Receipts & supplier payments ----------------------------------------
  plannedPayments.sort((a, b) => a.date.localeCompare(b.date));
  const receipts: Payment[] = [];
  const supplierPayments: Payment[] = [];
  const bankGl: Record<string, string> = { ba_gcb: ACC.gcb, ba_momo: ACC.momo, ba_usd: ACC.usd };
  const bankCurrency: Record<string, string> = { ba_usd: "USD" };
  for (const p of plannedPayments) {
    const isReceipt = p.kind === "RECEIPT";
    const list = isReceipt ? receipts : supplierPayments;
    const number = `${isReceipt ? "RCT" : "PAY"}-2026-${String(list.length + 1).padStart(4, "0")}`;
    const partyId = isReceipt ? (p.doc as SalesInvoice).customer_id : (p.doc as PurchaseBill).supplier_id;
    const partyName = (isReceipt ? customers : suppliers).find((x) => x.id === partyId)!.name;
    const total = documentTotals(p.doc.lines, taxCodes).total;
    const payRate = p.doc.currency === "GHS" ? 1 : fx(p.doc.currency, p.date);
    const carrying = carryingBaseFor(p.doc, total, p.amount);
    const settlement = settlementLines({
      kind: p.kind,
      currency: p.doc.currency,
      amountFc: p.amount,
      payRate,
      carryingBase: carrying,
      bankGl: bankGl[p.bank],
      bankCurrency: bankCurrency[p.bank] ?? "GHS",
      partyAccount: isReceipt ? ACC.ar : ACC.ap,
      partyName,
      fxAccount: ACC.fxRealised,
    });
    const journal = J({
      date: p.date,
      memo: isReceipt
        ? `Receipt ${number} from ${partyName} for ${p.doc.number}`
        : `Payment ${number} to ${partyName} for ${p.doc.number}`,
      source: { type: isReceipt ? "SALES" : "PURCHASES", reference: number, document_id: p.doc.id },
      branch: p.doc.branch_id ?? BR.adum,
      lines: settlement.lines,
    });
    p.doc.amount_paid = round2(p.doc.amount_paid + p.amount);
    p.doc.amount_paid_base = round2(p.doc.amount_paid_base + carrying);
    list.push({
      id: `${isReceipt ? "rcp" : "pmt"}_${list.length + 1}`,
      number,
      party_id: partyId,
      document_id: p.doc.id,
      date: p.date,
      amount: p.amount,
      currency: p.doc.currency,
      exchange_rate: payRate,
      base_amount: settlement.bankBase,
      fx_gain_loss: settlement.fxGainLoss,
      method: p.method,
      bank_account_id: p.bank,
      reference: p.method === "CHEQUE" ? `CHQ ${int(100000, 999999)}` : `TRF${int(10000000, 99999999)}`,
      journal_id: journal.id,
      ...stamp(journal.created_at, journal.created_by_id === USERS.efua.id ? USERS.efua : USERS.kofi),
    });
  }

  // ---- VAT returns: settle each month's net VAT on the 15th of the next ----
  for (let m = 1; m <= 9; m++) {
    const key = `2026-${pad(m)}`;
    let output = 0;
    let input = 0;
    for (const j of journals) {
      if (!j.date.startsWith(key)) continue;
      for (const l of j.lines) {
        if (l.account_id === ACC.vatOut) output += l.credit;
        if (l.account_id === ACC.vatIn) input += l.debit;
      }
    }
    output = round2(output);
    input = round2(input);
    const date = d(m + 1, 15);
    if (date > DEMO_TODAY || output - input <= 0) continue;
    J({
      date,
      memo: `VAT & levies return – ${MONTH_NAMES[m - 1]} 2026 (GRA)`,
      source: { type: "BANKING", reference: `GRA-VAT-${pad(m)}` },
      by: USERS.ama,
      lines: [
        [ACC.vatOut, output, 0, "Output tax for the month"],
        [ACC.vatIn, 0, input, "Input tax recovered"],
        [ACC.gcb, 0, round2(output - input), "Net paid to GRA"],
      ],
    });
  }

  // Number journals in date order, the way the ledger would have issued them.
  journals.sort((a, b) =>
    a.date === b.date ? a.created_at.localeCompare(b.created_at) : a.date.localeCompare(b.date),
  );
  journals.forEach((j, i) => {
    j.number = `JE-2026-${String(i + 1).padStart(4, "0")}`;
  });

  return { journals, invoices, bills, receipts, supplierPayments };
};

// ---------------------------------------------------------------------------
// Banking
// ---------------------------------------------------------------------------

const buildBanking = (journals: JournalEntry[]) => {
  const ledgerBalance = (gl: string, to: string) =>
    round2(
      journals
        .filter((j) => (j.status === "POSTED" || j.status === "REVERSED") && j.date <= to)
        .flatMap((j) => j.lines)
        .filter((l) => l.account_id === gl)
        .reduce((s, l) => s + l.debit - l.credit, 0),
    );

  const statementFrom = "2026-09-01";
  const statementTo = "2026-10-04";
  const gcbEntries = journals
    .filter(
      (j) =>
        (j.status === "POSTED" || j.status === "REVERSED") &&
        j.date >= statementFrom &&
        j.date <= statementTo &&
        j.lines.some((l) => l.account_id === ACC.gcb),
    )
    .sort((a, b) => a.date.localeCompare(b.date));

  const lines: BankStatementLine[] = [];
  let seq = 0;
  // The last two outgoing payments have not cleared the bank yet.
  const inTransit = new Set(
    gcbEntries
      .filter((j) => j.lines.some((l) => l.account_id === ACC.gcb && l.credit > 0))
      .slice(-2)
      .map((j) => j.id),
  );
  gcbEntries.forEach((j, i) => {
    if (inTransit.has(j.id)) return;
    const amount = round2(
      j.lines.filter((l) => l.account_id === ACC.gcb).reduce((s, l) => s + l.debit - l.credit, 0),
    );
    if (amount === 0) return;
    seq += 1;
    const ratio = i / gcbEntries.length;
    const status = ratio < 0.62 ? "MATCHED" : ratio < 0.86 ? "SUGGESTED" : "UNMATCHED";
    const clearDays = amount < 0 && j.source.type === "PURCHASES" ? 1 : 0;
    lines.push({
      id: `bsl_${seq}`,
      bank_account_id: "ba_gcb",
      date: addDays(j.date, clearDays) > statementTo ? j.date : addDays(j.date, clearDays),
      description: bankNarrative(j),
      amount,
      status,
      matched_journal_id: status === "MATCHED" ? j.id : null,
      suggested_journal_id: status === "SUGGESTED" ? j.id : null,
    });
  });
  const unrecorded: [string, string, number][] = [
    ["2026-09-30", "SMS ALERT CHARGES SEP 2026", -36],
    ["2026-09-30", "CREDIT INTEREST – CURRENT ACCOUNT", 142.5],
    ["2026-10-02", "RETURNED CHQ FEE – CHQ 004471", -50],
    ["2026-10-03", "TRF FROM OSU FRESH MART – NO REF", 1850],
  ];
  for (const [date, description, amount] of unrecorded) {
    seq += 1;
    lines.push({
      id: `bsl_${seq}`,
      bank_account_id: "ba_gcb",
      date,
      description,
      amount,
      status: "UNMATCHED",
      matched_journal_id: null,
      suggested_journal_id: null,
    });
  }
  lines.sort((a, b) => a.date.localeCompare(b.date));

  const statementBalance = round2(
    ledgerBalance(ACC.gcb, "2026-08-31") + lines.reduce((s, l) => s + l.amount, 0),
  );

  const bankStamp = stamp("2026-01-02T08:30:00.000Z", USERS.ama);
  const accounts: BankAccount[] = [
    {
      id: "ba_gcb",
      name: "GCB Operating Account",
      bank: "GCB Bank PLC",
      account_number: "••••4471",
      gl_account_id: ACC.gcb,
      currency: "GHS",
      statement_balance: statementBalance,
      statement_date: statementTo,
      last_reconciled_at: "2026-09-12T15:20:00.000Z",
      ...bankStamp,
    },
    {
      id: "ba_eco",
      name: "Ecobank Payroll Account",
      bank: "Ecobank Ghana",
      account_number: "••••0938",
      gl_account_id: ACC.eco,
      currency: "GHS",
      statement_balance: ledgerBalance(ACC.eco, statementTo),
      statement_date: statementTo,
      last_reconciled_at: "2026-10-01T10:05:00.000Z",
      ...bankStamp,
    },
    {
      id: "ba_momo",
      name: "MTN MoMo Merchant Wallet",
      bank: "MTN Mobile Money",
      account_number: "••••2210",
      gl_account_id: ACC.momo,
      currency: "GHS",
      statement_balance: ledgerBalance(ACC.momo, statementTo),
      statement_date: statementTo,
      last_reconciled_at: "2026-10-01T10:12:00.000Z",
      ...bankStamp,
    },
    {
      id: "ba_usd",
      name: "Ecobank USD Domiciliary",
      bank: "Ecobank Ghana",
      account_number: "••••7702",
      gl_account_id: ACC.usd,
      currency: "USD",
      statement_balance: accountBalances(journals, ACC.usd, statementTo).fc,
      statement_date: statementTo,
      last_reconciled_at: "2026-10-01T10:20:00.000Z",
      ...bankStamp,
    },
    {
      id: "ba_cash",
      name: "Cash on Hand (all branches)",
      bank: "Petty cash",
      account_number: "—",
      gl_account_id: ACC.cash,
      currency: "GHS",
      statement_balance: ledgerBalance(ACC.cash, statementTo),
      statement_date: statementTo,
      last_reconciled_at: "2026-09-30T18:00:00.000Z",
      ...bankStamp,
    },
  ];
  return { bankAccounts: accounts, statementLines: lines };
};

const bankNarrative = (j: JournalEntry) => {
  const ref = j.reference ? ` ${j.reference}` : "";
  switch (j.source.type) {
    case "SALES":
      return `TRF IN${ref} ${j.memo.split(" from ")[1]?.split(" for ")[0]?.toUpperCase() ?? ""}`.trim();
    case "PURCHASES":
      return `TRF OUT${ref} ${j.memo.split(" to ")[1]?.split(" for ")[0]?.toUpperCase() ?? ""}`.trim();
    case "LOANS":
      return `LOANDRIFT COLLECTIONS${ref}`;
    default:
      return j.memo.toUpperCase().slice(0, 52);
  }
};

// ---------------------------------------------------------------------------
// Integration layer
// ---------------------------------------------------------------------------

const dsStamp = (at: string) => stamp(at, USERS.ama);

const buildDataSources = (): DataSource[] => [
  {
    id: "ds_store",
    name: "Store Management",
    provider: "Trovesuite",
    kind: "TROVESUITE",
    status: "CONNECTED",
    description: "Sales, returns, purchases and stock movements from all three branches.",
    sync_direction: "INBOUND",
    schedule: "Every 15 minutes",
    entities: ["Sales", "Sales returns", "Purchases", "Stock adjustments", "Customers"],
    last_run_at: "2026-10-05T19:30:00.000Z",
    last_run_status: "SUCCESS",
    records_synced: 18432,
    error_count: 0,
    connection: { Tenant: "kumasi-traders", Environment: "Production", "Event stream": "store.events.v1" },
    ...dsStamp("2026-01-04T09:00:00.000Z"),
  },
  {
    id: "ds_loans",
    name: "LoanDrift",
    provider: "Trovesuite",
    kind: "TROVESUITE",
    status: "CONNECTED",
    description: "Disbursements, repayments, interest and fees from the lending book.",
    sync_direction: "INBOUND",
    schedule: "Hourly",
    entities: ["Disbursements", "Repayments", "Interest", "Fees", "Write-offs"],
    last_run_at: "2026-10-05T19:00:00.000Z",
    last_run_status: "SUCCESS",
    records_synced: 2915,
    error_count: 0,
    connection: { Tenant: "kt-microfinance", Environment: "Production", "Event stream": "loans.events.v1" },
    ...dsStamp("2026-01-04T09:10:00.000Z"),
  },
  {
    id: "ds_hr",
    name: "ZelosHR",
    provider: "Trovesuite",
    kind: "TROVESUITE",
    status: "WARNING",
    description: "Payroll journals, employee expenses and department structure.",
    sync_direction: "INBOUND",
    schedule: "Daily at 22:00",
    entities: ["Payroll journals", "Employee expenses", "Departments"],
    last_run_at: "2026-10-04T22:00:00.000Z",
    last_run_status: "PARTIAL",
    records_synced: 412,
    error_count: 3,
    status_message: "3 employees have no cost centre mapped. Their expenses are held for review.",
    connection: { Tenant: "kumasi-traders", Environment: "Production" },
    ...dsStamp("2026-02-01T09:00:00.000Z"),
  },
  {
    id: "ds_attendance",
    name: "Attendance",
    provider: "Trovesuite",
    kind: "TROVESUITE",
    status: "NOT_CONNECTED",
    description: "Overtime hours for payroll costing and project time allocation.",
    sync_direction: "INBOUND",
    schedule: "Manual",
    entities: ["Overtime hours", "Project time"],
    last_run_at: null,
    last_run_status: null,
    records_synced: 0,
    error_count: 0,
    connection: {},
    ...dsStamp("2026-01-04T09:00:00.000Z"),
  },
  {
    id: "ds_quickbooks",
    name: "QuickBooks Online",
    provider: "Intuit",
    kind: "ACCOUNTING_SYSTEM",
    status: "CONNECTED",
    description: "Migration source. Chart of accounts, contacts, open items and opening balances.",
    sync_direction: "INBOUND",
    schedule: "One-off migration",
    entities: ["Chart of accounts", "Customers", "Suppliers", "Open invoices", "Opening balances"],
    last_run_at: "2026-01-02T11:42:00.000Z",
    last_run_status: "SUCCESS",
    records_synced: 1288,
    error_count: 0,
    connection: { Company: "Kumasi Traders (QBO)", Realm: "9130 3571 2245", "Cut-over date": "31 Dec 2025" },
    ...dsStamp("2026-01-02T09:00:00.000Z"),
  },
  {
    id: "ds_odoo",
    name: "Odoo",
    provider: "Odoo S.A.",
    kind: "ACCOUNTING_SYSTEM",
    status: "NOT_CONNECTED",
    description: "Migrate or keep syncing invoices, bills and contacts from Odoo.",
    sync_direction: "INBOUND",
    schedule: "Manual",
    entities: ["Chart of accounts", "Contacts", "Invoices", "Bills", "Journals"],
    last_run_at: null,
    last_run_status: null,
    records_synced: 0,
    error_count: 0,
    connection: {},
    ...dsStamp("2026-01-02T09:00:00.000Z"),
  },
  {
    id: "ds_xero",
    name: "Xero",
    provider: "Xero Ltd",
    kind: "ACCOUNTING_SYSTEM",
    status: "NOT_CONNECTED",
    description: "Bring contacts, invoices and bank transactions across from Xero.",
    sync_direction: "INBOUND",
    schedule: "Manual",
    entities: ["Contacts", "Invoices", "Bills", "Bank transactions"],
    last_run_at: null,
    last_run_status: null,
    records_synced: 0,
    error_count: 0,
    connection: {},
    ...dsStamp("2026-01-02T09:00:00.000Z"),
  },
  {
    id: "ds_sage",
    name: "Sage 50",
    provider: "Sage",
    kind: "ACCOUNTING_SYSTEM",
    status: "NOT_CONNECTED",
    description: "File-based migration from Sage 50 exports.",
    sync_direction: "INBOUND",
    schedule: "Manual",
    entities: ["Nominal ledger", "Customers", "Suppliers", "Audit trail"],
    last_run_at: null,
    last_run_status: null,
    records_synced: 0,
    error_count: 0,
    connection: {},
    ...dsStamp("2026-01-02T09:00:00.000Z"),
  },
  {
    id: "ds_csv",
    name: "CSV / Excel upload",
    provider: "Files",
    kind: "FILE",
    status: "CONNECTED",
    description: "Upload spreadsheets of invoices, bills, contacts, journals or opening balances.",
    sync_direction: "INBOUND",
    schedule: "Manual",
    entities: ["Invoices", "Bills", "Customers", "Suppliers", "Journals", "Opening balances"],
    last_run_at: "2026-10-03T14:12:00.000Z",
    last_run_status: "PARTIAL",
    records_synced: 341,
    error_count: 2,
    connection: { "Accepted formats": ".csv, .xlsx", "Max rows": "10,000 per file" },
    ...dsStamp("2026-01-02T09:00:00.000Z"),
  },
  {
    id: "ds_bank_gcb",
    name: "GCB statement feed",
    provider: "GCB Bank PLC",
    kind: "BANK",
    status: "CONNECTED",
    description: "Daily statement lines for the operating account, ready for reconciliation.",
    sync_direction: "INBOUND",
    schedule: "Daily at 06:00",
    entities: ["Bank statement lines"],
    last_run_at: "2026-10-05T06:00:00.000Z",
    last_run_status: "SUCCESS",
    records_synced: 1604,
    error_count: 0,
    connection: { Account: "••••4471", Format: "ISO 20022 camt.053" },
    ...dsStamp("2026-01-05T09:00:00.000Z"),
  },
  {
    id: "ds_pos",
    name: "Osu branch POS",
    provider: "External POS (REST)",
    kind: "API",
    status: "ERROR",
    description: "Third-party till system at the Osu branch, pushing sales via webhook.",
    sync_direction: "INBOUND",
    schedule: "Webhook (real-time)",
    entities: ["Sales"],
    last_run_at: "2026-10-01T08:14:00.000Z",
    last_run_status: "FAILED",
    records_synced: 6120,
    error_count: 47,
    status_message: "Authentication failed: the API token expired on 01 Oct 2026. 47 webhook calls rejected.",
    connection: { Endpoint: "https://pos.osu.example/api/v2", Auth: "Bearer token (expired)" },
    ...dsStamp("2026-03-11T09:00:00.000Z"),
  },
  {
    id: "ds_api",
    name: "Public API & webhooks",
    provider: "Trovesuite",
    kind: "API",
    status: "CONNECTED",
    description: "Push canonical invoices, payments and journals from any system.",
    sync_direction: "BIDIRECTIONAL",
    schedule: "Real-time",
    entities: ["Invoices", "Payments", "Journals", "Contacts"],
    last_run_at: "2026-10-05T18:51:00.000Z",
    last_run_status: "SUCCESS",
    records_synced: 734,
    error_count: 0,
    connection: { "Base URL": "https://api.trovesuite.com/accounting/v1", Keys: "2 active" },
    ...dsStamp("2026-04-01T09:00:00.000Z"),
  },
];

const rec = (
  row: number,
  ref: string,
  summary: string,
  amount: number,
  status: "VALID" | "WARNING" | "ERROR" = "VALID",
  message?: string,
  posted = status !== "ERROR",
) => ({ row, external_reference: ref, summary, amount, status, message, posted });

const buildImportBatches = (journals: JournalEntry[]): ImportBatch[] => {
  const jByRef = (ref: string) => journals.find((j) => j.source.reference === ref)?.id ?? null;
  return [
    {
      id: "imp_1",
      number: "IMP-0001",
      source_id: "ds_quickbooks",
      entity: "Opening balances",
      file_name: null,
      status: "POSTED",
      records: [
        rec(1, "QB-ACC-1000", "Cash on hand", 15000),
        rec(2, "QB-ACC-1010", "GCB operating", 420000),
        rec(3, "QB-ACC-1015", "Ecobank payroll", 60000),
        rec(4, "QB-ACC-1300", "Inventory asset", 180000),
        rec(5, "QB-ACC-1500", "Fixed assets (net of dep.)", 280000),
        rec(6, "QB-ACC-1150", "Loans receivable", 250000),
        rec(7, "QB-ACC-2300", "Stanbic loan", -300000),
        rec(8, "QB-ACC-3000", "Owner's equity", -905000),
      ],
      journal_id: jByRef("IMP-0001"),
      ...stamp("2026-01-02T11:42:00.000Z", USERS.ama),
    },
    {
      id: "imp_2",
      number: "IMP-0002",
      source_id: "ds_quickbooks",
      entity: "Customers",
      file_name: null,
      status: "POSTED",
      records: [
        rec(1, "QB-CUS-118", "Osu Fresh Mart", 0),
        rec(2, "QB-CUS-131", "Akwaaba Hotels Group", 0),
        rec(3, "QB-CUS-140", "Kasoa Building Supplies", 0, "WARNING", "No email address; imported without one."),
      ],
      journal_id: null,
      ...stamp("2026-01-02T11:50:00.000Z", USERS.ama),
    },
    {
      id: "imp_3",
      number: "IMP-0003",
      source_id: "ds_csv",
      entity: "Invoices",
      file_name: "legacy-open-invoices.xlsx",
      status: "PARTIALLY_POSTED",
      records: [
        rec(1, "LEG-INV-2291", "Adom Supermarket Ltd · 2 lines", 12400),
        rec(2, "LEG-INV-2292", "Volta Agro Processors · 1 line", 8800),
        rec(3, "LEG-INV-2293", "Unknown customer 'Asante Bros'", 4100, "ERROR", "Customer not found and auto-create is off."),
        rec(4, "LEG-INV-2294", "Bekwai Rural Bank · 1 line", 3150),
        rec(5, "LEG-INV-2295", "Account code 4999 not mapped", 2200, "ERROR", "Legacy account 4999 has no mapping to the chart of accounts."),
      ],
      journal_id: null,
      ...stamp("2026-01-06T10:15:00.000Z", USERS.kofi),
    },
    {
      id: "imp_4",
      number: "IMP-0004",
      source_id: "ds_bank_gcb",
      entity: "Bank statement lines",
      file_name: "gcb-4471-aug-2026.xml",
      status: "POSTED",
      records: [
        rec(1, "FT26231A", "TRF IN – ADOM SUPERMARKET", 18240),
        rec(2, "FT26231B", "TRF OUT – TEMA WHOLESALE FOODS", -42110),
        rec(3, "FT26240C", "LOANDRIFT COLLECTIONS", 22605),
        rec(4, "FT26243D", "STANBIC LOAN INSTALMENT", -11000),
      ],
      journal_id: null,
      ...stamp("2026-09-01T06:00:00.000Z", USERS.kofi),
    },
    {
      id: "imp_5",
      number: "IMP-0005",
      source_id: "ds_pos",
      entity: "Sales",
      file_name: "osu-till-export-sep.csv",
      status: "POSTED",
      records: [
        rec(1, "OSU-Z-0901", "Z-report 01–10 Sep", 2760),
        rec(2, "OSU-Z-0911", "Z-report 11–20 Sep", 2890),
        rec(3, "OSU-Z-0921", "Z-report 21–30 Sep", 2750, "WARNING", "Rounding difference of GH₵0.40 absorbed."),
      ],
      journal_id: jByRef("IMP-0005"),
      ...stamp("2026-09-30T19:40:00.000Z", USERS.efua),
    },
    {
      id: "imp_6",
      number: "IMP-0006",
      source_id: "ds_csv",
      entity: "Bills",
      file_name: "takoradi-branch-bills-sep.csv",
      status: "NEEDS_REVIEW",
      records: [
        rec(1, "TKD-B-311", "Adinkra Logistics · haulage", 3600, "VALID", undefined, false),
        rec(2, "TKD-B-312", "Volta Power · electricity", 1980, "VALID", undefined, false),
        rec(3, "TKD-B-313", "Supplier TIN missing", 750, "WARNING", "Supplier has no TIN; withholding tax may apply.", false),
        rec(4, "TKD-B-314", "Duplicate of TKD-B-311", 3600, "ERROR", "Same supplier, date and amount as row 1.", false),
        rec(5, "TKD-B-315", "Date 31/09/2026 is invalid", 420, "ERROR", "September has 30 days.", false),
      ],
      journal_id: null,
      ...stamp("2026-10-03T14:12:00.000Z", USERS.kofi),
    },
    {
      id: "imp_7",
      number: "IMP-0007",
      source_id: "ds_pos",
      entity: "Sales",
      file_name: null,
      status: "FAILED",
      records: [
        rec(1, "OSU-WH-1001", "Webhook batch 01 Oct", 0, "ERROR", "401 Unauthorized – token expired."),
      ],
      journal_id: null,
      ...stamp("2026-10-01T08:14:00.000Z", USERS.efua),
    },
  ];
};

const M = (
  id: string,
  source_id: string,
  entity: string,
  source_field: string,
  target_field: string,
  transform = "—",
  required = false,
): FieldMapping => ({ id, source_id, entity, source_field, target_field, transform, required });

const buildFieldMappings = (): FieldMapping[] => [
  M("fm_1", "ds_store", "Sales", "sale_id", "source.reference", "—", true),
  M("fm_2", "ds_store", "Sales", "sale_date", "journal.date", "date: YYYY-MM-DD", true),
  M("fm_3", "ds_store", "Sales", "branch_code", "dimension.branch", "lookup: branch code", true),
  M("fm_4", "ds_store", "Sales", "customer_no", "customer.external_reference", "lookup: customer (optional)"),
  M("fm_5", "ds_store", "Sales", "net_amount", "amounts.subtotal", "decimal(2)", true),
  M("fm_6", "ds_store", "Sales", "vat_amount", "amounts.tax", "decimal(2)", true),
  M("fm_7", "ds_store", "Sales", "gross_amount", "amounts.total", "decimal(2)", true),
  M("fm_8", "ds_store", "Sales", "cost_amount", "amounts.cost", "decimal(2)"),
  M("fm_9", "ds_store", "Sales", "payment_method", "payment.method", "map: CASH→CASH, MOMO→MOBILE_MONEY, CARD→BANK_TRANSFER"),
  M("fm_10", "ds_loans", "Repayments", "repayment_id", "source.reference", "—", true),
  M("fm_11", "ds_loans", "Repayments", "loan_ref", "custom.loan_reference", "—", true),
  M("fm_12", "ds_loans", "Repayments", "principal_paid", "amounts.principal", "decimal(2)", true),
  M("fm_13", "ds_loans", "Repayments", "interest_paid", "amounts.interest", "decimal(2)", true),
  M("fm_14", "ds_loans", "Repayments", "penalty_paid", "amounts.fees", "decimal(2)"),
  M("fm_15", "ds_loans", "Repayments", "paid_at", "journal.date", "date: ISO-8601 → local date", true),
  M("fm_16", "ds_csv", "Invoices", "Invoice No", "invoice.external_reference", "trim", true),
  M("fm_17", "ds_csv", "Invoices", "Customer", "invoice.customer", "lookup: customer by name", true),
  M("fm_18", "ds_csv", "Invoices", "Date", "invoice.issue_date", "date: DD/MM/YYYY", true),
  M("fm_19", "ds_csv", "Invoices", "Due", "invoice.due_date", "date: DD/MM/YYYY · default +30 days"),
  M("fm_20", "ds_csv", "Invoices", "Description", "line.description", "trim", true),
  M("fm_21", "ds_csv", "Invoices", "Qty", "line.quantity", "decimal(3) · default 1"),
  M("fm_22", "ds_csv", "Invoices", "Unit Price", "line.unit_price", "decimal(2)", true),
  M("fm_23", "ds_csv", "Invoices", "Tax", "line.tax_code", "map: 20%→GH-STD, 0→EXEMPT"),
  M("fm_24", "ds_csv", "Invoices", "Account Code", "line.account", "lookup: legacy account map", true),
  M("fm_25", "ds_quickbooks", "Customers", "DisplayName", "customer.name", "trim", true),
  M("fm_26", "ds_quickbooks", "Customers", "PrimaryEmailAddr.Address", "customer.email", "lowercase"),
  M("fm_27", "ds_quickbooks", "Customers", "Id", "customer.external_reference", "prefix: QB-CUS-", true),
  M("fm_28", "ds_quickbooks", "Customers", "SalesTermRef.name", "customer.payment_terms_days", "map: Net 30→30, Net 14→14"),
  M("fm_29", "ds_hr", "Payroll journals", "employee_no", "custom.employee_number", "—", true),
  M("fm_30", "ds_hr", "Payroll journals", "department", "dimension.department", "lookup: department name", true),
  M("fm_31", "ds_hr", "Payroll journals", "cost_center", "dimension.cost_centre", "lookup: cost centre code", true),
  M("fm_32", "ds_hr", "Payroll journals", "gross_pay", "amounts.total", "decimal(2)", true),
];

const CF = (
  id: string,
  entity: CustomField["entity"],
  position: number,
  key: string,
  label: string,
  type: CustomField["type"],
  scope: CustomField["scope"],
  extra: Partial<CustomField> = {},
): CustomField => ({
  id,
  entity,
  key,
  label,
  type,
  scope,
  required: false,
  is_active: true,
  position,
  show_in_list: false,
  ...stamp("2026-01-05T09:00:00.000Z", USERS.ama),
  ...extra,
});

const buildCustomFields = (): CustomField[] => [
  CF("cf_1", "Customer", 1, "sales_region", "Sales region", "SELECT", "FINANCIAL", {
    options: ["Ashanti", "Greater Accra", "Western", "Central", "Northern", "Volta"],
    show_in_list: true,
    description: "Used for regional sales reporting.",
  }),
  CF("cf_9", "Customer", 2, "key_account", "Key account", "BOOLEAN", "FINANCIAL", {
    show_in_list: true,
    default_value: "false",
    description: "Key accounts have a named relationship manager and quarterly reviews.",
  }),
  CF("cf_2", "Customer", 3, "store_customer_no", "Store customer number", "TEXT", "SOURCE_REFERENCE", {
    description: "Customer number in Store Management.",
  }),
  CF("cf_3", "Customer", 4, "quickbooks_id", "QuickBooks customer ID", "TEXT", "SOURCE_REFERENCE"),
  CF("cf_10", "Supplier", 1, "supplier_category", "Supplier category", "SELECT", "FINANCIAL", {
    options: ["Goods for resale", "Imports", "Utilities", "Logistics", "Professional services", "Office & admin"],
    show_in_list: true,
    description: "Groups spend for purchasing reviews.",
  }),
  CF("cf_8", "Supplier", 2, "ghipss_branch_code", "Bank branch sort code", "TEXT", "SOURCE_REFERENCE"),
  CF("cf_11", "Invoice", 1, "customer_po", "Customer PO number", "TEXT", "FINANCIAL", {
    show_in_list: true,
    description: "The customer's purchase order number. Printed on the invoice.",
  }),
  CF("cf_12", "Invoice", 2, "delivery_route", "Delivery route", "SELECT", "FINANCIAL", {
    options: ["Kumasi metro", "Accra corridor", "Western", "Northern", "Export"],
    show_in_list: true,
  }),
  CF("cf_4", "Invoice", 3, "pos_terminal", "POS terminal", "TEXT", "SOURCE_REFERENCE"),
  CF("cf_5", "Bill", 1, "purchase_order_no", "Purchase order number", "TEXT", "FINANCIAL", {
    required: true,
    show_in_list: true,
    description: "Our PO number. Bills without one cannot be approved.",
  }),
  CF("cf_7", "Journal", 1, "loan_reference", "Loan batch reference", "TEXT", "SOURCE_REFERENCE", {
    description: "Filled in by LoanDrift for repayment and disbursement batches.",
  }),
  CF("cf_13", "Journal", 2, "supporting_document", "Supporting document", "TEXT", "FINANCIAL", {
    description: "Voucher number and where the paper copy is filed.",
  }),
  CF("cf_6", "Account", 1, "legacy_account_code", "Legacy account code", "TEXT", "SOURCE_REFERENCE", {
    show_in_list: true,
    description: "Account code in QuickBooks before go-live. Used to map imported history.",
  }),
];

const ruleStamp = stamp("2026-01-04T12:00:00.000Z", USERS.ama);

const buildRules = (): AccountingRule[] => [
  {
    id: "rule_1",
    name: "Store sale completed",
    event: "store.sale.completed",
    source_id: "ds_store",
    description: "Recognise revenue, VAT and the cost of goods for every completed store sale.",
    is_active: true,
    lines: [
      { side: "DEBIT", account_id: ACC.momo, basis: "TOTAL", label: "Cash / MoMo received" },
      { side: "CREDIT", account_id: ACC.sales, basis: "SUBTOTAL", label: "Sales revenue" },
      { side: "CREDIT", account_id: ACC.vatOut, basis: "TAX", label: "VAT & levies payable" },
      { side: "DEBIT", account_id: ACC.cogs, basis: "COST", label: "Cost of goods sold" },
      { side: "CREDIT", account_id: ACC.inventory, basis: "COST", label: "Inventory relieved" },
    ],
    sample: { TOTAL: 1200, SUBTOTAL: 1000, TAX: 200, COST: 620 },
    postings_count: 20,
    ...ruleStamp,
  },
  {
    id: "rule_2",
    name: "Store sale returned",
    event: "store.sale.returned",
    source_id: "ds_store",
    description: "Reverse revenue and VAT, and put returned goods back into inventory.",
    is_active: true,
    lines: [
      { side: "DEBIT", account_id: ACC.sales, basis: "SUBTOTAL", label: "Sales revenue reversed" },
      { side: "DEBIT", account_id: ACC.vatOut, basis: "TAX", label: "VAT & levies reversed" },
      { side: "CREDIT", account_id: ACC.cash, basis: "TOTAL", label: "Refund paid" },
      { side: "DEBIT", account_id: ACC.inventory, basis: "COST", label: "Goods back in stock" },
      { side: "CREDIT", account_id: ACC.cogs, basis: "COST", label: "Cost of goods reversed" },
    ],
    sample: { TOTAL: 240, SUBTOTAL: 200, TAX: 40, COST: 124 },
    postings_count: 0,
    ...ruleStamp,
  },
  {
    id: "rule_3",
    name: "Store purchase received",
    event: "store.purchase.received",
    source_id: "ds_store",
    description: "Add received stock to inventory and recognise the supplier liability.",
    is_active: false,
    lines: [
      { side: "DEBIT", account_id: ACC.inventory, basis: "SUBTOTAL", label: "Inventory received" },
      { side: "DEBIT", account_id: ACC.vatIn, basis: "TAX", label: "Recoverable VAT" },
      { side: "CREDIT", account_id: ACC.ap, basis: "TOTAL", label: "Owed to supplier" },
    ],
    sample: { TOTAL: 6000, SUBTOTAL: 5000, TAX: 1000 },
    postings_count: 0,
    ...ruleStamp,
  },
  {
    id: "rule_4",
    name: "Loan disbursed",
    event: "loans.loan.disbursed",
    source_id: "ds_loans",
    description: "Move cash out to the client and add the principal to the loan book.",
    is_active: true,
    lines: [
      { side: "DEBIT", account_id: ACC.loans, basis: "PRINCIPAL", label: "Loan principal" },
      { side: "CREDIT", account_id: ACC.gcb, basis: "PRINCIPAL", label: "Paid out from GCB" },
    ],
    sample: { PRINCIPAL: 5000 },
    postings_count: 3,
    ...ruleStamp,
  },
  {
    id: "rule_5",
    name: "Loan repayment received",
    event: "loans.repayment.received",
    source_id: "ds_loans",
    description: "Split each repayment into principal recovered, interest earned and fees.",
    is_active: true,
    lines: [
      { side: "DEBIT", account_id: ACC.gcb, basis: "TOTAL", label: "Cash received" },
      { side: "CREDIT", account_id: ACC.loans, basis: "PRINCIPAL", label: "Principal recovered" },
      { side: "CREDIT", account_id: ACC.interest, basis: "INTEREST", label: "Interest income" },
      { side: "CREDIT", account_id: ACC.fees, basis: "FEES", label: "Fees & charges" },
    ],
    sample: { TOTAL: 2255, PRINCIPAL: 1800, INTEREST: 420, FEES: 35 },
    postings_count: 9,
    ...ruleStamp,
  },
  {
    id: "rule_6",
    name: "Payroll posted",
    event: "hr.payroll.posted",
    source_id: "ds_hr",
    description: "Expense gross pay, hold PAYE for GRA and pay the net from the payroll account.",
    is_active: true,
    lines: [
      { side: "DEBIT", account_id: ACC.salaries, basis: "TOTAL", label: "Gross pay" },
      { side: "CREDIT", account_id: ACC.paye, basis: "TAX", label: "PAYE withheld" },
      { side: "CREDIT", account_id: ACC.eco, basis: "SUBTOTAL", label: "Net pay" },
    ],
    sample: { TOTAL: 10000, TAX: 1300, SUBTOTAL: 8700 },
    postings_count: 9,
    ...ruleStamp,
  },
];

// ---------------------------------------------------------------------------
// Audit trail
// ---------------------------------------------------------------------------

const buildAuditEvents = (journals: JournalEntry[]): AuditEvent[] => {
  const events: AuditEvent[] = [];
  let seq = 0;
  const push = (e: Omit<AuditEvent, "id">) => {
    seq += 1;
    events.push({ id: `aud_${seq}`, ...e });
  };

  const recent = journals
    .filter((j) => j.date >= "2026-09-01")
    .sort((a, b) => b.created_at.localeCompare(a.created_at));
  for (const j of recent) {
    const actorType =
      j.created_by_id === INTEGRATION.id ? "INTEGRATION" : j.created_by_id === SYSTEM.id ? "SYSTEM" : "USER";
    const action =
      j.status === "DRAFT"
        ? "JOURNAL.DRAFTED"
        : j.status === "PENDING_APPROVAL"
          ? "JOURNAL.SUBMITTED"
          : "JOURNAL.POSTED";
    push({
      occurred_at: j.created_at,
      actor_id: j.created_by_id,
      actor_name: j.created_by ?? "Unknown",
      actor_type: actorType,
      action,
      entity_type: "Journal",
      entity_id: j.id,
      entity_label: j.number,
      summary: j.memo,
    });
  }

  const manual: Omit<AuditEvent, "id">[] = [
    {
      occurred_at: "2026-10-05T19:30:12.000Z",
      actor_id: INTEGRATION.id,
      actor_name: INTEGRATION.name,
      actor_type: "INTEGRATION",
      action: "SYNC.COMPLETED",
      entity_type: "Data source",
      entity_id: "ds_store",
      entity_label: "Store Management",
      summary: "Synced 38 records (0 errors).",
    },
    {
      occurred_at: "2026-10-04T22:00:41.000Z",
      actor_id: INTEGRATION.id,
      actor_name: INTEGRATION.name,
      actor_type: "INTEGRATION",
      action: "SYNC.PARTIAL",
      entity_type: "Data source",
      entity_id: "ds_hr",
      entity_label: "ZelosHR",
      summary: "3 employee expense records held: no cost centre mapped.",
    },
    {
      occurred_at: "2026-10-03T14:12:09.000Z",
      actor_id: USERS.kofi.id,
      actor_name: USERS.kofi.name,
      actor_type: "USER",
      action: "IMPORT.UPLOADED",
      entity_type: "Import batch",
      entity_id: "imp_6",
      entity_label: "IMP-0006",
      summary: "Uploaded takoradi-branch-bills-sep.csv (5 rows, 2 errors).",
    },
    {
      occurred_at: "2026-10-01T08:14:55.000Z",
      actor_id: INTEGRATION.id,
      actor_name: INTEGRATION.name,
      actor_type: "INTEGRATION",
      action: "SYNC.FAILED",
      entity_type: "Data source",
      entity_id: "ds_pos",
      entity_label: "Osu branch POS",
      summary: "401 Unauthorized. API token expired.",
    },
    {
      occurred_at: "2026-09-12T16:00:00.000Z",
      actor_id: USERS.ama.id,
      actor_name: USERS.ama.name,
      actor_type: "USER",
      action: "PERIOD.LOCKED",
      entity_type: "Fiscal period",
      entity_id: "per_2026_08",
      entity_label: "August 2026",
      summary: "Locked August 2026 after month-end review.",
      changes: [{ field: "status", from: "OPEN", to: "LOCKED" }],
    },
    {
      occurred_at: "2026-08-19T10:22:00.000Z",
      actor_id: USERS.ama.id,
      actor_name: USERS.ama.name,
      actor_type: "USER",
      action: "JOURNAL.REVERSED",
      entity_type: "Journal",
      entity_id: journals.find((j) => j.status === "REVERSED")?.id ?? null,
      entity_label: journals.find((j) => j.status === "REVERSED")?.number ?? "—",
      summary: "Reversed van repair posted to Marketing in error; corrected entry posted to Repairs.",
      changes: [{ field: "status", from: "POSTED", to: "REVERSED" }],
    },
    {
      occurred_at: "2026-07-02T09:15:00.000Z",
      actor_id: USERS.ama.id,
      actor_name: USERS.ama.name,
      actor_type: "USER",
      action: "SETTINGS.UPDATED",
      entity_type: "Organisation",
      entity_id: null,
      entity_label: "Approval controls",
      summary: "Raised the manual journal approval threshold.",
      changes: [{ field: "approval_threshold", from: "25000", to: "50000" }],
    },
    {
      occurred_at: "2026-03-11T09:02:00.000Z",
      actor_id: USERS.ama.id,
      actor_name: USERS.ama.name,
      actor_type: "USER",
      action: "SOURCE.CONNECTED",
      entity_type: "Data source",
      entity_id: "ds_pos",
      entity_label: "Osu branch POS",
      summary: "Connected external POS via REST webhook.",
    },
    {
      occurred_at: "2026-01-04T12:00:00.000Z",
      actor_id: USERS.ama.id,
      actor_name: USERS.ama.name,
      actor_type: "USER",
      action: "RULE.ACTIVATED",
      entity_type: "Accounting rule",
      entity_id: "rule_1",
      entity_label: "Store sale completed",
      summary: "Activated posting rule for store.sale.completed.",
      changes: [{ field: "is_active", from: "false", to: "true" }],
    },
    {
      occurred_at: "2026-01-02T11:42:00.000Z",
      actor_id: USERS.ama.id,
      actor_name: USERS.ama.name,
      actor_type: "USER",
      action: "IMPORT.POSTED",
      entity_type: "Import batch",
      entity_id: "imp_1",
      entity_label: "IMP-0001",
      summary: "Posted QuickBooks opening balances (8 accounts).",
    },
  ];
  manual.forEach(push);
  return events.sort((a, b) => b.occurred_at.localeCompare(a.occurred_at));
};

// ---------------------------------------------------------------------------

const buildOrg = (): OrgSettings => ({
  name: "Kumasi Traders",
  legal_name: "Kumasi Traders Ltd",
  tin: "C0003318842",
  country: "GH",
  base_currency: "GHS",
  setup_completed: true,
  fiscal_year_start: "01-01",
  address: "14 Harper Road, Adum, Kumasi",
  email: "finance@kumasitraders.com.gh",
  phone: "+233 32 202 4471",
  approval_threshold: 50000,
  require_approval_for_manual_journals: true,
  block_posting_to_locked_periods: true,
  invoice_prefix: "INV-2026-",
  bill_prefix: "BILL-2026-",
  journal_prefix: "JE-2026-",
  fx_realised_account_id: ACC.fxRealised,
  fx_unrealised_account_id: ACC.fxUnrealised,
  fx_rate_tolerance_pct: 2,
});

export const buildSeed = () => {
  const accounts = buildAccounts();
  const taxCodes = buildTaxCodes();
  const customers = buildCustomers();
  const suppliers = buildSuppliers();
  const exchangeRates = buildExchangeRates();
  const ledger = buildLedger(customers, suppliers, taxCodes, exchangeRates);
  const banking = buildBanking(ledger.journals);
  return {
    accounts,
    taxCodes,
    customers,
    suppliers,
    ...ledger,
    ...banking,
    periods: buildPeriods(),
    dimensions: buildDimensions(),
    dataSources: buildDataSources(),
    importBatches: buildImportBatches(ledger.journals),
    fieldMappings: buildFieldMappings(),
    customFields: buildCustomFields(),
    currencies: buildCurrencies(),
    exchangeRates,
    fxRevaluations: [] as FxRevaluation[],
    rules: buildRules(),
    auditEvents: buildAuditEvents(ledger.journals),
    org: buildOrg(),
  };
};

export type SeedData = ReturnType<typeof buildSeed>;
