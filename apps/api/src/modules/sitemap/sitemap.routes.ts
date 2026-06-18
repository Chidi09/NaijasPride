import { FastifyInstance } from "fastify";

export async function sitemapRoutes(app: FastifyInstance) {
  app.get("/sitemap.xml", async (req, reply) => {
    // We only need slugs to generate URLs
    const [movies, tvShows, books, musicVideos] = await Promise.all([
      app.prisma.movie.findMany({
        select: { slug: true, updatedAt: true },
        where: { status: "active" },
      }),
      app.prisma.tvShow.findMany({
        select: { slug: true, updatedAt: true },
        where: { status: "active" },
      }),
      app.prisma.book.findMany({
        select: { slug: true, updatedAt: true },
        where: { status: "active" },
      }),
      app.prisma.musicVideo.findMany({
        select: { slug: true, updatedAt: true },
        where: { status: "active" },
      }),
    ]);

    const baseUrl = "https://www.naijaspride.com";

    // Core static routes
    const staticRoutes = [
      "",
      "/search",
      "/auth/login",
      "/auth/register",
      "/faq",
      "/help",
      "/privacy",
      "/terms",
      "/cookies",
      "/contact",
      "/investors",
      "/movies",
      "/tv-shows",
      "/books",
      "/music",
      "/anime",
    ];

    let xml = `<?xml version="1.0" encoding="UTF-8"?>\n`;
    xml += `<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n`;

    // Add static routes
    for (const route of staticRoutes) {
      xml += `  <url>\n`;
      xml += `    <loc>${baseUrl}${route}</loc>\n`;
      xml += `    <changefreq>daily</changefreq>\n`;
      xml += `    <priority>${route === "" ? "1.0" : "0.8"}</priority>\n`;
      xml += `  </url>\n`;
    }

    // Add Movies
    for (const item of movies) {
      xml += `  <url>\n`;
      xml += `    <loc>${baseUrl}/watch/${item.slug}</loc>\n`;
      xml += `    <lastmod>${item.updatedAt.toISOString()}</lastmod>\n`;
      xml += `    <changefreq>weekly</changefreq>\n`;
      xml += `    <priority>0.7</priority>\n`;
      xml += `  </url>\n`;
    }

    // Add TV Shows
    for (const item of tvShows) {
      xml += `  <url>\n`;
      xml += `    <loc>${baseUrl}/tv-shows/${item.slug}</loc>\n`;
      xml += `    <lastmod>${item.updatedAt.toISOString()}</lastmod>\n`;
      xml += `    <changefreq>weekly</changefreq>\n`;
      xml += `    <priority>0.7</priority>\n`;
      xml += `  </url>\n`;
    }

    // Add Books
    for (const item of books) {
      xml += `  <url>\n`;
      xml += `    <loc>${baseUrl}/books/novel/${item.slug}</loc>\n`;
      xml += `    <lastmod>${item.updatedAt.toISOString()}</lastmod>\n`;
      xml += `    <changefreq>weekly</changefreq>\n`;
      xml += `    <priority>0.7</priority>\n`;
      xml += `  </url>\n`;
    }

    // Add Music
    for (const item of musicVideos) {
      xml += `  <url>\n`;
      xml += `    <loc>${baseUrl}/music/${item.slug}</loc>\n`;
      xml += `    <lastmod>${item.updatedAt.toISOString()}</lastmod>\n`;
      xml += `    <changefreq>weekly</changefreq>\n`;
      xml += `    <priority>0.7</priority>\n`;
      xml += `  </url>\n`;
    }

    xml += `</urlset>`;

    reply.header("Content-Type", "application/xml");
    return reply.send(xml);
  });
}
