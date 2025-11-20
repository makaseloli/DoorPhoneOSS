import { createError, readBody, setResponseHeader, setResponseStatus } from 'h3';
import { assertDoorName, assertDoorWebhookUrl, createDoor, listDoors } from '../../utils/doors';

export default defineEventHandler(async (event) => {
  const method = event.node.req.method?.toUpperCase();

  switch (method) {
    case 'GET':
      return listDoors();
    case 'POST': {
      const body = await readBody<{ name?: string, webhookUrl?: string | null }>(event);
      const name = assertDoorName(body?.name);
      const webhookUrl = assertDoorWebhookUrl(body?.webhookUrl);
      const door = await createDoor(name, webhookUrl);
      setResponseStatus(event, 201);
      return door;
    }
    default:
      setResponseHeader(event, 'Allow', 'GET, POST');
      throw createError({
        statusCode: 405,
        statusMessage: 'Method Not Allowed'
      });
  }
});
