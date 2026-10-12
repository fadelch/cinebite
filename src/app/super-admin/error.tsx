"use client";
import { RecoveryPanel } from "@/components/ui/recovery-panel";
export default function ErrorBoundary({ error, retry }: { error: Error & { digest?: string }; retry: () => void }) {
  return <RecoveryPanel title="Super Admin data is temporarily unavailable" error={error} retry={retry} />;
}
