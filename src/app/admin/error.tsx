"use client";
import { RecoveryPanel } from "@/components/ui/recovery-panel";
export default function ErrorBoundary({ error, retry }: { error: Error & { digest?: string }; retry: () => void }) {
  return <RecoveryPanel title="Cinema management could not be loaded" error={error} retry={retry} />;
}
