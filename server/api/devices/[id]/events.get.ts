import { createError, createEventStream } from 'h3'
import { doorEventEmitter } from '../../../utils/doorEvents'

export default defineEventHandler((event) => {
  const rawId = event.context.params?.id ?? ''
  const id = Number.parseInt(rawId, 10)

  if (Number.isNaN(id)) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Invalid door id'
    })
  }

  const stream = createEventStream(event)
  const listener = (payload: { id: number; triggeredAt: string; name?: string }) => {
    if (payload.id !== id) return
    stream.push(JSON.stringify(payload))
  }

  doorEventEmitter.on('door-pressed', listener)

  event.node.res.on('close', () => {
    doorEventEmitter.off('door-pressed', listener)
    stream.close()
  })

  return stream.send()
})
