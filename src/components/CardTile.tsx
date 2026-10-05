import { imageUrl } from '../api'
import type { Card } from '../types'
import { cardSubtitle, formatGrade, gradeBadgeClass } from '../utils'

type CardTileProps = {
  card: Card
  onOpen: (card: Card) => void
}

export function CardTile({ card, onOpen }: CardTileProps) {
  const front = imageUrl(card.frontImage)
  return (
    <button type="button" className="card-tile" onClick={() => onOpen(card)}>
      <div className="card-tile__image">
        {front ? <img src={front} alt="" loading="lazy" decoding="async" /> : <span className="card-tile__placeholder">No photo</span>}
        {/* Wishlist cards aren't owned yet, so "Raw" says nothing about them. */}
        {(card.isGraded || card.list !== 'wishlist') && (
          <span className={gradeBadgeClass(card)}>
            {formatGrade(card)}
          </span>
        )}
      </div>
      <div className="card-tile__info">
        <span className="card-tile__player">{card.player}</span>
        <span className="card-tile__meta">{cardSubtitle(card) || card.sport || ' '}</span>
      </div>
    </button>
  )
}
