// درخواست مجوز
export async function requestNotificationPermission() {
  if (!('Notification' in window)) {
    return false;
  }
  
  const permission = await Notification.requestPermission();
  return permission === 'granted';
}

// نمایش نوتیفیکیشن
export function showNotification(title: string, body: string) {
  if (Notification.permission === 'granted') {
    new Notification(title, {
      body,
      icon: '/icon-192.jpg',
      badge: '/icon-192.jpg',
      tag: 'ghestyar',
    });
  }
}

// Schedule notification (با setTimeout)
export function scheduleNotification(title: string, body: string, delayMs: number) {
  setTimeout(() => {
    if (Notification.permission === 'granted') {
      showNotification(title, body);
    }
  }, delayMs);
}
