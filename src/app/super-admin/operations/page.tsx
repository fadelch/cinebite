import { OperationsDashboard } from "@/components/operations/operations-dashboard";
import { OPERATION_VIEWS } from "@/lib/observability/views";
import { getOperations } from "@/server/observability/operations";
export const dynamic = "force-dynamic";
export default async function OperationsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const input = (await searchParams).view;
  const view = OPERATION_VIEWS.find((view) => view === input) ?? "overview";
  return <OperationsDashboard snapshot={await getOperations()} view={view} />;
}
