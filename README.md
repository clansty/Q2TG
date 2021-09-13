# Q2TG
QQ 与 Telegram 群相互转发的 bot
[![discord](https://img.shields.io/static/v1?label=chat&message=discord&color=7289da&logo=discord)](https://discord.gg/gKnU7BARzv)
[![GitHub package.json dependency version (prod)](https://img.shields.io/github/package-json/dependency-version/clansty/Q2TG/oicq)](https://github.com/takayama-lily/oicq)

## 安装方法

1. 首先将用于机器人的帐号在 [oicq](https://github.com/takayama-lily/oicq) 框架上登录一次，通过设备验证

2. 将 `config.example.yaml` 复制一份为 `config.yaml` ，并填入相关设置项

   需要 MongoDB 数据库来存储消息 ID 之间的对应关系

   （不要忘记 YAML 冒号后的空格（（
   
   以及 QQ 和 TG 的群号都不需要加引号

3. 安装必要的依赖项 `yarn install`，以及 [FFmpeg](https://www.ffmpeg.org/)

4. 在能同时连接 QQ 和 Telegram 的服务器上启动服务 `yarn start`

## 通过 Docker 部署

首先需要安装有 `docker` 和 `docker-compose`，并且能同时连接 QQ 和 TG 的机器

1. 下载 [docker-compose.yaml](./docker-compose.yaml)，填写相关参数。数据库部分无需改动
2. 运行 `docker-compose up -d`

## 支持的消息类型

- [x] 文字（双向）

- [x] 图片（双向）

  - [x] GIF

- [x] 图文混排消息（双向）

- [x] 大表情（双向）

  - [ ] TG 中的动态 Sticker

- [x] 视频（双向）

- [x] 语音（双向）

- [ ] 小表情

  （可显示为文字）

- [x] 链接（双向）

- [x] JSON/XML 卡片

  （包括部分转化为小程序的链接）

- [x] 群公告

- [x] 回复（双平台原生回复）

- [x] 文件（单向 QQ -> TG，按需获取下载地址）

- [x] 转发多条消息记录

  （依赖 [chatrecord-viewer](https://github.com/Clansty/chatrecord-viewer) 服务）

- [x] TG 编辑消息（撤回再重发）

- [x] 双向撤回消息

## 如何撤回消息

在 QQ 中，直接撤回相应的消息，撤回操作会同步到 TG

在 TG 中，由于机器人无法接收到撤回指令，可以选择以下操作之一：

- 将消息内容编辑为 `/rm`
- 回复要撤回的消息，内容为 `/rm`。如果操作者在 TG 群组中没有「删除消息」权限，则只能撤回自己的消息

为了使撤回功能正常工作，TG 机器人需要具有「删除消息」权限，QQ 机器人需要为管理员或群主

即使 QQ 机器人为管理员，也无法撤回其他管理员在 QQ 中发送的消息

## 额外功能

- 在 TG 中可以使用 `/forwardon` 和 `/forwardoff` 命令控制 TG 到 QQ 的单向开关
- 使用 [Electron QQ](https://github.com/Clansty/electron-qq) 时可以无缝显示 TG 中的头像和名称

## 运行演示

![gif](https://user-images.githubusercontent.com/18461360/127771641-7195f752-52a9-49cd-98a0-80dc5f6bbe64.gif)

