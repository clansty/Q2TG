import Instance from '../models/Instance';
import Telegram from '../client/Telegram';
import OicqClient from '../client/OicqClient';
import { Api } from 'telegram';

export default class AliveCheckController {
  constructor(private readonly instance: Instance,
              private readonly tgBot: Telegram,
              private readonly tgUser: Telegram,
              private readonly oicq: OicqClient) {
    tgBot.addNewMessageEventHandler(this.handleMessage);
  }

  private handleMessage = async (message: Api.Message) => {
    if (!message.sender.id.eq(this.instance.owner) || !message.isPrivate) {
      return false;
    }
    if (!['似了吗', '/alive'].includes(message.message)) {
      return false;
    }

    await message.reply({
      message: this.genMessage(this.instance.id === 0 ? Instance.instances : [this.instance]),
    });
  };

  private genMessage(instances: Instance[]): string {
    const boolToStr = (value: boolean) => {
      return value ? '好' : '坏';
    };
    const messageParts: string[] = [];

    for (const instance of instances) {
      const oicq = instance.oicq;
      const tgBot = instance.tgBot;
      const tgUser = instance.tgUser;

      const tgUserName = (tgUser.me.username || tgUser.me.usernames.length) ?
        '@' + (tgUser.me.username || tgUser.me.usernames[0].username) : tgUser.me.firstName;
      messageParts.push([
        `Instance #${instance.id}`,

        `QQ <code>${instance.qqUin}</code>\t` +
        `${boolToStr(oicq.isOnline())}\t${oicq.stat.msg_cnt_per_min} msg/min`,

        `TG @${tgBot.me.username}\t${boolToStr(tgBot.isOnline)}`,

        `TG User ${tgUserName}\t${boolToStr(tgBot.isOnline)}`,
      ].join('\n'));
    }

    return messageParts.join('\n\n');
  };
}
