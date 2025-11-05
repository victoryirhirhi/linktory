/////////////////////////////////////////////////
// ✅ webapp/app.js — CLEAN VERSION (NO LOADER)
/////////////////////////////////////////////////

const qs = (sel, root = document) => root.querySelector(sel);
const qsa = (sel, root = document) => Array.from(root.querySelectorAll(sel));
const apiBase = "/api";

// DOM Elements
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

// ✅ API Wrapper (simple)
async function api(path, opts = {}) {
  try {
    const res = await fetch(apiBase + path, {
      headers: { "Content-Type": "application/json" },
      ...opts
    });
    return await res.json().catch(() => ({}));
  } catch (err) {
    return { ok: false, error: "Network error" };
  }
}

// ✅ Notification
function notify(msg, err = false) {
  if (!resultBox) return;
  resultBox.textContent = msg;
  resultBox.style.borderLeft = err ? "4px solid #e33" : "4px solid var(--accent)";
  resultBox.classList.remove("hidden");
  setTimeout(() => resultBox.classList.add("hidden"), 4000);
}

// ✅ Navigation
function showPage(id) {
  qsa(".page").forEach(p => p.classList.toggle("active", p.id === id));
  menuButtons.forEach(b => b.classList.toggle("active", b.dataset.target === id));
}

// ✅ Home Buttons
async function handleCheck() {
  const url = linkInput.value.trim();
  if (!/^https?:\/\//i.test(url)) return notify("Enter valid link", true);

  const res = await api("/checkLink", {
    method: "POST",
    body: JSON.stringify({ url })
  });
  if (!res.ok) return notify(res.error, true);

  notify(res.exists ? "⚠️ Already exists" : "✅ Safe — Add it!");
}

async function handleAdd() {
  const url = linkInput.value.trim();
  if (!/^https?:\/\//i.test(url)) return notify("Enter valid link", true);

  const res = await api("/addLink", {
    method: "POST",
    body: JSON.stringify({ url })
  });

  notify(res.ok ? "✅ Link Added!" : res.error, !res.ok);
  linkInput.value = "";
  loadRecentLinks();
  loadLeaderboard();
}

async function handleReport() {
  const url = linkInput.value.trim();
  if (!/^https?:\/\//i.test(url)) return notify("Enter valid link", true);

  const reason = prompt("Reason?");
  if (!reason) return;

  const res = await api("/report", {
    method: "POST",
    body: JSON.stringify({ url, reason })
  });

  notify(res.ok ? "⚠️ Report submitted" : res.error, !res.ok);
  loadLeaderboard();
}

// ✅ Recent Links
async function loadRecentLinks() {
  if (!recentList) return;
  recentList.textContent = "Loading...";
  const res = await api("/recent");
  if (!res.ok || !res.rows) {
    recentList.textContent = "Failed";
    return;
  }
  recentList.innerHTML = res.rows.length
    ? res.rows.map(r => `<li><a href="${r.url}" target="_blank">${r.url}</a></li>`).join("")
    : "No links yet";
}

// ✅ Leaderboard
async function loadLeaderboard() {
  if (!leaderboardList) return;
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

// ✅ Earn — Local Tasks
const TASKS = [
  { id: "t1", title: "Add 1 link", points: 5 },
  { id: "t2", title: "Report link", points: 5 },
  { id: "t3", title: "Invite friend", points: 10 }
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
      notify("✅ Task Completed!");
      loadTasks();
    };
  });
}

// ✅ Init App
document.addEventListener("DOMContentLoaded", () => {
  menuButtons.forEach(btn => btn.onclick = () => showPage(btn.dataset.target));
  checkBtn?.addEventListener("click", handleCheck);
  addBtn?.addEventListener("click", handleAdd);
  reportBtn?.addEventListener("click", handleReport);
  refreshLeaderboardBtn?.addEventListener("click", loadLeaderboard);

  showPage("home");
  loadRecentLinks();
  loadLeaderboard();
  loadTasks();
});
