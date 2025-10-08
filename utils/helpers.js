// utils/helpers.js
export async function replaceReply(ctx, text, extra = {}) {
    try {
      if (ctx.message) {
        await ctx.deleteMessage(ctx.message.message_id).catch(() => {});
      } else if (ctx.callbackQuery) {
        await ctx.deleteMessage(ctx.callbackQuery.message.message_id).catch(() => {});
      }
      return ctx.reply(text, extra);
    } catch (err) {
      console.error("replaceReply error:", err.message);
      return ctx.reply(text, extra);
    }
  }
  