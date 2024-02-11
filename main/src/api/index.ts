import { getLogger } from 'log4js';
import Fastify from 'fastify';
import FastifyProxy from '@fastify/http-proxy';
import env from '../models/env';
import richHeader from './richHeader';

const log = getLogger('Web Api');
const fastify = Fastify();

fastify.get('/', async (request, reply) => {
  return { hello: 'Q2TG' };
});

fastify.register(richHeader, { prefix: '/richHeader' });

if (env.UI_PROXY) {
  fastify.register(FastifyProxy, {
    upstream: env.UI_PROXY,
    prefix: '/ui',
    rewritePrefix: '/ui',
    websocket: true,
  });
}

export default {
  async startListening() {
    await fastify.listen({ port: env.LISTEN_PORT, host: '0.0.0.0' });
    log.info('Listening on', env.LISTEN_PORT);
  },
};
