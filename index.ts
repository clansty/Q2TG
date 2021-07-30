import {createClient, MessageElem} from 'oicq'
import TelegramBot from 'node-telegram-bot-api'
import processQQMsg from './utils/processQQMessage'
import {addLink, getQQByTg, getTgByQQ, init as storageInit} from './utils/MsgIdStorage'
import config from './utils/config'
import path from 'path'
import MessageMirai from './types/MessageMirai'
import {getAvatarMd5} from './utils/tgAvatarCache'
import axios from 'axios'
import fileType from 'file-type'
import processTgMessage from './utils/processTgMessage'

(() => [
    '#5bcffa',
    '#f5abb9',
    '#ffffff',
    '#f5abb9',
    '#5bcffa',
])()

export const qq = createClient(config.qqUin)
export const tg = new TelegramBot(config.tgToken, {polling: true})

;(async () => {
    await storageInit()
    const forwardOff: { [tgGin: number]: boolean } = {}

    qq.login(config.qqPasswd)

    qq.on('message.group', async data => {
        try {
            const fwd = config.groups.find(e => e.qq === data.group_id)
            if (!fwd) return
            const msg = await processQQMsg(data.message)
            const nick = data.sender.card ? data.sender.card : data.sender.nickname
            let ret: TelegramBot.Message
            if (msg.image) {
                try {
                    const bufImg: Buffer = (await axios.get(msg.image, {
                        responseType: 'arraybuffer',
                    })).data
                    const type = await fileType.fromBuffer(bufImg)
                    if (type.ext === 'gif')
                        ret = await tg.sendAnimation(fwd.tg, bufImg, {
                            caption: nick + '：' + (
                                msg.content ? '\n' + msg.content : ''
                            ),
                            reply_to_message_id: msg.replyTgId,
                        })
                    else
                        ret = await tg.sendPhoto(fwd.tg, bufImg, {
                            caption: nick + '：' + (
                                msg.content ? '\n' + msg.content : ''
                            ),
                            reply_to_message_id: msg.replyTgId,
                        })
                } catch (e) {
                    ret = await tg.sendMessage(fwd.tg, nick + '：\n' + msg.content + '\n[下载失败的图片]', {
                        reply_to_message_id: msg.replyTgId,
                    })
                    console.log(e)
                }
            } else if (msg.video) {
                try {
                    const bufVid: Buffer = (await axios.get(msg.video, {
                        responseType: 'arraybuffer',
                    })).data
                    ret = await tg.sendVideo(fwd.tg, bufVid, {
                        caption: nick + '：',
                        reply_to_message_id: msg.replyTgId,
                    })
                } catch (e) {
                    ret = await tg.sendMessage(fwd.tg, nick + '：\n' + '[下载失败的视频]', {
                        reply_to_message_id: msg.replyTgId,
                    })
                    console.log(e)
                }
            } else if (msg.audio) {
                ret = await tg.sendVoice(fwd.tg, msg.audio, {
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
            const chain = await processTgMessage(msg, fwd)
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
                const mirai: MessageMirai = {
                    eqq: {
                        type: 'tg',
                        tgUid: msg.from.id,
                        avatarMd5: await getAvatarMd5(msg.from.id),
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
