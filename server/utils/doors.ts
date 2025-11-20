import { Prisma } from '@prisma/client';
import type { Door } from '@prisma/client';
import type { H3Event } from 'h3';
import { createError } from 'h3';
import prisma from './prisma';

const parseDoorId = (rawId: string | undefined) => {
  const id = Number.parseInt((rawId ?? '').trim(), 10);

  if (!Number.isInteger(id) || id < 0) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Invalid door id'
    });
  }

  return id;
};

export const getDoorIdParam = (event: H3Event, paramKey = 'id') => {
  return parseDoorId(event.context.params?.[paramKey]);
};

export const assertDoorName = (input: string | null | undefined) => {
  const value = (input ?? '').trim();

  if (!value) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Door name is required'
    });
  }

  return value;
};

export const assertDoorWebhookUrl = (input: string | null | undefined) => {
  const value = (input ?? '').trim();

  if (!value) return null;

  try {
    const url = new URL(value);
    const hostname = url.hostname.toLowerCase();
    if (!hostname.includes('discordapp.com') && !hostname.includes('discord.com')) {
      throw new Error('Unsupported host');
    }
    return url.toString();
  } catch {
    throw createError({
      statusCode: 400,
      statusMessage: 'Invalid Discord webhook URL'
    });
  }
};

export const listDoors = () => {
  return prisma.door.findMany({ orderBy: { id: 'asc' } });
};

export const createDoor = (name: string, webhookUrl?: string | null) => {
  return prisma.door.create({ data: { name, webhookUrl: webhookUrl ?? null } });
};

const getDashboardDoor = (): Door => {
  const webhookUrl = process.env.DASHBOARD_WEBHOOK_URL?.trim() ?? null;
  return {
    id: 0,
    name: 'ダッシュボード',
    webhookUrl
  };
};

export const getDoorOrThrow = async (id: number): Promise<Door> => {
  if (id === 0) {
    return getDashboardDoor();
  }

  const door = await prisma.door.findUnique({ where: { id } });

  if (!door) {
    throw createError({
      statusCode: 404,
      statusMessage: 'Door not found'
    });
  }

  return door;
};

export const updateDoorById = async (id: number, data: Prisma.DoorUpdateInput) => {
  try {
    return await prisma.door.update({
      where: { id },
      data
    });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2025') {
      throw createError({
        statusCode: 404,
        statusMessage: 'Door not found'
      });
    }
    throw error;
  }
};

export const deleteDoorById = async (id: number) => {
  try {
    await prisma.door.delete({ where: { id } });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2025') {
      throw createError({
        statusCode: 404,
        statusMessage: 'Door not found'
      });
    }

    throw error;
  }
};
