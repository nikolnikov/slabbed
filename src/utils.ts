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
 * Scales a photo (or the cropped region of it) down to MAX_PHOTO_DIMENSION and re-encodes it as WebP.
 * Browsers that can't encode WebP (older Safari) silently return PNG from toBlob, so those fall back to JPEG.
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
  const jpeg = await canvasToBlob(canvas, 'image/jpeg', JPEG_QUALITY)
  if (!jpeg) throw new Error('Could not process photo')
  return jpeg
}

export const blobToDataUrl = (blob: Blob): Promise<string> =>
  new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result as string)
    reader.onerror = () => reject(reader.error)
    reader.readAsDataURL(blob)
  })

export const formatGrade = (card: Pick<Card, 'isGraded' | 'grade' | 'gradeLabel'>): string => {
  if (!card.isGraded) return 'Raw'
  if (card.grade !== null) return `PSA ${card.grade}`
  return card.gradeLabel ? `PSA ${card.gradeLabel}` : 'PSA'
}

export const cardSubtitle = (card: Pick<Card, 'year' | 'brand' | 'cardNumber'>): string =>
  [card.year, card.brand, card.cardNumber && `#${card.cardNumber}`].filter(Boolean).join(' ')

/** Search text for finding listing photos, e.g. "1960 Topps Earl Averill #39 PSA 8". */
export const photoSearchQuery = (
  card: Pick<Card, 'year' | 'brand' | 'player' | 'cardNumber' | 'variety' | 'isGraded' | 'grade'>
): string =>
  [
    card.year,
    card.brand,
    card.player,
    card.cardNumber && `#${card.cardNumber}`,
    card.variety,
    card.isGraded && card.grade !== null && `PSA ${card.grade}`,
  ]
    .filter(Boolean)
    .join(' ')

export const uniqueSorted =<T>(values: (T | null)[], compare: (a: T, b: T) => number): T[] =>
  [...new Set(values.filter((v): v is T => v !== null))].sort(compare)

export const filterCards = (cards: Card[], filters: CardFilters): Card[] => {
  const search = filters.search.trim().toLowerCase()
  const filtered = cards.filter((card) => {
    if (filters.graded === 'graded' && !card.isGraded) return false
    if (filters.graded === 'ungraded' && card.isGraded) return false
    if (filters.sport && card.sport !== filters.sport) return false
    if (filters.grades.length > 0 && (card.grade === null || !filters.grades.includes(card.grade))) return false
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
    player: (a, b) => a.player.localeCompare(b.player),
  }
  return filtered.sort(compare[filters.sort])
}
