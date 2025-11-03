// webapp/app.js (ES module)
const qs = (sel, root = document) => root.querySelector(sel);
const qsa = (sel, root = document) => Array.from(root.querySelectorAll(sel));
const apiBase = "/api"; // backend routes

// UI refs
const loader = qs("#loader");
const userBadge = qs("#userBadge");
const linkInput = qs("#linkInput");
const checkBtn = qs("#checkBtn");
const addBtn = qs("#addBtn");
const reportBtn = qs("#reportBtn");
const resultBox = qs("#result");
const earnStats = qs("#earnStats");
const leaderboardList = qs("#leaderboardList");
const refreshLeaderboardBtn = qs("#refreshLeaderboard");
const profileForm = qs("#profileForm");
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

// helper: show/hide loader
function showLoader(){ loader.classList.remove("hidden"); loader.setAttribute("aria-hidden","false"); }
function hideLoader(){ loader.classList.add("hidden"); loader.setAttribute("aria-hidden","true"); }

// helper: disable buttons during actions
function setButtonsDisabled(state){
  [checkBtn, addBtn, reportBtn, refreshLeaderboardBtn, profileLoadBtn, copyReferralBtn].forEach(b=>{
    if(b) b.disabled = !!state;
  });
}

// notify
function notify(msg, type="info"){
  resultBox.classList.remove("hidden");
  resultBox.textContent = msg;
  resultBox.style.borderLeft = (type==="err") ? "4px solid #ff6b6b" : "4px solid var(--accent)";
  // ensure loader hidden
  hideLoader();
  // auto hide after 6s
  clearTimeout(resultBox._hideT);
  resultBox._hideT = setTimeout(()=>{ resultBox.classList.add("hidden"); }, 6000);
}

// safe fetch wrapper
async function api(path, opts = {}){
  try{
    showLoader();
    setButtonsDisabled(true);
    const res = await fetch(apiBase + path, opts);
    const json = await res.json();
    hideLoader();
    setButtonsDisabled(false);
    return json;
  } catch (e){
    console.error("api error", e);
    hideLoader();
    setButtonsDisabled(false);
    return { ok:false, error:"Network error" };
  }
}

// UI navigation
function showPage(id){
  qsa(".page").forEach(p => {
    const el = p;
    if(el.id===id){
      el.classList.add("active");
      el.setAttribute("aria-hidden","false");
    } else {
      el.classList.remove("active");
      el.setAttribute("aria-hidden","true");
    }
  });
  qsa(".menu-item").forEach(btn => btn.classList.remove("active"));
  qs(`.menu-item[data-target="${id}"]`).classList.add("active");
}

// escape html
function escapeHtml(s){ return (s||"").replace(/[&<>"']/g, c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }

// debounce small util
function debounce(fn, wait=300){
  let t;
  return (...a)=>{ clearTimeout(t); t=setTimeout(()=>fn(...a), wait); };
}

// Tele init: try to register user if Telegram webapp provided
function tryInitTelegram(){
  try{
    if(window.Telegram && window.Telegram.WebApp && window.Telegram.WebApp.initDataUnsafe){
      const init = window.Telegram.WebApp.initDataUnsafe || {};
      const user = init.user || null;
      if(user){
        userBadge.textContent = user.username ? `@${user.username}` : user.id;
        profileInput.value = user.id;
        // register silently
        fetch(apiBase + "/register", {
          method:"POST", headers:{"content-type":"application/json"},
          body: JSON.stringify({ telegram_id: user.id, username: user.username })
        }).catch(()=>{});
        // create referral link
        if(init.start_param){
          // open with referral code automatically handled by backend if needed
        }
      }
    } else {
      // not in Telegram, show placeholder
      userBadge.textContent = "—";
    }
  } catch(e){
    console.warn("Telegram init error", e);
  }
}

// ------- Home actions -------
async function handleCheck(){
  const url = linkInput.value.trim();
  if(!/^https?:\/\//i.test(url)) return notify("Please paste a valid URL (https://...)","err");
  const res = await api("/checkLink", {
    method:"POST", headers:{"content-type":"application/json"}, body: JSON.stringify({ url })
  });
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
    await loadLeaderboard();
    if(profileInput.value) await loadProfile(profileInput.value.trim());
  } else {
    notify("Link already exists.", "info");
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
  await loadLeaderboard();
}

// ------- Leaderboard -------
async function loadLeaderboard(){
  leaderboardList.textContent = "Loading...";
  const res = await api("/leaderboard");
  if(!res.ok){ leaderboardList.textContent = "Failed to load"; return; }
  if(!res.rows || res.rows.length===0){ leaderboardList.textContent = "No contributors yet"; return; }
  leaderboardList.innerHTML = `<ol>${res.rows.map(r => `<li>${escapeHtml(r.username || r.telegram_id)} — ${r.points} pts</li>`).join("")}</ol>`;
}

// ------- Profile -------
async function loadProfile(id){
  if(!id) return notify("Enter Telegram ID", "err");
  const res = await api(`/profile/${encodeURIComponent(id)}`);
  if(!res.ok) return notify("Profile not found or server error", "err");
  const user = res.user;
  userBadge.textContent = user.username ? `@${user.username}` : user.telegram_id;
  profileData.classList.remove("hidden");
  profileData.innerHTML = `
    <div><strong>${escapeHtml(user.username || user.telegram_id)}</strong></div>
    <div>Points: ${user.points}</div>
    <div style="margin-top:8px"><strong>Recent links</strong></div>
    <ul>${res.links.map(l => `<li>${escapeHtml(l.url)} — ${escapeHtml(l.status)} • ${l.created_at ? new Date(l.created_at).toLocaleString() : "?"}</li>`).join("")}</ul>
  `;
  // update Earn panel with user info
  updateEarnPanel(user, res.links || []);
}

// small function to compute rank & progress (basic)
function updateEarnPanel(user, links){
  const points = user.points || 0;
  pointsVal.textContent = points;
  linksCount.textContent = (links || []).length;
  // rough rank calculation: get leaderboard previously loaded
  // For now show placeholder rank
  rankVal.textContent = "—";
  // progress: let's say next reward at next multiple of 50
  const next = Math.ceil((points+1)/50) * 50;
  const pct = Math.min(100, Math.round((points / next) * 100));
  progressFill.style.width = pct + "%";
  progressText.textContent = `${points}/${next} pts (${pct}%)`;
  // Quests
  const quests = [
    { id: "q1", label: "Add 1 new link", done: links.length >= 1 },
    { id: "q2", label: "Report suspicious link", done: false },
    { id: "q3", label: "Invite 1 friend", done: user.invited_count >= 1 },
  ];
  questList.innerHTML = quests.map(q => `<li>${q.done ? "✅" : "⬜"} ${escapeHtml(q.label)}</li>`).join("");
  // referral link
  const referral = `${location.origin}${location.pathname}?ref=${user.telegram_id}`;
  referralBox.textContent = referral;
  copyReferralBtn.onclick = async () => {
    try {
      await navigator.clipboard.writeText(referral);
      notify("Referral link copied!");
    } catch(e){
      notify("Could not copy (clipboard blocked)", "err");
    }
  };
}

// ------- Wiring & event listeners -------
document.addEventListener("DOMContentLoaded", () => {
  qsa(".menu-item").forEach(btn => {
    btn.addEventListener("click", () => showPage(btn.dataset.target));
  });

  // attach actions
  checkBtn.addEventListener("click", handleCheck);
  addBtn.addEventListener("click", handleAdd);
  reportBtn.addEventListener("click", handleReport);
  refreshLeaderboardBtn.addEventListener("click", loadLeaderboard);
  profileLoadBtn.addEventListener("click", () => loadProfile(profileInput.value.trim()));

  // Fast open home
  showPage("home");

  // initial loads
  loadLeaderboard();
  tryInitTelegram();

  // auto-refresh leaderboard every 45s
  setInterval(debounce(loadLeaderboard, 200), 45000);
});

// expose a basic method that Telegram WebApp could call if needed
window.linktory = {
  refresh: () => { loadLeaderboard(); if(profileInput.value) loadProfile(profileInput.value); }
};
