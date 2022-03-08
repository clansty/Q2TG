import Telegram from '../../src/client/Telegram';
import OicqClient from '../../src/client/OicqClient';
import fsP from 'fs/promises';
import { Message } from './types';
import prompts from 'prompts';
import { dir } from 'tmp-promise';
import { Presets, SingleBar } from 'cli-progress';
import { fetchFile } from '../../src/utils/urls';
import { md5Hex } from '../../src/utils/hashing';
import path from 'path';
import { format } from 'date-and-time';
import axios from 'axios';
import { CustomFile } from 'telegram/client/uploads';
import { Api } from 'telegram';
import fs from 'fs';

const TGS_MAP = ['打call', '流泪', '变形', '比心', '庆祝', '鞭炮'].map(text => `[${text}]请使用最新版手机QQ体验新功能`);

export default {
  async doImport(filePath: string, telegram: Telegram, oicq: OicqClient, crvApi: string, crvKey: string) {
    const { fileTypeFromFile } = await (Function('return import("file-type")')() as Promise<typeof import('file-type')>);

    let selfId = Number(process.env.SELF_ID), selfName = process.env.SELF_NAME;
    !(selfId && selfName) && ({ selfId, selfName } = await prompts([
      { type: 'number', name: 'selfId', message: '请输入自己的 ID（映射消息）' },
      { type: 'text', name: 'selfName', message: '请输入自己的 Telegram 名称（映射消息）' },
    ]));

    const { chatName } = await prompts({
      type: 'text', name: 'chatName', message: '请输入用于导入的群组名称（即将创建）',
    });

    console.log('正在读取记录…');

    const content = JSON.parse(await fsP.readFile(filePath, 'utf-8')) as Message[];
    content.sort((a, b) => a.time - b.time);

    let output = '';
    const tmpDir = await dir();
    const outputPath = tmpDir.path;
    const files = new Set<string>();

    console.log('正在下载媒体…');

    const fileCount = content.filter(it => it.file).length;
    const fetchFilesBar = new SingleBar({
      hideCursor: true,
      format: '{bar} {percentage}% | {value}/{total}',
      barsize: 120,
    }, Presets.shades_grey);
    fetchFilesBar.start(fileCount, 0);

    for (const message of content) {
      let sender = message.senderId === selfId ? selfName : message.username;
      if (message.system) sender = '系统';
      const date = new Date(message.time);
      if (!message.files?.length && message.file) {
        // 适配旧版数据库
        message.files = [message.file];
      }
      if (message.files?.length) {
        for (const messageFile of message.files) {
          if (messageFile.type.startsWith('image/')) {
            try {
              let file: Buffer;
              if (messageFile.url.startsWith('data:image')) {
                const base64Data = messageFile.url.replace(/^data:image\/\w+;base64,/, '');
                file = Buffer.from(base64Data, 'base64');
              }
              else {
                file = await fetchFile(messageFile.url);
              }
              const md5 = md5Hex(file);
              await fsP.writeFile(path.join(outputPath, `${md5}.file`), file);
              output += `${format(date, 'DD/MM/YYYY, HH:mm')} - ${sender}: ${md5}.file (file attached)\n`;
              files.add(md5);
            }
            catch (e) {
              output += `${format(date, 'DD/MM/YYYY, HH:mm')} - ${sender}: ${messageFile.url}\n`;
            }
          }
          else if (messageFile.type.startsWith('audio/') && messageFile.url.startsWith('data:audio')) {
            try {
              let file: Buffer;
              const base64Data = messageFile.url.replace(/^data:audio\/\w+;base64,/, '');
              file = Buffer.from(base64Data, 'base64');
              const md5 = md5Hex(file);
              await fsP.writeFile(path.join(outputPath, `${md5}.file`), file);
              output += `${format(date, 'DD/MM/YYYY, HH:mm')} - ${sender}: ${md5}.file (file attached)\n`;
              files.add(md5);
            }
            catch (e) {
              output += `${format(date, 'DD/MM/YYYY, HH:mm')} - ${sender}: ${messageFile.url}\n`;
            }
          }
          else {
            output += `${format(date, 'DD/MM/YYYY, HH:mm')} - ${sender}: 文件: ${messageFile.name}\n` +
              `${messageFile.type}\n`;
          }
        }
        fetchFilesBar.increment();
      }
      if (message.content) {
        const FORWARD_REGEX = /\[Forward: ([A-Za-z0-9\/+=]+)]/;
        const tgsIndex = TGS_MAP.indexOf(message.content);
        if (tgsIndex > -1) {
          output += `${format(date, 'DD/MM/YYYY, HH:mm')} - ${sender}: tgs${tgsIndex}.file (file attached)\n`;
          files.add(`tgs${tgsIndex}`);
        }
        else if (FORWARD_REGEX.test(message.content) && oicq) {
          try {
            const resId = FORWARD_REGEX.exec(message.content)[1];
            const record = await oicq.getForwardMsg(resId);
            const hash = md5Hex(resId);
            await axios.post(`${crvApi}/add`, {
              auth: crvKey,
              key: hash,
              data: record,
            });
            output += `${format(date, 'DD/MM/YYYY, HH:mm')} - ${sender}: 转发的消息记录 ${crvApi}/?hash=${hash}\n`;
          }
          catch (e) {
          }
          output += `${format(date, 'DD/MM/YYYY, HH:mm')} - ${sender}: 转发的消息记录\n`;
        }
        else {
          output += `${format(date, 'DD/MM/YYYY, HH:mm')} - ${sender}: ${message.content}\n`;
        }
      }
    }

    fetchFilesBar.stop();

    // 转换好了，开始导入 TG

    console.log('正在准备导入…');

    const txtBuffer = Buffer.from(output, 'utf-8');
    try {
      const newChat = await telegram.createChat(chatName);

      const importSession = await newChat.startImportSession(
        new CustomFile('record.txt', txtBuffer.length, '', txtBuffer),
        files.size,
      );

      console.log('正在上传媒体…');

      const uploadMediaBar = new SingleBar({
        hideCursor: true,
        format: '{bar} {percentage}% | {value}/{total}',
        barsize: 120,
      }, Presets.shades_grey);
      uploadMediaBar.start(files.size, 0);

      for (const md5 of files) {
        const fileName = md5 + '.file';
        const file = md5.startsWith('tgs') ? path.join('./assets/tgs', md5 + '.tgs') : path.join(outputPath, md5 + '.file');
        const type = md5.startsWith('tgs') ? {
          ext: 'tgs',
          mime: 'application/x-tgsticker',
        } : await fileTypeFromFile(file);

        let media: Api.TypeInputMedia;
        if (md5.startsWith('tgs') || type.ext === 'webp') {
          // 贴纸
          media = new Api.InputMediaUploadedDocument({
            file: await importSession.uploadFile(new CustomFile(
              `${fileName}.${type.ext}`,
              fs.statSync(file).size,
              file,
            )),
            mimeType: type.mime,
            attributes: [],
          });
        }
        else if (type.mime.startsWith('audio/')) {
          // 语音
          media = new Api.InputMediaUploadedDocument({
            file: await importSession.uploadFile(new CustomFile(
              `${fileName}.${type.ext}`,
              fs.statSync(file).size,
              file,
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
              `${fileName}.${type.ext}`,
              fs.statSync(file).size,
              file,
            )),
            mimeType: type.mime,
            attributes: [new Api.DocumentAttributeAnimated()],
          });
        }
        else if (type.mime.startsWith('image/')) {
          media = new Api.InputMediaUploadedPhoto({
            file: await importSession.uploadFile(new CustomFile(
              `${fileName}.${type.ext}`,
              fs.statSync(file).size,
              file,
            )),
          });
        }
        else {
          media = new Api.InputMediaUploadedDocument({
            file: await importSession.uploadFile(new CustomFile(
              `${fileName}.${type.ext}`,
              fs.statSync(file).size,
              file,
            )),
            mimeType: type.mime,
            attributes: [],
          });
        }

        await importSession.uploadMedia(fileName, media);
        uploadMediaBar.increment();
      }

      await importSession.finish();

      console.log('导入成功！');
    }
    catch (e) {
      console.error('错误', e);
      const dumpPath = path.join(outputPath, 'record');
      await fsP.writeFile(dumpPath, txtBuffer);
      console.log('临时文件位置', outputPath);
    }
  },
};
