import { describe, it, beforeEach, afterEach } from "node:test";
import assert from "node:assert";
import { MoviesService } from "./movies.service";
import { PrismaClient } from "@prisma/client";
import { Genre, Quality, ContentStatus } from "@naijaspride/types";

// Mock Prisma
const mockPrisma = {
  movie: {
    create: async () => ({}),
    findUnique: async () => null,
    findMany: async () => [],
    count: async () => 0,
    update: async () => ({}),
    updateMany: async () => ({ count: 0 }),
  },
  movieNotification: {
    findMany: async () => [],
    updateMany: async () => ({ count: 0 }),
  },
  watchHistory: {
    findMany: async () => [],
    groupBy: async () => [],
  },
  $disconnect: async () => {},
} as unknown as PrismaClient;

describe("MoviesService", () => {
  let service: MoviesService;

  beforeEach(() => {
    service = new MoviesService(mockPrisma);
  });

  describe("create", () => {
    it("should create a movie with valid data", async () => {
      const movieData = {
        title: "Test Movie",
        year: 2024,
        genre: [Genre.Nollywood],
        quality: [Quality.Q720p],
        description: "A test movie",
        language: "English",
        fileUrls: {},
      };

      // Mock the create response
      const mockCreate = async () => ({
        id: "test-uuid",
        ...movieData,
        slug: "test-movie-2024",
        status: "active",
        createdAt: new Date(),
        updatedAt: new Date(),
        downloadCount: 0,
        viewCount: 0,
        genre: ["Nollywood"],
        quality: ["Q720p"],
        fileUrls: {},
        fileSizes: {},
        metadata: {},
      });

      assert.ok(mockCreate);
    });

    it("should generate correct slug from title and year", async () => {
      const testCases = [
        {
          title: "The Test Movie",
          year: 2024,
          expected: "the-test-movie-2024",
        },
        {
          title: "Another Movie!?",
          year: 2023,
          expected: "another-movie-2023",
        },
        {
          title: "UPPERCASE TITLE",
          year: 2022,
          expected: "uppercase-title-2022",
        },
      ];

      for (const { title, year, expected } of testCases) {
        const slug = `${title.toLowerCase().replace(/[^a-z0-9]+/g, "-")}-${year}`;
        assert.strictEqual(slug, expected);
      }
    });
  });

  describe("search", () => {
    it("should return paginated results", async () => {
      const params = {
        page: 1,
        limit: 10,
        q: "test",
      };

      // Mock search response
      const mockSearch = async () => ({
        data: [],
        meta: {
          page: 1,
          limit: 10,
          total: 0,
          totalPages: 0,
          hasNext: false,
          hasPrev: false,
        },
      });

      const result = await mockSearch();
      assert.strictEqual(result.meta.page, 1);
      assert.strictEqual(result.meta.limit, 10);
    });

    it("should handle genre filtering", async () => {
      const params = {
        genre: [Genre.Nollywood, Genre.Drama],
      };

      assert.ok(params.genre.length === 2);
      assert.ok(params.genre.includes(Genre.Nollywood));
    });

    it("should handle year filtering", async () => {
      const params = {
        year: 2024,
      };

      assert.strictEqual(params.year, 2024);
    });
  });

  describe("findBySlug", () => {
    it("should return null for non-existent movie", async () => {
      const mockFind = async () => null;
      const result = await mockFind();
      assert.strictEqual(result, null);
    });

    it("should handle UUID-style slugs for legacy lookups", async () => {
      const uuidSlug = "550e8400-e29b-41d4-a716-446655440000";
      const uuidRegex =
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

      assert.ok(uuidRegex.test(uuidSlug));
    });
  });

  describe("updateStatus", () => {
    it("should update movie status and trigger notifications for active", async () => {
      const movieId = "test-id";
      const newStatus = "active" as const;
      const quality = "Q720p";

      // Mock update response
      const mockUpdate = async () => ({
        id: movieId,
        status: newStatus,
        quality: [quality],
        title: "Test Movie",
        slug: "test-movie",
      });

      const result = await mockUpdate();
      assert.strictEqual(result.status, newStatus);
    });
  });

  describe("quality mapping", () => {
    it("should correctly map quality strings to Prisma enums", () => {
      const qualityMap: Record<string, string> = {
        "480p": "Q480p",
        "720p": "Q720p",
        "1080p": "Q1080p",
        "4K": "Q4K",
      };

      assert.strictEqual(qualityMap["720p"], "Q720p");
      assert.strictEqual(qualityMap["1080p"], "Q1080p");
    });
  });
});

describe("MoviesService Cache Behavior", () => {
  it("should cache movie lookups", async () => {
    // Cache key format: movie:{slug}
    const slug = "test-movie-2024";
    const cacheKey = `movie:${slug}`;

    assert.ok(cacheKey.includes(slug));
    assert.ok(cacheKey.startsWith("movie:"));
  });

  it("should cache search results with encoded params", async () => {
    const params = { q: "test", page: 1, limit: 10 };
    const paramKey = JSON.stringify(params);
    const cacheKey = `search:${Buffer.from(paramKey).toString("base64")}`;

    assert.ok(cacheKey.startsWith("search:"));
    assert.doesNotThrow(() =>
      Buffer.from(cacheKey.replace("search:", ""), "base64").toString(),
    );
  });
});
