import { Api } from 'telegram';

export default (source: Api.MessageReplyHeader | null) => {
  if (!source) return undefined;
  if (!source.forumTopic) return undefined;
  return source.replyToTopId || source.replyToMsgId;
}
