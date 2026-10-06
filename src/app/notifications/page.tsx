import { NotificationCenter } from "@/components/notifications/notification-center";
import { requirePageRole } from "@/server/auth/page-guards";
import {
  getStaffNotifications,
  getNotificationPreferences,
} from "@/server/services/notification.service";
import { notificationQuerySchema } from "@/validation/notification";
export const metadata = { title: "Notification Center | CineBite" };
export default async function NotificationsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const actor = await requirePageRole([
    "CINEMA_ADMIN",
    "LOCATION_MANAGER",
    "KITCHEN_STAFF",
    "DELIVERY_STAFF",
  ]);
  const input = notificationQuerySchema.parse(await searchParams);
  const initial = await getStaffNotifications(input),
    preferences = await getNotificationPreferences();
  return (
    <NotificationCenter
      key={JSON.stringify(input)}
      initial={initial}
      preferences={preferences}
      type={input.type}
      view={input.view}
      backHref={
        actor.role === "KITCHEN_STAFF"
          ? "/kitchen"
          : actor.role === "DELIVERY_STAFF"
            ? "/delivery"
            : "/admin"
      }
    />
  );
}
