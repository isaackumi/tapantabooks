// Shapes mirror the tvs-accounting-bk wire format (snake_case) so the mock
// layer can be swapped for API calls without touching the screens.

export interface AuditFields {
  created_at: string;
  updated_at: string;
  created_by_id: string | null;
  updated_by_id: string | null;
  created_by: string | null;
  updated_by: string | null;
}

export type AccountType = "ASSET" | "LIABILITY" | "EQUITY" | "REVENUE" | "EXPENSE";

export interface Account extends AuditFields {
  id: string;
  code: string;
  name: string;
  type: AccountType;
  subtype: string;
  parent_id: string | null;
  is_group: boolean;
  is_active: boolean;
  /** Control accounts are only posted to through their sub-ledger (AR/AP). */
  is_control: boolean;
  is_bank: boolean;
  description?: string;
  custom_fields?: Record<string, string>;
}

export type SourceType =
  | "MANUAL"
  | "SALES"
  | "PURCHASES"
  | "BANKING"
  | "STORE_MANAGEMENT"
  | "LOANS"
  | "HR"
  | "IMPORT"
  | "FX_REVALUATION"
  | "OPENING_BALANCE"
  | "YEAR_END"
  | "SYSTEM";

export interface SourceRef {
  type: SourceType;
  reference?: string;
  /** Id of the sub-ledger document (invoice, bill, receipt...) when there is one. */
  document_id?: string;
}

export type JournalStatus = "DRAFT" | "PENDING_APPROVAL" | "POSTED" | "REVERSED";

export interface JournalLine {
  id: string;
  account_id: string;
  description?: string;
  debit: number;
  credit: number;
  branch_id?: string | null;
  cost_centre_id?: string | null;
  /** Set on lines that carry a foreign-currency amount (foreign AR/AP, foreign bank accounts). */
  currency?: string | null;
  /** Foreign amount on the same side as the debit or credit. */
  amount_fc?: number | null;
}

export interface JournalEntry extends AuditFields {
  id: string;
  number: string;
  date: string;
  memo: string;
  reference?: string;
  status: JournalStatus;
  source: SourceRef;
  branch_id: string | null;
  lines: JournalLine[];
  posted_at?: string | null;
  posted_by?: string | null;
  approved_by?: string | null;
  reversal_of_id?: string | null;
  reversed_by_id?: string | null;
  custom_fields?: Record<string, string>;
}

export type PartyStatus = "ACTIVE" | "INACTIVE";

export interface Party extends AuditFields {
  id: string;
  code: string;
  name: string;
  email: string;
  phone: string;
  city: string;
  tin?: string;
  payment_terms_days: number;
  credit_limit: number;
  status: PartyStatus;
  external_reference?: string | null;
  source: SourceType;
  /** Default currency for new documents with this party. */
  currency: string;
  custom_fields?: Record<string, string>;
}

export type Customer = Party;
export type Supplier = Party;

export interface DocumentLine {
  id: string;
  description: string;
  quantity: number;
  unit_price: number;
  tax_code_id: string;
  /** Revenue account for invoices, expense/inventory account for bills. */
  account_id: string;
}

/** Stored lifecycle; display status (PAID, OVERDUE...) is derived from amounts and dates. */
export type DocumentState = "DRAFT" | "APPROVED" | "VOID";

export type DocumentDisplayStatus =
  | "DRAFT"
  | "OPEN"
  | "PARTIALLY_PAID"
  | "PAID"
  | "OVERDUE"
  | "VOID";

export interface SalesInvoice extends AuditFields {
  id: string;
  number: string;
  customer_id: string;
  issue_date: string;
  due_date: string;
  state: DocumentState;
  lines: DocumentLine[];
  currency: string;
  /** Base currency per one unit of the document currency, fixed when the document is approved. */
  exchange_rate: number;
  /** In the document currency. */
  amount_paid: number;
  /** Base-currency carrying value already settled, at the document rate. */
  amount_paid_base: number;
  journal_id: string | null;
  branch_id: string | null;
  notes?: string;
  source: SourceRef;
  custom_fields?: Record<string, string>;
}

export interface PurchaseBill extends AuditFields {
  id: string;
  number: string;
  supplier_reference: string;
  supplier_id: string;
  issue_date: string;
  due_date: string;
  state: DocumentState;
  lines: DocumentLine[];
  currency: string;
  exchange_rate: number;
  amount_paid: number;
  amount_paid_base: number;
  journal_id: string | null;
  branch_id: string | null;
  notes?: string;
  source: SourceRef;
  custom_fields?: Record<string, string>;
}

/**
 * Customer credit note (against an invoice) or supplier credit (against a bill).
 * It reduces what is owed on that document, like a payment that moves no cash.
 */
export interface CreditNote extends AuditFields {
  id: string;
  number: string;
  party_id: string;
  document_id: string;
  date: string;
  state: "APPROVED" | "VOID";
  reason: string;
  /** Supplier credits: the supplier's own credit note number. */
  supplier_reference?: string;
  lines: DocumentLine[];
  /** The document's currency and rate, so crediting never creates an exchange difference. */
  currency: string;
  exchange_rate: number;
  /** Base-currency carrying value released from the receivable or payable. */
  base_amount: number;
  journal_id: string | null;
  branch_id: string | null;
}

export type PaymentMethod = "BANK_TRANSFER" | "MOBILE_MONEY" | "CASH" | "CHEQUE";

export interface Payment extends AuditFields {
  id: string;
  number: string;
  party_id: string;
  document_id: string;
  date: string;
  /** In the document currency. */
  amount: number;
  currency: string;
  /** Rate on the payment date. */
  exchange_rate: number;
  base_amount: number;
  /** Realised exchange difference in base currency: positive is a gain, negative a loss. */
  fx_gain_loss: number;
  method: PaymentMethod;
  bank_account_id: string;
  reference?: string;
  journal_id: string;
}

export interface BankAccount extends AuditFields {
  id: string;
  name: string;
  bank: string;
  account_number: string;
  gl_account_id: string;
  currency: string;
  statement_balance: number;
  statement_date: string;
  last_reconciled_at: string | null;
}

export type StatementLineStatus = "UNMATCHED" | "SUGGESTED" | "MATCHED";

export interface BankStatementLine {
  id: string;
  bank_account_id: string;
  date: string;
  description: string;
  /** Positive = money in, negative = money out. */
  amount: number;
  status: StatementLineStatus;
  matched_journal_id: string | null;
  suggested_journal_id: string | null;
  /** The bank's own transaction reference, when the statement file has one. */
  reference?: string | null;
  /** Set on lines that came from POST /bank-statement-lines/import; null for feed lines. */
  import_id?: string | null;
}

export interface TaxCode extends AuditFields {
  id: string;
  code: string;
  name: string;
  rate: number;
  kind: "OUTPUT_INPUT" | "WITHHOLDING" | "EXEMPT";
  output_account_id: string | null;
  input_account_id: string | null;
  is_active: boolean;
  description: string;
}

export type PeriodStatus = "OPEN" | "LOCKED" | "CLOSED";

export interface FiscalPeriod {
  id: string;
  name: string;
  start_date: string;
  end_date: string;
  status: PeriodStatus;
  locked_by?: string | null;
  locked_at?: string | null;
}

export interface Dimension extends AuditFields {
  id: string;
  code: string;
  name: string;
  kind: "LEGAL_ENTITY" | "BRANCH" | "DEPARTMENT" | "COST_CENTRE" | "PROJECT";
  is_active: boolean;
  description?: string;
}

export type DataSourceKind = "TROVESUITE" | "ACCOUNTING_SYSTEM" | "FILE" | "BANK" | "API";
export type DataSourceStatus = "CONNECTED" | "WARNING" | "ERROR" | "NOT_CONNECTED";

export interface DataSource extends AuditFields {
  id: string;
  name: string;
  provider: string;
  kind: DataSourceKind;
  status: DataSourceStatus;
  description: string;
  sync_direction: "INBOUND" | "OUTBOUND" | "BIDIRECTIONAL";
  schedule: string;
  entities: string[];
  last_run_at: string | null;
  last_run_status: "SUCCESS" | "PARTIAL" | "FAILED" | null;
  records_synced: number;
  error_count: number;
  connection: Record<string, string>;
  status_message?: string;
}

export type ImportBatchStatus = "NEEDS_REVIEW" | "POSTED" | "PARTIALLY_POSTED" | "FAILED";

export interface ImportRecord {
  row: number;
  external_reference: string;
  summary: string;
  amount: number;
  status: "VALID" | "WARNING" | "ERROR";
  message?: string;
  posted: boolean;
}

export interface ImportBatch extends AuditFields {
  id: string;
  number: string;
  source_id: string;
  entity: string;
  file_name: string | null;
  status: ImportBatchStatus;
  records: ImportRecord[];
  journal_id: string | null;
}

export interface FieldMapping {
  id: string;
  source_id: string;
  entity: string;
  source_field: string;
  target_field: string;
  transform: string;
  required: boolean;
}

export type CustomFieldScope = "FINANCIAL" | "SOURCE_REFERENCE";

export const CUSTOM_FIELD_ENTITIES = ["Customer", "Supplier", "Invoice", "Bill", "Journal", "Account"] as const;
export type CustomFieldEntity = (typeof CUSTOM_FIELD_ENTITIES)[number];

export type CustomFieldType = "TEXT" | "LONG_TEXT" | "NUMBER" | "DATE" | "SELECT" | "BOOLEAN";

export interface CustomField extends AuditFields {
  id: string;
  entity: CustomFieldEntity;
  key: string;
  label: string;
  type: CustomFieldType;
  scope: CustomFieldScope;
  options?: string[];
  required: boolean;
  /** Help text shown under the input. */
  description?: string;
  default_value?: string;
  is_active: boolean;
  /** Order within the entity, lowest first. */
  position: number;
  show_in_list: boolean;
}

export interface Currency {
  code: string;
  name: string;
  symbol: string;
  is_active: boolean;
}

export type ExchangeRateSource = "MANUAL" | "BANK_OF_GHANA";

export interface ExchangeRate extends AuditFields {
  id: string;
  currency: string;
  date: string;
  /** Base currency per one unit of `currency`. */
  rate: number;
  source: ExchangeRateSource;
}

export interface FxRevaluationLine {
  kind: "RECEIVABLE" | "PAYABLE" | "BANK";
  currency: string;
  label: string;
  account_id: string;
  amount_fc: number;
  carrying_base: number;
  rate: number;
  revalued_base: number;
  /** Positive is a gain. */
  difference: number;
}

export interface FxRevaluation extends AuditFields {
  id: string;
  period_id: string;
  as_at: string;
  rates: Record<string, number>;
  lines: FxRevaluationLine[];
  net_difference: number;
  journal_id: string;
  reversal_journal_id: string;
}

export type RuleAmountBasis = "TOTAL" | "SUBTOTAL" | "TAX" | "COST" | "PRINCIPAL" | "INTEREST" | "FEES";

export interface AccountingRuleLine {
  side: "DEBIT" | "CREDIT";
  account_id: string;
  basis: RuleAmountBasis;
  label: string;
}

export interface AccountingRule extends AuditFields {
  id: string;
  name: string;
  event: string;
  source_id: string;
  description: string;
  is_active: boolean;
  lines: AccountingRuleLine[];
  sample: Partial<Record<RuleAmountBasis, number>>;
  postings_count: number;
}

export type ActorType = "USER" | "SYSTEM" | "INTEGRATION";

export interface AuditEvent {
  id: string;
  occurred_at: string;
  actor_id: string | null;
  actor_name: string;
  actor_type: ActorType;
  action: string;
  entity_type: string;
  entity_id: string | null;
  entity_label: string;
  summary: string;
  changes?: { field: string; from: string | null; to: string | null }[];
}

export interface OrgSettings {
  name: string;
  legal_name: string;
  tin: string;
  /** ISO 3166-1 alpha-2, e.g. GH. */
  country: string;
  /** ISO 4217. Chosen at setup (default GHS); can only change while no journal has been posted. */
  base_currency: string;
  /** False until the owner completes POST /organisation/setup after sign-up. */
  setup_completed: boolean;
  fiscal_year_start: string;
  address: string;
  email: string;
  phone: string;
  approval_threshold: number;
  require_approval_for_manual_journals: boolean;
  block_posting_to_locked_periods: boolean;
  invoice_prefix: string;
  bill_prefix: string;
  journal_prefix: string;
  fx_realised_account_id: string;
  fx_unrealised_account_id: string;
  /** Warn when a rate typed on a document differs from the latest reference rate by more than this. */
  fx_rate_tolerance_pct: number;
  /** Pre-filled on new invoice lines; a postable REVENUE account. */
  default_sales_account_id: string | null;
  /** Pre-filled on new bill lines; a postable EXPENSE or ASSET account. */
  default_purchase_account_id: string | null;
  /** Pre-filled on new invoice lines; an active, non-withholding tax code. */
  default_sales_tax_code_id: string | null;
  /** Pre-filled on new bill lines; an active, non-withholding tax code. */
  default_purchase_tax_code_id: string | null;
  /** Date the opening balances are posted at; set by PUT /opening-balances/update. */
  conversion_date?: string | null;
  /** The posted account-balances journal; replaced (reversed and re-posted) on every save. */
  opening_balance_journal_id?: string | null;
}

export interface OpeningBalanceLine {
  account_id: string;
  debit: number;
  credit: number;
}

/** An invoice or bill still open at the conversion date, in the base currency. */
export interface OpeningItemInput {
  party_id: string;
  reference: string;
  issue_date: string;
  due_date: string;
  amount: number;
}

/** Body of PUT /opening-balances/update. `lines` replaces the account balances; items are added; removed items are voided at the conversion date. */
export interface OpeningBalancesInput {
  date: string;
  lines: OpeningBalanceLine[];
  receivables: OpeningItemInput[];
  payables: OpeningItemInput[];
  removed_item_ids?: string[];
}

/** Response of GET /opening-balances/get. */
export interface OpeningBalancesView {
  conversion_date: string | null;
  journal_id: string | null;
  journal_number: string | null;
  /** Account balances on the opening journal, excluding the Opening Balance Equity line. */
  lines: OpeningBalanceLine[];
  /** Unvoided invoices brought forward (source OPENING_BALANCE). */
  receivables: SalesInvoice[];
  payables: PurchaseBill[];
  /** Debit-positive balance of Opening Balance Equity across all postings; zero when conversion is complete. */
  opening_equity_balance: number;
  /** Earliest posted entry that is not an opening balance; opening balances must be dated on or before it. */
  first_transaction_date: string | null;
  /** Why the opening balances cannot be changed right now (closed period), or null. */
  locked_reason: string | null;
}

/** Body of POST /organisation/setup, sent once by the owner after sign-up. */
export interface OrganisationSetupInput {
  name: string;
  legal_name: string;
  tin?: string;
  /** ISO 3166-1 alpha-2. */
  country: string;
  /** ISO 4217. */
  base_currency: string;
  /** MM-01: the first day of the month the financial year starts. */
  fiscal_year_start: string;
  address?: string;
  email?: string;
  phone?: string;
}

export interface CurrentUser {
  id: string;
  name: string;
  email: string;
  role: string;
}
