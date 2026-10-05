import type { BarcodeDetector } from 'barcode-detector/ponyfill'
import { parseCertNumber } from './utils'

let detectorPromise: Promise<BarcodeDetector> | null = null

// Loaded on demand: the ponyfill pulls in a ZXing WASM build.
const getDetector = () =>
  (detectorPromise ??= import('barcode-detector/ponyfill').then(
    ({ BarcodeDetector }) => new BarcodeDetector({ formats: ['qr_code', 'code_128', 'code_39'] })
  ))

/** Reads a PSA QR code or label barcode in the photo and returns its cert number. */
const detectCert = async (photo: Blob): Promise<string | null> => {
  const detector = await getDetector()
  const bitmap = await createImageBitmap(photo)
  try {
    for (const code of await detector.detect(bitmap)) {
      const cert = parseCertNumber(code.rawValue)
      if (cert) return cert
    }
    return null
  } finally {
    bitmap.close()
  }
}

/**
 * Looks for a PSA QR code or barcode in each photo (the label can be on either side of the slab).
 * The code is exact, so its cert number beats one read off the printed label. Never throws:
 * a photo without a readable code just means relying on what the AI read.
 */
export const certFromPhotos = async (photos: Blob[]): Promise<string | null> => {
  for (const photo of photos) {
    try {
      const cert = await detectCert(photo)
      if (cert) return cert
    } catch (error) {
      console.warn('Barcode scan failed', error)
    }
  }
  return null
}
