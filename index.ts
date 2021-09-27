import {createClient} from 'oicq'
import TelegramBot, {InlineKeyboardMarkup, InputMediaPhoto} from 'node-telegram-bot-api'
import processQQMsg from './utils/processQQMessage'
import {addLink, getTgByQQ, init as storageInit} from './utils/storage'
import config from './providers/config'
import axios from 'axios'
import fileType from 'file-type'
import htmlEscape from './utils/htmlEscape'
import createForwardSign from './utils/createForwardSign'
import handleTgMsgDelete from './handlers/handleTgMsgDelete'
import forwardTgMessage from './handlers/forwardTgMessage'
import {init as apiServerInit} from './providers/apiServer'
import sleep from './utils/sleep'

(() => [
    '#5bcffa',
    '#f5abb9',
    '#ffffff',
    '#f5abb9',
    '#5bcffa',
])()

export const qq = createClient(config.qqUin, {
    platform: config.protocol,
})
export const tg = new TelegramBot(config.tgToken, {polling: true})
export const forwardOff: { [tgGin: number]: boolean } = {}

;(async () => {
    await storageInit()
    const me = await tg.getMe()

    qq.login(config.qqPasswd)
    await apiServerInit()

    qq.on('message.group', async data => {
        try {
            const fwd = config.groups.find(e => e.qq === data.group_id)
            if (!fwd) return
            const msg = await processQQMsg(data.message, data.group_id)
            const nick = data.sender.card ? data.sender.card : data.sender.nickname
            let ret: TelegramBot.Message
            if (msg.image.length === 1) {
                try {
                    const bufImg: Buffer = (await axios.get(msg.image[0], {
                        responseType: 'arraybuffer',
                    })).data
                    const type = await fileType.fromBuffer(bufImg)
                    if (type.ext === 'gif')
                        ret = await tg.sendAnimation(fwd.tg, bufImg, {
                            caption: `<b>${htmlEscape(nick)}</b>：${msg.content ? '\n' + htmlEscape(msg.content) : ''}`,
                            reply_to_message_id: msg.replyTgId,
                            parse_mode: 'HTML',
                        })
                    else
                        ret = await tg.sendPhoto(fwd.tg, bufImg, {
                            caption: `<b>${htmlEscape(nick)}</b>：${msg.content ? '\n' + htmlEscape(msg.content) : ''}`,
                            reply_to_message_id: msg.replyTgId,
                            parse_mode: 'HTML',
                        })
                } catch (e) {
                    //alternative sending way
                    ret = await tg.sendPhoto(fwd.tg, msg.image[0], {
                        caption: `<b>${htmlEscape(nick)}</b>：${msg.content ? '\n' + htmlEscape(msg.content) : ''}`,
                        reply_to_message_id: msg.replyTgId,
                        parse_mode: 'HTML',
                    })
                    console.log(e)
                }
            }
            else if (msg.image.length > 1) {
                const group: InputMediaPhoto[] = []
                let caption = `<b>${htmlEscape(nick)}</b>：${msg.content ? '\n' + htmlEscape(msg.content) : ''}`
                for (const media of msg.image) {
                    group.push({
                        media,
                        type: 'photo',
                        caption,
                        parse_mode: caption ? 'HTML' : undefined,
                    })
                    caption = undefined
                }
                ret = await tg.sendMediaGroup(fwd.tg, group, {
                    reply_to_message_id: msg.replyTgId,
                })
            }
            else if (msg.video) {
                try {
                    const bufVid: Buffer = (await axios.get(msg.video, {
                        responseType: 'arraybuffer',
                    })).data
                    ret = await tg.sendVideo(fwd.tg, bufVid, {
                        caption: `<b>${htmlEscape(nick)}</b>：`,
                        reply_to_message_id: msg.replyTgId,
                        parse_mode: 'HTML',
                    })
                } catch (e) {
                    ret = await tg.sendMessage(fwd.tg, `<b>${htmlEscape(nick)}</b>：\n[下载失败的视频]`, {
                        reply_to_message_id: msg.replyTgId,
                        parse_mode: 'HTML',
                    })
                    console.log(e)
                }
            }
            else if (msg.audio) {
                ret = await tg.sendVoice(fwd.tg, msg.audio, {
                    caption: `<b>${htmlEscape(nick)}</b>：`,
                    reply_to_message_id: msg.replyTgId,
                    parse_mode: 'HTML',
                })
            }
            else {
                let kbd: InlineKeyboardMarkup
                if (msg.file) {
                    kbd = {
                        inline_keyboard: [[{
                            text: '获取下载链接',
                            url: 'https://t.me/' + me.username + '?start=' + msg.file,
                        }]],
                    }
                }
                if (msg.forward && config.crv.host) {
                    kbd = {
                        inline_keyboard: [[{
                            text: '查看',
                            url: `${config.crv.host}?res=${msg.forward}&sign=${createForwardSign(msg.forward)}`,
                        }]],
                    }
                }
                ret = await tg.sendMessage(fwd.tg, `<b>${htmlEscape(nick)}</b>：\n${htmlEscape(msg.content)}`, {
                    reply_to_message_id: msg.replyTgId,
                    reply_markup: kbd,
                    parse_mode: 'HTML',
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

            let tgMsgId: number
            let retries = 0
            while (!tgMsgId) {
                if (retries > 10) return
                retries > 0 && await sleep(2000)
                tgMsgId = await getTgByQQ(data.message_id)
                retries++
            }
            await tg.deleteMessage(fwd.tg, String(tgMsgId))
        } catch (e) {
            console.log(e)
        }
    })

    tg.on('message', forwardTgMessage)

    tg.on('edited_message', async msg => {
        try {
            const fwd = config.groups.find(e => e.tg === msg.chat.id)
            if (!fwd) return
            await handleTgMsgDelete(msg.message_id, msg.chat.id)
            await forwardTgMessage(msg)
        } catch (e) {
            console.log(e)
        }
    })
})()
