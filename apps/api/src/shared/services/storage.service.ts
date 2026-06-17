import crypto from "crypto";
import {
  S3Client,
  GetObjectCommand,
  PutObjectCommand,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

const STORAGE_PUBLIC_BASE_URL = (
  process.env.STORAGE_PUBLIC_BASE_URL ||
  process.env.S3_PUBLIC_BASE_URL ||
  ""
).trim();

const STORAGE_BACKEND = (process.env.STORAGE_BACKEND || "")
  .trim()
  .toLowerCase();

type S3RuntimeConfig = {
  endpoint: string;
  region: string;
  accessKeyId: string;
  secretAccessKey: string;
  bucket: string;
};

const resolveR2Config = (): S3RuntimeConfig => {
  const endpoint = process.env.S3_ENDPOINT?.trim();
  const region = process.env.S3_REGION?.trim() || "auto";
  const accessKeyId = process.env.S3_ACCESS_KEY_ID?.trim();
  const secretAccessKey = process.env.S3_SECRET_ACCESS_KEY?.trim();
  const bucket = process.env.S3_BUCKET?.trim();

  if (!endpoint) {
    throw new Error(
      "R2 Storage Error: S3_ENDPOINT is required. " +
        'Set STORAGE_BACKEND="r2" and provide R2 credentials.',
    );
  }
  if (!accessKeyId) {
    throw new Error(
      "R2 Storage Error: S3_ACCESS_KEY_ID is required. " +
        "Get this from your Cloudflare R2 API tokens.",
    );
  }
  if (!secretAccessKey) {
    throw new Error(
      "R2 Storage Error: S3_SECRET_ACCESS_KEY is required. " +
        "Get this from your Cloudflare R2 API tokens.",
    );
  }
  if (!bucket) {
    throw new Error(
      "R2 Storage Error: S3_BUCKET is required. " +
        'Set this to your R2 bucket name (e.g., "naijaspride").',
    );
  }

  return { endpoint, region, accessKeyId, secretAccessKey, bucket };
};

// Validate configuration at startup - fail fast if R2 is not configured
let s3Config: S3RuntimeConfig;
try {
  s3Config = resolveR2Config();
} catch (error) {
  console.error("[Storage] Configuration error:", (error as Error).message);
  console.error("[Storage] Please set the following environment variables:");
  console.error('  - STORAGE_BACKEND="r2"');
  console.error('  - S3_ENDPOINT="https://<account>.r2.cloudflarestorage.com"');
  console.error('  - S3_REGION="auto"');
  console.error('  - S3_BUCKET="your-bucket-name"');
  console.error('  - S3_ACCESS_KEY_ID="your-access-key"');
  console.error('  - S3_SECRET_ACCESS_KEY="your-secret-key"');
  console.error(
    '  - STORAGE_PUBLIC_BASE_URL="https://media.yourdomain.com" (optional, for public URLs)',
  );
  throw error;
}

const s3Client = new S3Client({
  region: s3Config.region,
  endpoint: s3Config.endpoint,
  credentials: {
    accessKeyId: s3Config.accessKeyId,
    secretAccessKey: s3Config.secretAccessKey,
  },
  forcePathStyle: true,
});

/**
 * R2-Only Storage Service
 *
 * All storage operations go through Cloudflare R2 via S3-compatible API.
 * No fallbacks to GCS or other providers.
 */
export class StorageService {
  private toPublicUrl(baseUrl: string, key: string): string {
    const trimmedBase = (baseUrl || "").trim().replace(/\/+$/, "");
    const trimmedKey = (key || "").trim().replace(/^\/+/, "");
    return `${trimmedBase}/${trimmedKey}`;
  }

  /**
   * Generate signed URL for file upload to R2
   */
  async getUploadUrl(filename: string, contentType: string) {
    const command = new PutObjectCommand({
      Bucket: s3Config.bucket,
      Key: filename,
      ContentType: contentType,
    });
    return getSignedUrl(s3Client, command, { expiresIn: 15 * 60 });
  }

  /**
   * Get download URL from R2
   * - Uses public URL if STORAGE_PUBLIC_BASE_URL is set
   * - Otherwise generates signed URL
   */
  async getDownloadUrl(
    filename: string,
    options?: { expiresInSeconds?: number },
  ) {
    const expiresInSecondsRaw = options?.expiresInSeconds;
    const expiresInSeconds =
      typeof expiresInSecondsRaw === "number" &&
      Number.isFinite(expiresInSecondsRaw) &&
      expiresInSecondsRaw > 0
        ? Math.floor(expiresInSecondsRaw)
        : 60 * 60;

    if (STORAGE_PUBLIC_BASE_URL) {
      return this.toPublicUrl(STORAGE_PUBLIC_BASE_URL, filename);
    }

    const command = new GetObjectCommand({
      Bucket: s3Config.bucket,
      Key: filename,
    });
    return getSignedUrl(s3Client, command, { expiresIn: expiresInSeconds });
  }

  /**
   * Stream an object directly from R2 via the S3 API (bypasses public URL).
   * Returns the readable Body stream plus metadata headers.
   */
  async getObjectStream(key: string): Promise<{
    stream: NodeJS.ReadableStream;
    contentType?: string;
    contentLength?: number;
  }> {
    const command = new GetObjectCommand({
      Bucket: s3Config.bucket,
      Key: key,
    });
    const response = await s3Client.send(command);
    if (!response.Body) {
      throw new Error(`R2 returned empty body for key: ${key}`);
    }
    return {
      stream: response.Body as unknown as NodeJS.ReadableStream,
      contentType: response.ContentType ?? undefined,
      contentLength: response.ContentLength ?? undefined,
    };
  }

  /**
   * Get the raw S3 client for advanced operations
   */
  static getClient(): S3Client {
    return s3Client;
  }

  /**
   * Get the bucket name
   */
  static getBucket(): string {
    return s3Config.bucket;
  }

  /**
   * Check if public URL mode is enabled
   */
  static isPublicUrlEnabled(): boolean {
    return !!STORAGE_PUBLIC_BASE_URL;
  }

  /**
   * Always returns 's3' (R2 is S3-compatible)
   */
  static getBackend(): "s3" {
    return "s3";
  }

  /**
   * Upload a buffer directly to R2
   */
  async uploadBuffer(key: string, buffer: Buffer, contentType: string) {
    const command = new PutObjectCommand({
      Bucket: s3Config.bucket,
      Key: key,
      Body: buffer,
      ContentType: contentType,
    });
    return s3Client.send(command);
  }

  /**
   * Get the public URL for a key
   */
  getPublicUrl(key: string): string {
    if (STORAGE_PUBLIC_BASE_URL) {
      return this.toPublicUrl(STORAGE_PUBLIC_BASE_URL, key);
    }
    return `/api/v1/books/download?key=${encodeURIComponent(key)}`;
  }
}
