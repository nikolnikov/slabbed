import { useState } from 'react'
import { ApiError, api, imageUrl } from '../api'
import { FlipIcon } from '../icons'
import type { Card, CardInput } from '../types'
import { formatGrade, gradeBadgeClass, optimizePhoto, photoSearchQuery } from '../utils'
import { Modal } from './Modal'
import { PhotoSearch } from './PhotoSearch'
import { ZoomableImage } from './ZoomableImage'

type CardDetailProps = {
  card: Card
  onClose: () => void
  /** Omitted when viewing someone else's shared cards. */
  onUpdated?: (card: Card) => void
  onDeleted?: (id: string) => void
  /** Opens the full-page edit form. */
  onEdit?: () => void
}

export function CardDetail({ card, onClose, onUpdated, onDeleted, onEdit }: CardDetailProps) {
  const [side, setSide] = useState<'front' | 'back'>('front')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [findingPhoto, setFindingPhoto] = useState(false)
  const readOnly = !onUpdated

  const front = imageUrl(card.frontImage)
  const back = imageUrl(card.backImage)
  const shown = side === 'back' && back ? back : (front ?? back)

  const save = async (input: CardInput) => {
    const { card: updated } = await api.updateCard(card.id, input)
    onUpdated?.(updated)
  }

  const run = async (action: () => Promise<void>) => {
    setError(null)
    setBusy(true)
    try {
      await action()
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Something went wrong')
    } finally {
      setBusy(false)
    }
  }

  const moveToCollection = () => run(() => save({ ...card, list: 'collection' }))

  const addFoundPhoto = (url: string) => {
    setFindingPhoto(false)
    return run(async () => {
      const optimized = await optimizePhoto(await api.fetchRemoteImage(url))
      const { key } = await api.uploadImage(optimized)
      await save({ ...card, frontImage: key })
    })
  }

  const remove = () => {
    if (!window.confirm(`Delete ${card.player} from your ${card.list}?`)) return
    return run(async () => {
      await api.deleteCard(card.id)
      onDeleted?.(card.id)
    })
  }

  const details: [string, string | number | null][] = [
    ['Player / Subject', card.player],
    ['Year', card.year],
    ['Brand / Set', card.brand],
    ['Card #', card.cardNumber],
    ['Variant', card.variety],
    // Wishlist cards aren't owned yet, so there's no grade to show.
    ['Grade', card.list === 'wishlist' ? null : card.isGraded ? card.gradeLabel ?? card.grade : 'Ungraded'],
    ['Cert #', card.certNumber],
    ['PSA population', card.population],
    ['Pop. higher', card.populationHigher],
  ]

  return (
    <Modal
      title={card.player}
      // Wishlist cards aren't owned yet, so only collection cards lead with their grade.
      titleBadge={
        card.list === 'wishlist' ? undefined : (
          <span className={`${gradeBadgeClass(card)} grade-badge--inline`}>
            {formatGrade(card)}
          </span>
        )
      }
      onClose={onClose}
    >
      {findingPhoto ? (
        <PhotoSearch initialQuery={photoSearchQuery(card)} onPick={addFoundPhoto} onCancel={() => setFindingPhoto(false)} />
      ) : (
        <div className="card-detail">
          <div className="card-detail__media">
            {shown ? (
              // Keyed by photo so flipping to the other side closes the loupe.
              <ZoomableImage key={shown} src={shown} alt={`${card.player} ${side}`} />
            ) : (
              <div className="card-detail__no-photo">
                <span className="card-tile__placeholder">{busy ? 'Adding photo…' : 'No photo'}</span>
                {!readOnly && !busy && (
                  <button type="button" className="button button--small" onClick={() => setFindingPhoto(true)}>
                    Find a photo
                  </button>
                )}
              </div>
            )}
            {front && back && (
              <button type="button" className="button button--small card-detail__flip" onClick={() => setSide(side === 'front' ? 'back' : 'front')}>
                <FlipIcon /> Flip
              </button>
            )}
          </div>

          <div className="card-detail__info">
            <dl className="details">
              {details
                .filter(([, value]) => value !== null && value !== '')
                .map(([label, value]) => (
                  <div key={label} className="details__row">
                    <dt>{label}</dt>
                    <dd>{value}</dd>
                  </div>
                ))}
            </dl>
            {card.notes && <p className="card-detail__notes">{card.notes}</p>}

            {error && <p className="notice notice--error" role="alert">{error}</p>}
            {!readOnly && (
              <div className="card-detail__actions">
                {card.list === 'wishlist' && (
                  <button type="button" className="button button--primary" disabled={busy} onClick={moveToCollection}>
                    Got it!
                  </button>
                )}
                {onEdit && (
                  <button type="button" className="button" disabled={busy} onClick={onEdit}>
                    Edit
                  </button>
                )}
                <button type="button" className="button button--danger" disabled={busy} onClick={remove}>
                  Delete
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </Modal>
  )
}
