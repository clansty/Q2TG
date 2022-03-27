import { Friend, Group } from 'oicq';
import TelegramChat from '../client/TelegramChat';
import db from './db';
import { getLogger } from 'log4js';
import { getAvatar } from '../utils/urls';
import { md5 } from '../utils/hashing';
import getAboutText from '../utils/getAboutText';

const log = getLogger('ForwardPair');

export class Pair {
  constructor(public readonly qq: Friend | Group,
              private _tg: TelegramChat,
              public dbId: number) {
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
    db.forwardPair.update({
      where: { id: this.dbId },
      data: { tgChatId: Number(value.id) },
    })
      .then(() => log.info(`出现了到超级群组的转换: ${value.id}`));
  }
}
