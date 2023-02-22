import { Api, TelegramClient } from 'telegram';
import { BotAuthParams, UserAuthParams } from 'telegram/client/auth';
import { NewMessage, NewMessageEvent, Raw } from 'telegram/events';
import { EditedMessage, EditedMessageEvent } from 'telegram/events/EditedMessage';
import { DeletedMessage, DeletedMessageEvent } from 'telegram/events/DeletedMessage';
import { EntityLike } from 'telegram/define';
import WaitForMessageHelper from '../helpers/WaitForMessageHelper';
import CallbackQueryHelper from '../helpers/CallbackQueryHelper';
import { CallbackQuery } from 'telegram/events/CallbackQuery';
import os from 'os';
import TelegramChat from './TelegramChat';
import TelegramSession from '../models/TelegramSession';
import { LogLevel } from 'telegram/extensions/Logger';
import { BigInteger } from 'big-integer';
import { IterMessagesParams } from 'telegram/client/messages';

type MessageHandler = (message: Api.Message) => Promise<boolean | void>;
type ServiceMessageHandler = (message: Api.MessageService) => Promise<boolean | void>;

export default class Telegram {
  private readonly client: TelegramClient;
  private waitForMessageHelper: WaitForMessageHelper;
  private callbackQueryHelper: CallbackQueryHelper = new CallbackQueryHelper();
  private readonly onMessageHandlers: Array<MessageHandler> = [];
  private readonly onEditedMessageHandlers: Array<MessageHandler> = [];
  private readonly onServiceMessageHandlers: Array<ServiceMessageHandler> = [];
  public me: Api.User;

  private static existedBots = {} as { [id: number]: Telegram };

  public get sessionId() {
    return (this.client.session as TelegramSession).dbId;
  }

  public get isOnline() {
    return this.client.connected;
  }

  private constructor(appName: string, sessionId?: number) {
    this.client = new TelegramClient(
      new TelegramSession(sessionId),
      parseInt(process.env.TG_API_ID),
      process.env.TG_API_HASH,
      {
        connectionRetries: 20,
        langCode: 'zh',
        deviceModel: `${appName} On ${os.hostname()}`,
        appVersion: 'rainbowcat',
        useIPV6: !!process.env.IPV6,
        proxy: process.env.PROXY_IP ? {
          socksType: 5,
          ip: process.env.PROXY_IP,
          port: parseInt(process.env.PROXY_PORT),
        } : undefined,
      },
    );
    this.client.logger.setLevel(LogLevel.WARN);
  }

  public static async create(startArgs: UserAuthParams | BotAuthParams, appName = 'Q2TG') {
    const bot = new this(appName);
    await bot.client.start(startArgs);
    this.existedBots[bot.sessionId] = bot;
    await bot.config();
    return bot;
  }

  public static async connect(sessionId: number, appName = 'Q2TG') {
    if (this.existedBots[sessionId]) {
      // 已经创建过就不会再次创建，可用于两个 instance 共享 user bot
      return this.existedBots[sessionId];
    }
    const bot = new this(appName, sessionId);
    this.existedBots[sessionId] = bot;
    await bot.client.connect();
    await bot.config();
    return bot;
  }

  private async config() {
    this.client.setParseMode('html');
    this.waitForMessageHelper = new WaitForMessageHelper(this);
    this.client.addEventHandler(this.onMessage, new NewMessage({}));
    this.client.addEventHandler(this.onEditedMessage, new EditedMessage({}));
    this.client.addEventHandler(this.onServiceMessage, new Raw({
      types: [Api.UpdateNewMessage],
      func: (update: Api.UpdateNewMessage) => update.message instanceof Api.MessageService,
    }));
    this.client.addEventHandler(this.callbackQueryHelper.onCallbackQuery, new CallbackQuery());
    this.me = await this.client.getMe() as Api.User;
  }

  private onMessage = async (event: NewMessageEvent) => {
    // 能用的东西基本都在 message 里面，直接调用 event 里的会 undefined
    for (const handler of this.onMessageHandlers) {
      const res = await handler(event.message);
      if (res) return;
    }
  };

  private onEditedMessage = async (event: EditedMessageEvent) => {
    for (const handler of this.onEditedMessageHandlers) {
      const res = await handler(event.message);
      if (res) return;
    }
  };

  private onServiceMessage = async (event: Api.UpdateNewMessage) => {
    for (const handler of this.onServiceMessageHandlers) {
      const res = await handler(event.message as Api.MessageService);
      if (res) return;
    }
  };

  /**
   * 注册消息处理器
   * @param handler 此方法返回 true 可以阻断下面的处理器
   */
  public addNewMessageEventHandler(handler: MessageHandler) {
    this.onMessageHandlers.push(handler);
  }

  public removeNewMessageEventHandler(handler: MessageHandler) {
    this.onMessageHandlers.includes(handler) &&
    this.onMessageHandlers.splice(this.onMessageHandlers.indexOf(handler), 1);
  }

  public addEditedMessageEventHandler(handler: MessageHandler) {
    this.onEditedMessageHandlers.push(handler);
  }

  public removeEditedMessageEventHandler(handler: MessageHandler) {
    this.onEditedMessageHandlers.includes(handler) &&
    this.onEditedMessageHandlers.splice(this.onEditedMessageHandlers.indexOf(handler), 1);
  }

  public addNewServiceMessageEventHandler(handler: ServiceMessageHandler) {
    this.onServiceMessageHandlers.push(handler);
  }

  public removeNewServiceMessageEventHandler(handler: ServiceMessageHandler) {
    this.onServiceMessageHandlers.includes(handler) &&
    this.onServiceMessageHandlers.splice(this.onServiceMessageHandlers.indexOf(handler), 1);
  }

  public addDeletedMessageEventHandler(handler: (event: DeletedMessageEvent) => any) {
    this.client.addEventHandler(handler, new DeletedMessage({}));
  }

  public addChannelParticipantEventHandler(handler: (event: Api.UpdateChannelParticipant) => any) {
    this.client.addEventHandler(handler, new Raw({
      types: [Api.UpdateChannelParticipant],
    }));
  }

  public async getChat(entity: EntityLike) {
    return new TelegramChat(this, this.client, await this.client.getEntity(entity), this.waitForMessageHelper);
  }

  public async setCommands(commands: Api.BotCommand[], scope: Api.TypeBotCommandScope) {
    return await this.client.invoke(
      new Api.bots.SetBotCommands({
        commands,
        langCode: '',
        scope,
      }),
    );
  }

  public registerCallback(cb: () => any) {
    return this.callbackQueryHelper.registerCallback(cb);
  }

  public async getDialogFilters() {
    return await this.client.invoke(new Api.messages.GetDialogFilters());
  }

  public async updateDialogFilter(params: Partial<Partial<{ id: number; filter?: Api.DialogFilter; }>>) {
    return await this.client.invoke(new Api.messages.UpdateDialogFilter(params));
  }

  public async createChat(title: string, about = '') {
    const updates = await this.client.invoke(new Api.channels.CreateChannel({
      title, about,
      megagroup: true,
      forImport: true,
    })) as Api.Updates;
    const newChat = updates.chats[0];
    return new TelegramChat(this, this.client, newChat, this.waitForMessageHelper);
  }

  public async getCustomEmoji(documentId: BigInteger) {
    const ids = await this.client.invoke(new Api.messages.GetCustomEmojiDocuments({
      documentId: [documentId],
    }));
    const document = ids[0] as Api.Document;
    return await this.client.downloadFile(new Api.InputDocumentFileLocation({
      id: document.id,
      accessHash: document.accessHash,
      fileReference: document.fileReference,
      thumbSize: '',
    }), {
      dcId: document.dcId,
    });
  }

  public async getInputPeerUserFromMessage(chatId: EntityLike, userId: BigInteger, msgId: number) {
    const inputPeerOfChat = await this.client.getInputEntity(chatId);
    return new Api.InputUserFromMessage({
      peer: inputPeerOfChat,
      userId, msgId,
    });
  }

  public getMessage(entity: EntityLike | undefined, getMessagesParams?: Partial<IterMessagesParams>) {
    return this.client.getMessages(entity, getMessagesParams);
  }

  public downloadEntityPhoto(entity: EntityLike, isBig = false) {
    return this.client.downloadProfilePhoto(entity, { isBig });
  }

  public downloadThumb(document: Api.Document, thumbSize = 'm') {
    return this.client.downloadFile(new Api.InputDocumentFileLocation({
      id: document.id,
      accessHash: document.accessHash,
      fileReference: document.fileReference,
      thumbSize,
    }), {
      dcId: document.dcId,
    });
  }
}
