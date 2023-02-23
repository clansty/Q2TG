import { Friend, Group } from 'oicq';
import TelegramChat from '../client/TelegramChat';
import OicqClient from '../client/OicqClient';
import Telegram from '../client/Telegram';
import db from './db';
import { Entity } from 'telegram/define';
import { BigInteger } from 'big-integer';
import { Pair } from './Pair';
import { getLogger, Logger } from 'log4js';
import Instance from './Instance';

export default class ForwardPairs {
  private pairs: Pair[] = [];
  private readonly log: Logger;

  private constructor(private readonly instanceId: number) {
    this.log = getLogger(`ForwardPairs - ${instanceId}`);
  }

  // 在 forwardController 创建时初始化
  private async init(oicq: OicqClient, tgBot: Telegram) {
    const dbValues = await db.forwardPair.findMany({
      where: { instanceId: this.instanceId },
    });
    for (const i of dbValues) {
      try {
        const qq = oicq.getChat(Number(i.qqRoomId));
        const tg = await tgBot.getChat(Number(i.tgChatId));
        if (qq && tg) {
          this.pairs.push(new Pair(qq, tg, i.id, i.joinNotice, i.poke, i.enable, i.disableQ2TG, i.disableTG2Q));
        }
      }
      catch (e) {
        this.log.warn(`初始化遇到问题，QQ: ${i.qqRoomId} TG: ${i.tgChatId}`);
      }
    }
  }

  public static async load(instanceId: number, oicq: OicqClient, tgBot: Telegram) {
    const instance = new this(instanceId);
    await instance.init(oicq, tgBot);
    return instance;
  }

  public async add(qq: Friend | Group, tg: TelegramChat) {
    const dbEntry = await db.forwardPair.create({
      data: {
        qqRoomId: qq instanceof Friend ? qq.user_id : -qq.group_id,
        tgChatId: Number(tg.id),
        instanceId: this.instanceId,
      },
    });
    this.pairs.push(new Pair(qq, tg, dbEntry.id, true, true, true, false, false));
    return dbEntry;
  }

  public async remove(pair: Pair) {
    this.pairs.splice(this.pairs.indexOf(pair), 1);
    await db.forwardPair.delete({
      where: { id: pair.dbId },
    });
  }

  public find(target: Friend | Group | TelegramChat | Entity | number | BigInteger) {
    if (!target) return null;
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

  public async initMapInstance(instances: Instance[]) {
    for (const forwardPair of this.pairs) {
      for (const instance of instances) {
        const instanceTgUserId = instance.userMe.id.toString();
        if (forwardPair.instanceMapForTg[instanceTgUserId]) continue;
        try {
          const group = instance.oicq.getChat(forwardPair.qqRoomId) as Group;
          if (!group) continue;
          forwardPair.instanceMapForTg[instanceTgUserId] = group;
          this.log.info('MapInstance', { group: forwardPair.qqRoomId, tg: instanceTgUserId, qq: instance.qqUin });
        }
        catch {
        }
      }
    }
  }
}
