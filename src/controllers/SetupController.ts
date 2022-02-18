import { Telegram } from '../client/Telegram';
import SetupService from '../services/SetupService';
import { Api } from 'telegram';
import { getLogger } from 'log4js';

export default class SetupController {
  private readonly setupService: SetupService;
  private log = getLogger('SetupController');
  private isInProgress = false;
  private waitForFinishCallbacks: Array<(ret: { tgUser: Telegram }) => unknown> = [];
  // 创建的 UserBot
  private tgUser: Telegram;

  constructor(private readonly tgBot: Telegram) {
    this.setupService = new SetupService(tgBot);
    tgBot.addNewMessageEventHandler(this.handleMessage);
  }

  private handleMessage = async (message: Api.Message) => {
    if (this.isInProgress) {
      return true;
    }

    if (message.text === '/setup') {
      this.isInProgress = true;
      await this.doSetup(Number(message.sender.id));
      await this.finishSetup();
      return true;
    }

    return false;
  };

  private async doSetup(ownerId: number) {
    try {
      const result = await this.setupService.claimOwner(ownerId);
      if (!result) return true;
    }
    catch (e) {
      this.log.error('Claim Owner 失败', e);
      this.isInProgress = false;
      throw e;
    }
    try {
      const phoneNumber = await this.setupService.waitForOwnerInput('创建 Telegram UserBot，请输入你的手机号码（需要带国家区号，例如：+86）');
      await this.setupService.informOwner('正在登录，请稍候…');
      this.tgUser = await this.setupService.createUserBot(phoneNumber);
      await this.setupService.informOwner(`登录成功`);
      await this.setupService.saveUserBotSession(this.tgUser.getStringSession());
      this.log.debug('StringSession 保存成功');
    }
    catch (e) {
      this.log.error('创建 UserBot 失败', e);
      this.isInProgress = false;
      throw e;
    }
  }

  private async finishSetup() {
    this.tgBot.removeNewMessageEventHandler(this.handleMessage);
    this.isInProgress = false;
    await this.setupService.finishConfig();
    this.waitForFinishCallbacks.forEach(e => e({
      tgUser: this.tgUser,
    }));
  }

  public waitForFinish() {
    return new Promise<{ tgUser: Telegram }>(resolve => {
      this.waitForFinishCallbacks.push(resolve);
    });
  }
}
