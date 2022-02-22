import { Api } from 'telegram';

export default {
  preSetupCommands: [new Api.BotCommand({
    command: 'setup',
    description: '执行初始化配置',
  })],
  personalPrivateCommands: [
    new Api.BotCommand({
      command: 'addfriend',
      description: '添加新的好友转发',
    }),
    new Api.BotCommand({
      command: 'addgroup',
      description: '添加新的群转发',
    }),
  ],
  groupPrivateCommands: [
    new Api.BotCommand({
      command: 'add',
      description: '添加新的群转发',
    }),
  ],
};
