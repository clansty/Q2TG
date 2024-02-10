import TelegramChat from '../client/TelegramChat';
import { Button } from 'telegram/tl/custom/button';

export default async function inlineDigitInput(chat: TelegramChat, length: number) {
  return new Promise<string>(async resolve => {
    const SYMBOL_EMPTY = '-';
    const SYMBOL_INPUT = '_';
    const SYMBOL_SPACE = ' ';

    let input = '';

    function getDisplay() {
      const leftLength = length - input.length;
      let display = Array.from(input);
      leftLength > 0 && display.push(SYMBOL_INPUT);
      leftLength > 1 && display.push(...SYMBOL_EMPTY.repeat(leftLength - 1));
      // 增大一点键盘的大小，方便按
      return `>>>  ${display.join(SYMBOL_SPACE)}  <<<`;
    }

    function refreshDisplay() {
      if (input.length === length) {
        resolve(input);
        message.edit({
          text: `<b>${input}</b>`,
          buttons: Button.clear(),
        });
        return;
      }
      message.edit({
        text: getDisplay(),
      });
    }

    function inputButton(digit: number | string) {
      digit = digit.toString();
      return Button.inline(digit, chat.parent.registerCallback(() => {
        input += digit;
        refreshDisplay();
      }));
    }

    const backspaceButton = Button.inline('⌫', chat.parent.registerCallback(() => {
      if (!input.length) return;
      input = input.substring(0, input.length - 1);
      refreshDisplay();
    }));

    const message = await chat.sendMessage({
      message: getDisplay(),
      buttons: [
        [inputButton(1), inputButton(2), inputButton(3)],
        [inputButton(4), inputButton(5), inputButton(6)],
        [inputButton(7), inputButton(8), inputButton(9)],
        [inputButton(0), backspaceButton],
      ],
    });
  });
}
