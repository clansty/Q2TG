import Instance from '../models/Instance';
import Telegram from '../client/Telegram';
import OicqClient from '../client/OicqClient';
import { getLogger, Logger } from 'log4js';
import { Group, GroupMessageEvent, PrivateMessageEvent } from '@icqqjs/icqq';
import { Api } from 'telegram';
import quotly from 'quote-api/methods/generate.js';
import { CustomFile } from 'telegram/client/uploads';
import db from '../models/db';
import { Message } from '@prisma/client';
import BigInteger from 'big-integer';
import { getAvatarUrl } from '../utils/urls';
import convert from '../helpers/convert';
import { Pair } from '../models/Pair';
import env from '../models/env';
import flags from '../constants/flags';

export default class {
  private readonly log: Logger;

  constructor(private readonly instance: Instance,
              private readonly tgBot: Telegram,
              private readonly oicq: OicqClient) {
    this.log = getLogger(`QuotLyController - ${instance.id}`);
    oicq.addNewMessageEventHandler(this.onQqMessage);
    tgBot.addNewMessageEventHandler(this.onTelegramMessage);
  }

  private onQqMessage = async (event: PrivateMessageEvent | GroupMessageEvent) => {
    if (this.instance.workMode === 'personal') return;
    if (event.message_type !== 'group') return;
    const pair = this.instance.forwardPairs.find(event.group);
    if (!pair) return;
    const chain = [...event.message];
    while (chain.length && chain[0].type !== 'text') {
      chain.shift();
    }
    const firstElem = chain[0];
    if (firstElem?.type !== 'text') return;
    if (firstElem.text.trim() !== '/q') return;
    if (!event.source) {
      await event.reply('请回复一条消息', true);
      return true;
    }
    const sourceMessage = await db.message.findFirst({
      where: {
        instanceId: this.instance.id,
        qqRoomId: pair.qqRoomId,
        qqSenderId: event.source.user_id,
        seq: event.source.seq,
        // rand: event.source.rand,
      },
    });
    if (!sourceMessage) {
      await event.reply('无法从数据库找到原消息', true);
      this.log.error('找不到 sourceMessage');
      return true;
    }
    if (!((pair.flags | this.instance.flags) & flags.NO_QUOTE_PIN)) {
      this.pinMessageOnBothSide(pair, sourceMessage).then();
    }
    // 异步发送，为了让 /q 先到达
    this.sendQuote(pair, sourceMessage).catch(async e => {
      this.log.error(e);
      await event.reply(e.toString(), true);
    });
  };

  private onTelegramMessage = async (message: Api.Message) => {
    if (message.message !== '/q') return;
    const pair = this.instance.forwardPairs.find(message.chat);
    if (!pair) return;
    if (!message.replyTo) {
      await message.reply({
        message: '请回复一条消息',
      });
      return true;
    }
    const sourceMessage = await db.message.findFirst({
      where: {
        instanceId: this.instance.id,
        tgChatId: pair.tgId,
        tgMsgId: message.replyToMsgId,
      },
    });
    if (!sourceMessage) {
      await message.reply({
        message: '无法从数据库找到原消息',
      });
      this.log.error('找不到 sourceMessage');
      return true;
    }
    if (!((pair.flags | this.instance.flags) & flags.NO_QUOTE_PIN)) {
      this.pinMessageOnBothSide(pair, sourceMessage).then();
    }
    // 异步发送，为了让 /q 先到达
    this.sendQuote(pair, sourceMessage).catch(async e => {
      this.log.error(e);
      await message.reply({
        message: e.toString(),
      });
    });

    // 个人模式下，/q 这条消息不转发到 QQ，怪话图只有自己可见
    if (this.instance.workMode === 'personal') return true;
  };

  private async pinMessageOnBothSide(pair: Pair, sourceMessage: Awaited<ReturnType<typeof db.message.findFirst>>) {
    if (pair.qq instanceof Group) {
      try {
        await pair.qq.addEssence(sourceMessage.seq, Number(sourceMessage.rand));
      }
      catch (e) {
        this.log.warn('无法添加精华消息，群：', pair.qqRoomId, e);
      }
    }
    try {
      const tgMessage = await pair.tg.getMessage({ ids: sourceMessage.tgMsgId });
      await tgMessage.pin({ notify: false, pmOneSide: false });
    }
    catch (e) {
      this.log.warn('无法置顶消息，群：', pair.tgId, '消息 ID：', sourceMessage.tgMsgId, e);
    }
  }

  private async genQuote(message: Message) {
    const GROUP_ANONYMOUS_BOT = 1087968824n;

    const backgroundColor = '#292232';
    const emojiBrand = 'apple';
    const width = 512;
    const height = 512 * 1.5;
    const scale = 2;
    const type = 'quote';
    const format = 'png';

    const originTgMessages = await this.tgBot.getMessage(BigInteger(message.tgChatId), {
      ids: message.tgMsgId,
    });
    if (!originTgMessages.length) {
      throw new Error('无法获取 Tg 原消息');
    }
    const originTgMessage = originTgMessages[0];

    // https://github.com/LyoSU/quote-api/blob/6e27746bb3e946205cb60607a85239747b4640ef/utils/quote-generate.js#L150
    // 不太能用 buffer
    type Media = { url: string /* | Buffer*/ };
    type MessageFrom = {
      id: number,
      name: string | false,
      title: string,
      username?: string,
      first_name?: string,
      last_name?: string,
      photo?: Media,
    };
    let messageFrom: MessageFrom;
    let quoteMessage: {
      entities?: any[]
      media?: Media[] | Media
      mediaType?: 'sticker'
      voice?: { waveform?: any }
      chatId: number
      avatar: boolean
      from: MessageFrom
      text?: string
    } = {
      chatId: Number(message.tgChatId),
      avatar: true,
      from: null, // to be added
      text: message.tgMessageText,
    };

    if (this.tgBot.me.id.eq(message.tgSenderId)) {
      // From QQ
      messageFrom = {
        id: Number(message.qqSenderId),
        name: message.nick,
        title: message.nick,
        photo: { url: getAvatarUrl(message.qqSenderId) },
      };
      if (message.qqRoomId > 0 || message.richHeaderUsed) {
        quoteMessage.text = message.tgMessageText;
      }
      else if (message.tgMessageText.includes('\n')) {
        quoteMessage.text = message.tgMessageText.substring(message.tgMessageText.indexOf('\n')).trim();
      }
      else {
        quoteMessage.text = null;
      }
    }
    else if (message.tgSenderId === GROUP_ANONYMOUS_BOT || message.tgSenderId === 777000n) {
      const chat = originTgMessage.chat as Api.Channel;
      let photo: string;
      if (chat.photo instanceof Api.ChatPhoto) {
        photo = await convert.cachedBuffer(`${chat.photo.photoId.toString(16)}.jpg`, () => this.tgBot.downloadEntityPhoto(chat));
      }
      messageFrom = {
        id: Number(chat.id.toString()),
        name: chat.title,
        title: chat.title,
        username: chat.username || null,
        photo: photo ? { url: photo } : null,
      };
      quoteMessage.entities = originTgMessage.entities;
    }
    else {
      const sender = originTgMessage.sender as Api.User;
      let photo: string;
      if (sender.photo instanceof Api.UserProfilePhoto) {
        photo = await convert.cachedBuffer(`${sender.photo.photoId.toString(16)}.jpg`, () => this.tgBot.downloadEntityPhoto(sender));
      }
      messageFrom = {
        id: sender.color || Number(message.tgSenderId),
        name: message.nick,
        title: message.nick,
        username: sender.username,
        first_name: sender.firstName,
        last_name: sender.lastName,
        photo: photo ? { url: photo } : null,
      };
      if (originTgMessage.entities)
        quoteMessage.entities = await Promise.all(originTgMessage.entities?.map?.(async it => {
          let type = '';
          let emoji = '';
          switch (it.className) {
            case 'MessageEntityBold':
              type = 'bold';
              break;
            case 'MessageEntityItalic':
              type = 'italic';
              break;
            case 'MessageEntityStrike':
              type = 'strikethrough';
              break;
            case 'MessageEntityUnderline':
              type = 'underline';
              break;
            case 'MessageEntitySpoiler':
              type = 'spoiler';
              break;
            case 'MessageEntityCode':
            case 'MessageEntityPre':
              type = 'code';
              break;
            case 'MessageEntityMention':
            case 'MessageEntityMentionName':
            case 'InputMessageEntityMentionName':
            case 'MessageEntityHashtag':
            case 'MessageEntityEmail':
            case 'MessageEntityPhone':
            case 'MessageEntityBotCommand':
            case 'MessageEntityUrl':
            case 'MessageEntityTextUrl':
              type = 'mention';
              break;
            case 'MessageEntityCustomEmoji':
              type = 'custom_emoji';
              emoji = await convert.customEmoji(it.documentId.toString(16),
                () => this.tgBot.getCustomEmoji(it.documentId),
                false);
              break;
          }
          return {
            type, emoji,
            offset: it.offset,
            length: it.length,
          };
        }));
    }

    if (originTgMessage.voice) {
      const attribute = originTgMessage.voice.attributes.find(it => it instanceof Api.DocumentAttributeAudio) as Api.DocumentAttributeAudio;
      quoteMessage.voice = { waveform: attribute.waveform };
    }
    else if (originTgMessage.photo instanceof Api.Photo || originTgMessage.document?.mimeType?.startsWith('image/')) {
      if (originTgMessage.document?.mimeType === 'image/webp') {
        quoteMessage.media = { url: await convert.cachedBuffer(`${originTgMessage.document.id.toString(16)}.webp`, () => originTgMessage.downloadMedia({})) };
      }
      else {
        quoteMessage.media = { url: await convert.cachedBuffer(`${originTgMessage.photo.id.toString(16)}.jpg`, () => originTgMessage.downloadMedia({})) };
      }
    }
    else if (originTgMessage.video || originTgMessage.videoNote || originTgMessage.gif) {
      const file = originTgMessage.video || originTgMessage.videoNote || originTgMessage.gif;
      quoteMessage.media = { url: await convert.cachedBuffer(`${file.id.toString(16)}-thumb.webp`, () => this.tgBot.downloadThumb(file)) };
    }
    else if (originTgMessage.sticker) {
      quoteMessage.media = { url: await convert.cachedBuffer(`${originTgMessage.document.id.toString(16)}.tgs`, () => originTgMessage.downloadMedia({})) };
    }
    if (originTgMessage.sticker) {
      quoteMessage.mediaType = 'sticker';
    }

    quoteMessage.from = messageFrom;
    if (!quoteMessage.text && !quoteMessage.media && !quoteMessage.voice) {
      throw new Error('不支持的消息类型');
    }
    const res = await quotly({
      botToken: env.TG_BOT_TOKEN,
      type,
      format,
      backgroundColor,
      width,
      height,
      scale,
      messages: [quoteMessage],
      emojiBrand,
    });
    return Buffer.from(res.image, 'base64');
  }

  private async sendQuote(pair: Pair, message: Message) {
    const image = await this.genQuote(message);

    const tgMessage = await pair.tg.sendMessage({
      file: new CustomFile('quote.webp', image.length, undefined, image),
    });

    if (this.instance.workMode === 'personal') return;

    const qqMessage = await pair.qq.sendMsg({
      type: 'image',
      file: image,
      asface: true,
    });
    await db.message.create({
      data: {
        qqRoomId: pair.qqRoomId,
        qqSenderId: this.oicq.uin,
        time: qqMessage.time,
        brief: '[Quote]',
        seq: qqMessage.seq,
        rand: qqMessage.rand,
        pktnum: 1,
        tgChatId: pair.tgId,
        tgMsgId: tgMessage.id,
        instanceId: this.instance.id,
        tgMessageText: tgMessage.message,
        nick: '系统',
        tgSenderId: BigInt(this.tgBot.me.id.toString()),
      },
    });
  }
}
