export function getAvatarUrl(roomId: number, large = false): string {
  if (!roomId) return '';
  return roomId < 0 ?
    `https://p.qlogo.cn/gh/${-roomId}/${-roomId}/0` :
    `https://q1.qlogo.cn/g?b=qq&nk=${roomId}&s=${large ? 0 : 140}`;
}

export function getImageUrlByMd5(md5: string) {
  return 'https://gchat.qpic.cn/gchatpic_new/0/0-0-' + md5.toUpperCase() + '/0';
}

export function getBigFaceUrl(file: string) {
  return `https://gxh.vip.qq.com/club/item/parcel/item/${file.substring(
    0,
    2,
  )}/${file.substring(0, 32)}/300x300.png`;
}
