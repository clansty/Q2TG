import axios from 'axios'
import FormData from 'form-data'
import config from '../../providers/config'

export default async (file: Buffer) => {
    const form = new FormData()
    form.append('file_up', file, {
        contentType: 'image/jpeg',
        filename: `${new Date().getTime()}.jpg`,
    })
    form.append('category', 'daily')
    form.append('biz', 'draw')
    const data = await axios.post('https://api.vc.bilibili.com/api/v1/drawImage/upload', form.getBuffer(), {
        headers: form.getHeaders({
            Cookie: `SESSDATA=${config.biliPic.sessData}`,
        }),
    })
    const response = data.data
    console.log(response)
    if (response.message !== 'success') {
        throw new Error(response.message)
    }
    return response.data.image_url.replace('http://', 'https://')
}
