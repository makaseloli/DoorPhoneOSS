import type { Ref } from 'vue';
import type { DoorEventPayload } from '~~/server/api/doors/[id]/events';
import type { ReceivedRecording } from '~/types/door';

export interface RecordingUpsertOptions {
  records: Ref<ReceivedRecording[]>
  payload: DoorEventPayload
  targetDoorId: number
  timeLabel: string
}

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

  if (existingRecord) {
    existingRecord.time = timeLabel;
    existingRecord.cacheKey = cacheKey;
    existingRecord.fromName = payload.nameFrom ?? existingRecord.fromName;
    return existingRecord;
  }

  const newRecord: ReceivedRecording = {
    from: idFrom,
    at: targetDoorId,
    fromName: payload.nameFrom ?? '',
    time: timeLabel,
    cacheKey
  };
  records.value.push(newRecord);
  return newRecord;
};
