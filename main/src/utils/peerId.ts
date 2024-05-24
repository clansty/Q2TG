import { Api } from 'telegram';

export const peerToId = (peer: Api.TypePeer) => {
  switch (peer.className) {
    case 'PeerUser':
      return peer.userId;
    case 'PeerChat':
      return peer.chatId;
    case 'PeerChannel':
      return peer.channelId;
  }
};
