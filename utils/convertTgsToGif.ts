import {Readable} from 'stream'
import {file} from 'tmp-promise'
import pipeSaveStream from './pipeSaveStream'
import {spawn} from 'child_process'

export default (tgsStream: Readable) => new Promise<string>(async (resolve) => {
    const tmp = await file()
    await pipeSaveStream(tgsStream, tmp.path)
    spawn('tgs_to_gif', [tmp.path]).on('exit', () => {
        tmp.cleanup()
        resolve(tmp.path + '.gif')
    })
})
