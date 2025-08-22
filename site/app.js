// Import shared Supabase helpers (make sure app.js is loaded as a module in index.html).
import { upvote, getUpvotes, signIn, getSites } from "./supa.js";

// CSV URL from the README
const CSV_URL =
  "https://docs.google.com/spreadsheets/d/1XCtCtX9lH7tRxfnMCkJ1Q6qSh6ss0AoVHN_PrRTh3EM/export?format=csv&gid=660712618";

let sites = [];

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
  grid.innerHTML = sitesToDisplay
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

                <!-- Get Embed button -->
                <button class="flex items-center gap-2 bg-gray-600 text-white px-4 py-2 rounded-lg font-semibold hover:bg-gray-500 transition-all" onclick="showOwnerModal(event, '${
                  site.link
                }', '${site.title}')">
                    <svg class="w-5 h-5" fill="currentColor" viewBox="0 0 20 20"><path d="M8 12.2v-1.6l4.5-4.5 1.6 1.6L9.8 12H8zm6.9-6.9c-.2-.2-.6-.2-.8 0l-.7.7 1.6 1.6.7-.7c.2-.2.2-.6 0-.8l-.8-.8z"/></svg>
                    <span>Get Embed</span>
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
}

// Check for site parameter in URL and open modal if present
function checkUrlParameters() {
  const urlParams = new URLSearchParams(window.location.search);
  const siteParam = urlParams.get("site");

  if (siteParam && sites.length > 0) {
    // Find the site by title
    const site = sites.find((s) => s.title === siteParam);
    if (site) {
      showSiteDetails(site.title, site.creatorName);
    }
  }
}

// Handle browser back/forward buttons
window.addEventListener("popstate", () => {
  const urlParams = new URLSearchParams(window.location.search);
  const siteParam = urlParams.get("site");

  if (siteParam && sites.length > 0) {
    const site = sites.find((s) => s.title === siteParam);
    if (site) {
      showSiteDetails(site.title, site.creatorName);
    }
  } else {
    // Close modal if no site parameter
    const modal = document.getElementById("siteModal");
    modal.classList.add("hidden");
    modal.classList.remove("flex");
    currentModalIdentifier = null;
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

// Show owner modal for claiming site and getting embed code
function showOwnerModal(event, siteLink, siteTitle) {
  event.stopPropagation();

  const modal = document.getElementById("ownerModal");
  const modalTitle = document.getElementById("ownerModalTitle");
  const embedCode = document.getElementById("embedCode");

  modalTitle.textContent = `Get Embed Code for "${siteTitle}"`;

  // Generate simple embed code that works without external JS
  const cleanId = encodeURIComponent(siteLink).replace(/%/g, "");
  const widgetCode = `<!-- UBGHub Upvote Widget -->
<a href="https://ubghub.org/?site=${encodeURIComponent(
    siteTitle
  )}&utm_source=${encodeURIComponent(
    siteLink
  )}" target="_blank" rel="noopener" style="display: inline-flex; align-items: center; gap: 8px; padding: 8px 12px; background: linear-gradient(135deg, #00ff9d 0%, #00cc7a 100%); color: #1a1a1a; border: none; border-radius: 8px; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; font-size: 14px; font-weight: 600; cursor: pointer; text-decoration: none; box-shadow: 0 2px 4px rgba(0, 255, 157, 0.2); transition: all 0.3s ease;" onmouseover="this.style.transform='translateY(-2px)'; this.style.boxShadow='0 4px 8px rgba(0, 255, 157, 0.3)'" onmouseout="this.style.transform='translateY(0)'; this.style.boxShadow='0 2px 4px rgba(0, 255, 157, 0.2)'">
  <svg style="width: 16px; height: 16px; fill: currentColor;" viewBox="0 0 20 20">
    <path d="M3 10l4-4v3h4V2l4 4v14H3V10z"/>
  </svg>
  <span style="font-weight: 700; margin-left: 4px;">Vote on UBGHub</span>
</a>`;

  embedCode.value = widgetCode;

  modal.classList.remove("hidden");
  modal.classList.add("flex");
}

// Close owner modal
function closeOwnerModal() {
  const modal = document.getElementById("ownerModal");
  modal.classList.add("hidden");
  modal.classList.remove("flex");
}

// Copy embed code to clipboard
function copyEmbedCode() {
  const embedCode = document.getElementById("embedCode");
  embedCode.select();
  document.execCommand("copy");

  const copyBtn = document.getElementById("copyEmbedBtn");
  const originalText = copyBtn.textContent;
  copyBtn.textContent = "Copied!";
  copyBtn.classList.add("bg-green-500");

  setTimeout(() => {
    copyBtn.textContent = originalText;
    copyBtn.classList.remove("bg-green-500");
  }, 2000);
}

// Expose functions used in inline event attributes so they work with ES modules.
window.showSiteDetails = showSiteDetails;
window.handleSiteCardClick = handleSiteCardClick;
window.closeModal = closeModal;
window.handleUpvote = handleUpvote;
window.showOwnerModal = showOwnerModal;
window.closeOwnerModal = closeOwnerModal;
window.copyEmbedCode = copyEmbedCode;
