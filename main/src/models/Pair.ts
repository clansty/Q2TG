import { getLogger } from 'log4js';
import { Friend, Group, QQClient } from '../client/QQClient';
import TelegramChat from '../client/TelegramChat';
import getAboutText from '../utils/getAboutText';
import { md5 } from '../utils/hashing';
import { getAvatar } from '../utils/urls';
import db from './db';
import flags from '../constants/flags';
import { NapCatGroup } from '../client/NapCatClient';
import { CustomFile } from 'telegram/client/uploads';
import { Api, utils } from 'telegram';
import sharp from 'sharp';
import InputStickerSetID = Api.InputStickerSetID;

const log = getLogger('ForwardPair');

export class Pair {
  private static readonly apiKeyMap = new Map<string, Pair>();

  public static getByApiKey(key: string) {
    return this.apiKeyMap.get(key);
  }

  private static readonly dbIdMap = new Map<number, Pair>();

  public static getByDbId(dbId: number) {
    return this.dbIdMap.get(dbId);
  }

  // 群成员的 tg 账号对应它对应的 QQ 账号获取到的 Group 对象
  // 只有群组模式有效
  public readonly instanceMapForTg = {} as { [tgUserId: string]: Group };

  constructor(
    public readonly qq: Friend | Group,
    private _tg: TelegramChat,
    public readonly tgUser: TelegramChat,
    public dbId: number,
    private _flags: number,
    public readonly apiKey: string,
    public readonly qqClient: QQClient,
    public readonly forumId: number,
  ) {
    if (apiKey) {
      Pair.apiKeyMap.set(apiKey, this);
    }
    Pair.dbIdMap.set(dbId, this);
  }

  // 更新 TG 群组的头像和简介
  public async updateInfo(avatar?: Buffer) {
    const avatarCache = await db.avatarCache.findFirst({
      where: { forwardPairId: this.dbId },
    });
    const lastHash = avatarCache ? avatarCache.hash : null;
    if (!avatar)
      avatar = await getAvatar(this.qqRoomId);
    const newHash = md5(avatar);
    if (!this.forumId) {
      try {
        await this._tg.editAbout(await getAboutText(this.qq, false));
      }
      catch (e) {
        log.error(`修改群简介失败: ${e.message}`);
      }
    }
    if (!(this.flags & flags.NAME_LOCKED) && this.qq instanceof NapCatGroup && !this.forumId) {
      const info = await this.qq.renew();
      try {
        await this._tg.editTitle(info.group_name);
      }
      catch (e) {
        log.error(`修改群名失败: ${e.message}`);
      }
    }

    if (!lastHash || Buffer.from(lastHash).compare(newHash) !== 0) {
      log.debug(`更新群头像: ${this.qqRoomId}`);
      if (this.forumId && this.tgUser.parent.me.premium) {
        const converted = await sharp(avatar).resize(100, 100).webp().toBuffer();
        const stickerSet = await this.createEmojiSet(converted);
        const documentId = stickerSet.documents[0].id;
        await this.tgUser.editTopicEmoji(this.forumId, documentId);
        await this.tg.parent.deleteStickerSet(new InputStickerSetID({
          id: stickerSet.set.id,
          accessHash: stickerSet.set.accessHash,
        }));
      }
      else if (!this.forumId) {
        await this._tg.setProfilePhoto(avatar);
        await db.avatarCache.upsert({
          where: { forwardPairId: this.dbId },
          update: { hash: newHash },
          create: { forwardPairId: this.dbId, hash: newHash },
        });
      }
    }
  }

  private async createEmojiSet(file: Buffer) {
    const setName = `q2tg_${Date.now()}_by_${this.tg.parent.me.username}`;
    // InputFile -> InputMediaUploadedDocument -> MessageMediaDocument -> InputDocument -> InputStickerSetItem -> StickerSet -> Document
    const messageMedia = await this.tg.uploadMedia(new CustomFile('emoji.webp', file.length, '', file)) as Api.MessageMediaDocument;
    const inputDocument = utils.getInputDocument(messageMedia);
    const inputStickerSetItem = new Api.InputStickerSetItem({
      document: inputDocument,
      emoji: '🐧',
    });
    const stickerSet = await this.tg.parent.createStickerSet({
      title: 'Q2TG 临时头像包',
      emojis: true,
      shortName: setName,
      stickers: [inputStickerSetItem],
      userId: this.tgUser.parent.me.id,
      software: 'Q2TG',
    }) as Api.messages.StickerSet;
    return stickerSet;
  }

  get qqRoomId() {
    return 'uin' in this.qq ? this.qq.uin : -this.qq.gid;
  }

  get tgId() {
    return Number(this._tg.id);
  }

  get tg() {
    return this._tg;
  }

  set tg(value: TelegramChat) {
    this._tg = value;
    db.forwardPair
      .update({
        where: { id: this.dbId },
        data: { tgChatId: Number(value.id) },
      })
      .then(() => log.info(`出现了到超级群组的转换: ${value.id}`));
  }

  get flags() {
    return this._flags;
  }

  set flags(value) {
    this._flags = value;
    db.forwardPair
      .update({
        where: { id: this.dbId },
        data: { flags: value },
      })
      .then(() => 0);
  }
}
