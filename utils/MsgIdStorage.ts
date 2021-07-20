import {Collection, MongoClient} from "mongodb";
import config from './config'

interface IdStorageSchema {
    qqMsgId: string
    tgMsgId: number
    tgChatId: number
}

let col: Collection<IdStorageSchema>

export const init = async () => {
    const dba = await MongoClient.connect(config.mongoDb.connStr)
    const mdb = dba.db(config.mongoDb.dbName)
    col = mdb.collection('msgIds')

    await col.createIndex('qqMsgId', {
        background: true,
        unique: true
    })
    await col.createIndex('tgMsgId', {
        background: true
    })
    await col.createIndex('tgChatId', {
        background: true
    })
}

export const addLink = (qqMsgId: string, tgMsgId: number, tgChatId: number): Promise<any> => {
    return col.insertOne({
        qqMsgId, tgMsgId, tgChatId
    })
}

export const getTgByQQ = async (qqMsgId: string): Promise<number> => {
    const doc = await col.findOne({qqMsgId})
    return doc ? doc.tgMsgId : null
}

export const getQQByTg = async (tgMsgId: number, tgChatId: number): Promise<string> => {
    const doc = await col.findOne({tgMsgId, tgChatId})
    return doc ? doc.qqMsgId : null
}
