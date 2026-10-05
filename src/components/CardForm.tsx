import { useState } from 'react'
import type { FormEvent } from 'react'
import { ApiError, api, imageUrl } from '../api'
import type { CardInput, CardList, PhotoValue } from '../types'
import { optimizePhoto, photoSearchQuery } from '../utils'
import { Modal } from './Modal'
import { PhotoInput } from './PhotoInput'
import { PhotoSearch } from './PhotoSearch'

type CardFormProps = {
  initial: CardInput
  /** Overrides the photos derived from `initial`, e.g. the label photo taken while scanning. */
  initialPhotos?: { front?: PhotoValue; back?: PhotoValue }
  submitLabel: string
  onSave: (input: CardInput) => Promise<void>
  onCancel?: () => void
  /** Hides the Grade label input (used when adding, where the AI fills it in). Its value is still saved. */
  hideDerivedFields?: boolean
  /** Hides the Collection/Wishlist switch when the list was already chosen. */
  hideListPicker?: boolean
  /** Hides the front/back photo inputs (wishlist cards are added without photos). */
  hidePhotos?: boolean
}

type FormValues = {
  list: CardList
  certNumber: string
  grade: string
  gradeLabel: string
  player: string
  year: string
  brand: string
  cardNumber: string
  sport: string
  variety: string
  notes: string
}

/** Image refs are R2 keys for stored photos, or https URLs for found photos not yet imported. */
const refToPhoto = (ref: string | null): PhotoValue =>
  ref ? { kind: 'stored', ref, src: ref.startsWith('https://') ? ref : imageUrl(ref)! } : null

const toValues = (card: CardInput): FormValues => ({
  list: card.list,
  certNumber: card.certNumber ?? '',
  grade: card.grade?.toString() ?? '',
  gradeLabel: card.gradeLabel ?? '',
  player: card.player,
  year: card.year ?? '',
  brand: card.brand ?? '',
  cardNumber: card.cardNumber ?? '',
  sport: card.sport ?? '',
  variety: card.variety ?? '',
  notes: card.notes ?? '',
})

/** Returns the photo's R2 key, uploading it first if needed. Every upload is WebP-optimized. */
const uploadPhoto = async (photo: PhotoValue): Promise<string | null> => {
  if (!photo) return null
  if (photo.kind === 'new') return (await api.uploadImage(photo.blob)).key
  if (!photo.ref.startsWith('https://')) return photo.ref
  // A photo picked from search results: pull it through the Worker and re-encode it like any other.
  const optimized = await optimizePhoto(await api.fetchRemoteImage(photo.ref))
  return (await api.uploadImage(optimized)).key
}

const orNull = (value: string) => value.trim() || null

export function CardForm({
  initial,
  initialPhotos,
  submitLabel,
  onSave,
  onCancel,
  hideDerivedFields = false,
  hideListPicker = false,
  hidePhotos = false,
}: CardFormProps) {
  const [values, setValues] = useState(() => toValues(initial))
  const [front, setFront] = useState<PhotoValue>(() => initialPhotos?.front ?? refToPhoto(initial.frontImage))
  const [back, setBack] = useState<PhotoValue>(() => initialPhotos?.back ?? refToPhoto(initial.backImage))
  const [submitting, setSubmitting] = useState(false)
  const [findingPhoto, setFindingPhoto] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const set = <K extends keyof FormValues>(key: K, value: FormValues[K]) =>
    setValues((prev) => ({ ...prev, [key]: value }))

  const field = (key: Exclude<keyof FormValues, 'list'>) => ({
    value: values[key],
    onChange: (event: { target: { value: string } }) => set(key, event.target.value),
  })

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault()
    setError(null)
    setSubmitting(true)
    try {
      const [frontImage, backImage] = await Promise.all([uploadPhoto(front), uploadPhoto(back)])
      const parsedGrade = values.grade ? Number(values.grade) : null
      const grade = parsedGrade !== null && Number.isFinite(parsedGrade) ? parsedGrade : null
      const certNumber = orNull(values.certNumber)
      const gradeLabel = orNull(values.gradeLabel)
      await onSave({
        ...initial,
        list: values.list,
        // No graded checkbox: a card counts as graded when it has any grading details.
        isGraded: certNumber !== null || grade !== null || gradeLabel !== null,
        certNumber,
        grade,
        gradeLabel,
        player: values.player.trim(),
        year: orNull(values.year),
        brand: orNull(values.brand),
        cardNumber: orNull(values.cardNumber),
        sport: orNull(values.sport),
        variety: orNull(values.variety),
        notes: orNull(values.notes),
        frontImage,
        backImage,
      })
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Something went wrong saving the card')
      setSubmitting(false)
    }
  }

  return (
    <form className="card-form" onSubmit={handleSubmit}>
      {!hideListPicker && (
        <div className="segmented" role="group" aria-label="Save to">
          {(['collection', 'wishlist'] as const).map((list) => (
            <button
              key={list}
              type="button"
              className={`segmented__option${values.list === list ? ' segmented__option--active' : ''}`}
              aria-pressed={values.list === list}
              onClick={() => set('list', list)}
            >
              {list === 'collection' ? 'Collection' : 'Wishlist'}
            </button>
          ))}
        </div>
      )}

      {!hidePhotos && (
        <div>
          <div className="card-form__photos">
            <PhotoInput label="Front" value={front} onChange={setFront} />
            <PhotoInput label="Back" value={back} onChange={setBack} />
          </div>
          {!front && (
            <button type="button" className="button button--small" onClick={() => setFindingPhoto(true)}>
              Find a photo online
            </button>
          )}
        </div>
      )}
      {findingPhoto && (
        <Modal title="Find a photo" onClose={() => setFindingPhoto(false)}>
          <PhotoSearch
            initialQuery={photoSearchQuery({
              year: orNull(values.year),
              brand: orNull(values.brand),
              player: values.player.trim(),
              cardNumber: orNull(values.cardNumber),
              variety: orNull(values.variety),
              isGraded: values.grade !== '',
              grade: values.grade ? Number(values.grade) : null,
            })}
            onPick={(url) => {
              setFront({ kind: 'stored', ref: url, src: url })
              setFindingPhoto(false)
            }}
            onCancel={() => setFindingPhoto(false)}
          />
        </Modal>
      )}

      {/* Wishlist cards aren't owned yet, so they have no cert or grade. */}
      {values.list !== 'wishlist' && (
        <div className="card-form__row">
          <label className="field">
            <span className="field__label">Cert #</span>
            <input className="field__input" inputMode="numeric" pattern="\d*" {...field('certNumber')} />
          </label>
          <label className="field field--narrow">
            <span className="field__label">Grade</span>
            <input className="field__input" type="number" min="1" max="10" step="0.5" {...field('grade')} />
          </label>
        </div>
      )}
      {!hideDerivedFields && values.list !== 'wishlist' && (
        <label className="field">
          <span className="field__label">Grade label</span>
          <input className="field__input" placeholder="e.g. GEM MT 10" {...field('gradeLabel')} />
        </label>
      )}

      <div className="card-form__row">
        <label className="field">
          <span className="field__label">Player / subject *</span>
          <input className="field__input" required {...field('player')} />
        </label>
        <label className="field field--narrow">
          <span className="field__label">Card #</span>
          <input className="field__input" {...field('cardNumber')} />
        </label>
      </div>
      <div className="card-form__row">
        <label className="field field--narrow">
          <span className="field__label">Year</span>
          <input className="field__input" {...field('year')} />
        </label>
        <label className="field">
          <span className="field__label">Brand / set</span>
          <input className="field__input" {...field('brand')} />
        </label>
      </div>
      <label className="field">
        <span className="field__label">Variant</span>
        <input className="field__input" {...field('variety')} />
      </label>
      <label className="field">
        <span className="field__label">Notes</span>
        <textarea className="field__input" rows={3} {...field('notes')} />
      </label>

      {error && <p className="notice notice--error notice--flush" role="alert">{error}</p>}
      <div className="card-form__actions">
        {onCancel && (
          <button type="button" className="button button--ghost" onClick={onCancel} disabled={submitting}>
            Cancel
          </button>
        )}
        <button type="submit" className="button button--primary" disabled={submitting}>
          {submitting ? 'Saving…' : submitLabel}
        </button>
      </div>
    </form>
  )
}
