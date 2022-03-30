import { getLogger, Logger } from 'log4js';
import Instance from '../models/Instance';
import Telegram from '../client/Telegram';
import OicqClient from '../client/OicqClient';
import { Api } from 'telegram';
import getAboutText from '../utils/getAboutText';
import { Pair } from '../models/Pair';
import { CustomFile } from 'telegram/client/uploads';
import { getAvatar } from '../utils/urls';
import db from '../models/db';
import { Friend } from 'oicq';
import { format } from 'date-and-time';

export default class InChatCommandsService {
  private readonly log: Logger;

  constructor(private readonly instance: Instance,
              private readonly tgBot: Telegram,
              private readonly oicq: OicqClient) {
    this.log = getLogger(`InChatCommandsService - ${instance.id}`);
  }

  public async info(message: Api.Message, pair: Pair) {
    const replyMessageId = message.replyToMsgId;
    if (replyMessageId) {
      const messageInfo = await db.message.findFirst({
        where: {
          tgChatId: Number(message.chat.id),
          tgMsgId: replyMessageId,
        },
      });
      if (messageInfo) {
        let textToSend = '';
        if (pair.qq instanceof Friend) {
          if (Number(messageInfo.qqSenderId) === pair.qqRoomId) {
            textToSend += `<b>发送者：</b>${pair.qq.remark || pair.qq.nickname}(<code>${pair.qq.user_id}</code>)\n`;
          }
          else {
            textToSend += `<b>发送者：</b>${this.oicq.nickname}(<code>${this.oicq.uin}</code>)\n`;
          }
        }
        else {
          const sender = pair.qq.pickMember(Number(messageInfo.qqSenderId));
          await sender.renew();
          textToSend += `<b>发送者：</b>${sender.title ? `「<i>${sender.title}</i>」` : ''}` +
            `${sender.card || sender.info.nickname}(<code>${sender.user_id}</code>)\n`;
          if (sender.info.role !== 'member') {
            textToSend += `<b>职务：</b>${sender.info.role === 'owner' ? '群主' : '管理员'}\n`;
          }
        }
        textToSend += `<b>发送时间：</b>${format(new Date(messageInfo.time * 1000), 'YYYY-M-D hh:mm:ss')}`;
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
}
