import { describe, expect, it } from "vitest";

import { movieInputSchema, screeningInputSchema } from "@/validation/screening";

describe("movie and screening validation", () => {
  it("accepts a bounded movie and normalizes optional fields", () => {
    expect(movieInputSchema.parse({ title: "Interstellar", slug: "interstellar", durationMinutes: "169", language: "", contentRating: "PG-13" })).toMatchObject({ durationMinutes: 169, language: null, status: "ACTIVE" });
  });

  it("rejects zero, negative, fractional, and unreasonable runtimes", () => {
    for (const durationMinutes of [0, -1, 2.5, 601]) expect(() => movieInputSchema.parse({ title: "Movie", slug: "movie", durationMinutes })).toThrow();
  });

  it("requires opaque references and complete local date-times", () => {
    expect(() => screeningInputSchema.parse({ locationId: "loc-1", hallId: "hall-1", movieId: "movie-1", startsAtLocal: "2026-10-05", endsAtLocal: "2026-10-05T22:00" })).toThrow();
    expect(screeningInputSchema.parse({ locationId: "loc-1", hallId: "hall-1", movieId: "movie-1", startsAtLocal: "2026-10-05T20:00", endsAtLocal: "2026-10-05T22:49" })).toMatchObject({ hallId: "hall-1" });
  });
});
