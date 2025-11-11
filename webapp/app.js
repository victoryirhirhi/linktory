// /webapp/app.js

console.log("🔹 Telegram WebApp:", window.Telegram?.WebApp);

const apiBase = window.location.origin;
let telegram_id = null;
let username = null;

const qs = (sel) => document.querySelector(sel);

function showGuest(message = "Open the app from Telegram to continue.") {
  qs("#userBadge").textContent = "👤 Guest";
  qs("#status").textContent = message;
  console.warn("⚠️ Guest mode active:", message);
}

async function initTelegram() {
  try {
    const tg = window.Telegram?.WebApp;

    if (!tg) {
      console.warn("❌ Not inside Telegram environment.");
      return showGuest("Please open this app directly from Telegram.");
    }

    tg.expand();
    tg.ready();

    const initData = tg.initDataUnsafe;
    console.log("📦 initDataUnsafe:", initData);

    const user = initData?.user;

    if (user && user.id) {
      telegram_id = user.id;
      username = user.username || `u${telegram_id}`;
      qs("#userBadge").textContent = "@" + username;
      qs("#status").textContent = "✅ Logged in via Telegram";

      console.log("✅ Telegram user detected:", telegram_id, username);

      // Send Telegram user to backend (auto-register)
      try {
        await fetch(`${apiBase}/register`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ telegram_id, username }),
        });
      } catch (e) {
        console.warn("Register API call failed:", e);
      }

      return;
    }

    console.warn("⚠️ No Telegram user found in initDataUnsafe:", initData);
    showGuest("Telegram user not detected. Try reopening via the bot button.");

  } catch (e) {
    console.error("❌ initTelegram error:", e);
    showGuest("Error loading Telegram user info.");
  }
}

// Optional button example
qs("#refreshBtn")?.addEventListener("click", initTelegram);

// Run immediately
initTelegram();
