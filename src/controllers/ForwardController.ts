import Telegram from '../client/Telegram';
import OicqClient from '../client/OicqClient';
import ForwardService from '../services/ForwardService';
import forwardPairs from '../providers/forwardPairs';
import { GroupMessageEvent, PrivateMessageEvent } from 'oicq';
import db from '../providers/db';
import { Api } from 'telegram';
import { getLogger } from 'log4js';

export default class ForwardController {
  private readonly forwardService: ForwardService;
  private readonly log = getLogger('ForwardController');

  constructor(private readonly tgBot: Telegram,
              private readonly tgUser: Telegram,
              private readonly oicq: OicqClient) {
    this.forwardService = new ForwardService(tgBot, oicq);
    forwardPairs.init(oicq, tgBot)
      .then(() => oicq.addNewMessageEventHandler(this.onQqMessage))
      .then(() => tgBot.addNewMessageEventHandler(this.onTelegramMessage))
      .then(() => tgBot.addEditedMessageEventHandler(this.onTelegramEditMessage));
  }

  private onQqMessage = async (event: PrivateMessageEvent | GroupMessageEvent) => {
    try {
      const target = event.message_type === 'private' ? event.friend : event.group;
      const pair = forwardPairs.find(target);
      if (!pair) return;
      const tgMessage = await this.forwardService.forwardFromQq(event, pair);
      if (tgMessage) {
        // 更新数据库
        await db.message.create({
          data: {
            qqRoomId: pair.qqRoomId,
            qqSenderId: event.user_id,
            time: event.time,
            brief: event.raw_message,
            seq: event.seq,
            rand: event.rand,
            pktnum: event.pktnum,
            tgChatId: pair.tgId,
            tgMsgId: tgMessage.id,
          },
        });
      }
    }
    catch (e) {
      this.log.error('处理 QQ 消息时遇到问题', e);
    }
  };

  private onTelegramMessage = async (message: Api.Message) => {
    try {
      const pair = forwardPairs.find(message.chat);
      if (!pair) return;
      const qqMessageSent = await this.forwardService.forwardFromTelegram(message, pair);
      // 返回的信息不太够
      if (qqMessageSent) {
        // 更新数据库
        await db.message.create({
          data: {
            qqRoomId: pair.qqRoomId,
            qqSenderId: this.oicq.uin,
            time: qqMessageSent.time,
            brief: qqMessageSent.brief,
            seq: qqMessageSent.seq,
            rand: qqMessageSent.rand,
            pktnum: 1,
            tgChatId: pair.tgId,
            tgMsgId: message.id,
          },
        });
      }
    }
    catch (e) {
      this.log.error('处理 Telegram 消息时遇到问题', e);
    }
  };

  private onTelegramEditMessage = async (message: Api.Message) => {
    const pair = forwardPairs.find(message.chat);
    if (!pair) return;
    await this.forwardService.telegramDeleteMessage(message.id, pair);
    await this.onTelegramMessage(message);
  };
}
