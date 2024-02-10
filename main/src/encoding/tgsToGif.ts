import { spawn } from 'child_process';
import env from '../models/env';

export default function tgsToGif(tgsPath: string) {
  return new Promise(resolve => {
    spawn(env.TGS_TO_GIF, [tgsPath]).on('exit', () => {
      resolve(tgsPath + '.gif');
    });
  });
}
