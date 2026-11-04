// The active worker can change while an older editor still needs a lazy chunk.
self.addEventListener('install', event => {
  event.waitUntil((async () => {
    const retained = await caches.open('seam-note-previous-assets')
    for (const name of await caches.keys()) {
      if (!name.startsWith('workbox-precache-')) continue
      const precache = await caches.open(name)
      for (const request of await precache.keys()) {
        const url = new URL(request.url)
        if (url.origin !== self.location.origin || !/^\/assets\/[^/]+-[\w-]{8,}\.(?:js|css)$/.test(url.pathname)) continue
        url.search = ''
        if (await retained.match(url.href)) continue
        const response = await precache.match(request)
        if (response) await retained.put(url.href, response)
      }
    }
    const keys = await retained.keys()
    await Promise.all(keys.slice(0, Math.max(0, keys.length - 200)).map(key => retained.delete(key)))
  })())
})
