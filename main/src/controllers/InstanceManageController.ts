import { getLogger } from 'log4js';
import Telegram from '../client/Telegram';
import { Api } from 'telegram';
import Instance from '../models/Instance';
import { Button } from 'telegram/tl/custom/button';

export default class InstanceManageController {
  private readonly log = getLogger('InstanceManageController');

  constructor(private readonly instance: Instance,
              private readonly tgBot: Telegram) {
    tgBot.addNewMessageEventHandler(this.onTelegramMessage);
  }

  private onTelegramMessage = async (message: Api.Message) => {
    if (!(message.chat.id.eq(this.instance.owner) && message.message)) return;
    const messageSplit = message.message.split(' ');
    if (messageSplit[0] !== '/newinstance') return;
    if (messageSplit.length === 1) {
      await message.reply({
        message: '通过 <code>/newinstance 新的 Bot API Token</code> 创建一个新的转发机器人实例',
      });
      return true;
    }
    else {
      await message.reply({
        message: `正在创建，请稍候`,
      });
      const newInstance = await Instance.createNew(messageSplit[1]);
      this.log.info(`已创建新的实例 实例 ID: ${newInstance.id} Bot Token: ${messageSplit[1]}`);
      await message.reply({
        message: `已创建新的实例\n实例 ID: ${newInstance.id}`,
        buttons: Button.url('去配置', `https://t.me/${newInstance.botMe.username}?start=setup`),
      });
      return true;
    }
  };
}
