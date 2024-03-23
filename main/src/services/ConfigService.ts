import Telegram from '../client/Telegram';
import { Friend, FriendInfo, Group, GroupInfo } from '@icqqjs/icqq';
import { Button } from 'telegram/tl/custom/button';
import { getLogger, Logger } from 'log4js';
import { getAvatar } from '../utils/urls';
import { CustomFile } from 'telegram/client/uploads';
import db from '../models/db';
import { Api, utils } from 'telegram';
import OicqClient from '../client/OicqClient';
import { md5 } from '../utils/hashing';
import TelegramChat from '../client/TelegramChat';
import Instance from '../models/Instance';
import getAboutText from '../utils/getAboutText';
import random from '../utils/random';

const DEFAULT_FILTER_ID = 114; // 514

export default class ConfigService {
  private owner: Promise<TelegramChat>;
  private readonly log: Logger;

  constructor(private readonly instance: Instance,
              private readonly tgBot: Telegram,
              private readonly tgUser: Telegram,
              private readonly oicq: OicqClient) {
    this.log = getLogger(`ConfigService - ${instance.id}`);
    this.owner = tgBot.getChat(this.instance.owner);
  }

  private getAssociateLink(roomId: number) {
    return `https://t.me/${this.tgBot.me.username}?startgroup=${roomId}`;
  }

  // region 打开添加关联的菜单

  // 开始添加转发群组流程
  public async addGroup() {
    const qGroups = Array.from(this.oicq.gl).map(e => e[1])
      .filter(it => !this.instance.forwardPairs.find(-it.group_id));
    const buttons = qGroups.map(e =>
      this.instance.workMode === 'personal' ?
        [Button.inline(
          `${e.group_name} (${e.group_id})`,
          this.tgBot.registerCallback(() => this.onSelectChatPersonal(e)),
        )] :
        [Button.url(
          `${e.group_name} (${e.group_id})`,
          this.getAssociateLink(-e.group_id),
        )]);
    await (await this.owner).createPaginatedInlineSelector(
      '选择 QQ 群组' + (this.instance.workMode === 'group' ? '\n然后选择在 TG 中的群组' : ''), buttons);
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
    await (await this.owner).createPaginatedInlineSelector('选择分组', classes.map(e => [
      Button.inline(e[1], this.tgBot.registerCallback(
        () => this.openFriendSelection(friends.filter(f => f.class_id === e[0]), e[1]),
      )),
    ]));
  }

  private async openFriendSelection(clazz: FriendInfo[], name: string) {
    clazz = clazz.filter(them => !this.instance.forwardPairs.find(them.user_id));
    await (await this.owner).createPaginatedInlineSelector(`选择 QQ 好友\n分组：${name}`, clazz.map(e => [
      Button.inline(`${e.remark || e.nickname} (${e.user_id})`, this.tgBot.registerCallback(
        () => this.onSelectChatPersonal(e),
      )),
    ]));
  }

  private async onSelectChatPersonal(info: FriendInfo | GroupInfo) {
    const roomId = 'user_id' in info ? info.user_id : -info.group_id;
    const name = 'user_id' in info ? info.remark || info.nickname : info.group_name;
    const entity = this.oicq.getChat(roomId);
    const avatar = await getAvatar(roomId);
    const message = await (await this.owner).sendMessage({
      message: await getAboutText(entity, true),
      buttons: [
        [Button.inline('自动创建群组', this.tgBot.registerCallback(
          async () => {
            await message.delete({ revoke: true });
            this.createGroupAndLink(roomId, name);
          }))],
        [Button.url('手动选择现有群组', this.getAssociateLink(roomId))],
      ],
      file: new CustomFile('avatar.png', avatar.length, '', avatar),
    });
  }

  public async addExact(gin: number) {
    const group = this.oicq.gl.get(gin);
    let avatar: Buffer;
    try {
      avatar = await getAvatar(-group.group_id);
    }
    catch (e) {
      avatar = null;
      this.log.error(`加载 ${group.group_name} (${gin}) 的头像失败`, e);
    }
    const message = `${group.group_name}\n${group.group_id}\n${group.member_count} 名成员`;
    await (await this.owner).sendMessage({
      message,
      file: avatar ? new CustomFile('avatar.png', avatar.length, '', avatar) : undefined,
      buttons: Button.url('关联 Telegram 群组', this.getAssociateLink(-group.group_id)),
    });
  }

  // endregion

  /**
   *
   * @param room
   * @param title
   * @param status 传入 false 的话就不显示状态信息，可以传入一条已有消息覆盖
   * @param chat
   */
  public async createGroupAndLink(room: number | Friend | Group, title?: string, status: boolean | Api.Message = true, chat?: TelegramChat) {
    this.log.info(`创建群组并关联：${room}`);
    if (typeof room === 'number') {
      room = this.oicq.getChat(room);
    }
    if (!title) {
      // TS 这边不太智能
      if (room instanceof Friend) {
        title = room.remark || room.nickname;
      }
      else {
        title = room.name;
      }
    }
    let isFinish = false;
    try {
      let errorMessage = '';
      // 状态信息
      if (status === true) {
        const avatar = await getAvatar(room);
        const statusReceiver = chat ? await this.tgBot.getChat(chat.id) : await this.owner;
        status = await statusReceiver.sendMessage({
          message: '正在创建 Telegram 群…',
          file: new CustomFile('avatar.png', avatar.length, '', avatar),
        });
      }
      else if (status instanceof Api.Message) {
        await status.edit({ text: '正在创建 Telegram 群…', buttons: Button.clear() });
      }

      if (!chat) {
        // 创建群聊，拿到的是 user 的 chat
        chat = await this.tgUser.createChat(title, await getAboutText(room, false));

        // 添加机器人
        status && await status.edit({ text: '正在添加机器人…' });
        await chat.inviteMember(this.tgBot.me.id);
      }

      // 设置管理员
      status && await status.edit({ text: '正在设置管理员…' });
      await chat.setAdmin(this.tgBot.me.username);

      // 添加到 Filter
      try {
        status && await status.edit({ text: '正在将群添加到文件夹…' });
        const dialogFilters = await this.tgUser.getDialogFilters() as Api.DialogFilter[];
        const filter = dialogFilters.find(e => e.id === DEFAULT_FILTER_ID);
        if (filter) {
          filter.includePeers.push(utils.getInputPeer(chat));
          await this.tgUser.updateDialogFilter({
            id: DEFAULT_FILTER_ID,
            filter,
          });
        }
      }
      catch (e) {
        errorMessage += `\n添加到文件夹失败：${e.message}`;
      }

      // 关闭【添加成员】快捷条
      try {
        status && await status.edit({ text: '正在关闭【添加成员】快捷条…' });
        await chat.hidePeerSettingsBar();
      }
      catch (e) {
        errorMessage += `\n关闭【添加成员】快捷条失败：${e.message}`;
      }

      // 关联写入数据库
      const chatForBot = await this.tgBot.getChat(chat.id);
      status && await status.edit({ text: '正在写数据库…' });
      const dbPair = await this.instance.forwardPairs.add(room, chatForBot, chat);
      isFinish = true;

      // 更新头像
      try {
        status && await status.edit({ text: '正在更新头像…' });
        const avatar = await getAvatar(room);
        const avatarHash = md5(avatar);
        await chatForBot.setProfilePhoto(avatar);
        await db.avatarCache.create({
          data: { forwardPairId: dbPair.id, hash: avatarHash },
        });
      }
      catch (e) {
        errorMessage += `\n更新头像失败：${e.message}`;
      }

      // 完成
      if (status) {
        await status.edit({ text: '正在获取链接…' });
        const { link } = await chat.getInviteLink() as Api.ChatInviteExported;
        await status.edit({
          text: '创建完成！' + (errorMessage ? '但发生以下错误' + errorMessage : ''),
          buttons: Button.url('打开', link),
        });
      }
    }
    catch (e) {
      this.log.error('创建群组并关联失败', e);
      await (await this.owner).sendMessage(`创建群组并关联${isFinish ? '成功了但没完全成功' : '失败'}\n<code>${e}</code>`);
    }
  }

  public async promptNewQqChat(chat: Group | Friend) {
    const message = await (await this.owner).sendMessage({
      message: '你' +
        (chat instanceof Group ? '加入了一个新的群' : '增加了一' + random.pick('位', '个', '只', '头') + '好友') +
        '：\n' +
        await getAboutText(chat, true) + '\n' +
        '要创建关联群吗',
      buttons: Button.inline('创建', this.tgBot.registerCallback(async () => {
        await message.delete({ revoke: true });
        this.createGroupAndLink(chat, chat instanceof Group ? chat.name : chat.remark || chat.nickname);
      })),
    });
    return message;
  }

  public async createLinkGroup(qqRoomId: number, tgChatId: number) {
    if (this.instance.workMode === 'group') {
      try {
        const qGroup = this.oicq.getChat(qqRoomId) as Group;
        const tgChat = await this.tgBot.getChat(tgChatId);
        const tgUserChat = await this.tgUser.getChat(tgChatId);
        await this.instance.forwardPairs.add(qGroup, tgChat, tgUserChat);
        await tgChat.sendMessage(`QQ群：${qGroup.name} (<code>${qGroup.group_id}</code>)已与 ` +
          `Telegram 群 ${(tgChat.entity as Api.Channel).title} (<code>${tgChatId}</code>)关联`);
        if (!(tgChat.entity instanceof Api.Channel)) {
          // TODO 添加一个转换为超级群组的方法链接
          await tgChat.sendMessage({
            message: '请注意，这个群不是超级群组。一些功能，比如说同步撤回，可能会工作不正常。建议将此群组转换为超级群组',
            linkPreview: false,
          });
        }
      }
      catch (e) {
        this.log.error(e);
        await (await this.owner).sendMessage(`错误：<code>${e}</code>`);
      }
    }
    else {
      const chat = await this.tgUser.getChat(tgChatId);
      await this.createGroupAndLink(qqRoomId, undefined, true, chat);
    }
  }

  // 创建 QQ 群组的文件夹
  public async setupFilter() {
    const result = await this.tgUser.getDialogFilters() as Api.DialogFilter[];
    let filter = result.find(e => e.id === DEFAULT_FILTER_ID);
    if (!filter) {
      this.log.info('创建 TG 文件夹');
      // 要自己计算新的 id，随意 id 也是可以的
      // https://github.com/morethanwords/tweb/blob/7d646bc9a87d943426d831f30b69d61b743f51e0/src/lib/storages/filters.ts#L251
      // 创建
      filter = new Api.DialogFilter({
        id: DEFAULT_FILTER_ID,
        title: 'QQ',
        pinnedPeers: [
          (await this.tgUser.getChat(this.tgBot.me.username)).inputPeer,
        ],
        includePeers: [],
        excludePeers: [],
        emoticon: '🐧',
      });
      let errorText = '设置文件夹失败';
      try {
        const isSuccess = await this.tgUser.updateDialogFilter({
          id: DEFAULT_FILTER_ID,
          filter,
        });
        if (!isSuccess) {
          this.log.error(errorText);
          await (await this.owner).sendMessage(errorText);
        }
      }
      catch (e) {
        this.log.error(errorText, e);
        await (await this.owner).sendMessage(errorText + `\n<code>${e}</code>`);
      }
    }
  }

  public async migrateAllChats() {
    const dbPairs = await db.forwardPair.findMany();
    for (const forwardPair of dbPairs) {
      const chatForUser = await this.tgUser.getChat(Number(forwardPair.tgChatId));
      if (chatForUser.entity instanceof Api.Chat) {
        this.log.info('升级群组 ', chatForUser.id);
        await chatForUser.migrate();
      }
    }
  }
}
