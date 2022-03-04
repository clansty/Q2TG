import Telegram from '../client/Telegram';
import OicqClient from '../client/OicqClient';
import { Api } from 'telegram';
import db from '../providers/db';
import { Button } from 'telegram/tl/custom/button';
import { getLogger } from 'log4js';

const GET_FILE_REGEX = /^\/start file-(\d+)$/;

export default class FileController {
  private readonly log = getLogger('FileController');

  constructor(private readonly tgBot: Telegram,
              private readonly oicq: OicqClient) {
    tgBot.addNewMessageEventHandler(this.onTelegramMessage);
  }

  private onTelegramMessage = async (message: Api.Message) => {
    if (!message.isPrivate || !message.message) return false;
    if (!GET_FILE_REGEX.test(message.message)) return false;
    const id = Number(GET_FILE_REGEX.exec(message.message)[1]);
    try {
      const fileInfo = await db.file.findFirst({
        where: { id },
      });
      const downloadUrl = await this.oicq.getChat(Number(fileInfo.roomId)).getFileUrl(fileInfo.fileId);
      await message.reply({
        message: fileInfo.info,
        buttons: Button.url('⏬下载', downloadUrl),
      });
    }
    catch (e) {
      this.log.error('获取文件下载地址失败', e);
      await message.reply({
        message: `获取文件下载地址失败：${e.message}\n${e}`,
      });
    }
    return true;
  };
}
