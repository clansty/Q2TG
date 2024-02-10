import Instance from '../models/Instance';
import Telegram from '../client/Telegram';
import OicqClient from '../client/OicqClient';

export default class {
  constructor(private readonly instance: Instance,
              private readonly tgBot: Telegram,
              private readonly tgUser: Telegram,
              private readonly qqBot: OicqClient) {
    setInterval(() => this.report(), 1000 * 60);
    this.report();
  }

  private async report() {
    if (!this.instance.reportUrl) return;
    let offline = [] as string[];
    if (!this.tgBot?.isOnline) {
      offline.push('tgBot');
    }
    if (!this.tgUser?.isOnline) {
      offline.push('tgUser');
    }
    if (!this.qqBot?.isOnline()) {
      offline.push('qqBot');
    }
    const online = !offline.length;
    const url = new URL(this.instance.reportUrl);
    url.searchParams.set('status', online ? 'up' : 'down');
    url.searchParams.set('msg', online ? 'OK' : offline.join(','));
    const res = await fetch(url);
  }
}
