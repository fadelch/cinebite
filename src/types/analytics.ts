import type { ReportName, AnalyticsFilters } from "@/validation/analytics";
export type ReportCell = string | number | null;
export type ReportRow = Record<string, ReportCell>;
export interface ReportColumn {
  key: string;
  label: string;
}
export interface AnalyticsData {
  report: ReportName;
  filters: AnalyticsFilters;
  range: {
    startDate: string;
    endDate: string;
    start: string;
    end: string;
    timezone: string;
    days: number;
  };
  locations: Array<{ id: string; name: string; timezone: string }>;
  financials: Array<{
    currencyCode: string;
    gross: string;
    refunded: string;
    net: string;
    aov: string;
    paidOrders: number;
    revenueRefundRate: string | null;
  }>;
  orders: {
    total: number;
    canceled: number;
    delivered: number;
    active: number;
    cancellationRate: string | null;
    statuses: Record<string, number>;
  };
  stock: { low: number; out: number };
  columns: ReportColumn[];
  rows: ReportRow[];
  totalRows: number;
  trend: ReportRow[];
  filterOptions: {
    movies: Array<{ id: string; name: string }>;
    screenings: Array<{ id: string; name: string }>;
  };
  highlights: Array<{
    title: string;
    columns: ReportColumn[];
    rows: ReportRow[];
  }>;
  notes: string[];
  generatedAt: string;
}
