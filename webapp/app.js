// webapp/app.js
document.addEventListener("DOMContentLoaded", () => {
  const tg = window.Telegram?.WebApp;
  if (tg) tg.expand();

  // DOM
  const tabButtons = document.querySelectorAll("#tabs button");
  const sections = { home: document.getElementById("homeSection"), earn: document.getElementById("earnSection"), board: document.getElementById("boardSection"), profile: document.getElementById("profileSection") };
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

  let currentUserId = null;

  // Tab switching
  tabButtons.forEach(btn => {
    btn.addEventListener("click", () => {
      tabButtons.forEach(b => b.classList.remove("active"));
      btn.classList.add("active");
      const tab = btn.dataset.tab;
      Object.keys(sections).forEach(k => sections[k].classList.toggle("hidden", k !== tab));
      if (tab === "home") loadRecent();
      if (tab === "board") loadLeaderboard();
      if (tab === "profile") loadProfile();
      if (tab === "earn") loadTasks();
    });
  });

  // Get telegram user id
  const tgUser = tg?.initDataUnsafe?.user;
  if (tgUser) currentUserId = tgUser.id;
  else {
    // fallback: show instructions
    profUsername.textContent = "Telegram user unknown";
  }

  // Load user stats & recent links
  async function loadAll() {
    if (!currentUserId) return;
    await Promise.all([loadStats(), loadRecent()]);
  }

  async function loadStats() {
    try {
      const res = await fetch(`/api/user/${currentUserId}/stats`);
      if (!res.ok) return;
      const r = await res.json();
      statTotal.textContent = r.stats.total || 0;
      statLegit.textContent = r.stats.legit || 0;
      statScam.textContent = r.stats.scam || 0;
      profUsername.textContent = r.username || tgUser.username || "User";
      profId.textContent = currentUserId;
      profPoints.textContent = r.points || 0;
      profTrust.textContent = r.trust_score || 0;
    } catch (e) {
      console.error("loadStats error", e);
    }
  }

  async function loadRecent() {
    if (!currentUserId) return;
    recentList.innerHTML = "<li class='card'>Loading...</li>";
    try {
      const res = await fetch(`/api/user/${currentUserId}/links?limit=20`);
      const r = await res.json();
      recentList.innerHTML = "";
      (r.links || []).forEach(l => {
        const li = document.createElement("li");
        const left = document.createElement("div");
        left.innerHTML = `<div style="font-size:14px; word-break:break-word">${escapeHtml(l.url)}</div><small style="color:#666">${new Date(l.created_at).toLocaleString()}</small>`;
        const statusSpan = document.createElement("span");
        statusSpan.className = "status " + (l.status || "pending");
        statusSpan.textContent = (l.status || "pending").toUpperCase();
        li.appendChild(left);
        li.appendChild(statusSpan);
        recentList.appendChild(li);
      });
      if ((r.links || []).length === 0) recentList.innerHTML = "<li class='card'>No recent links</li>";
    } catch (e) {
      console.error("loadRecent error", e);
      recentList.innerHTML = "<li class='card'>Error loading</li>";
    }
  }

  // Check link handler
  checkBtn.addEventListener("click", async () => {
    const url = linkInput.value.trim();
    if (!url) return showTemp("Please paste a link.");
    checkResult.classList.add("hidden");
    try {
      const res = await fetch(`/api/link?url=${encodeURIComponent(url)}`);
      const r = await res.json();
      if (!r.ok && !r.status) {
        // older route returned ok:true + status:... or not_found
      }
      // handle cases
      if (r.status === "not_found") {
        checkResult.className = "card small";
        checkResult.innerHTML = `<div>🔎 Not found in Linktory</div><div style="margin-top:8px"><button id="confirmAdd" class="primary">Add this link</button></div>`;
        checkResult.classList.remove("hidden");
        document.getElementById("confirmAdd").addEventListener("click", () => handleAdd(url));
      } else {
        // show detailed card
        let html = `<div><strong>${escapeHtml(r.link.url)}</strong></div>`;
        html += `<div>Status: <span class="status ${r.status}">${r.status.toUpperCase()}</span></div>`;
        if (r.reports && r.reports.length) {
          html += `<div style="margin-top:8px"><b>Reports:</b><ul>`;
          r.reports.forEach(rep => html += `<li>${escapeHtml(rep.reason || "No reason")}</li>`);
          html += `</ul></div>`;
        }
        checkResult.className = "card small";
        checkResult.innerHTML = html;
        checkResult.classList.remove("hidden");
      }
    } catch (e) {
      console.error("check link error", e);
      showTemp("Server error. Try again.");
    }
  });

  // Add button (floating) opens add popup (uses same add handler)
  addBtn.addEventListener("click", () => {
    const url = linkInput.value.trim();
    if (!url) return showTemp("Paste a link in the input first.");
    handleAdd(url);
  });

  // Actual add flow
  async function handleAdd(url) {
    try {
      const res = await fetch(`/api/link/add`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url, telegram_id: currentUserId })
      });
      const r = await res.json();
      if (r.ok && r.added) {
        showTemp("✅ Link added! +10 points.");
        await loadAll();
      } else if (r.ok && !r.added) {
        showTemp("Link already exists.");
      } else {
        showTemp("Failed to add. Try again.");
      }
    } catch (e) {
      console.error("add link error", e);
      showTemp("Server error. Try again.");
    }
  }

  // Leaderboard
  async function loadLeaderboard() {
    leaderList.innerHTML = "<li class='card'>Loading...</li>";
    try {
      const res = await fetch("/api/leaderboard");
      const r = await res.json();
      leaderList.innerHTML = "";
      (r.rows || r).forEach((u, i) => {
        const li = document.createElement("li");
        li.innerHTML = `<div style="text-align:left"><strong>${escapeHtml(u.username || "Anonymous")}</strong><br/><small>Trust: ${u.trust_score || 0}</small></div><div>${u.points || 0} pts</div>`;
        leaderList.appendChild(li);
      });
      if ((r.rows || r).length === 0) leaderList.innerHTML = "<li class='card'>No users yet</li>";
    } catch (e) {
      console.error("leaderboard error", e);
      leaderList.innerHTML = "<li class='card'>Error loading</li>";
    }
  }

  // Profile
  async function loadProfile() {
    if (!currentUserId) return;
    try {
      const res = await fetch(`/api/user/${currentUserId}/stats`);
      const r = await res.json();
      profUsername.textContent = r.username || tg?.initDataUnsafe?.user?.username || "User";
      profId.textContent = currentUserId;
      profPoints.textContent = r.points || 0;
      profTrust.textContent = r.trust_score || 0;
    } catch (e) {
      console.error("profile error", e);
    }
  }

  // Earn (placeholder)
  function loadTasks() {
    const el = document.getElementById("tasksList");
    el.innerHTML = "<div class='card'>Complete tasks to earn points (Add link, report suspicious, refer friends)</div>";
  }

  // small helper for toasts
  function showTemp(msg, ms = 2000) {
    const prev = document.getElementById("tempToast");
    if (prev) prev.remove();
    const toast = document.createElement("div");
    toast.id = "tempToast";
    toast.className = "card";
    toast.style.position = "fixed";
    toast.style.left = "50%";
    toast.style.transform = "translateX(-50%)";
    toast.style.bottom = "70px";
    toast.style.zIndex = 9999;
    toast.innerText = msg;
    document.body.appendChild(toast);
    setTimeout(() => toast.remove(), ms);
  }

  // simple escape
  function escapeHtml(s) { return String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[c]); }

  // initial load
  loadAll();
  loadLeaderboard();
});
