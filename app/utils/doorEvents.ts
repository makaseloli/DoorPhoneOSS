import type { DoorEventPayload } from '~~/server/api/doors/[id]/events';

type DoorEventStreamPayload = Partial<DoorEventPayload> & {
  type?: DoorEventPayload['type'] | 'ping'
};

export type ParsedDoorEventMessage = (
  | { kind: 'payload', payload: DoorEventPayload }
  | { kind: 'ping' }
  | { kind: 'invalid', error: Error }
);

const formatParseError = (message: string) => new Error(`[door-events] ${message}`);

const isDoorEventPayload = (payload: DoorEventStreamPayload): payload is DoorEventPayload => {
  return (
    typeof payload.id === 'number'
    && typeof payload.triggeredAt === 'string'
    && typeof payload.name === 'string'
    && typeof payload.type === 'string'
  );
};

export const parseDoorEventMessage = (data: string): ParsedDoorEventMessage => {
  try {
    const payload = JSON.parse(data) as DoorEventStreamPayload;
    if (!payload.type || payload.type === 'ping') {
      return { kind: 'ping' };
    }
    if (!isDoorEventPayload(payload)) {
      return { kind: 'invalid', error: formatParseError('Malformed payload structure') };
    }
    return { kind: 'payload', payload };
  } catch (error) {
    return {
      kind: 'invalid',
      error: error instanceof Error ? error : formatParseError('Unknown parse error')
    };
  }
};
