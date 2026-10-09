import { MdOutlineDashboardCustomize, MdOutlineAccountTree, MdOutlineRule } from "react-icons/md";
import {
  FiBookOpen,
  FiLayers,
  FiCalendar,
  FiUsers,
  FiFileText,
  FiDownload,
  FiTruck,
  FiFile,
  FiUpload,
  FiCreditCard,
  FiRepeat,
  FiPercent,
  FiBarChart2,
  FiDatabase,
  FiGitMerge,
  FiShield,
  FiSettings,
  FiPieChart,
  FiTrendingUp,
  FiActivity,
  FiClock,
  FiGlobe,
  FiFlag,
  FiCornerUpLeft,
} from "react-icons/fi";
import { TbScale, TbFileImport } from "react-icons/tb";

export type NavigationSubItem = {
  name: string;
  href: string;
  icon: React.ElementType;
};

export type NavigationItem = {
  name: string;
  href: string;
  icon: React.ElementType;
  subItems?: NavigationSubItem[];
  // Collapsible section header shown above the item. Items without a group
  // render at the top with no header.
  group?: string;
};

export const navigation: NavigationItem[] = [
  { name: "Dashboard", href: "/dashboard", icon: MdOutlineDashboardCustomize },

  { name: "Chart of Accounts", href: "/accounting/chart-of-accounts", icon: MdOutlineAccountTree, group: "Accounting" },
  { name: "Journals", href: "/accounting/journals", icon: FiBookOpen, group: "Accounting" },
  { name: "General Ledger", href: "/accounting/general-ledger", icon: FiLayers, group: "Accounting" },
  { name: "Trial Balance", href: "/accounting/trial-balance", icon: TbScale, group: "Accounting" },
  { name: "Currency Revaluation", href: "/accounting/revaluation", icon: FiGlobe, group: "Accounting" },
  { name: "Fiscal Periods", href: "/accounting/periods", icon: FiCalendar, group: "Accounting" },
  { name: "Opening Balances", href: "/accounting/opening-balances", icon: FiFlag, group: "Accounting" },

  { name: "Customers", href: "/sales/customers", icon: FiUsers, group: "Sales" },
  { name: "Invoices", href: "/sales/invoices", icon: FiFileText, group: "Sales" },
  { name: "Receipts", href: "/sales/receipts", icon: FiDownload, group: "Sales" },
  { name: "Credit Notes", href: "/sales/credit-notes", icon: FiCornerUpLeft, group: "Sales" },

  { name: "Suppliers", href: "/purchases/suppliers", icon: FiTruck, group: "Purchases" },
  { name: "Bills", href: "/purchases/bills", icon: FiFile, group: "Purchases" },
  { name: "Payments", href: "/purchases/payments", icon: FiUpload, group: "Purchases" },
  { name: "Supplier Credits", href: "/purchases/supplier-credits", icon: FiCornerUpLeft, group: "Purchases" },

  { name: "Bank Accounts", href: "/banking/accounts", icon: FiCreditCard, group: "Cash & Tax" },
  { name: "Reconciliation", href: "/banking/reconciliation", icon: FiRepeat, group: "Cash & Tax" },
  { name: "Tax", href: "/tax", icon: FiPercent, group: "Cash & Tax" },

  {
    name: "Reports",
    href: "#",
    icon: FiBarChart2,
    group: "Insights",
    subItems: [
      { name: "All reports", href: "/reports", icon: FiBarChart2 },
      { name: "Balance Sheet", href: "/reports/balance-sheet", icon: TbScale },
      { name: "Income Statement", href: "/reports/income-statement", icon: FiTrendingUp },
      { name: "Cash Flow", href: "/reports/cash-flow", icon: FiActivity },
      { name: "AR Ageing", href: "/reports/ar-ageing", icon: FiClock },
      { name: "AP Ageing", href: "/reports/ap-ageing", icon: FiPieChart },
      { name: "Statements", href: "/reports/statements", icon: FiFileText },
    ],
  },

  { name: "Data Sources", href: "/integrations/sources", icon: FiDatabase, group: "Integrations" },
  { name: "Imports", href: "/integrations/imports", icon: TbFileImport, group: "Integrations" },
  { name: "Field Mappings", href: "/integrations/mappings", icon: FiGitMerge, group: "Integrations" },
  { name: "Accounting Rules", href: "/integrations/rules", icon: MdOutlineRule, group: "Integrations" },

  { name: "Audit Trail", href: "/audit-trail", icon: FiShield, group: "System" },
  { name: "Settings", href: "/settings", icon: FiSettings, group: "System" },
];
