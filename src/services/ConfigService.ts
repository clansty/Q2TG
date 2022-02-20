import { Telegram, TelegramChat } from '../client/Telegram';
import { Client as OicqClient } from 'oicq';
import { config } from '../providers/userConfig';
import { Button } from 'telegram/tl/custom/button';
import { getLogger } from 'log4js';
import axios from 'axios';
import { getAvatarUrl } from '../utils/urls';
import { CustomFile } from 'telegram/client/uploads';

export default class ConfigService {
  private owner: TelegramChat;
  private log = getLogger('ConfigService');

  constructor(private readonly tgBot: Telegram,
              private readonly tgUser: Telegram,
              private readonly oicq: OicqClient) {
    tgBot.getChat(config.owner).then(e => this.owner = e);
  }

  private getAssociateLink(gin: number) {
    return `https://t.me/${this.tgBot.me.username}?startgroup=${gin}`;
  }

  // 开始添加转发群组流程
  public async add() {
    const qGroups = Array.from(this.oicq.gl).map(e => e[1]);
    await this.owner.createPaginatedInlineSelector('选择 QQ 群组\n然后选择在 TG 中的群组',
      qGroups.map(e => [Button.url(
        `${e.group_name} (${e.group_id})`,
        this.getAssociateLink(e.group_id),
      )]));
  }

  public async addExact(gin: number) {
    const group = this.oicq.gl.get(gin);
    let avatar: Buffer;
    try {
      const res = await axios.get(getAvatarUrl(-group.group_id), {
        responseType: 'arraybuffer',
      });
      avatar = res.data;
    }
    catch (e) {
      avatar = null;
      this.log.error(`加载 ${group.group_name} (${gin}) 的头像失败`, e);
    }
    const message = `${group.group_name}\n${group.group_id}\n${group.member_count} 名成员`;
    await this.owner.sendMessage({
      message,
      file: avatar ? new CustomFile('avatar.png', avatar.length, '', avatar) : undefined,
      buttons: Button.url('关联 Telegram 群组', this.getAssociateLink(group.group_id)),
    });
  }
}
