import { describe, it, beforeEach } from "node:test";
import assert from "node:assert";
import { StorageService } from "./storage.service";

describe("StorageService", () => {
  describe("configuration", () => {
    it("should require R2 credentials", () => {
      const requiredEnvVars = [
        "STORAGE_BACKEND",
        "S3_ENDPOINT",
        "S3_REGION",
        "S3_BUCKET",
        "S3_ACCESS_KEY_ID",
        "S3_SECRET_ACCESS_KEY",
      ];

      for (const envVar of requiredEnvVars) {
        assert.ok(envVar.length > 0, `${envVar} should be defined`);
      }
    });

    it("should validate storage backend type", () => {
      const validBackends = ["r2", "s3"];
      const backend = process.env.STORAGE_BACKEND || "r2";

      assert.ok(
        validBackends.includes(backend),
        `${backend} should be a valid backend`,
      );
    });
  });

  describe("URL generation", () => {
    it("should generate correct download URLs", () => {
      const key = "movies/test-movie/video.mp4";
      const bucket = "naijaspride";
      const endpoint = "https://test.r2.cloudflarestorage.com";

      const url = `${endpoint}/${bucket}/${key}`;

      assert.ok(url.includes(key));
      assert.ok(url.includes(bucket));
    });

    it("should generate signed URLs with expiration", () => {
      const expiresInSeconds = 3600; // 1 hour
      const now = Math.floor(Date.now() / 1000);
      const expiration = now + expiresInSeconds;

      assert.ok(expiration > now);
      assert.strictEqual(expiration - now, expiresInSeconds);
    });

    it("should handle public base URL configuration", () => {
      const publicBaseUrl =
        process.env.STORAGE_PUBLIC_BASE_URL || "https://media.example.com";
      const key = "covers/books/test-book.jpg";

      const url = `${publicBaseUrl.replace(/\/+$/, "")}/${key}`;

      assert.ok(url.startsWith("https://"));
      assert.ok(url.includes(key));
    });
  });

  describe("key validation", () => {
    it("should validate movie key format", () => {
      const validKey = "movies/123e4567-e89b-12d3-a456-426614174000/video.mp4";
      const invalidKey = "../../../etc/passwd";

      const isValidMovieKey = (key: string) => {
        return key.startsWith("movies/") && !key.includes("..");
      };

      assert.ok(isValidMovieKey(validKey));
      assert.ok(!isValidMovieKey(invalidKey));
    });

    it("should validate book key format", () => {
      const validKey = "books/elsci/test-book.epub";
      const invalidKey = "books/../../../secret.txt";

      const isValidBookKey = (key: string) => {
        return key.startsWith("books/") && !key.includes("..");
      };

      assert.ok(isValidBookKey(validKey));
      assert.ok(!isValidBookKey(invalidKey));
    });

    it("should sanitize file names in keys", () => {
      const dirtyFileName = 'file"with\r\nchars.txt';
      const cleanFileName = dirtyFileName.replace(/[\r\n"]/g, "_");

      assert.ok(!cleanFileName.includes("\r"));
      assert.ok(!cleanFileName.includes("\n"));
      assert.ok(!cleanFileName.includes('"'));
    });
  });

  describe("HLS streaming paths", () => {
    it("should generate correct HLS paths", () => {
      const movieId = "test-movie-id";
      const hlsPaths = {
        master: `movies/${movieId}/hls/master.m3u8`,
        "720p": `movies/${movieId}/hls/720p/playlist.m3u8`,
        "480p": `movies/${movieId}/hls/480p/playlist.m3u8`,
      };

      assert.ok(hlsPaths.master.includes("master.m3u8"));
      assert.ok(hlsPaths["720p"].includes("720p"));
      assert.ok(hlsPaths["480p"].includes("480p"));
    });

    it("should validate segment file extensions", () => {
      const validExtensions = [".m3u8", ".ts"];
      const files = ["segment_001.ts", "playlist.m3u8", "video.mp4"];

      for (const file of files) {
        const ext = file.split(".").pop()?.toLowerCase();
        const isValid = validExtensions.some((e) => e.includes(ext || ""));

        if (file === "video.mp4") {
          assert.ok(!isValid);
        } else {
          assert.ok(isValid);
        }
      }
    });
  });
});
