import axios from 'axios'
import FormData from 'form-data'
import config from '../../providers/config'

export default async (file: Buffer) => {
    const form = new FormData()
    form.append('smfile', file, {
        contentType: 'image/jpeg',
        filename: `${new Date().getTime()}.jpg`,
    })
    const data = await axios.post('https://sm.ms/api/v2/upload', form.getBuffer(), {
        headers: form.getHeaders({
            Authorization: config.smms.token
        }),
    })
    const response = data.data
    console.log(response)
    if (!response.success) {
        if(response.code === 'image_repeated') {
            return response.images
        }
        throw new Error(response.message)
    }
    return response.data.url
}
