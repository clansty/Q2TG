import { Api } from 'telegram';

const preSetupCommands = [
  new Api.BotCommand({
    command: 'setup',
    description: '执行初始化配置',
  }),
];

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
  new Api.BotCommand({
    command: 'login',
    description: '当 QQ 处于下线状态时，使用此命令重新登录 QQ',
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
const inChatCommands = [
  new Api.BotCommand({
    command: 'info',
    description: '查看本群或选定消息的详情',
  }),
  new Api.BotCommand({
    command: 'search',
    description: '搜索消息',
  }),
];

const groupInChatCommands = [
  ...inChatCommands,
  new Api.BotCommand({
    command: 'forwardoff',
    description: '暂停消息转发',
  }),
  new Api.BotCommand({
    command: 'forwardon',
    description: '恢复消息转发',
  }),
  new Api.BotCommand({ command: 'disable_qq_forward', description: '停止从QQ转发至TG' }),
  new Api.BotCommand({ command: 'enable_qq_forward', description: '恢复从QQ转发至TG' }),
  new Api.BotCommand({ command: 'disable_tg_forward', description: '停止从TG转发至QQ' }),
  new Api.BotCommand({ command: 'enable_tg_forward', description: '恢复从TG转发至QQ' }),
  new Api.BotCommand({
    command: 'recover',
    description: '恢复离线期间的 QQ 消息记录到 TG（不稳定功能，管理员专用）',
  }),
];

const personalInChatCommands = [
  ...inChatCommands,
  new Api.BotCommand({
    command: 'refresh',
    description: '刷新头像和简介',
  }),
  new Api.BotCommand({
    command: 'poke',
    description: '戳一戳',
  }),
  new Api.BotCommand({
    command: 'nick',
    description: '获取/设置群名片',
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
