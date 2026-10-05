import type { CardFilters, Grader, SortKey } from './types'

/** Grading companies the app recognizes; the AI reads one off the slab label. */
export const GRADERS: Grader[] = ['PSA', 'BGS', 'SGC', 'TAG']

export const SORT_OPTIONS: { key: SortKey; label: string }[] = [
  { key: 'recent', label: 'Recently added' },
  { key: 'grade', label: 'Grade (high to low)' },
  { key: 'year', label: 'Year (newest)' },
  { key: 'player', label: 'Player (A–Z)' },
]

export const DEFAULT_FILTERS: CardFilters = { search: '', grades: [], grader: '', graded: 'all', sort: 'recent' }

/** Longest edge of photos uploaded from the device, in pixels. */
export const MAX_PHOTO_DIMENSION = 1600
export const WEBP_QUALITY = 0.82
/** Only used when the browser can't encode WebP. */
export const JPEG_QUALITY = 0.85
