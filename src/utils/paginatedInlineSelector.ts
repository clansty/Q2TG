import { ButtonLike } from 'telegram/define';
import arrays from './arrays';
import { Button } from 'telegram/tl/custom/button';
import { Api } from 'telegram';
import TelegramChat from '../client/TelegramChat';

export default async function createPaginatedInlineSelector(chat: TelegramChat, message: string, choices: ButtonLike[][]) {
  const PAGE_SIZE = 12;
  let currentPage = 0;
  const totalPages = Math.ceil(choices.length / PAGE_SIZE);
  let sentMessage: Api.Message;
  const buttonPageUp = Button.inline('⬅︎ 上一页', chat.parent.registerCallback(() => {
    currentPage = Math.max(0, currentPage - 1);
    sentMessage.edit({
      text: message + `\n\n第 ${currentPage + 1} 页，共 ${totalPages} 页`,
      buttons: getButtons(),
    });
  }));
  const buttonPageDown = Button.inline('下一页 ➡︎', chat.parent.registerCallback(() => {
    currentPage = Math.min(totalPages - 1, currentPage + 1);
    sentMessage.edit({
      text: message + `\n\n第 ${currentPage + 1} 页，共 ${totalPages} 页`,
      buttons: getButtons(),
    });
  }));
  const getButtons = () => {
    const buttons = arrays.pagination(choices, PAGE_SIZE, currentPage);
    const paginateButtons: ButtonLike[] = [];
    currentPage > 0 && paginateButtons.push(buttonPageUp);
    currentPage !== totalPages - 1 && paginateButtons.push(buttonPageDown);
    paginateButtons.length && buttons.push(paginateButtons);
    return buttons;
  };
  sentMessage = await chat.sendMessage({
    message: message + `\n\n第 ${currentPage + 1} 页，共 ${totalPages} 页`,
    buttons: getButtons(),
  });
  return sentMessage;
}
