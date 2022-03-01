import { BigInteger } from 'big-integer';
import { Api, TelegramClient, utils } from 'telegram';
import { ButtonLike, Entity, EntityLike } from 'telegram/define';
import WaitForMessageHelper from '../helpers/WaitForMessageHelper';
import { SendMessageParams } from 'telegram/client/messages';
import { CustomFile } from 'telegram/client/uploads';
import Telegram from './Telegram';
import createPaginatedInlineSelector from '../utils/paginatedInlineSelector';
import inlineDigitInput from '../utils/inlineDigitInput';

export default class TelegramChat {
  public readonly inputPeer: Api.TypeInputPeer;
  public readonly id: BigInteger;

  constructor(public readonly parent: Telegram,
              private readonly client: TelegramClient,
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
    if (!(this.entity instanceof Api.Chat))
      throw new Error('不是群组，无法设置头像');
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

  public async editAdmin(user: EntityLike, isAdmin: boolean) {
    if (!(this.entity instanceof Api.Chat))
      throw new Error('不是群组，无法设置管理员');
    return await this.client.invoke(
      new Api.messages.EditChatAdmin({
        chatId: this.id,
        userId: user,
        isAdmin,
      }),
    );
  }

  public async editAbout(about: string) {
    if (!(this.entity instanceof Api.Chat))
      throw new Error('不是群组，无法设置描述');
    return await this.client.invoke(
      new Api.messages.EditChatAbout({
        peer: this.entity,
        about,
      }),
    );
  }

  public async getInviteLink() {
    if (!(this.entity instanceof Api.Chat))
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

  public async setNotificationSettings(params: { showPreviews?: boolean, silent?: boolean, muteUntil?: number, sound?: string }) {
    return await this.client.invoke(
      new Api.account.UpdateNotifySettings({
        peer: new Api.InputNotifyPeer({ peer: this.inputPeer }),
        settings: new Api.InputPeerNotifySettings(params),
      }),
    );
  }
}
