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

    }
    else if (message.isPrivate) {
      switch (messageSplit[0]) {
        case '/add':
          if (messageSplit[1] && regExps.qq.test(messageSplit[1])) {
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
