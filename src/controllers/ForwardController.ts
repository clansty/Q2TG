import Telegram from '../client/Telegram';
import OicqClient from '../client/OicqClient';
import ForwardService from '../services/ForwardService';
import forwardPairs from '../providers/forwardPairs';
import { Friend, Group, GroupMessageEvent, PrivateMessageEvent } from 'oicq';
import db from '../providers/db';
import helper from '../helpers/forwardHelper';
import { Api } from 'telegram';

export default class ForwardController {
  private readonly forwardService: ForwardService;

  constructor(private readonly tgBot: Telegram,
              private readonly tgUser: Telegram,
              private readonly oicq: OicqClient) {
    this.forwardService = new ForwardService(tgBot, oicq);
    forwardPairs.init(oicq, tgBot)
      .then(() => oicq.addNewMessageEventHandler(this.onQqMessage))
      .then(() => tgBot.addNewMessageEventHandler(this.onTelegramMessage));
  }

  private onQqMessage = async (event: PrivateMessageEvent | GroupMessageEvent) => {
    let target: Friend | Group;
    if (event.message_type === 'private') {
      target = event.friend;
    }
    else {
      target = event.group;
    }
    const pair = forwardPairs.find(target);
    if (!pair) return;
    const tgMessage = await this.forwardService.forwardFromQq(event, pair);
    if (tgMessage) {
      // 更新数据库
      await db.message.create({
        data: {
          qqRoomId: helper.getRoomId(pair.qq),
          qqSenderId: event.sender.user_id,
          time: event.time,
          brief: event.raw_message,
          seq: event.seq,
          rand: event.rand,
          pktnum: event.pktnum,
          tgChatId: Number(pair.tg.id),
          tgMsgId: tgMessage.id,
        },
      });
    }
  };

  private onTelegramMessage = async (message: Api.Message) => {
    const pair = forwardPairs.find(message.chat);
    if (!pair) return;
    const qqMessageSent = await this.forwardService.forwardFromTelegram(message, pair);
    // 返回的信息不太够
    if (qqMessageSent) {
      const qqMessage = await this.oicq.getMsg(qqMessageSent.message_id);
      // 更新数据库
      await db.message.create({
        data: {
          qqRoomId: helper.getRoomId(pair.qq),
          qqSenderId: qqMessage.sender.user_id,
          time: qqMessage.time,
          brief: qqMessage.raw_message,
          seq: qqMessage.seq,
          rand: qqMessage.rand,
          pktnum: qqMessage.pktnum,
          tgChatId: Number(pair.tg.id),
          tgMsgId: message.id,
        },
      });
    }
  };
}
