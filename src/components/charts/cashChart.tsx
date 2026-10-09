"use client";

import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { useChartTheme } from "./chartTheme";
import { fmtAxis, fmtCurrency } from "@/utils/format";
import { monthLabel } from "@/utils/dates";
import type { MonthlyTrendPoint } from "@/models/reports";

const CashChart = ({ data, height = 300 }: { data: Pick<MonthlyTrendPoint, "month" | "closing_cash">[]; height?: number }) => {
  const t = useChartTheme();
  return (
    <ResponsiveContainer width="100%" height={height}>
      <AreaChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
        <defs>
          <linearGradient id="cashFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={t.brand} stopOpacity={0.35} />
            <stop offset="100%" stopColor={t.brand} stopOpacity={0} />
          </linearGradient>
        </defs>
        <CartesianGrid strokeDasharray="3 3" stroke={t.grid} vertical={false} />
        <XAxis dataKey="month" tickFormatter={monthLabel} stroke={t.axis} fontSize={12} tickLine={false} axisLine={false} />
        <YAxis tickFormatter={fmtAxis} stroke={t.axis} fontSize={12} tickLine={false} axisLine={false} width={52} />
        <Tooltip
          contentStyle={{
            background: t.tooltipBg,
            border: `1px solid ${t.tooltipBorder}`,
            borderRadius: 8,
            color: t.tooltipText,
            fontSize: 12,
          }}
          labelFormatter={(l) => monthLabel(String(l))}
          formatter={(v) => [fmtCurrency(Number(v)), "Cash & bank"]}
        />
        <Area type="monotone" dataKey="closing_cash" stroke={t.brand} strokeWidth={2} fill="url(#cashFill)" />
      </AreaChart>
    </ResponsiveContainer>
  );
};

export default CashChart;
