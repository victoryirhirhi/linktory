// webapp/app.js
document.addEventListener("DOMContentLoaded", () => {
  const tg = window.Telegram?.WebApp;
  if (tg) tg.expand();

  // DOM
  const linkInput = document.getElementById("linkInput");
  const checkBtn = document.getElementById("checkBtn");
  const addBtn = document.getElementById("addBtn");
  const reportBtn = document.getElementById("reportBtn");
  const checkResult = document.getElementById("checkResult");
  const recentList = document.getElementById("recentList");
  const leaderList = document.getElementById("leaderList");
  const profUsername = document.getElementById("profUsername");
  const profId = document.getElementById("profId");
  const profPoints = document.getElementById("profPoints");
  const profTrust = document.getElementById("profTrust");

  // Telegram user (if available)
  const tgInit = tg?.initDataUnsafe || {};
  const tgUser = tgInit.user || null;
  const currentUserId = tgUser?.id || null;

  // util
  const api = path => `/api${path}`;
  const escape = s => String(s || "").replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[c]);

  // INITIAL LOAD
  loadAll();

  // events
  checkBtn.addEventListener("click", () => handleCheck(linkInput.value.trim()));
  addBtn.addEventListener("click", () => handleAdd(linkInput.value.trim()));
  reportBtn.addEventListener("click", () => handleReport(linkInput.value.trim()));

  // register user
  async function registerIfNeeded() {
    if (!currentUserId) return;
    try {
      await fetch(api("/register"), {
        method: "POST",
        headers: {"Content-Type":"application/json"},
        body: JSON.stringify({ telegram_id: currentUserId, username: tgUser.username || null })
      });
    } catch (e) { console.warn("register failed", e); }
  }

  async function loadAll() {
    await registerIfNeeded();
    await Promise.all([loadProfile(), loadRecent(), loadLeaderboard()]);
  }

  async function handleCheck(url) {
    if (!url) return showTemp("Paste a link first.");
    checkResult.classList.add("hidden");
    showTemp("Checking...");
    try {
      const res = await fetch(api("/checkLink"), {
        method: "POST",
        headers: {"Content-Type":"application/json"},
        body: JSON.stringify({ url })
      });
      const j = await res.json();
      if (!j.ok) return showTemp("Server error");
      if (!j.exists) {
        checkResult.innerHTML = `<div><b>${escape(url)}</b></div>
          <div class="smallMuted">This link is not in Linktory yet.</div>
          <div style="margin-top:8px"><button id="uiAdd" class="primary">Add (+5 pts)</button> <button id="uiReport">Report</button></div>`;
        checkResult.classList.remove("hidden");
        document.getElementById("uiAdd").addEventListener("click", () => handleAdd(url));
        document.getElementById("uiReport").addEventListener("click", () => handleReport(url));
      } else {
        const link = j.link;
        const reports = j.reports || [];
        const conf = j.confirmations || [];
        let html = `<div><b>${escape(link.url)}</b></div>`;
        html += `<div style="margin-top:6px">Status: <span class="status ${link.status || 'pending'}">${(link.status||'pending').toUpperCase()}</span></div>`;
        if (reports.length) {
          html += `<div class="smallMuted" style="margin-top:8px"><b>Reports:</b> ${escape(reports[0].reason || "No reason")}</div>`;
        }
        if (conf.length) {
          html += `<div class="smallMuted" style="margin-top:8px"><b>Recent votes:</b> ${escape(conf[0].confirmation)}</div>`;
        }
        html += `<div style="margin-top:8px"><button id="uiReportNow">Report</button></div>`;
        checkResult.innerHTML = html;
        checkResult.classList.remove("hidden");
        document.getElementById("uiReportNow").addEventListener("click", () => handleReport(url));
      }
    } catch (e) {
      console.error("check error", e);
      showTemp("Server error");
    }
  }

  async function handleAdd(url) {
    if (!url) return showTemp("Paste link first");
    if (!currentUserId) return showTemp("Telegram data missing");
    try {
      const res = await fetch(api("/addLink"), {
        method: "POST",
        headers: {"Content-Type":"application/json"},
        body: JSON.stringify({ url, telegram_id: currentUserId })
      });
      const j = await res.json();
      if (!j.ok) return showTemp("Add failed");
      if (j.added) {
        showTemp("✅ Link added! +5 pts");
        linkInput.value = "";
        await loadAll();
        checkResult.classList.add("hidden");
      } else {
        showTemp("Link already exists");
        // show existing
        if (j.link) handleCheck(j.link.url);
      }
    } catch (e) {
      console.error("add error", e);
      showTemp("Server error");
    }
  }

  async function handleReport(url) {
    if (!url) return showTemp("Paste link first");
    if (!currentUserId) return showTemp("Telegram data missing");
    const reason = prompt("Why are you reporting this link?");
    if (reason === null) return; // cancelled
    try {
      const res = await fetch(api("/report"), {
        method: "POST",
        headers: {"Content-Type":"application/json"},
        body: JSON.stringify({ url, reason, telegram_id: currentUserId })
      });
      const j = await res.json();
      if (j.ok) {
        showTemp("✅ Report submitted. +5 pts");
        await loadAll();
        checkResult.classList.add("hidden");
      } else {
        showTemp("Report failed");
      }
    } catch (e) {
      console.error("report error", e);
      showTemp("Server error");
    }
  }

  async function loadRecent() {
    recentList.innerHTML = "<li class='card'>Loading...</li>";
    if (!currentUserId) { recentList.innerHTML = "<li class='card'>Login via Telegram to see recent links.</li>"; return; }
    try {
      const res = await fetch(api(`/profile/${currentUserId}`));
      const j = await res.json();
      recentList.innerHTML = "";
      if (!j.ok) { recentList.innerHTML = "<li class='card'>No links yet</li>"; return; }
      const links = j.links || [];
      if (links.length === 0) recentList.innerHTML = "<li class='card'>No recent links</li>";
      links.forEach(l => {
        const li = document.createElement("li");
        li.innerHTML = `<div style="max-width:72%"><div style="font-size:14px;word-break:break-word">${escape(l.url)}</div><div class="smallMuted">${new Date(l.created_at).toLocaleString()}</div></div>
                        <div><span class="status ${l.status || 'pending'}">${(l.status||'pending').toUpperCase()}</span></div>`;
        recentList.appendChild(li);
      });
    } catch (e) {
      console.error("loadRecent err", e);
      recentList.innerHTML = "<li class='card'>Error loading</li>";
    }
  }

  async function loadLeaderboard() {
    leaderList.innerHTML = "<li class='card'>Loading...</li>";
    try {
      const res = await fetch(api("/leaderboard"));
      const j = await res.json();
      leaderList.innerHTML = "";
      (j.rows || []).forEach((u, i) => {
        const li = document.createElement("li");
        li.innerHTML = `<div style="text-align:left"><strong>${escape(u.username || "Anon")}</strong><br/><small>Trust: ${u.trust_score || 0}</small></div><div>${u.points || 0} pts</div>`;
        leaderList.appendChild(li);
      });
      if ((j.rows || []).length === 0) leaderList.innerHTML = "<li class='card'>No users yet</li>";
    } catch (e) {
      console.error("leader err", e);
      leaderList.innerHTML = "<li class='card'>Error loading</li>";
    }
  }

  async function loadProfile() {
    if (!currentUserId) { profUsername.textContent = "—"; profId.textContent = "—"; profPoints.textContent = "0"; profTrust.textContent = "0"; return; }
    try {
      const res = await fetch(api(`/profile/${currentUserId}`));
      const j = await res.json();
      if (!j.ok) return;
      const user = j.user;
      profUsername.textContent = user.username || tgUser.username || "User";
      profId.textContent = user.telegram_id;
      profPoints.textContent = user.points || 0;
      profTrust.textContent = user.trust_score || 0;
    } catch (e) {
      console.error("profile err", e);
    }
  }

  // tiny toast
  function showTemp(msg, t = 1800) {
    const prev = document.getElementById("tempToast");
    if (prev) prev.remove();
    const d = document.createElement("div");
    d.id = "tempToast";
    d.className = "card";
    d.style.position = "fixed";
    d.style.left = "50%";
    d.style.transform = "translateX(-50%)";
    d.style.bottom = "20px";
    d.style.zIndex = 9999;
    d.textContent = msg;
    document.body.appendChild(d);
    setTimeout(() => d.remove(), t);
  }
});
