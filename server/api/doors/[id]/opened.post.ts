import { createError, setResponseHeader } from 'h3';
import { getDoorIdParam, getDoorOrThrow } from '../../../utils/doors';
import { doorEventEmitter } from '../../../utils/doorEvents';
import { notifyDoorDiscordWebhook } from '../../../utils/webhooks';
import type { DoorEventPayload } from './events';

export default defineEventHandler(async (event) => {
  const method = event.node.req.method?.toUpperCase();

  if (method !== 'POST') {
    setResponseHeader(event, 'Allow', 'POST');
    throw createError({
      statusCode: 405,
      statusMessage: 'Method Not Allowed'
    });
  }

  const id = getDoorIdParam(event);
  const door = await getDoorOrThrow(id);
  const doorName = door.name;
  const triggeredAt = new Date().toISOString();

  const payload: DoorEventPayload = {
    id,
    triggeredAt,
    name: doorName,
    type: 'opened'
  };

  doorEventEmitter.emit('door-opened', payload);

  if (door.webhookUrl) {
    void notifyDoorDiscordWebhook(door, payload);
  }

  return { status: 'ok' };
});
