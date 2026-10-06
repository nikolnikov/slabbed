import { JPEG_QUALITY, MAX_PHOTO_DIMENSION, WEBP_QUALITY } from './constants'
import type { Card, CardFilters } from './types'

/**
 * Pulls a PSA cert number out of a scanned value. PSA QR codes hold a cert URL
 * (e.g. https://www.psacard.com/cert/12345678) and the label barcode holds the bare number.
 */
export const parseCertNumber = (value: string): string | null => {
  const fromUrl = value.match(/cert\/(\d{5,12})/i)
  if (fromUrl) return fromUrl[1]
  const bare = value.trim().match(/^\d{5,12}$/)
  return bare ? bare[0] : null
}

// HEIC/HEIF is the iPhone's default photo format. iOS hands file inputs a JPEG and Safari can
// decode HEIC itself, but Chrome, Firefox and Edge can't, so there it's converted with libheif.
const HEIC_BRANDS = /^(heic|heix|hevc|hevx|heim|heis|mif1|msf1)$/

const looksLikeHeic = async (file: Blob) => {
  if (/^image\/hei[cf]/i.test(file.type) || (file instanceof File && /\.hei[cf]$/i.test(file.name))) return true
  // Some browsers report an empty type for HEIC, so check the ISO-BMFF "ftyp" brand too.
  const head = new Uint8Array(await file.slice(0, 12).arrayBuffer())
  const ascii = (start: number, end: number) => String.fromCharCode(...head.slice(start, end))
  return ascii(4, 8) === 'ftyp' && HEIC_BRANDS.test(ascii(8, 12))
}

/** Returns a version of the photo this browser can decode, converting HEIC when necessary. */
export const toDecodablePhoto = async (file: Blob): Promise<Blob> => {
  if (!(await looksLikeHeic(file))) return file
  try {
    ;(await createImageBitmap(file)).close()
    return file
  } catch {
    // Not supported natively: load the converter (~3 MB, only fetched when this happens).
    const { heicTo } = await import('heic-to')
    return heicTo({ blob: file, type: 'image/jpeg', quality: 0.92 })
  }
}

const canvasToBlob = (canvas: HTMLCanvasElement, type: string, quality: number) =>
  new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, type, quality))

/** A region of a photo, in the photo's own pixels. */
export type CropRect = { x: number; y: number; width: number; height: number }

/**
 * Encodes with a bundled WebP encoder (WASM), for browsers whose canvas can't produce WebP.
 * Loaded on first use only, so browsers that encode WebP natively never download it.
 */
const encodeWebpInWasm = async (canvas: HTMLCanvasElement): Promise<Blob> => {
  const { default: encode } = await import('@jsquash/webp/encode')
  const pixels = canvas.getContext('2d')!.getImageData(0, 0, canvas.width, canvas.height)
  const data = await encode(pixels, { quality: Math.round(WEBP_QUALITY * 100) })
  return new Blob([data], { type: 'image/webp' })
}

/**
 * Scales a photo (or the cropped region of it) down to MAX_PHOTO_DIMENSION and re-encodes it as WebP.
 * Safari (every iPhone browser) can't encode WebP from a canvas and silently returns PNG from toBlob,
 * so there the bundled encoder takes over; JPEG is the last resort if that fails to load.
 */
export const optimizePhoto = async (file: Blob, maxDimension = MAX_PHOTO_DIMENSION, crop?: CropRect): Promise<Blob> => {
  const bitmap = await createImageBitmap(await toDecodablePhoto(file), { imageOrientation: 'from-image' })
  const { x, y, width, height } = crop ?? { x: 0, y: 0, width: bitmap.width, height: bitmap.height }
  const scale = Math.min(1, maxDimension / Math.max(width, height))
  const canvas = document.createElement('canvas')
  canvas.width = Math.round(width * scale)
  canvas.height = Math.round(height * scale)
  canvas.getContext('2d')!.drawImage(bitmap, x, y, width, height, 0, 0, canvas.width, canvas.height)
  bitmap.close()

  const webp = await canvasToBlob(canvas, 'image/webp', WEBP_QUALITY)
  if (webp?.type === 'image/webp') return webp
  try {
    return await encodeWebpInWasm(canvas)
  } catch (error) {
    console.warn('WebP encoder unavailable, saving as JPEG', error)
  }
  const jpeg = await canvasToBlob(canvas, 'image/jpeg', JPEG_QUALITY)
  if (!jpeg) throw new Error('Could not process photo')
  return jpeg
}

/**
 * Downloads images into the browser cache so they show instantly when displayed. Resolves when
 * all have loaded or failed, or after `timeoutMs` so a slow image never holds things up for long.
 */
// Images being preloaded. Holding a reference until each finishes stops the browser from
// garbage-collecting one mid-download (which can cancel it and leave the real image to start over).
const preloading = new Set<HTMLImageElement>()

export const preloadImages = (urls: string[], timeoutMs = 10_000): Promise<void> =>
  Promise.race([
    Promise.all(
      urls.map(
        (url) =>
          new Promise<void>((resolve) => {
            const image = new Image()
            preloading.add(image)
            image.onload = image.onerror = () => {
              preloading.delete(image)
              resolve()
            }
            image.src = url
          })
      )
    ).then(() => undefined),
    new Promise<void>((resolve) => window.setTimeout(resolve, timeoutMs)),
  ])

export const blobToDataUrl = (blob: Blob): Promise<string> =>
  new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result as string)
    reader.onerror = () => reject(reader.error)
    reader.readAsDataURL(blob)
  })

export const formatGrade = (card: Pick<Card, 'isGraded' | 'grader' | 'grade' | 'gradeLabel'>): string => {
  if (!card.isGraded) return 'Raw'
  const grade = card.grade ?? card.gradeLabel
  return [card.grader, grade].filter((part) => part !== null).join(' ') || 'Graded'
}

/** Badge colors: PSA red (gold for a 10), BGS black, SGC green, TAG blue, raw gray. */
export const gradeBadgeClass = (card: Pick<Card, 'isGraded' | 'grader' | 'grade'>): string => {
  if (!card.isGraded) return 'grade-badge grade-badge--raw'
  if (card.grader && card.grader !== 'PSA') return `grade-badge grade-badge--${card.grader.toLowerCase()}`
  return `grade-badge${card.grade === 10 ? ' grade-badge--gem' : ''}`
}

export const cardSubtitle = (card: Pick<Card, 'year' | 'brand' | 'cardNumber'>): string =>
  [card.year, card.brand, card.cardNumber && `#${card.cardNumber}`].filter(Boolean).join(' ')

/**
 * Searches for listing photos, most specific first, e.g. "1960 Topps Earl Averill #39 PSA 8".
 * eBay only returns listings containing every word, and sellers word titles differently, so each
 * later search drops a detail (grade, then variant, card number and set) to widen the net.
 */
export const photoSearchQueries = (
  card: Pick<Card, 'year' | 'brand' | 'player' | 'cardNumber' | 'variety' | 'isGraded' | 'grader' | 'grade'>
): string[] => {
  const grade = card.isGraded && card.grade !== null ? `${card.grader ?? ''} ${card.grade}`.trim() : null
  const number = card.cardNumber && `#${card.cardNumber}`
  const steps = [
    [card.year, card.brand, card.player, number, card.variety, grade],
    [card.year, card.brand, card.player, number, card.variety],
    [card.year, card.brand, card.player, number],
    [card.year, card.brand, card.player],
    [card.year, card.player],
  ]
  const queries = steps.map((parts) => parts.filter(Boolean).join(' '))
  // Steps repeat when a card lacks some details; the server needs at least 3 characters.
  return [...new Set(queries)].filter((query) => query.length >= 3)
}

export const uniqueSorted =<T>(values: (T | null)[], compare: (a: T, b: T) => number): T[] =>
  [...new Set(values.filter((v): v is T => v !== null))].sort(compare)

const NAME_SUFFIX = /^(jr|sr|ii|iii|iv|v)\.?$/i

/** "Ken Griffey Jr." -> "Griffey": the last word of the name, skipping suffixes. */
const lastName = (name: string): string => {
  const words = name.trim().split(/\s+/)
  while (words.length > 1 && NAME_SUFFIX.test(words[words.length - 1])) words.pop()
  return words[words.length - 1] ?? ''
}

/** Sorts by last name, then by full name (so "Hank Aaron" and "Tommie Aaron" stay in a fixed order). */
const compareByLastName = (a: string, b: string) =>
  lastName(a).localeCompare(lastName(b), undefined, { sensitivity: 'base' }) ||
  a.localeCompare(b, undefined, { sensitivity: 'base' })

export const filterCards = (cards: Card[], filters: CardFilters): Card[] => {
  const search = filters.search.trim().toLowerCase()
  const filtered = cards.filter((card) => {
    if (filters.graded === 'graded' && !card.isGraded) return false
    if (filters.graded === 'ungraded' && card.isGraded) return false
    if (filters.grader && card.grader !== filters.grader) return false
    if (filters.grades.length > 0) {
      const matches = card.isGraded ? card.grade !== null && filters.grades.includes(card.grade) : filters.grades.includes('raw')
      if (!matches) return false
    }
    if (search) {
      const haystack = [card.player, card.year, card.brand, card.variety, card.cardNumber, card.certNumber, card.notes]
        .filter(Boolean)
        .join(' ')
        .toLowerCase()
      if (!haystack.includes(search)) return false
    }
    return true
  })

  const compare: Record<CardFilters['sort'], (a: Card, b: Card) => number> = {
    recent: (a, b) => b.createdAt.localeCompare(a.createdAt),
    grade: (a, b) => (b.grade ?? -1) - (a.grade ?? -1),
    year: (a, b) => (b.year ?? '').localeCompare(a.year ?? ''),
    player: (a, b) => compareByLastName(a.player, b.player),
  }
  return filtered.sort(compare[filters.sort])
}
