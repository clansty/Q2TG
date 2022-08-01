import Telegram from '../client/Telegram';
import { Group, GroupMessageEvent, PrivateMessageEvent, Quotable, segment, Sendable } from 'oicq';
import { fetchFile, getBigFaceUrl, getImageUrlByMd5 } from '../utils/urls';
import { FileLike, MarkupLike } from 'telegram/define';
import { CustomFile } from 'telegram/client/uploads';
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
import fs from 'fs';
import tgsToGif from '../encoding/tgsToGif';
import axios from 'axios';
import { md5Hex } from '../utils/hashing';
import Instance from '../models/Instance';
import { Pair } from '../models/Pair';
import sharp from 'sharp';
import convertWithFfmpeg from '../encoding/convertWithFfmpeg';
import OicqClient from '../client/OicqClient';
import lottie from '../constants/lottie';

const NOT_CHAINABLE_ELEMENTS = ['flash', 'record', 'video', 'location', 'share', 'json', 'xml', 'poke'];

// noinspection FallThroughInSwitchStatementJS
export default class ForwardService {
  private readonly log: Logger;

  constructor(private readonly instance: Instance,
              private readonly tgBot: Telegram,
              private readonly oicq: OicqClient) {
    this.log = getLogger(`ForwardService - ${instance.id}`);
  }

  public async forwardFromQq(event: PrivateMessageEvent | GroupMessageEvent, pair: Pair) {
    try {
      const tempFiles: FileResult[] = [];
      let message = '', files: FileLike[] = [], button: MarkupLike, replyTo = 0, tgs = -1;
      let messageHeader = '';
      if (event.message_type === 'group') {
        // 产生头部，这和工作模式没有关系
        let sender = event.sender.card || event.sender.nickname;
        if (event.anonymous) {
          sender = `[${sender}]${event.anonymous.name}`;
        }
        messageHeader = `<b>${helper.htmlEscape(sender)}</b>: `;
      }
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
            tgs = lottie.TGS_MAP.indexOf(elem.text);
            if (tgs === -1) {
              message += helper.htmlEscape(elem.text);
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
            const file = await fetchFile(getBigFaceUrl(elem.file));
            files.push(new CustomFile('face.png', file.length, '', file));
            break;
          }
          case 'video':
            // 先获取 URL，要传给下面
            url = await pair.qq.getVideoUrl(elem.fid, elem.md5);
          case 'image':
            if ('url' in elem)
              url = elem.url;
            try {
              files.push(await helper.downloadToCustomFile(url, !(message || messageHeader)));
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
            button = Button.url('📸查看', `https://t.me/${this.tgBot.me.username}?start=flash-${dbEntry.id}`);
            break;
          }
          case 'file': {
            const extName = path.extname(elem.name);
            if (exts.images.includes(extName.toLowerCase())) {
              // 是图片
              const url = await pair.qq.getFileUrl(elem.fid);
              try {
                files.push(await helper.downloadToCustomFile(url, !(message || messageHeader)));
              }
              catch (e) {
                this.log.error('下载媒体失败', e);
                // 下载失败让 Telegram 服务器下载
                files.push(url);
              }
            }
            else {
              message = `文件: ${helper.htmlEscape(elem.name)}\n` +
                `大小: ${helper.hSize(elem.size)}`;
              const dbEntry = await db.file.create({
                data: { fileId: elem.fid, roomId: pair.qqRoomId, info: message },
              });
              button = Button.url('📎获取下载地址',
                `https://t.me/${this.tgBot.me.username}?start=file-${dbEntry.id}`);
            }
            break;
          }
          case 'record': {
            const temp = await createTempFile({ postfix: '.ogg' });
            tempFiles.push(temp);
            await silk.decode(await fetchFile(elem.url), temp.path);
            files.push(temp.path);
            break;
          }
          case 'share': {
            message = helper.htmlEscape(elem.url);
            break;
          }
          case 'json': {
            message = helper.htmlEscape(helper.processJson(elem.data));
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
                try {
                  const messages = await pair.qq.getForwardMsg(result.resId);
                  message = helper.generateForwardBrief(messages);
                  const hash = md5Hex(result.resId);
                  button = Button.url('📃查看', `${process.env.CRV_API}/?hash=${hash}`);
                  // 传到 Cloudflare
                  axios.post(`${process.env.CRV_API}/add`, {
                    auth: process.env.CRV_KEY,
                    key: hash,
                    data: messages,
                  })
                    .then(data => this.log.trace('上传消息记录到 Cloudflare', data.data))
                    .catch(e => this.log.error('上传消息记录到 Cloudflare 失败', e));
                }
                catch (e) {
                  message = '[<i>转发多条消息（无法获取）</i>]';
                }
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
              rand: event.source.rand,
              instanceId: this.instance.id,
            },
          });
          if (quote) {
            replyTo = quote.tgMsgId;
          }
        }
        catch (e) {
          this.log.error('查找回复消息失败', e);
        }
      }

      if (this.instance.workMode === 'personal' && event.message_type === 'group' && event.atme && !replyTo) {
        message += `\n<b>@${this.instance.userMe.username}</b>`;
      }

      // 发送消息
      const messageToSend: SendMessageParams = {};
      message && (messageToSend.message = message);
      if (files.length === 1) {
        messageToSend.file = files[0];
      }
      else if (files.length) {
        messageToSend.file = files;
      }
      button && (messageToSend.buttons = button);
      replyTo && (messageToSend.replyTo = replyTo);

      const tgMessages: Api.Message[] = [];

      if (message || files.length || button) {
        tgMessages.push(await pair.tg.sendMessage(messageToSend));
      }
      if (tgs > -1) {
        tgMessages.push(await pair.tg.sendMessage({
          file: `assets/tgs/tgs${tgs}.tgs`,
        }));
      }

      if (this.instance.workMode === 'personal' && event.message_type === 'group' && event.atall) {
        await tgMessages[0].pin({ notify: false });
      }

      tempFiles.forEach(it => it.cleanup());
      return tgMessages;
    }
    catch (e) {
      this.log.error('从 QQ 到 TG 的消息转发失败', e);
      try {
        this.instance.workMode === 'personal' && await pair.tg.sendMessage('<i>有一条来自 QQ 的消息转发失败</i>');
      }
      catch {
      }
      return [];
    }
  }

  async forwardFromTelegram(message: Api.Message, pair: Pair) {
    try {
      const tempFiles: FileResult[] = [];
      const chain: Sendable = [];
      // 这条消息在 tg 中被回复的时候显示的
      let brief = '';
      this.instance.workMode === 'group' && chain.push(helper.getUserDisplayName(message.sender) +
        (message.forward ? ' 转发自 ' +
          // 要是隐私设置了，应该会有这个，然后下面两个都获取不到
          (message.fwdFrom?.fromName ||
            helper.getUserDisplayName(await message.forward.getChat() || await message.forward.getSender())) :
          '') +
        ': \n');
      if (message.photo instanceof Api.Photo ||
        // stickers 和以文件发送的图片都是这个
        message.document?.mimeType?.startsWith('image/')) {
        // 将 webp 转换为 png，防止 macOS 不识别
        if (message.document?.mimeType === 'image/webp') {
          const convertedPath = path.resolve(path.join('./data/cache/webp', message.document.id.toString(16) + '.png'));
          // 先从缓存中找
          if (!fs.existsSync(convertedPath)) {
            await fsP.mkdir('./data/cache/webp', { recursive: true });
            const webpData = await message.downloadMedia({});
            await sharp(webpData).png().toFile(convertedPath);
          }
          chain.push({
            type: 'image',
            file: convertedPath,
            asface: true,
          });
        }
        else {
          chain.push({
            type: 'image',
            file: await message.downloadMedia({}),
            asface: !!message.sticker,
          });
        }
        brief += '[图片]';
      }
      else if (message.video || message.videoNote || message.gif) {
        const file = message.video || message.videoNote || message.gif;
        if (file.size.gt(20 * 1024 * 1024)) {
          chain.push('[视频大于 20MB]');
        }
        else if (file.mimeType === 'video/webm') {
          // 把 webm 转换成 gif
          const convertedPath = path.resolve(path.join('./data/cache/webm', message.document.id.toString(16) + '.gif'));
          // 先从缓存中找
          if (!fs.existsSync(convertedPath)) {
            await fsP.mkdir('./data/cache/webm', { recursive: true });
            const temp = await createTempFile();
            tempFiles.push(temp);
            await fsP.writeFile(temp.path, await message.downloadMedia({}));
            await convertWithFfmpeg(temp.path, convertedPath, 'gif');
          }
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
        let gifPath: string;
        const tempTgsPath = path.resolve(path.join('./data/cache/tgs', message.sticker.id.toString(16)));
        // 先从缓存中找
        if (fs.existsSync(tempTgsPath + '.gif')) {
          gifPath = tempTgsPath + '.gif';
        }
        else {
          await fsP.mkdir('./data/cache/tgs', { recursive: true });
          await fsP.writeFile(tempTgsPath, await message.downloadMedia({}));
          await tgsToGif(tempTgsPath);
          await fsP.rm(tempTgsPath);
          gifPath = tempTgsPath + '.gif';
        }
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
        if (file.size.leq(20 * 1024 * 1024)) {
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
      }

      if (message.message) {
        chain.push(message.message);
        brief += message.message;
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
              rand: quote.rand,
              user_id: Number(quote.qqSenderId),
              time: quote.time,
            };
          }
        }
        catch (e) {
          this.log.error('查找回复消息失败', e);
        }
      }

      // 防止发送空白消息，也就是除了发送者啥都没有的消息
      if (this.instance.workMode === 'group' && chain.length === 1) {
        return [];
      }

      const notChainableElements = chain.filter(element => typeof element === 'object' && NOT_CHAINABLE_ELEMENTS.includes(element.type));
      const chainableElements = chain.filter(element => typeof element !== 'object' || !NOT_CHAINABLE_ELEMENTS.includes(element.type));
      const qqMessages = [];
      if (chainableElements.length) {
        qqMessages.push({
          ...await pair.qq.sendMsg(chainableElements, source),
          brief,
        });
      }
      if (notChainableElements.length) {
        for (const notChainableElement of notChainableElements) {
          qqMessages.push({
            ...await pair.qq.sendMsg(notChainableElement, source),
            brief,
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
          message: `<i>转发失败：${e.message}</i>\n${e}`,
        });
      }
      catch {
      }
    }
  }
}
