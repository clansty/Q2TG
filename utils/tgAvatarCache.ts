import {qq, tg} from '../index'

const cache = new Map<number, { md5: string, exp: Date }>()

export const getAvatarMd5 = async (uid: number) => {
    let avatarMd5 = getCachedTgAvatarMd5(uid)
    if (!avatarMd5) {
        try {
            const photos = await tg.getUserProfilePhotos(uid, {limit: 1})
            const photo = photos.photos[0]
            const fid = photo[photo.length - 1].file_id
            const url = await tg.getFileLink(fid)
            const uploadRet = await qq.preloadImages([url])
            if (uploadRet.data) {
                avatarMd5 = uploadRet.data[0].substr(0, 32)
                cacheTgAvatar(uid, avatarMd5)
            }
        } catch (e) {
            console.log(e)
        }
    }
    return avatarMd5
}

const getCachedTgAvatarMd5 = (uid: number): string => {
    const res = cache.get(uid)
    if (res) {
        const now = new Date()
        if (now > res.exp) {
            cache.delete(uid)
            return null
        } else {
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
