export const CURRENCY_SYMBOL = "GH₵";
export const BASE_CURRENCY = "GHS";

export const CURRENCY_SYMBOLS: Record<string, string> = {
  GHS: "GH₵",
  USD: "US$",
  EUR: "€",
  GBP: "£",
  NGN: "₦",
  XOF: "CFA",
  CNY: "CN¥",
  ZAR: "R",
  AED: "AED",
};

const numberFormatter = new Intl.NumberFormat("en-GH", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

const rateFormatter = new Intl.NumberFormat("en-GH", {
  minimumFractionDigits: 4,
  maximumFractionDigits: 4,
});

export const round2 = (value: number) => Math.round(value * 100) / 100;

export const fmtNumber = (value: number) => numberFormatter.format(round2(value));

export const fmtCurrency = (value: number) => {
  const v = round2(value);
  return v < 0
    ? `-${CURRENCY_SYMBOL} ${numberFormatter.format(Math.abs(v))}`
    : `${CURRENCY_SYMBOL} ${numberFormatter.format(v)}`;
};

export const currencySymbol = (code: string) => CURRENCY_SYMBOLS[code] ?? code;

/** Amount in any currency; falls back to the base-currency format. */
export const fmtMoney = (value: number, currency: string = BASE_CURRENCY) => {
  if (currency === BASE_CURRENCY) return fmtCurrency(value);
  const v = round2(value);
  const symbol = currencySymbol(currency);
  return v < 0 ? `-${symbol} ${numberFormatter.format(Math.abs(v))}` : `${symbol} ${numberFormatter.format(v)}`;
};

export const fmtRate = (value: number) => rateFormatter.format(value);

/** Accounting style for statements: negatives in brackets, zero as a dash. */
export const fmtAccounting = (value: number) => {
  const v = round2(value);
  if (v === 0) return "—";
  return v < 0 ? `(${numberFormatter.format(Math.abs(v))})` : numberFormatter.format(v);
};

export const fmtCompact = (value: number) => {
  const abs = Math.abs(value);
  const sign = value < 0 ? "-" : "";
  if (abs >= 1_000_000) return `${sign}₵${(abs / 1_000_000).toFixed(1)}M`;
  if (abs >= 1_000) return `${sign}₵${(abs / 1_000).toFixed(1)}K`;
  return `${sign}₵${abs.toFixed(0)}`;
};

export const fmtDate = (iso: string | null | undefined) => {
  if (!iso) return "—";
  const d = new Date(iso.length === 10 ? `${iso}T00:00:00` : iso);
  return d.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
};

export const fmtDateTime = (iso: string | null | undefined) => {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
};

export const fmtRelative = (iso: string | null | undefined, now: Date = new Date()) => {
  if (!iso) return "never";
  const diffMs = now.getTime() - new Date(iso).getTime();
  const minutes = Math.round(diffMs / 60000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  return `${days}d ago`;
};

export const humanize = (value: string) =>
  value
    .replace(/_/g, " ")
    .toLowerCase()
    .replace(/^\w/, (c) => c.toUpperCase());

export const classNames = (...classes: unknown[]) =>
  classes.filter(Boolean).join(" ");
