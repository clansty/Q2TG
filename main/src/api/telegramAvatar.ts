import { FastifyPluginCallback } from 'fastify';
import Instance from '../models/Instance';
import convert from '../helpers/convert';
import Telegram from '../client/Telegram';
import { Api } from 'telegram';
import BigInteger from 'big-integer';
import { getLogger } from 'log4js';
import fs from 'fs';

const log = getLogger('telegramAvatar');

const userAvatarFileIdCache = new Map<string, BigInteger.BigInteger>();

const getUserAvatarFileId = async (tgBot: Telegram, userId: string) => {
  let cached = userAvatarFileIdCache.get(userId);
  if (cached) return cached;

  const user = await tgBot.getChat(userId);
  if ('photo' in user.entity && user.entity.photo instanceof Api.UserProfilePhoto) {
    cached = user.entity.photo.photoId;
  }
  else {
    cached = BigInteger.zero;
  }
  userAvatarFileIdCache.set(userId, cached);
  return cached;
};

const getUserAvatarPath = async (tgBot: Telegram, userId: string) => {
  const fileId = await getUserAvatarFileId(tgBot, userId);
  if (fileId.eq(0)) return '';
  return await convert.cachedBuffer(fileId.toString(16) + '.jpg', () => tgBot.downloadEntityPhoto(userId));
};

export default ((fastify, opts, done) => {
  fastify.get<{
    Params: { instanceId: string, userId: string }
  }>('/:instanceId/:userId', async (request, reply) => {
    log.debug('请求头像', request.params.userId);
    const instance = Instance.instances.find(it => it.id.toString() === request.params.instanceId);
    const avatar = await getUserAvatarPath(instance.tgBot, request.params.userId);

    if (!avatar) {
      reply.code(404);
      return;
    }
    reply.type('image/jpeg');
    return fs.createReadStream(avatar);
  });

  done();
}) as FastifyPluginCallback;
