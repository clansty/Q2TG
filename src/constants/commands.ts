import { Api } from 'telegram';

const preSetupCommands = [new Api.BotCommand({
  command: 'setup',
  description: '执行初始化配置',
})];

// 这里的 group 指群组模式，Private 指在与机器人的私聊会话中
const groupPrivateCommands = [
  new Api.BotCommand({
    command: 'add',
    description: '添加新的群转发',
  }),
];

const personalPrivateCommands = [
  new Api.BotCommand({
    command: 'addfriend',
    description: '添加新的好友转发',
  }),
  new Api.BotCommand({
    command: 'addgroup',
    description: '添加新的群转发',
  }),
];

// 服务器零号实例的管理员
const groupPrivateSuperAdminCommands = [
  ...groupPrivateCommands,
  new Api.BotCommand({
    command: 'newinstance',
    description: '创建一个新的转发机器人实例',
  }),
];

const personalPrivateSuperAdminCommands = [
  ...personalPrivateCommands,
  new Api.BotCommand({
    command: 'newinstance',
    description: '创建一个新的转发机器人实例',
  }),
];

// inChat 表示在关联了的转发群组中的命令
const groupInChatCommands = [
  new Api.BotCommand({
    command: 'info',
    description: '查看本群或选定消息的详情',
  }),
];

const personalInChatCommands = [
  ...groupInChatCommands,
  new Api.BotCommand({
    command: 'refresh',
    description: '刷新头像和简介',
  }),
  new Api.BotCommand({
    command: 'poke',
    description: '戳一戳',
  }),
];

export default {
  preSetupCommands,
  groupPrivateCommands,
  personalPrivateCommands,
  groupPrivateSuperAdminCommands,
  personalPrivateSuperAdminCommands,
  groupInChatCommands,
  personalInChatCommands,
};
