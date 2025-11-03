// webapp/app.js (updated)
const qs = (sel, root = document) => root.querySelector(sel);
const qsa = (sel, root = document) => Array.from(root.querySelectorAll(sel));
const apiBase = "/api"; // backend routes prefix

// UI refs (defensive: find and fallback)
const loader = qs("#loader");
const userBadge = qs("#userBadge");
const linkInput = qs("#linkInput");
const checkBtn = qs("#checkBtn");
const addBtn = qs("#addBtn");
const reportBtn = qs("#reportBtn");
const resultBox = qs("#result");
const earnStats = qs("#earnStats");
const leaderboardList = qs("#leaderboardList");
const refreshLeaderboardBtn = qs("#refreshLeaderboard") || null;
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

// show/hide loader helpers
function showLoader(){
  if (loader) {
    loader.classList.remove("hidden");
    loader.setAttribute("aria-hidden","false");
  }
}
function hideLoader(){
  if (loader) {
    loader.classList.add("hidden");
    loader.setAttribute("aria-hidden","true");
  }
}

// disable buttons during API calls
function setButtonsDisabled(state){
  [checkBtn, addBtn, reportBtn, refreshLeaderboardBtn, profileLoadBtn, copyReferralBtn].forEach(b=>{
    if(b) b.disabled = !!state;
  });
}

// short notifications
function notify(msg, type="info"){
  if (!resultBox) return alert(msg);
  resultBox.classList.remove("hidden");
  resultBox.textContent = msg;
  resultBox.style.borderLeft = (type==="err") ? "4px solid #ff6b6b" : "4px solid var(--accent)";
  // ensure loader hidden
  hideLoader();
  // auto hide after 6s
  clearTimeout(resultBox._hideT);
  resultBox._hideT = setTimeout(()=>{ resultBox.classList.add("hidden"); }, 6000);
}

// safe fetch wrapper ensures loader always stops
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
  const btn = qs(`.menu-item[data-target="${id}"]`);
  if (btn) btn.classList.add("active");
}

// escape html for safety
function escapeHtml(s){ return (s||"").replace(/[&<>"']/g, c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }

// Debounce helper
function debounce(fn, wait=300){ let t; return (...a)=>{ clearTimeout(t); t=setTimeout(()=>fn(...a), wait); }; }

// Try to initialize from Telegram WebApp if present
function tryInitTelegram(){
  try{
    if(window.Telegram && window.Telegram.WebApp && window.Telegram.WebApp.initDataUnsafe){
      const init = window.Telegram.WebApp.initDataUnsafe || {};
      const user = init.user || null;
      if(user){
        if (userBadge) userBadge.textContent = user.username ? `@${user.username}` : user.id;
        if (profileInput) profileInput.value = user.id;
        // silent server-side register (non-blocking)
        fetch(apiBase + "/register", {
          method:"POST",
          headers:{"content-type":"application/json"},
          body: JSON.stringify({ telegram_id: user.id, username: user.username })
        }).catch(()=>{});
      }
    } else {
      if (userBadge) userBadge.textContent = "—";
    }
  }catch(e){ console.warn("Telegram init error", e); }
}

// -------- Home actions --------
async function handleCheck(){
  const url = (linkInput && linkInput.value || "").trim();
  if(!/^https?:\/\//i.test(url)) return notify("Please paste a valid URL (https://...)", "err");
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
  if (resultBox) {
    resultBox.classList.remove("hidden");
    resultBox.innerHTML = `
      <strong>Status:</strong> ${escapeHtml(status.toUpperCase())}<br/>
      <strong>Added:</strong> ${link.created_at ? new Date(link.created_at).toLocaleString() : "unknown"}<br/>
      <strong>Reports:</strong> ${reports.length} • <strong>Confirmations:</strong> ${confirmations.length}
    `;
  }
}

async function handleAdd(){
  const url = (linkInput && linkInput.value || "").trim();
  if(!/^https?:\/\//i.test(url)) return notify("Please paste a valid URL (https://...)", "err");
  const payload = { url };
  if(profileInput && profileInput.value) payload.telegram_id = profileInput.value.trim();
  const res = await api("/addLink", { method:"POST", headers:{"content-type":"application/json"}, body: JSON.stringify(payload) });
  if(!res.ok) return notify("Server error. Try again later.", "err");
  if(res.added){
    notify("✅ Link added — you earned points.");
    if (linkInput) linkInput.value = "";
    await loadRecentLinks();
    await loadLeaderboard();
    if(profileInput && profileInput.value) await loadProfile(profileInput.value.trim());
  } else {
    notify("Link already exists.", "info");
  }
}

async function handleReport(){
  const url = (linkInput && linkInput.value || "").trim();
  if(!/^https?:\/\//i.test(url)) return notify("Please paste a valid URL (https://...)", "err");
  const reason = window.prompt("Why are you reporting this link? (optional)");
  if(reason === null) return;
  const payload = { url, reason };
  if(profileInput && profileInput.value) payload.telegram_id = profileInput.value.trim();
  const res = await api("/report", { method:"POST", headers:{"content-type":"application/json"}, body: JSON.stringify(payload) });
  if(!res.ok) return notify("Server error. Try again later.", "err");
  notify("Report submitted. Thanks!");
  if (linkInput) linkInput.value = "";
  await loadLeaderboard();
}

// ------- Leaderboard -------
async function loadLeaderboard(){
  if (!leaderboardList) return;
  leaderboardList.textContent = "Loading...";
  const res = await api("/leaderboard");
  if(!res.ok){ leaderboardList.textContent = "Failed to load"; return; }
  if(!res.rows || res.rows.length===0){ leaderboardList.textContent = "No contributors yet"; return; }
  leaderboardList.innerHTML = `<ol>${res.rows.map(r => `<li>${escapeHtml(r.username || r.telegram_id)} — ${r.points} pts</li>`).join("")}</ol>`;
}

// ------- Recent links (for home) -------
async function loadRecentLinks(){
  // Try endpoint /api/recent-links if server implements it, otherwise fetch profile links for current user if available
  try{
    // prefer /recent-links
    const r = await fetch(apiBase + "/recent-links").then(s=>s.json()).catch(()=>null);
    if (r && r.ok && Array.isArray(r.rows)) {
      renderRecentLinks(r.rows);
      return;
    }
  }catch(e){}
  // fallback: if user has profile id, use /profile/:id to get links
  try{
    if(profileInput && profileInput.value){
      const id = encodeURIComponent(profileInput.value.trim());
      const res = await fetch(apiBase + "/profile/" + id).then(s=>s.json()).catch(()=>null);
      if (res && res.ok && Array.isArray(res.links)){
        renderRecentLinks(res.links);
        return;
      }
    }
  }catch(e){}
  // nothing
  renderRecentLinks([]);
}

function renderRecentLinks(rows){
  // create a small recent links area inside home card (append below if not exists)
  let container = qs("#recentLinks");
  if(!container){
    const homeCard = qs("#home .card");
    if(!homeCard) return;
    container = document.createElement("div");
    container.id = "recentLinks";
    container.className = "card small";
    homeCard.appendChild(container);
  }
  if(!rows || rows.length===0){
    container.innerHTML = "<strong>Recent links:</strong><div>No recent links yet.</div>";
    return;
  }
  container.innerHTML = `<strong>Recent links:</strong><ul>${rows.slice(0,10).map(l=>`<li>${escapeHtml(l.url)} — ${escapeHtml(l.status||"pending")} • ${l.created_at ? new Date(l.created_at).toLocaleString() : "?"}</li>`).join("")}</ul>`;
}

// ------- Profile -------
async function loadProfile(id){
  if(!id) return notify("Enter Telegram ID", "err");
  const res = await api(`/profile/${encodeURIComponent(id)}`);
  if(!res.ok) return notify("Profile not found or server error", "err");
  const user = res.user;
  if (userBadge) userBadge.textContent = user.username ? `@${user.username}` : user.telegram_id;
  if (profileData) {
    profileData.classList.remove("hidden");
    profileData.innerHTML = `
      <div><strong>${escapeHtml(user.username || user.telegram_id)}</strong></div>
      <div>Points: ${user.points}</div>
      <div style="margin-top:8px"><strong>Recent links</strong></div>
      <ul>${res.links.map(l => `<li>${escapeHtml(l.url)} — ${escapeHtml(l.status)} • ${l.created_at ? new Date(l.created_at).toLocaleString() : "?"}</li>`).join("")}</ul>
    `;
  }
  updateEarnPanel(user, res.links || []);
  await loadRecentLinks();
}

function updateEarnPanel(user, links){
  if(!user) return;
  if(pointsVal) pointsVal.textContent = user.points || 0;
  if(linksCount) linksCount.textContent = (links||[]).length;
  if(rankVal) rankVal.textContent = user.rank || "—";
  const points = user.points || 0;
  const next = Math.ceil((points+1)/50) * 50;
  const pct = Math.min(100, Math.round((points / next) * 100));
  if(progressFill) progressFill.style.width = pct + "%";
  if(progressText) progressText.textContent = `${points}/${next} pts (${pct}%)`;
  // referral
  const referral = `${location.origin}${location.pathname}?ref=${user.telegram_id}`;
  if(referralBox) referralBox.textContent = referral;
  if(copyReferralBtn){
    copyReferralBtn.onclick = async () => {
      try{
        await navigator.clipboard.writeText(referral);
        notify("Referral link copied!");
      }catch(e){
        notify("Could not copy (clipboard blocked)","err");
      }
    };
  }
}

// ----- wiring & events -----
document.addEventListener("DOMContentLoaded", () => {
  qsa(".menu-item").forEach(btn => {
    btn.addEventListener("click", () => showPage(btn.dataset.target));
  });

  if(checkBtn) checkBtn.addEventListener("click", handleCheck);
  if(addBtn) addBtn.addEventListener("click", handleAdd);
  if(reportBtn) reportBtn.addEventListener("click", handleReport);
  if(refreshLeaderboardBtn) refreshLeaderboardBtn.addEventListener("click", loadLeaderboard);
  if(profileLoadBtn) profileLoadBtn.addEventListener("click", () => loadProfile(profileInput.value.trim()));

  // open home by default
  showPage("home");

  // initial loads
  loadLeaderboard();
  tryInitTelegram();
  loadRecentLinks();

  // auto-refresh leaderboard every 45s (no debounce wrapper needed here)
  setInterval(loadLeaderboard, 45000);
});

// expose refresh method for Telegram
window.linktory = {
  refresh: () => { loadLeaderboard(); if(profileInput && profileInput.value) loadProfile(profileInput.value); }
};
