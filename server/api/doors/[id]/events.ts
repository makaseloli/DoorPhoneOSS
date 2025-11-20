import { createError, createEventStream, setResponseHeader } from 'h3'
import { getDoorIdParam } from '../../../utils/doors'
import { doorEventEmitter } from '../../../utils/doorEvents'

export interface DoorEventPayload {
  id: number
  idFrom: number
  triggeredAt: string
  name: string
  nameFrom: string
  type: 'door' | 'dash' | 'record' | 'ping'
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
  };

  const pressedListener = (payload: DoorEventPayload) => pushIfMatch(payload)
  const openedListener = (payload: DoorEventPayload) => pushIfMatch(payload)
  const recordListener = (payload: DoorEventPayload) => pushIfMatch(payload)

  doorEventEmitter.on('door-pressed', pressedListener)
  doorEventEmitter.on('dash-pressed', openedListener)
  doorEventEmitter.on('record-pressed', recordListener)

  const KEEPALIVE_MS = Number(process.env.SSE_KEEPALIVE_MS ?? 20000)
  const keepaliveTimer = setInterval(() => {
    try {
      stream.push(JSON.stringify({ type: 'ping', ts: new Date().toISOString() }))
    } catch (error) {
      console.warn('Failed to send SSE keepalive for door', id, error)
    }
  }, KEEPALIVE_MS)
  event.node.res.on('close', () => {
    doorEventEmitter.off('door-pressed', pressedListener)
    doorEventEmitter.off('dash-pressed', openedListener)
    doorEventEmitter.off('record-pressed', recordListener)
    clearInterval(keepaliveTimer)
    stream.close()
  });

  return stream.send()
});
