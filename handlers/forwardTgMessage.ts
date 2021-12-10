import TelegramBot from 'node-telegram-bot-api'
import {addLink, getFile} from '../utils/storage'
import config from '../providers/config'
import processTgMessage from '../utils/processTgMessage'
import MessageMirai from '../types/MessageMirai'
import {getAvatarMd5OrUrl} from '../utils/tgAvatarCache'
import {forwardOff, qq, tg} from '../index'
import handleTgMsgDelete from './handleTgMsgDelete'

export default async (msg: TelegramBot.Message) => {
    try {
        if (msg.chat.id > 0) {
            if (msg.text && msg.text.startsWith('/start ')) {
                const oid = msg.text.substr('/start '.length)
                if (!oid) return
                const file = await getFile(oid)
                if (!file) {
                    await tg.sendMessage(msg.from.id, '文件信息获取失败')
                    return
                }
                const oicqFile = await qq.acquireGfs(file.gin).download(file.fid)
                await tg.sendMessage(msg.from.id, file.info + '\nmd5: ' + oicqFile.md5, {
                    reply_markup: {
                        inline_keyboard: [[{
                            text: '下载',
                            url: oicqFile.url,
                        }]],
                    },
                })
            }
            return
        }
        const fwd = config.groups.find(e => e.tg === msg.chat.id)
        if (!fwd) {
            if (msg.text && msg.text.toLowerCase().startsWith('/id'))
                await tg.sendMessage(msg.chat.id, String(msg.chat.id), {
                    reply_to_message_id: msg.message_id,
                })
            return
        }
        //如果是要撤回
        if (msg.text && msg.text.toLowerCase().startsWith('/rm')) {
            if (msg.reply_to_message) {
                let hasPermission = msg.reply_to_message.from.id === msg.from.id
                if (!hasPermission) {
                    //检查群主或者是有撤回消息权限的管理员
                    const member = await tg.getChatMember(msg.chat.id, String(msg.from.id))
                    hasPermission = member.status === 'creator' || member.can_delete_messages
                }
                if (hasPermission) { //双平台撤回被回复的消息
                    await handleTgMsgDelete(msg.reply_to_message.message_id, msg.reply_to_message.chat.id, true)
                    try {
                        await tg.deleteMessage(msg.reply_to_message.chat.id, String(msg.reply_to_message.message_id))
                    } catch (e) {
                    }
                }
                else {
                    const tipMsg = await tg.sendMessage(msg.chat.id, '不能撤回别人的消息', {
                        disable_notification: true,
                    })
                    setTimeout(() => tg.deleteMessage(msg.chat.id, String(tipMsg.message_id)), 5000)
                }
            }//撤回消息本身
            try {
                await tg.deleteMessage(msg.chat.id, String(msg.message_id))
            } catch (e) {
                const tipMsg = await tg.sendMessage(msg.chat.id,
                    'Bot 目前无法撤回其他用户的消息，Bot 需要「删除消息」权限', {
                        disable_notification: true,
                    })
                setTimeout(() => tg.deleteMessage(msg.chat.id, String(tipMsg.message_id)), 5000)
            }
            return
        }
        const {chain, cleanup} = await processTgMessage(msg, fwd)
        const lastForwardOff = forwardOff[fwd.tg]
        if (msg.text && msg.text.startsWith('/forwardon')) {
            forwardOff[fwd.tg] = false
            chain.push({
                type: 'text',
                text: '\n恢复了 TG -> QQ 消息转发',
            })
            await tg.sendMessage(fwd.tg, 'TG -> QQ 消息转发已恢复', {
                reply_to_message_id: msg.message_id,
            })
        }
        else if (msg.text && msg.text.startsWith('/forwardoff')) {
            forwardOff[fwd.tg] = true
            chain.push({
                type: 'text',
                text: '\n暂停了 TG -> QQ 消息转发',
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
                },
            }
            if (config.cos?.enabled) {
                mirai.eqq.avatarUrl = await getAvatarMd5OrUrl(msg.from.id)
            }
            else {
                mirai.eqq.avatarMd5 = await getAvatarMd5OrUrl(msg.from.id)
            }
            chain.push({
                type: 'mirai',
                    data: JSON.stringify(mirai, undefined, 0),
            })
            const ret = await qq.sendGroupMsg(fwd.qq, chain)
            if (ret)
                await addLink(ret.message_id, msg.message_id, fwd.tg)
            else
                console.log(ret)
            await cleanup()
        }
    } catch (e) {
        console.log(e)
    }
}
