import {Readable} from 'stream'
import ffmpeg from 'fluent-ffmpeg'
import {file} from 'tmp-promise'
import silk from 'silk-sdk'

export default async (ogg: Readable): Promise<Buffer> => {
    const {path, cleanup} = await file()
    await conventOggToPcm(ogg, path)
    const bufSilk = silk.encode(path, {
        tencent: true,
    })
    cleanup()
    return bufSilk
}

const conventOggToPcm = (ogg: Readable, tmpFilePath: string): Promise<void> => {
    return new Promise(resolve => {
        ffmpeg(ogg)
            .outputFormat('s16le')
            .outputOptions([
                '-ar', '24000',
                '-ac', '1',
                '-acodec', 'pcm_s16le',
            ])
            .on('end', async () => {
                resolve()
            }).save(tmpFilePath)
    })
}
