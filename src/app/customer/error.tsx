"use client";
import { RecoveryPanel } from "@/components/ui/recovery-panel";
export default function CustomerError({
  error,
  retry,
}: {
  error: Error & { digest?: string };
  retry: () => void;
}) {
  return (
    <RecoveryPanel
      title="Seat ordering temporarily unavailable"
      error={error}
      retry={retry}
    />
  );
}
