import { OrganizationSettingsClient } from "@/components/admin/settings-client";
import { getOrganizationSettings } from "@/server/services/organization-settings.service";
export const metadata = { title: "Organization settings | CineBite" };
export default async function SettingsPage() {
  return (
    <OrganizationSettingsClient initial={await getOrganizationSettings()} />
  );
}
