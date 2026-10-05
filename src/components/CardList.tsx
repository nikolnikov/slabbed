import { useEffect, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { DEFAULT_FILTERS, GRADERS, SORT_OPTIONS } from '../constants'
import { FilterIcon, PlusIcon } from '../icons'
import type { Card, CardFilters } from '../types'
import { filterCards, uniqueSorted } from '../utils'
import { CardFiltersBar } from './CardFiltersBar'
import { CardTile } from './CardTile'

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
  const sentinelRef = useRef<HTMLDivElement>(null)

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
  }, [shownCount, filters, cards.length, batch])

  if (cards.length === 0) {
    return (
      <>
        {title && <h1 className="page-title">{title}</h1>}
        <div className="empty-state card-list-empty">{emptyState}</div>
      </>
    )
  }

  const visible = filterCards(cards, filters)
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
          <div className="card-grid">
            {visible.slice(0, shownCount).map((card) => (
              <CardTile key={card.id} card={card} onOpen={onOpen} />
            ))}
          </div>
          {shownCount < visible.length && <div ref={sentinelRef} aria-hidden="true" />}
        </>
      )}
    </div>
  )
}
