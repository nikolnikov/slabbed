import type { CardFilters, SortKey } from './types'

export const SORT_OPTIONS: { key: SortKey; label: string }[] = [
  { key: 'recent', label: 'Recently added' },
  { key: 'grade', label: 'Grade (high to low)' },
  { key: 'year', label: 'Year (newest)' },
  { key: 'player', label: 'Player (A–Z)' },
]

export const DEFAULT_FILTERS: CardFilters = { search: '', grades: [], sport: '', graded: 'all', sort: 'recent' }

/** Longest edge of photos uploaded from the device, in pixels. */
export const MAX_PHOTO_DIMENSION = 1600
export const WEBP_QUALITY = 0.82
/** Only used when the browser can't encode WebP. */
export const JPEG_QUALITY = 0.85
