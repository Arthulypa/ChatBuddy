// ChatBuddy Service Worker — notificações em background
self.addEventListener('install', e => self.skipWaiting());
self.addEventListener('activate', e => e.waitUntil(self.clients.claim()));

self.addEventListener('push', e => {
    if (!e.data) return;
    const data = e.data.json();
    const title = data.title || 'ChatBuddy';
    const options = {
        body:    data.body || 'Nova mensagem',
        icon:    data.icon || '/icon.png',
        badge:   '/icon.png',
        vibrate: [200, 100, 200],
        tag:     'chatbuddy-msg',
        renotify: true,
        data:    { url: data.url || '/' }
    };
    e.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener('notificationclick', e => {
    e.notification.close();
    e.waitUntil(
        clients.matchAll({ type: 'window', includeUncontrolled: true }).then(list => {
            if (list.length > 0) return list[0].focus();
            return clients.openWindow(e.notification.data.url || '/');
        })
    );
});
