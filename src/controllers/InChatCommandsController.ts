import InChatCommandsService from '../services/InChatCommandsService';
import { getLogger, Logger } from 'log4js';
import Instance from '../models/Instance';
import Telegram from '../client/Telegram';
import OicqClient from '../client/OicqClient';
import { Api } from 'telegram';

export default class InChatCommandsController {
  private readonly service: InChatCommandsService;
  private readonly log: Logger;

  constructor(private readonly instance: Instance,
              private readonly tgBot: Telegram,
              private readonly oicq: OicqClient) {
    this.log = getLogger(`InChatCommandsController - ${instance.id}`);
    this.service = new InChatCommandsService(instance, tgBot, oicq);
    tgBot.addNewMessageEventHandler(this.onTelegramMessage);
  }

  private onTelegramMessage = async (message: Api.Message) => {
    if (!message.message) return;
    const messageParts = message.message.split(' ');
    if (!messageParts.length || !messageParts[0].startsWith('/')) return;
    let command: string = messageParts[0];
    if (command.includes('@')) {
      let target: string;
      [command, target] = command.split('@');
      if (target !== this.tgBot.me.username) return false;
    }
    const pair = this.instance.forwardPairs.find(message.chat);
    switch (command) {
      case '/info':
        await this.service.info(message, pair);
        return true;
      case '/refresh':
        if (this.instance.workMode !== 'personal' || !message.senderId?.eq(this.instance.owner)) return false;
        await pair.updateInfo();
        await message.reply({ message: '<i>刷新成功</i>' });
        return true;
    }
  };
}
