"use client";
import { RecoveryPanel } from "@/components/ui/recovery-panel";
export default function ApplicationError({
  error,
  retry,
}: {
  error: Error & { digest?: string };
  retry: () => void;
}) {
  return (
    <RecoveryPanel
      title="CineBite temporarily unavailable"
      error={error}
      retry={retry}
    />
  );
}
