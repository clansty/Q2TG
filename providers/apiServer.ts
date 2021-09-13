import express from 'express'
import bodyParser from 'body-parser'
import config from './config'
import {DeleteMessagesReq} from '../types/DeleteMessagesReq'
import handleTgMsgDelete from '../handlers/handleTgMsgDelete'

const jsonParser = bodyParser.json({
    type: () => true,
})

let app

export const init = () => new Promise(resolve => {
    if (app) return
    app = express()

    app.post(config.api.deleteNotifier, jsonParser, (req, res) => {
        const body = req.body as DeleteMessagesReq
        for (const deleteMessage of body.delete_messages) {
            handleTgMsgDelete(deleteMessage, body.id, true)
        }
        res.statusCode = 204
        res.end()
    })

    app.listen(8080, resolve)
})
