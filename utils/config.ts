import fs from 'fs'
import YAML from 'yaml'

export type ForwardInfo = {
    qq: number,
    tg: number
}

interface Config {
    tgToken: string
    qqUin: number
    qqPasswd: string
    protocol: 1 | 2 | 3 | 4 | 5
    mongoDb: {
        connStr: string
        dbName: string
    }
    groups: Array<ForwardInfo>
}

export default <Config>YAML.parse(fs.existsSync('config.yaml') ?
    fs.readFileSync('config.yaml', 'utf8') : process.env.Q2TG_CONFIG)
