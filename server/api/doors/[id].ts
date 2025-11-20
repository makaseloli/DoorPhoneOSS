import type { Prisma } from '@prisma/client';
import { createError, readBody, setResponseHeader, setResponseStatus } from 'h3';
import { assertDoorName, assertDoorWebhookUrl, deleteDoorById, getDoorIdParam, getDoorOrThrow, updateDoorById } from '../../utils/doors';

export default defineEventHandler(async (event) => {
  const method = event.node.req.method?.toUpperCase();
  const id = getDoorIdParam(event);

  if (id === 0) {
    return getDoorOrThrow(0);
  }

  switch (method) {
    case 'GET':
      return getDoorOrThrow(id);
    case 'PATCH': {
      const body = await readBody<{ name?: string | null, webhookUrl?: string | null }>(event);
      const data: Prisma.DoorUpdateInput = {};

      if ('name' in body && body.name !== undefined) {
        data.name = assertDoorName(body.name);
      }
      if ('webhookUrl' in body) {
        data.webhookUrl = assertDoorWebhookUrl(body.webhookUrl);
      }

      if (Object.keys(data).length === 0) {
        throw createError({
          statusCode: 400,
          statusMessage: 'No fields to update'
        });
      }

      return updateDoorById(id, data);
    }
    case 'DELETE':
      await deleteDoorById(id);
      setResponseStatus(event, 204);
      return null;
    default:
      setResponseHeader(event, 'Allow', 'GET, PATCH, DELETE');
      throw createError({
        statusCode: 405,
        statusMessage: 'Method Not Allowed'
      });
  }
});
