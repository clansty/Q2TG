import { getLogger } from 'log4js';
import { Friend, Group } from 'oicq';
import TelegramChat from '../client/TelegramChat';
import getAboutText from '../utils/getAboutText';
import { md5 } from '../utils/hashing';
import { getAvatar } from '../utils/urls';
import db from './db';

const log = getLogger('ForwardPair');

export class Pair {
  // 群成员的 tg 账号对应它对应的 QQ 账号获取到的 Group 对象
  // 只有群组模式有效
  public readonly instanceMapForTg = {} as { [tgUserId: string]: Group };

  constructor(
    public readonly qq: Friend | Group,
    private _tg: TelegramChat,
    public dbId: number,
    private _joinNotice: boolean,
    private _poke: boolean,
    private _enable: boolean,
    private _disableQ2TG: boolean,
    private _disableTG2Q: boolean,
  ) {
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

  get joinNotice() {
    return this._joinNotice;
  }

  set joinNotice(value) {
    this._joinNotice = value;
    db.forwardPair
      .update({
        where: { id: this.dbId },
        data: { joinNotice: value },
      })
      .then(() => 0);
  }

  get poke() {
    return this._poke;
  }

  set poke(value) {
    this._poke = value;
    db.forwardPair
      .update({
        where: { id: this.dbId },
        data: { poke: value },
      })
      .then(() => 0);
  }

  get enable() {
    return this._enable;
  }

  set enable(value) {
    this._enable = value;
    db.forwardPair
      .update({
        where: { id: this.dbId },
        data: { enable: value },
      })
      .then(() => 0);
  }

  get disableQ2TG() {
    return this._disableQ2TG;
  }

  set disableQ2TG(value) {
    this._disableQ2TG = value;
    db.forwardPair
      .update({
        where: { id: this.dbId },
        data: { disableQ2TG: value },
      })
      .then(() => 0);
  }

  get disableTG2Q() {
    return this._disableTG2Q;
  }

  set disableTG2Q(value) {
    this._disableTG2Q = value;
    db.forwardPair
      .update({
        where: { id: this.dbId },
        data: { disableTG2Q: value },
      })
      .then(() => 0);
  }
}
