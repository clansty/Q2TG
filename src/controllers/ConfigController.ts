import { Api } from 'telegram';
import { Telegram } from '../client/Telegram';
import { Client as OicqClient } from 'oicq';
import ConfigService from '../services/ConfigService';
import { config } from '../providers/userConfig';

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
    if (!message.chat.id.eq(config.owner)) {
      return false;
    }
    switch (message.message){
      case '/add':
        this.configService.add()
        return true
    }
  };
}
