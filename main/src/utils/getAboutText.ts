import { Friend, Group } from '@icqqjs/icqq';

export default async function getAboutText(entity: Friend | Group, html: boolean) {
  let text: string;
  if (entity instanceof Friend) {
    text = `<b>备注：</b>${entity.remark}\n` +
      `<b>昵称：</b>${entity.nickname}\n` +
      `<b>账号：</b>${entity.user_id}`;
  }
  else {
    const owner = entity.pickMember(entity.info.owner_id);
    await owner.renew();
    const self = entity.pickMember(entity.client.uin);
    await self.renew();
    text = `<b>群名称：</b>${entity.name}\n` +
      `<b>${entity.info.member_count} 名成员</b>\n` +
      `<b>群号：</b><code>${entity.group_id}</code>\n` +
      (self ? `<b>我的群名片：</b>${self.title ? `「<i>${self.title}</i>」` : ''}${self.card}\n` : '') +
      (owner ? `<b>群主：</b>${owner.title ? `「<i>${owner.title}</i>」` : ''}` +
        `${owner.card || owner.info.nickname} (<code>${owner.user_id}</code>)` : '') +
      ((entity.is_admin || entity.is_owner) ? '\n<b>可管理</b>' : '');
  }

  if (!html) {
    text = text.replace(/<\/?\w+>/g, '');
  }
  return text;
}
