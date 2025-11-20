import { createError, setResponseHeader, setResponseStatus } from 'h3'
import { deleteDoorById, getDoorIdParam, getDoorOrThrow } from '../../utils/doors'

export default defineEventHandler(async (event) => {
  const method = event.node.req.method?.toUpperCase()
  const id = getDoorIdParam(event)

  if (id === 0) {
    return { id: 0, name: 'ダッシュボード' }
  }

  switch (method) {
    case 'GET':
      return getDoorOrThrow(id)
  case 'DELETE':
      await deleteDoorById(id)
    setResponseStatus(event, 204)
    return null
  default:
      setResponseHeader(event, 'Allow', 'GET, DELETE')
    throw createError({
        statusCode: 405,
        statusMessage: 'Method Not Allowed'
      })
  }
})
