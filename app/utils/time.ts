export const formatDoorEventTime = (iso: string) => new Date(iso).toLocaleTimeString('ja-JP', {
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  hour12: false
});
