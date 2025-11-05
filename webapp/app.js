/////////////////////////////////////////////////
// ✅ webapp/app.js — Telegram Auth + Full Fix
/////////////////////////////////////////////////

const qs = (s, r = document) => r.querySelector(s);
const qsa = (s, r = document) => [...r.querySelectorAll(s)];
const apiBase = "/api";
let telegram_id = null;
let username = null;

// ✅ Telegram initialization
function initTelegram() {
  if (window.Telegram?.WebApp?.initDataUnsafe?.user) {
    const user = window.Telegram.WebApp.initDataUnsafe.user;
    telegram_id = user.id;
    username = user.username || "User";

    qs("#userBadge").textContent = "@" + username;

    api("/register", {
      method: "POST",
      body: JSON.stringify({ telegram_id, username })
    });
  } else {
    qs("#userBadge").textContent = "Guest ❌";
  }
}

// ✅ Simple API fetch
async function api(path, opts = {}) {
  return fetch(apiBase + path, {
    headers: { "Content-Type": "application/json" },
    ...opts
  })
    .then(r => r.json().catch(() => ({})))
    .catch(() => ({ ok: false, error: "Network error" }));
}

// ✅ Notify UI
function notify(msg, err = false) {
  const box = qs("#result");
  box.textContent = msg;
  box.classList.remove("hidden");
  box.style.borderLeft = err
    ? "4px solid #e33"
    : "4px solid var(--accent)";
  setTimeout(() => box.classList.add("hidden"), 4000);
}

// ✅ Page navigation
function showPage(id) {
  qsa(".page").forEach(p => p.classList.toggle("active", p.id === id));
  qsa(".menu-item").forEach(b => b.classList.toggle("active", b.dataset.target === id));
}

// ✅ Action Handlers
async function handleCheck() {
  const url = qs("#linkInput").value.trim();
  if (!url.startsWith("http")) return notify("Enter valid URL", true);

  const res = await api("/checkLink", {
    method: "POST",
    body: JSON.stringify({ url })
  });

  notify(res.exists ? "⚠ Link already exists" : "✅ Safe — add it!");
}

async function handleAdd() {
  const url = qs("#linkInput").value.trim();
  if (!url.startsWith("http")) return notify("Enter valid URL", true);
  if (!telegram_id) return notify("Login with Telegram to add links!", true);

  const res = await api("/addLink", {
    method: "POST",
    body: JSON.stringify({ url, telegram_id })
  });

  notify(res.ok ? "✅ Added!" : res.message, !res.ok);
  loadRecentLinks();
  loadLeaderboard();
}

async function handleReport() {
  const url = qs("#linkInput").value.trim();
  if (!url.startsWith("http")) return notify("Enter valid URL", true);
  if (!telegram_id) return notify("Login with Telegram to report!", true);

  const reason = prompt("Why are you reporting?");
  if (!reason) return;

  const res = await api("/report", {
    method: "POST",
    body: JSON.stringify({ url, reason, telegram_id })
  });

  notify(res.ok ? "⚠ Report submitted" : res.message, !res.ok);
  loadLeaderboard();
}

// ✅ Recent Links
async function loadRecentLinks() {
  const box = qs("#recentList");
  box.textContent = "Loading...";

  const res = await api("/recent");

  if (!res.ok) return box.textContent = "Failed!";
  box.innerHTML = res.rows.map(l => `<li><a target="_blank" href="${l.url}">${l.url}</a></li>`).join("") || "No links yet";
}

// ✅ Leaderboard
async function loadLeaderboard() {
  const box = qs("#leaderboardList");
  box.textContent = "Loading...";

  const res = await api("/leaderboard");
  if (!res.ok) return (box.textContent = "Failed");

  box.innerHTML = res.rows
    .map(u => `<li>${u.username || "User"} — ${u.points} pts</li>`)
    .join("");
}

// ✅ Tasks
function loadTasks() {
  const list = qs("#taskList");
  const saved = JSON.parse(localStorage.getItem("tasks") || "{}");

  const tasks = [
    { id: "t1", title: "Add a link ✅", points: 5 },
    { id: "t2", title: "Report a link 🚨", points: 5 },
    { id: "t3", title: "Invite a friend 🤝", points: 10 }
  ];

  list.innerHTML = tasks
    .map(t => `
      <li>
        ${t.title} — ${t.points} pts
        <button data-id="${t.id}">${saved[t.id] ? "✅ Done" : "Claim"}</button>
      </li>
    `).join("");

  list.querySelectorAll("button").forEach(btn => {
    btn.onclick = () => {
      saved[btn.dataset.id] = true;
      localStorage.setItem("tasks", JSON.stringify(saved));
      notify("✅ Task Completed!");
      loadTasks();
    };
  });
}

// ✅ Init
document.addEventListener("DOMContentLoaded", () => {
  initTelegram();

  qsa(".menu-item").forEach(btn => btn.onclick = () => showPage(btn.dataset.target));
  qs("#checkBtn").onclick = handleCheck;
  qs("#addBtn").onclick = handleAdd;
  qs("#reportBtn").onclick = handleReport;
  qs("#refreshLeaderboard").onclick = loadLeaderboard;

  showPage("home");
  loadRecentLinks();
  loadLeaderboard();
  loadTasks();
});
