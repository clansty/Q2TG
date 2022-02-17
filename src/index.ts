import { Telegram } from './client/Telegram';

(async () => {
  const bot = await Telegram.create({
    botAuthToken: process.env.TG_BOT_TOKEN,
  });
  const me = await bot.getChat('@Clansty');
  const a = await me.waitForInput();
  console.log(a);
  const b = await me.waitForInput();
  console.log(b);
  await me.sendMessage({
    message: a.message + b.message,
  });
})();
