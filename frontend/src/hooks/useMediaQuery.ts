import { useEffect, useState } from 'react'

export function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(() => (
    typeof window === 'undefined' ? false : window.matchMedia(query).matches
  ))

  useEffect(() => {
    if (typeof window === 'undefined') return

    const mediaQuery = window.matchMedia(query)

    function handleChange(event: MediaQueryListEvent) {
      setMatches(event.matches)
    }

    mediaQuery.addEventListener('change', handleChange)
    // Re-sync the external value when query changes, before any change event arrives.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setMatches(mediaQuery.matches)

    return () => mediaQuery.removeEventListener('change', handleChange)
  }, [query])

  return matches
}
