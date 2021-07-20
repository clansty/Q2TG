const cache = new Map<number, { md5: string, exp: Date }>()

export const getCachedTgAvatarMd5 = (uid: number): string => {
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

export const cacheTgAvatar = (uid: number, md5: string) => {
    cache.set(uid, {
        md5,
        //缓存一天过期
        exp: new Date(new Date().getTime() + 1000 * 60 * 60 * 24),
    })
}
