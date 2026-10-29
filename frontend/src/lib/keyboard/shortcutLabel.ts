/** Presentation only: keyboard handlers can continue accepting both modifiers. */
export function shortcutLabel(label: string, key: string, platform?: string): string {
  const detected = platform ?? (typeof navigator === 'undefined' ? '' :
    (navigator as Navigator & { userAgentData?: { platform?: string } }).userAgentData?.platform || navigator.platform || navigator.userAgent)
  const mac = /mac|iphone|ipad|ipod/i.test(detected)
  const shortcut = mac ? `⌘${key.replace('Shift+', '⇧')}` : `Ctrl+${key}`
  return `${label} (${shortcut})`
}
