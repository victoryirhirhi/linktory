const qs = (s, r = document) => r.querySelector(s);
const qsa = (s, r = document) => [...r.querySelectorAll(s)];
const apiBase = "/api";

let telegram_id = null;
let username = null;

// ✅ Telegram init + auto-login for existing users
async function initTelegram() {
  try {
    const tg = window.Telegram?.WebApp;

    if (tg) {
      tg.expand();
      tg.ready();
      const user = tg.initDataUnsafe?.user;
      if (user) {
        telegram_id = user.id;
        username = user.username || `u${telegram_id}`;
        qs("#userBadge").textContent = "@" + username;

        // Register user if not exists
        await fetch(apiBase + "/register", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ telegram_id, username }),
        }).catch((e) => console.warn("register failed", e));

        return;
      }
    }

    // Fallback: check if user already exists in DB via session
    const res = await fetch(apiBase + "/session", {
      method: "GET",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
    });
    const data = await res.json();
    if (data.ok && data.telegram_id) {
      telegram_id = data.telegram_id;
      username = data.username || `u${telegram_id}`;
      qs("#userBadge").textContent = "@" + username;
      return;
    }

    // Fallback: Guest mode
    showGuest("Please open this app from Telegram or log in via bot.");

  } catch (e) {
    console.error("initTelegram error:", e);
    showGuest("Please open this app from Telegram.");
  }
}

function showGuest(msg = "Guest mode") {
  qs("#userBadge").textContent = "Guest";
  notify(msg, true);
}

// ---------------------------
// API utility
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
// Loaders
// ---------------------------
async function loadRecentLinks() {
  const box = qs("#recentList");
  box.textContent = "Loading...";
  const res = await api("/recent");
  if (!res.ok) return (box.textContent = "Failed to load");
  if (!Array.isArray(res.rows) || res.rows.length === 0)
    return (box.textContent = "No links yet");
  box.innerHTML = res.rows
    .map((r) => `<li><a href="${r.url}" target="_blank" rel="noreferrer">${r.url}</a></li>`)
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
    .map((r) => `<li>${r.username || r.telegram_id} — ${r.points} pts</li>`)
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
// Initialize
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
