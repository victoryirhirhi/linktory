export default (bot, pool) => {
    bot.command("check", async (ctx) => {
      const parts = ctx.message.text.split(" ");
      const link = parts[1];
  
      if (!link) return ctx.reply("⚠️ Usage: /check <link>");
  
      const { rows } = await pool.query("SELECT * FROM links WHERE url=$1", [link]);
  
      if (rows.length === 0) return ctx.reply("❌ No record found. Add it with /add <link>");
  
      ctx.reply(`ℹ️ Link found:\nID: ${rows[0].id}\nStatus: ${rows[0].status}`);
    });
  };
  