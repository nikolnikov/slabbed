import { useEffect, useState } from 'react'
import { ApiError, api, imageUrl, thumbUrl, uploadCardPhoto } from '../api'
import noCard from '../assets/no-card.webp'
import { FlipIcon } from '../icons'
import type { Card, CardInput } from '../types'
import { formatGrade, gradeBadgeClass, photoSearchQueries, preloadImages } from '../utils'
import { Modal } from './Modal'
import { PhotoCropper } from './PhotoCropper'
import type { CropShape } from './PhotoCropper'
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
  const [cropPhoto, setCropPhoto] = useState<Blob | null>(null)
  const [cropShape, setCropShape] = useState<CropShape>('slab')
  const readOnly = !onUpdated

  const front = imageUrl(card.frontImage)
  const back = imageUrl(card.backImage)
  // Full photos that have finished downloading. Until one has, its (already cached) tile
  // thumbnail stands in, so the view opens instantly and sharpens when the full photo lands.
  const [fullLoaded, setFullLoaded] = useState<ReadonlySet<string>>(() => new Set())

  useEffect(() => {
    let current = true
    for (const url of [front, back]) {
      if (!url) continue
      preloadImages([url], 30_000).then(() => {
        if (current) setFullLoaded((previous) => new Set(previous).add(url))
      })
    }
    return () => {
      current = false
    }
  }, [front, back])

  const showBack = side === 'back' && back !== null
  const shownFull = showBack ? back : (front ?? back)
  const shownThumb = showBack ? thumbUrl(card.backImage) : front ? thumbUrl(card.frontImage) : thumbUrl(card.backImage)
  const shown = shownFull && fullLoaded.has(shownFull) ? shownFull : shownThumb
  // The side not on screen, loaded by a hidden image so flipping to it is instant.
  const otherFull = showBack ? front : back
  const otherThumb = showBack ? thumbUrl(card.frontImage) : thumbUrl(card.backImage)
  const other = front && back ? (otherFull && fullLoaded.has(otherFull) ? otherFull : otherThumb) : null

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

  // A found photo is downloaded, then cropped (or used whole) before it's saved.
  const downloadFoundPhoto = (url: string) => {
    setFindingPhoto(false)
    return run(async () => setCropPhoto(await api.fetchRemoteImage(url)))
  }

  const saveCroppedPhoto = (photo: Blob) => {
    setCropPhoto(null)
    return run(async () => {
      const key = await uploadCardPhoto(photo)
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
    ['Pop', card.population],
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
        <PhotoSearch queries={photoSearchQueries(card)} onPick={downloadFoundPhoto} onCancel={() => setFindingPhoto(false)} />
      ) : cropPhoto ? (
        <PhotoCropper
          bare
          label="front"
          photo={cropPhoto}
          shape={cropShape}
          onShapeChange={setCropShape}
          onDone={saveCroppedPhoto}
          onCancel={() => setCropPhoto(null)}
        />
      ) : (
        <div className="card-detail">
          <div className="card-detail__media">
            {shown ? (
              // Keyed by photo so flipping to the other side closes the loupe.
              <ZoomableImage key={shown} src={shown} alt={`${card.player} ${side}`} />
            ) : (
              <>
                <img className="no-card" src={noCard} alt="No photo" />
                <div className="card-detail__no-photo">
                  {busy && <span className="card-tile__placeholder">Adding photo…</span>}
                  {!readOnly && !busy && (
                    <button type="button" className="button button--small" onClick={() => setFindingPhoto(true)}>
                      Find a photo
                    </button>
                  )}
                </div>
              </>
            )}
            {other && <img className="card-detail__preload" src={other} alt="" aria-hidden="true" />}
            {front && back && (
              <button type="button" className="button button--small card-detail__flip" onClick={() => setSide(side === 'front' ? 'back' : 'front')}>
                <FlipIcon /> Flip
              </button>
            )}
            {/* Only the back is left: offer a search for a new front. */}
            {!front && back && !readOnly && (
              <button
                type="button"
                className="button button--small card-detail__find-front"
                disabled={busy}
                onClick={() => setFindingPhoto(true)}
              >
                {busy ? 'Adding photo…' : 'Find front photo'}
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
            {card.notes && (
              <section className="section-box card-detail__notes" aria-labelledby="card-notes-heading">
                <h3 id="card-notes-heading" className="field__label">
                  Notes
                </h3>
                <p>{card.notes}</p>
              </section>
            )}

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
