import { Api, TelegramClient } from 'telegram';
import { StringSession } from 'telegram/sessions';
import { BotAuthParams, UserAuthParams } from 'telegram/client/auth';
import { NewMessage, NewMessageEvent } from 'telegram/events';
import { EditedMessage, EditedMessageEvent } from 'telegram/events/EditedMessage';
import { DeletedMessage, DeletedMessageEvent } from 'telegram/events/DeletedMessage';
import { ButtonLike, Entity, EntityLike } from 'telegram/define';
import { SendMessageParams } from 'telegram/client/messages';
import { CustomFile } from 'telegram/client/uploads';
import WaitForMessageHelper from '../helpers/WaitForMessageHelper';
import createPaginatedInlineSelector from '../utils/paginatedInlineSelector';
import CallbackQueryHelper from '../helpers/CallbackQueryHelper';
import { CallbackQuery } from 'telegram/events/CallbackQuery';

type MessageHandler = (message: Api.Message) => Promise<boolean>;

export class Telegram {
  private readonly client: TelegramClient;
  private waitForMessageHelper: WaitForMessageHelper;
  private callbackQueryHelper: CallbackQueryHelper = new CallbackQueryHelper();
  private readonly onMessageHandlers: Array<MessageHandler> = [];
  public me: Api.User;

  private constructor(stringSession = '') {
    this.client = new TelegramClient(
      new StringSession(stringSession),
      parseInt(process.env.TG_API_ID),
      process.env.TG_API_HASH,
      {
        connectionRetries: 5,
        proxy: process.env.PROXY_IP ? {
          socksType: 5,
          ip: process.env.PROXY_IP,
          port: parseInt(process.env.PROXY_PORT),
        } : undefined,
      },
    );
  }

  public static async create(startArgs: UserAuthParams | BotAuthParams, stringSession = '') {
    const bot = new this(stringSession);
    await bot.client.start(startArgs);
    await bot.config();
    return bot;
  }

  public static async connect(stringSession: string) {
    const bot = new this(stringSession);
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

  public getStringSession() {
    // 上游定义不好好写
    return this.client.session.save() as any as string;
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
}

export class TelegramChat {
  constructor(public readonly parent: Telegram,
              private readonly client: TelegramClient,
              private readonly entity: Entity,
              private readonly waitForInputHelper: WaitForMessageHelper) {
  }

  public async sendMessage(params: SendMessageParams) {
    return await this.client.sendMessage(this.entity, params);
  }

  public async sendSelfDestructingPhoto(params: SendMessageParams, photo: CustomFile, ttlSeconds: number) {
    // @ts-ignore 定义不好好写的？你家 `FileLike` 明明可以是 `TypeInputMedia`
    params.file = new Api.InputMediaUploadedPhoto({
      file: await this.client.uploadFile({
        file: photo,
        workers: 1,
      }),
      ttlSeconds,
    });
    return await this.client.sendMessage(this.entity, params);
  }

  public async waitForInput() {
    return this.waitForInputHelper.waitForMessage(this.entity.id);
  }

  public cancelWait() {
    this.waitForInputHelper.cancel(this.entity.id);
  }

  public createPaginatedInlineSelector(message: string, choices: ButtonLike[][]) {
    return createPaginatedInlineSelector(this, message, choices);
  }
}
