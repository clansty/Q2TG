# Q2TG
QQ 与 Telegram 群相互转发的 bot
[![discord](https://img.shields.io/static/v1?label=chat&message=discord&color=7289da&logo=discord)](https://discord.gg/gKnU7BARzv)
[![GitHub package.json dependency version (prod)](https://img.shields.io/github/package-json/dependency-version/clansty/Q2TG/oicq)](https://github.com/takayama-lily/oicq)

## 安装方法

1. 首先将用于机器人的帐号在 [oicq](https://github.com/Clansty/electron-qq) 框架上登录一次，通过设备验证

2. 将 `config.example.yaml` 复制一份为 `config.yaml` ，并填入相关设置项

   需要 MongoDB 数据库来存储消息 ID 之间的对应关系

   （不要忘记 YAML 冒号后的空格（（

3. 安装必要的依赖项 `yarn install`

4. 在能同时连接 QQ 和 Telegram 的服务器上启动服务 `yarn start`

## 支持的消息类型

- [x] 文字

- [x] 图片

- [x] 图文混排消息

- [x] 大表情

- [ ] 视频

- [ ] 小表情

  （部分可显示为文字）

- [x] 链接

- [x] JSON/XML 卡片

  （包括部分转化为小程序的链接）

- [x] 群公告

- [ ] 文件（即将实现）

- [ ] 转发多条消息记录

## 额外功能

- 在 TG 中可以使用 `/forwardon` 和 `/forwardoff` 命令控制 TG 到 QQ 的单项开关
- 使用 [Electron QQ](https://github.com/Clansty/electron-qq) 时可以无缝显示 TG 中的头像和名称

