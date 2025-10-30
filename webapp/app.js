// webapp/app.js
document.addEventListener("DOMContentLoaded", () => {
  const tg = window.Telegram?.WebApp;
  if (tg) tg.expand();

  const tabButtons = document.querySelectorAll("#tabs button");
  const sections = {
    home: document.getElementById("homeSection"),
    earn: document.getElementById("earnSection"),
    board: document.getElementById("boardSection"),
    profile: document.getElementById("profileSection")
  };

  const linkInput = document.getElementById("linkInput");
  const checkBtn = document.getElementById("checkBtn");
  const checkResult = document.getElementById("checkResult");
  const addBtn = document.getElementById("addBtn");
  const recentList = document.getElementById("recentList");
  const statTotal = document.getElementById("statTotal");
  const statLegit = document.getElementById("statLegit");
  const statScam = document.getElementById("statScam");
  const leaderList = document.getElementById("leaderList");
  const profUsername = document.getElementById("profUsername");
  const profId = document.getElementById("profId");
  const profPoints = document.getElementById("profPoints");
  const profTrust = document.getElementById("profTrust");
  const tasksList = document.getElementById("tasksList");

  let currentUserId = null;
  const tgUser = tg?.initDataUnsafe?.user;
  if (tgUser) currentUserId = tgUser.id;

  // Tabs
  tabButtons.forEach(btn => {
    btn.addEventListener("click", () => {
      tabButtons.forEach(b => b.classList.remove("active"));
      btn.classList.add("active");
      const tab = btn.dataset.tab;
      Object.keys(sections).forEach(k => sections[k].classList.toggle("hidden", k !== tab));
      if (tab === "home") loadAll();
      if (tab === "board") loadLeaderboard();
      if (tab === "profile") loadProfile();
      if (tab === "earn") loadTasks();
    });
  });

  // register user automatically on first open
  async function registerIfNeeded() {
    if (!currentUserId) return;
    try {
      await fetch("/api/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ telegram_id: currentUserId, username: tgUser.username || null })
      });
    } catch (e) {
      console.warn("registerIfNeeded failed", e);
    }
  }

  async function loadAll() {
    await registerIfNeeded();
    await Promise.all([loadStats(), loadRecent()]);
  }

  async function loadStats() {
    if (!currentUserId) return;
    try {
      const res = await fetch(`/api/profile/${currentUserId}`);
      const r = await res.json();
      if (!r.ok) return;
      const user = r.user;
      statTotal.textContent = (r.links || []).length || 0;
      statLegit.textContent = r.links ? r.links.filter(l => l.status === "legit").length : 0;
      statScam.textContent = r.links ? r.links.filter(l => l.status === "scam").length : 0;
      profUsername.textContent = user.username || tgUser.username || "User";
      profId.textContent = user.telegram_id;
      profPoints.textContent = user.points || 0;
      profTrust.textContent = user.trust_score || 0;
    } catch (e) {
      console.error("loadStats err", e);
    }
  }

  async function loadRecent() {
    if (!currentUserId) return;
    recentList.innerHTML = "<li class='card'>Loading...</li>";
    try {
      const res = await fetch(`/api/profile/${currentUserId}`);
      const r = await res.json();
      recentList.innerHTML = "";
      const links = r.links || [];
      if (links.length === 0) recentList.innerHTML = "<li class='card'>No recent links</li>";
      links.forEach(l => {
        const li = document.createElement("li");
        const left = document.createElement("div");
        left.style.maxWidth = "75%";
        left.innerHTML = `<div style="font-size:14px; word-break:break-word">${escapeHtml(l.url)}</div><small style="color:#666">${new Date(l.created_at).toLocaleString()}</small>`;
        const statusSpan = document.createElement("span");
        statusSpan.className = "status " + (l.status || "pending");
        statusSpan.textContent = (l.status || "pending").toUpperCase();
        li.appendChild(left);
        li.appendChild(statusSpan);
        recentList.appendChild(li);
      });
    } catch (e) {
      console.error("loadRecent err", e);
      recentList.innerHTML = "<li class='card'>Error loading</li>";
    }
  }

  checkBtn.addEventListener("click", async () => {
    const url = linkInput.value.trim();
    if (!url) return showTemp("Paste a link first.");
    checkResult.classList.add("hidden");
    try {
      const res = await fetch("/api/checkLink", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url })
      });
      const r = await res.json();
      if (!r.ok && r.exists === undefined) {
        // older failure
      }
      if (!r.exists) {
        checkResult.className = "card small";
        checkResult.innerHTML = `<div>🔎 Not found in Linktory</div><div style="margin-top:8px"><button id="confirmAdd" class="primary">Add this link (+5 pts)</button></div>`;
        checkResult.classList.remove("hidden");
        document.getElementById("confirmAdd").addEventListener("click", () => handleAdd(url));
      } else {
        const link = r.link;
        let html = `<div><strong>${escapeHtml(link.url)}</strong></div>`;
        html += `<div>Status: <span class="status ${link.status}">${link.status.toUpperCase()}</span></div>`;
        if (r.reports && r.reports.length) {
          html += `<div style="margin-top:8px"><b>Reports:</b><ul>${r.reports.map(rep => `<li>${escapeHtml(rep.reason || "No reason")}</li>`).join("")}</ul></div>`;
        }
        checkResult.className = "card small";
        checkResult.innerHTML = html;
        checkResult.classList.remove("hidden");
      }
    } catch (e) {
      console.error("check failed", e);
      showTemp("Server error");
    }
  });

  addBtn.addEventListener("click", () => {
    const url = linkInput.value.trim();
    if (!url) return showTemp("Paste a link first.");
    handleAdd(url);
  });

  async function handleAdd(url) {
    if (!currentUserId) return showTemp("Telegram data missing");
    try {
      const res = await fetch("/api/addLink", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url, telegram_id: currentUserId })
      });
      const r = await res.json();
      if (r.ok && r.added) {
        showTemp("✅ Link added! +5 points.");
        await loadAll();
      } else if (r.ok && !r.added) {
        showTemp("Link already exists.");
      } else {
        showTemp("Failed to add.");
      }
    } catch (e) {
      console.error("add error", e);
      showTemp("Server error");
    }
  }

  // report a link flow (UI simple prompt)
  async function handleReport(url) {
    if (!currentUserId) return showTemp("Telegram data missing");
    const reason = prompt("Tell us why you're reporting this link:");
    if (!reason) return;
    try {
      const res = await fetch("/api/report", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url, reason, telegram_id: currentUserId })
      });
      const r = await res.json();
      if (r.ok) {
        showTemp("✅ Report submitted. +5 points.");
        await loadAll();
      } else {
        showTemp("Failed to report.");
      }
    } catch (e) {
      console.error("report err", e);
      showTemp("Server error");
    }
  }

  async function loadLeaderboard() {
    leaderList.innerHTML = "<li class='card'>Loading...</li>";
    try {
      const res = await fetch("/api/leaderboard");
      const r = await res.json();
      leaderList.innerHTML = "";
      (r.rows || []).forEach((u, i) => {
        const li = document.createElement("li");
        li.innerHTML = `<div style="text-align:left"><strong>${escapeHtml(u.username || "Anon")}</strong><br/><small>Trust: ${u.trust_score || 0}</small></div><div>${u.points || 0} pts</div>`;
        leaderList.appendChild(li);
      });
      if ((r.rows || []).length === 0) leaderList.innerHTML = "<li class='card'>No users yet</li>";
    } catch (e) {
      console.error("leader err", e);
      leaderList.innerHTML = "<li class='card'>Error loading</li>";
    }
  }

  async function loadProfile() {
    if (!currentUserId) return;
    try {
      const res = await fetch(`/api/profile/${currentUserId}`);
      const r = await res.json();
      if (!r.ok) return;
      const user = r.user;
      profUsername.textContent = user.username || tgUser.username || "User";
      profId.textContent = user.telegram_id;
      profPoints.textContent = user.points || 0;
      profTrust.textContent = user.trust_score || 0;
    } catch (e) {
      console.error("profile err", e);
    }
  }

  function loadTasks() {
    tasksList.innerHTML = "";
    const div = document.createElement("div");
    div.className = "card";
    div.innerHTML = `<b>Tasks</b>
      <ul>
        <li>Add a link — +5 pts</li>
        <li>Report a scam — +5 pts</li>
        <li>Refer a friend — +10 pts (future)</li>
      </ul>`;
    tasksList.appendChild(div);
  }

  // small toast
  function showTemp(msg, ms = 2200) {
    const prev = document.getElementById("tempToast");
    if (prev) prev.remove();
    const toast = document.createElement("div");
    toast.id = "tempToast";
    toast.className = "card";
    toast.textContent = msg;
    document.body.appendChild(toast);
    setTimeout(() => toast.remove(), ms);
  }

  function escapeHtml(s) { return String(s || "").replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[c]); }

  // initial
  loadAll();
  loadLeaderboard();
});
