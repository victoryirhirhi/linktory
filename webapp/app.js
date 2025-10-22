// Telegram WebApp integration
const tg = window.Telegram.WebApp;
tg.expand(); // make full screen

document.querySelectorAll(".menu button").forEach((btn) => {
  btn.addEventListener("click", () => {
    document.getElementById("content").innerHTML = `<h2>${btn.innerText}</h2><p>Loading ${btn.id.replace("Btn", "").toLowerCase()}...</p>`;
  });
});

// Example interaction: send user data to backend
fetch("/api/user", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ id: tg.initDataUnsafe?.user?.id }),
});
