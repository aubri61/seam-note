type ReloadCheck = () => boolean
type ReloadGuard = () => Promise<ReloadCheck | null> | ReloadCheck | null

export function createReloadGate() {
  const guards = new Set<ReloadGuard>()
  let generation = 0
  return {
    register(guard: ReloadGuard) {
      guards.add(guard)
      generation++
      return () => { guards.delete(guard); generation++ }
    },
    async check() {
      const current = generation
      const checks = await Promise.all([...guards].map(guard => guard()))
      return () => current === generation && checks.every(check => check?.() === true)
    },
  }
}

export const updateReloadGate = createReloadGate()

export function watchAppUpdates(
  container: Pick<ServiceWorkerContainer, 'controller' | 'addEventListener' | 'removeEventListener'>,
  check: () => Promise<ReloadCheck>,
  reload: () => void,
  interval = 1000,
) {
  let controller = container.controller
  let pending = false
  let checking = false
  let disposed = false
  let reloading = false
  let timer: ReturnType<typeof setTimeout> | undefined

  async function attempt() {
    if (!pending || checking || reloading || disposed) return
    clearTimeout(timer)
    checking = true
    try {
      const ready = await check()
      if (!disposed && ready()) {
        reloading = true
        reload()
      }
    } catch {
      // An unreadable local store is not a safe reload point.
    } finally {
      checking = false
      if (!disposed && !reloading) timer = setTimeout(() => void attempt(), interval)
    }
  }

  function changed() {
    const next = container.controller
    if (!next || next === controller) return
    // The first install claims the document that already loaded the current bundle.
    if (controller) pending = true
    controller = next
    void attempt()
  }

  container.addEventListener('controllerchange', changed)
  return () => {
    disposed = true
    clearTimeout(timer)
    container.removeEventListener('controllerchange', changed)
  }
}

export function startAppUpdates() {
  if (!('serviceWorker' in navigator)) return
  const container = navigator.serviceWorker
  let composing = false
  window.addEventListener('compositionstart', () => { composing = true }, true)
  window.addEventListener('compositionend', () => { composing = false }, true)
  watchAppUpdates(container, async () => {
    const ready = await updateReloadGate.check()
    return () => !composing && ready()
  }, () => window.location.reload())

  const registration = container.register('/sw.js', { updateViaCache: 'none' })
  let lastCheck = -Infinity
  const checkForUpdate = () => {
    if (!navigator.onLine || Date.now() - lastCheck < 30_000) return
    lastCheck = Date.now()
    void registration.then(worker => worker.update()).catch(() => {})
  }
  void registration.catch(() => console.warn('[Seam Note] service worker registration failed'))
  window.addEventListener('online', checkForUpdate)
  window.addEventListener('pageshow', checkForUpdate)
  window.addEventListener('vite:preloadError', () => { lastCheck = -Infinity; checkForUpdate() })
  const checkWhenVisible = () => {
    if (document.visibilityState === 'visible') checkForUpdate()
  }
  document.addEventListener('visibilitychange', checkWhenVisible)
  setInterval(checkWhenVisible, 60_000)
}
