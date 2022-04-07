# Q2TG
QQ 群与 Telegram 群相互转发的 bot

## 安装方法

请看 [Wiki](https://github.com/Clansty/Q2TG/wiki/%E5%AE%89%E8%A3%85%E9%83%A8%E7%BD%B2)

v2.x 版本同时需要机器人账号以及登录 Telegram 个人账号，需要自己注册 Telegram API ID，并且还需要配置一些辅助服务。如果没有条件，可以使用 [v1.x](https://github.com/Clansty/Q2TG/tree/main) 版本

## 支持的消息类型

- [x] 文字（双向）
- [x] 图片（双向）
  - [x] GIF
  - [x] 闪照

    闪照每个 TG 用户也只能查看 5 秒
- [x] 图文混排消息（双向）
- [x] 大表情（双向）
  - [x] TG 中的动态 Sticker

    目前是[转换成 GIF](https://github.com/ed-asriyan/tgs-to-gif) 发送的，并且可能有些[问题](https://github.com/ed-asriyan/tgs-to-gif/issues/13#issuecomment-633244547)
- [x] 视频（双向）
- [x] 语音（双向）
- [x] 小表情（可显示为文字）
- [x] 链接（双向）
- [x] JSON/XML 卡片

  （包括部分转化为小程序的链接）
- [x] 位置（TG -> QQ）
- [x] 群公告
- [x] 回复（双平台原生回复）
- [x] 文件

  QQ -> TG 按需获取下载地址

  TG -> QQ 将自动转发 20M 一下的小文件
- [x] 转发多条消息记录
- [x] TG 编辑消息（撤回再重发）
- [x] 双向撤回消息
- [x] 戳一戳

## 关于模式

### 群组模式

群组模式就是 1.x 版本唯一的模式，是给群主使用的。如果群组想要使自己的 QQ 群和 Telegram 群联通起来，就使用这个模式。群组模式只可以给群聊配置转发，并且转发消息时会带上用户在当前平台的发送者名称。

### 个人模式

个人模式适合 QQ 轻度使用者，TG 重度使用者。可以把 QQ 的好友和群聊搬到 Telegram 中。个人模式一定要登录机器人主人自己的 Telegram 账号作为 UserBot。可以自动为 QQ 中的好友和群组创建对应的 Telegram 群组，并同步头像简介等信息。当有没有创建关联的好友发起私聊的时候会自动创建 Telegram 中的对应群组。个人模式在初始化的时候会自动在 Telegram 个人账号中创建一个文件夹来存储所有来自 QQ 的对应群组。消息在从 TG 转发到 QQ 时不会带上发送者昵称，因为默认发送者只有一个人。

## 如何撤回消息

在 QQ 中，直接撤回相应的消息，撤回操作会同步到 TG

在 TG 中，可以选择以下操作之一：

- 将消息内容编辑为 `/rm`
- 回复要撤回的消息，内容为 `/rm`。如果操作者在 TG 群组中没有「删除消息」权限，则只能撤回自己的消息
- 如果正确配置了个人账号的 User Bot，可以直接删除消息

为了使撤回功能正常工作，TG 机器人需要具有「删除消息」权限，QQ 机器人需要为管理员或群主

即使 QQ 机器人为管理员，也无法撤回其他管理员在 QQ 中发送的消息

## 免责声明

一切开发旨在学习，请勿用于非法用途。本项目完全免费开源，不会收取任何费用，无任何担保。请勿将本项目用于商业用途。由于使用本程序造成的任何问题，由使用者自行承担，项目开发者不承担任何责任。

本项目基于 AGPL 发行。修改、再发行和运行服务需要遵守 AGPL 许可证，源码需要和服务一起提供。

## 许可证

```
This program is free software: you can redistribute it and/or modify
it under the terms of the GNU Affero General Public License as
published by the Free Software Foundation, either version 3 of the
License, or (at your option) any later version.

This program is distributed in the hope that it will be useful,
but WITHOUT ANY WARRANTY; without even the implied warranty of
MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
GNU Affero General Public License for more details.

You should have received a copy of the GNU Affero General Public License
along with this program.  If not, see <http://www.gnu.org/licenses/>.
```
