-- Full notification history orders by creation/id without fixing readAt.
-- Keep the existing unread index; do not remove unrelated write/history guards.
CREATE INDEX "notifications_recipientUserId_createdAt_id_idx" ON "notifications"("recipientUserId", "createdAt", "id");
