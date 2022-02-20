import { Telegram, TelegramChat } from '../client/Telegram';
import { Client as OicqClient } from 'oicq';
import { config } from '../providers/userConfig';
import { Button } from 'telegram/tl/custom/button';

export default class ConfigService {
  private owner: TelegramChat;

  constructor(private readonly tgBot: Telegram,
              private readonly tgUser: Telegram,
              private readonly oicq: OicqClient) {
    tgBot.getChat(config.owner).then(e => this.owner = e);
  }

  // 开始添加转发群组流程
  public async add() {
    const qGroups = Array.from(this.oicq.gl).map(e => e[1]);
    await this.owner.createPaginatedInlineSelector('选择 QQ 群组\n然后选择在 TG 中的群组',
      qGroups.map(e => [Button.url(
        `${e.group_name} (${e.group_id})`,
        `https://t.me/${this.tgBot.me.username}?startgroup=${e.group_id}`,
      )]));
  }
}
