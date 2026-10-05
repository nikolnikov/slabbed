import { useRef, useState } from 'react'
import type { PointerEvent } from 'react'

const LOUPE_SIZE = 150 // px, matches .loupe in App.scss
const ZOOM = 2.5
// Movement (px) under which a press counts as a tap rather than a drag.
const TAP_SLOP = 6

type LoupeView = {
  left: number
  top: number
  backgroundSize: string
  backgroundPosition: string
}

type ZoomableImageProps = {
  src: string
  alt: string
}

/**
 * An image with a loupe: tap or click a spot to magnify it, drag (touch) or move the mouse to look
 * around, and tap/click again or leave the image to put it away.
 */
export function ZoomableImage({ src, alt }: ZoomableImageProps) {
  const [loupe, setLoupe] = useState<LoupeView | null>(null)
  const press = useRef<{ x: number; y: number; moved: boolean; wasOpen: boolean } | null>(null)

  // Places the loupe over the point under the pointer. The image is letterboxed (object-fit:
  // contain), so map the point onto the photo itself and keep it within the photo's edges.
  const viewAt = (event: PointerEvent<HTMLImageElement>): LoupeView => {
    const img = event.currentTarget
    const rect = img.getBoundingClientRect()
    const scale = Math.min(rect.width / img.naturalWidth, rect.height / img.naturalHeight)
    const width = img.naturalWidth * scale
    const height = img.naturalHeight * scale
    const offsetX = (rect.width - width) / 2
    const offsetY = (rect.height - height) / 2
    const x = Math.min(Math.max(event.clientX - rect.left, offsetX), offsetX + width)
    const y = Math.min(Math.max(event.clientY - rect.top, offsetY), offsetY + height)

    // A finger would cover a loupe centered under it, so lift it above (or below, near the top).
    const lift = event.pointerType === 'mouse' ? 0 : LOUPE_SIZE * 0.75
    const centerY = y - lift >= LOUPE_SIZE / 2 ? y - lift : y + lift
    return {
      left: x - LOUPE_SIZE / 2,
      top: centerY - LOUPE_SIZE / 2,
      backgroundSize: `${width * ZOOM}px ${height * ZOOM}px`,
      backgroundPosition: `${LOUPE_SIZE / 2 - (x - offsetX) * ZOOM}px ${LOUPE_SIZE / 2 - (y - offsetY) * ZOOM}px`,
    }
  }

  const handlePointerDown = (event: PointerEvent<HTMLImageElement>) => {
    if (!event.currentTarget.naturalWidth) return
    event.currentTarget.setPointerCapture(event.pointerId)
    press.current = { x: event.clientX, y: event.clientY, moved: false, wasOpen: loupe !== null }
    setLoupe(viewAt(event))
  }

  const handlePointerMove = (event: PointerEvent<HTMLImageElement>) => {
    const current = press.current
    if (current && Math.hypot(event.clientX - current.x, event.clientY - current.y) > TAP_SLOP) current.moved = true
    // Touch moves the loupe while pressed; a mouse moves it whenever it's open.
    if (current || (loupe && event.pointerType === 'mouse')) setLoupe(viewAt(event))
  }

  const handlePointerUp = () => {
    const current = press.current
    press.current = null
    // A tap on an open loupe puts it away; a drag or the tap that opened it leaves it open.
    if (current?.wasOpen && !current.moved) setLoupe(null)
  }

  return (
    <>
      <img
        src={src}
        alt={alt}
        draggable={false}
        className={`zoomable${loupe ? ' zoomable--zoomed' : ''}`}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
        onPointerLeave={(event) => event.pointerType === 'mouse' && !press.current && setLoupe(null)}
      />
      {loupe && <div className="loupe" style={{ ...loupe, backgroundImage: `url("${src}")` }} aria-hidden="true" />}
    </>
  )
}
