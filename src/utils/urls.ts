import axios from 'axios';
import { Friend, Group } from 'icqq';

export function getAvatarUrl(room: number | bigint | Friend | Group): string {
  if (!room) return '';
  if (room instanceof Friend) {
    room = room.user_id;
  }
  if (room instanceof Group) {
    room = -room.group_id;
  }
  return room < 0 ?
    `https://p.qlogo.cn/gh/${-room}/${-room}/0` :
    `https://q1.qlogo.cn/g?b=qq&nk=${room}&s=0`;
}

export function getImageUrlByMd5(md5: string) {
  return 'https://gchat.qpic.cn/gchatpic_new/0/0-0-' + md5.toUpperCase() + '/0';
}

export function getBigFaceUrl(file: string) {
  return `https://gxh.vip.qq.com/club/item/parcel/item/${file.substring(0, 2)}/${file.substring(0, 32)}/300x300.png`;
}

export async function fetchFile(url: string): Promise<Buffer> {
  const res = await axios.get(url, {
    responseType: 'arraybuffer',
  });
  return res.data;
}

export function getAvatar(room: number | Friend | Group) {
  return fetchFile(getAvatarUrl(room));
}
