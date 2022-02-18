import { Telegram, TelegramChat } from '../client/Telegram';
import { config, saveConfig } from '../providers/userConfig';
import { getLogger } from 'log4js';
import { BigInteger } from 'big-integer';
import { Platform } from 'oicq';
import { MarkupLike } from 'telegram/define';
import createOicq from '../client/oicq';
import { Button } from 'telegram/tl/custom/button';
import { Api } from 'telegram';
import phone = Api.phone;

export default class SetupService {
  private owner: TelegramChat;
  private log = getLogger('SetupService');

  constructor(private readonly tgBot: Telegram) {
  }

  /**
   * 在设置阶段，第一个 start bot 的用户成为 bot 主人
   * @param userId 申请成为主人的用户 ID
   * @return {boolean} 是否成功，false 的话就是被占用了
   */
  public async claimOwner(userId: number | BigInteger) {
    userId = Number(userId);
    if (!this.owner) {
      config.owner = userId;
      await this.setupOwner();
      this.log.info(`用户 ID: ${userId} 成为了 Bot 主人`);
      return true;
    }
    return false;
  }

  private async setupOwner() {
    if (!this.owner && config.owner) {
      this.owner = await this.tgBot.getChat(config.owner);
    }
  }

  public async informOwner(message: string) {
    if (!this.owner) {
      throw new Error('应该不会运行到这里');
    }
    await this.owner.sendMessage({ message });
  }

  public async waitForOwnerInput(message?: string, buttons?: MarkupLike) {
    if (!this.owner) {
      throw new Error('应该不会运行到这里');
    }
    message && await this.owner.sendMessage({ message, buttons: buttons || Button.clear(), parseMode: 'md' });
    const { message: reply } = await this.owner.waitForInput();
    return reply;
  }

  public async createUserBot(phoneNumber: string) {
    if (!this.owner) {
      throw new Error('应该不会运行到这里');
    }
    return await Telegram.create({
      phoneNumber,
      password: async (hint?: string) => {
        return await this.waitForOwnerInput(`请输入你的二步验证密码${hint ? '\n密码提示：' + hint : ''}`);
      },
      phoneCode: async (isCodeViaApp?: boolean) => {
        return await this.waitForOwnerInput(`请输入你${isCodeViaApp ? ' Telegram APP 中' : '手机上'}收到的验证码`);
      },
      onError: (err) => this.log.error(err),
    });
  }

  public saveUserBotSession(session: string) {
    config.userBotSession = session;
  }

  public async createOicq(uin: number, password: string, platform: Platform) {
    return await createOicq({
      uin, password, platform,
      onQrCode: async (file) => {
        await this.owner.sendMessage({
          message: '请使用已登录这个账号的手机 QQ 扫描这个二维码授权',
          file,
          buttons: Button.text('我已扫码', true, true),
        });
        await this.waitForOwnerInput();
      },
      onVerifyDevice: async (phone) => {
        return await this.waitForOwnerInput(`请输入手机 ${phone} 收到的验证码`);
      },
      onVerifySlider: async (url) => {
        const res = await this.waitForOwnerInput(`收到滑块验证码 \`${url}\`\n` +
          '请使用[此软件](https://github.com/mzdluo123/TxCaptchaHelper/releases)验证并输入 Ticket\n' +
          '或者点击下方的按钮切换到扫码登录', [
          Button.text('切换到扫码登录', true, true),
        ]);
        if (res === '切换到扫码登录') return '';
        return res;
      },
    });
  }

  public saveOicqLoginInfo(uin: number, password: string, platform: Platform) {
    config.qqUin = uin;
    config.qqPassword = password;
    config.qqPlatform = platform;
  }

  public async finishConfig() {
    config.isSetup = true;
    await saveConfig();
  }
}
