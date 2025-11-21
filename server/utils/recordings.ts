import { createError } from 'h3';

const RECORDING_FILENAME_PATTERN = /^door-(\d+)-to-(\d+)\.(webm|mp3|wav|ogg)$/i;

export interface ParsedRecordingFilename {
  from: number
  to: number
  extension: string
}

export const parseRecordingFilename = (filename: string | null | undefined): ParsedRecordingFilename | null => {
  const value = (filename ?? '').trim();

  if (!value) return null;

  const match = value.match(RECORDING_FILENAME_PATTERN);

  if (!match) return null;

  const [, fromRaw, toRaw, extensionRaw] = match;
  const from = Number.parseInt(fromRaw, 10);
  const to = Number.parseInt(toRaw, 10);
  const extension = extensionRaw.toLowerCase();

  if (!Number.isInteger(from) || !Number.isInteger(to)) {
    return null;
  }

  return { from, to, extension };
};

export const assertRecordingFilename = (filename: string | null | undefined): ParsedRecordingFilename => {
  const parsed = parseRecordingFilename(filename);

  if (!parsed) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Invalid recording filename'
    });
  }

  return parsed;
};

export const ensureRecordingBelongsToDoor = (filename: string | null | undefined, doorId: number): ParsedRecordingFilename => {
  const parsed = parseRecordingFilename(filename);

  if (!parsed || parsed.to !== doorId) {
    throw createError({
      statusCode: 404,
      statusMessage: 'Recording not found'
    });
  }

  return parsed;
};
