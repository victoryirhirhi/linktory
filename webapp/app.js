// webapp/app.js
const qs = (s, r = document) => r.querySelector(s);
const qsa = (s, r = document) => [...r.querySelectorAll(s)];
const apiBase = "/api";

let telegram_id = null;
let username = null;

// initTelegram verifies with server via /api/authInit (server will set session cookie)
async function initTelegram() {
  try {
    const tg = window.Telegram?.WebApp;
    if (!tg) {
      showGuest();
      return;
    }

    // Prefer the signed raw initData string
    const initData = tg.initData || tg.initDataUnsafe?.initData || null;

    if (!initData) {
      // fallback to unsafe user info (no server verification)
      const unsafe = tg.initDataUnsafe || {};
      const user = unsafe.user || null;
      if (!user) {
        showGuest();
        return;
      }
      telegram_id = user.id;
      username = user.username || `u${telegram_id}`;
      qs("#userBadge").textContent = "@" + username;
      // best-effort register
      fetch(apiBase + "/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ telegram_id, username })
      }).catch(e => console.warn("register failed", e));
      return;
    }

    // Send signed initData to server, server verifies and sets cookie
    const authRes = await fetch(apiBase + "/authInit", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ initData })
    });

    const authJson = await authRes.json().catch(() => ({ ok: false }));
    if (!authJson.ok) {
      // fallback: try unsafe user
      const unsafe = tg.initDataUnsafe || {};
      const user = unsafe.user || null;
      if (!user) {
        showGuest();
        return;
      }
      telegram_id = user.id;
      username = user.username || `u${telegram_id}`;
      qs("#userBadge").textContent = "@" + username;
      fetch(apiBase + "/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ telegram_id, username })
      }).catch(e => console.warn("register failed", e));
      return;
    }

    telegram_id = authJson.telegram_id;
    username = authJson.username || `u${telegram_id}`;
    qs("#userBadge").textContent = "@" + username;
  } catch (e) {
    console.warn("initTelegram error", e);
    showGuest();
  }
}

function showGuest() {
  qs("#userBadge").textContent = "Guest";
}

async function api(path, opts = {}) {
  try {
    const res = await fetch(apiBase + path, {
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      ...opts
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
  qsa(".page").forEach(p => p.classList.toggle("active", p.id === id));
  qsa(".menu-item").forEach(b => b.classList.toggle("active", b.dataset.target === id));
}

async function handleCheck() {
  const url = qs("#linkInput").value.trim();
  if (!url.startsWith("http")) return notify("Enter valid URL", true);

  const res = await api("/checkLink", {
    method: "POST",
    body: JSON.stringify({ url })
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
    body: JSON.stringify({ url, telegram_id })
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
    body: JSON.stringify({ url, reason, telegram_id })
  });

  if (!res.ok) return notify(res.message || res.error || "Failed", true);
  notify("Report submitted");
  await loadLeaderboard();
}

async function loadRecentLinks() {
  const box = qs("#recentList");
  box.textContent = "Loading...";
  const res = await api("/recent");
  if (!res.ok) return box.textContent = "Failed to load";
  if (!Array.isArray(res.rows) || res.rows.length === 0) return box.textContent = "No links yet";
  box.innerHTML = res.rows.map(r => `<li><a href="${r.url}" target="_blank" rel="noreferrer">${r.url}</a></li>`).join("");
}

async function loadLeaderboard() {
  const box = qs("#leaderboardList");
  box.textContent = "Loading...";
  const res = await api("/leaderboard");
  if (!res.ok) return box.textContent = "Failed";
  if (!Array.isArray(res.rows) || res.rows.length === 0) return box.textContent = "No contributors yet";
  box.innerHTML = res.rows.map(r => `<li>${r.username || r.telegram_id} — ${r.points} pts</li>`).join("");
}

function loadTasks() {
  const list = qs("#taskList");
  if (!list) return;
  const saved = JSON.parse(localStorage.getItem("tasks") || "{}");
  const tasks = [
    { id: "t_add_1", title: "Add 1 link", points: 5 },
    { id: "t_report_1", title: "Report 1 link", points: 5 },
    { id: "t_invite_1", title: "Invite 1 friend", points: 10 }
  ];
  list.innerHTML = tasks.map(t => `
    <li>
      <div>
        <div class="task-title">${t.title}</div>
        <div class="task-meta">${t.points} pts</div>
      </div>
      <div>
        <button data-task="${t.id}" class="btn ${saved[t.id] ? "neutral" : "primary"}">${saved[t.id] ? "Claimed" : "Claim"}</button>
      </div>
    </li>
  `).join("");

  list.querySelectorAll("button[data-task]").forEach(b => {
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

document.addEventListener("DOMContentLoaded", () => {
  initTelegram();

  qsa(".menu-item").forEach(btn => btn.addEventListener("click", () => showPage(btn.dataset.target)));
  qs("#checkBtn").addEventListener("click", handleCheck);
  qs("#addBtn").addEventListener("click", handleAdd);
  qs("#reportBtn").addEventListener("click", handleReport);
  qs("#refreshLeaderboard").addEventListener("click", loadLeaderboard);

  showPage("home");
  loadRecentLinks();
  loadLeaderboard();
  loadTasks();
});
