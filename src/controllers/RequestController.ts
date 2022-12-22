import { getLogger, Logger } from 'log4js';
import Instance from '../models/Instance';
import Telegram from '../client/Telegram';
import OicqClient from '../client/OicqClient';
import { FriendRequestEvent, GroupInviteEvent } from 'icqq';
import { getAvatar } from '../utils/urls';
import { CustomFile } from 'telegram/client/uploads';
import { Button } from 'telegram/tl/custom/button';

export default class RequestController {
  private readonly log: Logger;

  constructor(private readonly instance: Instance,
              private readonly tgBot: Telegram,
              private readonly oicq: OicqClient) {
    this.log = getLogger(`RequestController - ${instance.id}`);
    oicq.on('request.friend', this.handleRequest);
    oicq.on('request.group.invite', this.handleRequest);
  }

  private handleRequest = async (event: FriendRequestEvent | GroupInviteEvent) => {
    this.log.info(`收到申请：${event.nickname} (${event.user_id})`);
    const avatar = await getAvatar(event.user_id);
    let messageText = '';
    if (event.request_type === 'friend') {
      messageText = `收到好友申请\n` +
        `<b>昵称：</b>${event.nickname}\n` +
        `<b>账号：</b><code>${event.user_id}</code>\n` +
        `<b>年龄：</b>${event.age}\n` +
        `<b>性别：</b>${event.sex}\n` +
        `<b>来源：</b>${event.source}\n` +
        `<b>附言：</b>${event.comment}`;
    }
    else {
      messageText = `收到加群邀请\n` +
        `<b>邀请人：</b>${event.nickname} (<code>${event.user_id}</code>)\n` +
        `<b>群名称：</b>${event.group_name}\n` +
        `<b>群号：</b>${event.group_id}\n` +
        `<b>邀请者身份：</b>${event.role}`;
    }
    const message = await this.instance.ownerChat.sendMessage({
      file: new CustomFile('avatar.png', avatar.length, '', avatar),
      message: messageText,
      buttons: [[
        Button.inline('同意', this.tgBot.registerCallback(async () => {
          try {
            if (!await event.approve(true)) {
              await message.edit({ text: '同意失败', buttons: Button.clear() });
            }
          }
          catch (e) {
            await message.edit({ text: `同意失败：${e.message}`, buttons: Button.clear() });
          }
          await message.edit({ text: '已同意请求', buttons: Button.clear() });
        })),
        Button.inline('拒绝', this.tgBot.registerCallback(async () => {
          try {
            if (!await event.approve(false)) {
              await message.edit({ text: '拒绝失败', buttons: Button.clear() });
            }
          }
          catch (e) {
            await message.edit({ text: `拒绝失败：${e.message}`, buttons: Button.clear() });
          }
          await message.edit({ text: '已拒绝请求', buttons: Button.clear() });
        })),
      ]],
    });
  };
}
