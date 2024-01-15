import Instance from '../models/Instance';
import Telegram from '../client/Telegram';
import OicqClient from '../client/OicqClient';
import { Pair } from '../models/Pair';
import { Api } from 'telegram';
import { GroupMessage, PrivateMessage } from 'icqq';
import db from '../models/db';
import { format } from 'date-and-time';
import lottie from '../constants/lottie';
import helper from './forwardHelper';
import convert from './convert';
import { fetchFile, getBigFaceUrl, getImageUrlByMd5 } from '../utils/urls';
import { getLogger, Logger } from 'log4js';
import path from 'path';
import exts from '../constants/exts';
import silk from '../encoding/silk';
import { md5Hex } from '../utils/hashing';
import axios from 'axios';
import { CustomFile } from 'telegram/client/uploads';
import fsP from 'fs/promises';
import { file } from 'tmp-promise';
import env from '../models/env';

export default class {
  private readonly log: Logger;

  constructor(private readonly instance: Instance,
              private readonly tgBot: Telegram,
              private readonly tgUser: Telegram,
              private readonly oicq: OicqClient,
              private readonly pair: Pair,
              private readonly requestMessage: Api.Message) {
    this.log = getLogger(`MessageRecoverSession - ${instance.id} ${pair.qqRoomId}`);
  }

  private statusMessage: Api.Message;
  private historyMessages = [] as (PrivateMessage | GroupMessage)[];
  private currentStatus = 'getMessage' as
    'getMessage' | 'getMedia' | 'uploadMessage' | 'uploadMedia' | 'finishing' | 'done';
  private importTxt = '';
  // id to path
  private filesMap = {} as { [p: string]: string };
  private mediaUploadedCount = 0;

  public async startRecover() {
    await this.updateStatusMessage();
    await this.getMessages();
    this.currentStatus = 'getMedia';
    await this.messagesToTxt();
    this.currentStatus = 'uploadMessage';
    await this.updateStatusMessage();
    await this.importMessagesAndMedia();
    this.currentStatus = 'done';
    await this.updateStatusMessage();
  }

  private async getMessages() {
    let timeOrSeq = undefined as number;
    while (true) {
      const messages = await this.pair.qq.getChatHistory(timeOrSeq);
      if (!messages.length) return;
      let messagesAllExist = true;
      timeOrSeq = messages[0] instanceof GroupMessage ? messages[0].seq : messages[0].time;
      for (let i = messages.length - 1; i >= 0; i--) {
        const where: {
          instanceId: number,
          qqSenderId: number,
          qqRoomId: number,
          seq: number,
          rand?: number
        } = {
          instanceId: this.instance.id,
          qqSenderId: messages[i].sender.user_id,
          qqRoomId: this.pair.qqRoomId,
          seq: messages[i].seq,
        };
        if (messages[i] instanceof PrivateMessage) {
          where.rand = messages[i].rand;
        }
        const dbMessage = await db.message.findFirst({ where });
        if (!dbMessage) {
          messagesAllExist = false;
          this.historyMessages.unshift(messages[i]);
        }
      }
      await this.updateStatusMessage();
      if (messagesAllExist) return;
    }
  }

  private async messagesToTxt() {
    let lastMediaCount = 0;
    for (const message of this.historyMessages) {
      let text = '';
      const useFile = (fileKey: string, filePath: string) => {
        if (!path.extname(fileKey)) fileKey += '.file';
        this.filesMap[fileKey] = filePath;
        this.importTxt += `${format(new Date(message.time * 1000), 'DD/MM/YYYY, HH:mm')} - ` +
          `${message.nickname}: ${fileKey} (file attached)\n`;
      };
      for (const elem of message.message) {
        let url: string;
        switch (elem.type) {
          case 'text': {
            let tgs = lottie.getTgsIndex(elem.text);
            if (tgs === -1) {
              text += elem.text;
            }
            else {
              useFile(`${tgs}.tgs`, `assets/tgs/tgs${tgs}.tgs`);
            }
            break;
          }
          case 'at':
          case 'face':
          case 'sface': {
            text += `[${elem.text}]`;
            break;
          }
          case 'bface': {
            const fileKey = md5Hex(elem.file) + '.webp';
            useFile(fileKey, await convert.webp(fileKey, () => fetchFile(getBigFaceUrl(elem.file))));
            break;
          }
          case 'video':
            // 先获取 URL，要传给下面
            url = await this.pair.qq.getVideoUrl(elem.fid, elem.md5);
          case 'image':
          case 'flash':
            if ('url' in elem)
              url = elem.url;
            try {
              if (elem.type === 'image' && elem.asface && !(elem.file as string).toLowerCase().endsWith('.gif')) {
                useFile(elem.file as string, await convert.webp(elem.file as string, () => fetchFile(elem.url)));
              }
              else {
                useFile(elem.file as string, await convert.cachedBuffer(elem.file as string, () => fetchFile(url)));
              }
            }
            catch (e) {
              this.log.error('下载媒体失败', e);
              // 下载失败让 Telegram 服务器下载
              text += ` ${url} `;
            }
            break;
          case 'file': {
            const extName = path.extname(elem.name);
            // 50M 以下文件下载转发
            if (elem.size < 1024 * 1024 * 50 || exts.images.includes(extName.toLowerCase())) {
              // 是图片
              let url = await this.pair.qq.getFileUrl(elem.fid);
              if (url.includes('?fname=')) {
                url = url.split('?fname=')[0];
                // Request path contains unescaped characters
              }
              this.log.info('正在下载媒体，长度', helper.hSize(elem.size));
              try {
                useFile(elem.name, await convert.cachedBuffer(elem.name, () => fetchFile(url)));
              }
              catch (e) {
                this.log.error('下载媒体失败', e);
                text += `文件: ${helper.htmlEscape(elem.name)}\n` +
                  `大小: ${helper.hSize(elem.size)}`;
              }
            }
            else {
              text += `文件: ${helper.htmlEscape(elem.name)}\n` +
                `大小: ${helper.hSize(elem.size)}`;
            }
            break;
          }
          case 'record': {
            useFile(elem.md5 + '.ogg', await convert.cached(elem.md5 + '.ogg',
              async (output) => await silk.decode(await fetchFile(elem.url), output)));
            break;
          }
          case 'share': {
            text += elem.url;
            break;
          }
          case 'json': {
            text += helper.processJson(elem.data);
            break;
          }
          case 'xml': {
            const result = helper.processXml(elem.data);
            switch (result.type) {
              case 'text':
                text += helper.htmlEscape(result.text);
                break;
              case 'image':
                try {
                  useFile(result.md5, await convert.cachedBuffer(result.md5, () => fetchFile(getImageUrlByMd5(result.md5))));
                }
                catch (e) {
                  this.log.error('下载媒体失败', e);
                  text += ` ${getImageUrlByMd5(result.md5)} `;
                }
                break;
              case 'forward':
                if (env.CRV_API) {
                  try {
                    const messages = await this.pair.qq.getForwardMsg(result.resId);
                    const hash = md5Hex(result.resId);
                    text += `转发的消息记录 ${env.CRV_API}/?hash=${hash}`;
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
                    text += '[转发多条消息（无法获取）]';
                  }
                }
                else {
                  text += '[转发多条消息]';
                }
                break;
            }
            break;
          }
          case 'rps':
          case 'dice':
            text += `[${elem.type === 'rps' ? '猜拳' : '骰子'}] ${elem.id}`;
            break;
          case 'poke':
            text += `[戳一戳] ${elem.text}`;
            break;
          case 'location':
            text += `[位置] ${elem.name}\n${elem.address}`;
            break;
        }
      }
      if (text) {
        this.importTxt += `${format(new Date(message.time * 1000), 'DD/MM/YYYY, HH:mm')} - ` +
          `${message.nickname}: ${text}\n`;
      }
      if (lastMediaCount !== Object.keys(this.filesMap).length) {
        lastMediaCount = Object.keys(this.filesMap).length;
        await this.updateStatusMessage();
      }
    }
  }

  private async importMessagesAndMedia() {
    const tgChatForUser = await this.tgUser.getChat(this.pair.tgId);
    const txtBuffer = Buffer.from(this.importTxt, 'utf-8');
    const importSession = await tgChatForUser.startImportSession(
      new CustomFile('record.txt', txtBuffer.length, '', txtBuffer),
      Object.keys(this.filesMap).length,
    );
    this.currentStatus = 'uploadMedia';
    await this.updateStatusMessage();
    const { fileTypeFromFile } = await (Function('return import("file-type")')() as Promise<typeof import('file-type')>);
    for (const [fileKey, filePath] of Object.entries(this.filesMap)) {
      let type = fileKey.endsWith('.tgs') ? {
        ext: 'tgs',
        mime: 'application/x-tgsticker',
      } : await fileTypeFromFile(filePath);
      if (!type) {
        type = {
          ext: 'bin',
          mime: 'application/octet-stream',
        };
      }
      let media: Api.TypeInputMedia;
      if (['.webp', '.tgs'].includes(path.extname(filePath))) {
        // 贴纸
        media = new Api.InputMediaUploadedDocument({
          file: await importSession.uploadFile(new CustomFile(
            fileKey,
            (await fsP.stat(filePath)).size,
            filePath,
          )),
          mimeType: type.mime,
          attributes: [],
        });
      }
      else if (type.mime.startsWith('audio/')) {
        // 语音
        media = new Api.InputMediaUploadedDocument({
          file: await importSession.uploadFile(new CustomFile(
            fileKey,
            (await fsP.stat(filePath)).size,
            filePath,
          )),
          mimeType: type.mime,
          attributes: [
            new Api.DocumentAttributeAudio({
              duration: 0,
              voice: true,
            }),
          ],
        });
      }
      else if (type.ext === 'gif') {
        media = new Api.InputMediaUploadedDocument({
          file: await importSession.uploadFile(new CustomFile(
            fileKey,
            (await fsP.stat(filePath)).size,
            filePath,
          )),
          mimeType: type.mime,
          attributes: [new Api.DocumentAttributeAnimated()],
        });
      }
      else if (type.mime.startsWith('image/')) {
        media = new Api.InputMediaUploadedPhoto({
          file: await importSession.uploadFile(new CustomFile(
            fileKey,
            (await fsP.stat(filePath)).size,
            filePath,
          )),
        });
      }
      else {
        media = new Api.InputMediaUploadedDocument({
          file: await importSession.uploadFile(new CustomFile(
            fileKey,
            (await fsP.stat(filePath)).size,
            filePath,
          )),
          mimeType: type.mime,
          attributes: [],
        });
      }
      await importSession.uploadMedia(fileKey, media);
      this.mediaUploadedCount++;
      await this.updateStatusMessage();
    }
    this.currentStatus = 'finishing';
    await this.updateStatusMessage();
    await importSession.finish();
  }

  private lastUpdateStatusTime = 0;

  private async updateStatusMessage() {
    if (new Date().getTime() - this.lastUpdateStatusTime < 2000) return;
    this.lastUpdateStatusTime = new Date().getTime();
    const statusMessageText = [] as string[];
    switch (this.currentStatus) {
      case 'finishing':
        statusMessageText.unshift('正在完成…');
      case 'uploadMedia':
        statusMessageText.unshift(`正在上传媒体… ${this.mediaUploadedCount}`);
      case 'uploadMessage':
        statusMessageText.unshift('正在上传消息…');
      case 'getMedia':
        statusMessageText.unshift(`正在下载媒体… ${Object.keys(this.filesMap).length}`);
      case 'getMessage':
        statusMessageText.unshift(`正在获取消息… ${this.historyMessages.length}`);
        break;
      case 'done':
        statusMessageText.unshift(`成功`);
    }
    if (!this.statusMessage) {
      this.statusMessage = await this.requestMessage.reply({
        message: statusMessageText.join('\n'),
      });
    }
    else {
      try {
        await this.statusMessage.edit({
          text: statusMessageText.join('\n'),
        });
      }
      catch (e) {
      }
    }
  }
}
