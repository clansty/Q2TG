import { Pair } from '../models/Pair';
import { Api } from 'telegram';

const map = new Map<string, Api.channels.ChannelParticipant>();

export default {
  get(pair: Pair, member: number) {
    return map.get(`${pair.dbId}_${member}`);
  },
  async getEx(pair: Pair, member: number, getter: () => Promise<Api.channels.ChannelParticipant>) {
    const cached = map.get(`${pair.dbId}_${member}`);
    if (cached) return cached;
    const role = await getter();
    map.set(`${pair.dbId}_${member}`, role);
    setTimeout(() => map.delete(`${pair.dbId}_${member}`), 1000 * 60 * 60);
    return role;
  },
  set(pair: Pair, member: number, role: Api.channels.ChannelParticipant) {
    map.set(`${pair.dbId}_${member}`, role);
    setTimeout(() => map.delete(`${pair.dbId}_${member}`), 1000 * 60 * 60);
  },
  delete(pair: Pair, member: number) {
    map.delete(`${pair.dbId}_${member}`);
  },
};
