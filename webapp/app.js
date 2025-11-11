import { TonConnectSDK } from "https://unpkg.com/@tonconnect/sdk@latest/dist/tonconnect-sdk.min.js";

const qs = (s, r = document) => r.querySelector(s);
const qsa = (s, r = document) => [...r.querySelectorAll(s)];
const apiBase = "/api";
let telegram_id = null;
let username = null;

// ---------------------------
// TON Connect setup
// ---------------------------
const connector = new TonConnectSDK.TonConnect({
  manifestUrl: window.location.origin + '/tonconnect-manifest.json'
});
const UPGRADE_ADDRESS = "EQYOURTONADDRESSHERE"; // <-- your wallet

async function sendModeratorPayment() {
  if (!connector.connected) await connector.connect();
  const amount = '1000000000'; // 1 TON
  const transaction = { validUntil: Math.floor(Date.now() / 1000) + 300, messages:[{address:UPGRADE_ADDRESS, amount}]};
  try { await connector.sendTransaction(transaction); return true; } 
  catch (e) { console.error("TON payment error:", e); return false; }
}

// ---------------------------
// Telegram init
// ---------------------------
async function initTelegram() {
  try {
    const tg = window.Telegram?.WebApp;
    const urlParams = new URLSearchParams(window.location.search);
    const token = urlParams.get("token");
    if (token) {
      const res = await fetch("/api/sessionFromToken?token=" + token);
      const data = await res.json();
      if (data.ok) { telegram_id = data.telegram_id; username = data.username; qs("#userBadge").textContent = "@" + username; qs("#status").textContent = ""; return; }
    }
    if (!tg || !tg.initDataUnsafe?.user) { showGuest("Please open this app from Telegram."); return; }
    const user = tg.initDataUnsafe.user;
    telegram_id = user.id;
    username = user.username || `u${telegram_id}`;
    qs("#userBadge").textContent = "@" + username;
    qs("#status").textContent = "";
  } catch (e) { console.error("initTelegram error", e); showGuest("Please open this from Telegram."); }
}

function showGuest(msg="Guest mode: open in Telegram") { qs("#userBadge").textContent="Guest"; qs("#status").textContent=msg; notify(msg,true); }

// ---------------------------
// API util
// ---------------------------
async function api(path, opts={}) {
  try { const res=await fetch(apiBase+path,{headers:{"Content-Type":"application/json"},credentials:"include",...opts}); return await res.json().catch(()=>({})); } 
  catch(e){ return {ok:false,error:"Network error"}; }
}

function notify(msg, err=false) {
  const box=qs("#result"); if(!box)return;
  box.textContent=msg; box.classList.remove("hidden");
  box.style.borderLeft=err?"4px solid #e33":"4px solid var(--accent)";
  setTimeout(()=>box.classList.add("hidden"),4000);
}

function showPage(id) { qsa(".page").forEach(p=>p.classList.toggle("active",p.id===id)); qsa(".menu-item").forEach(b=>b.classList.toggle("active",b.dataset.target===id)); }

// ---------------------------
// Link actions
// ---------------------------
async function handleCheck() {
  const url=qs("#linkInput").value.trim(); if(!url.startsWith("http")) return notify("Enter valid URL",true);
  const res=await api("/checkLink",{method:"POST",body:JSON.stringify({url})});
  if(!res.ok)return notify(res.message||res.error||"Failed",true);
  notify(res.exists?"✅ Link found":"❌ No record, add it");
}

async function handleAdd() {
  const url=qs("#linkInput").value.trim(); if(!url.startsWith("http")) return notify("Enter valid URL",true);
  if(!telegram_id) return notify("Open the app from Telegram to add links",true);
  const res=await api("/addLink",{method:"POST",body:JSON.stringify({url,telegram_id})});
  if(!res.ok)return notify(res.message||res.error||"Failed",true);
  notify(res.added?"✅ Added":res.message||"Already exists"); await loadRecentLinks(); await loadLeaderboard(); qs("#linkInput").value="";
}

async function handleReport() {
  const url=qs("#linkInput").value.trim(); if(!url.startsWith("http")) return notify("Enter valid URL",true);
  if(!telegram_id) return notify("Open the app from Telegram to report",true);
  const reason=window.prompt("Why are you reporting?"); if(!reason) return;
  const res=await api("/report",{method:"POST",body:JSON.stringify({url,reason,telegram_id})});
  if(!res.ok) return notify(res.message||res.error||"Failed",true);
  notify("✅ Report submitted"); await loadLeaderboard();
}

// ---------------------------
// Loaders
// ---------------------------
async function loadRecentLinks() {
  const box=qs("#recentList"); box.textContent="Loading..."; const res=await api("/recent");
  if(!res.ok) return box.textContent="Failed to load";
  if(!Array.isArray(res.rows)||res.rows.length===0) return box.textContent="No links yet";
  box.innerHTML=res.rows.map(r=>`<li>${r.status==="verified"?"✅":"❌"} <a href="${r.url}" target="_blank" rel="noreferrer">${r.url}</a></li>`).join("");
}

async function loadLeaderboard() {
  const box=qs("#leaderboardList"); box.textContent="Loading..."; const res=await api("/leaderboard");
  if(!res.ok) return box.textContent="Failed";
  if(!Array.isArray(res.rows)||res.rows.length===0) return box.textContent="No contributors yet";
  box.innerHTML=res.rows.map(r=>`<li>${r.username||r.telegram_id} — ${r.points} pts</li>`).join("");
}

function loadTasks() {
  const list=qs("#taskList"); if(!list)return;
  const saved=JSON.parse(localStorage.getItem("tasks")||"{}");
  const tasks=[{id:"t_add_1",title:"Add 1 link",points:5},{id:"t_report_1",title:"Report 1 link",points:5},{id:"t_invite_1",title:"Invite 1 friend",points:10}];
  list.innerHTML=tasks.map(t=>`<li><div><div class="task-title">${t.title}</div><div class="task-meta">${t.points} pts</div></div><div><button data-task="${t.id}" class="btn ${saved[t.id]?"neutral":"primary"}">${saved[t.id]?"Claimed":"Claim"}</button></div></li>`).join("");
  list.querySelectorAll("button[data-task]").forEach(b=>b.addEventListener("click",()=>{
    const id=b.dataset.task; const s=JSON.parse(localStorage.getItem("tasks")||"{}"); if(s[id]) return notify("Already claimed"); s[id]={claimed_at:Date.now()}; localStorage.setItem("tasks",JSON.stringify(s)); notify("Task claimed locally"); loadTasks();
  }));
}

// ---------------------------
// Profile Loader
// ---------------------------
async function loadProfile(id=telegram_id) {
  if(!id) return notify("Cannot load profile, missing Telegram ID",true);
  const res=await api(`/profile/${id}`);
  if(!res.ok) return notify(res.message||"Failed to load profile",true);
  const data=res.user; const box=qs("#profileData"); box.classList.remove("hidden");
  box.innerHTML=`<p><strong>Username:</strong> @${data.username||"—"}</p><p><strong>Points:</strong> ${data.points}</p><p><strong>Total Links Added:</strong> ${data.total_links}</p><p><strong>Verified Links:</strong> ${data.verified_links}</p><h4>Recent Links:</h4><ul>${data.recent_links.map(l=>`<li>${l.status==="verified"?"✅":"❌"} <a href="${l.url}" target="_blank" rel="noreferrer">${l.url}</a></li>`).join("")}</ul>${data.is_moderator?`<p>✅ You are a moderator</p>`:data.moderator_request?`<p>⏳ Moderator request pending</p>`:`<button id="requestModerator" class="btn primary">Upgrade to Moderator (1 TON)</button>`}`;
  const btn=qs("#requestModerator"); if(btn) btn.addEventListener("click",async()=>{
    if(!window.confirm("Pay 1 TON to upgrade to Moderator?")) return;
    const paid=await sendModeratorPayment(); if(!paid) return notify("Payment failed or canceled",true);
    const r=await api("/upgradeModerator",{method:"POST",body:JSON.stringify({telegram_id})});
    if(r.ok) { notify("✅ You are now a moderator!"); loadProfile(); } else notify(r.message||"Upgrade failed",true);
  });
}

// ---------------------------
// Init
// ---------------------------
document.addEventListener("DOMContentLoaded",()=>{
  initTelegram();
  qsa(".menu-item").forEach(btn=>btn.addEventListener("click",()=>{showPage(btn.dataset.target); if(btn.dataset.target==="profile") loadProfile();}));
  qs("#checkBtn").addEventListener("click",handleCheck);
  qs("#addBtn").addEventListener("click",handleAdd);
  qs("#reportBtn").addEventListener("click",handleReport);
  qs("#refreshLeaderboard").addEventListener("click",loadLeaderboard);
  qs("#profileLoad").addEventListener("click",()=>{const id=qs("#profileInput").value.trim(); loadProfile(id);});
  showPage("home"); loadRecentLinks(); loadLeaderboard(); loadTasks(); if(telegram_id) loadProfile();
});
