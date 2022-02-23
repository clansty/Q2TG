import { Telegram, TelegramChat } from '../client/Telegram';
import { Client as OicqClient, FriendInfo } from 'oicq';
import { config } from '../providers/userConfig';
import { Button } from 'telegram/tl/custom/button';
import { getLogger } from 'log4js';
import axios from 'axios';
import { getAvatarUrl } from '../utils/urls';
import { CustomFile } from 'telegram/client/uploads';
import db from '../providers/db';
import { Api, utils } from 'telegram';
import commands from '../constants/commands';

const DEFAULT_FILTER_ID = 114; // 514

export default class ConfigService {
  private owner: TelegramChat;
  private log = getLogger('ConfigService');
  private filter;

  constructor(private readonly tgBot: Telegram,
              private readonly tgUser: Telegram,
              private readonly oicq: OicqClient) {
    tgBot.getChat(config.owner).then(e => this.owner = e);
  }

  private getAssociateLink(roomId: number) {
    return `https://t.me/${this.tgBot.me.username}?startgroup=${roomId}`;
  }

  public async configCommands() {
    // 这个在一初始化好就要调用，所以不能直接用 this.owner
    await this.tgBot.setCommands([], new Api.BotCommandScopeUsers());
    await this.tgBot.setCommands(
      config.workMode === 'personal' ? commands.personalPrivateCommands : commands.groupPrivateCommands,
      new Api.BotCommandScopePeer({
        peer: utils.getInputPeer((await this.tgBot.getChat(config.owner)).entity),
      }),
    );
  }

  // region 打开添加关联的菜单

  // 开始添加转发群组流程
  public async addGroup() {
    const qGroups = Array.from(this.oicq.gl).map(e => e[1]);
    const buttons = qGroups.map(e =>
      config.workMode === 'personal' ?
        [Button.inline(
          `${e.group_name} (${e.group_id})`,
          this.tgBot.registerCallback(() => this.createGroupAndLink(-e.group_id)),
        )] :
        [Button.url(
          `${e.group_name} (${e.group_id})`,
          this.getAssociateLink(-e.group_id),
        )]);
    await this.owner.createPaginatedInlineSelector(
      '选择 QQ 群组' + (config.workMode === 'group' ? '\n然后选择在 TG 中的群组' : ''), buttons);
  }

  // 只可能是 personal 运行模式
  public async addFriend() {
    const classes = Array.from(this.oicq.classes);
    const friends = Array.from(this.oicq.fl).map(e => e[1]);
    classes.sort((a, b) => {
      if (a[1] < b[1]) {
        return -1;
      }
      else if (a[1] == b[1]) {
        return 0;
      }
      else {
        return 1;
      }
    });
    await this.owner.createPaginatedInlineSelector('选择分组', classes.map(e => [
      Button.inline(e[1], this.tgBot.registerCallback(
        () => this.openFriendSelection(friends.filter(f => f.class_id === e[0]), e[1]),
      )),
    ]));
  }

  private async openFriendSelection(clazz: FriendInfo[], name: string) {
    await this.owner.createPaginatedInlineSelector(`选择 QQ 好友\n分组：${name}`, clazz.map(e => [
      Button.inline(`${e.remark || e.nickname} (${e.user_id})`, this.tgBot.registerCallback(
        () => this.createGroupAndLink(e.user_id),
      )),
    ]));
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
      buttons: Button.url('关联 Telegram 群组', this.getAssociateLink(-group.group_id)),
    });
  }

  // endregion

  private async createGroupAndLink(roomId: number) {
    this.log.info(`创建群组并关联：${roomId}`);
  }

  public async createLinkGroup(qqRoomId: number, tgChatId: number) {
    let message: string;
    try {
      const qGroup = this.oicq.gl.get(-qqRoomId);
      const tgChat = (await this.tgBot.getChat(tgChatId)).entity as Api.Chat;
      message = `QQ群：${qGroup.group_name} (<code>${qGroup.group_id}</code>)已与 Telegram 群 ${tgChat.title} (<code>${tgChatId}</code>)关联`;
      await db.forwardPair.create({
        data: { qqRoomId, tgChatId },
      });
    }
    catch (e) {
      message = `错误：<code>${e}</code>`;
    }
    await this.owner.sendMessage({ message });
  }

  // 创建 QQ 群组的文件夹
  public async setupFilter() {
    const result = await this.tgUser.getDialogFilters();
    this.filter = result.find(e => e.id === DEFAULT_FILTER_ID);
    this.log.debug(this.filter);
    if (!this.filter) {
      this.log.info('创建 TG 文件夹');
      // 要自己计算新的 id，随意 id 也是可以的
      // https://github.com/morethanwords/tweb/blob/7d646bc9a87d943426d831f30b69d61b743f51e0/src/lib/storages/filters.ts#L251
      // 创建
      this.filter = new Api.DialogFilter({
        id: DEFAULT_FILTER_ID,
        title: 'QQ',
        pinnedPeers: [
          utils.getInputPeer((await this.tgUser.getChat(this.tgBot.me.username)).entity),
        ],
        includePeers: [],
        excludePeers: [],
        emoticon: '🐧',
      });
      let errorText = '设置文件夹失败';
      try {
        const isSuccess = await this.tgUser.updateDialogFilter({
          id: DEFAULT_FILTER_ID,
          filter: this.filter,
        });
        if (!isSuccess) {
          this.filter = null;
          this.log.error(errorText);
          await this.owner.sendMessage(errorText);
        }
      }
      catch (e) {
        this.filter = null;
        this.log.error(errorText, e);
        await this.owner.sendMessage(errorText + `\n<code>${e}</code>`);
      }
    }
  }
}
