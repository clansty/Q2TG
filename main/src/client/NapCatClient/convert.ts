import type { Receive, Send, WSSendReturn } from 'node-napcat-ts';
import { ForwardMessage, SendableElem } from '../QQClient';
import { MessageElem } from '@icqqjs/icqq';
import { file as createTempFileBase, FileResult } from 'tmp-promise';
import fsP from 'fs/promises';
import env from '../../models/env';
import fs from 'fs';
import { Readable } from 'node:stream';
import { FaceElem } from '@icqqjs/icqq/lib/message/elements';

const createTempFile = (options: Parameters<typeof createTempFileBase>[0] = {}) => createTempFileBase({
  tmpdir: env.CACHE_DIR,
  ...options,
});

export const messageElemToNapCatSendable = async (elem: SendableElem): Promise<{ elem: Send[keyof Send], tempFiles: FileResult[] }> => {
  const noTmp = (elem: Send[keyof Send]) => ({
    elem,
    tempFiles: [],
  });
  switch (elem.type) {
    case 'at':
    case 'text':
    case 'face':
      return noTmp({
        type: elem.type,
        data: elem,
      } as any);
    case 'rps':
    case 'dice':
      return noTmp({
        type: elem.type,
        data: {
          result: elem.id,
        },
      });
    case 'image':
    case 'record':
    case 'video':
      const tempFiles: FileResult[] = [];
      if (Buffer.isBuffer(elem.file)) {
        const file = await createTempFile({ postfix: '.tmp' });
        tempFiles.push(file);
        await fsP.writeFile(file.path, elem.file);
        elem.file = file.path;
      }
      else if (typeof elem.file === 'object' && 'pipe' in elem.file) {
        const file = await createTempFile({ postfix: '.tmp' });
        tempFiles.push(file);
        await new Promise((resolve, reject) => {
          const writeStream = fs.createWriteStream(file.path);
          writeStream.on('error', reject);
          writeStream.on('finish', resolve);
          (elem.file as Readable).pipe(writeStream);
        });
        elem.file = file.path;
      }
      if (!/^(https?|file):\/\//.test(elem.file) && elem.file.startsWith('/')) {
        elem.file = `file://${elem.file}`;
      }
      elem.file = elem.file.replace('D:\\Projects\\Q2TG\\next\\main\\data\\cache\\', '/app/.config/QQ/NapCat/temp/');
      return {
        elem: {
          type: elem.type,
          data: {
            file: elem.file,
            summary: env.IMAGE_SUMMARY || (`[Q2TG ${elem.type}]`),
            name: elem.type,
            subType: 'asface' in elem && elem.asface ? 1 : 0,
          },
        } as any,
        tempFiles,
      };
    case 'node': {
      let message = elem.message;
      if (!Array.isArray(message)) {
        message = [message];
      }
      const forward = await Promise.all(message.map(it => messageElemToNapCatSendable(typeof it === 'string' ? { type: 'text', text: it } : it as SendableElem)));
      return {
        elem: {
          type: 'node',
          data: {
            user_id: elem.user_id,
            nickname: elem.nickname,
            content: forward.map(it => it.elem),
          },
        } as any,
        tempFiles: forward.flatMap(it => it.tempFiles),
      };
    }
    case 'sface':
    default:
      throw new Error('不支持此元素');
  }
};

export type NapCatForwardElem = {
  type: 'forward',
  id: string,
  content: ForwardMessage[],
}

export type FaceElemEx = FaceElem & {
  resultId?: string,
  chainCount?: number,
}

export const napCatReceiveToMessageElem = (data: Receive[keyof Receive]): MessageElem | NapCatForwardElem | FaceElemEx => {
  switch (data.type) {
    case 'text':
    case 'face':
    case 'image':
    case 'record':
    case 'json':
    case 'markdown':
      return {
        ...data.data,
        type: data.type,
      } as any;
    // @ts-ignore
    case 'mface':
      return {
        type: 'image',
        url: (data as any).data.url,
        file: (data as any).data.url,
      };
    case 'at':
      const qqNum = Number(data.data.qq);
      return {
        type: data.type,
        qq: isNaN(qqNum) ? data.data.qq as any : qqNum,
      };
    case 'file':
      return {
        ...data.data,
        type: 'file',
        duration: 0,
        name: data.data.file,
        fid: data.data.file_id,
        size: Number(data.data.file_size),
        md5: '',
      };
    case 'video':
      return {
        type: data.type,
        // 我们不需要 fileId，直接能拿到 url，url 进 getVideoUrl 转一圈拿回来自己，保持兼容性
        fid: data.data.url,
        file: data.data.url,
      };
    case 'dice':
    case 'rps':
      return {
        id: Number(data.data.result),
        type: data.type,
      };
    case 'forward':
      return {
        type: 'forward',
        id: data.data.id as any,
        content: 'content' in data.data ? napCatForwardMultiple(data.data.content as any) : undefined,
      };
    case 'reply':
      return {
        type: 'reply',
        id: data.data.id,
      };
    default:
      throw new Error('不支持此元素');
  }
};

export const napCatForwardMultiple = (messages: WSSendReturn['get_forward_msg']['messages']): ForwardMessage[] => messages.map(it => ({
  group_id: it.message_type === 'group' ? it.group_id : undefined,
  nickname: it.sender.card || it.sender.nickname,
  time: it.time,
  user_id: it.sender.user_id,
  seq: it.message_id,
  raw_message: it.raw_message,
  message: ((it as any).content || (it as any).message).map(napCatReceiveToMessageElem),
}));
