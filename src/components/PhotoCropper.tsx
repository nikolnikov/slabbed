import { useEffect, useRef, useState } from 'react'
import type { PointerEvent } from 'react'
import { optimizePhoto } from '../utils'
import type { CropRect } from '../utils'
import { Modal } from './Modal'

export type CropShape = 'card' | 'slab'

// Width / height. Raw cards are 2.5" x 3.5"; a PSA slab, label included, is about 3.125" x 5.375".
const ASPECT: Record<CropShape, number> = { card: 2.5 / 3.5, slab: 3.125 / 5.375 }
// How much of the viewport the frame takes up, leaving a margin of photo visible around it.
const FRAME_FILL = 0.88
// Zoom limit, relative to the smallest zoom that still fills the frame.
const MAX_ZOOM = 6

type Size = { width: number; height: number }
type Point = { x: number; y: number }
/** Photo zoom (screen px per photo px) and the offset of its center from the viewport's center. */
type View = { scale: number } & Point

type PhotoCropperProps = {
  /** e.g. "front", for the title "Crop front photo". */
  label: string
  /** The full-size photo, as taken. */
  photo: Blob
  shape: CropShape
  onShapeChange: (shape: CropShape) => void
  /** Gets the cropped (or full, if skipped) photo, resized and re-encoded for upload. */
  onDone: (photo: Blob) => void
  onCancel: () => void
}

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value))

/** Lets the user pan and pinch a photo under a card- or slab-shaped frame and crops to it. */
export function PhotoCropper({ label, photo, shape, onShapeChange, onDone, onCancel }: PhotoCropperProps) {
  const viewportRef = useRef<HTMLDivElement>(null)
  const pointers = useRef(new Map<number, Point>())
  const [src] = useState(() => URL.createObjectURL(photo))
  const [image, setImage] = useState<Size | null>(null)
  const [box, setBox] = useState<Size | null>(null)
  const [view, setView] = useState<View | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const viewport = viewportRef.current
    if (!viewport) return
    const observer = new ResizeObserver(([entry]) =>
      setBox({ width: entry.contentRect.width, height: entry.contentRect.height })
    )
    observer.observe(viewport)
    return () => observer.disconnect()
  }, [])

  const aspect = ASPECT[shape]
  const frame: Size | null = box && {
    width: Math.min(box.height * FRAME_FILL, (box.width * FRAME_FILL) / aspect) * aspect,
    height: Math.min(box.height * FRAME_FILL, (box.width * FRAME_FILL) / aspect),
  }
  const minScale = image && frame ? Math.max(frame.width / image.width, frame.height / image.height) : 1

  // Keeps the frame covered by the photo. Applied on every render, so switching to a different
  // frame shape re-fits the photo without any extra bookkeeping.
  const fit = (next: View): View => {
    if (!image || !frame) return next
    const scale = clamp(next.scale, minScale, minScale * MAX_ZOOM)
    const maxX = (image.width * scale - frame.width) / 2
    const maxY = (image.height * scale - frame.height) / 2
    return { scale, x: clamp(next.x, -maxX, maxX), y: clamp(next.y, -maxY, maxY) }
  }

  // Starts with the whole photo in view where possible.
  const initialScale = image && box ? Math.min(box.width / image.width, box.height / image.height) : 1
  const resolve = (stored: View | null) => fit(stored ?? { scale: initialScale, x: 0, y: 0 })
  const current = resolve(view)

  /** Zooms by `factor` around a point given relative to the viewport's center. */
  const zoomAt = (from: View, point: Point, factor: number): View => {
    const scale = clamp(from.scale * factor, minScale, minScale * MAX_ZOOM)
    const ratio = scale / from.scale
    return { scale, x: point.x - (point.x - from.x) * ratio, y: point.y - (point.y - from.y) * ratio }
  }

  const relativePoint = (event: PointerEvent): Point => {
    const rect = viewportRef.current!.getBoundingClientRect()
    return { x: event.clientX - rect.left - rect.width / 2, y: event.clientY - rect.top - rect.height / 2 }
  }

  const handlePointerDown = (event: PointerEvent) => {
    event.currentTarget.setPointerCapture(event.pointerId)
    pointers.current.set(event.pointerId, relativePoint(event))
  }

  const handlePointerMove = (event: PointerEvent) => {
    const previous = pointers.current.get(event.pointerId)
    if (!previous) return
    const before = [...pointers.current.values()]
    pointers.current.set(event.pointerId, relativePoint(event))
    const after = [...pointers.current.values()]

    // Several moves can arrive before a re-render, so each builds on the latest view, not `current`.
    if (after.length === 1) {
      setView((stored) => {
        const from = resolve(stored)
        return fit({ ...from, x: from.x + after[0].x - before[0].x, y: from.y + after[0].y - before[0].y })
      })
      return
    }
    // Pinch: zoom around the midpoint of the first two fingers and follow it as it moves.
    const mid = (a: Point, b: Point) => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 })
    const distance = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.y - b.y) || 1
    const midBefore = mid(before[0], before[1])
    const midAfter = mid(after[0], after[1])
    const factor = distance(after[0], after[1]) / distance(before[0], before[1])
    setView((stored) => {
      const zoomed = zoomAt(resolve(stored), midBefore, factor)
      return fit({ ...zoomed, x: zoomed.x + midAfter.x - midBefore.x, y: zoomed.y + midAfter.y - midBefore.y })
    })
  }

  const handlePointerUp = (event: PointerEvent) => {
    pointers.current.delete(event.pointerId)
  }

  const finish = async (crop?: CropRect) => {
    setBusy(true)
    setError(null)
    try {
      onDone(await optimizePhoto(photo, undefined, crop))
    } catch {
      setError("Couldn't process that photo")
      setBusy(false)
    }
  }

  // The frame sits in the viewport's center; map its edges back onto the photo's own pixels.
  const cropRect = (): CropRect | undefined => {
    if (!image || !frame) return undefined
    const { scale, x, y } = current
    return {
      x: image.width / 2 + (-frame.width / 2 - x) / scale,
      y: image.height / 2 + (-frame.height / 2 - y) / scale,
      width: frame.width / scale,
      height: frame.height / scale,
    }
  }

  return (
    <Modal title={`Crop ${label} photo`} onClose={onCancel}>
      <div className="photo-cropper">
        <div className="segmented segmented--compact" role="group" aria-label="Frame shape">
          {(['card', 'slab'] as const).map((option) => (
            <button
              key={option}
              type="button"
              className={`segmented__option${shape === option ? ' segmented__option--active' : ''}`}
              aria-pressed={shape === option}
              onClick={() => onShapeChange(option)}
            >
              {option === 'card' ? 'Card' : 'Slab'}
            </button>
          ))}
        </div>

        <div
          ref={viewportRef}
          className="photo-cropper__viewport"
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerCancel={handlePointerUp}
        >
          <img
            src={src}
            alt={`${label} photo`}
            draggable={false}
            onLoad={(event) =>
              setImage({ width: event.currentTarget.naturalWidth, height: event.currentTarget.naturalHeight })
            }
            style={
              image
                ? {
                    width: image.width,
                    height: image.height,
                    transform: `translate(-50%, -50%) translate(${current.x}px, ${current.y}px) scale(${current.scale})`,
                  }
                : { visibility: 'hidden' }
            }
          />
          {frame && <div className="photo-cropper__frame" style={{ width: frame.width, height: frame.height }} />}
        </div>

        <label className="photo-cropper__zoom">
          <span className="muted">Zoom</span>
          <input
            type="range"
            min={1}
            max={MAX_ZOOM}
            step={0.01}
            value={current.scale / minScale}
            onChange={(event) => setView(fit(zoomAt(current, { x: 0, y: 0 }, (Number(event.target.value) * minScale) / current.scale)))}
          />
        </label>
        <p className="muted photo-cropper__hint">Drag and pinch to fit the {shape} inside the frame.</p>

        {error && <p className="form-error">{error}</p>}
        <div className="card-form__actions">
          <button type="button" className="button button--ghost" disabled={busy} onClick={() => finish()}>
            Use full photo
          </button>
          <button type="button" className="button button--primary" disabled={busy || !image} onClick={() => finish(cropRect())}>
            {busy ? 'Cropping…' : 'Crop'}
          </button>
        </div>
      </div>
    </Modal>
  )
}
