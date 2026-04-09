/**
 * Slugify utility for generating URL-friendly slugs from titles.
 *
 * Handles:
 * - Lowercasing
 * - Removing/replacing non-alphanumeric characters
 * - Normalizing Unicode (NFD decomposition + accent removal)
 * - Handling Nollywood title characters (apostrophes, diacritics)
 * - Trimming and deduplicating separators
 */

/**
 * Generate a slug from a string.
 * @param text The text to slugify
 * @returns The slugified string
 */
export function slugify(text: string): string {
  return (
    text
      // Normalize Unicode (NFD decomposition) to handle diacritics
      .normalize("NFD")
      // Remove diacritical marks (accents)
      .replace(/[\u0300-\u036f]/g, "")
      // Convert to lowercase
      .toLowerCase()
      // Replace common apostrophe variants with nothing (contracted words)
      .replace(/[''']/g, "")
      // Replace non-alphanumeric characters with hyphens
      .replace(/[^a-z0-9]+/g, "-")
      // Remove leading/trailing hyphens
      .replace(/^-+|-+$/g, "")
      // Deduplicate consecutive hyphens
      .replace(/-+/g, "-")
  );
}

/**
 * Generate a unique movie slug from title and year.
 * @param title The movie title
 * @param year The release year
 * @returns The formatted slug
 */
export function generateMovieSlug(title: string, year: number): string {
  const baseSlug = slugify(title);
  return `${baseSlug}-${year}`;
}

/**
 * Generate a slug from a YouTube video title.
 * Handles published date extraction for year determination.
 * @param title The video title
 * @param publishedAt Optional ISO date string for year extraction
 * @returns The formatted slug with year
 */
export function generateVideoSlug(title: string, publishedAt?: string): string {
  const year = publishedAt
    ? new Date(publishedAt).getFullYear()
    : new Date().getFullYear();
  return generateMovieSlug(title, year);
}
