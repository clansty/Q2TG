import Telegram from '../client/Telegram';
import {
  Forwardable,
  Group,
  GroupMessageEvent,
  MessageElem, MessageRet,
  MiraiElem,
  PrivateMessageEvent,
  PttElem,
  Quotable,
  segment,
  Sendable,
} from 'icqq';
import { fetchFile, getBigFaceUrl, getImageUrlByMd5 } from '../utils/urls';
import { ButtonLike, FileLike } from 'telegram/define';
import { getLogger, Logger } from 'log4js';
import path from 'path';
import exts from '../constants/exts';
import helper from '../helpers/forwardHelper';
import db from '../models/db';
import { Button } from 'telegram/tl/custom/button';
import { SendMessageParams } from 'telegram/client/messages';
import { Api } from 'telegram';
import { file as createTempFile, FileResult } from 'tmp-promise';
import fsP from 'fs/promises';
import eviltransform from 'eviltransform';
import silk from '../encoding/silk';
import axios from 'axios';
import { md5Hex } from '../utils/hashing';
import Instance from '../models/Instance';
import { Pair } from '../models/Pair';
import OicqClient from '../client/OicqClient';
import lottie from '../constants/lottie';
import _ from 'lodash';
import emoji from '../constants/emoji';
import convert from '../helpers/convert';
import { QQMessageSent } from '../types/definitions';
import ZincSearch from 'zincsearch-node';
import { speech as AipSpeechClient } from 'baidu-aip-sdk';
import random from '../utils/random';
import { escapeXml } from 'icqq/lib/common';
import Docker from 'dockerode';
import ReplyKeyboardHide = Api.ReplyKeyboardHide;
import env from '../models/env';
import { CustomFile } from 'telegram/client/uploads';
import flags from '../constants/flags';

const NOT_CHAINABLE_ELEMENTS = ['flash', 'record', 'video', 'location', 'share', 'json', 'xml', 'poke'];

// noinspection FallThroughInSwitchStatementJS
export default class ForwardService {
  private readonly log: Logger;
  private readonly zincSearch: ZincSearch;
  private readonly speechClient: AipSpeechClient;
  private readonly restartSignCallbackHandle?: Buffer;

  constructor(private readonly instance: Instance,
              private readonly tgBot: Telegram,
              private readonly oicq: OicqClient) {
    this.log = getLogger(`ForwardService - ${instance.id}`);
    if (env.ZINC_URL) {
      this.zincSearch = new ZincSearch({
        url: env.ZINC_URL,
        user: env.ZINC_USERNAME,
        password: env.ZINC_PASSWORD,
      });
    }
    if (env.BAIDU_APP_ID) {
      this.speechClient = new AipSpeechClient(
        env.BAIDU_APP_ID,
        env.BAIDU_API_KEY,
        env.BAIDU_SECRET_KEY,
      );
    }
    if (oicq.signDockerId) {
      const socket = new Docker({ socketPath: '/var/run/docker.sock' });
      const container = socket.getContainer(oicq.signDockerId);
      this.restartSignCallbackHandle = tgBot.registerCallback(async (event) => {
        const message = await event.edit({
          message: event.messageId,
          text: '正在重启签名服务...',
          buttons: new ReplyKeyboardHide({}),
        });
        await container.restart();
        await event.answer({
          message: '已发送重启指令',
        });
        await message.reply({
          message: '已发送重启指令\n你需要稍后重新发送一下消息',
        });
      });
    }
  }

  public async forwardFromQq(event: PrivateMessageEvent | GroupMessageEvent, pair: Pair) {
    try {
      const tempFiles: FileResult[] = [];
      let message = '',
        files: FileLike[] = [],
        buttons: ButtonLike[] = [],
        replyTo = 0,
        forceDocument = false;
      let messageHeader = '', sender = '';
      if (event.message_type === 'group') {
        // 产生头部，这和工作模式没有关系
        sender = event.sender.card || event.sender.nickname;
        if (event.anonymous) {
          sender = `[${sender}]${event.anonymous.name}`;
        }
        if ((pair.flags | this.instance.flags) & flags.COLOR_EMOJI_PREFIX) {
          messageHeader += emoji.color(event.sender.user_id);
        }
        messageHeader += `<b>${helper.htmlEscape(sender)}</b>: `;
      }
      const useSticker = (file: FileLike) => {
        files.push(file);
        if (event.message_type === 'group') {
          buttons.push(Button.inline(`${sender}:`));
          messageHeader = '';
        }
      };
      const useForward = async (resId: string) => {
        if (env.CRV_API) {
          try {
            const messages = await pair.qq.getForwardMsg(resId);
            message = helper.generateForwardBrief(messages);
            const hash = md5Hex(resId);
            buttons.push(Button.url('📃查看', `${env.CRV_API}/?hash=${hash}`));
            // 传到 Cloudflare
            axios.post(`${env.CRV_API}/add`, {
              auth: env.CRV_KEY,
              key: hash,
              data: messages,
            })
              .then(data => this.log.trace('上传消息记录到 Cloudflare', data.data))
              .catch(e => this.log.error('上传消息记录到 Cloudflare 失败', e));
          }
          catch (e) {
            message = '[<i>转发多条消息（无法获取）</i>]';
          }
        }
        else {
          message = '[<i>转发多条消息（未配置）</i>]';
        }
      };
      for (const elem of event.message) {
        let url: string;
        switch (elem.type) {
          case 'text': {
            // 判断微信文章
            const WECHAT_ARTICLE_REGEX = /https?:\/\/mp\.weixin\.qq\.com\/[0-9a-zA-Z\-_+=&?#\/]+/;
            if (WECHAT_ARTICLE_REGEX.test(elem.text)) {
              const instantViewUrl = new URL('https://t.me/iv');
              instantViewUrl.searchParams.set('url', WECHAT_ARTICLE_REGEX.exec(elem.text)[0]);
              instantViewUrl.searchParams.set('rhash', '45756f9b0bb3c6');
              message += `<a href="${instantViewUrl}">\u200e</a>`;
            }
            // 判断 tgs 表情
            let tgs = lottie.getTgsIndex(elem.text);
            if (tgs === -1) {
              message += helper.htmlEscape(elem.text);
            }
            else {
              useSticker(`assets/tgs/tgs${tgs}.tgs`);
            }
            break;
          }
          case 'at': {
            if (event.source?.user_id === elem.qq || event.source?.user_id === this.oicq.uin)
              break;
          }
          case 'face':
          case 'sface': {
            message += `[<i>${helper.htmlEscape(elem.text)}</i>]`;
            break;
          }
          case 'bface': {
            useSticker(await convert.webp(elem.file, () => fetchFile(getBigFaceUrl(elem.file))));
            break;
          }
          case 'video':
            // 先获取 URL，要传给下面
            url = await pair.qq.getVideoUrl(elem.fid, elem.md5);
          case 'image':
            if ('url' in elem)
              url = elem.url;
            try {
              if (elem.type === 'image' && elem.asface
                && !(elem.file as string).toLowerCase().endsWith('.gif')
                // 同时存在文字消息就不作为 sticker 发送
                && !event.message.some(it => it.type === 'text')
                // 防止在 TG 中一起发送多个 sticker 失败
                && event.message.filter(it => it.type === 'image').length === 1
              ) {
                useSticker(await convert.webp(elem.file as string, () => fetchFile(elem.url)));
              }
              else {
                const file = await helper.downloadToCustomFile(url, !(message || messageHeader));
                files.push(file);
                if (file instanceof CustomFile && elem.type === 'image' && file.size > 10 * 1024 * 1024) {
                  this.log.info('强制使用文件发送');
                  forceDocument = true;
                }
                buttons.push(Button.url(`${emoji.picture()} 查看原图`, url));
              }
            }
            catch (e) {
              this.log.error('下载媒体失败', e);
              // 下载失败让 Telegram 服务器下载
              files.push(url);
            }
            break;
          case 'flash': {
            message += `[<i>闪照<i>]\n${this.instance.workMode === 'group' ? '每人' : ''}只能查看一次`;
            const dbEntry = await db.flashPhoto.create({
              data: { photoMd5: (elem.file as string).substring(0, 32) },
            });
            buttons.push(Button.url('📸查看', `https://t.me/${this.tgBot.me.username}?start=flash-${dbEntry.id}`));
            break;
          }
          case 'file': {
            const extName = path.extname(elem.name);
            // 50M 以下文件下载转发
            if (elem.size < 1024 * 1024 * 50 || exts.images.includes(extName.toLowerCase())) {
              // 是图片
              let url = await pair.qq.getFileUrl(elem.fid);
              if (url.includes('?fname=')) {
                url = url.split('?fname=')[0];
                // Request path contains unescaped characters
              }
              this.log.info('正在发送媒体，长度', helper.hSize(elem.size));
              try {
                const file = await helper.downloadToCustomFile(url, !(message || messageHeader), elem.name);
                if (file instanceof CustomFile && file.size > 10 * 1024 * 1024) {
                  this.log.info('强制使用文件发送');
                  forceDocument = true;
                }
                files.push(file);
              }
              catch (e) {
                this.log.error('下载媒体失败', e);
                // 下载失败让 Telegram 服务器下载
                files.push(url);
              }
            }
            message = `文件: ${helper.htmlEscape(elem.name)}\n` +
              `大小: ${helper.hSize(elem.size)}`;
            const dbEntry = await db.file.create({
              data: { fileId: elem.fid, roomId: pair.qqRoomId, info: message },
            });
            buttons.push(Button.url('📎获取下载地址',
              `https://t.me/${this.tgBot.me.username}?start=file-${dbEntry.id}`));
            break;
          }
          case 'record': {
            const temp = await createTempFile({ postfix: '.ogg' });
            tempFiles.push(temp);
            url = elem.url;
            if (!url) {
              const refetchMessage = await this.oicq.getMsg(event.message_id);
              url = (refetchMessage.message.find(it => it.type === 'record') as PttElem).url;
            }
            await silk.decode(await fetchFile(url), temp.path);
            if (this.speechClient) {
              const pcmPath = await createTempFile({ postfix: '.pcm' });
              tempFiles.push(pcmPath);
              await silk.conventOggToPcm16000(temp.path, pcmPath.path);
              const pcm = await fsP.readFile(pcmPath.path);
              const recognize = await this.speechClient.recognize(pcm, 'pcm', 16000, {
                dev_pid: 1537,
                cuid: Math.random().toString(),
              });
              if (recognize.err_no) {
                message += '识别失败：' + recognize.err_msg;
              }
              else {
                message += recognize.result[0];
              }
            }
            files.push(temp.path);
            break;
          }
          case 'share': {
            message = helper.htmlEscape(elem.url);
            break;
          }
          case 'json': {
            const result = helper.processJson(elem.data);
            switch (result.type) {
              case 'text':
                message = helper.htmlEscape(result.text);
                break;
              case 'forward':
                await useForward(result.resId);
                break;
            }
            break;
          }
          case 'xml': {
            const result = helper.processXml(elem.data);
            switch (result.type) {
              case 'text':
                message = helper.htmlEscape(result.text);
                break;
              case 'image':
                try {
                  files.push(await helper.downloadToCustomFile(getImageUrlByMd5(result.md5)));
                }
                catch (e) {
                  this.log.error('下载媒体失败', e);
                  // 下载失败让 Telegram 服务器下载
                  files.push(getImageUrlByMd5(result.md5));
                }
                break;
              case 'forward':
                await useForward(result.resId);
                break;
            }
            break;
          }
          case 'rps':
          case 'dice':
            message = `[<i>${elem.type === 'rps' ? '猜拳' : '骰子'}</i>] ${elem.id}`;
            break;
          case 'poke':
            message = `[<i>戳一戳</i>] ${helper.htmlEscape(elem.text)}`;
            break;
          case 'location':
            message = `[<i>位置</i>] ${helper.htmlEscape(elem.name)}\n${helper.htmlEscape(elem.address)}`;
            break;
        }
      }
      message = message.trim();
      message = messageHeader + (message && messageHeader ? '\n' : '') + message;

      // 处理回复
      if (event.source) {
        try {
          const quote = await db.message.findFirst({
            where: {
              qqRoomId: pair.qqRoomId,
              seq: event.source.seq,
              // rand: event.source.rand,
              qqSenderId: event.source.user_id,
              instanceId: this.instance.id,
            },
          });
          if (quote) {
            replyTo = quote.tgMsgId;
          }
          else {
            message += '\n\n<i>*回复消息找不到</i>';
            this.log.error('回复消息找不到', {
              qqRoomId: pair.qqRoomId,
              seq: event.source.seq,
              rand: event.source.rand,
              qqSenderId: event.source.user_id,
              instanceId: this.instance.id,
            });
          }
        }
        catch (e) {
          this.log.error('查找回复消息失败', e);
          message += '\n\n<i>*查找回复消息失败</i>';
        }
      }

      if (this.instance.workMode === 'personal' && event.message_type === 'group' && event.atme && !replyTo) {
        message += `\n<b>@${this.instance.userMe.usernames?.length ?
          this.instance.userMe.usernames[0].username :
          this.instance.userMe.username}</b>`;
      }

      // 发送消息
      const messageToSend: SendMessageParams = {
        forceDocument: forceDocument as any, // 恼
      };
      message && (messageToSend.message = message);
      if (files.length === 1) {
        messageToSend.file = files[0];
      }
      else if (files.length) {
        messageToSend.file = files;
      }
      buttons.length && (messageToSend.buttons = _.chunk(buttons, 3));
      replyTo && (messageToSend.replyTo = replyTo);

      const tgMessage = await pair.tg.sendMessage(messageToSend);

      if (this.instance.workMode === 'personal' && event.message_type === 'group' && event.atall) {
        await tgMessage.pin({ notify: false });
      }

      tempFiles.forEach(it => it.cleanup());
      return tgMessage;
    }
    catch (e) {
      this.log.error('从 QQ 到 TG 的消息转发失败', e);
      try {
        this.instance.workMode === 'personal' && await pair.tg.sendMessage('<i>有一条来自 QQ 的消息转发失败</i>');
      }
      catch {
      }
      return null;
    }
  }

  public async forwardFromTelegram(message: Api.Message, pair: Pair): Promise<Array<QQMessageSent>> {
    try {
      const tempFiles: FileResult[] = [];
      let chain: Sendable = [];
      const senderId = Number(message.senderId || message.sender?.id);
      // 这条消息在 tg 中被回复的时候显示的
      let brief = '', isSpoilerPhoto = false;
      let messageHeader = helper.getUserDisplayName(message.sender) +
        (message.forward ? ' 转发自 ' +
          // 要是隐私设置了，应该会有这个，然后下面两个都获取不到
          (message.fwdFrom?.fromName ||
            helper.getUserDisplayName(await message.forward.getChat() || await message.forward.getSender())) :
          '') +
        ': \n';
      if ((pair.flags | this.instance.flags) & flags.COLOR_EMOJI_PREFIX) {
        messageHeader = emoji.color(message.senderId.toJSNumber()) + messageHeader;
      }
      if (message.photo instanceof Api.Photo ||
        // stickers 和以文件发送的图片都是这个
        message.document?.mimeType?.startsWith('image/')) {
        if ('spoiler' in message.media && message.media.spoiler) {
          isSpoilerPhoto = true;
          const msgList: Forwardable[] = [{
            user_id: this.oicq.uin,
            nickname: messageHeader.substring(0, messageHeader.length - 3),
            message: {
              type: 'image',
              file: await message.downloadMedia({}),
              asface: !!message.sticker,
            },
          }];
          if (message.message) {
            msgList.push({
              user_id: this.oicq.uin,
              nickname: messageHeader.substring(0, messageHeader.length - 3),
              message: message.message,
            });
          }
          const fake = await this.oicq.makeForwardMsgSelf(msgList);
          chain.push({
            type: 'xml',
            id: 60,
            data: `<?xml version="1.0" encoding="utf-8"?>` +
              `<msg serviceID="35" templateID="1" action="viewMultiMsg" brief="[Spoiler 图片]"
 m_resid="${fake.resid}" m_fileName="${random.fakeUuid().toUpperCase()}" tSum="${fake.tSum}"
 sourceMsgId="0" url="" flag="3" adverSign="0" multiMsgFlag="0"><item layout="1"
 advertiser_id="0" aid="0"><title size="34" maxLines="2" lineSpace="12"
>${escapeXml(messageHeader.substring(0, messageHeader.length - 2))}</title
><title size="26" color="#777777" maxLines="2" lineSpace="12">Spoiler 图片</title
>${message.message ? `<title color="#303133" size="26">${escapeXml(message.message)}</title>` : ''
              }<hr hidden="false" style="0" /><summary size="26" color="#777777">请谨慎查看</summary
></item><source name="Q2TG" icon="" action="" appid="-1" /></msg>`.replaceAll('\n', ''),
          });
          brief += '[Spoiler 图片]';
        }
        else {
          chain.push({
            type: 'image',
            file: await message.downloadMedia({}),
            asface: !!message.sticker,
          });
          brief += '[图片]';
        }
      }
      else if (message.video || message.videoNote || message.gif) {
        const file = message.video || message.videoNote || message.gif;
        if (file.size.gt(200 * 1024 * 1024)) {
          chain.push('[视频大于 200MB]');
        }
        else if (file.mimeType === 'video/webm' || message.gif) {
          // 把 webm 转换成 gif
          const convertedPath = await convert.webm2gif(message.document.id.toString(16), () => message.downloadMedia({}));
          chain.push({
            type: 'image',
            file: convertedPath,
            asface: true,
          });
        }
        else {
          const temp = await createTempFile();
          tempFiles.push(temp);
          await fsP.writeFile(temp.path, await message.downloadMedia({}));
          chain.push(segment.video(temp.path));
        }
        brief += '[视频]';
      }
      else if (message.sticker) {
        // 一定是 tgs
        const gifPath = await convert.tgs2gif(message.sticker.id.toString(16), () => message.downloadMedia({}));
        chain.push({
          type: 'image',
          file: gifPath,
          asface: true,
        });
        brief += '[贴纸]';
      }
      else if (message.voice) {
        const temp = await createTempFile();
        tempFiles.push(temp);
        await fsP.writeFile(temp.path, await message.downloadMedia({}));
        const bufSilk = await silk.encode(temp.path);
        chain.push(segment.record(bufSilk));
        if (this.speechClient) {
          const pcmPath = await createTempFile({ postfix: '.pcm' });
          tempFiles.push(pcmPath);
          await silk.conventOggToPcm16000(temp.path, pcmPath.path);
          const pcm = await fsP.readFile(pcmPath.path);
          const recognize = await this.speechClient.recognize(pcm, 'pcm', 16000, {
            dev_pid: 1537,
            cuid: Math.random().toString(),
          });
          if (recognize.err_no) {
            chain.push('识别失败：' + recognize.err_msg);
          }
          else {
            chain.push('[语音] ', recognize.result[0]);
          }
        }
        brief += '[语音]';
      }
      else if (message.poll) {
        const poll = message.poll.poll;
        chain.push(`${poll.multipleChoice ? '多' : '单'}选投票：\n${poll.question}`);
        chain.push(...poll.answers.map(answer => `\n - ${answer.text}`));
        brief += '[投票]';
      }
      else if (message.contact) {
        const contact = message.contact;
        chain.push(`名片：\n` +
          contact.firstName + (contact.lastName ? ' ' + contact.lastName : '') +
          (contact.phoneNumber ? `\n电话：${contact.phoneNumber}` : ''));
        brief += '[名片]';
      }
      else if (message.venue && message.venue.geo instanceof Api.GeoPoint) {
        // 地标
        const geo: { lat: number, lng: number } = eviltransform.wgs2gcj(message.venue.geo.lat, message.venue.geo.long);
        chain.push(segment.location(geo.lat, geo.lng, `${message.venue.title} (${message.venue.address})`));
        brief += `[位置：${message.venue.title}]`;
      }
      else if (message.geo instanceof Api.GeoPoint) {
        // 普通的位置，没有名字
        const geo: { lat: number, lng: number } = eviltransform.wgs2gcj(message.geo.lat, message.geo.long);
        chain.push(segment.location(geo.lat, geo.lng, '选中的位置'));
        brief += '[位置]';
      }
      else if (message.media instanceof Api.MessageMediaDocument && message.media.document instanceof Api.Document) {
        const file = message.media.document;
        const fileNameAttribute =
          file.attributes.find(attribute => attribute instanceof Api.DocumentAttributeFilename) as Api.DocumentAttributeFilename;
        chain.push(`文件：${fileNameAttribute ? fileNameAttribute.fileName : ''}\n` +
          `类型：${file.mimeType}\n` +
          `大小：${file.size}`);
        if (file.size.leq(50 * 1024 * 1024)) {
          chain.push('\n文件正在上传中…');
          if (pair.qq instanceof Group) {
            pair.qq.fs.upload(await message.downloadMedia({}), '/',
              fileNameAttribute ? fileNameAttribute.fileName : 'file')
              .catch(err => pair.qq.sendMsg(`上传失败：\n${err.message}`));
          }
          else {
            pair.qq.sendFile(await message.downloadMedia({}),
              fileNameAttribute ? fileNameAttribute.fileName : 'file')
              .catch(err => pair.qq.sendMsg(`上传失败：\n${err.message}`));
          }
        }
        brief += '[文件]';
        if (env.DISABLE_FILE_UPLOAD_TIP) {
          chain = [];
        }
      }

      if (message.message && !isSpoilerPhoto) {
        const emojiEntities = (message.entities || []).filter(it => it instanceof Api.MessageEntityCustomEmoji) as Api.MessageEntityCustomEmoji[];
        if (emojiEntities.length) {
          const isMessageAllEmojis = _.sum(emojiEntities.map(it => it.length)) === message.message.length;
          const newChain = [] as (string | MessageElem)[];
          let messageLeft = message.message;
          for (let i = emojiEntities.length - 1; i >= 0; i--) {
            newChain.unshift(messageLeft.substring(emojiEntities[i].offset + emojiEntities[i].length));
            messageLeft = messageLeft.substring(0, emojiEntities[i].offset);
            newChain.unshift({
              type: 'image',
              file: await convert.customEmoji(emojiEntities[i].documentId.toString(16),
                () => this.tgBot.getCustomEmoji(emojiEntities[i].documentId),
                !isMessageAllEmojis),
              asface: true,
            });
          }
          chain.push(messageLeft, ...newChain);
          brief += message.message;
        }
        // Q2TG Bot 转发的消息目前不会包含 custom emoji
        else if (message.forward?.senderId?.eq?.(this.tgBot.me.id) && /^.*: ?$/.test(message.message.split('\n')[0])) {
          // 复读了某一条来自 QQ 的消息 (Repeat as forward)
          const originalMessage = message.message.includes('\n') ?
            message.message.substring(message.message.indexOf('\n') + 1) : '';
          chain.push(originalMessage);
          brief += originalMessage;

          messageHeader = helper.getUserDisplayName(message.sender) + ' 转发自 ' +
            message.message.substring(0, message.message.indexOf(':')) + ': \n';
        }
        else {
          chain.push(message.message);
          brief += message.message;
        }
      }

      // 处理回复
      let source: Quotable;
      if (message.replyToMsgId) {
        try {
          const quote = await db.message.findFirst({
            where: {
              tgChatId: Number(pair.tg.id),
              tgMsgId: message.replyToMsgId,
              instanceId: this.instance.id,
            },
          });
          if (quote) {
            source = {
              message: quote.brief || ' ',
              seq: quote.seq,
              rand: Number(quote.rand),
              user_id: Number(quote.qqSenderId),
              time: quote.time,
            };
          }
          else {
            source = {
              message: '回复消息找不到',
              seq: 1,
              time: Math.floor(new Date().getTime() / 1000),
              rand: 1,
              user_id: this.oicq.uin,
            };
          }
        }
        catch (e) {
          this.log.error('查找回复消息失败', e);
          source = {
            message: '查找回复消息失败',
            seq: 1,
            time: Math.floor(new Date().getTime() / 1000),
            rand: 1,
            user_id: this.oicq.uin,
          };
        }
      }

      // 防止发送空白消息
      if (chain.length === 0) {
        return [];
      }

      const notChainableElements = chain.filter(element => typeof element === 'object' && NOT_CHAINABLE_ELEMENTS.includes(element.type));
      const chainableElements = chain.filter(element => typeof element !== 'object' || !NOT_CHAINABLE_ELEMENTS.includes(element.type));

      // MapInstance
      if (!notChainableElements.length // notChainableElements 无法附加 mirai 信息，要防止被来回转发
        && chainableElements.length
        && this.instance.workMode
        && pair.instanceMapForTg[senderId]
      ) {
        try {
          const messageSent = await pair.instanceMapForTg[senderId].sendMsg([
            ...chainableElements,
            {
              type: 'mirai',
              data: JSON.stringify({
                id: senderId,
                eqq: { type: 'tg', tgUid: senderId, noSplitSender: true, version: 2 },
                q2tgSkip: true,
              }, undefined, 0),
            },
          ], source);
          tempFiles.forEach(it => it.cleanup());
          return [{
            ...messageSent,
            senderId: pair.instanceMapForTg[senderId].client.uin,
            brief,
          }];
        }
        catch (e) {
          this.log.error('使用 MapInstance 发送消息失败', e);
        }
      }

      if (this.instance.workMode === 'group' && !isSpoilerPhoto) {
        chainableElements.unshift(messageHeader);
      }
      const qqMessages = [] as Array<QQMessageSent>;
      if (chainableElements.length) {
        chainableElements.push({
          type: 'mirai',
          data: JSON.stringify({
            id: senderId,
            eqq: { type: 'tg', tgUid: senderId, noSplitSender: this.instance.workMode === 'personal', version: 2 },
          }, undefined, 0),
        });
        qqMessages.push({
          ...await pair.qq.sendMsg(chainableElements, source),
          brief,
          senderId: this.oicq.uin,
        });
      }
      if (notChainableElements.length) {
        for (const notChainableElement of notChainableElements) {
          qqMessages.push({
            ...await pair.qq.sendMsg(notChainableElement, source),
            brief,
            senderId: this.oicq.uin,
          });
        }
      }
      tempFiles.forEach(it => it.cleanup());
      return qqMessages;
    }
    catch (e) {
      this.log.error('从 TG 到 QQ 的消息转发失败', e);
      try {
        await message.reply({
          message: `<i>转发失败：${e.message}</i>`,
          buttons: (e.message === '签名api异常' && this.restartSignCallbackHandle) ?
            Button.inline('重启签名服务', this.restartSignCallbackHandle) :
            undefined,
        });
      }
      catch {
      }
    }
  }

  public async addToZinc(pairId: number, tgMsgId: number, data: {
    text: string,
    nick: string,
  }) {
    if (!this.zincSearch) return;
    const existsReq = await fetch(env.ZINC_URL + `/api/index/q2tg-${pairId}`, {
      method: 'HEAD',
      headers: {
        Authorization: 'Basic ' + Buffer.from(env.ZINC_USERNAME + ':' + env.ZINC_PASSWORD).toString('base64'),
      },
    });
    if (existsReq.status === 404) {
      await this.zincSearch.indices.create({
        name: `q2tg-${pairId}`,
        mappings: {
          properties: {
            nick: {
              type: 'text',
              index: true,
              store: false,
              aggregatable: false,
              highlightable: true,
              analyzer: 'gse_search',
              search_analyzer: 'gse_standard',
            },
            text: {
              type: 'text',
              index: true,
              store: false,
              aggregatable: false,
              highlightable: true,
              analyzer: 'gse_search',
              search_analyzer: 'gse_standard',
            },
          },
        },
      });
    }
    await this.zincSearch.document.createOrUpdate({
      id: tgMsgId.toString(),
      index: `q2tg-${pairId}`,
      document: data,
    });
  }
}
