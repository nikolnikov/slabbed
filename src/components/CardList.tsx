import { useEffect, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { DEFAULT_FILTERS, GRADERS, SORT_OPTIONS } from '../constants'
import { FilterIcon, PlusIcon } from '../icons'
import type { Card, CardFilters } from '../types'
import { thumbUrl } from '../api'
import { filterCards, preloadImages, uniqueSorted } from '../utils'
import { CardFiltersBar } from './CardFiltersBar'
import { CardTile } from './CardTile'
import { Spinner } from './Spinner'

// Tiles are rendered in batches as you scroll, so big lists don't render every card up front.
// Phones show two narrow columns, so a smaller batch still fills the screen.
const batchSize = () => (window.matchMedia('(max-width: 640px)').matches ? 10 : 24) // 640px = $mobile in App.scss

// Saved filters come back from the browser as untrusted JSON (possibly from an older version of
// the app), so keep only well-formed values and fall back to the defaults for the rest.
const loadFilters = (storageKey: string | undefined): CardFilters => {
  if (!storageKey) return DEFAULT_FILTERS
  try {
    const saved = JSON.parse(localStorage.getItem(storageKey) ?? 'null') as Partial<Record<keyof CardFilters, unknown>> | null
    if (!saved || typeof saved !== 'object') return DEFAULT_FILTERS
    return {
      search: typeof saved.search === 'string' ? saved.search : DEFAULT_FILTERS.search,
      grades: Array.isArray(saved.grades) && saved.grades.every((g) => typeof g === 'number') ? saved.grades : DEFAULT_FILTERS.grades,
      grader: GRADERS.find((grader) => grader === saved.grader) ?? DEFAULT_FILTERS.grader,
      graded: saved.graded === 'graded' || saved.graded === 'ungraded' ? saved.graded : DEFAULT_FILTERS.graded,
      sort: SORT_OPTIONS.find((option) => option.key === saved.sort)?.key ?? DEFAULT_FILTERS.sort,
    }
  } catch {
    // Storage can be unavailable (private browsing, blocked site data).
    return DEFAULT_FILTERS
  }
}

const saveFilters = (storageKey: string | undefined, filters: CardFilters) => {
  if (!storageKey) return
  try {
    localStorage.setItem(storageKey, JSON.stringify(filters))
  } catch {
    // Not remembering filters is fine; the list still works.
  }
}

type CardListProps = {
  cards: Card[]
  onOpen: (card: Card) => void
  emptyState: ReactNode
  /**
   * Page title, shown with a button that toggles the filters (hidden by default).
   * Without one there's no header and the filters are always shown.
   */
  title?: string
  /** Shows an Add button beside the filter toggle on desktop (phones use the tab bar's Add). */
  onAdd?: () => void
  /** Local storage key that remembers the filters across visits; without one they reset each time. */
  storageKey?: string
}

export function CardList({ cards, onOpen, emptyState, title, onAdd, storageKey }: CardListProps) {
  const [filters, setFiltersState] = useState(() => loadFilters(storageKey))
  const [filtersOpen, setFiltersOpen] = useState(!title)
  const [batch] = useState(batchSize)
  const [shownCount, setShownCount] = useState(batch)
  // Cards whose tile photo has been downloaded (or that have none). Photos are downloaded before
  // their tiles are shown, so each batch appears complete instead of filling in one image at a time.
  const [loaded, setLoaded] = useState<ReadonlySet<string>>(() => new Set())
  const sentinelRef = useRef<HTMLDivElement>(null)

  const visible = filterCards(cards, filters)
  const batchCards = visible.slice(0, shownCount)
  // Tiles show in order: everything up to the first card still loading, then a spinner.
  const firstPending = batchCards.findIndex((card) => !loaded.has(card.id))
  const ready = firstPending === -1 ? batchCards : batchCards.slice(0, firstPending)
  const pending = firstPending === -1 ? [] : batchCards.slice(firstPending)
  // One line per waiting card: "id url" (url empty when it has no photo).
  const pendingKey = pending.map((card) => `${card.id} ${thumbUrl(card.frontImage) ?? ''}`).join('\n')
  const loading = pending.length > 0

  useEffect(() => {
    if (!pendingKey) return
    let current = true
    const entries = pendingKey.split('\n').map((line) => line.split(' '))
    preloadImages(entries.map(([, url]) => url).filter(Boolean)).then(() => {
      if (current) setLoaded((previous) => new Set([...previous, ...entries.map(([id]) => id)]))
    })
    return () => {
      current = false
    }
  }, [pendingKey])

  // A new filter shows a different list, so start again from the first batch.
  const setFilters = (next: typeof filters) => {
    setFiltersState(next)
    setShownCount(batch)
    saveFilters(storageKey, next)
  }

  // Load the next batch when the end of the grid comes within a screen of the viewport.
  useEffect(() => {
    const sentinel = sentinelRef.current
    if (!sentinel) return
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) setShownCount((count) => count + batch)
      },
      { rootMargin: '100% 0px' }
    )
    observer.observe(sentinel)
    return () => observer.disconnect()
  }, [shownCount, filters, cards.length, batch, loading])

  if (cards.length === 0) {
    return (
      <>
        {title && <h1 className="page-title">{title}</h1>}
        <div className="empty-state card-list-empty">{emptyState}</div>
      </>
    )
  }

  const grades = uniqueSorted(
    cards.map((card) => card.grade),
    (a, b) => b - a
  )
  // Only graders that appear in this list, in the app's standard order.
  const graders = GRADERS.filter((grader) => cards.some((card) => card.grader === grader))

  // Flags the toggle while hidden filters are still narrowing the list (sort order doesn't count).
  const filtering =
    filters.search !== '' || filters.grades.length > 0 || filters.grader !== '' || filters.graded !== 'all'

  return (
    <div className="card-list">
      {title && (
        <div className="card-list__header">
          <h1 className="page-title">{title}</h1>
          {onAdd && (
            <button type="button" className="button button--primary button--small card-list__add" onClick={onAdd}>
              <PlusIcon /> Add
            </button>
          )}
          <button
            type="button"
            className={`icon-button card-list__filter-toggle${filtersOpen ? ' card-list__filter-toggle--open' : ''}`}
            aria-label={filtersOpen ? 'Hide filters' : 'Show filters'}
            aria-expanded={filtersOpen}
            title="Filters"
            onClick={() => setFiltersOpen((open) => !open)}
          >
            <FilterIcon />
            {filtering && !filtersOpen && <span className="card-list__filter-dot" aria-hidden="true" />}
          </button>
        </div>
      )}
      {filtersOpen && <CardFiltersBar filters={filters} onChange={setFilters} grades={grades} graders={graders} />}
      <p className="card-list__count">
        {visible.length === cards.length ? '' : `${visible.length} of `}
        {cards.length} {cards.length === 1 ? 'card' : 'cards'}
      </p>
      {visible.length === 0 ? (
        <div className="empty-state">
          <p>No cards match these filters.</p>
          <button type="button" className="button button--ghost" onClick={() => setFilters(DEFAULT_FILTERS)}>
            Clear filters
          </button>
        </div>
      ) : (
        <>
          {ready.length > 0 && (
            <div className="card-grid">
              {ready.map((card) => (
                <CardTile key={card.id} card={card} onOpen={onOpen} />
              ))}
            </div>
          )}
          {loading && <Spinner label="Loading cards" />}
          {/* The next batch is only requested once this one is showing. */}
          {!loading && shownCount < visible.length && <div ref={sentinelRef} aria-hidden="true" />}
        </>
      )}
    </div>
  )
}
