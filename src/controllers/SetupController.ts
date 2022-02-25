import Telegram from '../client/Telegram';
import SetupService from '../services/SetupService';
import { Api } from 'telegram';
import { getLogger } from 'log4js';
import { Button } from 'telegram/tl/custom/button';
import setupHelper from '../helpers/setupHelper';
import { Platform } from 'oicq';
import commands from '../constants/commands';
import { WorkMode } from '../types/definitions';
import OicqClient from '../client/OicqClient';

export default class SetupController {
  private readonly setupService: SetupService;
  private log = getLogger('SetupController');
  private isInProgress = false;
  private waitForFinishCallbacks: Array<(ret: { tgUser: Telegram, oicq: OicqClient }) => unknown> = [];
  // 创建的 UserBot
  private tgUser: Telegram;
  private oicq: OicqClient;

  constructor(private readonly tgBot: Telegram) {
    this.setupService = new SetupService(tgBot);
    tgBot.addNewMessageEventHandler(this.handleMessage);
    tgBot.setCommands(commands.preSetupCommands, new Api.BotCommandScopeUsers());
  }

  private handleMessage = async (message: Api.Message) => {
    if (this.isInProgress || !message.isPrivate) {
      return false;
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
    // 设置 owner
    try {
      await this.setupService.claimOwner(ownerId);
    }
    catch (e) {
      this.log.error('Claim Owner 失败', e);
      this.isInProgress = false;
      throw e;
    }
    // 设置工作模式
    let workMode: WorkMode | '' = '';
    try {
      while (!workMode) {
        const workModeText = await this.setupService.waitForOwnerInput('欢迎使用 Q2TG v2\n' +
          '请选择工作模式，关于工作模式的区别请查看<a href="https://github.com">这里</a>', [
          [Button.text('个人模式', true, true)],
          [Button.text('群组模式', true, true)],
        ]);
        workMode = setupHelper.convertTextToWorkMode(workModeText);
      }
      this.setupService.setWorkMode(workMode);
    }
    catch (e) {
      this.log.error('设置工作模式失败', e);
      this.isInProgress = false;
      throw e;
    }
    // 登录 oicq
    try {
      let uin = NaN;
      while (isNaN(uin)) {
        uin = Number(await this.setupService.waitForOwnerInput('请输入要登录 QQ 号'));
      }
      const platformText = await this.setupService.waitForOwnerInput('请选择登录协议', [
        [Button.text('安卓手机', true, true)],
        [Button.text('安卓平板', true, true)],
        [Button.text('iPad', true, true)],
        [Button.text('macOS', true, true)],
        [Button.text('安卓手表', true, true)],
      ]);
      const platform = setupHelper.convertTextToPlatform(platformText);
      let password = '';
      const isPasswordLogin = platform === Platform.Watch ? '' :
        await this.setupService.waitForOwnerInput('用密码登录吗？', [
          [Button.text('密码登录', true, true)],
          [Button.text('二维码登录', true, true)],
        ]);
      if (isPasswordLogin === '密码登录') {
        password = await this.setupService.waitForOwnerInput('请输入密码', undefined, true);
      }
      this.oicq = await this.setupService.createOicq(uin, password, platform);
      await this.setupService.informOwner(`登录成功`);
      this.setupService.saveOicqLoginInfo(uin, password, platform);
    }
    catch (e) {
      this.log.error('登录 OICQ 失败', e);
      this.isInProgress = false;
      throw e;
    }
    // 登录 tg UserBot
    try {
      const phoneNumber = await this.setupService.waitForOwnerInput('创建 Telegram UserBot，请输入你的手机号码（需要带国家区号，例如：+86）');
      await this.setupService.informOwner('正在登录，请稍候…');
      this.tgUser = await this.setupService.createUserBot(phoneNumber);
      await this.setupService.informOwner(`登录成功`);
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
      oicq: this.oicq,
    }));
  }

  public waitForFinish() {
    return new Promise<{ tgUser: Telegram, oicq: OicqClient }>(resolve => {
      this.waitForFinishCallbacks.push(resolve);
    });
  }
}
