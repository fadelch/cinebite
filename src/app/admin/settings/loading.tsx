export default function LoadingSettings() {
  return (
    <div aria-label="Loading settings" aria-busy="true" className="space-y-4">
      <div className="cb-panel h-24 motion-safe:animate-pulse" />
      <div className="cb-panel h-72 motion-safe:animate-pulse" />
    </div>
  );
}
