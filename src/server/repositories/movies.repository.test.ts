import { beforeEach, describe, expect, it, vi } from "vitest";

const database = vi.hoisted(() => {
  const transaction = { movie: { create: vi.fn() }, auditLog: { create: vi.fn() } };
  return { prisma: { user: { findUnique: vi.fn() }, movie: { findMany: vi.fn(), count: vi.fn() }, $transaction: vi.fn() }, transaction };
});
vi.mock("server-only", () => ({}));
vi.mock("@/lib/db/prisma", () => ({ prisma: database.prisma }));

import { createMovieRecord, listMoviesRecord } from "@/server/repositories/movies.repository";

const row = { id: "movie-1", title: "Interstellar", slug: "interstellar", synopsis: null, durationMinutes: 169, language: "English", contentRating: "PG-13", status: "ACTIVE", posterUrl: null, updatedAt: new Date(0), _count: { screenings: 0 } };

describe("movie repository tenant rules", () => {
  beforeEach(() => { vi.clearAllMocks(); database.prisma.user.findUnique.mockResolvedValue({ id: "user-1" }); });

  it("scopes bounded movie search to one organization", async () => {
    database.prisma.movie.findMany.mockReturnValue("find-query"); database.prisma.movie.count.mockReturnValue("count-query"); database.prisma.$transaction.mockResolvedValue([[], 0]);
    await listMoviesRecord("org-1", { search: "inter", status: "ACTIVE", page: 2, pageSize: 24 });
    expect(database.prisma.movie.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ organizationId: "org-1", status: "ACTIVE" }), skip: 24, take: 24 }));
  });

  it("creates Movie and AuditLog atomically", async () => {
    database.prisma.$transaction.mockImplementation(async (operation: (client: typeof database.transaction) => unknown) => operation(database.transaction));
    database.transaction.movie.create.mockResolvedValue(row); database.transaction.auditLog.create.mockResolvedValue({});
    await createMovieRecord({ actorUid: "firebase-1", organizationId: "org-1", movieId: "movie-1", movie: { title: "Interstellar", slug: "interstellar", synopsis: null, durationMinutes: 169, language: "English", contentRating: "PG-13", status: "ACTIVE" } });
    expect(database.transaction.movie.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ organizationId: "org-1" }) }));
    expect(database.transaction.auditLog.create).toHaveBeenCalledWith({ data: expect.objectContaining({ action: "MOVIE_CREATED", entityType: "MOVIE", organizationId: "org-1" }) });
  });

  it("maps organization-scoped duplicate slugs to a friendly conflict", async () => {
    database.prisma.$transaction.mockRejectedValue({ code: "P2002" });
    await expect(createMovieRecord({ actorUid: "firebase-1", organizationId: "org-1", movieId: "movie-1", movie: { title: "Interstellar", slug: "interstellar", synopsis: null, durationMinutes: 169, language: null, contentRating: null, status: "ACTIVE" } })).rejects.toMatchObject({ code: "DUPLICATE_MOVIE_SLUG", status: 409 });
  });
});
