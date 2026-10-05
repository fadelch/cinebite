-- Bounded durable cancellation sweeps, independent of external callback traffic.
CREATE INDEX "payment_webhook_events_provider_status_receivedAt_idx"
ON "payment_webhook_events" ("provider", "status", "receivedAt");
