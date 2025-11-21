import type { Ref } from 'vue';
import type { DoorEventPayload } from '~~/server/api/doors/[id]/events';
import type { ReceivedRecording } from '~/types/door';

export interface RecordingUpsertOptions {
  records: Ref<ReceivedRecording[]>
  payload: DoorEventPayload
  targetDoorId: number
  timeLabel: string
}

const buildRecordingFilename = (from: number, to: number) => {
  return `door-${from}-to-${to}.webm`;
};

export const upsertReceivedRecording = ({
  records,
  payload,
  targetDoorId,
  timeLabel
}: RecordingUpsertOptions) => {
  if (payload.type !== 'record') return;

  const idFrom = payload.idFrom;
  if (typeof idFrom !== 'number') return;

  const cacheKey = payload.triggeredAt;
  const existingRecord = records.value.find(record => record.from === idFrom && record.at === targetDoorId);
  const filename = buildRecordingFilename(idFrom, targetDoorId);
  const url = `/temp/${filename}`;

  const resolvedName = payload.nameFrom ?? `ID: ${idFrom}`;

  if (existingRecord) {
    existingRecord.time = timeLabel;
    existingRecord.cacheKey = cacheKey;
    existingRecord.fromName = resolvedName;
    existingRecord.filename = filename;
    existingRecord.url = url;
    existingRecord.createdAt = payload.triggeredAt;
    existingRecord.updatedAt = payload.triggeredAt;
    return existingRecord;
  }

  const newRecord: ReceivedRecording = {
    from: idFrom,
    at: targetDoorId,
    fromName: resolvedName,
    time: timeLabel,
    cacheKey,
    filename,
    url,
    createdAt: payload.triggeredAt,
    updatedAt: payload.triggeredAt
  };
  records.value.push(newRecord);
  return newRecord;
};

const SIX_HOURS_MS = 6 * 60 * 60 * 1000;

export const isRecordingRecentlyCreated = (record: Pick<ReceivedRecording, 'createdAt'>, thresholdMs = SIX_HOURS_MS) => {
  if (!record.createdAt) return false;
  const created = new Date(record.createdAt).getTime();
  if (Number.isNaN(created)) return false;
  return Date.now() - created <= thresholdMs;
};
