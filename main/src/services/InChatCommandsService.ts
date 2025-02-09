import { getLogger, Logger } from 'log4js';
import Instance from '../models/Instance';
import Telegram from '../client/Telegram';
import { Api } from 'telegram';
import getAboutText from '../utils/getAboutText';
import { Pair } from '../models/Pair';
import { CustomFile } from 'telegram/client/uploads';
import { getAvatar } from '../utils/urls';
import db from '../models/db';
import { format } from 'date-fns';
import { QQClient, Group, GroupMemberInfo } from '../client/QQClient';
import { Member as OicqMember, Group as OicqGroup, Friend as OicqFriend } from '@icqqjs/icqq';
import posthog from '../models/posthog';
import getTopicIdFromReply from '../utils/getTopicIdFromReply';

export default class InChatCommandsService {
  private readonly log: Logger;

  constructor(private readonly instance: Instance,
              private readonly tgBot: Telegram,
              private readonly oicq: QQClient) {
    this.log = getLogger(`InChatCommandsService - ${instance.id}`);
  }

  public async info(message: Api.Message, pair: Pair) {
    const replyMessageId = message.replyToMsgId;
    const topicId = getTopicIdFromReply(message.replyTo);
    if (replyMessageId && topicId !== replyMessageId) {
      const messageInfo = await db.message.findFirst({
        where: {
          tgChatId: Number(message.chat.id),
          tgMsgId: replyMessageId,
        },
      });
      if (messageInfo) {
        let textToSend = '';
        if ('uin' in pair.qq) {
          if (Number(messageInfo.qqSenderId) === pair.qqRoomId) {
            textToSend += `<b>发送者：</b>${pair.qq.remark || pair.qq.nickname}(<code>${pair.qq.uin}</code>)\n`;
          }
          else {
            textToSend += `<b>发送者：</b>${this.oicq.nickname}(<code>${this.oicq.uin}</code>)\n`;
          }
        }
        else {
          const sender = pair.qq.pickMember(Number(messageInfo.qqSenderId));
          let memberInfo: GroupMemberInfo;
          if (sender instanceof OicqMember) {
            memberInfo = await sender.renew();
          }

          textToSend += `<b>发送者：</b>${memberInfo.title ? `「<i>${memberInfo.title}</i>」` : ''}` +
            `${memberInfo.card || memberInfo.nickname}(<code>${sender.uin}</code>)\n`;
          if (memberInfo.role !== 'member') {
            textToSend += `<b>职务：</b>${memberInfo.role === 'owner' ? '群主' : '管理员'}\n`;
          }
        }
        textToSend += `<b>发送时间：</b>${format(new Date(messageInfo.time * 1000), 'yyyy-M-d hh:mm:ss')}`;
        const avatar = await getAvatar(Number(messageInfo.qqSenderId));
        if (this.instance.workMode === 'personal') {
          await message.reply({
            message: textToSend,
            file: new CustomFile('avatar.png', avatar.length, '', avatar),
          });
        }
        else {
          const sender = await this.tgBot.getChat(message.sender);
          try {
            await message.delete({ revoke: true });
            await sender.sendMessage({
              message: textToSend,
              file: new CustomFile('avatar.png', avatar.length, '', avatar),
            });
          }
          catch {
          }
        }
      }
      else {
        await message.reply({
          message: '<i>获取消息信息失败</i>',
        });
      }
    }
    else {
      const avatar = await getAvatar(pair.qqRoomId);
      await message.reply({
        message: await getAboutText(pair.qq, true),
        file: new CustomFile('avatar.png', avatar.length, '', avatar),
      });
    }
  }

  public async poke(message: Api.Message, pair: Pair) {
    if (!('pokeMember' in pair.qq) && !('poke' in pair.qq)) {
      await message.reply({
        message: '<i>此功能不支持</i>',
      });
      return;
    }
    const qq = pair.qq as OicqFriend | OicqGroup;
    try {
      let target: number;
      if (message.replyToMsgId) {
        const dbEntry = await db.message.findFirst({
          where: {
            tgChatId: pair.tgId,
            tgMsgId: message.replyToMsgId,
          },
        });
        if (dbEntry) {
          target = Number(dbEntry.qqSenderId);
        }
      }
      if ('pokeMember' in qq && !target) {
        await message.reply({
          message: '<i>请回复一条消息</i>',
        });
      }
      else if ('pokeMember' in qq) {
        await qq.pokeMember(target);
      }
      else {
        await qq.poke(target && target !== pair.qqRoomId);
      }
    }
    catch (e) {
      await message.reply({
        message: `<i>错误</i>\n${e.message}`,
      });
    }
  }

  // 禁言 QQ 成员
  public async mute(message: Api.Message, pair: Pair, args: string[]) {
    try {
      const group = pair.qq as Group;
      if (!(group.is_admin || group.is_owner)) {
        await message.reply({
          message: '<i>无管理员权限</i>',
        });
        return;
      }
      let target: number;
      if (message.replyToMsgId) {
        const dbEntry = await db.message.findFirst({
          where: {
            tgChatId: pair.tgId,
            tgMsgId: message.replyToMsgId,
          },
        });
        if (dbEntry) {
          target = Number(dbEntry.qqSenderId);
        }
      }
      if (!target) {
        await message.reply({
          message: '<i>请回复一条消息</i>',
        });
        return;
      }
      if (!args.length) {
        await message.reply({
          message: '<i>请输入禁言的时间</i>',
        });
        return;
      }
      let time = Number(args[0]);
      if (isNaN(time)) {
        const unit = args[0].substring(args[0].length - 1, args[0].length);
        time = Number(args[0].substring(0, args[0].length - 1));

        switch (unit) {
          case 'd':
            time *= 24;
          case 'h':
            time *= 60;
          case 'm':
            time *= 60;
            break;
          default:
            time = NaN;
        }
      }
      if (isNaN(time)) {
        await message.reply({
          message: '<i>请输入正确的时间</i>',
        });
        return;
      }
      await group.muteMember(target, time);
      await message.reply({
        message: '<i>成功</i>',
      });
    }
    catch (e) {
      posthog.capture('禁言请求出错', { error: e });
      await message.reply({
        message: `<i>错误</i>\n${e.message}`,
      });
    }
  }

  public async rmt(message: Api.Message, pair: Pair) {
    if (!message.replyToMsgId) {
      const reply = await message.reply({
        message: '<i>请回复一条消息</i>',
      });
      setTimeout(() => {
        reply.delete({ revoke: true });
        message.delete({ revoke: true });
      }, 5000);
      return;
    }
    await db.message.updateMany({
      where: {
        tgChatId: pair.tgId,
        tgMsgId: message.replyToMsgId,
      },
      data: {
        ignoreDelete: true,
      },
    });
    await message.delete({ revoke: true });
    await pair.tg.deleteMessages([message.replyToMsgId]);
  }

  public async rmq(message: Api.Message, pair: Pair) {
    if (!message.replyToMsgId) {
      const reply = await message.reply({
        message: '<i>请回复一条消息</i>',
      });
      setTimeout(() => {
        reply.delete({ revoke: true });
        message.delete({ revoke: true });
      }, 5000);
      return;
    }
    const dbEntry = await db.message.findFirst({
      where: {
        tgChatId: pair.tgId,
        tgMsgId: message.replyToMsgId,
      },
    });
    await db.message.update({
      where: {
        id: dbEntry.id,
      },
      data: {
        ignoreDelete: true,
      },
    });
    await message.delete({ revoke: true });
    await pair.qq.recallMsg(dbEntry.seq, Number(dbEntry.rand), pair.qq.dm ? dbEntry.time : dbEntry.pktnum);
  }
}
