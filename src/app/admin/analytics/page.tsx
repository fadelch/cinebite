import Link from "next/link";
import { AnalyticsDashboard } from "@/components/admin/analytics-dashboard";
import { getAnalytics } from "@/server/services/analytics.service";
import { isServiceError } from "@/server/services/service-error";
import { ZodError } from "zod";

export default async function AnalyticsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  let data;
  let message;
  try {
    data = await getAnalytics(await searchParams);
  } catch (error) {
    if (!isServiceError(error) && !(error instanceof ZodError)) throw error;
    message = isServiceError(error)
      ? error.message
      : "Check your report filters and date range.";
  }
  if (!data)
    return (
      <section className="cb-panel p-8">
        <h1 className="text-2xl font-semibold">Report unavailable</h1>
        <p className="mt-3 text-zinc-400">{message}</p>
        <Link href="/admin/analytics" className="cb-button-secondary mt-5">
          Reset report filters
        </Link>
      </section>
    );
  return <AnalyticsDashboard data={data} />;
}
