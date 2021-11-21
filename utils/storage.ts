import {Collection, MongoClient, ObjectId} from 'mongodb'
import config from '../providers/config'
import * as console from 'console'

interface IdStorageSchema {
    qqMsgId: string
    tgMsgId: number
    tgChatId: number
}

interface FileInfoSchema {
    gin: number
    fid: string
    info: string
}

let col: Collection<IdStorageSchema>
let files: Collection<FileInfoSchema>

export const init = async () => {
    const dba = await MongoClient.connect(config.mongoDb.connStr)
    const mdb = dba.db(config.mongoDb.dbName)
    col = mdb.collection('msgIds')
    files = mdb.collection('files')

    try {
        await col.createIndex('qqMsgId', {
            background: true,
            unique: true,
        })
    } catch (e) {
        console.log(e)
    }
    try {
        await col.createIndex('tgMsgId', {
            background: true,
        })
    } catch (e) {
        console.log(e)
    }
    try {
        await col.createIndex('tgChatId', {
            background: true,
        })
    } catch (e) {
        console.log(e)
    }
}

export const addLink = (qqMsgId: string, tgMsgId: number, tgChatId: number): Promise<any> => {
    return col.insertOne({
        qqMsgId, tgMsgId, tgChatId,
    })
}

export const rmLinkByQQMsgId = (qqMsgId: string): Promise<any> => {
    return col.deleteOne({
        qqMsgId,
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

export const addFile = async (gin: number, fid: string, info: string): Promise<string> => {
    const ret = await files.insertOne({gin, fid, info})
    return ret.insertedId.toHexString()
}

export const getFile = (oid: string) => files.findOne({_id: new ObjectId(oid)})
