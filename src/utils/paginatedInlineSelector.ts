import { ButtonLike } from 'telegram/define';
import arrays from './arrays';
import { Button } from 'telegram/tl/custom/button';
import { TelegramChat } from '../client/Telegram';
import { Api } from 'telegram';

export default async function createPaginatedInlineSelector(chat: TelegramChat, message: string, choices: ButtonLike[][]) {
  const PAGE_SIZE = 8;
  let currentPage = 0;
  const totalPages = Math.ceil(choices.length / PAGE_SIZE);
  let sentMessage: Api.Message;
  const getButtons = () => {
    const buttons = arrays.pagination(choices, PAGE_SIZE, currentPage);
    const paginateButtons: ButtonLike[] = [];
    currentPage > 0 && paginateButtons.push(Button.inline('⏪ 上一页', chat.parent.registerCallback(() => {
      currentPage = Math.max(0, currentPage - 1);
      sentMessage.edit({
        text: message + `\n\n第 ${currentPage + 1} 页，共 ${totalPages} 页`,
        buttons: getButtons(),
      });
    })));
    currentPage !== totalPages - 1 && paginateButtons.push(Button.inline('下一页 ⏩', chat.parent.registerCallback(() => {
      currentPage = Math.min(totalPages - 1, currentPage + 1);
      console.log(currentPage);
      sentMessage.edit({
        text: message + `\n\n第 ${currentPage + 1} 页，共 ${totalPages} 页`,
        buttons: getButtons(),
      });
    })));
    paginateButtons.length && buttons.push(paginateButtons);
    return buttons;
  };
  sentMessage = await chat.sendMessage({
    message: message + `\n\n第 ${currentPage + 1} 页，共 ${totalPages} 页`,
    buttons: getButtons(),
  });
}
