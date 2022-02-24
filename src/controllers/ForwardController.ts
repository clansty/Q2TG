import Telegram from '../client/Telegram';
import OicqClient from '../client/OicqClient';
import ForwardService from '../services/ForwardService';
import forwardPairs from '../providers/forwardPairs';
import { DiscussMessageEvent, Friend, Group, GroupMessageEvent, PrivateMessageEvent } from 'oicq';
import db from '../providers/db';
import helper from '../helpers/forwardHelper';

export default class ForwardController {
  private readonly forwardService: ForwardService;

  constructor(private readonly tgBot: Telegram,
              private readonly tgUser: Telegram,
              private readonly oicq: OicqClient) {
    this.forwardService = new ForwardService(tgBot, oicq);
    forwardPairs.init(oicq, tgBot)
      .then(() => oicq.on('message', this.onQqMsg));
  }

  private onQqMsg = async (event: PrivateMessageEvent | GroupMessageEvent | DiscussMessageEvent) => {
    let target: Friend | Group;
    if (event.message_type === 'private') {
      target = event.friend;
    }
    else if (event.message_type === 'group') {
      target = event.group;
    }
    else return;
    const pair = forwardPairs.find(target);
    if (!pair) return;
    const tgMsg = await this.forwardService.forwardFromQq(event, pair);
    if (tgMsg) {
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
          tgMsgId: tgMsg.id,
        },
      });
    }
  };
}
