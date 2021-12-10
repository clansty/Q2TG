import {getQQByTg, rmLinkByQQMsgId} from '../utils/storage'
import {qq, tg} from '../index'

export default async (messageId: number, chatId: number, isOthersMsg = false) => {
    const qMsgId = await getQQByTg(messageId, chatId)
    if (qMsgId) {
        await rmLinkByQQMsgId(qMsgId)
        //if ((await qq.deleteMsg(qMsgId)).error) {
        //    const tipMsg = await tg.sendMessage(chatId,
        //        '撤回 QQ 中对应的消息失败，QQ Bot 需要是管理员' +
        //        (isOthersMsg ? '，而且无法撤回其他管理员的消息' : ''), {
        //            disable_notification: true,
        //        })
        //    setTimeout(() => tg.deleteMessage(chatId, String(tipMsg.message_id)), 5000)
        //}
    }
}
