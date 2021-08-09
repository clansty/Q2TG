import {MessageElem} from 'oicq'
import {addFile, getTgByQQ} from './storage'
import {base64decode} from 'nodejs-base64'
import silkDecode from './silkDecode'
import hSize from './hSize'

interface QQMessage {
    file?: string
    content: string
    image: string[]
    video?: string
    replyTgId?: number
    audio?: Buffer
}

export default async (oicqMessage: MessageElem[], gin: number) => {
    const message: QQMessage = {
        content: '',
        image: []
    }
    let lastType, replyToQUin
    for (let i = 0; i < oicqMessage.length; i++) {
        const m = oicqMessage[i]
        let appurl
        switch (m.type) {
            case 'at':
                if (lastType === 'reply') {
                    replyToQUin = m.data.qq
                    break
                }
                if (replyToQUin === m.data.qq)
                    break
            case 'text':
                message.content += m.data.text
                break
            case 'image':
            case 'flash':
                message.image.push(m.data.url)
                break
            case 'bface':
                const url = `https://gxh.vip.qq.com/club/item/parcel/item/${m.data.file.substr(
                    0,
                    2,
                )}/${m.data.file.substr(0, 32)}/300x300.png`
                message.image.push(url)
                break
            case 'file':
                message.content += '文件: ' + m.data.name + '\n' +
                    '大小: ' + hSize(m.data.size)
                const oid = await addFile(gin, m.data.fid, message.content)
                message.file = oid
                break
            case 'share':
                message.content += m.data.url
                break
            case 'reply':
                message.replyTgId = await getTgByQQ(m.data.id)
                break
            case 'json':
                const json = m.data.data
                const jsonObj = JSON.parse(json)
                if (jsonObj.app === 'com.tencent.mannounce') {
                    try {
                        const title = base64decode(jsonObj.meta.mannounce.title)
                        const content = base64decode(jsonObj.meta.mannounce.text)
                        message.content = title + '\n\n' + content
                        break
                    } catch (err) {
                    }
                }
                const biliRegex = /(https?:\\?\/\\?\/b23\.tv\\?\/\w*)\??/
                const zhihuRegex = /(https?:\\?\/\\?\/\w*\.?zhihu\.com\\?\/[^?"=]*)\??/
                const biliRegex2 = /(https?:\\?\/\\?\/\w*\.?bilibili\.com\\?\/[^?"=]*)\??/
                const jsonLinkRegex = /{.*"app":"com.tencent.structmsg".*"jumpUrl":"(https?:\\?\/\\?\/[^",]*)".*}/
                const jsonAppLinkRegex = /"contentJumpUrl": ?"(https?:\\?\/\\?\/[^",]*)"/
                if (biliRegex.test(json))
                    appurl = json.match(biliRegex)[1].replace(/\\\//g, '/')
                else if (biliRegex2.test(json))
                    appurl = json.match(biliRegex2)[1].replace(/\\\//g, '/')
                else if (zhihuRegex.test(json))
                    appurl = json.match(zhihuRegex)[1].replace(/\\\//g, '/')
                else if (jsonLinkRegex.test(json))
                    appurl = json.match(jsonLinkRegex)[1].replace(/\\\//g, '/')
                else if (jsonAppLinkRegex.test(json))
                    appurl = json.match(jsonAppLinkRegex)[1].replace(/\\\//g, '/')
                if (appurl) {
                    message.content = appurl
                } else {
                    message.content = '[JSON]'
                }
                break
            case 'xml':
                const urlRegex = /url="([^"]+)"/
                if (urlRegex.test(m.data.data))
                    appurl = m.data.data.match(urlRegex)[1].replace(/\\\//g, '/')
                if (m.data.data.includes('action="viewMultiMsg"')) {
                    message.content += '[Forward multiple messages]'
                } else if (appurl) {
                    appurl = appurl.replace(/&amp;/g, '&')
                    message.content = appurl
                } else {
                    message.content += '[XML]'
                }
                break
            case 'face':
                if (m.data.text)
                    message.content += m.data.text
                break
            case 'video':
                // message.content = "[Video]";
                message.video = m.data.url
                if (/https?:\/\/[^,]*qqdownload[^,]*/.test(message.video))
                    message.video = /https?:\/\/[^,]*qqdownload[^,]*/.exec(message.video)[0]
                break
            case 'record':
                try {
                    message.audio = await silkDecode(m.data.url)
                } catch (e) {
                    message.content = '[下载失败的语音]'
                }
                break
        }
        lastType = m.type
    }
    message.content = message.content.trim()
    return message
}
