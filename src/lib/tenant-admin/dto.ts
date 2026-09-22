import type { Hall } from "@/types/hall";
import type { Location } from "@/types/location";
import type { Seat } from "@/types/seat";

export function toTenantLocationDto(location: Location) {
  return {
    ...location,
    createdAt: location.createdAt.toDate().toISOString(),
    updatedAt: location.updatedAt.toDate().toISOString(),
  };
}

export function toHallDto(hall: Hall) {
  return {
    ...hall,
    createdAt: hall.createdAt.toDate().toISOString(),
    updatedAt: hall.updatedAt.toDate().toISOString(),
  };
}

export function toSeatDto(seat: Seat) {
  return {
    ...seat,
    createdAt: seat.createdAt.toDate().toISOString(),
    updatedAt: seat.updatedAt.toDate().toISOString(),
  };
}
