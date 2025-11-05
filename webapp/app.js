// webapp/app.js — CLEAN & FIXED

const qs = (sel, root = document) => root.querySelector(sel);
const qsa = (sel, root = document) => Array.from(root.querySelectorAll(sel));
const apiBase = "/api";

// DOM Elements
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
const taskList = qs("#taskList");
const menuButtons = qsa(".menu-item");

// Utility
const safe = fn => { try { fn(); } catch(e){ console.warn(e) } };
const escapeHtml = s => (s || "").replace(/[&<>"']/g, c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

// ✅ Loader Control
function showLoader(){ if(loader){ loader.classList.remove("hidden"); }}
function hideLoader(){ if(loader){ loader.classList.add("hidden"); }}

// ✅ Global API Wrapper (only one!)
async function api(path, opts = {}, timeoutMs = 10000){
  showLoader();
  setButtonsDisabled(true);

  try {
    const controller = new AbortController();
    const timer = setTimeout(()=>controller.abort(), timeoutMs);

    const res = await fetch(apiBase + path, { signal: controller.signal, ...opts });

    clearTimeout(timer);
    const text = await res.text();
    try { return JSON.parse(text); }
    catch { return { ok:false, error:"Invalid JSON from server" }; }

  } catch(e){
    return { ok:false, error:"Network or timeout error" };
  } finally {
    hideLoader();
    setButtonsDisabled(false);
  }
}

// Disable buttons during loading
function setButtonsDisabled(s){
  [checkBtn, addBtn, reportBtn, refreshLeaderboardBtn, profileLoadBtn]
  .forEach(b => b && (b.disabled = s));
}

// ✅ Notification
function notify(msg, type="info"){
  safe(()=>{
    if(!resultBox) return;
    resultBox.classList.remove("hidden");
    resultBox.textContent = msg;
    resultBox.style.borderLeft = type === "err"
      ? "4px solid #e33"
      : "4px solid var(--accent)";
    setTimeout(()=>resultBox.classList.add("hidden"), 5000);
  });
}

// ✅ Navigation
function showPage(id){
  qsa(".page").forEach(p=>{
    p.classList.toggle("active", p.id === id);
  });
  menuButtons.forEach(b=>{
    b.classList.toggle("active", b.dataset.target === id);
  });
}

// ✅ Home Actions (check, add, report)
async function handleCheck(){
  const url = linkInput?.value?.trim();
  if(!/^https?:\/\//i.test(url)) return notify("Enter valid link", "err");
  const res = await api("/checkLink",{method:"POST",headers:{ "content-type":"application/json"},body:JSON.stringify({url})});
  if(!res.ok) return notify(res.error,"err");
  notify(res.exists ? "Link found" : "Not found — add it!", "info");
}

async function handleAdd(){
  const url = linkInput?.value?.trim();
  if(!/^https?:\/\//i.test(url)) return notify("Enter valid link", "err");
  const payload = { url };
  const res = await api("/addLink",{method:"POST",headers:{ "content-type":"application/json"},body:JSON.stringify(payload)});
  notify(res.ok ? "✅ Link added!" : res.error, res.ok?"info":"err");
  linkInput.value = "";
  loadRecentLinks();
  loadLeaderboard();
}

async function handleReport(){
  const url = linkInput?.value?.trim();
  if(!/^https?:\/\//i.test(url)) return notify("Enter valid link", "err");
  const reason = prompt("Report reason:");
  if(reason === null) return;
  const res = await api("/report",{method:"POST",headers:{ "content-type":"application/json"},body:JSON.stringify({url,reason})});
  notify(res.ok ? "Reported!" : res.error, res.ok?"info":"err");
  loadLeaderboard();
}

// ✅ Recent Links
async function loadRecentLinks(){
  if(!recentList) return;
  recentList.textContent = "Loading...";
  const res = await api("/recent");
  if(!res.ok) return recentList.textContent = "Failed";
  if(!res.rows.length) return recentList.textContent = "No recent links";
  recentList.innerHTML = res.rows.map(r=>`
    <li><a href="${escapeHtml(r.url)}" target="_blank">${escapeHtml(r.url)}</a></li>
  `).join("");
}

// ✅ Leaderboard
async function loadLeaderboard(){
  if(!leaderboardList) return;
  leaderboardList.textContent = "Loading...";
  const res = await api("/leaderboard");
  if(!res.ok) return leaderboardList.textContent = "Failed";
  leaderboardList.innerHTML = res.rows.map(r=>
    `<li>${escapeHtml(r.username||"User")} - ${r.points} pts</li>`
  ).join("");
}

// ✅ Earn Tasks (local only for now)
const TASKS = [
  {id:"t1",title:"Add 1 link",points:5},
  {id:"t2",title:"Report 1 link",points:5},
  {id:"t3",title:"Invite friend",points:10},
];

function loadTasks(){
  if(!taskList) return;
  const saved = JSON.parse(localStorage.getItem("tasks")||"{}");
  taskList.innerHTML = TASKS.map(t=>`
    <li>
      ${escapeHtml(t.title)} — ${t.points} pts
      <button data-t="${t.id}">
        ${saved[t.id]?"✅ Done":"Claim"}
      </button>
    </li>
  `).join("");

  taskList.querySelectorAll("button").forEach(btn=>{
    btn.onclick = ()=>{
      const id = btn.dataset.t;
      saved[id] = true;
      localStorage.setItem("tasks",JSON.stringify(saved));
      notify("✅ Task Completed");
      loadTasks();
    };
  });
}

// ✅ Init
document.addEventListener("DOMContentLoaded", ()=>{
  menuButtons.forEach(btn=>{
    btn.onclick = ()=>showPage(btn.dataset.target);
  });

  checkBtn?.addEventListener("click",handleCheck);
  addBtn?.addEventListener("click",handleAdd);
  reportBtn?.addEventListener("click",handleReport);
  refreshLeaderboardBtn?.addEventListener("click",loadLeaderboard);
  profileLoadBtn?.addEventListener("click",()=>loadProfile(profileInput.value));

  showPage("home");
  loadRecentLinks();
  loadLeaderboard();
  loadTasks();
});

// ✅ Global fallback — always hide loader
window.addEventListener("error", hideLoader);
window.addEventListener("unhandledrejection", hideLoader);
