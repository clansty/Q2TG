import Telegram from '../client/Telegram';
import OicqClient from '../client/OicqClient';
import { GroupMessageEvent, PrivateMessageEvent } from 'oicq';
import { Pair } from '../providers/forwardPairs';
import { fetchFile, getBigFaceUrl, getImageUrlByMd5 } from '../utils/urls';
import { FileLike, MarkupLike } from 'telegram/define';
import { CustomFile } from 'telegram/client/uploads';
import { getLogger } from 'log4js';
import path from 'path';
import exts from '../constants/exts';
import helper from '../helpers/forwardHelper';
import db from '../providers/db';
import { Button } from 'telegram/tl/custom/button';
import { SendMessageParams } from 'telegram/client/messages';

// noinspection FallThroughInSwitchStatementJS
export default class ForwardService {
  private log = getLogger('ForwardService');

  constructor(private readonly tgBot: Telegram,
              private readonly oicq: OicqClient) {
  }

  public async forwardFromQq(event: PrivateMessageEvent | GroupMessageEvent, pair: Pair) {
    try {
      let message = '', files: FileLike[] = [], button: MarkupLike, replyTo = 0;
      let messageHeader = '';
      if (event.message_type === 'group') {
        // 产生头部，这和工作模式没有关系
        const sender = event.sender.card || event.sender.nickname;
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
          case 'flash':
            // TODO 闪照单独处理
            if ('url' in elem)
              url = elem.url;
            try {
              files.push(await helper.downloadToCustomFile(url));
            }
            catch (e) {
              this.log.error('下载媒体失败', e);
              // 下载失败让 Telegram 服务器下载
              files.push(url);
            }
            break;
          case 'file': {
            const extName = path.extname(elem.name);
            if (exts.images.includes(extName.toLowerCase())) {
              // 是图片
              const url = await pair.qq.getFileUrl(elem.fid);
              try {
                files.push(await helper.downloadToCustomFile(url));
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
                data: { fileId: elem.fid, roomId: helper.getRoomId(pair.qq), info: message },
              });
              button = Button.url('⏬ 获取下载地址',
                `https://t.me/${this.tgBot.me.username}?start=file-${dbEntry.id}`);
            }
          }
          case 'record': {
            // TODO
            message = '[语音]';
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
                // TODO 详细展开
                message = '[转发多条消息]';
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
      message = helper.htmlEscape(message.trim());
      message = messageHeader + (message && messageHeader ? '\n' : '') + message;

      // 处理回复
      if (event.source) {
        try {
          const quote = await db.message.findFirst({
            where: {
              qqRoomId: helper.getRoomId(pair.qq),
              seq: event.source.seq,
              rand: event.source.rand,
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

      return await pair.tg.sendMessage(messageToSend);
    }
    catch (e) {
      this.log.error('从 QQ 到 TG 到消息转发失败', e);
    }
  }
}
