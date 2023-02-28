import { fetchFile } from '../utils/urls';
import { CustomFile } from 'telegram/client/uploads';
import { base64decode } from 'nodejs-base64';
import { getLogger } from 'log4js';
import { Entity } from 'telegram/define';
import { ForwardMessage } from 'oicq';
import { Api } from 'telegram';

const log = getLogger('ForwardHelper');

const htmlEscape = (text: string) =>
  text.replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');

export default {
  async downloadToCustomFile(url: string, allowWebp = false, filename?: string) {
    const { fileTypeFromBuffer } = await (Function('return import("file-type")')() as Promise<typeof import('file-type')>);
    const file = await fetchFile(url);
    if (filename) {
      return new CustomFile(filename, file.length, '', file);
    }
    const type = await fileTypeFromBuffer(file);
    if (allowWebp) {
      return new CustomFile(`image.${type.ext}`, file.length, '', file);
    }
    else {
      // 防止 webp 作为贴纸发送时丢失发送者信息
      return new CustomFile(`image.${type.ext === 'webp' ? 'png' : type.ext}`, file.length, '', file);
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
        return { type: 'text', text: '[群公告]' };
      }
    }
    else if (jsonObj.app === 'com.tencent.multimsg') {
      try {
        const resId = jsonObj.meta?.detail?.resid;
        const fileName = jsonObj.meta?.detail?.uniseq;
        if (resId) {
          return { type: 'forward', resId };
        }
        else {
          return { type: 'text', text: '[解析转发消息时出错：没有 resId]' };
        }
      }
      catch (err) {
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
      return { type: 'text', text: '[JSON]' };
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
    if (!user) {
      return '未知';
    }
    if ('firstName' in user) {
      return user.firstName +
        (user.lastName ? ' ' + user.lastName : '');
    }
    else if ('title' in user) {
      return user.title;
    }
    else if ('id' in user) {
      return user.id.toString();
    }
    return '未知';
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
};
