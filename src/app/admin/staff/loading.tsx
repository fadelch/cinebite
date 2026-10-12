export default function LoadingStaff() {
  return (
    <div aria-label="Loading staff" aria-busy="true" className="space-y-4">
      <div className="cb-panel h-24 motion-safe:animate-pulse" />
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="cb-panel h-64 motion-safe:animate-pulse" />
        <div className="cb-panel h-64 motion-safe:animate-pulse" />
      </div>
    </div>
  );
}
