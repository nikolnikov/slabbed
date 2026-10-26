import { useState } from 'react'
import type { FormEvent } from 'react'
import { ApiError, api } from '../api'
import { CameraIcon, EditIcon, GridIcon, LinkIcon, SearchIcon, SparkleIcon, StarIcon } from '../icons'
import { certFromPhotos } from '../scan'
import type { Card, CardInput, CardList, IdentifiedCard, ListingDetails, PhotoResult, PhotoValue } from '../types'
import { blobToDataUrl } from '../utils'
import { CardForm } from './CardForm'
import { PhotoCropper } from './PhotoCropper'
import type { CropShape } from './PhotoCropper'
import { PhotoInput } from './PhotoInput'
import { Spinner } from './Spinner'
import { WishlistSearch } from './WishlistSearch'
import type { CardSearchFields } from './WishlistSearch'

type AddCardProps = {
  /** The list being added to, or null to ask first (when started from the tab bar). */
  list: CardList | null
  onSaved: (card: Card) => void
  /** Leaves the wishlist form when it was opened straight from the wishlist page. */
  onCancel: () => void
}

type Step = 'choose' | 'scan' | 'search' | 'link' | 'busy' | 'form'
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
  // Collection: scan or enter manually. Wishlist: search for the card or enter manually.
  const [step, setStep] = useState<Step>('choose')
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
  // A wishlist card picked from the search: its listing photo, opened in the crop screen.
  const [fromSearch, setFromSearch] = useState(false)
  const [linkInput, setLinkInput] = useState('')
  const [searchPhoto, setSearchPhoto] = useState<Blob | null>(null)
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
    setDraft(emptyDraft(next))
  }

  const reset = () => {
    setStep('choose')
    setNotice(null)
    setAiFront(null)
    setAiBack(null)
    setAiPhotos(null)
    setFromSearch(false)
    setSearchPhoto(null)
    setLinkInput('')
  }

  // Opens the form for a card found on eBay (search pick or pasted link), with its photo for
  // cropping. Anything the listing doesn't say comes from what was typed in the search, if any.
  const openFromListing = (card: ListingDetails | null, photo: Blob | null, typed?: CardSearchFields) => {
    const orTyped = (value: string | null | undefined, typedValue = '') => value ?? (typedValue.trim() || null)
    setFromSearch(true)
    setSearchPhoto(photo)
    openForm(
      {
        ...emptyDraft('wishlist'),
        player: card?.player || typed?.player.trim() || '',
        year: orTyped(card?.year, typed?.year),
        brand: orTyped(card?.brand, typed?.brand),
        variety: orTyped(card?.variety, typed?.variety),
        cardNumber: orTyped(card?.cardNumber, typed?.cardNumber),
        sport: card?.sport ?? null,
        // A wishlist card isn't owned yet, so a listing's grade and cert never apply.
        isGraded: false,
      },
      card ? null : "Couldn't read all of that listing, so check the details below."
    )
  }

  // A search result: read its title into card details and download its photo.
  const pickListing = async (result: PhotoResult, typed: CardSearchFields) => {
    setNotice(null)
    setStatus('Reading the listing…')
    setStep('busy')
    const [card, photo] = await Promise.all([
      api.parseListing(result.title).then(({ card }) => card, () => null),
      api.fetchRemoteImage(result.imageUrl).catch(() => null),
    ])
    openFromListing(card, photo, typed)
  }

  // A pasted eBay link: look the listing up, then download its photo.
  const lookUpLink = async (event: FormEvent) => {
    event.preventDefault()
    setNotice(null)
    setStatus('Looking up the listing…')
    setStep('busy')
    try {
      const { card, imageUrl } = await api.ebayListing(linkInput)
      const photo = imageUrl ? await api.fetchRemoteImage(imageUrl).catch(() => null) : null
      openFromListing(card, photo)
    } catch (err) {
      setNotice(err instanceof ApiError ? err.message : "Couldn't look up that listing")
      setStep('link')
    }
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

  // Cancelling the form goes back to the ways of adding a card.
  const cancelForm = () => reset()

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
          initialCrop={searchPhoto ?? undefined}
          submitLabel={`Add to ${draft.list}`}
          onSave={save}
          onCancel={cancelForm}
          hideDerivedFields
          hideListPicker
          // Wishlist cards are entered without photos, unless one came with a searched card.
          hidePhotos={draft.list === 'wishlist' && !fromSearch}
        />
      </section>
    )
  }

  return (
    <section className={`add-card${step === 'busy' ? ' add-card--busy' : ''}`}>
      <div className="add-card__header">
        <h1 className="page-title">Add to {list}</h1>

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

      {step === 'search' && <WishlistSearch onPick={pickListing} onCancel={() => setStep('choose')} />}

      {step === 'link' && (
        <form className="card-form" onSubmit={lookUpLink}>
          <label className="field">
            <span className="field__label">eBay listing link</span>
            <input
              className="field__input"
              // Plain text so a bare item number is accepted too; inputMode still brings up the URL keyboard.
              type="text"
              inputMode="url"
              autoCapitalize="off"
              autoCorrect="off"
              placeholder="https://www.ebay.com/itm/…"
              value={linkInput}
              onChange={(event) => setLinkInput(event.target.value)}
              required
              autoFocus
            />
          </label>
          <p className="muted add-card__link-hint">Paste a listing's link (or its item number) and the card is filled in from it.</p>
          <div className="card-form__actions">
            <button
              type="button"
              className="button button--ghost"
              onClick={() => {
                setNotice(null)
                setStep('choose')
              }}
            >
              Cancel
            </button>
            <button type="submit" className="button button--primary" disabled={!linkInput.trim()}>
              Find card
            </button>
          </div>
        </form>
      )}

      {step === 'choose' && (
        <div className={`add-card__options${list === 'wishlist' ? ' add-card__options--three' : ''}`}>
          {list === 'wishlist' ? (
            <>
              <button type="button" className="option-card" onClick={() => setStep('search')}>
                <SearchIcon />
                <span className="option-card__title">Search for a card</span>
                <span className="option-card__hint">Find it by player, year, set, variant, and number</span>
              </button>
              <button type="button" className="option-card" onClick={() => setStep('link')}>
                <LinkIcon />
                <span className="option-card__title">Paste an eBay link</span>
                <span className="option-card__hint">Fill in the card from a listing you found</span>
              </button>
            </>
          ) : (
            <button type="button" className="option-card" onClick={() => setStep('scan')}>
              <CameraIcon />
              <span className="option-card__title">Scan card</span>
              <span className="option-card__hint">Photograph any card, raw or graded</span>
            </button>
          )}
          <button type="button" className="option-card" onClick={() => openForm(emptyDraft(draft.list))}>
            <EditIcon />
            <span className="option-card__title">Enter manually</span>
            <span className="option-card__hint">Add the card's details manually</span>
          </button>
        </div>
      )}
      {/* Started from a list page: offer a way back to it. */}
      {step === 'choose' && initialList && (
        <div className="add-card__cancel">
          <button type="button" className="button button--ghost" onClick={onCancel}>
            Cancel
          </button>
        </div>
      )}
    </section>
  )
}
