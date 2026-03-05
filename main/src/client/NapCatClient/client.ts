import { CreateQQClientParamsBase, Friend, FriendIncreaseEvent, Group, GroupMemberDecreaseEvent, GroupMemberIncreaseEvent, GroupNameChangeEvent, InputStatusChangeEvent, MessageEvent, MessageRecallEvent, PokeEvent, QQClient, SendableElem } from '../QQClient';
import random from '../../utils/random';
import { getLogger, Logger } from 'log4js';
import posthog from '../../models/posthog';
import type { Receive, WSReceiveHandler, WSSendParam, WSSendReturn } from 'node-napcat-ts';
import { NapCatFriend, NapCatGroup } from './entity';
import { napCatReceiveToMessageElem } from './convert';
import { NapCatFriendRequestEvent, NapCatGroupEvent, NapCatGroupInviteEvent } from './event';
import type { ImageElem } from '@icqqjs/icqq';
import ReconnectingWebSocket from 'reconnecting-websocket';

export interface CreateNapCatParams extends CreateQQClientParamsBase {
  type: 'napcat';
  wsUrl: string;
}

export class NapCatClient extends QQClient {
  private constructor(id: number, private readonly wsUrl: string) {
    super(id);
    this.logger = getLogger(`NapCatClient - ${id}`);
    this.ws = new ReconnectingWebSocket(wsUrl);
    this.ws.onmessage = (e) => this.handleWebSocketMessage(e.data);
  }

  private readonly ws: ReconnectingWebSocket;
  private readonly logger: Logger;

  public static async create(params: CreateNapCatParams) {
    const instance = new this(params.id, params.wsUrl);
    return new Promise<NapCatClient>((resolve, reject) => {
      instance.ws.onopen = async () => {
        instance.logger.info('WS 连接成功');
        instance.ws.onerror = null;
        await instance.refreshSelf();
        resolve(instance);
      };
      instance.ws.onerror = (e) => {
        instance.logger.error('WS 连接出错', e);
        posthog.capture('WS 连接出错', { error: e });
        reject(e);
      };
    });
  }

  private readonly echoMap = new Map<string, { resolve: (result: any) => void; reject: (result: any) => void }>();
  private echoSeq = 0;

  public async callApi<T extends keyof WSSendReturn>(action: T, params?: WSSendParam[T]): Promise<WSSendReturn[T]> {
    return new Promise<WSSendReturn[T]>((resolve, reject) => {
      const echo = `${new Date().getTime()}-${this.echoSeq++}-${random.int(100000, 999999)}`;
      this.echoMap.set(echo, { resolve, reject });
      this.ws.send(JSON.stringify({ action, params, echo }));
      this.logger.debug('send', JSON.stringify({ action, params, echo }));
    });
  }

  private async handleWebSocketMessage(message: string) {
    this.logger.debug('receive', message);
    const data = JSON.parse(message) as WSReceiveHandler[keyof WSReceiveHandler] & { echo: string; status: 'ok' | 'error'; data: any; message: string };
    if (data.echo) {
      const promise = this.echoMap.get(data.echo);
      if (!promise) return;
      this.echoMap.delete(data.echo);
      if (data.status === 'ok') {
        promise.resolve(data.data);
      }
      else {
        promise.reject(data.message);
      }
      return;
    }
    if (data.post_type === 'message')
      await this.handleMessage(data);
    else if (data.post_type === 'notice' && data.notice_type === 'group_increase')
      await this.handleGroupIncrease(data);
    else if (data.post_type === 'notice' && data.notice_type === 'group_decrease')
      await this.handleGroupDecrease(data);
    else if (data.post_type === 'notice' && data.notice_type === 'friend_add')
      await this.handleFriendIncrease(data);
    else if (data.post_type === 'notice' && data.notice_type === 'friend_recall')
      await this.handleMessageRecall(data);
    else if (data.post_type === 'notice' && data.notice_type === 'group_recall')
      await this.handleMessageRecall(data);
    else if (data.post_type === 'notice' && data.notice_type === 'notify' && data.sub_type === 'poke')
      await this.handlePoke(data);
    else if (data.post_type === 'notice' && data.notice_type === 'notify' && data.sub_type === 'input_status')
      await this.handleInput(data);
    // @ts-ignore
    else if (data.post_type === 'notice' && data.notice_type === 'notify' && data.sub_type === 'group_name')
      await this.handleGroupNameChange(data);
    else if (data.post_type === 'request' && data.request_type === 'friend')
      await this.handleFriendRequest(data);
    else if (data.post_type === 'request' && data.request_type === 'group' && data.sub_type === 'invite')
      await this.handleGroupRequest(data);
  }

  public uin: number;
  public nickname: string;

  private async handleMessage(data: WSReceiveHandler['message']) {
    let chat: Friend | Group;
    if (data.message_type === 'private') {
      // sender 一定是对方
      chat = NapCatFriend.createExisted(this, { uid: data.user_id, remark: data.sender.card, nickname: data.sender.nickname });
    }
    else {
      // 上报没有群名
      chat = await this.pickGroup(data.group_id);
    }
    const message = (data.message as unknown as Receive[keyof Receive][]);
    const replyNode = message.find(it => it.type === 'reply');
    if (replyNode) {
      message.splice(message.indexOf(replyNode), 1);
    }
    const replyMessage = replyNode ? await this.getMessage(replyNode.data.id) : undefined;
    const event = new MessageEvent(
      { id: data.sender.user_id, card: data.sender.card, nickname: data.sender.nickname, name: data.sender.card || data.sender.nickname },
      chat,
      message.map(napCatReceiveToMessageElem),
      data.message_id,
      0, 0,
      data.time,
      data.raw_message,
      replyMessage ? {
        message: (replyMessage as any).message.filter(it => it.type !== 'reply').map(napCatReceiveToMessageElem),
        rand: 0, fromId: replyMessage.sender.user_id, seq: replyMessage.message_id, time: replyMessage.time,
      } : undefined,
      undefined,
      data.message_id.toString(),
      replyMessage?.sender.user_id === this.uin || message.some(it => it.type === 'at' && it.data.qq.toString() === this.uin.toString()),
      message.some(it => it.type === 'at' && (it.data.qq.toString() === '0' || !it.data.qq || it.data.qq === 'all')),
    );
    for (const handler of this.onMessageHandlers) {
      if (await handler(event)) {
        break;
      }
    }
  }

  private async handleGroupIncrease(data: WSReceiveHandler['notice.group_increase']) {
    const user = await this.callApi('get_stranger_info', { user_id: data.user_id });
    const event = new GroupMemberIncreaseEvent(await this.pickGroup(data.group_id), data.user_id, user.nickname);
    await this.callHandlers(this.onGroupMemberIncreaseHandlers, event);
  }

  private async handleGroupDecrease(data: WSReceiveHandler['notice.group_decrease']) {
    const event = new GroupMemberDecreaseEvent(await this.pickGroup(data.group_id), data.user_id, data.operator_id, false);
    await this.callHandlers(this.onGroupMemberDecreaseHandlers, event);
  }

  private async handleFriendIncrease(data: WSReceiveHandler['notice.friend_add']) {
    const event = new FriendIncreaseEvent(await NapCatFriend.create(this, data.user_id));
    await this.callHandlers(this.onFriendIncreaseHandlers, event);
  }

  private async handleMessageRecall(data: WSReceiveHandler['notice.friend_recall'] | WSReceiveHandler['notice.group_recall']) {
    const chat = data.notice_type === 'friend_recall' ? await this.pickFriend(data.user_id) : await this.pickGroup(data.group_id);
    const event = new MessageRecallEvent(chat, data.message_id, 0, data.time);
    await this.callHandlers(this.onMessageRecallHandlers, event);
  }

  private async handlePoke(data: WSReceiveHandler['notice.notify.poke.group'] | WSReceiveHandler['notice.notify.poke.friend']) {
    const nonSelfId = data.user_id === this.uin ? data.target_id : data.user_id;
    const chat = 'group_id' in data ? await this.pickGroup(data.group_id) : await this.pickFriend(nonSelfId);
    const operator = 'sender_id' in data ? data.sender_id as number : data.user_id;
    const nors: any[] = data.raw_info?.filter(it => (it.type as any) === 'nor') || [];
    const event = new PokeEvent(chat, operator, data.target_id, nors[0]?.txt, nors[1]?.txt);
    await this.callHandlers(this.onPokeHandlers, event);
  }

  private async handleInput(data: WSReceiveHandler['notice.notify.input_status']) {
    await this.callHandlers(this.onInputStatusChangeHandlers, new InputStatusChangeEvent(await this.pickFriend(data.user_id), !!data.status_text));
  }

  private async handleGroupNameChange(data: { group_id: number; user_id: number; name_new: string }) {
    const group = await this.pickGroup(data.group_id);
    await this.callHandlers(this.onGroupNameChangeHandlers, new GroupNameChangeEvent(group, group.pickMember(data.user_id), data.name_new));
  }

  private async handleFriendRequest(data: WSReceiveHandler['request.friend']) {
    const event = await NapCatFriendRequestEvent.create(this, data);
    await this.callHandlers(this.onFriendRequestHandlers, event);
  }

  private async handleGroupRequest(data: WSReceiveHandler['request.group']) {
    const event = await NapCatGroupEvent.create(this, data);
    // 上面过滤过了
    await this.callHandlers(this.onGroupInviteHandlers, event as NapCatGroupInviteEvent);
  }

  public async getMessage(messageId: number | string) {
    return await this.callApi('get_msg', { message_id: messageId as any });
  }

  public async refreshSelf() {
    const data = await this.callApi('get_login_info');
    this.uin = data.user_id;
    this.nickname = data.nickname;
  }

  public async isOnline(): Promise<boolean> {
    const data = await this.callApi('get_status');
    return data.online;
  }

  public async getFriendsWithCluster(): Promise<{ name: string; friends: Friend[]; }[]> {
    const data = await this.callApi('get_friends_with_category');
    if (data[0].buddyList === undefined) {
      const categories = new Map<number, { name: string; friends: Friend[]; }>();
      for (const _entry of data) {
        const it = _entry as any;
        let category = categories.get(it.categoryId);
        if (!category) {
          category = { name: it.categoryName || it.categroyName, friends: [] };
          categories.set(it.categoryId, category);
        }
        category.friends.push(NapCatFriend.createExisted(this, {
          nickname: it.nick || it.nickname,
          uid: parseInt(it.uin || it.user_id),
          remark: it.remark,
        }));
      }
      return Array.from(categories.values());
    }
    return data.map(it => ({
      name: it.categoryName || (it as any).categroyName, // typo in API
      friends: it.buddyList.map(friend => NapCatFriend.createExisted(this, {
        nickname: friend.nick || friend.nickname,
        uid: parseInt(friend.uin || friend.user_id),
        remark: friend.remark,
      })),
    }));
  }

  public pickFriend(uin: number): Promise<Friend> {
    return NapCatFriend.create(this, uin);
  }

  public async getGroupList(): Promise<Group[]> {
    const data = await this.callApi('get_group_list');
    return data.map(it => NapCatGroup.createExisted(this, {
      gid: it.group_id,
      name: it.group_name,
    }));
  }

  public pickGroup(groupId: number): Promise<Group> {
    return NapCatGroup.create(this, groupId);
  }

  override async createSpoilerImageEndpoint(image: ImageElem, nickname: string, title?: string): Promise<SendableElem[]> {
    const res: SendableElem[] = [
      {
        type: 'node',
        user_id: this.uin,
        nickname,
        message: image,
      },
    ];
    if (title) {
      res.push({
        type: 'node',
        user_id: this.uin,
        nickname,
        message: {
          type: 'text',
          text: title,
        },
      });
    }
    return res;
  }
}
