import { createError } from 'h3'
import prisma from '../../utils/prisma'

export default defineEventHandler(async (event) => {
  const rawId = event.context.params?.id ?? ''
  const id = Number.parseInt(rawId, 10)

  if (Number.isNaN(id)) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Invalid door id',
    })
  }

  const door = await prisma.door.findUnique({ where: { id } })

  if (!door) {
    throw createError({
      statusCode: 404,
      statusMessage: 'Door not found',
    })
  }

  return door
})
