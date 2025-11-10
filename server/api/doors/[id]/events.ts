import { createError, createEventStream, setResponseHeader } from 'h3'
import { getDoorIdParam } from '../../../utils/doors'
import { doorEventEmitter } from '../../../utils/doorEvents'

interface DoorEventPayload {
  id: number
  triggeredAt: string
  name?: string
  type: 'door' | 'dash'
}

export default defineEventHandler((event) => {
  const method = event.node.req.method?.toUpperCase()

  if (method !== 'GET') {
    setResponseHeader(event, 'Allow', 'GET')
    throw createError({
      statusCode: 405,
      statusMessage: 'Method Not Allowed'
    })
  }

  const id = getDoorIdParam(event)
  const stream = createEventStream(event)

  const pushIfMatch = (payload: DoorEventPayload) => {
    if (payload.id !== id) return
    stream.push(JSON.stringify(payload))
  }

  const pressedListener = (payload: DoorEventPayload) => pushIfMatch(payload)
  const openedListener = (payload: DoorEventPayload) => pushIfMatch(payload)

  doorEventEmitter.on('door-pressed', pressedListener)
  doorEventEmitter.on('dash-pressed', openedListener)
  event.node.res.on('close', () => {
    doorEventEmitter.off('door-pressed', pressedListener)
    doorEventEmitter.off('dash-pressed', openedListener)
    stream.close()
  })

  return stream.send()
})
