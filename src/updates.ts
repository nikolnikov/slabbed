// Vite fingerprints built JS/CSS (e.g. /assets/index-BHWNo8JN.css), so a deploy changes the
// asset names referenced by index.html. Home-screen web apps on iOS resume the page already in
// memory instead of re-requesting index.html, so we compare the live names with ours on resume.

const CHECK_INTERVAL_MS = 5 * 60 * 1000
const ASSET_PATTERN = /\/assets\/[\w.-]+\.(?:js|css)/g

const fingerprint = (paths: Iterable<string>) => [...new Set(paths)].sort().join('|')

const loadedFingerprint = () =>
  fingerprint(
    Array.from(document.querySelectorAll<HTMLLinkElement | HTMLScriptElement>('link[rel="stylesheet"], script[src]'))
      .map((el) => new URL('href' in el ? el.href : el.src).pathname)
      .filter((path) => path.startsWith('/assets/'))
  )

const fetchLiveFingerprint = async (): Promise<string | null> => {
  try {
    const res = await fetch('/', { cache: 'no-store' })
    if (!res.ok) return null
    return fingerprint((await res.text()).match(ASSET_PATTERN) ?? [])
  } catch {
    return null
  }
}

/**
 * Reloads the page when a newer deploy is live, at the moment the app is closed (backgrounded)
 * or reopened. `canReload` is consulted first so an update never wipes in-progress work, such
 * as a half-filled card form; a held-back update waits for the next close/reopen.
 * Returns a cleanup function.
 */
export function watchForUpdates(canReload: () => boolean) {
  const current = loadedFingerprint()
  // The dev server serves unbundled modules, so there's nothing to compare.
  if (!current) return () => {}

  let updateReady = false
  const detect = async () => {
    if (updateReady) return
    const live = await fetchLiveFingerprint()
    updateReady = live !== null && live !== '' && live !== current
  }

  // Reload only at natural boundaries (app closed or reopened) rather than mid-scroll while
  // someone is using it.
  const reloadIfReady = () => {
    if (updateReady && canReload()) window.location.reload()
  }

  const handleResume = async () => {
    await detect()
    reloadIfReady()
  }
  // Closing the app (sending it to the background) is the ideal moment: nobody is looking, so
  // reloading then means it opens already up to date. iOS may freeze a backgrounded page before
  // the fetch finishes, so the check on resume stays as the fallback.
  const handleClose = async () => {
    await detect()
    if (document.visibilityState === 'hidden') reloadIfReady()
  }
  const handleVisibility = () => {
    if (document.visibilityState === 'visible') handleResume()
    else handleClose()
  }

  document.addEventListener('visibilitychange', handleVisibility)
  window.addEventListener('pageshow', handleResume)
  // Some iOS home-screen resumes only report focus, not a visibility change.
  window.addEventListener('focus', handleResume)
  const timer = window.setInterval(handleClose, CHECK_INTERVAL_MS)

  return () => {
    document.removeEventListener('visibilitychange', handleVisibility)
    window.removeEventListener('pageshow', handleResume)
    window.removeEventListener('focus', handleResume)
    window.clearInterval(timer)
  }
}
