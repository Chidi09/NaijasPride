import { Storage } from '@google-cloud/storage';
import crypto from 'crypto';

const BUCKET_NAME = process.env.GCS_BUCKET_NAME || 'naijaspride-content';
const CDN_HOST = process.env.CDN_HOST; // e.g., 'https://cdn.naijaspride.com'
const CDN_TOKEN_KEY = process.env.CDN_TOKEN_KEY; // BunnyCDN Token Authentication key
const storage = new Storage();

/**
 * CDN-Enabled Storage Service
 * 
 * Uploads go to GCS (Origin), downloads are served from CDN for better performance
 * and lower bandwidth costs. Supports BunnyCDN Token Authentication for security.
 */
export class StorageService {
  /**
   * Generate signed URL for file upload (always goes to GCS)
   */
  async getUploadUrl(filename: string, contentType: string) {
    const [url] = await storage
      .bucket(BUCKET_NAME)
      .file(filename)
      .getSignedUrl({
        version: 'v4',
        action: 'write',
        expires: Date.now() + 15 * 60 * 1000, // 15 minutes
        contentType,
      });
    return url;
  }

  /**
   * Get download URL - prefers CDN if configured, falls back to GCS signed URL
   */
  async getDownloadUrl(filename: string) {
    // If CDN is configured, use CDN URL with token authentication
    if (CDN_HOST) {
      return this.getCdnUrl(filename);
    }

    // Fallback to GCS signed URL
    const [url] = await storage
      .bucket(BUCKET_NAME)
      .file(filename)
      .getSignedUrl({
        version: 'v4',
        action: 'read',
        expires: Date.now() + 60 * 60 * 1000, // 1 hour
      });
    return url;
  }

  /**
   * Generate CDN URL with optional token authentication
   * Supports BunnyCDN Token Authentication
   */
  private getCdnUrl(filename: string, expirationHours: number = 1): string {
    const url = `${CDN_HOST}/${filename}`;

    // If token authentication is not configured, return plain CDN URL
    if (!CDN_TOKEN_KEY) {
      return url;
    }

    // BunnyCDN Token Authentication
    // https://support.bunnycdn.com/hc/en-us/articles/360016055099-How-to-sign-URLs-with-BunnyCDN-Token-Authentication
    const expires = Math.floor(Date.now() / 1000) + (expirationHours * 3600);
    const tokenPath = `/${filename}`;
    const tokenString = `${CDN_TOKEN_KEY}${tokenPath}${expires}`;
    const token = crypto.createHash('sha256').update(tokenString).digest('base64url');

    return `${CDN_HOST}/${filename}?token=${token}&expires=${expires}`;
  }

  /**
   * Check if CDN is enabled
   */
  static isCdnEnabled(): boolean {
    return !!CDN_HOST;
  }
}
