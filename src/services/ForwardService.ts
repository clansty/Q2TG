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

// noinspection FallThroughInSwitchStatementJS
export default class ForwardService {
  private readonly log: Logger;

  constructor(private readonly instance: Instance,
              private readonly tgBot: Telegram) {
    this.log = getLogger(`ForwardService - ${instance.id}`);
  }

  public async forwardFromQq(event: PrivateMessageEvent | GroupMessageEvent, pair: Pair) {
    try {
      const tempFiles: FileResult[] = [];
      let message = '', files: FileLike[] = [], button: MarkupLike, replyTo = 0, noEscape = false;
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
            message += elem.text;
            break;
          }
          case 'at': {
            if (event.source?.user_id === elem.qq)
              break;
          }
          case 'face':
          case 'sface': {
            message += `[${elem.text}]`;
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
            message += `[闪照]\n${this.instance.workMode === 'group' ? '每人' : ''}只能查看一次`;
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
              message = `文件: ${elem.name}\n` +
                `大小: ${helper.hSize(elem.size)}`;
              const dbEntry = await db.file.create({
                data: { fileId: elem.fid, roomId: pair.qqRoomId, info: message },
              });
              button = Button.url('⏬获取下载地址',
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
            message = elem.url;
            break;
          }
          case 'json': {
            message = helper.processJson(elem.data);
            break;
          }
          case 'xml': {
            const result = helper.processXml(elem.data);
            switch (result.type) {
              case 'text':
                message = result.text;
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
                  noEscape = true;
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
                  message = '[转发多条消息（无法获取）]';
                }
                break;
            }
            break;
          }
          case 'rps':
          case 'dice':
            message = `[${elem.type === 'rps' ? '猜拳' : '骰子'}] ${elem.id}`;
            break;
          case 'poke':
            message = `[戳一戳] ${elem.text}`;
            break;
          case 'location':
            message = `[位置] ${elem.name}\n${elem.address}`;
            break;
        }
      }
      !noEscape && (message = helper.htmlEscape(message.trim()));
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

      const messageSent = await pair.tg.sendMessage(messageToSend);
      tempFiles.forEach(it => it.cleanup());
      return messageSent;
    }
    catch (e) {
      this.log.error('从 QQ 到 TG 的消息转发失败', e);
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
          message.fwdFrom.fromName ||
          helper.getUserDisplayName(await message.forward.getChat() || await message.forward.getSender()) :
          '') +
        ': \n');
      if (message.photo instanceof Api.Photo ||
        // stickers 和以文件发送的图片都是这个
        message.document?.mimeType?.startsWith('image/')) {
        chain.push({
          type: 'image',
          file: await message.downloadMedia({}),
          asface: !!message.sticker,
        });
        brief += '[图片]';
      }
      else if (message.video || message.videoNote || message.gif) {
        const file = message.video || message.videoNote || message.gif;
        if (file.size > 20 * 1024 * 1024) {
          chain.push('[视频大于 20MB]');
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
        if (file.size <= 20 * 1024 * 1024 && pair.qq instanceof Group) {
          chain.push('\n文件正在上传中…');
          pair.qq.fs.upload(await message.downloadMedia({}), '/',
            fileNameAttribute ? fileNameAttribute.fileName : 'file')
            .catch(err => pair.qq.sendMsg(`上传失败：\n${err.message}`));
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

      const qqMessage = await pair.qq.sendMsg(chain, source);
      tempFiles.forEach(it => it.cleanup());
      return {
        ...qqMessage,
        brief,
      };
    }
    catch (e) {
      this.log.error('从 TG 到 QQ 的消息转发失败', e);
      await message.reply({
        message: `转发失败：${e.message}\n${e}`,
      });
    }
  }
}
