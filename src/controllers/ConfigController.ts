import { Api } from 'telegram';
import { Telegram } from '../client/Telegram';
import { Client as OicqClient } from 'oicq';
import ConfigService from '../services/ConfigService';
import { config } from '../providers/userConfig';
import regExps from '../constants/regExps';

export default class ConfigController {
  private readonly configService: ConfigService;

  constructor(private readonly tgBot: Telegram,
              private readonly tgUser: Telegram,
              private readonly oicq: OicqClient) {
    this.configService = new ConfigService(tgBot, tgUser, oicq);
    tgBot.addNewMessageEventHandler(this.handleMessage);
    tgBot.setCommands([], new Api.BotCommandScopeUsers());
  }

  private handleMessage = async (message: Api.Message) => {
    if (!message.sender.id.eq(config.owner)) {
      return false;
    }
    const messageSplit = message.message.split(' ');
    if (message.isGroup) {
      if (messageSplit.length === 2 && messageSplit[0].startsWith('/start') && regExps.roomId.test(messageSplit[1])) {
        await this.configService.createLinkGroup(Number(messageSplit[1]), Number(message.chat.id));
        return true;
      }
      else
        return false;
    }
    else if (message.isPrivate) {
      switch (messageSplit[0]) {
        case '/add':
          // 加的参数永远是正的群号
          if (messageSplit.length === 3 && regExps.qq.test(messageSplit[1]) && !isNaN(Number(messageSplit[2]))) {
            await this.configService.createLinkGroup(-Number(messageSplit[1]), Number(messageSplit[2]));
          }
          else if (messageSplit[1] && regExps.qq.test(messageSplit[1])) {
            await this.configService.addExact(Number(messageSplit[1]));
          }
          else {
            await this.configService.add();
          }
          return true;
      }
    }
  };
}
