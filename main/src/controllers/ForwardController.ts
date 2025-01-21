import Telegram from '../client/Telegram';
import ForwardService from '../services/ForwardService';
import db from '../models/db';
import { Api } from 'telegram';
import { getLogger, Logger } from 'log4js';
import Instance from '../models/Instance';
import { getAvatar } from '../utils/urls';
import { CustomFile } from 'telegram/client/uploads';
import forwardHelper from '../helpers/forwardHelper';
import helper from '../helpers/forwardHelper';
import flags from '../constants/flags';
import {
  QQClient,
  MessageEvent,
  GroupMemberIncreaseEvent,
  PokeEvent,
  Friend,
  Group,

} from '../client/QQClient';
import posthog from '../models/posthog';
import env from '../models/env';
import memberRoleCache from '../helpers/memberRoleCache';

export default class ForwardController {
  private readonly forwardService: ForwardService;
  private readonly log: Logger;

  constructor(
    private readonly instance: Instance,
    private readonly tgBot: Telegram,
    private readonly tgUser: Telegram,
    private readonly oicq: QQClient,
  ) {
    this.log = getLogger(`ForwardController - ${instance.id}`);
    this.forwardService = new ForwardService(this.instance, tgBot, oicq);
    oicq.addNewMessageEventHandler(this.onQqMessage);
    oicq.addGroupMemberIncreaseEventHandler(this.onQqGroupMemberIncrease);
    oicq.addPokeEventHandler(this.onQqPoke);
    tgBot.addNewMessageEventHandler(this.onTelegramMessage);
    tgUser.addNewMessageEventHandler(this.onTelegramUserMessage);
    tgBot.addEditedMessageEventHandler(this.onTelegramMessage);
    instance.workMode === 'group' && tgBot.addChannelParticipantEventHandler(this.onTelegramParticipant);
  }

  private onQqMessage = async (event: MessageEvent) => {
    this.log.debug('收到 QQ 消息', event);
    try {
      const pair = this.instance.forwardPairs.find(event.chat);
      if (!pair) return;
      if ((pair.flags | this.instance.flags) & flags.DISABLE_Q2TG) return;
      // 如果是多张图片的话，是一整条消息，只过一次，所以不受这个判断影响
      // 防止私聊消息重复，icqq bug
      let existed = event.dm && await db.message.findFirst({
        where: {
          qqRoomId: pair.qqRoomId,
          qqSenderId: event.from.id,
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
      // 库的类型有问题
      let tgMessages = tgMessage as undefined as Api.Message[];
      if (!Array.isArray(tgMessages)) tgMessages = [tgMessage];
      for (const tgMessage of tgMessages) {
        await db.message.create({
          data: {
            qqRoomId: pair.qqRoomId,
            qqSenderId: event.from.id,
            time: event.time,
            brief: event.brief,
            seq: event.seq,
            rand: event.rand,
            pktnum: event.pktnum,
            tgChatId: pair.tgId,
            tgMsgId: tgMessage.id,
            instanceId: this.instance.id,
            tgMessageText: tgMessage.message,
            tgFileId: forwardHelper.getMessageDocumentId(tgMessage),
            nick: event.from.name,
            tgSenderId: BigInt(this.tgBot.me.id.toString()),
            richHeaderUsed,
          },
        });
      }
    }
    catch (e) {
      this.log.error('处理 QQ 消息时遇到问题', e);
      posthog.capture('处理 QQ 消息时遇到问题', { error: e });
    }
  };

  private onTelegramUserMessage = async (message: Api.Message) => {
    if (!message.sender) return;
    if (!('bot' in message.sender) || !message.sender.bot) return;
    const pair = this.instance.forwardPairs.find(message.chat);
    if (!pair) return;
    if ((pair.flags | this.instance.flags) & flags.DISABLE_FORWARD_OTHER_BOT) return;
    await this.onTelegramMessage(message, pair);
  };

  private onTelegramMessage = async (message: Api.Message, pair = this.instance.forwardPairs.find(message.chat)) => {
    try {
      if (message.senderId?.eq(this.instance.botMe.id)) return true;
      if (!pair) return false;
      if ((pair.flags | this.instance.flags) & flags.DISABLE_TG2Q) return;
      this.log.debug('收到 TG 消息', message);
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
              tgSenderId: BigInt(Number(message.senderId || message.sender?.id) || helper.peerToId(message.peerId)),
            },
          });
        }
      }
    }
    catch (e) {
      this.log.error('处理 Telegram 消息时遇到问题', e);
      posthog.capture('处理 Telegram 消息时遇到问题', { error: e });
    }
  };

  private onQqGroupMemberIncrease = async (event: GroupMemberIncreaseEvent) => {
    try {
      const pair = this.instance.forwardPairs.find(event.chat);
      if (!pair) return false;
      if ((pair?.flags | this.instance.flags) & flags.DISABLE_JOIN_NOTICE) return false;
      const hideAllQqNumber = (pair.flags | this.instance.flags) & flags.HIDE_ALL_QQ_NUMBER;
      const avatar = await getAvatar(event.userId);
      await pair.tg.sendMessage({
        file: new CustomFile('avatar.png', avatar.length, '', avatar),
        message: `<b>${event.nickname}</b>${hideAllQqNumber ? '' : ` (<code>${event.userId}</code>)`} <i>加入了本群</i>`,
        silent: true,
      });
    }
    catch (e) {
      this.log.error('处理 QQ 群成员增加事件时遇到问题', e);
      posthog.capture('处理 QQ 群成员增加事件时遇到问题', { error: e });
    }
  };

  private onTelegramParticipant = async (event: Api.UpdateChannelParticipant) => {
    try {
      this.log.debug('收到 TG 群成员事件', event);
      const pair = this.instance.forwardPairs.find(event.channelId);
      memberRoleCache.delete(pair, event.userId.toJSNumber());
      if ((pair?.flags | this.instance.flags) & flags.DISABLE_JOIN_NOTICE) return false;
      if (event.prevParticipant && !(event.prevParticipant instanceof Api.ChannelParticipantBanned)) return false;
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
      posthog.capture('处理 TG 群成员增加事件时遇到问题', { error: e });
    }
  };

  private onQqPoke = async (event: PokeEvent) => {
    const pair = this.instance.forwardPairs.find(event.chat);
    if (!pair) return;
    if ((pair?.flags | this.instance.flags) & flags.DISABLE_POKE) return;
    let operatorName: string, targetName: string;
    if (event.dm) {
      const chat = event.chat as Friend;
      if (event.fromId === event.chatId) {
        operatorName = chat.remark || chat.nickname;
      }
      else {
        operatorName = '你';
      }
      if (event.fromId === event.targetId) {
        targetName = '自己';
      }
      else if (event.targetId === event.chatId) {
        targetName = chat.remark || chat.nickname;
      }
      else {
        targetName = '你';
      }
    }
    else {
      const chat = event.chat as Group;
      const operator = chat.pickMember(event.fromId);
      let operatorInfo = await operator.renew();
      operatorName = operatorInfo.card || operatorInfo.nickname;
      if (!((pair.flags | this.instance.flags) & flags.DISABLE_RICH_HEADER) && env.WEB_ENDPOINT) {
        const richHeaderUrl = helper.generateRichHeaderUrl(pair.apiKey, operatorInfo.user_id, operatorName);
        operatorName = `<a href="${richHeaderUrl}">${operatorName}</a>`;
      }
      if (event.fromId === event.targetId) {
        targetName = '自己';
      }
      else {
        const targetUser = chat.pickMember(event.targetId);
        let targetInfo = await targetUser.renew();
        targetName = targetInfo.card || targetInfo.nickname;
        if (!((pair.flags | this.instance.flags) & flags.DISABLE_RICH_HEADER) && env.WEB_ENDPOINT) {
          const richHeaderUrl = helper.generateRichHeaderUrl(pair.apiKey, targetInfo.user_id, targetName);
          targetName = `<a href="${richHeaderUrl}">${targetName}</a>`;
        }
      }
    }
    await pair.tg.sendMessage({
      message: `<i><b>${operatorName}</b>${event.action || '戳了戳'}<b>${targetName}</b>${event.suffix || ''}</i>`,
      silent: true,
      linkPreview: false,
    });
  };
}
