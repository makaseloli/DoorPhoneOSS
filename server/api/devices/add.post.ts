import { createError } from 'h3'
import prisma from '../../utils/prisma'

export default defineEventHandler(async (event) => {
  const body = await readBody<{ name?: string }>(event)
  const name = body?.name?.trim()

  if (!name) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Door name is required'
    })
  }

  return prisma.door.create({
    data: { name }
  })
})
