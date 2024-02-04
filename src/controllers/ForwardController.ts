import Telegram from '../client/Telegram';
import OicqClient from '../client/OicqClient';
import ForwardService from '../services/ForwardService';
import {
  Friend,
  FriendPokeEvent,
  GroupMessageEvent,
  GroupPokeEvent,
  MemberIncreaseEvent,
  PrivateMessageEvent,
} from 'icqq';
import db from '../models/db';
import { Api } from 'telegram';
import { getLogger, Logger } from 'log4js';
import Instance from '../models/Instance';
import { getAvatar } from '../utils/urls';
import { CustomFile } from 'telegram/client/uploads';
import forwardHelper from '../helpers/forwardHelper';
import helper from '../helpers/forwardHelper';
import ZincSearch from 'zincsearch-node';
import flags from '../constants/flags';

export default class ForwardController {
  private readonly forwardService: ForwardService;
  private readonly log: Logger;

  constructor(
    private readonly instance: Instance,
    private readonly tgBot: Telegram,
    private readonly tgUser: Telegram,
    private readonly oicq: OicqClient,
  ) {
    this.log = getLogger(`ForwardController - ${instance.id}`);
    this.forwardService = new ForwardService(this.instance, tgBot, oicq);
    oicq.addNewMessageEventHandler(this.onQqMessage);
    oicq.on('notice.group.increase', this.onQqGroupMemberIncrease);
    oicq.on('notice.friend.poke', this.onQqPoke);
    oicq.on('notice.group.poke', this.onQqPoke);
    tgBot.addNewMessageEventHandler(this.onTelegramMessage);
    tgBot.addEditedMessageEventHandler(this.onTelegramMessage);
    instance.workMode === 'group' && tgBot.addChannelParticipantEventHandler(this.onTelegramParticipant);
  }

  private onQqMessage = async (event: PrivateMessageEvent | GroupMessageEvent) => {
    try {
      const target = event.message_type === 'private' ? event.friend : event.group;
      const pair = this.instance.forwardPairs.find(target);
      if (!pair) return;
      if ((pair.flags | this.instance.flags) & flags.DISABLE_Q2TG) return;
      // 如果是多张图片的话，是一整条消息，只过一次，所以不受这个判断影响
      let existed = event.message_type === 'private' && await db.message.findFirst({
        where: {
          qqRoomId: pair.qqRoomId,
          qqSenderId: event.sender.user_id,
          seq: event.seq,
          rand: event.rand,
          pktnum: event.pktnum,
          time: event.time,
          instanceId: this.instance.id,
        },
      });
      if (existed) return;
      // 开始转发过程
      let { tgMessage, richHeaderUsed } = await this.forwardService.forwardFromQq(event, pair);
      if (!tgMessage) return;
      // 更新数据库
      await db.message.create({
        data: {
          qqRoomId: pair.qqRoomId,
          qqSenderId: event.sender.user_id,
          time: event.time,
          brief: event.raw_message,
          seq: event.seq,
          rand: event.rand,
          pktnum: event.pktnum,
          tgChatId: pair.tgId,
          tgMsgId: tgMessage.id,
          instanceId: this.instance.id,
          tgMessageText: tgMessage.message,
          tgFileId: forwardHelper.getMessageDocumentId(tgMessage),
          nick: event.nickname,
          tgSenderId: BigInt(this.tgBot.me.id.toString()),
          richHeaderUsed,
        },
      });
      await this.forwardService.addToZinc(pair.dbId, tgMessage.id, {
        text: event.raw_message,
        nick: event.nickname,
      });
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
      if ((pair.flags | this.instance.flags) & flags.DISABLE_TG2Q) return;
      const qqMessagesSent = await this.forwardService.forwardFromTelegram(message, pair);
      if (qqMessagesSent) {
        // 更新数据库
        for (const qqMessageSent of qqMessagesSent) {
          await db.message.create({
            data: {
              qqRoomId: pair.qqRoomId,
              qqSenderId: qqMessageSent.senderId,
              time: qqMessageSent.time,
              brief: qqMessageSent.brief,
              seq: qqMessageSent.seq,
              rand: qqMessageSent.rand,
              pktnum: 1,
              tgChatId: pair.tgId,
              tgMsgId: message.id,
              instanceId: this.instance.id,
              tgMessageText: message.message,
              tgFileId: forwardHelper.getMessageDocumentId(message),
              nick: helper.getUserDisplayName(message.sender),
              tgSenderId: BigInt((message.senderId || message.sender?.id).toString()),
            },
          });
          await this.forwardService.addToZinc(pair.dbId, message.id, {
            text: qqMessageSent.brief,
            nick: helper.getUserDisplayName(message.sender),
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
      if ((pair?.flags | this.instance.flags) & flags.DISABLE_JOIN_NOTICE) return false;
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
      if ((pair?.flags | this.instance.flags) & flags.DISABLE_JOIN_NOTICE) return false;
      if (
        !(event.newParticipant instanceof Api.ChannelParticipantAdmin) &&
        !(event.newParticipant instanceof Api.ChannelParticipantCreator) &&
        !(event.newParticipant instanceof Api.ChannelParticipant)
      )
        return false;
      const member = await this.tgBot.getChat(event.newParticipant.userId);
      await pair.qq.sendMsg(`${forwardHelper.getUserDisplayName(member.entity)} 加入了本群`);
    }
    catch (e) {
      this.log.error('处理 TG 群成员增加事件时遇到问题', e);
    }
  };

  private onQqPoke = async (event: FriendPokeEvent | GroupPokeEvent) => {
    const target = event.notice_type === 'friend' ? event.friend : event.group;
    const pair = this.instance.forwardPairs.find(target);
    if ((pair?.flags | this.instance.flags) & flags.DISABLE_POKE) return;
    let operatorName: string, targetName: string;
    if (target instanceof Friend) {
      if (event.operator_id === target.user_id) {
        operatorName = target.remark || target.nickname;
      }
      else {
        operatorName = '你';
      }
      if (event.operator_id === event.target_id) {
        targetName = '自己';
      }
      else if (event.target_id === target.user_id) {
        targetName = target.remark || target.nickname;
      }
      else {
        targetName = '你';
      }
    }
    else {
      const operator = target.pickMember(event.operator_id);
      await operator.renew();
      operatorName = operator.card || operator.info.nickname;
      if (event.operator_id === event.target_id) {
        targetName = '自己';
      }
      else {
        const targetUser = target.pickMember(event.target_id);
        await targetUser.renew();
        targetName = targetUser.card || targetUser.info.nickname;
      }
    }
    await pair.tg.sendMessage({
      message: `<i><b>${operatorName}</b>${event.action}<b>${targetName}</b>${event.suffix}</i>`,
      silent: true,
    });
  };
}
