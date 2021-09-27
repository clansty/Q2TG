import {MessageElem} from 'oicq'
import {getQQByTg} from './storage'
import path from 'path'
import TelegramBot from 'node-telegram-bot-api'
import {ForwardInfo} from '../providers/config'
import {tg} from '../index'
import getUserDisplayName from './getUserDisplayName'
import silkEncode from './silkEncode'
import {file} from 'tmp-promise'
import pipeSaveStream from './pipeSaveStream'
import {streamToBuffer} from './streamToBuffer'
import {IMAGE_EXT} from '../constants'

type CleanUpFunction = () => Promise<void>
export default async (msg: TelegramBot.Message, fwd: ForwardInfo): Promise<{
    cleanup: CleanUpFunction,
    chain: MessageElem[]
}> => {
    let cleanup: CleanUpFunction = async () => {
    }
    const chain: MessageElem[] = [
        {
            type: 'text',
            data: {
                text: getUserDisplayName(msg.from) +
                    (msg.forward_from ? ' Forwarded from ' + getUserDisplayName(msg.forward_from) : '') +
                    (msg.forward_from_chat ? ' Forwarded from ' + msg.forward_from_chat.title : '') +
                    '：\n',
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
        const stream = await tg.getFileStream(photoId)
        chain.push({
            type: 'image',
            data: {
                file: await streamToBuffer(stream),
            },
        })
    }
    if (msg.animation) {
        const tmp = await file()
        cleanup = tmp.cleanup
        const stream = tg.getFileStream(msg.animation.file_id)
        await pipeSaveStream(stream, tmp.path)
        chain.push({
            type: 'video',
            data: {
                file: tmp.path,
            },
        })
    }
    else if (msg.document) {
        if (IMAGE_EXT.includes(
            path.extname(msg.document.file_name).toLowerCase())) {
            const photoId = msg.document.file_id
            const stream = await tg.getFileStream(photoId)
            chain.push({
                type: 'image',
                data: {
                    file: await streamToBuffer(stream),
                },
            })
        }
        else
            chain.push({
                type: 'text',
                data: {
                    text: '[文件：' + msg.document.file_name + ']',
                },
            })
    }
    if (msg.sticker) {
        const photoId = msg.sticker.file_id
        const stream = await tg.getFileStream(photoId)
        chain.push({
            type: 'image',
            data: {
                file: await streamToBuffer(stream),
                type: 'face',
            },
        })
    }
    if (msg.new_chat_title) {
        chain.push({
            type: 'text',
            data: {
                text: 'TG 群名称更改为：\n' + msg.new_chat_title,
            },
        })
    }
    if (msg.new_chat_photo) {
        const photoId = msg.new_chat_photo[msg.new_chat_photo.length - 1].file_id
        const stream = await tg.getFileStream(photoId)
        chain.push({
                type: 'text',
                data: {
                    text: '更改了 TG 群组头像：\n',
                },
            },
            {
                type: 'image',
                data: {
                    file: await streamToBuffer(stream),
                },
            })
    }
    if (msg.pinned_message) {
        chain.push({
            type: 'text',
            data: {
                text: '置顶了消息：\n' + msg.pinned_message.text,
            },
        })
    }
    if (msg.new_chat_members) {
        for (const newChatMember of msg.new_chat_members) {
            chain.push({
                type: 'text',
                data: {
                    text: getUserDisplayName(newChatMember) + '\n',
                },
            })
        }
        chain.push({
            type: 'text',
            data: {
                text: '加入了群聊',
            },
        })
    }
    if (msg.left_chat_member) {
        chain.push({
            type: 'text',
            data: {
                text: getUserDisplayName(msg.left_chat_member) + '退群了',
            },
        })
    }
    if (msg.poll) {
        chain.push({
            type: 'text',
            data: {
                text: '发起投票：\n' + msg.poll.question,
            },
        })
        for (const opt of msg.poll.options) {
            chain.push({
                type: 'text',
                data: {
                    text: '\n - ' + opt.text,
                },
            })
        }
    }
    if (msg.voice) {
        const ogg = tg.getFileStream(msg.voice.file_id)
        chain.push({
            type: 'record',
            data: {
                file: await silkEncode(ogg),
            },
        })
    }
    if (msg.video) {
        const tmp = await file()
        cleanup = tmp.cleanup
        const stream = tg.getFileStream(msg.video.file_id)
        await pipeSaveStream(stream, tmp.path)
        chain.push({
            type: 'video',
            data: {
                file: tmp.path,
            },
        })
    }
    if (msg.video_note) {
        const tmp = await file()
        cleanup = tmp.cleanup
        const stream = tg.getFileStream(msg.video_note.file_id)
        await pipeSaveStream(stream, tmp.path)
        chain.push({
            type: 'video',
            data: {
                file: tmp.path,
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
    return {chain, cleanup}
}
