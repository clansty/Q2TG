import Instance from '../models/Instance';
import OicqClient from '../client/OicqClient';

export default class OicqErrorNotifyController {
  public constructor(private readonly instance: Instance,
                     private readonly oicq: OicqClient) {
    oicq.on('system.offline', async ({ message }) => {
      await instance.ownerChat.sendMessage(`<i>QQ 机器人掉线</i>\n${message}`);
    });
  }
}
