import {createClient, MessageElem} from 'oicq'
import TelegramBot from 'node-telegram-bot-api'
import processQQMsg from './utils/processQQMessage'
import {addLink, getQQByTg, getTgByQQ, init as storageInit} from './utils/MsgIdStorage'
import config from './utils/config'
import path from 'path'
import MessageMirai from './types/MessageMirai'
import {cacheTgAvatar, getCachedTgAvatarMd5} from './utils/tgAvatarCache'

(() => [
    '#5bcffa',
    '#f5abb9',
    '#ffffff',
    '#f5abb9',
    '#5bcffa',
])()

;(async () => {
    await storageInit()
    const forwardOff: { [tgGin: number]: boolean } = {}

    const qq = createClient(config.qqUin)
    qq.login(config.qqPasswd)

    const tg = new TelegramBot(config.tgToken, {polling: true})

    qq.on('message.group', async data => {
        try {
            const fwd = config.groups.find(e => e.qq === data.group_id)
            if (!fwd) return
            const msg = await processQQMsg(data.message)
            const nick = data.sender.card ? data.sender.card : data.sender.nickname
            let ret: TelegramBot.Message
            if (msg.image) {
                ret = await tg.sendPhoto(fwd.tg, msg.image, {
                    caption: nick + '：' + (
                        msg.content ? '\n' + msg.content : ''
                    ),
                    reply_to_message_id: msg.replyTgId,
                })
            } else if (msg.video) {
                ret = await tg.sendVideo(fwd.tg, msg.video, {
                    caption: nick + '：',
                    reply_to_message_id: msg.replyTgId,
                })
            } else {
                ret = await tg.sendMessage(fwd.tg, nick + '：\n' + msg.content, {
                    reply_to_message_id: msg.replyTgId,
                })
            }
            //保存 id 对应关系
            await addLink(data.message_id, ret.message_id, fwd.tg)
        } catch (e) {
            console.log(e)
        }
    })

    qq.on('notice.group.recall', async data => {
        try {
            const fwd = config.groups.find(e => e.qq === data.group_id)
            if (!fwd) return
            const tgMsgId = await getTgByQQ(data.message_id)
            if (tgMsgId) {
                await tg.deleteMessage(fwd.tg, String(tgMsgId))
            }
        } catch (e) {
            console.log(e)
        }
    })

    tg.on('message', async msg => {
        try {
            const fwd = config.groups.find(e => e.tg === msg.chat.id)
            if (!fwd) return
            const chain: MessageElem[] = [
                {
                    type: 'text',
                    data: {
                        text: msg.from.first_name +
                            (msg.from.last_name ? ' ' + msg.from.last_name : '') +
                            (msg.forward_from ? ' Forwarded from ' + msg.forward_from.first_name : '')
                            + '：\n',
                    },
                },
            ]
            if (msg.reply_to_message) {
                const replyQQId = await getQQByTg(msg.reply_to_message.message_id, fwd.tg)
                if (replyQQId)
                    chain.unshift({
                        type: 'reply',
                        data: {
                            id: replyQQId,
                        },
                    })
            }
            if (msg.photo) {
                const photoId = msg.photo[msg.photo.length - 1].file_id
                const url = await tg.getFileLink(photoId)
                chain.push({
                    type: 'image',
                    data: {
                        file: url,
                    },
                })
            }
            if (msg.document && ['.jpg', '.jpeg', '.png', '.bmp', '.gif', '.webp'].includes(
                path.extname(msg.document.file_name))) {
                const photoId = msg.document.file_id
                const url = await tg.getFileLink(photoId)
                chain.push({
                    type: 'image',
                    data: {
                        file: url,
                    },
                })
            }
            if (msg.sticker) {
                const photoId = msg.sticker.file_id
                const url = await tg.getFileLink(photoId)
                chain.push({
                    type: 'image',
                    data: {
                        file: url,
                    },
                })
            }
            if (msg.caption) {
                chain.push({
                    type: 'text',
                    data: {
                        text: '\n' + msg.caption,
                    },
                })
            }
            if (msg.text) {
                chain.push({
                    type: 'text',
                    data: {
                        text: msg.text,
                    },
                })
            }
            const lastForwardOff = forwardOff[fwd.tg]
            if (msg.text && msg.text.startsWith('/forwardon')) {
                forwardOff[fwd.tg] = false
                chain.push({
                    type: 'text',
                    data: {
                        text: '\n恢复了 TG -> QQ 消息转发',
                    },
                })
                await tg.sendMessage(fwd.tg, 'TG -> QQ 消息转发已恢复', {
                    reply_to_message_id: msg.message_id,
                })
            } else if (msg.text && msg.text.startsWith('/forwardoff')) {
                forwardOff[fwd.tg] = true
                chain.push({
                    type: 'text',
                    data: {
                        text: '\n暂停了 TG -> QQ 消息转发',
                    },
                })
                await tg.sendMessage(fwd.tg, 'TG -> QQ 消息转发已暂停', {
                    reply_to_message_id: msg.message_id,
                })
            }
            if (!(lastForwardOff && forwardOff[fwd.tg])) {
                let avatarMd5 = getCachedTgAvatarMd5(msg.from.id)
                if (!avatarMd5) {
                    try {
                        const photos = await tg.getUserProfilePhotos(msg.from.id, {limit: 1})
                        const photo = photos.photos[0]
                        const fid = photo[photo.length - 1].file_id
                        const url = await tg.getFileLink(fid)
                        const uploadRet = await qq.preloadImages([url])
                        if (uploadRet.data) {
                            avatarMd5 = uploadRet.data[0].substr(0, 32)
                            cacheTgAvatar(msg.from.id, avatarMd5)
                        }
                    } catch (e) {
                        console.log(e)
                    }
                }
                const mirai: MessageMirai = {
                    eqq: {
                        type: 'tg',
                        tgUid: msg.from.id,
                        avatarMd5,
                    },
                }
                chain.push({
                    type: 'mirai',
                    data: {
                        data: JSON.stringify(mirai, undefined, 0),
                    },
                })
                const ret = await qq.sendGroupMsg(fwd.qq, chain)
                if (ret.data)
                    await addLink(ret.data.message_id, msg.message_id, fwd.tg)
                else
                    console.log(ret.error)
            }
        } catch (e) {
            console.log(e)
        }
    })
})()
