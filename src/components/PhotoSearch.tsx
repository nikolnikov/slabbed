import { useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import { ApiError, api } from '../api'
import type { PhotoResult } from '../types'
import { Spinner } from './Spinner'

type PhotoSearchProps = {
  /** Searches built from the card's details, most specific first; tried in order until one finds photos. */
  queries: string[]
  /** Gets the full-size image URL of the chosen photo. */
  onPick: (imageUrl: string) => void
  onCancel: () => void
}

/** Searches eBay listings for photos of a card and lets the user pick one. */
export function PhotoSearch({ queries, onPick, onCancel }: PhotoSearchProps) {
  const [query, setQuery] = useState(queries[0] ?? '')
  // The searches to run, in order. A typed search replaces them with just itself.
  const [pending, setPending] = useState(queries)
  const [results, setResults] = useState<PhotoResult[] | null>(null)
  // Set when a wider search than the first one found the photos.
  const [widened, setWidened] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (pending.length === 0) return
    let current = true
    const run = async () => {
      try {
        for (const [index, next] of pending.entries()) {
          const { results } = await api.searchPhotos(next)
          if (!current) return
          if (results.length > 0 || index === pending.length - 1) {
            setResults(results)
            if (results.length > 0 && index > 0) {
              setQuery(next)
              setWidened(true)
            }
            return
          }
        }
      } catch (err) {
        if (current) setError(err instanceof ApiError ? err.message : 'Photo search failed')
      }
    }
    run()
    return () => {
      current = false
    }
  }, [pending])

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault()
    const next = query.trim()
    if (!next) return
    setResults(null)
    setError(null)
    setWidened(false)
    setPending([next])
  }

  return (
    <div className="photo-search">
      {error && (
        <p className="notice notice--error notice--flush" role="alert">
          {error}
        </p>
      )}
      {results?.length === 0 && <p className="notice notice--info notice--flush">No photos found. Try fewer details.</p>}
      {widened && (
        <p className="notice notice--info notice--flush">No exact matches, so this search leaves out some of the card's details.</p>
      )}
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

      {!error && pending.length > 0 && results === null && (
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
