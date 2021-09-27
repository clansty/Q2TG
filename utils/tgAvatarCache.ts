import {qq, tg} from '../index'
import {streamToBuffer} from './streamToBuffer'
import config from '../providers/config'
import cosUploadFile from './cosUploadFile'

const cache = new Map<number, { md5: string, exp: Date }>()

//当配置对象存储时返回 URL，否则返回预载图片的 MD5
export const getAvatarMd5OrUrl = async (uid: number) => {
    let avatar = getCachedTgAvatar(uid)
    if (!avatar) {
        try {
            const photos = await tg.getUserProfilePhotos(uid, {limit: 1})
            const photo = photos.photos[0]
            const fid = photo[photo.length - 1].file_id
            const stream = await tg.getFileStream(fid)
            if (config.cos?.enabled) {
                avatar = `${uid}-${new Date().getTime()}.jpg`
                cosUploadFile(avatar, stream)
                //可以不需要等待
                avatar=`${config.cos.url}/${avatar}`
                cacheTgAvatar(uid, avatar)
            }
            else {
                const buf = await streamToBuffer(stream)
                const uploadRet = await qq.preloadImages([buf])
                if (uploadRet.data) {
                    avatar = uploadRet.data[0].substr(0, 32)
                    cacheTgAvatar(uid, avatar)
                }
            }
        } catch (e) {
            console.log(e)
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
