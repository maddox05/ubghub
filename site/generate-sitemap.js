/**
 * Sitemap Generator for UBGHub
 *
 * This script fetches all verified sites from Supabase and generates
 * a sitemap.xml file with all ?site= URLs for Google indexing.
 *
 * Usage: node generate-sitemap.js
 *
 * Run this before deployment or set up as a scheduled task.
 */

import { createClient } from "@supabase/supabase-js";
import { writeFileSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Supabase credentials (same as in supa.js)
const supabaseUrl = "https://hqlgppguxhqeaonjzinv.supabase.co";
const supabaseAnonKey =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImhxbGdwcGd1eGhxZWFvbmp6aW52Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3MzI2MjYwNDQsImV4cCI6MjA0ODIwMjA0NH0.4LuWk4qxp0NRZ5_erEIJq5BHq5qZiSE4zTUFS1ioZw8";

const supabase = createClient(supabaseUrl, supabaseAnonKey);

const BASE_URL = "https://ubghub.org";

async function generateSitemap() {
  console.log("Fetching sites from Supabase...");

  const { data: sites, error } = await supabase
    .from("ubghub_sites")
    .select("title, verified, timestamp")
    .eq("verified", true);

  if (error) {
    console.error("Error fetching sites:", error);
    process.exit(1);
  }

  console.log(`Found ${sites.length} verified sites`);

  const today = new Date().toISOString().split("T")[0];

  // Build XML
  let xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <!-- Homepage -->
  <url>
    <loc>${BASE_URL}/</loc>
    <lastmod>${today}</lastmod>
    <changefreq>daily</changefreq>
    <priority>1.0</priority>
  </url>
`;

  // Add each site page
  for (const site of sites) {
    if (!site.title) continue;

    // Encode site title for URL (same encoding as app.js)
    const encodedTitle = encodeURIComponent(site.title).replace(/%20/g, "+");
    const siteUrl = `${BASE_URL}/?site=${encodedTitle}`;

    // Use timestamp if available, otherwise use today
    const lastmod = site.timestamp
      ? new Date(site.timestamp).toISOString().split("T")[0]
      : today;

    xml += `  <url>
    <loc>${escapeXml(siteUrl)}</loc>
    <lastmod>${lastmod}</lastmod>
    <changefreq>weekly</changefreq>
    <priority>0.8</priority>
  </url>
`;
  }

  xml += `</urlset>
`;

  // Write sitemap.xml
  const outputPath = join(__dirname, "sitemap.xml");
  writeFileSync(outputPath, xml, "utf8");

  console.log(`Sitemap generated successfully: ${outputPath}`);
  console.log(`Total URLs: ${sites.length + 1}`);
}

/**
 * Escape special XML characters in URLs
 */
function escapeXml(str) {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

generateSitemap().catch((err) => {
  console.error("Failed to generate sitemap:", err);
  process.exit(1);
});
