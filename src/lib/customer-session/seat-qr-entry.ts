// Browser-safe parsing only. The seat scan service remains the authority on
// whether a credential exists, is active, and has a live screening.
const credentialPattern = /^[A-Za-z0-9_-]{43}$/;
const seatPathPattern = /^\/s\/([A-Za-z0-9_-]{43})$/;

export function seatQrEntryPath(input: string, origin: string): string | null {
  const value = input.trim();
  if (credentialPattern.test(value)) return `/s/${value}`;
  if (value.length > 2048 || /[\s\\?#]/.test(value)) return null;
  if (seatPathPattern.test(value)) return value;
  if (!/^https?:\/\//i.test(value)) return null;
  try {
    const url = new URL(value);
    if (url.origin !== new URL(origin).origin || url.username || url.password) return null;
    const match = seatPathPattern.exec(url.pathname);
    return match ? `/s/${match[1]}` : null;
  } catch {
    return null;
  }
}
