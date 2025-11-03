// webapp/app.js (ES module)
const qs = (sel, root = document) => root.querySelector(sel);
const qsa = (sel, root = document) => Array.from(root.querySelectorAll(sel));
const apiBase = "/api";

// UI refs
const loader = qs("#loader");
const userBadge = qs("#userBadge");
const linkInput = qs("#linkInput");
const checkBtn = qs("#checkBtn");
const addBtn = qs("#addBtn");
const reportBtn = qs("#reportBtn");
const resultBox = qs("#result");
const recentList = qs("#recentList");
const leaderboardList = qs("#leaderboardList");
const refreshLeaderboardBtn = qs("#refreshLeaderboard");
const profileInput = qs("#profileInput");
const profileData = qs("#profileData");
const profileLoadBtn = qs("#profileLoad");
const pointsVal = qs("#pointsVal");
const linksCount = qs("#linksCount");

// loader helpers
function showLoader(){ loader.classList.remove("hidden"); loader.setAttribute("aria-hidden","false"); }
function hideLoader(){ loader.classList.add("hidden"); loader.setAttribute("aria-hidden","true"); }

// disable/enable
function setButtonsDisabled(state){
  [checkBtn, addBtn, reportBtn, refreshLeaderboardBtn, profileLoadBtn].forEach(b=>{
    if(b) b.disabled = !!state;
  });
}

// notify (auto hide)
function notify(msg, type="info"){
  resultBox.classList.remove("hidden");
  resultBox.textContent = msg;
  resultBox.style.borderLeft = (type==="err") ? "4px solid #ff6b6b" : "4px solid var(--accent)";
  clearTimeout(resultBox._hideT);
  resultBox._hideT = setTimeout(()=>{ resultBox.classList.add("hidden"); }, 6000);
}

// safe fetch wrapper timeout + finally hide loader
async function api(path, opts = {}, timeoutMs = 12000){
  showLoader();
  setButtonsDisabled(true);
  try {
    const controller = new AbortController();
    const timer = setTimeout(()=>controller.abort(), timeoutMs);
    const res = await fetch(apiBase + path, { signal: controller.signal, ...opts });
    clearTimeout(timer);
    const json = await res.json().catch(()=>({ ok:false, error:"Invalid JSON" }));
    return json;
  } catch (e) {
    if(e.name === "AbortError") return { ok:false, error:"Request timeout" };
    console.error("api error", e);
    return { ok:false, error: e.message || "Network error" };
  } finally {
    hideLoader();
    setButtonsDisabled(false);
  }
}

// navigation
function showPage(id){
  qsa(".page").forEach(p => {
    if(p.id===id){ p.classList.add("active"); p.setAttribute("aria-hidden","false"); }
    else { p.classList.remove("active"); p.setAttribute("aria-hidden","true"); }
  });
  qsa(".menu-item").forEach(btn => btn.classList.remove("active"));
  const targetBtn = qs(`.menu-item[data-target="${id}"]`);
  if(targetBtn) targetBtn.classList.add("active");
}

// escape helper
function escapeHtml(s){ return (s||"").replace(/[&<>"']/g, c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }

// ---------- Home actions ----------
async function handleCheck(){
  const url = linkInput.value.trim();
  if(!/^https?:\/\//i.test(url)) return notify("Please paste a valid URL (https://...)","err");
  const res = await api("/checkLink", { method:"POST", headers:{"content-type":"application/json"}, body: JSON.stringify({ url }) });
  if(!res.ok) return notify("Server error. Try again later.", "err");
  if(!res.exists){
    notify("No record found. You can add it.", "info");
    showPage("home");
    return;
  }
  const { link, reports, confirmations } = res;
  const status = link.status || "pending";
  resultBox.classList.remove("hidden");
  resultBox.innerHTML = `
    <strong>Status:</strong> ${escapeHtml(status.toUpperCase())}<br/>
    <strong>Added:</strong> ${link.created_at ? new Date(link.created_at).toLocaleString() : "unknown"}<br/>
    <strong>Reports:</strong> ${reports.length} • <strong>Confirmations:</strong> ${confirmations.length}
  `;
}

async function handleAdd(){
  const url = linkInput.value.trim();
  if(!/^https?:\/\//i.test(url)) return notify("Please paste a valid URL (https://...)","err");
  const payload = { url };
  if(profileInput.value) payload.telegram_id = profileInput.value.trim();
  const res = await api("/addLink", { method:"POST", headers:{"content-type":"application/json"}, body: JSON.stringify(payload) });
  if(!res.ok) return notify("Server error. Try again later.", "err");
  if(res.added){
    notify("✅ Link added — you earned points.");
    linkInput.value = "";
    await loadRecentLinks();
    await loadLeaderboard();
    if(profileInput.value) await loadProfile(profileInput.value.trim());
  } else {
    notify(res.message || "Link already exists.", "info");
  }
}

async function handleReport(){
  const url = linkInput.value.trim();
  if(!/^https?:\/\//i.test(url)) return notify("Please paste a valid URL (https://...)","err");
  const reason = window.prompt("Why are you reporting this link? (optional)");
  if(reason === null) return;
  const payload = { url, reason };
  if(profileInput.value) payload.telegram_id = profileInput.value.trim();
  const res = await api("/report", { method:"POST", headers:{"content-type":"application/json"}, body: JSON.stringify(payload) });
  if(!res.ok) return notify("Server error. Try again later.", "err");
  notify("Report submitted. Thanks!");
  linkInput.value = "";
  await loadRecentLinks();
  await loadLeaderboard();
}

// ---------- Recent Links (Home) ----------
async function loadRecentLinks(){
  recentList.textContent = "Loading...";
  // try /api/recent (preferred) then fallback to leaderboard-based guess
  const tryRecent = await api("/recent").catch(()=>({ok:false}));
  if(tryRecent && tryRecent.ok && Array.isArray(tryRecent.rows)){
    renderRecent(tryRecent.rows);
    return;
  }
  // fallback: fetch latest links via /leaderboard (not ideal but better than nothing)
  const board = await api("/leaderboard");
  if(!board.ok) {
    recentList.textContent = "Failed to load recent links";
    return;
  }
  // try to map leaderboard responders (fallback)
  recentList.innerHTML = `<div>Recent contributors (fallback):</div><ol>${board.rows.slice(0,10).map(r => `<li>${escapeHtml(r.username || r.telegram_id)} — ${r.points} pts</li>`).join("")}</ol>`;
}

function renderRecent(rows){
  if(!rows || rows.length===0){
    recentList.textContent = "No recent links yet";
    return;
  }
  recentList.innerHTML = `<ul>${rows.map(l => `<li><a href="${escapeHtml(l.url)}" target="_blank" rel="noreferrer">${escapeHtml(l.url)}</a> — ${escapeHtml(l.status || "pending")} • ${l.created_at ? new Date(l.created_at).toLocaleString() : "?"}</li>`).join("")}</ul>`;
}

// ---------- Leaderboard ----------
async function loadLeaderboard(){
  leaderboardList.textContent = "Loading...";
  const res = await api("/leaderboard");
  if(!res.ok){ leaderboardList.textContent = "Failed to load"; return; }
  if(!res.rows || res.rows.length===0){ leaderboardList.textContent = "No contributors yet"; return; }
  leaderboardList.innerHTML = `<ol>${res.rows.map(r => `<li>${escapeHtml(r.username || r.telegram_id)} — ${r.points} pts</li>`).join("")}</ol>`;
}

// ---------- Profile ----------
async function loadProfile(id){
  if(!id) return notify("Enter Telegram ID", "err");
  const res = await api(`/profile/${encodeURIComponent(id)}`);
  if(!res.ok) return notify("Profile not found or server error", "err");
  const user = res.user;
  profileData.classList.remove("hidden");
  profileData.innerHTML = `
    <div><strong>${escapeHtml(user.username || user.telegram_id)}</strong></div>
    <div>Points: ${user.points}</div>
    <div style="margin-top:8px"><strong>Recent links</strong></div>
    <ul>${res.links.map(l => `<li>${escapeHtml(l.url)} — ${escapeHtml(l.status)} • ${l.created_at ? new Date(l.created_at).toLocaleString() : "?"}</li>`).join("")}</ul>
  `;
  // update Earn panel
  pointsVal.textContent = user.points || 0;
  linksCount.textContent = (res.links || []).length;
}

// ---------- Telegram WebApp init ----------
function tryInitTelegram(){
  try {
    if(window.Telegram && window.Telegram.WebApp && window.Telegram.WebApp.initDataUnsafe){
      const init = window.Telegram.WebApp.initDataUnsafe || {};
      const user = init.user || null;
      if(user){
        userBadge.textContent = user.username ? `@${user.username}` : user.id;
        profileInput.value = user.id;
        // silently register
        fetch(apiBase + "/register", {
          method:"POST", headers:{"content-type":"application/json"},
          body: JSON.stringify({ telegram_id: user.id, username: user.username })
        }).catch(()=>{});
      }
    } else {
      userBadge.textContent = "—";
    }
  } catch(e){ console.warn("Telegram init error", e); }
}

// ---------- Wiring ----------
document.addEventListener("DOMContentLoaded", () => {
  qsa(".menu-item").forEach(btn => {
    btn.addEventListener("click", () => showPage(btn.dataset.target));
  });

  checkBtn.addEventListener("click", handleCheck);
  addBtn.addEventListener("click", handleAdd);
  reportBtn.addEventListener("click", handleReport);
  refreshLeaderboardBtn.addEventListener("click", loadLeaderboard);
  profileLoadBtn.addEventListener("click", () => loadProfile(profileInput.value.trim()));

  // fast open home
  showPage("home");

  // initial loads
  // ensure loader hides if backend is unreachable
  loadRecentLinks().catch(()=>{ recentList.textContent = "Failed to load"; });
  loadLeaderboard().catch(()=>{ leaderboardList.textContent = "Failed to load"; });
  tryInitTelegram();

  // refresh leaderboard every 45s but using setInterval (no debounce misuse)
  setInterval(() => { loadLeaderboard().catch(()=>{}); }, 45000);
});
