import { fetchFile } from '../utils/urls';
import { CustomFile } from 'telegram/client/uploads';
import { Friend, Group } from 'oicq';
import { base64decode } from 'nodejs-base64';
import { getLogger } from 'log4js';

const log = getLogger('ForwardHelper');

export default {
  async downloadToCustomFile(url: string) {
    const { fileTypeFromBuffer } = await import('file-type');
    const file = await fetchFile(url);
    const type = await fileTypeFromBuffer(file);
    return new CustomFile(`image.${type.ext}`, file.length, '', file);
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

  htmlEscape: (text: string) =>
    text.replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;'),

  getRoomId(room: Friend | Group) {
    if (room instanceof Friend) {
      return room.user_id;
    }
    else {
      return room.group_id;
    }
  },

  processJson(json: string) {
    const jsonObj = JSON.parse(json);
    if (jsonObj.app === 'com.tencent.mannounce') {
      try {
        const title = base64decode(jsonObj.meta.mannounce.title);
        const content = base64decode(jsonObj.meta.mannounce.text);
        return title + '\n\n' + content;
      }
      catch (err) {
        log.error('解析群公告时出错', err);
        return '[群公告]';
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
      return appurl;
    }
    else {
      // TODO 记录无法解析的 JSON
      return '[JSON]';
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
};
