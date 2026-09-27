-- Phase 9: organization movies, timezone-safe screenings, and database-enforced hall overlap protection.
CREATE TYPE "MovieStatus" AS ENUM ('ACTIVE', 'INACTIVE');
CREATE TYPE "ScreeningStatus" AS ENUM ('SCHEDULED', 'CANCELLED');

ALTER TYPE "AuditAction" ADD VALUE 'MOVIE_CREATED';
ALTER TYPE "AuditAction" ADD VALUE 'MOVIE_UPDATED';
ALTER TYPE "AuditAction" ADD VALUE 'MOVIE_ENABLED';
ALTER TYPE "AuditAction" ADD VALUE 'MOVIE_DISABLED';
ALTER TYPE "AuditAction" ADD VALUE 'MOVIE_POSTER_UPDATED';
ALTER TYPE "AuditAction" ADD VALUE 'MOVIE_POSTER_REMOVED';
ALTER TYPE "AuditAction" ADD VALUE 'SCREENING_CREATED';
ALTER TYPE "AuditAction" ADD VALUE 'SCREENING_UPDATED';
ALTER TYPE "AuditAction" ADD VALUE 'SCREENING_CANCELLED';

ALTER TYPE "AuditEntityType" ADD VALUE 'MOVIE';
ALTER TYPE "AuditEntityType" ADD VALUE 'SCREENING';

CREATE TABLE "movies" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "slug" TEXT NOT NULL,
  "synopsis" TEXT,
  "durationMinutes" INTEGER NOT NULL,
  "language" TEXT,
  "contentRating" TEXT,
  "status" "MovieStatus" NOT NULL DEFAULT 'ACTIVE',
  "posterStoragePath" TEXT,
  "posterUrl" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "movies_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "movies_duration_check" CHECK ("durationMinutes" >= 1 AND "durationMinutes" <= 600)
);

CREATE TABLE "screenings" (
  "id" TEXT NOT NULL,
  "movieId" TEXT NOT NULL,
  "hallId" TEXT NOT NULL,
  "startsAt" TIMESTAMPTZ(3) NOT NULL,
  "endsAt" TIMESTAMPTZ(3) NOT NULL,
  "status" "ScreeningStatus" NOT NULL DEFAULT 'SCHEDULED',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "screenings_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "screenings_time_order_check" CHECK ("endsAt" > "startsAt")
);

CREATE UNIQUE INDEX "movies_organizationId_slug_key" ON "movies"("organizationId", "slug");
CREATE UNIQUE INDEX "movies_id_organizationId_key" ON "movies"("id", "organizationId");
CREATE INDEX "movies_organizationId_status_title_idx" ON "movies"("organizationId", "status", "title");
CREATE INDEX "screenings_hallId_status_startsAt_idx" ON "screenings"("hallId", "status", "startsAt");
CREATE INDEX "screenings_movieId_startsAt_idx" ON "screenings"("movieId", "startsAt");

ALTER TABLE "movies" ADD CONSTRAINT "movies_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "screenings" ADD CONSTRAINT "screenings_movieId_fkey" FOREIGN KEY ("movieId") REFERENCES "movies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "screenings" ADD CONSTRAINT "screenings_hallId_fkey" FOREIGN KEY ("hallId") REFERENCES "halls"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- btree_gist lets PostgreSQL combine hall equality with a timestamp-range overlap operator.
CREATE EXTENSION IF NOT EXISTS btree_gist;

-- [start, end) permits exact adjacency and ignores cancelled rows. This is the final
-- concurrency guard: two overlapping scheduled inserts cannot both commit.
ALTER TABLE "screenings" ADD CONSTRAINT "screenings_no_scheduled_hall_overlap"
EXCLUDE USING gist (
  "hallId" WITH =,
  tstzrange("startsAt", "endsAt", '[)') WITH &&
)
WHERE ("status" = 'SCHEDULED');
