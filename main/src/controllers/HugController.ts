import Instance from '../models/Instance';
import Telegram from '../client/Telegram';
import { AtElem } from '@icqqjs/icqq';
import { Pair } from '../models/Pair';
import { Api } from 'telegram';
import db from '../models/db';
import BigInteger from 'big-integer';
import helper from '../helpers/forwardHelper';
import { getLogger, Logger } from 'log4js';
import flags from '../constants/flags';
import { MessageEvent, QQClient, Group, GroupMemberInfo, Sendable } from '../client/QQClient';
import { Member as OicqMember } from '@icqqjs/icqq/lib/member';
import env from '../models/env';
import forwardHelper from '../helpers/forwardHelper';

type ActionSubjectTg = {
  name: string;
  id: Api.TypeInputUser | Api.InputPeerUser;
  from: 'tg';
}

type ActionSubjectQq = {
  name: string;
  id: number;
  from: 'qq';
}

type ActionSubject = ActionSubjectTg | ActionSubjectQq;

const COMMAND_REGEX = /(^\/([^\w\s$¥]\S*)|^\/[$¥](\w\S*))( (\S*))?/; // /抱 /$rua

export default class {
  private readonly log: Logger;

  constructor(private readonly instance: Instance,
              private readonly tgBot: Telegram,
              private readonly oicq: QQClient) {
    this.log = getLogger(`HugController - ${instance.id}`);
    oicq.addNewMessageEventHandler(this.onQqMessage);
    tgBot.addNewMessageEventHandler(this.onTelegramMessage);
  }

  private onQqMessage = async (event: MessageEvent) => {
    if (event.dm) return;
    const pair = this.instance.forwardPairs.find(event.chat);
    if (!pair) return;
    if ((pair.flags | this.instance.flags) & flags.DISABLE_SLASH_COMMAND) return;
    const chain = [...event.message];
    if (chain.some(it => it.type === 'face')) return;
    while (chain.length && chain[0].type !== 'text') {
      chain.shift();
    }
    const firstElem = chain[0];
    if (firstElem?.type !== 'text') return;
    const exec = COMMAND_REGEX.exec(firstElem.text.trim());
    if (!exec) return;
    const action = exec[2] || exec[3];
    if (!action) return;
    const from: ActionSubject = {
      from: 'qq',
      name: event.from.name,
      id: event.from.id,
    };
    let to: ActionSubject;
    const ats = chain.filter(it => it.type === 'at') as AtElem[];
    if (ats.length) {
      const atName = ats[0].text.startsWith('@') ? ats[0].text.substring(1) : ats[0].text;
      to = {
        from: 'qq',
        name: atName,
        id: ats[0].qq as number,
      };
    }
    else if (event.replyTo && event.replyTo.fromId === this.oicq.uin) {
      // 来自 tg
      const sourceMessage = await db.message.findFirst({
        where: {
          instanceId: this.instance.id,
          qqRoomId: pair.qqRoomId,
          qqSenderId: event.replyTo.fromId,
          seq: event.replyTo.seq,
          // rand: event.source.rand,
        },
      });
      if (!sourceMessage) {
        this.log.error('找不到 sourceMessage');
        return true;
      }
      to = {
        from: 'tg',
        id: (await this.tgBot.getChat(BigInteger(sourceMessage.tgSenderId))).inputPeer as Api.InputPeerUser,
        name: sourceMessage.nick,
      };
    }
    else if (event.replyTo) {
      const sourceMember = (pair.qq as Group).pickMember(event.replyTo.fromId);
      let memberInfo: GroupMemberInfo;
      if (sourceMember instanceof OicqMember) {
        memberInfo = sourceMember.info;
      }
      else {
        memberInfo = await sourceMember.renew();
      }
      to = {
        from: 'qq',
        name: memberInfo.card || memberInfo.nickname,
        id: event.replyTo.fromId,
      };
    }
    else {
      to = {
        from: 'qq',
        name: '自己',
        id: event.from.id,
      };
    }
    await this.sendAction(pair, from, to, action, exec[5]);
    return true;
  };

  private onTelegramMessage = async (message: Api.Message) => {
    const pair = this.instance.forwardPairs.find(message.chat);
    if (!pair) return;
    if ((pair.flags | this.instance.flags) & flags.DISABLE_SLASH_COMMAND) return;
    const exec = COMMAND_REGEX.exec(message.message);
    if (!exec) return;
    const action = exec[2] || exec[3];
    if (!action) return;
    const from: ActionSubject = {
      from: 'tg',
      name: helper.getUserDisplayName(message.sender),
      id: (await this.tgBot.getChat(message.senderId)).inputPeer as Api.InputPeerUser,
    };
    let to: ActionSubject;
    if (message.replyTo) {
      const sourceMessage = await db.message.findFirst({
        where: {
          instanceId: this.instance.id,
          tgChatId: pair.tgId,
          tgMsgId: message.replyToMsgId,
        },
      });
      if (!sourceMessage) {
        this.log.error('找不到 sourceMessage');
        return true;
      }
      if (this.tgBot.me.id.eq(sourceMessage.tgSenderId)) {
        // from qq
        to = {
          from: 'qq',
          name: sourceMessage.nick,
          id: Number(sourceMessage.qqSenderId),
        };
      }
      else {
        to = {
          from: 'tg',
          id: (await this.tgBot.getChat(BigInteger(sourceMessage.tgSenderId))).inputPeer as Api.InputPeerUser,
          name: sourceMessage.nick,
        };
      }
    }
    else {
      to = {
        from: 'tg',
        name: '自己',
        id: (await this.tgBot.getChat(message.senderId)).inputPeer as Api.InputPeerUser,
      };
    }
    await this.sendAction(pair, from, to, action, exec[5]);
    return true;
  };

  private async sendAction(pair: Pair, from: ActionSubject, to: ActionSubject, action: string, suffix?: string) {
    let tgText = '';
    const tgEntities: Api.TypeMessageEntity[] = [];
    const qqMessageContent: Sendable = [];

    const addSubject = (subject: ActionSubject) => {
      if (subject.from === 'tg') {
        tgEntities.push(new Api.InputMessageEntityMentionName({
          offset: tgText.length,
          length: subject.name.length,
          userId: subject.id as Api.TypeInputUser,
        }));
        qqMessageContent.push(subject.name);
      }
      else {
        qqMessageContent.push({
          type: 'at',
          text: subject.name,
          qq: subject.id,
        });
        if (!((pair.flags | this.instance.flags) & flags.DISABLE_RICH_HEADER) && env.WEB_ENDPOINT) {
          tgEntities.push(new Api.MessageEntityTextUrl({
            offset: tgText.length,
            length: subject.name.length,
            url: forwardHelper.generateRichHeaderUrl(pair.apiKey, subject.id, subject.name),
          }));
        }
      }
      tgText += subject.name;
    };
    const addText = (text: string) => {
      tgText += text;
      qqMessageContent.push(text);
    };

    addSubject(from);
    addText(' ');
    addText(action);
    if (!/[\u4e00-\u9fa5]$/.test(action)) {
      // 英文之后加上空格
      addText(' ');
    }
    addText('了 ');
    addSubject(to);
    if (suffix) {
      tgText += ' ' + suffix;
    }
    addText('！');

    const tgMessage = await pair.tg.sendMessage({
      message: tgText,
      formattingEntities: tgEntities,
      linkPreview: false,
    });
    const qqMessage = await pair.qq.sendMsg(qqMessageContent);

    await db.message.create({
      data: {
        qqRoomId: pair.qqRoomId,
        qqSenderId: this.oicq.uin,
        time: qqMessage.time,
        brief: tgText,
        seq: qqMessage.seq,
        rand: qqMessage.rand,
        pktnum: 1,
        tgChatId: pair.tgId,
        tgMsgId: tgMessage.id,
        instanceId: this.instance.id,
        tgMessageText: tgMessage.message,
        nick: '系统',
        tgSenderId: BigInt(this.tgBot.me.id.toString()),
      },
    });
  }
}
