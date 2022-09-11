import { spawn } from 'child_process';

export default function tgsToGif(tgsPath: string) {
  return new Promise(resolve => {
    spawn(process.env.TGS_TO_GIF || 'tgs_to_gif', [tgsPath]).on('exit', () => {
      resolve(tgsPath + '.gif');
    });
  });
}
