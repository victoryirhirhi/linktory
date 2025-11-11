// ---------------------------
// Utility Selectors
// ---------------------------
const qs = (s, r = document) => r.querySelector(s);
const qsa = (s, r = document) => [...r.querySelectorAll(s)];
const apiBase = "/api";

let telegram_id = null;
let username = null;

// ---------------------------
// ✅ Telegram Initialization (Improved)
// ---------------------------
async function initTelegram() {
  try {
    const tg = window.Telegram?.WebApp;

    if (!tg) {
      console.warn("❌ Not running inside Telegram WebApp.");
      showGuest("Please open this app from Telegram.");
      return;
    }

    tg.expand();
    tg.ready();

    // Log Telegram object for debugging
    console.log("🟢 Telegram WebApp detected:", tg);
    console.log("InitData:", tg.initData);
    console.log("InitDataUnsafe:", tg.initDataUnsafe);

    // ✅ Use initDataUnsafe.user (Telegram provides this in WebApp)
    const user = tg.initDataUnsafe?.user;
    if (!user || !user.id) {
      console.warn("⚠️ No Telegram user detected. Possibly opened outside Telegram.");
      showGuest("Please open this from Telegram.");
      return;
    }

    // ✅ Assign user data
    telegram_id = user.id;
    username = user.username || `u${telegram_id}`;
    qs("#userBadge").textContent = "@" + username;

    // Optional: live debug status
    const status = qs("#status");
    if (status) status.textContent = `✅ Logged in as @${username} (${telegram_id})`;

    console.log("✅ Telegram user detected:", telegram_id, username);

    // ✅ Register user (if not in DB, backend will handle that)
    await fetch(apiBase + "/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ telegram_id, username }),
    }).catch((e) => console.warn("register failed", e));

  } catch (e) {
    console.error("💥 initTelegram error:", e);
    showGuest("Please open this from Telegram.");
  }
}

// ---------------------------
// Guest Mode
// ---------------------------
function showGuest(msg = "Guest mode: open in Telegram") {
  qs("#userBadge").textContent = "Guest";
  notify(msg, true);
  const status = qs("#status");
  if (status) status.textContent = `🚫 ${msg}`;
}

// ---------------------------
// API Utility
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

// ---------------------------
// UI Helpers
// ---------------------------
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
// Link Actions
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
  if (!telegram_id) return notify("Open the app from Telegram to add links", true);

  const res = await api("/addLink", {
    method: "POST",
    body: JSON.stringify({ url, telegram_id }),
  });

  if (!res.ok) return notify(res.message || res.error || "Failed", true);
  notify(res.added ? "Added" : res.message || "Already exists");
  await loadRecentLinks();
  await loadLeaderboard();
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
// Data Loaders
// ---------------------------
async function loadRecentLinks() {
  const box = qs("#recentList");
  box.textContent = "Loading...";
  const res = await api("/recent");
  if (!res.ok) return (box.textContent = "Failed to load");
  if (!Array.isArray(res.rows) || res.rows.length === 0)
    return (box.textContent = "No links yet");
  box.innerHTML = res.rows
    .map(
      (r) =>
        `<li><a href="${r.url}" target="_blank" rel="noreferrer">${r.url}</a></li>`
    )
    .join("");
}

async function loadLeaderboard() {
  const box = qs("#leaderboardList");
  box.textContent = "Loading...";
  const res = await api("/leaderboard");
  if (!res.ok) return (box.textContent = "Failed");
  if (!Array.isArray(res.rows) || res.rows.length === 0)
    return (box.textContent = "No contributors yet");
  box.innerHTML = res.rows
    .map(
      (r) =>
        `<li>${r.username || r.telegram_id} — ${r.points} pts</li>`
    )
    .join("");
}

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
    </li>
  `
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
// Initialize everything
// ---------------------------
document.addEventListener("DOMContentLoaded", () => {
  initTelegram();

  qsa(".menu-item").forEach((btn) =>
    btn.addEventListener("click", () => showPage(btn.dataset.target))
  );
  qs("#checkBtn").addEventListener("click", handleCheck);
  qs("#addBtn").addEventListener("click", handleAdd);
  qs("#reportBtn").addEventListener("click", handleReport);
  qs("#refreshLeaderboard").addEventListener("click", loadLeaderboard);

  showPage("home");
  loadRecentLinks();
  loadLeaderboard();
  loadTasks();
});
