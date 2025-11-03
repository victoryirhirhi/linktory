// webapp/app.js
const qs = (sel, root = document) => root.querySelector(sel);
const qsa = (sel, root = document) => Array.from(root.querySelectorAll(sel));
const apiBase = "/api"; // keep relative so it hits your backend

// UI refs
const loader = qs("#loader");
const userBadge = qs("#userBadge");
const linkInput = qs("#linkInput");
const checkBtn = qs("#checkBtn");
const addBtn = qs("#addBtn");
const reportBtn = qs("#reportBtn");
const resultBox = qs("#result");
const earnStats = qs("#earnStats");
const leaderboardList = qs("#leaderboardList");
const profileForm = qs("#profileForm");
const profileInput = qs("#profileInput");
const profileData = qs("#profileData");

// Helpers
function showLoader() { loader.classList.remove("hidden"); }
function hideLoader() { loader.classList.add("hidden"); }
function showPage(id) {
  qsa(".page").forEach(p => p.classList.remove("active"));
  qs(`#${id}`).classList.add("active");
  qsa(".menu-item").forEach(btn => btn.classList.remove("active"));
  qs(`.menu-item[data-target="${id}"]`).classList.add("active");
}
function notify(msg, type = "info") {
  resultBox.classList.remove("hidden");
  resultBox.textContent = msg;
  resultBox.style.borderLeft = (type === "err") ? "4px solid #ff6b6b" : "4px solid var(--accent)";
  setTimeout(() => { resultBox.classList.add("hidden"); }, 8000);
}
async function api(path, opts = {}) {
  try {
    showLoader();
    const res = await fetch(`${apiBase}${path}`, opts);
    const json = await res.json();
    hideLoader();
    return json;
  } catch (e) {
    hideLoader();
    console.error(e);
    return { ok: false, error: "Network error" };
  }
}

// Menu wiring
document.addEventListener("DOMContentLoaded", () => {
  qsa(".menu-item").forEach(btn => {
    btn.addEventListener("click", () => showPage(btn.dataset.target));
  });

  // fast open home
  showPage("home");
  loadLeaderboard(); // prefetch
  loadUserFromTelegram(); // try to load user data (see below)
});

// Try to get Telegram initData if available (WebApp within Telegram)
function loadUserFromTelegram() {
  try {
    // Telegram Web App exposes window.Telegram.WebApp.initData (when opened from tg)
    if (window.Telegram && window.Telegram.WebApp && window.Telegram.WebApp.initDataUnsafe) {
      const init = window.Telegram.WebApp.initDataUnsafe || {};
      const user = init.user || null;
      if (user) {
        userBadge.textContent = user.username ? `@${user.username}` : user.id;
        profileInput.value = user.id;
        // auto register user at backend silently
        api("/register", { method: "POST", headers: {"content-type":"application/json"}, body: JSON.stringify({ telegram_id: user.id, username: user.username }) });
      }
    }
  } catch (e) {
    console.warn("TG WebApp not available:", e);
  }
}

// -------- handle checks/add/report --------
checkBtn.addEventListener("click", async () => {
  const url = linkInput.value.trim();
  if (!url) return notify("Please paste a valid URL (https://...)","err");
  const res = await api("/checkLink", { method: "POST", headers: {"content-type":"application/json"}, body: JSON.stringify({ url })});
  if (!res.ok) return notify("Server error. Try again later.", "err");
  if (!res.exists) {
    notify("No record found. You can add it.", "info");
    showPage("home");
    return;
  }
  // show link details (safe fields only)
  const { link, reports, confirmations } = res;
  const status = link.status || "pending";
  resultBox.classList.remove("hidden");
  resultBox.innerHTML = `
    <strong>Status:</strong> ${status.toUpperCase()}<br/>
    <strong>Added:</strong> ${new Date(link.created_at).toLocaleString()}<br/>
    <strong>Reports:</strong> ${reports.length} • <strong>Confirmations:</strong> ${confirmations.length}
  `;
});

addBtn.addEventListener("click", async () => {
  const url = linkInput.value.trim();
  if (!url) return notify("Please paste a valid URL (https://...)","err");

  // call addLink; server will not return short_code
  const payload = { url };
  // add telegram id if available in the profile input (makes points assign)
  if (profileInput.value) payload.telegram_id = profileInput.value;

  const res = await api("/addLink", { method: "POST", headers: {"content-type":"application/json"}, body: JSON.stringify(payload) });
  if (!res.ok) return notify("Server error. Try again later.", "err");
  if (res.added) {
    notify("✅ Link added — you earned points (hidden reference).");
    linkInput.value = "";
    // refresh stats + leaderboard
    await loadLeaderboard();
    await loadProfile(profileInput.value);
  } else {
    notify("Link already exists.", "info");
  }
});

reportBtn.addEventListener("click", async () => {
  const url = linkInput.value.trim();
  if (!url) return notify("Please paste a valid URL (https://...)","err");
  const reason = prompt("Why are you reporting this link? (optional)");
  if (reason === null) return; // user cancelled
  const payload = { url, reason };
  if (profileInput.value) payload.telegram_id = profileInput.value;
  const res = await api("/report", { method: "POST", headers: {"content-type":"application/json"}, body: JSON.stringify(payload) });
  if (!res.ok) return notify("Server error. Try again later.", "err");
  notify("Report submitted. Thanks!");
  linkInput.value = "";
  await loadLeaderboard();
});

// Profile load
qs("#profileLoad").addEventListener("click", async () => {
  const id = profileInput.value.trim();
  if (!id) return notify("Enter your Telegram ID to load profile", "err");
  await loadProfile(id);
});

async function loadProfile(id) {
  if (!id) return;
  const res = await api(`/profile/${encodeURIComponent(id)}`);
  if (!res.ok) return notify("Profile not found or server error", "err");
  const user = res.user;
  userBadge.textContent = user.username ? `@${user.username}` : user.telegram_id;
  profileData.classList.remove("hidden");
  profileData.innerHTML = `
    <div><strong>@${user.username || user.telegram_id}</strong></div>
    <div>Points: ${user.points}</div>
    <div style="margin-top:8px"><strong>Recent links</strong></div>
    <ul>${res.links.map(l => `<li>${escapeHtml(l.url)} — ${l.status} • ${new Date(l.created_at).toLocaleString()}</li>`).join("")}</ul>
  `;
}

// Leaderboard load
async function loadLeaderboard() {
  leaderboardList.textContent = "Loading...";
  const res = await api("/leaderboard");
  if (!res.ok) { leaderboardList.textContent = "Failed to load"; return; }
  if (!res.rows || res.rows.length === 0) { leaderboardList.textContent = "No contributors yet"; return; }
  leaderboardList.innerHTML = `<ol>${res.rows.map(r => `<li>${escapeHtml(r.username||r.telegram_id)} — ${r.points} pts</li>`).join("")}</ol>`;
}

// small safe HTML escape
function escapeHtml(s){ return (s||"").replace(/[&<>"']/g, c=>({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }
