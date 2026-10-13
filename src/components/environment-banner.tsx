import "server-only";
export function EnvironmentBanner() {
  const environment = process.env.CINEBITE_ENVIRONMENT;
  if (environment !== "staging" && environment !== "test") return null;
  return (
    <div
      role="status"
      className="border-b border-amber-400 bg-amber-950 px-4 py-2 text-center text-sm text-amber-100"
    >
      {environment.toUpperCase()} — isolated test data · no live payments
    </div>
  );
}
