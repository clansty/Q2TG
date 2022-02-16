import { Telegram } from './client/Telegram';
import { CustomFile } from 'telegram/client/uploads';
import fs from 'fs';

(async () => {
  const bot = await Telegram.create({
    botAuthToken: process.env.TG_BOT_TOKEN,
  });
  const me = await bot.getChat('@Clansty');
  await me.sendSelfDestructingPhoto({},
    new CustomFile('test.jpg',
      fs.statSync('/Users/clansty/Pictures/stickers/0.png').size,
      '/Users/clansty/Pictures/stickers/0.png'), 10);
})();
