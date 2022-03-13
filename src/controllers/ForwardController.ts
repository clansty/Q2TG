import Telegram from '../client/Telegram';
import OicqClient from '../client/OicqClient';
import ForwardService from '../services/ForwardService';
import { GroupMessageEvent, PrivateMessageEvent } from 'oicq';
import db from '../models/db';
import { Api } from 'telegram';
import { getLogger, Logger } from 'log4js';
import Instance from '../models/Instance';

export default class ForwardController {
  private readonly forwardService: ForwardService;
  private readonly log: Logger;

  constructor(private readonly instance: Instance,
              private readonly tgBot: Telegram,
              private readonly tgUser: Telegram,
              private readonly oicq: OicqClient) {
    this.log = getLogger(`ForwardController - ${instance.id}`);
    this.forwardService = new ForwardService(this.instance, tgBot);
    oicq.addNewMessageEventHandler(this.onQqMessage);
    tgBot.addNewMessageEventHandler(this.onTelegramMessage);
    tgBot.addEditedMessageEventHandler(this.onTelegramMessage);
  }

  private onQqMessage = async (event: PrivateMessageEvent | GroupMessageEvent) => {
    try {
      const target = event.message_type === 'private' ? event.friend : event.group;
      const pair = this.instance.forwardPairs.find(target);
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
            instanceId: this.instance.id,
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
      const pair = this.instance.forwardPairs.find(message.chat);
      if (!pair) return false;
      const qqMessagesSent = await this.forwardService.forwardFromTelegram(message, pair);
      // 返回的信息不太够
      if (qqMessagesSent) {
        // 更新数据库
        for (const qqMessageSent of qqMessagesSent) {
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
              instanceId: this.instance.id,
            },
          });
        }
      }
    }
    catch (e) {
      this.log.error('处理 Telegram 消息时遇到问题', e);
    }
  };
}
