import { LocationSettingsClient } from "@/components/admin/settings-client";
import { getLocationSettings } from "@/server/services/organization-settings.service";
export default async function LocationSettingsPage({
  params,
}: {
  params: Promise<{ locationId: string }>;
}) {
  return (
    <LocationSettingsClient
      initial={await getLocationSettings((await params).locationId)}
    />
  );
}
