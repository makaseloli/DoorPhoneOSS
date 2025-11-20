export default defineNuxtPlugin(() => {
  let wakeLock: WakeLockSentinel | null = null;

  async function requestWakeLock() {
    try {
      wakeLock = await navigator.wakeLock.request('screen');
      console.log('WakeLock有効');
      wakeLock.addEventListener('release', () => {
        console.log('WakeLock解除');
      });
    } catch (err) {
      console.error('WakeLock取得失敗:', err);
    }
  }

  document.addEventListener('visibilitychange', () => {
    if (wakeLock !== null && document.visibilityState === 'visible') {
      requestWakeLock();
    }
  });

  if ('wakeLock' in navigator) {
    requestWakeLock();
  }
});
