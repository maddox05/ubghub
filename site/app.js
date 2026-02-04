// Import shared Supabase helpers (make sure app.js is loaded as a module in index.html).
import { upvote, getUpvotes, signIn, getSites } from "./supa.js";

// CSV URL from the README
const CSV_URL =
  "https://docs.google.com/spreadsheets/d/1XCtCtX9lH7tRxfnMCkJ1Q6qSh6ss0AoVHN_PrRTh3EM/export?format=csv&gid=660712618";

let sites = [];

// --- SEO Meta Tag Management ---------------------------------------------------
// Store default meta values so we can restore them when modal closes
const defaultMeta = {
  title: "UBGHub - Unblocked Games Directory",
  description:
    "Discover and share unblocked games and sites. UBGHub is a community-driven directory providing a safe and organized way to access unblocked content.",
  url: "https://ubghub.org/",
  image: "https://ubghub.org/ubghub.png",
};

/**
 * Update meta tags dynamically for SEO when viewing a specific site.
 * This helps Google index individual ?site= pages with unique metadata.
 */
function updateMetaTags(site) {
  const siteUrl = `https://ubghub.org/?site=${encodeURIComponent(site.title).replace(/%20/g, "+")}`;
  const siteTitle = `${site.title} - UBGHub`;
  const siteDescription = site.longDescription || site.shortDescription || defaultMeta.description;
  const siteImage = site.iconUrl || defaultMeta.image;

  // Update document title
  document.title = siteTitle;

  // Update or create meta tags
  setMetaTag("name", "description", siteDescription);
  setMetaTag("name", "title", siteTitle);

  // Open Graph tags
  setMetaTag("property", "og:title", siteTitle);
  setMetaTag("property", "og:description", siteDescription);
  setMetaTag("property", "og:url", siteUrl);
  setMetaTag("property", "og:image", siteImage);

  // Twitter tags
  setMetaTag("property", "twitter:title", siteTitle);
  setMetaTag("property", "twitter:description", siteDescription);
  setMetaTag("property", "twitter:url", siteUrl);
  setMetaTag("property", "twitter:image", siteImage);

  // Update canonical link
  updateCanonicalLink(siteUrl);

  // Inject JSON-LD structured data
  injectJsonLd(site, siteUrl);
}

/**
 * Reset meta tags to default values when modal is closed.
 */
function resetMetaTags() {
  document.title = defaultMeta.title;

  setMetaTag("name", "description", defaultMeta.description);
  setMetaTag("name", "title", defaultMeta.title);

  setMetaTag("property", "og:title", defaultMeta.title);
  setMetaTag("property", "og:description", defaultMeta.description);
  setMetaTag("property", "og:url", defaultMeta.url);
  setMetaTag("property", "og:image", defaultMeta.image);

  setMetaTag("property", "twitter:title", defaultMeta.title);
  setMetaTag("property", "twitter:description", defaultMeta.description);
  setMetaTag("property", "twitter:url", defaultMeta.url);
  setMetaTag("property", "twitter:image", defaultMeta.image);

  updateCanonicalLink(defaultMeta.url);
  removeJsonLd();
  removeFeaturedSection();
}

/**
 * Helper to set or create a meta tag.
 */
function setMetaTag(attr, attrValue, content) {
  let meta = document.querySelector(`meta[${attr}="${attrValue}"]`);
  if (!meta) {
    meta = document.createElement("meta");
    meta.setAttribute(attr, attrValue);
    document.head.appendChild(meta);
  }
  meta.setAttribute("content", content);
}

/**
 * Update or create canonical link element.
 */
function updateCanonicalLink(url) {
  let canonical = document.querySelector('link[rel="canonical"]');
  if (!canonical) {
    canonical = document.createElement("link");
    canonical.setAttribute("rel", "canonical");
    document.head.appendChild(canonical);
  }
  canonical.setAttribute("href", url);
}

/**
 * Inject JSON-LD structured data for SEO.
 */
function injectJsonLd(site, siteUrl) {
  // Remove existing JSON-LD first
  removeJsonLd();

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "WebPage",
    name: `${site.title} - UBGHub`,
    description: site.longDescription || site.shortDescription,
    url: siteUrl,
    mainEntity: {
      "@type": "WebSite",
      name: site.title,
      url: site.link,
      description: site.shortDescription,
    },
  };

  // Add creator info if available
  if (site.creatorName) {
    jsonLd.mainEntity.author = {
      "@type": "Person",
      name: site.creatorName,
    };
  }

  const script = document.createElement("script");
  script.type = "application/ld+json";
  script.id = "site-jsonld";
  script.textContent = JSON.stringify(jsonLd);
  document.head.appendChild(script);
}

/**
 * Remove JSON-LD structured data.
 */
function removeJsonLd() {
  const existing = document.getElementById("site-jsonld");
  if (existing) {
    existing.remove();
  }
}

/**
 * Show a featured section at the top of the page for direct ?site= links.
 * This provides SEO-friendly content in the DOM with proper heading hierarchy.
 */
function showFeaturedSection(site) {
  removeFeaturedSection();

  const container = document.createElement("div");
  container.id = "featured-site-section";
  container.className = "max-w-3xl mx-auto mb-8";
  container.innerHTML = `
    <div class="neo-card rounded-lg p-6 border-2 border-neo-primary/50">
      <div class="flex items-start gap-6">
        ${site.iconUrl ? `<img src="${site.iconUrl}" alt="${site.title}" class="w-20 h-20 rounded-lg object-cover flex-shrink-0">` : ""}
        <div class="flex-grow">
          <h1 class="text-2xl md:text-3xl font-bold text-neo-primary mb-2">${site.title}</h1>
          <p class="text-gray-300 text-lg mb-3">${site.shortDescription}</p>
          <p class="text-gray-400">${site.longDescription}</p>
          ${site.creatorName ? `<p class="text-gray-500 mt-3 text-sm">Created by ${site.creatorName}</p>` : ""}
        </div>
      </div>
    </div>
  `;

  // Insert after the introduction section
  const introSection = document.querySelector("main .max-w-3xl.mx-auto.mb-12");
  if (introSection) {
    introSection.after(container);
  }
}

/**
 * Remove the featured section from the DOM.
 */
function removeFeaturedSection() {
  const existing = document.getElementById("featured-site-section");
  if (existing) {
    existing.remove();
  }
}

// --- Up-vote state ----------------------------------------------------------
// Stores per-site up-vote counts that we fetch from Supabase.
let upvoteCounts = {};

// Keep track of which site is currently shown in the modal so we can update
// its count after an up-vote.
let currentModalIdentifier = null;

// Helper function to escape text and HTML entities
function escapeText(text) {
  if (!text) return "";

  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#x27;");
}

// Utility: create a per-site element ID that is safe for the DOM.
function uidFor(identifier) {
  return encodeURIComponent(identifier);
}

// Create the HTML string for an up-vote button. We render the count if we
// already have it, otherwise fallback to "0" until we fetch real values.
function renderUpvoteButton(site) {
  const id = uidFor(site.link);
  const count = upvoteCounts[site.link] ?? 0;
  return `
    <button class="flex items-center gap-1 text-sm mt-3 group"
            onclick="handleUpvote(event, '${site.link}')">
      <svg class="w-5 h-5 text-gray-300 group-hover:text-neo-primary transition-colors" fill="currentColor" viewBox="0 0 20 20">
        <path d="M3 10l4-4v3h4V2l4 4v14H3V10z"/>
      </svg>
      <span id="upvote-count-${id}">${count}</span>
    </button>`;
}

// Fetch and parse CSV data
async function fetchSites() {
  const loadingIndicator = document.getElementById("loadingIndicator");
  const sitesGrid = document.getElementById("sitesGrid");

  try {
    loadingIndicator.style.display = "flex";

    // Kick off both network requests in parallel to minimise waiting time.
    const [sites_list, upvoteMap] = await Promise.all([
      getSites(),
      getUpvotes("ubghub"),
    ]);

    upvoteCounts = upvoteMap;

    sites = sites_list
      .map((row) => {
        return {
          timestamp: row.timestamp,
          title: escapeText(row.title),
          link: escapeText(row.link),
          shortDescription: escapeText(row.short_description),
          longDescription: escapeText(row.long_description),
          creatorName: escapeText(row.creator_name),
          aboutCreator: escapeText(row.about_creator),
          previewImages: row.preview_images
            ? escapeText(row.preview_images).split("||")
            : [],
          iconUrl: escapeText(row.icon_url),
          verified: row.verified,
        };
      })
      .filter((site) => site.title && site.verified === true); // Filter out empty rows

    // Sort sites by vote count (desc), fallback to 0.
    sites.sort(
      (a, b) => (upvoteCounts[b.link] || 0) - (upvoteCounts[a.link] || 0)
    );

    loadingIndicator.style.display = "none";
    displaySites(sites);

    // Check for URL parameters after sites are loaded
    checkUrlParameters();
  } catch (error) {
    console.error("Error fetching sites:", error);
    loadingIndicator.style.display = "none";
    sitesGrid.innerHTML =
      '<p class="text-red-500 col-span-full text-center py-12">Error loading sites. Please try again later.</p>';
  }
}

// Display sites in the grid
function displaySites(sitesToDisplay) {
  const grid = document.getElementById("sitesGrid");

  // Sponsored card that links directly to maddoxcloud.com
  const sponsoredCard = `
    <a href="https://maddoxcloud.com?utm_source=ubghub.org&utm_medium=sponsored&utm_campaign=ubghub_sponsored" target="_blank" rel="noopener" class="neo-card rounded-lg p-6 hover:border-neo-primary transition-all cursor-pointer block relative border-2 border-yellow-500/30">
        <span class="absolute top-2 right-2 bg-yellow-500 text-black text-xs font-bold px-2 py-1 rounded">SPONSORED</span>
        <div class="flex items-start gap-4">
            <img src="https://maddoxcloud.com/favicon.ico" alt="Maddox Cloud" class="w-16 h-16 rounded-lg object-cover">
            <div>
                <h3 class="text-xl font-semibold text-neo-primary mb-2">MaddoxCloud</h3>
                <p class="text-gray-300 text-sm">Play Mobile Games like Clash Royale in School | All Unblocked!</p>
            </div>
        </div>
    </a>
  `;

  grid.innerHTML =
    sponsoredCard +
    sitesToDisplay
      .map(
        (site) => `
        <a href="?site=${encodeURIComponent(site.title).replaceAll(
          /%20/g,
          "+" // do not put %20 in site name
        )}" class="neo-card rounded-lg p-6 hover:border-neo-primary transition-all cursor-pointer block" onclick="return handleSiteCardClick(event, '${
          site.title
        }')">
            <div class="flex items-start gap-4">
                ${
                  site.iconUrl
                    ? `
                    <img src="${site.iconUrl}" alt="${site.title}" class="w-16 h-16 rounded-lg object-cover">
                `
                    : ""
                }
                <div>
                    <h3 class="text-xl font-semibold text-neo-primary mb-2">${
                      site.title
                    }</h3>
                    <p class="text-gray-300 text-sm">${
                      site.shortDescription
                    }</p>
                    ${renderUpvoteButton(site)}
                </div>
            </div>
        </a>
    `
      )
      .join("");
}

// Handle site card clicks - prevent navigation but show modal
function handleSiteCardClick(event, siteTitle) {
  event.preventDefault(); // Prevent the link from navigating
  showSiteDetails(siteTitle);
  return false; // Extra safety to prevent navigation
}

// Show site details in modal
function showSiteDetails(siteTitle) {
  const site = sites.find((s) => s.title === siteTitle);
  if (!site) return;

  // Update URL with site parameter
  const url = new URL(window.location);
  url.searchParams.set("site", siteTitle);
  window.history.pushState({}, "", url);

  // Update meta tags for SEO
  updateMetaTags(site);
  showFeaturedSection(site);

  // Hide the sites grid to focus on the modal content
  const sitesGrid = document.getElementById("sitesGrid");
  if (sitesGrid) sitesGrid.style.display = "none";

  const modal = document.getElementById("siteModal");
  const modalTitle = document.getElementById("modalTitle");
  const modalContent = document.getElementById("modalContent");

  // Track which site is currently shown so we can update its up-vote count.
  currentModalIdentifier = site.link;

  modalTitle.innerHTML = `
    <div class="flex items-center gap-4">
      ${
        site.iconUrl
          ? `
        <img src="${site.iconUrl}" alt="${site.title}" class="w-12 h-12 rounded-lg object-cover">
      `
          : ""
      }
      <span>${site.title}</span>
    </div>
  `;
  modalContent.innerHTML = `
        <div class="space-y-4">
            <div>
                <h3 class="text-lg font-semibold text-neo-primary">Description</h3>
                <p class="text-gray-300">${site.longDescription}</p>
            </div>
            <div>
                <h3 class="text-lg font-semibold text-neo-primary">Creator</h3>
                <p class="text-gray-300">${site.creatorName}</p>
                <p class="text-gray-300 text-sm mt-1">${site.aboutCreator}</p>
            </div>
            ${
              site.previewImages.length > 0
                ? `
                <div>
                    <h3 class="text-lg font-semibold text-neo-primary mb-2">Preview Images</h3>
                    <div class="grid grid-cols-2 gap-2">
                        ${site.previewImages
                          .map(
                            (img) => `
                            <img src="${img}" alt="Preview" class="rounded-lg w-full h-32 object-cover">
                        `
                          )
                          .join("")}
                    </div>
                </div>
            `
                : ""
            }

            <!-- Action buttons -->
            <div class="flex gap-3 flex-wrap">
                <!-- Up-vote button -->
                <button class="flex items-center gap-2 bg-neo-primary text-neo-secondary px-4 py-2 rounded-lg font-semibold hover:bg-opacity-90 transition-all" onclick="handleUpvote(event, '${
                  site.link
                }')">
                    <svg class="w-5 h-5" fill="currentColor" viewBox="0 0 20 20"><path d="M3 10l4-4v3h4V2l4 4v14H3V10z"/></svg>
                    <span id="modal-upvote-count">${
                      upvoteCounts[site.link] ?? 0
                    }</span>
                    <span>Upvote</span>
                </button>

                <!-- Visit Site button -->
                <a href="${
                  site.link
                }?utm_source=ubghub.org&utm_medium=referral&utm_campaign=ubghub.org" target="_blank" class="inline-flex items-center gap-2 bg-blue-600 text-white px-4 py-2 rounded-lg font-semibold hover:bg-blue-500 transition-all">
                    <svg class="w-5 h-5" fill="currentColor" viewBox="0 0 20 20"><path d="M11 3a1 1 0 100 2h2.586l-6.293 6.293a1 1 0 101.414 1.414L15 6.414V9a1 1 0 102 0V4a1 1 0 00-1-1h-5z"/><path d="M5 5a2 2 0 00-2 2v8a2 2 0 002 2h8a2 2 0 002-2v-3a1 1 0 10-2 0v3H5V7h3a1 1 0 000-2H5z"/></svg>
                    <span>Visit Site</span>
                </a>
            </div>
        </div>
    `;

  modal.classList.remove("hidden");
  modal.classList.add("flex");
}

// Close modal
function closeModal() {
  // Remove site parameter from URL
  const url = new URL(window.location);
  url.searchParams.delete("site");
  window.history.pushState({}, "", url);

  const modal = document.getElementById("siteModal");
  modal.classList.add("hidden");
  modal.classList.remove("flex");

  currentModalIdentifier = null;

  // Reset meta tags to defaults for SEO
  resetMetaTags();

  // Show the sites grid again
  const sitesGrid = document.getElementById("sitesGrid");
  if (sitesGrid) sitesGrid.style.display = "";
}

// Check for site parameter in URL and open modal if present
function checkUrlParameters() {
  const urlParams = new URLSearchParams(window.location.search);
  const siteParam = urlParams.get("site");

  if (siteParam && sites.length > 0) {
    // Find the site by title
    const site = sites.find((s) => s.title === siteParam);
    if (site) {
      // Update meta tags BEFORE showing modal for SEO
      updateMetaTags(site);
      // Show featured section for direct links (SEO-friendly content)
      showFeaturedSection(site);
      showSiteDetails(site.title, site.creatorName);
    }
  }
}

// Handle browser back/forward buttons
window.addEventListener("popstate", () => {
  const urlParams = new URLSearchParams(window.location.search);
  const siteParam = urlParams.get("site");
  const sitesGrid = document.getElementById("sitesGrid");

  if (siteParam && sites.length > 0) {
    const site = sites.find((s) => s.title === siteParam);
    if (site) {
      // Update meta tags for SEO
      updateMetaTags(site);
      showFeaturedSection(site);
      showSiteDetails(site.title, site.creatorName);
      // Hide the sites grid
      if (sitesGrid) sitesGrid.style.display = "none";
    }
  } else {
    // Close modal if no site parameter
    const modal = document.getElementById("siteModal");
    modal.classList.add("hidden");
    modal.classList.remove("flex");
    currentModalIdentifier = null;
    // Reset meta tags to defaults
    resetMetaTags();
    // Show the sites grid again
    if (sitesGrid) sitesGrid.style.display = "";
  }
});

// Search functionality
document.getElementById("searchInput").addEventListener("input", (e) => {
  const searchTerm = e.target.value.toLowerCase();
  const filteredSites = sites.filter(
    (site) => site.title.toLowerCase().includes(searchTerm)
    //   site.shortDescription.toLowerCase().includes(searchTerm) ||
    //   site.creatorName.toLowerCase().includes(searchTerm)
  );
  displaySites(filteredSites);
});

// Close modal when clicking outside
document.getElementById("siteModal").addEventListener("click", (e) => {
  if (e.target === e.currentTarget) {
    closeModal();
  }
});

// Fetch all up-votes for the current "ubghub" site and store them in
// `upvoteCounts`, then paint the counts into the DOM.
async function loadUpvoteCounts() {
  try {
    upvoteCounts = await getUpvotes("ubghub");

    // Update counts in the grid.
    sites.forEach((site) => {
      const span = document.getElementById(`upvote-count-${uidFor(site.link)}`);
      if (span) span.textContent = upvoteCounts[site.link] ?? 0;
    });

    // Update modal if it's open for the current site.
    if (currentModalIdentifier) {
      const modalSpan = document.getElementById("modal-upvote-count");
      if (modalSpan)
        modalSpan.textContent = upvoteCounts[currentModalIdentifier] ?? 0;
    }
  } catch (err) {
    console.error("Failed to load up-vote counts:", err);
  }
}

// Handle user clicking the up-vote button (both card & modal). We rely on the
// shared `upvote()` helper which takes care of auth, dedupe, etc.
async function handleUpvote(event, identifier) {
  // Prevent the click from bubbling to the card (which would open the modal).
  event.stopPropagation();

  try {
    await upvote("ubghub", identifier);

    // Optimistically update the local count so the UI feels snappy.
    upvoteCounts[identifier] = (upvoteCounts[identifier] || 0) + 1;

    // Update card count.
    const span = document.getElementById(`upvote-count-${uidFor(identifier)}`);
    if (span) span.textContent = upvoteCounts[identifier];

    // Update modal count if we're viewing the same site.
    if (currentModalIdentifier === identifier) {
      const modalSpan = document.getElementById("modal-upvote-count");
      if (modalSpan) modalSpan.textContent = upvoteCounts[identifier];
    }
  } catch (err) {
    await signIn();
    console.error("Error up-voting:", err);
  }
}

// Initialize
fetchSites();

// Expose functions used in inline event attributes so they work with ES modules.
window.showSiteDetails = showSiteDetails;
window.handleSiteCardClick = handleSiteCardClick;
window.closeModal = closeModal;
window.handleUpvote = handleUpvote;
