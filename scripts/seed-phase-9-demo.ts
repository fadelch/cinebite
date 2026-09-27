import { randomUUID } from "node:crypto";

import { Temporal } from "@js-temporal/polyfill";

import { prisma } from "../src/lib/db/prisma";

const DEMO_ORGANIZATION_SLUG = "cinebite-demo-cinemas";
const TIMEZONE = "Asia/Beirut";

function asDate(value: Temporal.ZonedDateTime): Date {
  return new Date(value.toInstant().epochMilliseconds);
}

async function main(): Promise<void> {
  const organization = await prisma.organization.findUnique({
    where: { slug: DEMO_ORGANIZATION_SLUG },
    select: { id: true },
  });

  if (!organization) {
    console.log(
      `Phase 9 demo seed skipped: organization "${DEMO_ORGANIZATION_SLUG}" does not exist.`,
    );
    return;
  }

  const nowLocal = Temporal.Now.instant()
    .toZonedDateTimeISO(TIMEZONE)
    .with({ second: 0, millisecond: 0, microsecond: 0, nanosecond: 0 });

  await prisma.$transaction(async (transaction) => {
    const actor = await transaction.organizationMembership.findFirst({
      where: { organizationId: organization.id, role: "CINEMA_ADMIN" },
      select: { userId: true },
    });

    await transaction.organization.update({
      where: { id: organization.id },
      data: { name: "CineBite Demo Cinemas", status: "ACTIVE" },
    });

    const beirut = await transaction.location.upsert({
      where: {
        organizationId_slug: {
          organizationId: organization.id,
          slug: "demo-beirut",
        },
      },
      create: {
        id: randomUUID(),
        organizationId: organization.id,
        name: "Demo Beirut",
        slug: "demo-beirut",
        addressLine1: "Demo Cinema District",
        city: "Beirut",
        country: "Lebanon",
        timezone: TIMEZONE,
        status: "ACTIVE",
      },
      update: {
        name: "Demo Beirut",
        timezone: TIMEZONE,
        status: "ACTIVE",
      },
    });

    const dbayeh = await transaction.location.upsert({
      where: {
        organizationId_slug: {
          organizationId: organization.id,
          slug: "demo-dbayeh",
        },
      },
      create: {
        id: randomUUID(),
        organizationId: organization.id,
        name: "Demo Dbayeh",
        slug: "demo-dbayeh",
        addressLine1: "Demo Waterfront District",
        city: "Dbayeh",
        country: "Lebanon",
        timezone: TIMEZONE,
        status: "ACTIVE",
      },
      update: {
        name: "Demo Dbayeh",
        timezone: TIMEZONE,
        status: "ACTIVE",
      },
    });

    const beirutHall1 = await transaction.hall.upsert({
      where: { locationId_number: { locationId: beirut.id, number: 1 } },
      create: { id: randomUUID(), locationId: beirut.id, number: 1, name: "Hall 1", status: "ACTIVE" },
      update: { name: "Hall 1", status: "ACTIVE" },
    });
    const beirutHall2 = await transaction.hall.upsert({
      where: { locationId_number: { locationId: beirut.id, number: 2 } },
      create: { id: randomUUID(), locationId: beirut.id, number: 2, name: "Hall 2", status: "ACTIVE" },
      update: { name: "Hall 2", status: "ACTIVE" },
    });
    const dbayehHall1 = await transaction.hall.upsert({
      where: { locationId_number: { locationId: dbayeh.id, number: 1 } },
      create: { id: randomUUID(), locationId: dbayeh.id, number: 1, name: "Hall 1", status: "ACTIVE" },
      update: { name: "Hall 1", status: "ACTIVE" },
    });

    await transaction.seat.createMany({
      data: [beirutHall1, beirutHall2, dbayehHall1].flatMap((hall) =>
        Array.from({ length: 10 }, (_, index) => {
          const number = index + 1;
          return {
            id: `phase9-demo-${hall.id}-a${number}`,
            hallId: hall.id,
            row: "A",
            number,
            label: `A${number}`,
            status: "ACTIVE" as const,
          };
        }),
      ),
      skipDuplicates: true,
    });

    const interstellar = await transaction.movie.upsert({
      where: {
        organizationId_slug: {
          organizationId: organization.id,
          slug: "interstellar",
        },
      },
      create: {
        id: randomUUID(),
        organizationId: organization.id,
        title: "Interstellar",
        slug: "interstellar",
        synopsis: "Explorers travel through a wormhole in space in an attempt to ensure humanity's survival.",
        durationMinutes: 169,
        language: "English",
        contentRating: "PG-13",
        status: "ACTIVE",
      },
      update: {
        title: "Interstellar",
        durationMinutes: 169,
        language: "English",
        contentRating: "PG-13",
        status: "ACTIVE",
      },
    });

    const dune = await transaction.movie.upsert({
      where: {
        organizationId_slug: {
          organizationId: organization.id,
          slug: "dune-part-two",
        },
      },
      create: {
        id: randomUUID(),
        organizationId: organization.id,
        title: "Dune Part Two",
        slug: "dune-part-two",
        synopsis: "Paul Atreides unites with Chani and the Fremen while seeking justice for his family.",
        durationMinutes: 166,
        language: "English",
        contentRating: "PG-13",
        status: "ACTIVE",
      },
      update: {
        title: "Dune Part Two",
        durationMinutes: 166,
        language: "English",
        contentRating: "PG-13",
        status: "ACTIVE",
      },
    });

    const liveStart = nowLocal;
    const liveEnd = liveStart.add({ minutes: interstellar.durationMinutes });
    const adjacentStart = liveEnd;
    const adjacentEnd = adjacentStart.add({ minutes: dune.durationMinutes });
    const parallelStart = nowLocal.add({ minutes: 30 });
    const parallelEnd = parallelStart.add({ minutes: dune.durationMinutes });
    const endedEnd = liveStart.subtract({ minutes: 30 });
    const endedStart = endedEnd.subtract({ minutes: dune.durationMinutes });

    const screeningPlans = [
      {
        id: "phase9-demo-beirut-live",
        movieId: interstellar.id,
        hallId: beirutHall1.id,
        startsAt: asDate(liveStart),
        endsAt: asDate(liveEnd),
        status: "SCHEDULED" as const,
      },
      {
        id: "phase9-demo-beirut-adjacent",
        movieId: dune.id,
        hallId: beirutHall1.id,
        startsAt: asDate(adjacentStart),
        endsAt: asDate(adjacentEnd),
        status: "SCHEDULED" as const,
      },
      {
        id: "phase9-demo-beirut-hall-2",
        movieId: dune.id,
        hallId: beirutHall2.id,
        startsAt: asDate(parallelStart),
        endsAt: asDate(parallelEnd),
        status: "SCHEDULED" as const,
      },
      {
        id: "phase9-demo-dbayeh-hall-1",
        movieId: interstellar.id,
        hallId: dbayehHall1.id,
        startsAt: asDate(parallelStart),
        endsAt: asDate(parallelStart.add({ minutes: interstellar.durationMinutes })),
        status: "SCHEDULED" as const,
      },
      {
        id: "phase9-demo-beirut-cancelled",
        movieId: dune.id,
        hallId: beirutHall1.id,
        startsAt: asDate(liveStart.add({ minutes: 15 })),
        endsAt: asDate(liveStart.add({ minutes: 120 })),
        status: "CANCELLED" as const,
      },
      {
        id: "phase9-demo-beirut-ended",
        movieId: dune.id,
        hallId: beirutHall1.id,
        startsAt: asDate(endedStart),
        endsAt: asDate(endedEnd),
        status: "SCHEDULED" as const,
      },
    ];

    // Release only the stable demo rows before moving their relative times. Without
    // this step, a later dev start could temporarily overlap yesterday's adjacent
    // demo slot while PostgreSQL checks each upsert against the old schedule.
    await transaction.screening.updateMany({
      where: { id: { startsWith: "phase9-demo-" } },
      data: { status: "CANCELLED" },
    });

    for (const screening of screeningPlans) {
      await transaction.screening.upsert({
        where: { id: screening.id },
        create: screening,
        update: {
          movieId: screening.movieId,
          hallId: screening.hallId,
          startsAt: screening.startsAt,
          endsAt: screening.endsAt,
          status: screening.status,
        },
      });

      await transaction.auditLog.upsert({
        where: { id: `phase9-demo-audit-${screening.id}` },
        create: {
          id: `phase9-demo-audit-${screening.id}`,
          actorUserId: actor?.userId,
          action: screening.status === "CANCELLED" ? "SCREENING_CANCELLED" : "SCREENING_CREATED",
          entityType: "SCREENING",
          entityId: screening.id,
          organizationId: organization.id,
          locationId: screening.hallId === dbayehHall1.id ? dbayeh.id : beirut.id,
          hallId: screening.hallId,
          metadata: {
            demoSeed: true,
            movieId: screening.movieId,
            startsAt: screening.startsAt.toISOString(),
            endsAt: screening.endsAt.toISOString(),
          },
        },
        update: {
          actorUserId: actor?.userId,
          action: screening.status === "CANCELLED" ? "SCREENING_CANCELLED" : "SCREENING_CREATED",
          organizationId: organization.id,
          locationId: screening.hallId === dbayehHall1.id ? dbayeh.id : beirut.id,
          hallId: screening.hallId,
          metadata: {
            demoSeed: true,
            movieId: screening.movieId,
            startsAt: screening.startsAt.toISOString(),
            endsAt: screening.endsAt.toISOString(),
          },
        },
      });
    }

    for (const movie of [interstellar, dune]) {
      await transaction.auditLog.upsert({
        where: { id: `phase9-demo-audit-movie-${movie.slug}` },
        create: {
          id: `phase9-demo-audit-movie-${movie.slug}`,
          actorUserId: actor?.userId,
          action: "MOVIE_CREATED",
          entityType: "MOVIE",
          entityId: movie.id,
          organizationId: organization.id,
          metadata: { demoSeed: true, slug: movie.slug, durationMinutes: movie.durationMinutes },
        },
        update: {
          actorUserId: actor?.userId,
          entityId: movie.id,
          organizationId: organization.id,
          metadata: { demoSeed: true, slug: movie.slug, durationMinutes: movie.durationMinutes },
        },
      });
    }
  }, { maxWait: 10_000, timeout: 60_000 });

  console.log("Phase 9 demo data is ready for CineBite Demo Cinemas.");
  console.log("Open /admin/movies and /admin/screenings after the server starts.");
}

main()
  .catch((error: unknown) => {
    const message = error instanceof Error ? error.message : "Unexpected demo seed failure.";
    console.error(message);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
