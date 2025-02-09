import Instance from '../models/Instance';
import Telegram from '../client/Telegram';
import { GroupNameChangeEvent, QQClient } from '../client/QQClient';
import flags from '../constants/flags';
import { NapCatGroupMember } from '../client/NapCatClient';
import env from '../models/env';
import helper from '../helpers/forwardHelper';
import { getLogger, Logger } from 'log4js';

export default class GroupNameRefreshController {
  private readonly log: Logger;

  constructor(private readonly instance: Instance,
              private readonly tgBot: Telegram,
              private readonly tgUser: Telegram,
              private readonly oicq: QQClient) {
    oicq.addGroupNameChangeHandler(this.handleGroupNameChange.bind(this));
    this.log = getLogger(`GroupNameRefreshController - ${instance.id}`);
  }

  private async handleGroupNameChange(event: GroupNameChangeEvent) {
    this.log.debug(event);
    const pair = this.instance.forwardPairs.find(event.group);
    if (!pair) return;

    if ((pair.flags | this.instance.flags) & flags.NAME_LOCKED) return;
    await pair.tg.editTitle(event.newName);

    if (event.operator instanceof NapCatGroupMember) {
      const operatorInfo = await event.operator.renew();
      let operatorName = operatorInfo.card || operatorInfo.nickname;
      if (!((pair.flags | this.instance.flags) & flags.DISABLE_RICH_HEADER) && env.WEB_ENDPOINT) {
        const richHeaderUrl = helper.generateRichHeaderUrl(pair.apiKey, operatorInfo.user_id, operatorName);
        operatorName = `<a href="${richHeaderUrl}">${operatorName}</a>`;
      }

      await pair.tg.sendMessage({
        message: `<i>${operatorName} 修改群名为 <b>${event.newName}</b></i>`,
        parseMode: 'html',
        silent: true,
        replyTo: pair.forumId,
      });
    }
  }
}
