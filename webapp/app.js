/////////////////////////////////////////////////
// ✅ webapp/app.js — CLEAN (NO LOADER AT ALL)
/////////////////////////////////////////////////

const qs = (sel, root = document) => root.querySelector(sel);
const qsa = (sel, root = document) => Array.from(root.querySelectorAll(sel));
const apiBase = "/api";

// DOM
const linkInput = qs("#linkInput");
const checkBtn = qs("#checkBtn");
const addBtn = qs("#addBtn");
const reportBtn = qs("#reportBtn");
const resultBox = qs("#result");
const recentList = qs("#recentList");
const leaderboardList = qs("#leaderboardList");
const refreshLeaderboardBtn = qs("#refreshLeaderboard");
const taskList = qs("#taskList");
const menuButtons = qsa(".menu-item");

// ✅ Simple API wrapper
async function api(path, opts = {}) {
  try {
    const res = await fetch(apiBase + path, {
      headers: { "Content-Type": "application/json" },
      ...opts
    });
    return await res.json().catch(() => ({}));
  } catch {
    return { ok: false, error: "Network error" };
  }
}

// ✅ Messages
function notify(msg, err = false) {
  resultBox.textContent = msg;
  resultBox.classList.remove("hidden");
  resultBox.style.borderLeft = err ? "4px solid #e33" : "4px solid var(--accent)";
  setTimeout(() => resultBox.classList.add("hidden"), 4000);
}

// ✅ Navigation
function showPage(id) {
  qsa(".page").forEach(p => p.classList.toggle("active", p.id === id));
  menuButtons.forEach(b => b.classList.toggle("active", b.dataset.target === id));
}

// ✅ Home actions
async function handleCheck() {
  const url = linkInput.value.trim();
  if (!/^https?:\/\//i.test(url)) return notify("Enter valid URL", true);

  const res = await api("/checkLink", {
    method: "POST",
    body: JSON.stringify({ url })
  });

  notify(res.exists ? "⚠️ Already exists" : "✅ Safe — Add it!");
}

async function handleAdd() {
  const url = linkInput.value.trim();
  if (!/^https?:\/\//i.test(url)) return notify("Enter valid URL", true);

  const res = await api("/addLink", {
    method: "POST",
    body: JSON.stringify({ url })
  });

  notify(res.ok ? "✅ Link Added" : res.error, !res.ok);
  loadRecentLinks();
  loadLeaderboard();
  linkInput.value = "";
}

async function handleReport() {
  const url = linkInput.value.trim();
  if (!/^https?:\/\//i.test(url)) return notify("Enter valid URL", true);

  const reason = prompt("Reason?");
  if (!reason) return;

  const res = await api("/report", {
    method: "POST",
    body: JSON.stringify({ url, reason })
  });

  notify(res.ok ? "⚠️ Report submitted" : res.error, !res.ok);
  loadLeaderboard();
}

// ✅ Recent links
async function loadRecentLinks() {
  recentList.textContent = "Loading...";
  const res = await api("/recent");

  if (!res.ok || !res.rows) {
    recentList.textContent = "Failed";
    return;
  }

  recentList.innerHTML = res.rows.length
    ? res.rows.map(r =>
        `<li><a href="${r.url}" target="_blank">${r.url}</a></li>`
      ).join("")
    : "No links yet";
}

// ✅ Leaderboard
async function loadLeaderboard() {
  leaderboardList.textContent = "Loading...";
  const res = await api("/leaderboard");

  if (!res.ok || !res.rows) {
    leaderboardList.textContent = "No data";
    return;
  }

  leaderboardList.innerHTML = res.rows
    .map(r => `<li>${r.username || "User"} — ${r.points} pts</li>`)
    .join("");
}

// ✅ Tasks
const TASKS = [
  { id: "t1", title: "Add a link ✅", points: 5 },
  { id: "t2", title: "Report a link 🚨", points: 5 },
  { id: "t3", title: "Invite a friend 🤝", points: 10 }
];

function loadTasks() {
  const saved = JSON.parse(localStorage.getItem("tasks") || "{}");

  taskList.innerHTML = TASKS.map(t => `
    <li>
      ${t.title} — ${t.points} pts
      <button data-id="${t.id}">
        ${saved[t.id] ? "✅ Done" : "Claim"}
      </button>
    </li>
  `).join("");

  taskList.querySelectorAll("button").forEach(btn => {
    btn.onclick = () => {
      saved[btn.dataset.id] = true;
      localStorage.setItem("tasks", JSON.stringify(saved));
      notify("✅ Task completed!");
      loadTasks();
    };
  });
}

// ✅ Init
document.addEventListener("DOMContentLoaded", () => {
  menuButtons.forEach(btn => btn.onclick = () => showPage(btn.dataset.target));
  checkBtn.onclick = handleCheck;
  addBtn.onclick = handleAdd;
  reportBtn.onclick = handleReport;
  refreshLeaderboardBtn.onclick = loadLeaderboard;

  showPage("home");
  loadRecentLinks();
  loadLeaderboard();
  loadTasks();
});
