export type ScreeningAdministrativeStatus = "SCHEDULED" | "CANCELLED";
export type ScreeningTemporalState = "UPCOMING" | "LIVE" | "ENDED" | "CANCELLED";

export function getScreeningTemporalState(input: {
  status: ScreeningAdministrativeStatus;
  startsAt: Date | string;
  endsAt: Date | string;
  now?: Date;
}): ScreeningTemporalState {
  if (input.status === "CANCELLED") return "CANCELLED";
  const now = (input.now ?? new Date()).getTime();
  const startsAt = new Date(input.startsAt).getTime();
  const endsAt = new Date(input.endsAt).getTime();
  if (now < startsAt) return "UPCOMING";
  if (now < endsAt) return "LIVE";
  return "ENDED";
}
