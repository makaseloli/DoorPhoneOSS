import { Prisma } from '@prisma/client'
import type { H3Event } from 'h3'
import { createError } from 'h3'
import prisma from './prisma'

const parseDoorId = (rawId: string | undefined) => {
  const id = Number.parseInt((rawId ?? '').trim(), 10)

  if (!Number.isInteger(id) || id < 0) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Invalid door id'
    })
  }

  return id
}

export const getDoorIdParam = (event: H3Event, paramKey = 'id') => {
  return parseDoorId(event.context.params?.[paramKey])
}

export const assertDoorName = (input: string | null | undefined) => {
  const value = (input ?? '').trim()

  if (!value) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Door name is required'
    })
  }

  return value
}

export const listDoors = () => {
  return prisma.door.findMany({ orderBy: { id: 'asc' } })
}

export const createDoor = (name: string) => {
  return prisma.door.create({ data: { name } })
}

export const getDoorOrThrow = async (id: number) => {
  if (id == 0) {
    return 'ダッシュボード'
  }

  const door = await prisma.door.findUnique({ where: { id } })

  if (!door) {
    throw createError({
      statusCode: 404,
      statusMessage: 'Door not found'
    })
  }

  return door
}

export const deleteDoorById = async (id: number) => {
  try {
    await prisma.door.delete({ where: { id } })
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2025') {
      throw createError({
        statusCode: 404,
        statusMessage: 'Door not found'
      })
    }

    throw error
  }
}
