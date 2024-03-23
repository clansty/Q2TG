import { Api } from 'telegram';
import Telegram from '../client/Telegram';
import OicqClient from '../client/OicqClient';
import ConfigService from '../services/ConfigService';
import regExps from '../constants/regExps';
import {
  FriendIncreaseEvent,
  GroupMessageEvent,
  MemberDecreaseEvent,
  MemberIncreaseEvent,
  PrivateMessageEvent,
} from '@icqqjs/icqq';
import Instance from '../models/Instance';
import { getLogger, Logger } from 'log4js';
import { editFlags } from '../utils/flagControl';
import flags from '../constants/flags';

export default class ConfigController {
  private readonly configService: ConfigService;
  private readonly createPrivateMessageGroupBlockList = new Map<number, Promise<void>>();
  private readonly log: Logger;

  constructor(private readonly instance: Instance,
              private readonly tgBot: Telegram,
              private readonly tgUser: Telegram,
              private readonly oicq: OicqClient) {
    this.log = getLogger(`ConfigController - ${instance.id}`);
    this.configService = new ConfigService(this.instance, tgBot, tgUser, oicq);
    tgBot.addNewMessageEventHandler(this.handleMessage);
    tgBot.addNewServiceMessageEventHandler(this.handleServiceMessage);
    tgBot.addChannelParticipantEventHandler(this.handleChannelParticipant);
    oicq.addNewMessageEventHandler(this.handleQqMessage);
    oicq.on('notice.group.decrease', this.handleGroupDecrease);
    this.instance.workMode === 'personal' && oicq.on('notice.group.increase', this.handleMemberIncrease);
    this.instance.workMode === 'personal' && oicq.on('notice.friend.increase', this.handleFriendIncrease);
    this.instance.workMode === 'personal' && this.configService.setupFilter();
  }

  private handleMessage = async (message: Api.Message) => {
    if (!message.sender.id.eq(this.instance.owner)) {
      return false;
    }
    const messageSplit = message.message.split(' ');
    if (message.isGroup) {
      if (messageSplit.length === 2 && messageSplit[0] === `/start@${this.tgBot.me.username}` && regExps.roomId.test(messageSplit[1])) {
        await this.configService.createLinkGroup(Number(messageSplit[1]), Number(message.chat.id));
        return true;
      }
      else
        return false;
    }
    else if (message.isPrivate) {
      switch (messageSplit[0]) {
        case '/flag':
        case '/flags':
          messageSplit.shift();
          await message.reply({
            message: await editFlags(messageSplit, this.instance),
          });
          return true;
      }
      if (this.instance.workMode === 'personal') {
        switch (messageSplit[0]) {
          case '/addfriend':
            await this.configService.addFriend();
            return true;
          case '/addgroup':
            await this.configService.addGroup();
            return true;
          case '/migrate':
            await this.configService.migrateAllChats();
            return true;
          case '/login':
            await this.oicq.login();
            return true;
        }
      }
      else {
        switch (messageSplit[0]) {
          case '/add':
            // 加的参数永远是正的群号
            if (messageSplit.length === 3 && regExps.qq.test(messageSplit[1]) && !isNaN(Number(messageSplit[2]))) {
              await this.configService.createLinkGroup(-Number(messageSplit[1]), Number(messageSplit[2]));
            }
            else if (messageSplit[1] && regExps.qq.test(messageSplit[1])) {
              await this.configService.addExact(Number(messageSplit[1]));
            }
            else {
              await this.configService.addGroup();
            }
            return true;
        }
      }
    }
  };

  private handleServiceMessage = async (message: Api.MessageService) => {
    // 用于检测群升级为超级群的情况
    if (message.action instanceof Api.MessageActionChatMigrateTo) {
      const pair = this.instance.forwardPairs.find((message.peerId as Api.PeerChat).chatId);
      if (!pair) return;
      // 会自动写入数据库
      pair.tg = await this.tgBot.getChat(message.action.channelId);
      // 升级之后 bot 的管理权限可能没了，需要修复一下
      if (this.instance.workMode === 'personal') {
        const chatForUser = await this.tgUser.getChat(message.action.channelId);
        await chatForUser.setAdmin(this.tgBot.me.username);
      }
      else {
        await pair.tg.sendMessage({
          message: '本群已升级为超级群，可能需要重新设置一下管理员权限',
          silent: true,
        });
      }
    }
  };

  private handleQqMessage = async (message: GroupMessageEvent | PrivateMessageEvent) => {
    if (message.message_type !== 'private' || this.instance.workMode === 'group') return false;
    if (this.instance.flags & flags.NO_AUTO_CREATE_PM) return false;
    const pair = this.instance.forwardPairs.find(message.friend);
    if (pair) return false;
    // 如果正在创建中，应该阻塞
    let promise = this.createPrivateMessageGroupBlockList.get(message.from_id);
    if (promise) {
      await promise;
      return false;
    }
    // 有未创建转发群的新私聊消息时自动创建
    promise = this.configService.createGroupAndLink(message.from_id, message.friend.remark || message.friend.nickname, true);
    this.createPrivateMessageGroupBlockList.set(message.from_id, promise);
    await promise;
    return false;
  };

  private handleMemberIncrease = async (event: MemberIncreaseEvent) => {
    if (event.user_id !== this.oicq.uin || this.instance.forwardPairs.find(event.group)) return;
    // 是新群并且是自己加入了
    await this.configService.promptNewQqChat(event.group);
  };

  private handleFriendIncrease = async (event: FriendIncreaseEvent) => {
    if (this.instance.forwardPairs.find(event.friend)) return;
    await this.configService.promptNewQqChat(event.friend);
  };

  private handleChannelParticipant = async (event: Api.UpdateChannelParticipant) => {
    if (event.prevParticipant && 'userId' in event.prevParticipant &&
      event.prevParticipant.userId.eq(this.tgBot.me.id) &&
      !event.newParticipant) {
      this.log.warn(`群 ${event.channelId.toString()} 删除了`);
      const pair = this.instance.forwardPairs.find(event.channelId);
      if (pair) {
        await this.instance.forwardPairs.remove(pair);
        this.log.info(`已删除关联 ID: ${pair.dbId}`);
      }
    }
  };

  private handleGroupDecrease = async (event: MemberDecreaseEvent) => {
    // 如果是自己被踢出群，则删除对应的配置
    // 如果是群主解散群，则删除对应的配置
    if (event.user_id !== this.oicq.uin) return;
    const pair = this.instance.forwardPairs.find(event.group);
    if (!pair) return;
    await this.instance.forwardPairs.remove(pair);
    this.log.info(`已删除关联 ID: ${pair.dbId}`);
    if (this.instance.workMode === 'personal') {
      const message = await pair.tg.sendMessage(event.dismiss ? '<i>群解散了</i>' : '<i>群已被踢出</i>');
      await message.pin();
    }
  };
}
