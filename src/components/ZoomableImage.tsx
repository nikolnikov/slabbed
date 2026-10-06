import { useRef, useState } from 'react'
import type { PointerEvent } from 'react'

const LOUPE_SIZE = 150 // px, matches .loupe in App.scss
const ZOOM = 2.5
// Movement (px) under which a press counts as a tap rather than a drag.
const TAP_SLOP = 6
// Touch: tapping within this distance (px) of the magnified spot puts the loupe away.
const REPEAT_TAP_RADIUS = 30

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
 * An image with a loupe. Mouse: click a spot to magnify it, move to look around, click again or
 * leave the image to put it away. Touch: tap each spot to magnify, tap the same spot to put it away.
 */
export function ZoomableImage({ src, alt }: ZoomableImageProps) {
  const [loupe, setLoupe] = useState<LoupeView | null>(null)
  // Touch: where the last tap landed (relative to the image), to spot a repeat tap that closes.
  const lastTap = useRef<{ x: number; y: number } | null>(null)
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

    // Centered on the spot (taps lift the finger, so nothing covers it).
    const centerY = y
    return {
      left: x - LOUPE_SIZE / 2,
      top: centerY - LOUPE_SIZE / 2,
      backgroundSize: `${width * ZOOM}px ${height * ZOOM}px`,
      backgroundPosition: `${LOUPE_SIZE / 2 - (x - offsetX) * ZOOM}px ${LOUPE_SIZE / 2 - (y - offsetY) * ZOOM}px`,
    }
  }

  // Mouse: press to open the loupe, move to look around, click again to put it away.
  // Touch: no dragging (it was unreliable on phones). Each tap magnifies the tapped spot; tapping
  // the same spot again puts the loupe away, and swipes are left to scroll the page.
  const handlePointerDown = (event: PointerEvent<HTMLImageElement>) => {
    if (!event.currentTarget.naturalWidth) return
    press.current = { x: event.clientX, y: event.clientY, moved: false, wasOpen: loupe !== null }
    if (event.pointerType !== 'mouse') return
    event.currentTarget.setPointerCapture(event.pointerId)
    setLoupe(viewAt(event))
  }

  const handlePointerMove = (event: PointerEvent<HTMLImageElement>) => {
    const current = press.current
    if (current && Math.hypot(event.clientX - current.x, event.clientY - current.y) > TAP_SLOP) current.moved = true
    // Only a mouse moves the loupe, whenever it's open.
    if (event.pointerType === 'mouse' && (current || loupe)) setLoupe(viewAt(event))
  }

  const handlePointerUp = (event: PointerEvent<HTMLImageElement>) => {
    const current = press.current
    press.current = null
    if (!current) return
    if (event.pointerType === 'mouse') {
      // A click on an open loupe puts it away; a drag or the click that opened it leaves it open.
      if (current.wasOpen && !current.moved) setLoupe(null)
      return
    }
    if (current.moved || !event.currentTarget.naturalWidth) return // a swipe, not a tap
    const rect = event.currentTarget.getBoundingClientRect()
    const point = { x: event.clientX - rect.left, y: event.clientY - rect.top }
    const last = lastTap.current
    if (loupe && last && Math.hypot(point.x - last.x, point.y - last.y) < REPEAT_TAP_RADIUS) {
      lastTap.current = null
      setLoupe(null)
      return
    }
    lastTap.current = point
    setLoupe(viewAt(event))
  }

  const cancelPress = () => {
    press.current = null
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
        onPointerCancel={cancelPress}
        onPointerLeave={(event) => event.pointerType === 'mouse' && !press.current && setLoupe(null)}
      />
      {loupe && <div className="loupe" style={{ ...loupe, backgroundImage: `url("${src}")` }} aria-hidden="true" />}
    </>
  )
}
