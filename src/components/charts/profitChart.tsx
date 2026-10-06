"use client";

import {
  Bar,
  CartesianGrid,
  ComposedChart,
  Legend,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { useChartTheme } from "./chartTheme";
import { fmtCompact, fmtCurrency } from "@/utils/format";
import { monthLabel } from "@/utils/dates";

export interface ProfitPoint {
  month: string;
  revenue: number;
  expenses: number;
  profit: number;
}

const ProfitChart = ({ data, height = 300 }: { data: ProfitPoint[]; height?: number }) => {
  const t = useChartTheme();
  return (
    <ResponsiveContainer width="100%" height={height}>
      <ComposedChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke={t.grid} vertical={false} />
        <XAxis dataKey="month" tickFormatter={monthLabel} stroke={t.axis} fontSize={12} tickLine={false} axisLine={false} />
        <YAxis tickFormatter={fmtCompact} stroke={t.axis} fontSize={12} tickLine={false} axisLine={false} width={60} />
        <Tooltip
          cursor={{ fill: t.grid, opacity: 0.4 }}
          contentStyle={{
            background: t.tooltipBg,
            border: `1px solid ${t.tooltipBorder}`,
            borderRadius: 8,
            color: t.tooltipText,
            fontSize: 12,
          }}
          labelFormatter={(l) => monthLabel(String(l))}
          formatter={(v, name) => [fmtCurrency(Number(v)), String(name)]}
        />
        <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 12 }} />
        <Bar dataKey="revenue" name="Revenue" fill={t.brand} radius={[4, 4, 0, 0]} maxBarSize={22} />
        <Bar dataKey="expenses" name="Expenses" fill={t.brandSoft} radius={[4, 4, 0, 0]} maxBarSize={22} />
        <Line dataKey="profit" name="Net profit" stroke={t.emerald} strokeWidth={2} dot={{ r: 3 }} type="monotone" />
      </ComposedChart>
    </ResponsiveContainer>
  );
};

export default ProfitChart;
