import { Telegram, TelegramChat } from '../client/Telegram';
import { config, saveConfig } from '../providers/userConfig';
import { getLogger } from 'log4js';
import { BigInteger } from 'big-integer';

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

  public async waitForOwnerInput() {
    if (!this.owner) {
      throw new Error('应该不会运行到这里');
    }
    const { message } = await this.owner.waitForInput();
    return message;
  }

  public async createUserBot(phoneNumber: string) {
    if (!this.owner) {
      throw new Error('应该不会运行到这里');
    }
    return await Telegram.create({
      phoneNumber,
      password: async (hint?: string) => {
        await this.owner.sendMessage({
          message: `请输入你的二步验证密码${hint ? '\n密码提示：' + hint : ''}`,
        });
        return await this.waitForOwnerInput();
      },
      phoneCode: async (isCodeViaApp?: boolean) => {
        await this.owner.sendMessage({
          message: `请输入你${isCodeViaApp ? ' Telegram APP 中' : '手机上'}收到的验证码`,
        });
        return await this.waitForOwnerInput();
      },
      onError: (err) => this.log.error(err),
    });
  }

  public async saveUserBotSession(session: string) {
    config.userBotSession = session;
  }

  public async finishConfig() {
    config.isSetup = true;
    await saveConfig();
  }
}
