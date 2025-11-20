import { createError, setResponseHeader } from 'h3'
import { getDoorIdParam, getDoorOrThrow } from '../../../utils/doors'
import { doorEventEmitter } from '../../../utils/doorEvents'

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

  return { ok: true }
});
