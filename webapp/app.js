// utils
const qs = (s, r = document) => r.querySelector(s);
const qsa = (s, r = document) => [...r.querySelectorAll(s)];
const apiBase = "/api";

let telegram_id = null;
let username = null;

// ✅ FIX: Reliable Telegram WebApp init
async function initTelegram() {
  try {
    const tg = window.Telegram?.WebApp;
    if (!tg) {
      console.warn("⚠️ Not inside Telegram WebApp");
      showGuest("Please open this app from Telegram.");
      return;
    }

    // Ensure WebApp fully initializes
    tg.ready();
    tg.expand();

    // Wait for Telegram init data
    const user = tg.initDataUnsafe?.user;
    if (!user || !user.id) {
      console.warn("⚠️ No Telegram user detected:", tg.initDataUnsafe);
      showGuest("Please open this from Telegram.");
      return;
    }

    // ✅ We got the Telegram user
    telegram_id = user.id;
    username = user.username || `user${telegram_id}`;
    qs("#userBadge").textContent = "@" + username;

    // Optional: confirm Telegram init visually
    console.log("✅ Telegram WebApp user:", user);

    // ✅ Register the user with backend
    const registerRes = await fetch(`${apiBase}/register`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ telegram_id, username }),
    });
    const data = await registerRes.json().catch(() => ({}));
    if (!data.ok) console.warn("⚠️ register failed", data);

  } catch (e) {
    console.error("❌ initTelegram error:", e);
    showGuest("Please open this from Telegram.");
  }
}

function showGuest(msg = "Guest mode: open in Telegram") {
  qs("#userBadge").textContent = "Guest";
  notify(msg, true);
}

// ---------------------------
// Utility and API helpers
// ---------------------------
async function api(path, opts = {}) {
  try {
    const res = await fetch(apiBase + path, {
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      ...opts,
    });
    return await res.json().catch(() => ({}));
  } catch {
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
  const res = await api("/checkLink", {
    method: "POST",
    body: JSON.stringify({ url }),
  });
  if (!res.ok) return notify(res.message || res.error || "Failed", true);
  notify(res.exists ? "Link found" : "No record, add it");
}

async function handleAdd() {
  const url = qs("#linkInput").value.trim();
  if (!url.startsWith("http")) return notify("Enter valid URL", true);
  if (!telegram_id) {
    console.warn("telegram_id missing, forcing Telegram init retry...");
    await initTelegram();
    if (!telegram_id) return notify("Open this app from Telegram.", true);
  }

  const res = await api("/addLink", {
    method: "POST",
    body: JSON.stringify({ url, telegram_id }),
  });
  if (!res.ok) return notify(res.message || res.error || "Failed", true);

  notify(res.added ? "✅ Link added" : res.message || "Already exists");
  await loadRecentLinks();
  await loadLeaderboard();
  qs("#linkInput").value = "";
}

async function handleReport() {
  const url = qs("#linkInput").value.trim();
  if (!url.startsWith("http")) return notify("Enter valid URL", true);
  if (!telegram_id) {
    await initTelegram();
    if (!telegram_id) return notify("Open the app from Telegram to report", true);
  }

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
  if (!res.rows?.length) return (box.textContent = "No links yet");
  box.innerHTML = res.rows
    .map((r) => `<li><a href="${r.url}" target="_blank">${r.url}</a></li>`)
    .join("");
}

async function loadLeaderboard() {
  const box = qs("#leaderboardList");
  box.textContent = "Loading...";
  const res = await api("/leaderboard");
  if (!res.ok) return (box.textContent = "Failed");
  if (!res.rows?.length) return (box.textContent = "No contributors yet");
  box.innerHTML = res.rows
    .map((r) => `<li>${r.username || r.telegram_id} — ${r.points} pts</li>`)
    .join("");
}

// ---------------------------
// Local tasks (UI only)
// ---------------------------
function loadTasks() {
  const list = qs("#taskList");
  if (!list) return;
  const saved = JSON.parse(localStorage.getItem("tasks") || "{}");
  const tasks = [
    { id: "t_add_1", title: "Add 1 link", points: 5 },
    { id: "t_report_1", title: "Report 1 link", points: 5 },
    { id: "t_invite_1", title: "Invite 1 friend", points: 10 },
  ];
  list.innerHTML = tasks
    .map(
      (t) => `
    <li>
      <div>
        <div class="task-title">${t.title}</div>
        <div class="task-meta">${t.points} pts</div>
      </div>
      <div>
        <button data-task="${t.id}" class="btn ${
        saved[t.id] ? "neutral" : "primary"
      }">${saved[t.id] ? "Claimed" : "Claim"}</button>
      </div>
    </li>`
    )
    .join("");

  list.querySelectorAll("button[data-task]").forEach((b) => {
    b.addEventListener("click", () => {
      const id = b.dataset.task;
      const s = JSON.parse(localStorage.getItem("tasks") || "{}");
      if (s[id]) return notify("Already claimed");
      s[id] = { claimed_at: Date.now() };
      localStorage.setItem("tasks", JSON.stringify(s));
      notify("Task claimed locally");
      loadTasks();
    });
  });
}

// ---------------------------
// Init everything
// ---------------------------
document.addEventListener("DOMContentLoaded", async () => {
  await initTelegram();

  qsa(".menu-item").forEach((btn) =>
    btn.addEventListener("click", () => showPage(btn.dataset.target))
  );
  qs("#checkBtn").addEventListener("click", handleCheck);
  qs("#addBtn").addEventListener("click", handleAdd);
  qs("#reportBtn").addEventListener("click", handleReport);
  qs("#refreshLeaderboard").addEventListener("click", loadLeaderboard);

  showPage("home");
  await loadRecentLinks();
  await loadLeaderboard();
  loadTasks();
});
