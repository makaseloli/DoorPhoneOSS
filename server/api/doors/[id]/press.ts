import { createError, readBody, setResponseHeader } from 'h3';
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
  const body = await readBody<{ source?: 'door' | 'dash' | 'record', customName?: string, idFrom?: number }>(event);
  const source = body?.source ?? 'door';

  let nameFrom = body.customName ?? null;
  if (!nameFrom && typeof body.idFrom === 'number') {
    try {
      const fromDoor = await getDoorOrThrow(body.idFrom);
      nameFrom = fromDoor.name;
    } catch (error) {
      console.warn('Failed to resolve sender door name', body.idFrom, error);
    }
  }

  const payload: DoorEventPayload = {
    id,
    idFrom: body.idFrom ?? null,
    triggeredAt,
    name: doorName,
    nameFrom,
    type: source
  };

  doorEventEmitter.emit(`${source}-pressed`, payload);

  const notificationTarget = source === 'door' ? await getDoorOrThrow(0) : door;
  if (notificationTarget?.webhookUrl) {
    void notifyDoorDiscordWebhook(notificationTarget, payload);
  }

  return { ok: true };
});
