import { createError, setResponseHeader } from 'h3';
import { useStorage } from '#imports';
import { getDoorIdParam, getDoorOrThrow } from '../../../utils/doors';
import { parseRecordingFilename } from '../../../utils/recordings';

export interface DoorRecordingListItem {
  filename: string
  from: number
  to: number
  extension: string
  size: number | null
  createdAt: string | null
  updatedAt: string | null
  url: string
  fromName: string
}

type StorageMeta = {
  atime?: Date
  mtime?: Date
  ctime?: Date
  birthtime?: Date
  size?: number
};

const getUpdatedAtIso = (meta?: StorageMeta): string | null => {
  const timestamps = [meta?.mtime, meta?.ctime, meta?.birthtime, meta?.atime]
    .filter((value): value is Date => value instanceof Date);

  if (timestamps.length === 0) return null;

  const mostRecent = timestamps.reduce((latest, current) => {
    if (!latest) return current;
    return current > latest ? current : latest;
  });

  return mostRecent?.toISOString() ?? null;
};

const getCreatedAtIso = (meta?: StorageMeta): string | null => {
  const timestamps = [meta?.birthtime, meta?.ctime, meta?.mtime, meta?.atime]
    .filter((value): value is Date => value instanceof Date);

  if (timestamps.length === 0) return null;

  const earliest = timestamps.reduce((first, current) => {
    if (!first) return current;
    return current < first ? current : first;
  });

  return earliest?.toISOString() ?? null;
};

export default defineEventHandler(async (event) => {
  const method = event.node.req.method?.toUpperCase();

  if (method !== 'GET') {
    setResponseHeader(event, 'Allow', 'GET');
    throw createError({
      statusCode: 405,
      statusMessage: 'Method Not Allowed'
    });
  }

  const doorId = getDoorIdParam(event);
  await getDoorOrThrow(doorId);

  const storage = useStorage('temp');
  const keys = await storage.getKeys();

  const doorNameCache = new Map<number, string>();
  const getDoorName = async (doorId: number) => {
    if (doorNameCache.has(doorId)) {
      return doorNameCache.get(doorId)!;
    }
    try {
      const door = await getDoorOrThrow(doorId);
      doorNameCache.set(doorId, door.name);
      return door.name;
    } catch {
      const fallback = `ID: ${doorId}`;
      doorNameCache.set(doorId, fallback);
      return fallback;
    }
  };

  const recordings = (await Promise.all(keys.map(async (key) => {
    const parsed = parseRecordingFilename(key);

    if (!parsed || parsed.to !== doorId) {
      return null;
    }

    const meta = await storage.getMeta(key).catch(() => ({})) as StorageMeta;
    const createdAt = getCreatedAtIso(meta);
    const updatedAt = getUpdatedAtIso(meta);

    const fromName = await getDoorName(parsed.from);

    const item: DoorRecordingListItem = {
      filename: key,
      from: parsed.from,
      to: parsed.to,
      extension: parsed.extension,
      size: typeof meta?.size === 'number' ? meta.size : null,
      createdAt,
      updatedAt,
      url: `/temp/${key}`,
      fromName
    };

    return item;
  }))).filter((item): item is DoorRecordingListItem => item !== null);

  recordings.sort((a, b) => {
    if (!a.updatedAt && !b.updatedAt) return a.filename.localeCompare(b.filename);
    if (!a.updatedAt) return 1;
    if (!b.updatedAt) return -1;
    return b.updatedAt.localeCompare(a.updatedAt);
  });

  return {
    recordings
  };
});
