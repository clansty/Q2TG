import fs from 'fs'
import YAML from 'yaml'

type ForwardInfo = {
    qq: number,
    tg: number
}

interface Config {
    tgToken: string
    qqUin: number
    qqPasswd: string
    mongoDb: {
        connStr: string
        dbName: string
    }
    groups: Array<ForwardInfo>
}

export default YAML.parse(fs.readFileSync('config.yaml', 'utf8')) as Config
