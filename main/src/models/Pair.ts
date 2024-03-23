import { getLogger } from 'log4js';
import { Friend, Group } from '@icqqjs/icqq';
import TelegramChat from '../client/TelegramChat';
import getAboutText from '../utils/getAboutText';
import { md5 } from '../utils/hashing';
import { getAvatar } from '../utils/urls';
import db from './db';

const log = getLogger('ForwardPair');

export class Pair {
  private static readonly apiKeyMap = new Map<string, Pair>();

  public static getByApiKey(key: string) {
    return this.apiKeyMap.get(key);
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
  ) {
    if (apiKey) {
      Pair.apiKeyMap.set(apiKey, this);
    }
  }

  // 更新 TG 群组的头像和简介
  public async updateInfo() {
    const avatarCache = await db.avatarCache.findFirst({
      where: { forwardPairId: this.dbId },
    });
    const lastHash = avatarCache ? avatarCache.hash : null;
    const avatar = await getAvatar(this.qqRoomId);
    const newHash = md5(avatar);
    if (!lastHash || lastHash.compare(newHash) !== 0) {
      log.debug(`更新群头像: ${this.qqRoomId}`);
      await this._tg.setProfilePhoto(avatar);
      await db.avatarCache.upsert({
        where: { forwardPairId: this.dbId },
        update: { hash: newHash },
        create: { forwardPairId: this.dbId, hash: newHash },
      });
    }
    await this._tg.editAbout(await getAboutText(this.qq, false));
  }

  get qqRoomId() {
    return this.qq instanceof Friend ? this.qq.user_id : -this.qq.group_id;
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
