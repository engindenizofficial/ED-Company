// Web Push bildirimlerini karşılayan minimal service worker.
// Sadece bildirim gösterme ve tıklama yönlendirmesi yapar; önbellekleme/offline
// desteği barındırmaz (bunun için ayrı bir SW gerekirse burası genişletilebilir).

self.addEventListener("install", () => {
  self.skipWaiting()
})

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim())
})

self.addEventListener("push", (event) => {
  if (!event.data) return

  let payload
  try {
    payload = event.data.json()
  } catch {
    payload = { title: "Maç Analiz", body: event.data.text() }
  }

  const title = payload.title || "Maç Analiz"
  const options = {
    body: payload.body,
    icon: "/icon-192.png",
    // Android durum çubuğu badge'i renkli ikon kabul etmez — sistem alfa
    // kanalını maske olarak kullanıp tek renkli bir silüet bekler, aksi halde
    // boş/gri bir kare gösterir. Bu yüzden ayrı, saydam arka planlı tek
    // renkli bir badge görseli kullanıyoruz.
    badge: "/badge-monochrome.png",
    data: { url: payload.url || "/" },
    tag: payload.tag,
    renotify: Boolean(payload.tag),
    // Web Push, arka planda özel bir ses dosyası çalmayı desteklemiyor
    // (tarayıcı/OS her zaman kendi varsayılan sesini kullanır). Titreşim
    // paterni ekleyerek bildirimi Android'de daha fark edilir yapıyoruz.
    vibrate: [200, 80, 200],
  }

  event.waitUntil(
    Promise.all([
      self.registration.showNotification(title, options),
      // Uygulama şu an açıksa (sekme/PWA ön planda), bağlı istemcilere
      // mesaj gönderip kendi özel "gol sesi" efektimizi çaldırıyoruz.
      // Bu, sistemin varsayılan bildirim sesine ek olarak duyulur.
      self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clientList) => {
        for (const client of clientList) {
          client.postMessage({ type: "PLAY_GOAL_SOUND" })
        }
      }),
    ]),
  )
})

self.addEventListener("notificationclick", (event) => {
  event.notification.close()
  const targetUrl = event.notification.data?.url || "/"

  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if (client.url.includes(targetUrl) && "focus" in client) {
          return client.focus()
        }
      }
      if (self.clients.openWindow) {
        return self.clients.openWindow(targetUrl)
      }
    }),
  )
})
