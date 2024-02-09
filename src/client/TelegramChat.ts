import { BigInteger } from 'big-integer';
import { Api, TelegramClient, utils } from 'telegram';
import { ButtonLike, Entity, EntityLike, MessageIDLike } from 'telegram/define';
import WaitForMessageHelper from '../helpers/WaitForMessageHelper';
import { EditMessageParams, SendMessageParams } from 'telegram/client/messages';
import { CustomFile } from 'telegram/client/uploads';
import Telegram from './Telegram';
import createPaginatedInlineSelector from '../utils/paginatedInlineSelector';
import inlineDigitInput from '../utils/inlineDigitInput';
import { TelegramImportSession } from './TelegramImportSession';

export default class TelegramChat {
  public readonly inputPeer: Api.TypeInputPeer;
  public readonly id: BigInteger;

  constructor(public readonly parent: Telegram,
              private readonly client: TelegramClient,
              // Api.Chat 是上限 200 人的普通群组
              // 超级群组和频道都是 Api.Channel
              // 有 Channel.broadcast 和 Channel.megagroup 标识
              public readonly entity: Entity,
              private readonly waitForInputHelper: WaitForMessageHelper) {
    this.inputPeer = utils.getInputPeer(entity);
    this.id = entity.id;
  }

  public async sendMessage(params: SendMessageParams | string) {
    if (typeof params === 'string') {
      params = { message: params };
    }
    return await this.client.sendMessage(this.entity, params);
  }

  public async getMessage(params: Parameters<typeof this.client.getMessages>[1]) {
    const messages = await this.client.getMessages(this.entity, params);
    return messages[0];
  }

  public async sendSelfDestructingPhoto(params: SendMessageParams, photo: CustomFile, ttlSeconds: number) {
    // @ts-ignore 定义不好好写的？你家 `FileLike` 明明可以是 `TypeInputMedia`
    params.file = new Api.InputMediaUploadedPhoto({
      file: await this.client.uploadFile({
        file: photo,
        workers: 1,
      }),
      ttlSeconds,
    });
    return await this.client.sendMessage(this.entity, params);
  }

  public async waitForInput() {
    return this.waitForInputHelper.waitForMessage(this.entity.id);
  }

  public cancelWait() {
    this.waitForInputHelper.cancel(this.entity.id);
  }

  public createPaginatedInlineSelector(message: string, choices: ButtonLike[][]) {
    return createPaginatedInlineSelector(this, message, choices);
  }

  public inlineDigitInput(length: number) {
    return inlineDigitInput(this, length);
  }

  public async setProfilePhoto(photo: Buffer) {
    if (!(this.entity instanceof Api.Chat || this.entity instanceof Api.Channel))
      throw new Error('不是群组，无法设置头像');
    if (this.entity instanceof Api.Chat) {
      return await this.client.invoke(
        new Api.messages.EditChatPhoto({
          chatId: this.id,
          photo: new Api.InputChatUploadedPhoto({
            file: await this.client.uploadFile({
              file: new CustomFile('photo.jpg', photo.length, '', photo),
              workers: 1,
            }),
          }),
        }),
      );
    }
    else {
      return await this.client.invoke(
        new Api.channels.EditPhoto({
          channel: this.entity,
          photo: new Api.InputChatUploadedPhoto({
            file: await this.client.uploadFile({
              file: new CustomFile('photo.jpg', photo.length, '', photo),
              workers: 1,
            }),
          }),
        }),
      );
    }
  }

  public async setAdmin(user: EntityLike) {
    if (!(this.entity instanceof Api.Chat || this.entity instanceof Api.Channel))
      throw new Error('不是群组，无法设置管理员');
    if (this.entity instanceof Api.Chat) {
      return await this.client.invoke(
        new Api.messages.EditChatAdmin({
          chatId: this.id,
          userId: user,
          isAdmin: true,
        }),
      );
    }
    else {
      return await this.client.invoke(
        new Api.channels.EditAdmin({
          channel: this.entity,
          userId: user,
          adminRights: new Api.ChatAdminRights({
            changeInfo: true,
            postMessages: true,
            editMessages: true,
            deleteMessages: true,
            banUsers: true,
            inviteUsers: true,
            pinMessages: true,
            addAdmins: true,
            anonymous: true,
            manageCall: true,
            other: true,
          }),
          rank: '转发姬',
        }),
      );
    }
  }

  public async editAbout(about: string) {
    if (!(this.entity instanceof Api.Chat || this.entity instanceof Api.Channel))
      throw new Error('不是群组，无法设置描述');
    return await this.client.invoke(
      new Api.messages.EditChatAbout({
        peer: this.entity,
        about,
      }),
    );
  }

  public async getInviteLink() {
    if (!(this.entity instanceof Api.Chat || this.entity instanceof Api.Channel))
      throw new Error('不是群组，无法邀请');
    const links = await this.client.invoke(
      new Api.messages.GetExportedChatInvites({
        peer: this.entity,
        adminId: this.parent.me,
        limit: 1,
        revoked: false,
      }),
    );
    return links.invites[0];
  }

  public async hidePeerSettingsBar() {
    return await this.client.invoke(
      new Api.messages.HidePeerSettingsBar({
        peer: this.entity,
      }),
    );
  }

  public async setNotificationSettings(params: ConstructorParameters<typeof Api.InputPeerNotifySettings>[0]) {
    return await this.client.invoke(
      new Api.account.UpdateNotifySettings({
        peer: new Api.InputNotifyPeer({ peer: this.inputPeer }),
        settings: new Api.InputPeerNotifySettings(params),
      }),
    );
  }

  public async getMember(user: EntityLike) {
    if (!(this.entity instanceof Api.Channel))
      throw new Error('不是超级群，无法获取成员信息');
    return await this.client.invoke(
      new Api.channels.GetParticipant({
        channel: this.entity,
        participant: user,
      }),
    );
  }

  public async deleteMessages(messageId: MessageIDLike | MessageIDLike[]) {
    if (!Array.isArray(messageId)) {
      messageId = [messageId];
    }
    return await this.client.deleteMessages(this.entity, messageId, { revoke: true });
  }

  public async editMessages(params: EditMessageParams) {
    return await this.client.editMessage(this.entity, params);
  }

  public async inviteMember(member: EntityLike | EntityLike[]) {
    if (!Array.isArray(member)) {
      member = [member];
    }
    return await this.client.invoke(
      new Api.channels.InviteToChannel({
        channel: this.entity,
        users: member,
      }),
    );
  }

  public async migrate() {
    return await this.client.invoke(
      new Api.messages.MigrateChat({
        chatId: this.id,
      }),
    );
  }

  public async startImportSession(textFile: CustomFile, mediaCount: number) {
    await this.client.invoke(
      new Api.messages.CheckHistoryImportPeer({
        peer: this.entity,
      }),
    );
    const init = await this.client.invoke(
      new Api.messages.InitHistoryImport({
        peer: this.entity,
        file: await this.client.uploadFile({
          file: textFile,
          workers: 1,
        }),
        mediaCount,
      }),
    );
    return new TelegramImportSession(this, this.client, init.id);
  }
}
