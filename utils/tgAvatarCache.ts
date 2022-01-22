import {qq, tg} from '../index'
import {streamToBuffer} from './streamToBuffer'
import config from '../providers/config'
import cosUploadFile from './picBeds/cosUploadFile'
import smmsUpload from './picBeds/smmsUpload'
import biliPicUpload from './picBeds/biliPicUpload'
import getImageUrlByMd5 from './getImageUrlByMd5'

const cache = new Map<number, { md5: string, exp: Date }>()

//当配置对象存储时返回 URL，否则返回预载图片的 MD5
export const getAvatarMd5OrUrl = async (uid: number) => {
    let avatar = getCachedTgAvatar(uid)
    if (!avatar) {
        let buffer: Buffer
        try {
            const photos = await tg.getUserProfilePhotos(uid, {limit: 1})
            const photo = photos.photos[0]
            const fid = photo[photo.length - 1].file_id
            const stream = await tg.getFileStream(fid)
            buffer = await streamToBuffer(stream)
        } catch (e) {
            console.error('无法获取头像', e)
            return null
        }
        if (config.smms?.enabled) {
            try {
                avatar = await smmsUpload(buffer)
                cacheTgAvatar(uid, avatar)
                return avatar
            } catch (e) {
                console.error('sm.ms 上传失败', e)
            }
        }
        if (config.biliPic?.enabled) {
            try {
                avatar = await biliPicUpload(buffer)
                cacheTgAvatar(uid, avatar)
                return avatar
            } catch (e) {
                console.error('哔哩图床上传失败', e)
            }
        }
        if (config.cos?.enabled) {
            try {
                avatar = `${uid}-${new Date().getTime()}.jpg`
                await cosUploadFile(avatar, buffer)
                avatar = `${config.cos.url}/${avatar}`
                cacheTgAvatar(uid, avatar)
                return avatar
            } catch (e) {
                console.log('COS 上传失败', e)
            }
        }
        const uploadRet = await qq.preloadImages([buffer])
        if (uploadRet.data) {
            avatar = uploadRet.data[0].substr(0, 32)
            avatar = getImageUrlByMd5(avatar)
            cacheTgAvatar(uid, avatar)
        }
    }
    return avatar
}

const getCachedTgAvatar = (uid: number): string => {
    const res = cache.get(uid)
    if (res) {
        const now = new Date()
        if (now > res.exp) {
            cache.delete(uid)
            return null
        }
        else {
            return res.md5
        }
    }
    return null
}

const cacheTgAvatar = (uid: number, md5: string) => {
    cache.set(uid, {
        md5,
        //缓存一天过期
        exp: new Date(new Date().getTime() + 1000 * 60 * 60 * 24),
    })
}
