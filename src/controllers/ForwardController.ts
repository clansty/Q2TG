import Telegram from '../client/Telegram';
import OicqClient from '../client/OicqClient';
import ForwardService from '../services/ForwardService';
import { GroupMessageEvent, MemberIncreaseEvent, PrivateMessageEvent } from 'oicq';
import db from '../models/db';
import { Api } from 'telegram';
import { getLogger, Logger } from 'log4js';
import Instance from '../models/Instance';
import { getAvatar } from '../utils/urls';
import { CustomFile } from 'telegram/client/uploads';
import forwardHelper from '../helpers/forwardHelper';

export default class ForwardController {
  private readonly forwardService: ForwardService;
  private readonly log: Logger;

  constructor(private readonly instance: Instance,
              private readonly tgBot: Telegram,
              private readonly tgUser: Telegram,
              private readonly oicq: OicqClient) {
    this.log = getLogger(`ForwardController - ${instance.id}`);
    this.forwardService = new ForwardService(this.instance, tgBot, oicq);
    oicq.addNewMessageEventHandler(this.onQqMessage);
    oicq.on('notice.group.increase', this.onQqGroupMemberIncrease);
    tgBot.addNewMessageEventHandler(this.onTelegramMessage);
    tgBot.addEditedMessageEventHandler(this.onTelegramMessage);
    instance.workMode === 'group' && tgBot.addChannelParticipantEventHandler(this.onTelegramParticipant);
  }

  private onQqMessage = async (event: PrivateMessageEvent | GroupMessageEvent) => {
    try {
      const target = event.message_type === 'private' ? event.friend : event.group;
      const pair = this.instance.forwardPairs.find(target);
      if (!pair) return;
      const tgMessages = await this.forwardService.forwardFromQq(event, pair);
      for (const tgMessage of tgMessages) {
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
      if (message.senderId?.eq(this.instance.botMe.id)) return true;
      const pair = this.instance.forwardPairs.find(message.chat);
      if (!pair) return false;
      const qqMessagesSent = await this.forwardService.forwardFromTelegram(message, pair);
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

  private onQqGroupMemberIncrease = async (event: MemberIncreaseEvent) => {
    try {
      const pair = this.instance.forwardPairs.find(event.group);
      if (!pair?.joinNotice) return false;
      const avatar = await getAvatar(event.user_id);
      await pair.tg.sendMessage({
        file: new CustomFile('avatar.png', avatar.length, '', avatar),
        message: `<b>${event.nickname}</b> (<code>${event.user_id}</code>) <i>加入了本群</i>`,
        silent: true,
      });
    }
    catch (e) {
      this.log.error('处理 QQ 群成员增加事件时遇到问题', e);
    }
  };

  private onTelegramParticipant = async (event: Api.UpdateChannelParticipant) => {
    try {
      const pair = this.instance.forwardPairs.find(event.channelId);
      if (!pair?.joinNotice) return false;
      if (!(event.newParticipant instanceof Api.ChannelParticipantAdmin)
        && !(event.newParticipant instanceof Api.ChannelParticipantCreator)
        && !(event.newParticipant instanceof Api.ChannelParticipant))
        return false;
      const member = await this.tgBot.getChat(event.newParticipant.userId);
      await pair.qq.sendMsg(`${forwardHelper.getUserDisplayName(member.entity)} 加入了本群`);
      await pair.qq.sendMsg(`${forwardHelper.getUserDisplayName(member.entity)} 加入了本群`);
    }
    catch (e) {
      this.log.error('处理 TG 群成员增加事件时遇到问题', e);
    }
  };
}
