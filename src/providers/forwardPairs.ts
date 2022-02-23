import { Friend, Group } from 'oicq';
import TelegramChat from '../client/TelegramChat';
import { Api } from 'telegram';
import OicqClient from '../client/OicqClient';
import Telegram from '../client/Telegram';
import db from './db';

type Pair = {
  qq: Friend | Group;
  tg: TelegramChat;
}

class ForwardPairsInternal {
  private pairs: Pair[] = [];

  // 在 forwardController 创建时初始化
  public async init(oicq: OicqClient, tgBot: Telegram) {
    const dbValues = await db.forwardPair.findMany();
    for (const i of dbValues) {
      this.pairs.push({
        qq: oicq.getChat(i.qqRoomId),
        tg: await tgBot.getChat(i.tgChatId),
      });
    }
  }

  public async add(qq: Friend | Group, tg: TelegramChat) {
    this.pairs.push({ qq, tg });
    return await db.forwardPair.create({
      data: {
        qqRoomId: qq instanceof Friend ? qq.user_id : -qq.group_id,
        tgChatId: Number(tg.id),
      },
    });
  }

  public find(target: Friend | Group | TelegramChat | Api.Chat) {
    if (target instanceof Friend) {
      return this.pairs.find(e => e.qq instanceof Friend && e.qq.user_id === target.user_id);
    }
    else if (target instanceof Group) {
      return this.pairs.find(e => e.qq instanceof Group && e.qq.group_id === target.group_id);
    }
    else {
      return this.pairs.find(e => e.tg.id.eq(target.id));
    }
  }
}

export default new ForwardPairsInternal();
