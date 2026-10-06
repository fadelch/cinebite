export default function AnalyticsLoading() {
  return (
    <section
      aria-busy="true"
      aria-label="Loading analytics"
      className="space-y-5 motion-safe:animate-pulse"
    >
      <div className="cb-panel h-20" />
      <div className="cb-panel h-48" />
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className="cb-panel h-32" />
        ))}
      </div>
      <div className="cb-panel h-72" />
    </section>
  );
}
