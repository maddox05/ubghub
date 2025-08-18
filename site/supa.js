import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// Replace these with your actual Supabase project values or expose them through environment variables / meta tags.
const supabaseUrl = "https://hqlgppguxhqeaonjzinv.supabase.co";
const supabaseAnonKey =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImhxbGdwcGd1eGhxZWFvbmp6aW52Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3MzI2MjYwNDQsImV4cCI6MjA0ODIwMjA0NH0.4LuWk4qxp0NRZ5_erEIJq5BHq5qZiSE4zTUFS1ioZw8";

// Create a single shared Supabase client for the whole app.
export const supabase = createClient(supabaseUrl, supabaseAnonKey);

/**
 * Insert an up-vote for the given site/identifier pair.
 *
 * The function guarantees that the caller is authenticated.
 * If no user is signed-in it throws, so handle the error in the UI layer.
 *
 * Because the (site, identifier) pair is declared UNIQUE in the database, we
 * use `upsert` with `onConflict` to silently ignore duplicates that already
 * exist. This makes the call idempotent.
 *
 * @param {string} site        The logical collection or group the content lives in.
 * @param {string} identifier  The unique identifier for the piece of content.
 *
 * @returns {Promise<void>}    Resolves when the operation succeeds, otherwise throws.
 */
export async function upvote(site, identifier) {
  // Check current auth state.
  let {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError) throw authError;

  // If the user isn't signed in, prompt and wait for authentication.
  let prompted = false;
  if (!user) {
    user = await signIn();
    prompted = true;
  }

  // Upsert the vote (idempotent thanks to the unique constraint).
  const { error } = await supabase
    .from("ubghub_upvotes")
    .upsert([{ site, identifier, user_id: user.id }], {
      onConflict: "site,identifier,user_id",
    });

  if (error) throw error;

  // Refresh if we just went through the sign-in flow so UI can update.
  if (prompted) {
    window.location.reload();
  }
}

export async function getSites() {
  const { data, error } = await supabase.from("ubghub_sites").select("*");
  if (error) throw error;
  return data;
}

/**
 * Fetch aggregated up-vote counts for every identifier within a given site.
 *
 * @param {string} site  Logical collection/group name (e.g. "ubghub").
 * @returns {Promise<Record<string,number>>}  Resolves to an object mapping
 *          `identifier` → `count`.
 */
export async function getUpvotes(site) {
  const { data, error } = await supabase
    .from("ubghub_upvotes")
    .select("identifier")
    .eq("site", site);

  if (error) throw error;

  return data.reduce((acc, row) => {
    acc[row.identifier] = (acc[row.identifier] || 0) + 1;
    return acc;
  }, {});
}

/**
 * Detect Supabase auth callback parameters in the current URL and, if present,
 * exchange them for a session (hydrating the client's auth state).
 *
 * This supports both:
 *   • Magic-link / OOB flow – parameters delivered in the URL hash
 *     (e.g. #access_token=…&refresh_token=…)
 *   • OAuth PKCE/code flow – `?code=…&state=…` query parameters
 *
 * When a session is hydrated successfully the auth-related parameters are
 * removed from the URL via history.replaceState so the page appears clean.
 *
 * @returns {Promise<import("@supabase/supabase-js").Session|null>} The
 *          session object if one was created, otherwise `null`.
 */
export async function hydrateSessionFromUrl() {
  if (typeof window === "undefined") return null; // SSR/edge guard

  const url = new URL(window.location.href);

  // Check for magic-link tokens in URL hash
  const hashParams = new URLSearchParams(
    url.hash.startsWith("#") ? url.hash.slice(1) : url.hash
  );
  const hasAccessToken =
    hashParams.has("access_token") && hashParams.has("refresh_token");

  // Check for OAuth PKCE code flow
  const hasAuthCode =
    url.searchParams.has("code") && url.searchParams.has("state");

  if (!hasAccessToken && !hasAuthCode) return null; // Nothing to do

  try {
    let result;
    if (hasAuthCode) {
      // Exchange the authorization code for a session (OAuth)
      result = await supabase.auth.exchangeCodeForSession(url.href);
    } else {
      throw new Error(
        "This should not happen and isnt possible. this would be the flow for hasAccessToken"
      );
    }

    const { data, error } = result;
    if (error) throw error;

    // Clean up URL – remove auth params/hash.
    url.hash = "";
    url.searchParams.delete("code");
    url.searchParams.delete("state");
    window.history.replaceState({}, document.title, url.pathname + url.search);

    return data.session ?? null;
  } catch (err) {
    console.error("Supabase auth callback processing failed:", err);
    return null;
  }
}

// Automatically attempt hydration on module load so apps don't have to call
// this explicitly.
(async () => {
  await hydrateSessionFromUrl();
})();

/*********************
 * Client-side Auth UI
 *********************/

let authResolvers = null; // { resolve, reject }

// Listen for auth state changes so we can automatically resolve promises and hide UI.
supabase.auth.onAuthStateChange((event, session) => {
  if (event === "SIGNED_IN" && authResolvers?.resolve) {
    hideAuthModal();
    authResolvers.resolve(session.user);
    authResolvers = null;
  }
});

// Public: ensure the user is signed in, otherwise show the modal.
// Returns a Promise that resolves with the authenticated user.
export async function signIn() {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (user) return user;

  return new Promise((resolve, reject) => {
    authResolvers = { resolve, reject };
    showAuthModal();
  });
}

export async function signOut() {
  await supabase.auth.signOut();
}

/*********************
 * Modal helpers
 *********************/
function showAuthModal() {
  // Remove any existing modal first
  const existingModal = document.getElementById("supabase-auth-modal");
  if (existingModal) {
    existingModal.remove();
  }

  injectStyles();

  const wrapper = document.createElement("div");
  wrapper.id = "supabase-auth-modal";
  wrapper.className = "supabase-auth-wrapper";
  wrapper.innerHTML = `
      <div class="supabase-auth-backdrop"></div>
      <div class="supabase-auth-content">
          <button id="supabase-auth-close" class="supabase-auth-close">×</button>
          <h2 class="supabase-auth-title">Sign in</h2>
          <button id="supabase-auth-google" class="supabase-auth-btn google"><img src="https://www.gstatic.com/firebasejs/ui/2.0.0/images/auth/google.svg" alt="Google logo" class="google-logo" /> Continue with Google</button>
        
      </div>
  `;
  document.body.appendChild(wrapper);

  // Event listeners
  wrapper
    .querySelector("#supabase-auth-close")
    .addEventListener("click", hideAuthModal);
  wrapper
    .querySelector(".supabase-auth-backdrop")
    .addEventListener("click", hideAuthModal);

  wrapper
    .querySelector("#supabase-auth-google")
    .addEventListener("click", async () => {
      try {
        await supabase.auth.signInWithOAuth({
          provider: "google",
          options: { redirectTo: window.location.origin },
        });
      } catch (err) {
        console.error(err);
        authResolvers?.reject?.(err);
      }
    });

  wrapper
    .querySelector("#supabase-auth-email-form")
    .addEventListener("submit", async (e) => {
      e.preventDefault();
      const emailInput = e.target.querySelector("input");
      const email = emailInput.value.trim();
      if (!email) return;
      try {
        await supabase.auth.signInWithOtp({
          email,
          options: { redirectTo: window.location.href },
        });
        emailInput.value = "";
        e.target.querySelector("button").textContent = "Check your inbox!";
      } catch (err) {
        console.error(err);
        authResolvers?.reject?.(err);
      }
    });
}

function hideAuthModal() {
  const modal = document.getElementById("supabase-auth-modal");
  if (modal) {
    modal.remove();
  }
  // Also reject any pending auth promise if user cancels
  if (authResolvers?.reject) {
    authResolvers.reject(new Error("Authentication cancelled"));
    authResolvers = null;
  }
}

function injectStyles() {
  if (document.getElementById("supabase-auth-styles")) return; // already done

  const style = document.createElement("style");
  style.id = "supabase-auth-styles";
  style.textContent = `
    .supabase-auth-wrapper{position:fixed;inset:0;display:flex;align-items:center;justify-content:center;z-index:9999}
    .supabase-auth-backdrop{position:absolute;inset:0;background:rgba(0,0,0,.6)}
    .supabase-auth-content{position:relative;background:#fff;color:#000;padding:2rem 2.5rem;border-radius:0.75rem;max-width:90%;width:25rem;font-family:system-ui,-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif}
    .supabase-auth-close{position:absolute;top:0.75rem;right:0.75rem;border:none;background:none;font-size:1.5rem;cursor:pointer;color:#666}
    .supabase-auth-title{margin-top:0;margin-bottom:1rem;font-size:1.5rem;font-weight:600;text-align:center}
    .supabase-auth-btn{width:100%;padding:0.75rem 1rem;margin-bottom:0.75rem;border:none;border-radius:0.5rem;font-size:1rem;font-weight:600;cursor:pointer}
    .supabase-auth-btn.google{background:#4285F4;color:#fff;display:flex;align-items:center;justify-content:center;gap:0.5rem}
    .supabase-auth-btn.google .google-logo{width:1.25rem;height:1.25rem;background:#fff;border-radius:2px}
    .supabase-auth-btn.email{background:#000;color:#fff}
    .supabase-auth-divider{text-align:center;margin:0.75rem 0;font-size:0.875rem;color:#666}
    .supabase-auth-email-form{display:flex;flex-direction:column;gap:0.5rem}
    .supabase-auth-input{padding:0.75rem 1rem;border:1px solid #ccc;border-radius:0.5rem;font-size:1rem}
  `;
  document.head.appendChild(style);
}
