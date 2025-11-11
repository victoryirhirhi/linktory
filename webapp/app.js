const qs = (s, r = document) => r.querySelector(s);
const qsa = (s, r = document) => [...r.querySelectorAll(s)];
const apiBase = "/api";

let telegram_id = null;
let username = null;

// ---------------------------
// Telegram + session init
// ---------------------------
async function initTelegram() {
  const statusEl = qs("#status");
  statusEl.textContent = "Checking Telegram login...";

  try {
    const tg = window.Telegram?.WebApp;
    if (!tg) {
      statusEl.textContent = "Please open this app from Telegram.";
      return;
    }

    tg.expand();
    tg.ready();

    // Prefer initDataUnsafe if no signed initData
    const user = tg.initDataUnsafe?.user;
    if (!user) {
      statusEl.textContent = "Telegram user not found.";
      return;
    }

    telegram_id = user.id;
    username = user.username || `u${telegram_id}`;
    qs("#userBadge").textContent = "@" + username;

    // ✅ Call backend to register / verify
    await fetch(apiBase + "/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ telegram_id, username }),
    });

    statusEl.textContent = "Logged in as @" + username;

    // ✅ Load data only after Telegram session
    await loadRecentLinks();
    await loadLeaderboard();
  } catch (e) {
    console.error("initTelegram error:", e);
    statusEl.textContent = "Error initializing Telegram session.";
  }
}

// ---------------------------
// API helper
// ---------------------------
async function api(path, opts = {}) {
  try {
    const res = await fetch(apiBase + path, {
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      ...opts,
    });
    return await res.json().catch(() => ({}));
  } catch (e) {
    return { ok: false, error: "Network error" };
  }
}

function notify(msg, err = false) {
  const box = qs("#result");
  if (!box) return;
  box.textContent = msg;
  box.classList.remove("hidden");
  box.style.borderLeft = err ? "4px solid #e33" : "4px solid var(--accent)";
  setTimeout(() => box.classList.add("hidden"), 4000);
}

function showPage(id) {
  qsa(".page").forEach((p) => p.classList.toggle("active", p.id === id));
  qsa(".menu-item").forEach((b) =>
    b.classList.toggle("active", b.dataset.target === id)
  );
}

// ---------------------------
// Link actions
// ---------------------------
async function handleCheck() {
  const url = qs("#linkInput").value.trim();
  if (!url.startsWith("http")) return notify("Enter valid URL", true);

  const res = await api("/checkLink", { method: "POST", body: JSON.stringify({ url }) });
  if (!res.ok) return notify(res.message || res.error || "Failed", true);

  notify(res.exists ? "Link found" : "No record, add it");
}

async function handleAdd() {
  const url = qs("#linkInput").value.trim();
  if (!url.startsWith("http")) return notify("Enter valid URL", true);
  if (!telegram_id) return notify("Open the app from Telegram to add links", true);

  const res = await api("/addLink", {
    method: "POST",
    body: JSON.stringify({ url, telegram_id }),
  });

  if (!res.ok) return notify(res.message || res.error || "Failed", true);
  notify(res.added ? "Added" : res.message || "Already exists");

  await loadRecentLinks();
  qs("#linkInput").value = "";
}

async function handleReport() {
  const url = qs("#linkInput").value.trim();
  if (!url.startsWith("http")) return notify("Enter valid URL", true);
  if (!telegram_id) return notify("Open the app from Telegram to report", true);

  const reason = window.prompt("Why are you reporting?");
  if (!reason) return;

  const res = await api("/report", {
    method: "POST",
    body: JSON.stringify({ url, reason, telegram_id }),
  });

  if (!res.ok) return notify(res.message || res.error || "Failed", true);
  notify("Report submitted");
  await loadLeaderboard();
}

// ---------------------------
// Data loaders
// ---------------------------
async function loadRecentLinks() {
  const box = qs("#recentList");
  box.textContent = "Loading...";
  const res = await api("/recent");
  if (!res.ok) return (box.textContent = "Failed to load");
  if (!Array.isArray(res.rows) || res.rows.length === 0) return (box.textContent = "No links yet");
  box.innerHTML = res.rows
    .map(r => `<li><a href="${r.url}" target="_blank" rel="noreferrer">${r.url}</a></li>`)
    .join("");
}

async function loadLeaderboard() {
  const box = qs("#leaderboardList");
  box.textContent = "Loading...";
  const res = await api("/leaderboard");
  if (!res.ok) return (box.textContent = "Failed");
  if (!Array.isArray(res.rows) || res.rows.length === 0) return (box.textContent = "No contributors yet");
  box.innerHTML = res.rows
    .map(r => `<li>${r.username || r.telegram_id} — ${r.points} pts</li>`)
    .join("");
}

// ---------------------------
// Init
// ---------------------------
document.addEventListener("DOMContentLoaded", () => {
  initTelegram();

  qsa(".menu-item").forEach(btn => btn.addEventListener("click", () => showPage(btn.dataset.target)));
  qs("#checkBtn").addEventListener("click", handleCheck);
  qs("#addBtn").addEventListener("click", handleAdd);
  qs("#reportBtn").addEventListener("click", handleReport);
  qs("#refreshLeaderboard").addEventListener("click", loadLeaderboard);
});
