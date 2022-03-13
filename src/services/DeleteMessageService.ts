import Telegram from '../client/Telegram';
import { getLogger, Logger } from 'log4js';
import { Api } from 'telegram';
import db from '../models/db';
import { Friend, FriendRecallEvent, Group, GroupRecallEvent } from 'oicq';
import Instance from '../models/Instance';
import { Pair } from '../models/Pair';
import { consumer } from '../utils/highLevelFunces';

export default class DeleteMessageService {
  private readonly log: Logger;

  constructor(private readonly instance: Instance,
              private readonly tgBot: Telegram) {
    this.log = getLogger(`DeleteMessageService - ${instance.id}`);
  }

  // 500ms 内只撤回一条消息，防止频繁导致一部分消息没有成功撤回。不过这样的话，会得不到返回的结果
  private recallQqMessage = consumer(async (qq: Friend | Group, seq: number, rand: number, timeOrPktnum: number) => {
    await qq.recallMsg(seq, rand, timeOrPktnum);
  }, 500);

  /**
   * 删除 QQ 对应的消息
   * @param messageId
   * @param pair
   * @param isOthersMsg
   */
  async telegramDeleteMessage(messageId: number, pair: Pair, isOthersMsg = false) {
    // 删除的时候会返回记录
    try {
      const messageInfo = await db.message.findFirst({
        where: {
          tgChatId: pair.tgId,
          tgMsgId: messageId,
          instanceId: this.instance.id,
        },
      });
      if (messageInfo) {
        try {
          this.recallQqMessage(pair.qq, messageInfo.seq, messageInfo.rand,
            pair.qq instanceof Friend ? messageInfo.time : messageInfo.pktnum);
          await db.message.delete({
            where: { id: messageInfo.id },
          });
        }
        catch (e) {
          const tipMsg = await pair.tg.sendMessage({
            message: '撤回 QQ 中对应的消息失败' +
              (this.instance.workMode === 'group' ? '，QQ Bot 需要是管理员' : '') +
              (isOthersMsg ? '，而且无法撤回其他管理员的消息' : '') +
              (e.message ? '\n' + e.message : ''),
            silent: true,
          });
          this.instance.workMode === 'group' && setTimeout(async () => await tipMsg.delete({ revoke: true }), 5000);
        }
      }
    }
    catch (e) {
    }
  }

  /**
   * 处理 TG 里面发送的 /rm
   * @param message
   * @param pair
   */
  async handleTelegramMessageRm(message: Api.Message, pair: Pair) {
    const replyMessage = await message.getReplyMessage();
    if (replyMessage instanceof Api.Message) {
      // 检查权限并撤回被回复的消息
      let hasPermission = this.instance.workMode === 'personal' || replyMessage.senderId?.eq(message.senderId);
      if (!hasPermission && message.chat instanceof Api.Channel) {
        // 可能是超级群
        try {
          const member = (await pair.tg.getMember(message.sender)).participant;
          hasPermission = member instanceof Api.ChannelParticipantCreator ||
            (member instanceof Api.ChannelParticipantAdmin && member.adminRights.deleteMessages);
        }
        catch (e) {
          // 不管了
        }
      }
      if (!hasPermission && message.chat instanceof Api.Chat) {
        // 不是超级群，我也不知道怎么判断，而且应该用不到
      }
      if (hasPermission) {
        // 双平台撤回被回复的消息
        // 撤回 QQ 的
        await this.telegramDeleteMessage(message.replyToMsgId, pair, replyMessage.senderId?.eq(this.tgBot.me.id));
        try {
          // 撤回 TG 的
          await pair.tg.deleteMessages(message.replyToMsgId);
        }
        catch (e) {
          await pair.tg.sendMessage(`删除消息失败：${e.message}`);
        }
      }
      else {
        const tipMsg = await pair.tg.sendMessage({
          message: '不能撤回别人的消息',
          silent: true,
        });
        setTimeout(async () => await tipMsg.delete({ revoke: true }), 5000);
      }
    }
    // 撤回消息本身
    try {
      await message.delete({ revoke: true });
    }
    catch (e) {
      const tipMsg = await message.reply({
        message: 'Bot 目前无法撤回其他用户的消息，Bot 需要「删除消息」权限',
        silent: true,
      });
      setTimeout(async () => await tipMsg.delete({ revoke: true }), 5000);
    }
  }

  public async handleQqRecall(event: FriendRecallEvent | GroupRecallEvent, pair: Pair) {
    try {
      const message = await db.message.findFirst({
        where: {
          seq: event.seq,
          rand: event.rand,
          qqRoomId: pair.qqRoomId,
          instanceId: this.instance.id,
        },
      });
      if (message) {
        await db.message.delete({
          where: { id: message.id },
        });
        await pair.tg.deleteMessages(message.tgMsgId);
      }
    }
    catch (e) {
      this.log.error('处理 QQ 消息撤回失败', e);
    }
  }
}
