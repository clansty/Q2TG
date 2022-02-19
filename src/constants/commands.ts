import { Api } from 'telegram';

export default {
  preSetupCommands: [new Api.BotCommand({
    command: 'setup',
    description: '执行初始化配置',
  })],
};
