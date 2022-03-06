import DeleteMessageService from '../services/DeleteMessageService';
import { getLogger } from 'log4js';
import Telegram from '../client/Telegram';
import OicqClient from '../client/OicqClient';
import { Api } from 'telegram';
import forwardPairs from '../providers/forwardPairs';

export default class DeleteMessageController {
  private readonly deleteMessageService: DeleteMessageService;
  private readonly log = getLogger('DeleteMessageController');

  constructor(private readonly tgBot: Telegram,
              private readonly tgUser: Telegram,
              private readonly oicq: OicqClient) {
    this.deleteMessageService = new DeleteMessageService(tgBot, oicq);
    tgBot.addNewMessageEventHandler(this.onTelegramMessage);
    tgBot.addEditedMessageEventHandler(this.onTelegramEditMessage);
  }

  private onTelegramMessage = async (message: Api.Message) => {
    const pair = forwardPairs.find(message.chat);
    if (!pair) return false;
    // TODO: 可以做成 DeleteMessageController 之类
    if (message.message?.startsWith('/rm')) {
      // 撤回消息
      await this.deleteMessageService.handleTelegramMessageRm(message, pair);
      return true;
    }
  };

  private onTelegramEditMessage = async (message: Api.Message) => {
    const pair = forwardPairs.find(message.chat);
    if (!pair) return;
    await this.deleteMessageService.telegramDeleteMessage(message.id, pair);
    return await this.onTelegramMessage(message);
  };
}
