import { createError } from 'h3'
import prisma from '../../../utils/prisma'
import { doorEventEmitter } from '../../../utils/doorEvents'

export default defineEventHandler(async (event) => {
  const rawId = event.context.params?.id ?? ''
  const id = Number.parseInt(rawId, 10)

  if (Number.isNaN(id)) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Invalid door id'
    })
  }

  const payload = {
    id,
    triggeredAt: new Date().toISOString()
  }

  doorEventEmitter.emit('door-pressed', payload)

  const config = useRuntimeConfig()
  const webhookUrl = config.discordWebhookUrl

  if (webhookUrl) {
    const door = await prisma.door.findUnique({ where: { id } })

    const doorName = door?.name ?? `ID ${id}`

    await $fetch(webhookUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: {
        embeds: [
          {
            title: '呼び出しがありました。',
            description: `${doorName}が押されました。`,
            timestamp: payload.triggeredAt
          }
        ]
      }
    }).catch((error) => {
      console.error('Failed to send Discord webhook', error)
    })
  }

  return { ok: true }
})
