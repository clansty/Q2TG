import { FastifyPluginCallback } from 'fastify';
import { Pair } from '../models/Pair';
import ejs from 'ejs';
import fs from 'fs';
import { Group } from 'icqq';

const template = ejs.compile(fs.readFileSync('./assets/richHeader.ejs', 'utf-8'));

export default ((fastify, opts, done) => {
  fastify.get<{
    Params: { apiKey: string, userId: string }
  }>('/:apiKey/:userId', async (request, reply) => {
    const pair = Pair.getByApiKey(request.params.apiKey);
    if (!pair) {
      reply.code(404);
      return 'Group not found';
    }
    const group = pair.qq as Group;
    const members = await group.getMemberMap();
    const member = members.get(Number(request.params.userId));
    if (!member) {
      reply.code(404);
      return 'Member not found';
    }

    reply.type('text/html');
    return template({
      userId: request.params.userId,
      title: member.title,
      name: member.card || member.nickname,
      role: member.role,
    });
  });

  done();
}) as FastifyPluginCallback;
