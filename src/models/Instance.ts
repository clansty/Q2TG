import { WorkMode } from '../types/definitions';
import db from './db';
import { Platform } from 'oicq';
import ConfigController from '../controllers/ConfigController';
import SetupController from '../controllers/SetupController';
import ForwardController from '../controllers/ForwardController';
import DeleteMessageController from '../controllers/DeleteMessageController';
import FileAndFlashPhotoController from '../controllers/FileAndFlashPhotoController';
import Telegram from '../client/Telegram';
import OicqClient from '../client/OicqClient';
import { getLogger, Logger } from 'log4js';
import ForwardPairs from './ForwardPairs';
import InstanceManageController from '../controllers/InstanceManageController';
import InChatCommandsController from '../controllers/InChatCommandsController';
import { Api } from 'telegram';
import commands from '../constants/commands';
import TelegramChat from '../client/TelegramChat';
import RequestController from '../controllers/RequestController';
import OicqErrorNotifyController from '../controllers/OicqErrorNotifyController';
import { MarkupLike } from 'telegram/define';
import { Button } from 'telegram/tl/custom/button';
import { CustomFile } from 'telegram/client/uploads';

export default class Instance {
  private _owner = 0;
  private _qqUin = 0;
  private _qqPassword = '';
  private _qqPlatform = 0;
  private _isSetup = false;
  private _workMode = '';
  private _botToken = '';

  private readonly log: Logger;

  private tgBot: Telegram;
  private tgUser: Telegram;
  private oicq: OicqClient;

  private _ownerChat: TelegramChat;

  public forwardPairs: ForwardPairs;
  private setupController: SetupController;
  private instanceManageController: InstanceManageController;
  private oicqErrorNotifyController: OicqErrorNotifyController;
  private requestController: RequestController;
  private configController: ConfigController;
  private deleteMessageController: DeleteMessageController;
  private inChatCommandsController: InChatCommandsController;
  private forwardController: ForwardController;
  private fileAndFlashPhotoController: FileAndFlashPhotoController;

  private constructor(public readonly id: number) {
    this.log = getLogger(`Instance - ${this.id}`);
  }

  private async load() {
    const dbEntry = await db.instance.findFirst({
      where: { id: this.id },
    });

    if (!dbEntry) {
      if (this.id === 0) {
        // 创建零号实例
        await db.instance.create({
          data: { id: 0 },
        });
        return;
      }
      else
        throw new Error('Instance not found');
    }

    this._owner = Number(dbEntry.owner);
    this._qqUin = Number(dbEntry.qqUin);
    this._qqPassword = dbEntry.qqPassword;
    this._qqPlatform = dbEntry.qqPlatform;
    this._isSetup = dbEntry.isSetup;
    this._workMode = dbEntry.workMode;
    this._botToken = dbEntry.botToken;
  }

  private async init() {
    this.log.debug('正在登录 TG Bot');
    this.tgBot = await Telegram.create({
      botAuthToken: this.botToken,
    }, `bot:${this.id}`);
    this.log.info('TG Bot 登录完成');
    (async () => {
      if (!this.isSetup || !this._owner) {
        this.log.info('当前服务器未配置，请向 Bot 发送 /setup 来设置');
        this.setupController = new SetupController(this, this.tgBot);
        // 这会一直卡在这里，所以要新开一个异步来做，提前返回掉上面的
        ({ tgUser: this.tgUser, oicq: this.oicq } = await this.setupController.waitForFinish());
        this._ownerChat = await this.tgBot.getChat(this.owner);
      }
      else {
        this.log.debug('正在登录 TG UserBot');
        this.tgUser = await Telegram.connect(`user:${this.id}`);
        this.log.info('TG UserBot 登录完成');
        this._ownerChat = await this.tgBot.getChat(this.owner);
        this.log.debug('正在登录 OICQ');
        this.oicq = await OicqClient.create({
          uin: this.qqUin,
          password: this.qqPassword,
          platform: this.qqPlatform,
          onQrCode: async (file) => {
            await this.ownerChat.sendMessage({
              message: '请使用已登录这个账号的手机 QQ 扫描这个二维码授权',
              file: new CustomFile('qrcode.png', file.length, '', file),
              buttons: Button.text('我已扫码', true, true),
            });
            await this.waitForOwnerInput();
          },
          onVerifyDevice: async (phone) => {
            return await this.waitForOwnerInput(`请输入手机 ${phone} 收到的验证码`);
          },
          onVerifySlider: async (url) => {
            const res = await this.waitForOwnerInput(`收到滑块验证码 <code>${url}</code>\n` +
              '请使用<a href="https://github.com/mzdluo123/TxCaptchaHelper/releases">此软件</a>验证并输入 Ticket'
              );
            return res;
          },
        });
        this.log.info('OICQ 登录完成');
      }
      this.forwardPairs = await ForwardPairs.load(this.id, this.oicq, this.tgBot);
      this.setupCommands()
        .then(() => this.log.info('命令设置成功'))
        .catch(e => this.log.error('命令设置错误', e));
      if (this.id === 0) {
        this.instanceManageController = new InstanceManageController(this, this.tgBot);
      }
      this.oicqErrorNotifyController = new OicqErrorNotifyController(this, this.oicq);
      this.requestController = new RequestController(this, this.tgBot, this.oicq);
      this.configController = new ConfigController(this, this.tgBot, this.tgUser, this.oicq);
      this.deleteMessageController = new DeleteMessageController(this, this.tgBot, this.tgUser, this.oicq);
      this.inChatCommandsController = new InChatCommandsController(this, this.tgBot, this.oicq);
      this.forwardController = new ForwardController(this, this.tgBot, this.tgUser, this.oicq);
      this.fileAndFlashPhotoController = new FileAndFlashPhotoController(this, this.tgBot, this.oicq);
    })()
      .then(() => this.log.info('初始化已完成'));
  }

  public static async start(instanceId: number) {
    const instance = new this(instanceId);
    await instance.load();
    await instance.init();
    return instance;
  }

  public static async createNew(botToken: string) {
    const dbEntry = await db.instance.create({
      data: { botToken },
    });
    return await this.start(dbEntry.id);
  }

  private async setupCommands() {
    await this.tgBot.setCommands([], new Api.BotCommandScopeUsers());
    // 设定管理员的
    if (this.id === 0) {
      await this.tgBot.setCommands(
        this.workMode === 'personal' ? commands.personalPrivateSuperAdminCommands : commands.groupPrivateSuperAdminCommands,
        new Api.BotCommandScopePeer({
          peer: (this.ownerChat).inputPeer,
        }),
      );
    }
    else {
      await this.tgBot.setCommands(
        this.workMode === 'personal' ? commands.personalPrivateCommands : commands.groupPrivateCommands,
        new Api.BotCommandScopePeer({
          peer: (this.ownerChat).inputPeer,
        }),
      );
    }
    // 设定群组内的
    await this.tgBot.setCommands(
      this.workMode === 'personal' ? commands.personalInChatCommands : commands.groupInChatCommands,
      // 普通用户其实不需要这些命令，这样可以让用户的输入框少点东西
      new Api.BotCommandScopeChatAdmins(),
    );
  }

  private async waitForOwnerInput(message?: string, buttons?: MarkupLike, remove = false) {
    if (!this.owner) {
      throw new Error('应该不会运行到这里');
    }
    message && await this.ownerChat.sendMessage({ message, buttons: buttons || Button.clear(), linkPreview: false });
    const reply = await this.ownerChat.waitForInput();
    remove && await reply.delete({ revoke: true });
    return reply.message;
  }

  get owner() {
    return this._owner;
  }

  get qqUin() {
    return this._qqUin;
  }

  get qqPassword() {
    return this._qqPassword;
  }

  get qqPlatform() {
    return this._qqPlatform as Platform;
  }

  get isSetup() {
    return this._isSetup;
  }

  get workMode() {
    return this._workMode as WorkMode;
  }

  get botToken() {
    return this.id === 0 ? process.env.TG_BOT_TOKEN : this._botToken;
  }

  get botMe() {
    return this.tgBot.me;
  }

  get userMe() {
    return this.tgUser.me;
  }

  get ownerChat() {
    return this._ownerChat;
  }

  set owner(owner: number) {
    this._owner = owner;
    db.instance.update({
      data: { owner },
      where: { id: this.id },
    })
      .then(() => this.log.trace(owner));
  }

  set qqUin(qqUin: number) {
    this._qqUin = qqUin;
    db.instance.update({
      data: { qqUin },
      where: { id: this.id },
    })
      .then(() => this.log.trace(qqUin));
  }

  set qqPassword(qqPassword: string) {
    this._qqPassword = qqPassword;
    db.instance.update({
      data: { qqPassword },
      where: { id: this.id },
    })
      .then(() => this.log.trace(qqPassword));
  }

  set qqPlatform(qqPlatform: Platform) {
    this._qqPlatform = qqPlatform;
    db.instance.update({
      data: { qqPlatform },
      where: { id: this.id },
    })
      .then(() => this.log.trace(qqPlatform));
  }

  set isSetup(isSetup: boolean) {
    this._isSetup = isSetup;
    db.instance.update({
      data: { isSetup },
      where: { id: this.id },
    })
      .then(() => this.log.trace(isSetup));
  }

  set workMode(workMode: WorkMode) {
    this._workMode = workMode;
    db.instance.update({
      data: { workMode },
      where: { id: this.id },
    })
      .then(() => this.log.trace(workMode));
  }
}
