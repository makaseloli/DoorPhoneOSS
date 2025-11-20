import { createError, setHeader } from 'h3';
import { getRouterParam, useStorage } from '#imports';

const MIME_MAP: Record<string, string> = {
  webm: 'audio/webm',
  mp3: 'audio/mpeg',
  wav: 'audio/wav',
  ogg: 'audio/ogg'
};

export default defineEventHandler(async (event) => {
  const rawPath = getRouterParam(event, 'path');
  const targetPath = Array.isArray(rawPath) ? rawPath.join('/') : rawPath;

  if (!targetPath || targetPath.includes('..')) {
    throw createError({ statusCode: 400, statusMessage: 'Invalid path' });
  }

  const storage = useStorage('temp');
  const data = await storage.getItemRaw(targetPath);

  if (!data) {
    throw createError({ statusCode: 404, statusMessage: 'Recording not found' });
  }

  const extension = targetPath.split('.').pop()?.toLowerCase() || '';
  const mime = MIME_MAP[extension] || 'application/octet-stream';

  setHeader(event, 'Content-Type', mime);
  setHeader(event, 'Cache-Control', 'private, max-age=86400');

  return data;
});
