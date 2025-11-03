// webapp/app.js (ES module)
const qs = (sel, root = document) => root.querySelector(sel);
const qsa = (sel, root = document) => Array.from(root.querySelectorAll(sel));
const apiBase = "/api"; // backend root (keep relative)

// UI refs
const loader = qs("#loader");
const userBadge = qs("#userBadge");
const linkInput = qs("#linkInput");
const checkBtn = qs("#checkBtn");
const addBtn = qs("#addBtn");
const reportBtn = qs("#reportBtn");
const resultBox = qs("#result");
const leaderboardList = qs("#leaderboardList");
const refreshLeaderboardBtn = qs("#refreshLeaderboard");
const profileInput = qs("#profileInput");
const profileData = qs("#profileData");
const profileLoadBtn = qs("#profileLoad");
const pointsVal = qs("#pointsVal");
const rankVal = qs("#rankVal");
const linksCount = qs("#linksCount");
const progressFill = qs("#progressFill");
const progressText = qs("#progressText");
const questList = qs("#questList");
const referralBox = qs("#referralBox");
const copyReferralBtn = qs("#copyReferral");

// Helper UI functions
function showLoader(){ loader.classList.remove("hidden"); loader.setAttribute("aria-hidden","false"); }
function hideLoader(){ loader.classList.add("hidden"); loader.setAttribute("aria-hidden","true"); }
function setButtonsDisabled(state){
  [checkBtn, addBtn, reportBtn, refreshLeaderboardBtn, profileLoadBtn, copyReferralBtn].forEach(b=>{
    if(b) b.disabled = !!state;
  });
}
function notify(msg, type="info"){
  resultBox.classList.remove("hidden");
  resultBox.textContent = msg;
  resultBox.style.borderLeft = (type==="err") ? "4px solid #ff6b6b" : "4px solid var(--accent)";
  hideLoader();
  clearTimeout(resultBox._hideT);
  resultBox._hideT = setTimeout(()=>{ resultBox.classList.add("hidden"); }, 6000);
}
function escapeHtml(s){ return (s||"").replace(/[&<>"']/g, c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }

// Safe fetch wrapper (returns JSON or {ok:false})
async function api(path, opts = {}){
  try {
    showLoader();
    setButtonsDisabled(true);
    const r = await fetch(apiBase + path, opts);
    const json = await r.json();
    hideLoader();
    setButtonsDisabled(false);
    return json;
  } catch (e) {
    console.error("api error", e);
    hideLoader();
    setButtonsDisabled(false);
    return { ok:false, error:"Network error" };
  }
}

// Navigation
function showPage(id){
  qsa(".page").forEach(p => {
    const el = p;
    if(el.id===id){ el.classList.add("active"); el.setAttribute("aria-hidden","false"); }
    else { el.classList.remove("active"); el.setAttribute("aria-hidden","true"); }
  });
  qsa(".menu-item").forEach(btn => btn.classList.remove("active"));
  const b = qs(`.menu-item[data-target="${id}"]`);
  if(b) b.classList.add("active");
}

// Tele init (register user if present in Telegram WebApp)
function tryInitTelegram(){
  try {
    if(window.Telegram && window.Telegram.WebApp && window.Telegram.WebApp.initDataUnsafe){
      const init = window.Telegram.WebApp.initDataUnsafe || {};
      const user = init.user || null;
      if(user){
        userBadge.textContent = user.username ? `@${user.username}` : user.id;
        if(profileInput) profileInput.value = user.id;
        // register user silently
        fetch(apiBase + "/register", {
          method:"POST", headers:{"content-type":"application/json"},
          body: JSON.stringify({ telegram_id: user.id, username: user.username })
        }).catch(()=>{});
        // if start param present, backend will track referral
      } else {
        userBadge.textContent = "—";
      }
    } else {
      userBadge.textContent = "—";
    }
  } catch(e){
    console.warn("Telegram init error", e);
    userBadge.textContent = "—";
  }
}

// Home handlers
async function handleCheck(){
  const url = (linkInput.value || "").trim();
  if(!/^https?:\/\//i.test(url)) return notify("Please paste a valid URL (https://...)","err");
  const res = await api("/checkLink", { method:"POST", headers:{"content-type":"application/json"}, body: JSON.stringify({ url }) });
  if(!res.ok) return notify("Server error. Try later.","err");
  if(!res.exists){
    notify("No record found. You can add it.", "info");
    showPage("home");
    return;
  }
  const { link, reports = [], confirmations = [] } = res;
  const status = link.status || "pending";
  resultBox.classList.remove("hidden");
  resultBox.innerHTML = `
    <strong>Status:</strong> ${escapeHtml(status.toUpperCase())}<br/>
    <strong>Added:</strong> ${link.created_at ? new Date(link.created_at).toLocaleString() : "unknown"}<br/>
    <strong>Reports:</strong> ${reports.length} • <strong>Confirmations:</strong> ${confirmations.length}
  `;
}

async function handleAdd(){
  const url = (linkInput.value || "").trim();
  if(!/^https?:\/\//i.test(url)) return notify("Please paste a valid URL (https://...)","err");
  const payload = { url };
  if(profileInput && profileInput.value) payload.telegram_id = profileInput.value.trim();
  const res = await api("/addLink", { method:"POST", headers:{"content-type":"application/json"}, body: JSON.stringify(payload) });
  if(!res.ok) return notify("Server error. Try later.","err");
  if(res.added){
    notify("✅ Link added — you earned points.");
    linkInput.value = "";
    await loadLeaderboard();
    if(profileInput && profileInput.value) await loadProfile(profileInput.value.trim());
  } else {
    notify(res.message || "Link already exists.", "info");
  }
}

async function handleReport(){
  const url = (linkInput.value || "").trim();
  if(!/^https?:\/\//i.test(url)) return notify("Please paste a valid URL (https://...)","err");
  const reason = window.prompt("Why are you reporting this link? (optional)");
  if(reason === null) return; // cancelled
  const payload = { url, reason };
  if(profileInput && profileInput.value) payload.telegram_id = profileInput.value.trim();
  const res = await api("/report", { method:"POST", headers:{"content-type":"application/json"}, body: JSON.stringify(payload) });
  if(!res.ok) return notify("Server error. Try later.","err");
  notify("Report submitted. Thanks!");
  linkInput.value = "";
  await loadLeaderboard();
}

// Leaderboard (L1 format)
async function loadLeaderboard(){
  leaderboardList.textContent = "Loading...";
  const res = await api("/leaderboard");
  if(!res.ok){ leaderboardList.textContent = "Failed to load"; return; }
  const rows = res.rows || res;
  if(!rows || rows.length === 0){ leaderboardList.textContent = "No contributors yet"; return; }
  leaderboardList.innerHTML = `<ol>${rows.map(r => `<li>${escapeHtml(r.username || r.telegram_id)} — ${r.points} pts</li>`).join("")}</ol>`;
}

// Profile (P2 format): expects { ok:true, user, links }
async function loadProfile(id){
  if(!id) return notify("Enter Telegram ID", "err");
  const res = await api(`/profile/${encodeURIComponent(id)}`);
  if(!res.ok) return notify("Profile not found or server error", "err");
  const user = res.user;
  const links = res.links || [];
  userBadge.textContent = user.username ? `@${user.username}` : user.telegram_id;
  profileData.classList.remove("hidden");
  profileData.innerHTML = `
    <div><strong>${escapeHtml(user.username || user.telegram_id)}</strong></div>
    <div>Points: ${user.points}</div>
    <div style="margin-top:8px"><strong>Recent links</strong></div>
    <ul>${links.map(l => `<li>${escapeHtml(l.url)} — ${escapeHtml(l.status)} • ${l.created_at ? new Date(l.created_at).toLocaleString() : "?"}</li>`).join("")}</ul>
  `;
  updateEarnPanel(user, links);
}

// Earn panel update
function updateEarnPanel(user, links){
  const points = user.points || 0;
  pointsVal.textContent = points;
  linksCount.textContent = (links || []).length;
  rankVal.textContent = user.rank || "—";
  const next = Math.max(50, Math.ceil((points+1)/50)*50);
  const pct = Math.min(100, Math.round((points / next) * 100));
  progressFill.style.width = pct + "%";
  progressText.textContent = `${points}/${next} pts (${pct}%)`;
  const quests = [
    { label: "Add 1 new link", done: (links || []).length >= 1 },
    { label: "Report suspicious link", done: !!user.reported_count && user.reported_count >= 1 },
    { label: "Invite 1 friend", done: !!user.invited_count && user.invited_count >= 1 },
  ];
  questList.innerHTML = quests.map(q => `<li>${q.done ? "✅" : "⬜"} ${escapeHtml(q.label)}</li>`).join("");
  const referral = `${location.origin}/?ref=${user.telegram_id}`;
  referralBox.textContent = referral;
  if(copyReferralBtn){
    copyReferralBtn.onclick = async () => {
      try { await navigator.clipboard.writeText(referral); notify("Referral link copied!"); }
      catch(e){ notify("Could not copy (blocked)", "err"); }
    };
  }
}

// Wiring & listeners
document.addEventListener("DOMContentLoaded", () => {
  qsa(".menu-item").forEach(btn => btn.addEventListener("click", () => showPage(btn.dataset.target)));

  if(checkBtn) checkBtn.addEventListener("click", handleCheck);
  if(addBtn) addBtn.addEventListener("click", handleAdd);
  if(reportBtn) reportBtn.addEventListener("click", handleReport);
  if(refreshLeaderboardBtn) refreshLeaderboardBtn.addEventListener("click", loadLeaderboard);
  if(profileLoadBtn) profileLoadBtn.addEventListener("click", () => loadProfile(profileInput.value.trim()));

  showPage("home");
  loadLeaderboard();
  tryInitTelegram();

  // auto-refresh leaderboard (every 45s)
  setInterval(loadLeaderboard, 45000);
});

// Expose a refresh method for Telegram WebApp if needed
window.linktory = {
  refresh: () => { loadLeaderboard(); if(profileInput && profileInput.value) loadProfile(profileInput.value); }
};
