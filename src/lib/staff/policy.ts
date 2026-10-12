export function protectLastAdmin(
  target: { role: string; active: boolean; ready: boolean },
  next: { role: string; active: boolean },
  readyAdminCount: number,
) {
  return (
    target.role === "CINEMA_ADMIN" &&
    target.active &&
    target.ready &&
    (next.role !== "CINEMA_ADMIN" || !next.active) &&
    readyAdminCount <= 1
  );
}
export function changedLocations(
  previous: readonly string[],
  next: readonly string[],
) {
  return [...previous].sort().join("\0") !== [...next].sort().join("\0");
}
