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

export default class Instance {
  private _owner = 0;
  private _qqUin = 0;
  private _qqPassword = '';
  private _qqPlatform = 0;
  private _isSetup = false;
  private _workMode = '';
  private _botToken = '';

  private readonly log: Logger;

  public forwardPairs: ForwardPairs;
  private setupController: SetupController;
  private configController: ConfigController;
  private deleteMessageController: DeleteMessageController;
  private forwardController: ForwardController;
  private fileAndFlashPhotoController: FileAndFlashPhotoController;

  private constructor(public readonly id: number) {
    this.log = getLogger(`Instance ${this.id}`);
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
    const tgBot = await Telegram.create({
      botAuthToken: this.botToken,
    }, 'bot');

    let tgUser: Telegram, oicq: OicqClient;
    this.log.debug('TG Bot 登录完成');
    if (!this.isSetup) {
      this.log.info('当前服务器未配置，请向 Bot 发送 /setup 来设置');
      this.setupController = new SetupController(this, tgBot);
      ({ tgUser, oicq } = await this.setupController.waitForFinish());
    }
    else {
      this.log.debug('正在登录 TG UserBot');
      tgUser = await Telegram.connect('user');
      this.log.debug('TG UserBot 登录完成');
      this.log.debug('正在登录 OICQ');
      oicq = await OicqClient.create({
        uin: this.qqUin,
        password: this.qqPassword,
        platform: this.qqPlatform,
        onVerifyDevice: () => null,
        onVerifySlider: () => null,
        onQrCode: () => null,
      });
      this.log.debug('OICQ 登录完成');
    }
    this.forwardPairs = await ForwardPairs.load(this.id, oicq, tgBot);
    this.configController = new ConfigController(this, tgBot, tgUser, oicq);
    this.deleteMessageController = new DeleteMessageController(this, tgBot, tgUser, oicq);
    this.forwardController = new ForwardController(this, tgBot, tgUser, oicq);
    this.fileAndFlashPhotoController = new FileAndFlashPhotoController(this, tgBot, oicq);
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
