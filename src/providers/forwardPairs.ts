import { Friend, Group } from 'oicq';
import TelegramChat from '../client/TelegramChat';
import OicqClient from '../client/OicqClient';
import Telegram from '../client/Telegram';
import db from './db';
import { Entity } from 'telegram/define';
import { getLogger } from 'log4js';
import { BigInteger } from 'big-integer';

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

class ForwardPairsInternal {
  private pairs: Pair[] = [];

  // 在 forwardController 创建时初始化
  public async init(oicq: OicqClient, tgBot: Telegram) {
    const dbValues = await db.forwardPair.findMany();
    for (const i of dbValues) {
      this.pairs.push(new Pair(
        oicq.getChat(Number(i.qqRoomId)),
        await tgBot.getChat(Number(i.tgChatId)),
        i.id,
      ));
    }
  }

  public async add(qq: Friend | Group, tg: TelegramChat) {
    const dbEntry = await db.forwardPair.create({
      data: {
        qqRoomId: qq instanceof Friend ? qq.user_id : -qq.group_id,
        tgChatId: Number(tg.id),
      },
    });
    this.pairs.push(new Pair(qq, tg, dbEntry.id));
    return dbEntry;
  }

  public find(target: Friend | Group | TelegramChat | Entity | number | BigInteger) {
    if (target instanceof Friend) {
      return this.pairs.find(e => e.qq instanceof Friend && e.qq.user_id === target.user_id);
    }
    else if (target instanceof Group) {
      return this.pairs.find(e => e.qq instanceof Group && e.qq.group_id === target.group_id);
    }
    else if (typeof target === 'number' || 'eq' in target) {
      return this.pairs.find(e => e.qqRoomId === target || e.tg.id.eq(target));
    }
    else {
      return this.pairs.find(e => e.tg.id.eq(target.id));
    }
  }
}

export default new ForwardPairsInternal();
