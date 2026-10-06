import { useEffect, useRef } from 'react'
import { imageUrl, thumbUrl } from '../api'
import type { Card } from '../types'
import { cardSubtitle, formatGrade, gradeBadgeClass, preloadImages } from '../utils'

// How long the pointer must rest on a tile before its full photos start downloading, so sweeping
// the mouse across the grid doesn't queue photos for cards that aren't opened.
const HOVER_INTENT_MS = 150

type CardTileProps = {
  card: Card
  onOpen: (card: Card) => void
}

export function CardTile({ card, onOpen }: CardTileProps) {
  const thumb = thumbUrl(card.frontImage)
  const hoverTimer = useRef<number | undefined>(undefined)

  // Downloads the full photos ahead of opening the card, so the card view usually has them ready.
  const warmFullPhotos = () => {
    window.clearTimeout(hoverTimer.current)
    preloadImages([imageUrl(card.frontImage), imageUrl(card.backImage)].filter((url): url is string => url !== null))
  }
  const startHover = () => {
    window.clearTimeout(hoverTimer.current)
    hoverTimer.current = window.setTimeout(warmFullPhotos, HOVER_INTENT_MS)
  }
  const endHover = () => window.clearTimeout(hoverTimer.current)

  useEffect(() => () => window.clearTimeout(hoverTimer.current), [])

  return (
    <button
      type="button"
      className="card-tile"
      // Mouse: after a short pause on the tile. Touch or click: right away.
      onPointerEnter={(event) => event.pointerType === 'mouse' && startHover()}
      onPointerLeave={endHover}
      onPointerDown={warmFullPhotos}
      onClick={() => onOpen(card)}
    >
      <div className="card-tile__image">
        {thumb ? <img src={thumb} alt="" loading="lazy" decoding="async" /> : <span className="card-tile__placeholder">No photo</span>}
        {/* Wishlist cards aren't owned yet, so "Raw" says nothing about them. */}
        {(card.isGraded || card.list !== 'wishlist') && (
          <span className={gradeBadgeClass(card)}>
            {formatGrade(card)}
          </span>
        )}
      </div>
      <div className="card-tile__info">
        <span className="card-tile__player">{card.player}</span>
        <span className="card-tile__meta">{cardSubtitle(card) || card.sport || ' '}</span>
      </div>
    </button>
  )
}
