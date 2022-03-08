import TelegramChat from './TelegramChat';
import { BigInteger } from 'big-integer';
import { Api, TelegramClient } from 'telegram';
import { CustomFile } from 'telegram/client/uploads';

export class TelegramImportSession {
  constructor(public readonly chat: TelegramChat,
              private readonly client: TelegramClient,
              private readonly importId: BigInteger) {
  }

  public async uploadMedia(fileName: string, media: Api.TypeInputMedia) {
    return await this.client.invoke(
      new Api.messages.UploadImportedMedia({
        peer: this.chat.entity,
        importId: this.importId,
        fileName,
        media,
      }),
    );
  }

  public async finish() {
    return await this.client.invoke(
      new Api.messages.StartHistoryImport({
        peer: this.chat.id,
        importId: this.importId,
      }),
    );
  }

  public async uploadFile(file: CustomFile) {
    return await this.client.uploadFile({ file, workers: 2 });
  }
}
