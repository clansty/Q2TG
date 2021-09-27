import COS from 'cos-nodejs-sdk-v5'
import config from '../providers/config'
import {Stream} from 'stream'

let cos: COS
if (config.cos.enabled)
    cos = new COS({
        SecretId: config.cos.secretId,
        SecretKey: config.cos.secretKey,
    })

export default async (fileName: string, content: Buffer | Stream) => {
    return cos.putObject({
        Bucket: config.cos.bucket,
        Region: config.cos.region,
        Key: fileName,
        Body: content,
    })
}
