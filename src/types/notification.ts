import type { NotificationKind, Category } from "@/lib/notifications/policy";
export interface NotificationDto {
  id: string;
  type: NotificationKind;
  severity: "INFO" | "SUCCESS" | "WARNING" | "CRITICAL";
  title: string;
  message: string;
  readAt: string | null;
  createdAt: string;
  href: string | null;
}
export interface NotificationFeed {
  items: NotificationDto[];
  unread: number;
  total: number;
  page: number;
  pageSize: number;
}
export interface PreferenceDto {
  category: Category;
  inAppEnabled: boolean;
  mandatoryTypes: NotificationKind[];
}
