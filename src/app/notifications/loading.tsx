export default function LoadingNotifications() {
  return (
    <main
      aria-busy="true"
      aria-label="Loading notifications"
      className="mx-auto max-w-5xl space-y-5 p-6 motion-safe:animate-pulse"
    >
      <div className="cb-panel h-24" />
      {[1, 2, 3].map((n) => (
        <div key={n} className="cb-panel h-36" />
      ))}
    </main>
  );
}
