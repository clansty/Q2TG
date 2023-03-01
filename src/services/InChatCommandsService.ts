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
import { Friend, Group } from 'oicq';
import { format } from 'date-and-time';
import ZincSearch from 'zincsearch-node';

export default class InChatCommandsService {
  private readonly log: Logger;
  private readonly zincSearch: ZincSearch;

  constructor(private readonly instance: Instance,
              private readonly tgBot: Telegram,
              private readonly oicq: OicqClient) {
    this.log = getLogger(`InChatCommandsService - ${instance.id}`);
    if (process.env.ZINC_URL) {
      this.zincSearch = new ZincSearch({
        url: process.env.ZINC_URL,
        user: process.env.ZINC_USERNAME,
        password: process.env.ZINC_PASSWORD,
      });
    }
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

  public async poke(message: Api.Message, pair: Pair) {
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
      if (pair.qq instanceof Group && !target) {
        await message.reply({
          message: '<i>请回复一条消息</i>',
        });
      }
      else if (pair.qq instanceof Group) {
        await pair.qq.pokeMember(target);
      }
      else {
        await pair.qq.poke(target && target !== pair.qqRoomId);
      }
    }
    catch (e) {
      await message.reply({
        message: `<i>错误</i>\n${e.message}`,
      });
    }
  }

  public async search(keywords: string[], pair: Pair) {
    const queries = keywords.map((txt) => `text:${txt}`);
    const result = await this.zincSearch.search({
      index: `q2tg-${pair.dbId}`,
      query: { term: queries.join(' '), terms: [] },
      search_type: 'match',
      sort_fields: ['-_score'],
      max_results: 5,
    });
    if (!result.hits?.hits?.length) {
      return '没有结果';
    }
    const rpy = result.hits.hits.map((hit, index) => {
      const id = hit._id!;
      const link = `https://t.me/c/${pair.tgId}/${id}`;
      return `${index + 1}. ${link} score:${hit._score!.toFixed(3)}`;
    });
    return rpy.join('\n');
  }
}
