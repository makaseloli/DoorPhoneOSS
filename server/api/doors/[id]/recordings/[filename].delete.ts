import { createError, setResponseHeader, setResponseStatus } from 'h3';
import { useStorage } from '#imports';
import { getDoorIdParam, getDoorOrThrow } from '../../../../utils/doors';
import { ensureRecordingBelongsToDoor } from '../../../../utils/recordings';

const resolveFilenameParam = (raw: string | string[] | undefined) => {
  if (!raw) return null;
  return Array.isArray(raw) ? raw[0] : raw;
};

export default defineEventHandler(async (event) => {
  const method = event.node.req.method?.toUpperCase();

  if (method !== 'DELETE') {
    setResponseHeader(event, 'Allow', 'DELETE');
    throw createError({
      statusCode: 405,
      statusMessage: 'Method Not Allowed'
    });
  }

  const doorId = getDoorIdParam(event);
  await getDoorOrThrow(doorId);

  const filenameParam = resolveFilenameParam(event.context.params?.filename);

  if (!filenameParam) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Recording filename is required'
    });
  }

  ensureRecordingBelongsToDoor(filenameParam, doorId);

  const storage = useStorage('temp');

  if (!await storage.hasItem(filenameParam)) {
    throw createError({
      statusCode: 404,
      statusMessage: 'Recording not found'
    });
  }

  await storage.removeItem(filenameParam);
  setResponseStatus(event, 204);
  return null;
});
