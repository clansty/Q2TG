import InChatCommandsService from '../services/InChatCommandsService';
import { getLogger, Logger } from 'log4js';
import Instance from '../models/Instance';
import Telegram from '../client/Telegram';
import OicqClient from '../client/OicqClient';
import { Api } from 'telegram';
import { Group } from 'icqq';
import RecoverMessageHelper from '../helpers/RecoverMessageHelper';

export default class InChatCommandsController {
  private readonly service: InChatCommandsService;
  private readonly log: Logger;

  constructor(
    private readonly instance: Instance,
    private readonly tgBot: Telegram,
    private readonly tgUser: Telegram,
    private readonly oicq: OicqClient,
  ) {
    this.log = getLogger(`InChatCommandsController - ${instance.id}`);
    this.service = new InChatCommandsService(instance, tgBot, oicq);
    tgBot.addNewMessageEventHandler(this.onTelegramMessage);
  }

  private onTelegramMessage = async (message: Api.Message) => {
    if (!message.message) return;
    const messageParts = message.message.split(' ');
    if (!messageParts.length || !messageParts[0].startsWith('/')) return;
    let command: string = messageParts.shift();
    const params = messageParts.join(' ');
    if (command.includes('@')) {
      let target: string;
      [command, target] = command.split('@');
      if (target !== this.tgBot.me.username) return false;
    }
    const pair = this.instance.forwardPairs.find(message.chat);
    if (!pair) return false;
    switch (command) {
      case '/info':
        await this.service.info(message, pair);
        return true;
      case '/poke':
        await this.service.poke(message, pair);
        return true;
      case '/forwardoff':
        pair.enable = false;
        await message.reply({ message: '转发已禁用' });
        return true;
      case '/forwardon':
        pair.enable = true;
        await message.reply({ message: '转发已启用' });
        return true;
      case '/disable_qq_forward':
        pair.disableQ2TG = true;
        await message.reply({ message: 'QQ->TG已禁用' });
        return true;
      case '/enable_qq_forward':
        pair.disableQ2TG = false;
        await message.reply({ message: 'QQ->TG已启用' });
        return true;
      case '/disable_tg_forward':
        pair.disableTG2Q = true;
        await message.reply({ message: 'TG->QQ已禁用' });
        return true;
      case '/enable_tg_forward':
        pair.disableTG2Q = false;
        await message.reply({ message: 'TG->QQ已启用' });
        return true;
      case '/refresh':
        if (this.instance.workMode !== 'personal' || !message.senderId?.eq(this.instance.owner)) return false;
        await pair.updateInfo();
        await message.reply({ message: '<i>刷新成功</i>' });
        return true;
      case '/nick':
        if (this.instance.workMode !== 'personal' || !message.senderId?.eq(this.instance.owner)) return false;
        if (!(pair.qq instanceof Group)) return;
        if (!params) {
          await message.reply({
            message: `群名片：<i>${pair.qq.pickMember(this.instance.qqUin, true).card}</i>`,
          });
          return true;
        }
        const result = await pair.qq.setCard(this.instance.qqUin, params);
        await message.reply({
          message: '设置' + (result ? '成功' : '失败'),
        });
        return true;
      case '/recover':
        if (!message.senderId.eq(this.instance.owner)) return true;
        const helper = new RecoverMessageHelper(this.instance, this.tgBot, this.tgUser, this.oicq, pair, message);
        helper.startRecover().then(() => this.log.info('恢复完成'));
        return true;
      case '/search':
        await message.reply({
          message: await this.service.search(messageParts, pair),
        });
        return true;
    }
  };
}
