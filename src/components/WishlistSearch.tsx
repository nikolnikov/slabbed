import { useState } from 'react'
import type { FormEvent } from 'react'
import { ApiError, api } from '../api'
import type { PhotoResult } from '../types'
import { photoSearchQueries } from '../utils'
import { Spinner } from './Spinner'

/** What was typed in the search, to fill in details a picked listing's title leaves out. */
export type CardSearchFields = { player: string; year: string; brand: string; variety: string; cardNumber: string }
type Fields = CardSearchFields

type WishlistSearchProps = {
  onPick: (result: PhotoResult, typed: CardSearchFields) => void
  onCancel: () => void
}

const EMPTY: Fields = { player: '', year: '', brand: '', variety: '', cardNumber: '' }

/** Finds a card to add to the wishlist by searching eBay listings, then lets the user pick one. */
export function WishlistSearch({ onPick, onCancel }: WishlistSearchProps) {
  const [fields, setFields] = useState<Fields>(EMPTY)
  const [searching, setSearching] = useState(false)
  const [results, setResults] = useState<PhotoResult[] | null>(null)
  // Set when the search had to leave out some details to find anything.
  const [widened, setWidened] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const field = (key: keyof Fields) => ({
    value: fields[key],
    onChange: (event: { target: { value: string } }) => setFields((current) => ({ ...current, [key]: event.target.value })),
  })

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault()
    const orNull = (value: string) => value.trim() || null
    // Most specific first; each later search drops a detail, like the photo search.
    const queries = photoSearchQueries({
      player: fields.player.trim(),
      year: orNull(fields.year),
      brand: orNull(fields.brand),
      variety: orNull(fields.variety),
      cardNumber: orNull(fields.cardNumber),
      isGraded: false,
      grader: null,
      grade: null,
    })
    setSearching(true)
    setError(null)
    setResults(null)
    setWidened(false)
    try {
      for (const [index, query] of queries.entries()) {
        const { results: found } = await api.searchPhotos(query)
        if (found.length > 0 || index === queries.length - 1) {
          setResults(found)
          setWidened(found.length > 0 && index > 0)
          break
        }
      }
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Card search failed')
    } finally {
      setSearching(false)
    }
  }

  return (
    <div className="wishlist-search">
      {error && (
        <p className="notice notice--error notice--flush" role="alert">
          {error}
        </p>
      )}
      <form className="card-form" onSubmit={handleSubmit}>
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
        <div className="card-form__actions">
          <button type="button" className="button button--ghost" onClick={onCancel} disabled={searching}>
            Cancel
          </button>
          <button type="submit" className="button button--primary" disabled={searching || !fields.player.trim()}>
            {searching ? 'Searching…' : 'Search'}
          </button>
        </div>
      </form>

      {searching && <Spinner label="Searching" />}
      {results?.length === 0 && (
        <p className="notice notice--info notice--flush">No matching cards found. Try fewer details, or enter the card manually.</p>
      )}
      {results && results.length > 0 && (
        <>
          <p className="muted wishlist-search__hint">
            {widened ? 'No exact matches, so these leave out some details. ' : ''}Pick the card you're after. Results
            come from eBay listings.
          </p>
          <ul className="listing-results">
            {results.map((result) => (
              <li key={result.id}>
                <button type="button" className="listing-result" onClick={() => onPick(result, fields)}>
                  <img src={result.thumbnailUrl} alt="" loading="lazy" />
                  <span>{result.title}</span>
                </button>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  )
}
