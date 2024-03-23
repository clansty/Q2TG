import { getLogger } from 'log4js';
import Fastify from 'fastify';
import FastifyProxy from '@fastify/http-proxy';
import FastifyStatic from '@fastify/static';
import env from '../models/env';
import richHeader from './richHeader';
import telegramAvatar from './telegramAvatar';

const log = getLogger('Web Api');
const fastify = Fastify();

fastify.get('/', async (request, reply) => {
  return { hello: 'Q2TG' };
});

fastify.register(richHeader, { prefix: '/richHeader' });
fastify.register(telegramAvatar, { prefix: '/telegramAvatar' });

if (env.UI_PROXY) {
  fastify.register(FastifyProxy, {
    upstream: env.UI_PROXY,
    prefix: '/ui',
    rewritePrefix: '/ui',
    websocket: true,
  });
}
else if (env.UI_PATH) {
  fastify.register(FastifyStatic, {
    root: env.UI_PATH,
    prefix: '/ui',
  });
}

export default {
  async startListening() {
    await fastify.listen({ port: env.LISTEN_PORT, host: '0.0.0.0' });
    log.info('Listening on', env.LISTEN_PORT);
  },
};
