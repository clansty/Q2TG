import { Api, TelegramClient } from 'telegram';
import { StringSession } from 'telegram/sessions';
import { BotAuthParams, UserAuthParams } from 'telegram/client/auth';
import { NewMessage, NewMessageEvent } from 'telegram/events';
import { EditedMessage, EditedMessageEvent } from 'telegram/events/EditedMessage';
import { DeletedMessage, DeletedMessageEvent } from 'telegram/events/DeletedMessage';
import { EntityLike } from 'telegram/define';
import WaitForMessageHelper from '../helpers/WaitForMessageHelper';
import CallbackQueryHelper from '../helpers/CallbackQueryHelper';
import { CallbackQuery } from 'telegram/events/CallbackQuery';
import os from 'os';
import TelegramChat from './TelegramChat';
import TelegramSession from './TelegramSession';

type MessageHandler = (message: Api.Message) => Promise<boolean>;

export default class Telegram {
  private readonly client: TelegramClient;
  private waitForMessageHelper: WaitForMessageHelper;
  private callbackQueryHelper: CallbackQueryHelper = new CallbackQueryHelper();
  private readonly onMessageHandlers: Array<MessageHandler> = [];
  public me: Api.User;

  private constructor(sessionId: string) {
    this.client = new TelegramClient(
      new TelegramSession(sessionId),
      parseInt(process.env.TG_API_ID),
      process.env.TG_API_HASH,
      {
        connectionRetries: 5,
        langCode: 'zh',
        deviceModel: `Q2TG On ${os.hostname()}`,
        appVersion: 'raincandy',
        proxy: process.env.PROXY_IP ? {
          socksType: 5,
          ip: process.env.PROXY_IP,
          port: parseInt(process.env.PROXY_PORT),
        } : undefined,
      },
    );
  }

  public static async create(startArgs: UserAuthParams | BotAuthParams, sessionId: string) {
    const bot = new this(sessionId);
    await bot.client.start(startArgs);
    await bot.config();
    return bot;
  }

  public static async connect(sessionId: string) {
    const bot = new this(sessionId);
    await bot.client.connect();
    await bot.config();
    return bot;
  }

  private async config() {
    this.client.setParseMode('html');
    this.waitForMessageHelper = new WaitForMessageHelper(this);
    this.client.addEventHandler(this.onMessage, new NewMessage({}));
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

  /**
   * 注册消息处理器
   * @param handler 此方法返回 true 可以阻断下面的处理器
   */
  public addNewMessageEventHandler(handler: MessageHandler) {
    this.onMessageHandlers.push(handler);
  }

  public removeNewMessageEventHandler(handler: MessageHandler) {
    this.onMessageHandlers.includes(handler) && this.onMessageHandlers.splice(this.onMessageHandlers.indexOf(handler), 1);
  }

  public addEditedMessageEventHandler(handler: (event: EditedMessageEvent) => any) {
    this.client.addEventHandler(handler, new EditedMessage({}));
  }

  public addDeletedMessageEventHandler(handler: (event: DeletedMessageEvent) => any) {
    this.client.addEventHandler(handler, new DeletedMessage({}));
  }

  public async getChat(entity: EntityLike) {
    return new TelegramChat(this, this.client, await this.client.getEntity(entity), this.waitForMessageHelper);
  }

  public async setCommands(commands: Api.BotCommand[], scope: Api.TypeBotCommandScope) {
    return await this.client.invoke(
      new Api.bots.SetBotCommands({
        commands,
        langCode: 'zh',
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

  public async createChat(params: Partial<Partial<{ users: EntityLike[]; title: string; }>>) {
    const updates = await this.client.invoke(new Api.messages.CreateChat(params)) as Api.Updates;
    const newChat = updates.chats[0];
    return new TelegramChat(this, this.client, newChat, this.waitForMessageHelper);
  }
}
