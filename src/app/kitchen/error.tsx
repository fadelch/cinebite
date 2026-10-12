"use client";
import { RecoveryPanel } from "@/components/ui/recovery-panel";
export default function ErrorBoundary({ error, retry }: { error: Error & { digest?: string }; retry: () => void }) {
  return <RecoveryPanel title="Kitchen temporarily unavailable" error={error} retry={retry} />;
}
