import type { DoorEventPayload } from '~~/server/api/doors/[id]/events';

export interface DoorNotificationTarget {
  id: number
  name: string
  webhookUrl: string | null
}

const formatTimestamp = (iso: string) => {
  try {
    return new Intl.DateTimeFormat('ja-JP', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false
    }).format(new Date(iso));
  } catch {
    return iso;
  }
};

const EVENT_META = {
  door: { icon: '🔔', color: 0xf97316 },
  record: { icon: '🎙️', color: 0xa855f7 }
} as const;

const resolveEventMeta = (type: DoorEventPayload['type']) => {
  if (type === 'record') return EVENT_META.record;
  return EVENT_META.door;
};

const resolveSourceName = (payload: DoorEventPayload) => {
  if (payload.type === 'door') {
    return payload.name;
  }
  if (payload.nameFrom && payload.nameFrom.trim().length > 0) {
    return payload.nameFrom.trim();
  }
  if (payload.type === 'dash') {
    return 'ダッシュボード';
  }
  if (payload.idFrom) {
    return `ID ${payload.idFrom}`;
  }
  return '不明';
};

const buildDescription = (sourceName: string, targetName: string, payload: DoorEventPayload, timeLabel: string) => {
  switch (payload.type) {
    case 'door':
      return `${sourceName}が${timeLabel}に押されました。`;
    case 'dash':
      return `${sourceName}から${targetName}へ${timeLabel}に呼び出しがありました。`;
    case 'record':
      return `${sourceName}から${targetName}宛てに${timeLabel}に録音が届きました。`;
    default:
      return `${sourceName}が${timeLabel}にアクションを起こしました。`;
  }
};

const buildDoorEventEmbed = (target: DoorNotificationTarget, payload: DoorEventPayload) => {
  const meta = resolveEventMeta(payload.type);

  const timeLabel = formatTimestamp(payload.triggeredAt);
  const sourceName = resolveSourceName(payload);
  const targetName = target.name;

  return {
    title: `${meta.icon} 呼び出しがありました。`,
    description: buildDescription(sourceName, targetName, payload, timeLabel),
    color: meta.color,
    fields: [
      { name: '発信元', value: sourceName, inline: true },
      { name: '通知先', value: targetName, inline: true },
      { name: '時刻', value: timeLabel, inline: true }
    ],
    footer: { text: 'DoorPhone通知' },
    timestamp: payload.triggeredAt
  };
};

export const notifyDoorDiscordWebhook = async (door: DoorNotificationTarget, payload: DoorEventPayload) => {
  const webhookUrl = door.webhookUrl?.trim();
  if (!webhookUrl) return;

  const embed = buildDoorEventEmbed(door, payload);
  if (!embed) return;

  try {
    await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ embeds: [embed] })
    });
  } catch (error) {
    console.error('Failed to send Discord webhook', { doorId: door.id, error });
  }
};
