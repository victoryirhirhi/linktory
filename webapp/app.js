/////////////////////////////////////////////////
// ✅ webapp/app.js — FULL CLEAN & FIXED
/////////////////////////////////////////////////

const qs = (sel, root = document) => root.querySelector(sel);
const qsa = (sel, root = document) => Array.from(root.querySelectorAll(sel));
const apiBase = "/api";

// DOM Elements
const loader = qs("#loader");
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

// ✅ Loader Control — FIXED!
function showLoader() {
  loader?.classList.remove("hidden");
}
function hideLoader() {
  loader?.classList.add("hidden");
}

// Disable UI while loading
function setLoadingState(state) {
  [checkBtn, addBtn, reportBtn, refreshLeaderboardBtn]
    .forEach(btn => btn && (btn.disabled = state));
  state ? showLoader() : hideLoader();
}

// ✅ API Wrapper — Loader ALWAYS stops ✅
async function api(path, opts = {}) {
  setLoadingState(true);
  try {
    const res = await fetch(apiBase + path, {
      headers: { "Content-Type": "application/json" },
      ...opts
    });
    const json = await res.json().catch(() => ({}));
    return json;
  } catch (err) {
    return { ok: false, error: "Request failed" };
  } finally {
    setLoadingState(false);
  }
}

// ✅ Notifications
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

// ✅ Home Actions
async function handleCheck() {
  const url = linkInput.value.trim();
  if (!/^https?:\/\//i.test(url)) return notify("Enter valid link", true);

  const res = await api("/checkLink", {
    method: "POST",
    body: JSON.stringify({ url })
  });

  if (!res.ok) return notify(res.error || "Error checking link", true);
  notify(res.exists ? "⚠️ Already exists!" : "✅ Safe — Add it!");
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

  const reason = prompt("Reason for report?");
  if (!reason) return;

  const res = await api("/report", {
    method: "POST",
    body: JSON.stringify({ url, reason })
  });

  notify(res.ok ? "⚠️ Report submitted!" : res.error, !res.ok);
  loadLeaderboard();
}

// ✅ Recent Links
async function loadRecentLinks() {
  if (!recentList) return;
  recentList.textContent = "Loading...";
  const res = await api("/recent");
  if (!res.ok || !res.rows) {
    recentList.textContent = "Failed to load links";
    return;
  }
  recentList.innerHTML = res.rows.length
    ? res.rows.map(r => `<li><a href="${r.url}" target="_blank">${r.url}</a></li>`).join("")
    : "No recent links";
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
    .map(r => `<li>${r.username ?? "User"} — ${r.points} pts</li>`)
    .join("");
}

// ✅ Earn Tasks (Offline Local Achievements)
const TASKS = [
  { id: "t1", title: "Add your first link", points: 5 },
  { id: "t2", title: "Report a scam", points: 5 },
  { id: "t3", title: "Share Linktory", points: 10 }
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
      const id = btn.dataset.id;
      saved[id] = true;
      localStorage.setItem("tasks", JSON.stringify(saved));
      notify("✅ Task Completed!");
      loadTasks();
    };
  });
}

// ✅ INIT
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

// ✅ ALWAYS ensure loader stops (final safety)
window.addEventListener("error", hideLoader);
window.addEventListener("unhandledrejection", hideLoader);
