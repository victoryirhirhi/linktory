// webapp/app.js (replaces your previous app.js)
const qs = (sel, root = document) => root ? root.querySelector(sel) : null;
const qsa = (sel, root = document) => (root ? Array.from(root.querySelectorAll(sel)) : []);
const apiBase = "/api";

// Safe element refs (may be null if DOM didn't include them)
const loader = qs("#loader", document);
const userBadge = qs("#userBadge", document);
const linkInput = qs("#linkInput", document);
const checkBtn = qs("#checkBtn", document);
const addBtn = qs("#addBtn", document);
const reportBtn = qs("#reportBtn", document);
const resultBox = qs("#result", document);
const recentList = qs("#recentList", document);
const leaderboardList = qs("#leaderboardList", document);
const refreshLeaderboardBtn = qs("#refreshLeaderboard", document);
const profileInput = qs("#profileInput", document);
const profileData = qs("#profileData", document);
const profileLoadBtn = qs("#profileLoad", document);
const pointsVal = qs("#pointsVal", document);
const linksCount = qs("#linksCount", document);
const taskList = qs("#taskList", document);
const menuButtons = qsa(".menu-item", document);

// Utilities
function safeRun(fn){ try { return fn(); } catch(e) { console.warn("safeRun error", e); } }
function escapeHtml(s){ return (s||"").toString().replace(/[&<>"']/g, c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }

// Loader helpers (no-ops if loader missing)
function showLoader(){
  safeRun(() => {
    if (!loader) return;
    loader.classList.remove("hidden");
    loader.setAttribute("aria-hidden","false");
  });
}
function hideLoader(){
  safeRun(() => {
    if (!loader) return;
    loader.classList.add("hidden");
    loader.setAttribute("aria-hidden","true");
  });
}

// disable/enable action buttons
function setButtonsDisabled(state){
  [checkBtn, addBtn, reportBtn, refreshLeaderboardBtn, profileLoadBtn].forEach(b=>{
    if(!b) return;
    b.disabled = !!state;
  });
}

// small debounce helper
function debounce(fn, wait=300){
  let t;
  return (...a)=>{ clearTimeout(t); t = setTimeout(()=>fn(...a), wait); };
}

// user-visible notification (auto-hide). Safe even if resultBox is missing.
function notify(msg, type="info", autoHide=true){
  safeRun(()=>{
    if (!resultBox) {
      // fallback: console
      console[type === "err" ? "error" : "log"](msg);
      return;
    }
    resultBox.classList.remove("hidden");
    resultBox.textContent = msg;
    resultBox.style.borderLeft = (type === "err") ? "4px solid #ff6b6b" : "4px solid var(--accent)";
    clearTimeout(resultBox._hideT);
    if (autoHide) {
      resultBox._hideT = setTimeout(()=>{ resultBox.classList.add("hidden"); }, 6000);
    }
  });
}

// Robust fetch wrapper with timeout + final cleanup
async function api(path, opts = {}, timeoutMs = 12000){
  // show loader only if present and request is not a super-frequent background call
  showLoader();
  setButtonsDisabled(true);
  try {
    const controller = new AbortController();
    const timer = setTimeout(()=>controller.abort(), timeoutMs);
    const res = await fetch(apiBase + path, { signal: controller.signal, ...opts });
    clearTimeout(timer);
    // if non-JSON or server error, try to parse gracefully
    const text = await res.text().catch(()=>"");
    let json;
    try { json = text ? JSON.parse(text) : { ok:false, error: "Empty response" }; }
    catch(e) { json = { ok:false, error: "Invalid JSON from server" }; }
    // attach http status in case useful
    if (!res.ok && json && !json.error) json.error = `HTTP ${res.status}`;
    return json;
  } catch (e) {
    if (e && e.name === "AbortError") return { ok:false, error:"Request timeout" };
    console.error("api error", e);
    return { ok:false, error: e && e.message ? e.message : "Network error" };
  } finally {
    hideLoader();
    setButtonsDisabled(false);
  }
}

// Navigation helper
function showPage(id){
  qsa(".page", document).forEach(p => {
    if (p.id === id) { p.classList.add("active"); p.setAttribute("aria-hidden","false"); }
    else { p.classList.remove("active"); p.setAttribute("aria-hidden","true"); }
  });
  menuButtons.forEach(b => b.classList.remove("active"));
  const btn = qs(`.menu-item[data-target="${id}"]`, document);
  if (btn) btn.classList.add("active");
}

// ---------- Home actions ----------
async function handleCheck(){
  if (!linkInput) return notify("Link input missing", "err");
  const url = linkInput.value.trim();
  if(!/^https?:\/\//i.test(url)) return notify("Please paste a valid URL (https://...)", "err");
  const res = await api("/checkLink", { method:"POST", headers:{"content-type":"application/json"}, body: JSON.stringify({ url }) }, 10000);
  if (!res) return notify("No response from server", "err");
  if (!res.ok) return notify(res.error || "Server error. Try again later.", "err");
  if (!res.exists) {
    notify("No record found. You can add it.", "info");
    showPage("home");
    return;
  }
  const { link, reports = [], confirmations = [] } = res;
  const status = link.status || "pending";
  safeRun(()=> {
    if (!resultBox) return;
    resultBox.classList.remove("hidden");
    resultBox.innerHTML = `
      <div><strong>Status:</strong> ${escapeHtml(status.toUpperCase())}</div>
      <div><strong>Added:</strong> ${link.created_at ? escapeHtml(new Date(link.created_at).toLocaleString()) : "unknown"}</div>
      <div><strong>Reports:</strong> ${reports.length} • <strong>Confirmations:</strong> ${confirmations.length}</div>
    `;
  });
}

async function handleAdd(){
  if (!linkInput) return notify("Link input missing", "err");
  const url = linkInput.value.trim();
  if(!/^https?:\/\//i.test(url)) return notify("Please paste a valid URL (https://...)", "err");
  const payload = { url };
  if (profileInput && profileInput.value) payload.telegram_id = profileInput.value.trim();
  const res = await api("/addLink", { method:"POST", headers:{"content-type":"application/json"}, body: JSON.stringify(payload) }, 12000);
  if (!res) return notify("No response from server", "err");
  if (!res.ok) return notify(res.error || "Server error. Try again later.", "err");
  if (res.added) {
    notify("✅ Link added — points awarded.");
    linkInput.value = "";
    await loadRecentLinks();
    // refresh leaderboard/profile as needed (fire and forget)
    loadLeaderboard().catch(()=>{});
    if (profileInput && profileInput.value) loadProfile(profileInput.value.trim()).catch(()=>{});
  } else {
    notify(res.message || "Link already exists.", "info");
  }
}

async function handleReport(){
  if (!linkInput) return notify("Link input missing", "err");
  const url = linkInput.value.trim();
  if(!/^https?:\/\//i.test(url)) return notify("Please paste a valid URL (https://...)", "err");
  const reason = window.prompt("Why are you reporting this link? (optional)");
  if (reason === null) return; // cancelled
  const payload = { url, reason };
  if (profileInput && profileInput.value) payload.telegram_id = profileInput.value.trim();
  const res = await api("/report", { method:"POST", headers:{"content-type":"application/json"}, body: JSON.stringify(payload) }, 10000);
  if (!res) return notify("No response from server", "err");
  if (!res.ok) return notify(res.error || "Server error. Try again later.", "err");
  notify("Report submitted. Thanks!");
  linkInput.value = "";
  await loadRecentLinks();
  loadLeaderboard().catch(()=>{});
}

// ---------- Recent Links ----------
async function loadRecentLinks(){
  if (!recentList) return;
  recentList.textContent = "Loading...";
  const res = await api("/recent", {}, 10000);
  if (!res || !res.ok) {
    recentList.textContent = "Failed to load recent links";
    return;
  }
  if (!Array.isArray(res.rows) || res.rows.length === 0) {
    recentList.textContent = "No recent links yet";
    return;
  }
  renderRecent(res.rows);
}

function renderRecent(rows){
  if (!recentList) return;
  if (!rows || rows.length === 0) {
    recentList.textContent = "No recent links yet";
    return;
  }
  const html = rows.map(l => {
    const d = l.created_at ? new Date(l.created_at).toLocaleString() : "?";
    return `<li><a href="${escapeHtml(l.url)}" target="_blank" rel="noreferrer">${escapeHtml(l.url)}</a> — ${escapeHtml(l.status || "pending")} • ${escapeHtml(d)}</li>`;
  }).join("");
  recentList.innerHTML = `<ul>${html}</ul>`;
}

// ---------- Leaderboard ----------
let leaderboardLock = false;
const debouncedLoadLeaderboard = debounce(loadLeaderboard, 400);

async function loadLeaderboard(){
  if (!leaderboardList) return;
  if (leaderboardLock) return; // prevent overlapping requests
  leaderboardLock = true;
  try {
    leaderboardList.textContent = "Loading...";
    const res = await api("/leaderboard", {}, 10000);
    if (!res || !res.ok) {
      leaderboardList.textContent = "Failed to load";
      return;
    }
    if (!res.rows || res.rows.length === 0) {
      leaderboardList.textContent = "No contributors yet";
      return;
    }
    leaderboardList.innerHTML = `<ol>${res.rows.map(r => `<li>${escapeHtml(r.username || r.telegram_id)} — ${r.points} pts</li>`).join("")}</ol>`;
  } finally {
    leaderboardLock = false;
  }
}

// ---------- Profile ----------
async function loadProfile(id){
  if (!profileData) return;
  if (!id) return notify("Enter Telegram ID", "err");
  profileData.classList.add("hidden");
  const res = await api(`/profile/${encodeURIComponent(id)}`, {}, 10000);
  if (!res) return notify("No response from server", "err");
  if (!res.ok) return notify(res.error || "Profile not found or server error", "err");
  const user = res.user;
  profileData.classList.remove("hidden");
  profileData.innerHTML = `
    <div><strong>${escapeHtml(user.username || user.telegram_id)}</strong></div>
    <div>Points: ${user.points}</div>
    <div style="margin-top:8px"><strong>Recent links</strong></div>
    <ul>${(res.links || []).map(l => `<li>${escapeHtml(l.url)} — ${escapeHtml(l.status)} • ${l.created_at ? escapeHtml(new Date(l.created_at).toLocaleString()) : "?"}</li>`).join("")}</ul>
  `;
  if (pointsVal) pointsVal.textContent = user.points || 0;
  if (linksCount) linksCount.textContent = (res.links || []).length;
  updateTasksForUser(user);
}

// ---------- Earn tasks (client-side) ----------
const TASKS = [
  { id: "t_add_1", title: "Add 1 new link", points: 5, hint: "Add a link from Home" },
  { id: "t_report_1", title: "Report 1 suspicious link", points: 5, hint: "Use Report from Home" },
  { id: "t_invite_1", title: "Invite 1 friend", points: 10, hint: "Share referral link" }
];

function renderTasks(){
  if (!taskList) return;
  taskList.innerHTML = "";
  const saved = JSON.parse(localStorage.getItem("lt_tasks") || "{}");
  TASKS.forEach(t => {
    const done = !!saved[t.id];
    const li = document.createElement("li");
    li.className = "task-item";
    li.innerHTML = `
      <div>
        <div class="task-title">${escapeHtml(t.title)}</div>
        <div class="task-meta">${escapeHtml(t.hint)} — ${t.points} pts</div>
      </div>
      <div>
        <button class="btn ${done ? "neutral" : "primary"}" data-task="${escapeHtml(t.id)}">${done ? "Claimed" : "Claim"}</button>
      </div>
    `;
    taskList.appendChild(li);
  });
  // attach handlers
  taskList.querySelectorAll("button[data-task]").forEach(b => {
    b.addEventListener("click", () => {
      const id = b.dataset.task;
      const saved = JSON.parse(localStorage.getItem("lt_tasks") || "{}");
      if (saved[id]) { notify("Already claimed", "info"); return; }
      saved[id] = { claimed_at: Date.now() };
      localStorage.setItem("lt_tasks", JSON.stringify(saved));
      b.textContent = "Claimed";
      b.classList.remove("primary");
      b.classList.add("neutral");
      notify("Task claimed locally. Server sync optional.", "info");
      // update visible points (client-side)
      if (pointsVal) pointsVal.textContent = (parseInt(pointsVal.textContent || "0", 10) + (TASKS.find(x=>x.id===id).points || 0));
    });
  });
}

function updateTasksForUser(user){
  // We currently render tasks locally. You can implement server verification later.
  renderTasks();
}

// ---------- Telegram WebApp init ----------
function initTelegram(){
  try {
    if (window.Telegram && window.Telegram.WebApp && window.Telegram.WebApp.initDataUnsafe) {
      const init = window.Telegram.WebApp.initDataUnsafe || {};
      const user = init.user || null;
      if (user) {
        safeRun(()=> { if (userBadge) userBadge.textContent = user.username ? `@${user.username}` : user.id; });
        safeRun(()=> { if (profileInput) profileInput.value = user.id; });
        // register silently
        fetch(apiBase + "/register", {
          method: "POST",
          headers: {"content-type":"application/json"},
          body: JSON.stringify({ telegram_id: user.id, username: user.username })
        }).catch(()=>{});
      } else {
        safeRun(()=>{ if (userBadge) userBadge.textContent = "—"; });
      }
    } else {
      safeRun(()=>{ if (userBadge) userBadge.textContent = "—"; });
    }
  } catch(e){ console.warn("Telegram init error", e); }
}

// ---------- Wiring ----------
document.addEventListener("DOMContentLoaded", () => {
  // menu buttons
  menuButtons.forEach(btn => {
    btn.addEventListener("click", () => showPage(btn.dataset.target));
  });

  // action buttons (guard existence)
  if (checkBtn) checkBtn.addEventListener("click", handleCheck);
  if (addBtn) addBtn.addEventListener("click", handleAdd);
  if (reportBtn) reportBtn.addEventListener("click", handleReport);
  if (refreshLeaderboardBtn) refreshLeaderboardBtn.addEventListener("click", debouncedLoadLeaderboard);
  if (profileLoadBtn) profileLoadBtn.addEventListener("click", () => { if(profileInput) loadProfile(profileInput.value.trim()); });

  // show default
  showPage("home");

  // initial loads with safety
  // Show loader briefly if backend responds slowly — wrapper will hide it afterwards
  loadRecentLinks().catch(()=>{ if (recentList) recentList.textContent = "Failed to load"; });
  loadLeaderboard().catch(()=>{ if (leaderboardList) leaderboardList.textContent = "Failed to load"; });

  initTelegram();
  renderTasks();

  // periodic refresh (no overlapping)
  setInterval(()=>{ loadLeaderboard().catch(()=>{}); }, 45000);
});

// global safety: hide loader if JS throws
window.addEventListener("error", () => hideLoader());
window.addEventListener("unhandledrejection", () => hideLoader());
