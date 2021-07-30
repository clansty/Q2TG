import {Readable} from 'stream'
import fs from 'fs'

export default (stream: Readable, dest: string): Promise<void> => {
    return new Promise(resolve => {
        const file = fs.createWriteStream(dest)
        file.on('finish', () => {
            file.close()
            resolve()
        })
        stream.pipe(file, {end: true})
    })
}
