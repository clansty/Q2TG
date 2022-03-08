import fsP from 'fs/promises';
import fs from 'fs';
import path from 'path';
import { Message } from './types';
import OicqClient from '../../src/client/OicqClient';
import { Platform } from 'oicq';
import { fetchFile } from '../../src/utils/urls';
import { md5Hex } from '../../src/utils/hashing';
import { format } from 'date-and-time';
import axios from 'axios';

(async () => {
  const selfId = Number(process.argv[2]);
  const selfName = process.argv[3];
  const filePath = process.argv[4];
  const outputPath = process.argv[5];
  // 可选参数
  const account = Number(process.argv[6]);
  const password = process.argv[7];
  const crvApi = process.argv[8];
  const crvKey = process.argv[9];

  const oicq = account && await OicqClient.create({
    uin: account,
    password,
    platform: Platform.Android,
    onVerifyDevice: () => process.exit(1),
    onVerifySlider: () => process.exit(1),
    onQrCode: () => process.exit(1),
  });

  const content = JSON.parse(await fsP.readFile(filePath, 'utf-8')) as Message[];
  if (!fs.existsSync(outputPath)) {
    await fsP.mkdir(outputPath);
  }
  const txt = fs.createWriteStream(path.join(outputPath, 'WhatsApp Chat with Cat.txt'), 'utf-8');

  content.sort((a, b) => a.time - b.time);

  console.log('count:', content.length);
  console.log('files:', content.filter(it => it.file?.type?.startsWith('image/')).length);

  for (const message of content) {
    let sender = message.senderId === selfId ? selfName : message.username;
    if (message.system) sender = '系统';
    const date = new Date(message.time);
    if (message.file) {
      if (message.file.type.startsWith('image/')) {
        try {
          let file: Buffer;
          if (message.file.url.startsWith('data:image')) {
            const base64Data = message.file.url.replace(/^data:image\/\w+;base64,/, '');
            file = Buffer.from(base64Data, 'base64');
          }
          else {
            file = await fetchFile(message.file.url);
          }
          const md5 = md5Hex(file);
          await fsP.writeFile(path.join(outputPath, `IMG-${md5}.jpg`), file);
          txt.write(`${format(date, 'DD/MM/YYYY, HH:mm')} - ${sender}: IMG-${md5}.jpg (file attached)\n`);
          process.stdout.write('.');
        }
        catch (e) {
          process.stdout.write('x');
          txt.write(`${format(date, 'DD/MM/YYYY, HH:mm')} - ${sender}: ${message.file.url}\n`);
        }
      }
      else {
        txt.write(`${format(date, 'DD/MM/YYYY, HH:mm')} - ${sender}: 文件: ${message.file.name}\n` +
          `${message.file.type}\n${message.file.url}\n`);
      }
    }
    if (message.content) {
      const FORWARD_REGEX = /\[Forward: ([A-Za-z0-9\/+=]+)]/;
      if (FORWARD_REGEX.test(message.content) && oicq) {
        try {
          const resId = FORWARD_REGEX.exec(message.content)[1];
          const record = await oicq.getForwardMsg(resId);
          const hash = md5Hex(resId);
          await axios.post(`${crvApi}/add`, {
            auth: crvKey,
            key: hash,
            data: record,
          });
          txt.write(`${format(date, 'DD/MM/YYYY, HH:mm')} - ${sender}: 转发的消息记录 ${crvApi}/?hash=${hash}\n`);
          process.stdout.write('w');
        }
        catch (e) {
          process.stdout.write('v');
        }
        txt.write(`${format(date, 'DD/MM/YYYY, HH:mm')} - ${sender}: 转发的消息记录\n`);
      }
      else {
        txt.write(`${format(date, 'DD/MM/YYYY, HH:mm')} - ${sender}: ${message.content}\n`);
      }
    }
  }

  txt.end();
  await oicq.logout(false);
  console.log('转换成功');
})();
