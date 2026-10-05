import { useState } from 'react'
import { ApiError, api } from '../api'
import { CameraIcon, EditIcon, GridIcon, SparkleIcon, StarIcon } from '../icons'
import { certFromPhotos } from '../scan'
import type { Card, CardInput, CardList, IdentifiedCard, PhotoValue } from '../types'
import { blobToDataUrl } from '../utils'
import { CardForm } from './CardForm'
import { PhotoCropper } from './PhotoCropper'
import type { CropShape } from './PhotoCropper'
import { PhotoInput } from './PhotoInput'
import { Spinner } from './Spinner'

type AddCardProps = {
  /** The list being added to, or null to ask first (when started from the tab bar). */
  list: CardList | null
  onSaved: (card: Card) => void
  /** Leaves the wishlist form when it was opened straight from the wishlist page. */
  onCancel: () => void
}

type Step = 'choose' | 'scan' | 'busy' | 'form'
type FormPhotos = { front?: PhotoValue; back?: PhotoValue }

const emptyDraft = (list: CardList, certNumber: string | null = null): CardInput => ({
  list,
  isGraded: list === 'collection' || certNumber !== null,
  grader: null,
  certNumber,
  grade: null,
  gradeLabel: null,
  sport: null,
  year: null,
  brand: null,
  cardNumber: null,
  player: '',
  variety: null,
  population: null,
  populationHigher: null,
  notes: null,
  frontImage: null,
  backImage: null,
})

const identifiedToDraft = (card: IdentifiedCard, list: CardList): CardInput => ({
  ...emptyDraft(list, card.certNumber),
  isGraded: card.isGraded,
  grader: card.grader,
  grade: card.grade,
  gradeLabel: card.gradeLabel,
  sport: card.sport,
  year: card.year,
  brand: card.brand,
  cardNumber: card.cardNumber,
  player: card.player ?? '',
  variety: card.variety,
})

const newBlob = (photo: PhotoValue) => (photo?.kind === 'new' ? photo.blob : null)

export function AddCard({ list: initialList, onSaved, onCancel }: AddCardProps) {
  const [list, setList] = useState<CardList | null>(initialList)
  // Wishlist cards skip scanning and photos and go straight to the details form.
  const [step, setStep] = useState<Step>(initialList === 'wishlist' ? 'form' : 'choose')
  const [status, setStatus] = useState('')
  const [notice, setNotice] = useState<string | null>(null)
  const [draft, setDraft] = useState<CardInput>(() => emptyDraft(initialList ?? 'collection'))
  // Photos taken for scanning, and the ones to carry into the form afterwards.
  const [aiFront, setAiFront] = useState<PhotoValue>(null)
  const [aiBack, setAiBack] = useState<PhotoValue>(null)
  const [aiPhotos, setAiPhotos] = useState<FormPhotos | null>(null)
  // A just-taken photo waiting to be cropped, and the frame shape (kept for the next photo).
  const [cropping, setCropping] = useState<{ side: 'front' | 'back'; photo: Blob } | null>(null)
  const [cropShape, setCropShape] = useState<CropShape>('slab')
  // Remounts the form whenever a new draft is loaded so it picks up fresh initial values.
  const [formKey, setFormKey] = useState(0)

  const openForm = (next: CardInput, message: string | null = null) => {
    setDraft(next)
    setNotice(message)
    setFormKey((key) => key + 1)
    setStep('form')
  }

  const chooseList = (next: CardList) => {
    setList(next)
    if (next === 'wishlist') openForm(emptyDraft(next))
    else setDraft(emptyDraft(next))
  }

  const reset = () => {
    setStep('choose')
    setNotice(null)
    setAiFront(null)
    setAiBack(null)
    setAiPhotos(null)
  }

  const identify = async () => {
    const blobs = [newBlob(aiFront), newBlob(aiBack)].filter((blob): blob is Blob => blob !== null)
    if (blobs.length === 0) return
    const photos = { front: aiFront, back: aiBack }
    setNotice(null)
    setStatus('Scanning card…')
    setStep('busy')

    // The AI reads every detail; the QR code or barcode, when one is in a photo, gives the exact cert #.
    const dataUrls = await Promise.all(blobs.map(blobToDataUrl))
    const [identified, scannedCert] = await Promise.all([
      api.identifyCard(dataUrls).then(
        ({ card }): IdentifiedCard | Error => card,
        (err: unknown) => (err instanceof Error ? err : new Error(String(err)))
      ),
      certFromPhotos(blobs),
    ])
    setAiPhotos(photos)

    if (identified instanceof Error) {
      const reason = identified instanceof ApiError ? identified.message : "Couldn't identify the card"
      return openForm(emptyDraft(draft.list, scannedCert), `${reason.replace(/\.?$/, '.')} Enter the details below.`)
    }
    const fromAi = identifiedToDraft(identified, draft.list)
    openForm(scannedCert ? { ...fromAi, isGraded: true, certNumber: scannedCert } : fromAi)
  }

  const save = async (input: CardInput) => {
    const { card } = await api.createCard(input)
    reset()
    onSaved(card)
  }

  // Cancelling the wishlist form goes back to wherever the flow started.
  const cancelForm = () => {
    if (draft.list !== 'wishlist') return reset()
    if (initialList) return onCancel()
    setList(null)
    reset()
  }

  if (list === null) {
    return (
      <section className="add-card">
        <h1 className="page-title">Add a card</h1>
        <div className="add-card__options add-card__options--lists">
          <button type="button" className="option-card" onClick={() => chooseList('collection')}>
            <GridIcon />
            <span className="option-card__title">Add to Collection</span>
            <span className="option-card__hint">Scan or photograph a card you own</span>
          </button>
          <button type="button" className="option-card" onClick={() => chooseList('wishlist')}>
            <StarIcon />
            <span className="option-card__title">Add to Wishlist</span>
            <span className="option-card__hint">Enter the details of a card you're after</span>
          </button>
        </div>
      </section>
    )
  }

  if (step === 'form') {
    return (
      <section className="add-card">
        <h1 className="page-title">Card details</h1>
        {notice && <p className="notice">{notice}</p>}
        <CardForm
          key={formKey}
          initial={draft}
          initialPhotos={aiPhotos ?? undefined}
          submitLabel={`Add to ${draft.list}`}
          onSave={save}
          onCancel={cancelForm}
          hideDerivedFields
          hideListPicker
          hidePhotos={draft.list === 'wishlist'}
        />
      </section>
    )
  }

  return (
    <section className={`add-card${step === 'busy' ? ' add-card--busy' : ''}`}>
      <div className="add-card__header">
        <h1 className="page-title">Add to collection</h1>

        {notice && <p className="notice">{notice}</p>}
      </div>

      {step === 'busy' && (
        <div className="add-card__busy">
          <Spinner label={status} />
          <p>{status}</p>
        </div>
      )}

      {step === 'scan' && (
        <div className="ai-identify">
          <p className="muted">
            Take a photo of the front, and the back if you can. For slabs, make sure the label is in focus.
          </p>
          <div className="card-form__photos">
            <PhotoInput
              label="Front"
              value={aiFront}
              onChange={setAiFront}
              onOriginal={(photo) => setCropping({ side: 'front', photo })}
            />
            <PhotoInput
              label="Back (optional)"
              value={aiBack}
              onChange={setAiBack}
              onOriginal={(photo) => setCropping({ side: 'back', photo })}
            />
          </div>
          <div className="card-form__actions">
            <button type="button" className="button button--ghost" onClick={() => setStep('choose')}>
              Cancel
            </button>
            <button type="button" className="button button--primary" disabled={!aiFront} onClick={identify}>
              <SparkleIcon /> Scan card
            </button>
          </div>
          {cropping && (
            <PhotoCropper
              key={cropping.side}
              label={cropping.side}
              photo={cropping.photo}
              shape={cropShape}
              onShapeChange={setCropShape}
              onDone={(blob) => {
                const value = { kind: 'new' as const, blob, src: URL.createObjectURL(blob) }
                if (cropping.side === 'front') setAiFront(value)
                else setAiBack(value)
                setCropping(null)
              }}
              onCancel={() => setCropping(null)}
            />
          )}
        </div>
      )}

      {step === 'choose' && (
        <div className="add-card__options">
          <button type="button" className="option-card" onClick={() => setStep('scan')}>
            <CameraIcon />
            <span className="option-card__title">Scan card</span>
            <span className="option-card__hint">Photograph any card, raw or graded</span>
          </button>
          <button type="button" className="option-card" onClick={() => openForm(emptyDraft(draft.list))}>
            <EditIcon />
            <span className="option-card__title">Enter manually</span>
            <span className="option-card__hint">Add the card's details manually</span>
          </button>
        </div>
      )}
    </section>
  )
}
