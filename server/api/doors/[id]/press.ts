import { createError, setResponseHeader } from 'h3'
import { getDoorIdParam, getDoorOrThrow } from '../../../utils/doors'
import { doorEventEmitter } from '../../../utils/doorEvents'
import { record } from 'valibot'

export default defineEventHandler(async (event) => {
  const method = event.node.req.method?.toUpperCase()

  if (method !== 'POST') {
    setResponseHeader(event, 'Allow', 'POST')
    throw createError({
      statusCode: 405,
      statusMessage: 'Method Not Allowed'
    })
  }

  const id = getDoorIdParam(event)
  const door = await getDoorOrThrow(id)
  const triggeredAt = new Date().toISOString()
  const body = await readBody<{ source?: 'door' | 'dash' | 'record', customName?: string, idFrom?: number }>(event)
  const source = body?.source ?? 'door'


  const payload = {
    id,
    idFrom: body.idFrom,
    triggeredAt,
    name: door.name,
    nameFrom: body.customName,
    type: source
  }

  doorEventEmitter.emit(`${source}-pressed`, payload)

  const config = useRuntimeConfig()
  const webhookUrl = config.discordWebhookUrl

  if (webhookUrl && source === 'door') {
    await $fetch(webhookUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: {
        embeds: [
          {
            title: '呼び出しがありました。',
            description: `${door.name}が押されました。`,
            timestamp: triggeredAt
          }
        ]
      }
    }).catch((error) => {
      console.error('Failed to send Discord webhook', error)
    })
  }

  return { ok: true }
})
