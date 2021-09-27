import {MessageElem} from 'oicq'
import {addFile, getTgByQQ} from './storage'
import {base64decode} from 'nodejs-base64'
import silkDecode from './silkDecode'
import hSize from './hSize'
import BilibiliMiniApp from '../types/BilibiliMiniApp'
import StructMessageCard from '../types/StructMessageCard'
import getImageUrlByMd5 from './getImageUrlByMd5'
import path from 'path'
import {IMAGE_EXT} from '../constants'

interface QQMessage {
    forward?: string
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
        image: [],
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
                const extName = path.extname(m.data.name)
                if (IMAGE_EXT.includes(extName.toLowerCase())) {
                    message.image.push(m.data.url)
                }
                else {
                    message.content += '文件: ' + m.data.name + '\n' +
                        '大小: ' + hSize(m.data.size)
                    const oid = await addFile(gin, m.data.fid, message.content)
                    message.file = oid
                }
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
                    try {
                        const meta = (<BilibiliMiniApp>jsonObj).meta.detail_1 || (<StructMessageCard>jsonObj).meta.news
                        message.content = meta.desc + '\n\n'

                        let previewUrl = meta.preview
                        if (!previewUrl.toLowerCase().startsWith('http')) {
                            previewUrl = 'https://' + previewUrl
                        }
                        message.image.push(previewUrl)
                    } catch (e) {
                    }

                    message.content += appurl
                }
                else {
                    message.content = '[JSON]'
                }
                break
            case 'xml':
                const urlRegex = /url="([^"]+)"/
                const md5ImageRegex = /image md5="([A-F\d]{32})"/
                if (urlRegex.test(m.data.data))
                    appurl = m.data.data.match(urlRegex)[1].replace(/\\\//g, '/')
                if (m.data.data.includes('action="viewMultiMsg"')) {
                    message.content += '[Forward multiple messages]'
                    const resIdRegex = /m_resid="([\w+=/]+)"/
                    if (resIdRegex.test(m.data.data)) {
                        const resId = m.data.data.match(resIdRegex)![1]
                        console.log(resId)
                        message.content = '[转发多条消息记录]'
                        message.forward = resId
                    }
                }
                else if (appurl) {
                    appurl = appurl.replace(/&amp;/g, '&')
                    message.content = appurl
                }
                else if (md5ImageRegex.test(m.data.data)) {
                    const imgMd5 = appurl = m.data.data.match(md5ImageRegex)![1]
                    message.image.push(getImageUrlByMd5(imgMd5))
                }
                else {
                    message.content += '[XML]'
                }
                break
            case 'face':
                if (m.data.text)
                    message.content += `[${m.data.text}]`
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
