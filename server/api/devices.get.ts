import prisma from '../utils/prisma'

export default defineEventHandler(async () => {
  return prisma.door.findMany()
})
