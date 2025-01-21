import Instance from '../models/Instance';
import Telegram from '../client/Telegram';
import { InputStatusChangeEvent, QQClient } from '../client/QQClient';
import flags from '../constants/flags';
import { Api } from 'telegram';

export default class TypingController {
  constructor(private readonly instance: Instance,
              private readonly tgBot: Telegram,
              private readonly tgUser: Telegram,
              private readonly oicq: QQClient) {
    oicq.addInputStatusChangeHandler(this.handleInputStatusChange);
    // bot 无法获取输入状态，个人账号无法获取自己在其他设备的输入状态，做不了
    // tgUser.addChannelUserTypingHandler(this.handleChannelUserTyping);
  }

  private handleInputStatusChange = async (event: InputStatusChangeEvent) => {
    const pair = this.instance.forwardPairs.find(event.chat);
    if (!pair) return;
    if ((pair.flags | this.instance.flags) & flags.DISABLE_Q2TG) return;

    if (event.typing) {
      await pair.tg.setTyping()
    }
    else {
      await pair.tg.setTyping(new Api.SendMessageCancelAction());
    }
  };
}
