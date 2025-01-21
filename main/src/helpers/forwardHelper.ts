import { fetchFile } from '../utils/urls';
import { CustomFile } from 'telegram/client/uploads';
import { base64decode } from 'nodejs-base64';
import { getLogger } from 'log4js';
import { Entity } from 'telegram/define';
import { ForwardMessage } from '../client/QQClient';
import { Api } from 'telegram';
import { imageSize } from 'image-size';
import env from '../models/env';
import { md5Hex } from '../utils/hashing';
import posthog from '../models/posthog';
import fs from 'fs';
import { format } from 'date-fns';
import { fileTypeFromBuffer, fileTypeFromFile } from 'file-type';
import { GroupRole } from '@icqqjs/icqq/lib/common';
import { createCanvas, loadImage } from 'canvas';
import path from 'path';
import makeHeaderImage from './makeHeaderImage';
import fsP from 'fs/promises';

const log = getLogger('ForwardHelper');

const htmlEscape = (text: string) =>
  text.replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');

const bufferOrPathCustomFile = (filename: string, bufferOrPath: Buffer | string) => {
  const isBuffer = Buffer.isBuffer(bufferOrPath);
  let size: number;
  if (isBuffer) {
    size = bufferOrPath.length;
  }
  else {
    size = fs.statSync(bufferOrPath).size;
  }
  return new CustomFile(filename, size, isBuffer ? '' : bufferOrPath, isBuffer ? bufferOrPath : undefined);
};

const headImageBlockMap = new Map<string, Promise<void>>();

export default {
  async downloadToCustomFile(url: string, allowWebp = false, filename?: string) {
    // url 可以是一个本地路径
    const file = /^https?:\/\//.test(url) ? await fetchFile(url) : url;
    const isBuffer = Buffer.isBuffer(file);
    if (filename) {
      return bufferOrPathCustomFile(filename, file);
    }
    const type = await (isBuffer ? fileTypeFromBuffer : fileTypeFromFile)(file as any);
    // The photo must be at most 10 MB in size. The photo's width and height must not exceed 10000 in total. Width and height ratio must be at most 20
    if (type.ext === 'png' || type.ext === 'jpg') {
      const dimensions = imageSize(file);
      const aspectRatio = dimensions.width / dimensions.height;
      if (aspectRatio > 20 || aspectRatio < 1 / 20
        || dimensions.width + dimensions.height > 10000
      ) {
        // 让 Telegram 服务器下载
        return url;
      }
    }
    if (allowWebp) {
      return bufferOrPathCustomFile(`image.${type.ext}`, file);
    }
    else {
      // 防止 webp 作为贴纸发送时丢失发送者信息
      return bufferOrPathCustomFile(`image.${type.ext === 'webp' ? 'png' : type.ext}`, file);
    }
  },

  hSize(size: number) {
    const BYTE = 1024;

    if (size < BYTE)
      return size + 'B';
    if (size < Math.pow(BYTE, 2))
      return (size / BYTE).toFixed(1) + 'KB';
    if (size < Math.pow(BYTE, 3))
      return (size / Math.pow(BYTE, 2)).toFixed(1) + 'MB';
    if (size < Math.pow(BYTE, 4))
      return (size / Math.pow(BYTE, 3)).toFixed(1) + 'GB';
    return (size / Math.pow(BYTE, 4)).toFixed(1) + 'TB';
  },

  htmlEscape,

  processJson(json: string) {
    const jsonObj = JSON.parse(json);
    if (jsonObj.app === 'com.tencent.mannounce') {
      try {
        const title = base64decode(jsonObj.meta.mannounce.title);
        const content = base64decode(jsonObj.meta.mannounce.text);
        return { type: 'text', text: title + '\n\n' + content };
      }
      catch (err) {
        log.error('解析群公告时出错', err);
        posthog.capture('解析群公告时出错', { error: err });
        return { type: 'text', text: '[群公告]' };
      }
    }
    else if (jsonObj.app === 'com.tencent.multimsg') {
      try {
        const resId = jsonObj.meta?.detail?.resid;
        const fileName = jsonObj.meta?.detail?.uniseq;
        if (resId) {
          return { type: 'forward', resId, fileName };
        }
        else {
          return { type: 'text', text: '[解析转发消息时出错：没有 resId]' };
        }
      }
      catch (err) {
        posthog.capture('解析转发消息时出错', { error: err });
      }
    }
    else if (jsonObj.app === 'com.tencent.map') {
      try {
        const location = jsonObj.meta?.['Location.Search'];
        return {
          type: 'location',
          address: location.address,
          lat: location.lat,
          lng: location.lng,
        };
      }
      catch (err) {
        posthog.capture('解析定位时出错', { error: err });
      }
    }
    let appurl: string;
    const biliRegex = /(https?:\\?\/\\?\/b23\.tv\\?\/\w*)\??/;
    const zhihuRegex = /(https?:\\?\/\\?\/\w*\.?zhihu\.com\\?\/[^?"=]*)\??/;
    const biliRegex2 = /(https?:\\?\/\\?\/\w*\.?bilibili\.com\\?\/[^?"=]*)\??/;
    const jsonLinkRegex = /{.*"app":"com.tencent.structmsg".*"jumpUrl":"(https?:\\?\/\\?\/[^",]*)".*}/;
    const jsonAppLinkRegex = /"contentJumpUrl": ?"(https?:\\?\/\\?\/[^",]*)"/;
    if (biliRegex.test(json))
      appurl = json.match(biliRegex)[1].replace(/\\\//g, '/');
    else if (biliRegex2.test(json))
      appurl = json.match(biliRegex2)[1].replace(/\\\//g, '/');
    else if (zhihuRegex.test(json))
      appurl = json.match(zhihuRegex)[1].replace(/\\\//g, '/');
    else if (jsonLinkRegex.test(json))
      appurl = json.match(jsonLinkRegex)[1].replace(/\\\//g, '/');
    else if (jsonAppLinkRegex.test(json))
      appurl = json.match(jsonAppLinkRegex)[1].replace(/\\\//g, '/');
    if (appurl) {
      return { type: 'text', text: appurl };
    }
    else {
      // TODO 记录无法解析的 JSON
      return { type: 'text', text: `[JSON] ${jsonObj?.app}` };
    }
  },

  processXml(xml: string):
    { type: 'forward', resId: string } | { type: 'text', text: string } | { type: 'image', md5: string } {
    const urlRegex = /url="([^"]+)"/;
    const md5ImageRegex = /image md5="([A-F\d]{32})"/;
    let text: string;
    if (urlRegex.test(xml))
      text = xml.match(urlRegex)[1].replace(/\\\//g, '/');
    if (xml.includes('action="viewMultiMsg"')) {
      text = '[Forward multiple messages]';
      const resIdRegex = /m_resid="([\w+=/]+)"/;
      if (resIdRegex.test(xml)) {
        const resId = xml.match(resIdRegex)![1];
        return {
          type: 'forward',
          resId,
        };
      }
    }
    else if (text) {
      text = text.replace(/&amp;/g, '&');
      return {
        type: 'text',
        text,
      };
    }
    else if (md5ImageRegex.test(xml)) {
      const imgMd5 = xml.match(md5ImageRegex)![1];
      return {
        type: 'image',
        md5: imgMd5,
      };
    }
    else {
      return {
        type: 'text',
        text: '[XML]',
      };
    }
  },

  getUserDisplayName(user: Entity) {
    let res: string;
    if (!user) {
      res = '未知';
    }
    else if ('firstName' in user) {
      res = user.firstName +
        (user.lastName ? ' ' + user.lastName : '');
    }
    else if ('title' in user) {
      res = user.title;
    }
    else if ('id' in user) {
      res = user.id.toString();
    }
    else {
      res = '未知';
    }
    if (res.length > 25) {
      res = res.slice(0, 25) + '…';
    }
    return res;
  },

  generateForwardBrief(messages: ForwardMessage[]) {
    const count = messages.length;
    // 取前四条
    messages = messages.slice(0, 4);
    let result = '<b>转发的消息记录</b>';
    for (const message of messages) {
      result += `\n<b>${message.nickname}: </b>` +
        `${htmlEscape(message.raw_message.length > 10 ? message.raw_message.substring(0, 10) + '…' : message.raw_message)}`;
    }
    if (count > messages.length) {
      result += `\n<b>共 ${count} 条消息记录</b>`;
    }
    return result;
  },

  getMessageDocumentId(message: Api.Message) {
    if (message.document) {
      return BigInt(message.document.id.toString());
    }
    if (message.file) {
      const media = Reflect.get(message.file, 'media');
      return BigInt(media.id.toString());
    }
    return null;
  },

  generateRichHeaderUrl(apiKey: string, userId: number, messageHeader = '') {
    const url = new URL(`${env.WEB_ENDPOINT}/richHeader/${apiKey}/${userId}`);
    // 防止群名片刷新慢
    messageHeader && url.searchParams.set('hash', md5Hex(messageHeader).substring(0, 10));
    url.searchParams.set('date', format(new Date(), 'yyyy-MM-dd'));
    return url.toString();
  },

  generateTelegramAvatarUrl(instanceId: number, userId: number) {
    if (!env.WEB_ENDPOINT) return '';
    const url = new URL(`${env.WEB_ENDPOINT}/telegramAvatar/${instanceId}/${userId}`);
    return url.toString();
  },

  peerToId(peer: Api.TypePeer) {
    if (peer instanceof Api.PeerUser) {
      return peer.userId.toJSNumber();
    }
    if (peer instanceof Api.PeerChat) {
      return peer.chatId.toJSNumber();
    }
    if (peer instanceof Api.PeerChannel) {
      return peer.channelId.toJSNumber();
    }
    return undefined;
  },

  headImageForQQ(nameColor: string, avatarHash: string, avatarPath: () => Promise<string>, name: string, title: string, role: GroupRole) {
    const hashKey = md5Hex(nameColor + avatarHash + name + title + role);
    const cachedPath = path.join(env.CACHE_DIR, hashKey + '.png');
    if (fs.existsSync(cachedPath)) {
      return cachedPath;
    }
    if (headImageBlockMap.has(hashKey)) {
      return null;
    }

    headImageBlockMap.set(hashKey, (async () => {
      try {
        const avatar = await avatarPath();
        const img = await makeHeaderImage(nameColor, avatar, name, title, role);
        await fsP.writeFile(cachedPath, img);
        headImageBlockMap.delete(hashKey);
      }
      catch (e) {
        log.error('生成头像时出错', e);
        posthog.capture('生成头像时出错', { error: e });
        headImageBlockMap.delete(hashKey);
      }
    })());
    return null;
  },

  getStickerBrief(sticker: Api.Document) {
    const emojis = sticker.attributes.find((attr) => attr instanceof Api.DocumentAttributeSticker)?.alt || '';
    if (!emojis) return '[贴纸]';
    return `[贴纸 ${emojis}]`;
  },
};
