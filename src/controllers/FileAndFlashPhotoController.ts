import Telegram from '../client/Telegram';
import OicqClient from '../client/OicqClient';
import { Api } from 'telegram';
import db from '../models/db';
import { Button } from 'telegram/tl/custom/button';
import { getLogger, Logger } from 'log4js';
import { CustomFile } from 'telegram/client/uploads';
import { fetchFile, getImageUrlByMd5 } from '../utils/urls';
import Instance from '../models/Instance';

const REGEX = /^\/start (file|flash)-(\d+)$/;

export default class FileAndFlashPhotoController {
  private readonly log: Logger;

  constructor(private readonly instance: Instance,
              private readonly tgBot: Telegram,
              private readonly oicq: OicqClient) {
    tgBot.addNewMessageEventHandler(this.onTelegramMessage);
    this.log = getLogger(`FileAndFlashPhotoController - ${instance.id}`);
  }

  private onTelegramMessage = async (message: Api.Message) => {
    if (!message.isPrivate || !message.message) return false;
    if (!REGEX.test(message.message)) return false;
    const exec = REGEX.exec(message.message);
    switch (exec[1]) {
      case 'file':
        await this.handleFile(message, Number(exec[2]));
        break;
      case 'flash':
        await this.handleFlashPhoto(message, Number(exec[2]));
        break;
    }
    return true;
  };

  private async handleFile(message: Api.Message, id: number) {
    try {
      const fileInfo = await db.file.findFirst({
        where: { id },
      });
      const downloadUrl = await this.oicq.getChat(Number(fileInfo.roomId)).getFileUrl(fileInfo.fileId);
      await message.reply({
        message: fileInfo.info,
        buttons: Button.url('📎下载', downloadUrl),
      });
    }
    catch (e) {
      this.log.error('获取文件下载地址失败', e);
      await message.reply({
        message: `获取文件下载地址失败：${e.message}\n${e}`,
      });
    }
  }

  private async handleFlashPhoto(message: Api.Message, id: number) {
    try {
      const photoInfo = await db.flashPhoto.findFirst({
        where: { id },
      });
      const viewInfo = await db.flashPhotoView.findFirst({
        where: { flashPhotoId: id, viewerId: message.senderId.valueOf() },
      });
      if (viewInfo) {
        await message.reply({ message: '你已经查看过了' });
        return;
      }
      const file = await fetchFile(getImageUrlByMd5(photoInfo.photoMd5));
      const user = await this.tgBot.getChat(message.senderId);
      await user.sendSelfDestructingPhoto({},
        new CustomFile('photo.jpg', file.length, '', file),
        5);
      await db.flashPhotoView.create({
        data: { flashPhotoId: id, viewerId: message.senderId.valueOf() },
      });
    }
    catch (e) {
      this.log.error('获取闪照失败', e);
      await message.reply({
        message: `获取闪照失败：${e.message}\n${e}`,
      });
    }
  }
}
