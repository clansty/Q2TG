import { Friend, Group } from 'oicq';
import TelegramChat from '../client/TelegramChat';
import db from './db';
import { getLogger } from 'log4js';

const log = getLogger('ForwardPairs');

export class Pair {
  constructor(public readonly qq: Friend | Group,
              private _tg: TelegramChat,
              public dbId: number) {
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
