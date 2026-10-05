import { useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import { ApiError, api } from '../api'
import type { PhotoResult } from '../types'
import { Spinner } from './Spinner'

type PhotoSearchProps = {
  /** Starting search text, built from the card's details. */
  initialQuery: string
  /** Gets the full-size image URL of the chosen photo. */
  onPick: (imageUrl: string) => void
  onCancel: () => void
}

/** Searches eBay listings for photos of a card and lets the user pick one. */
export function PhotoSearch({ initialQuery, onPick, onCancel }: PhotoSearchProps) {
  const [query, setQuery] = useState(initialQuery)
  const [searched, setSearched] = useState(initialQuery)
  const [results, setResults] = useState<PhotoResult[] | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!searched) return
    let current = true
    api
      .searchPhotos(searched)
      .then(({ results }) => current && setResults(results))
      .catch((err) => current && setError(err instanceof ApiError ? err.message : 'Photo search failed'))
    return () => {
      current = false
    }
  }, [searched])

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault()
    const next = query.trim()
    if (next === searched) return
    setResults(null)
    setError(null)
    setSearched(next)
  }

  return (
    <div className="photo-search">
      {error && (
        <p className="notice notice--error notice--flush" role="alert">
          {error}
        </p>
      )}
      {results?.length === 0 && <p className="notice notice--info notice--flush">No photos found. Try fewer details.</p>}
      <form className="photo-search__form" onSubmit={handleSubmit}>
        <input
          className="field__input"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          aria-label="Search for a photo"
        />
        <button type="submit" className="button">
          Search
        </button>
      </form>
      <p className="muted photo-search__hint">Photos come from eBay listings and may show a different copy of the card.</p>

      {!error && searched && results === null && (
        <div className="photo-search__status">
          <Spinner label="Searching" />
        </div>
      )}
      {results && results.length > 0 && (
        <div className="photo-search__grid">
          {results.map((result) => (
            <button
              key={result.id}
              type="button"
              className="photo-search__result"
              title={result.title}
              onClick={() => onPick(result.imageUrl)}
            >
              <img src={result.thumbnailUrl} alt={result.title} loading="lazy" />
            </button>
          ))}
        </div>
      )}

      <div className="photo-search__actions">
        <button type="button" className="button button--ghost" onClick={onCancel}>
          Cancel
        </button>
      </div>
    </div>
  )
}
