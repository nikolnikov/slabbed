import { useEffect, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { DEFAULT_FILTERS } from '../constants'
import { FilterIcon, PlusIcon } from '../icons'
import type { Card } from '../types'
import { filterCards, uniqueSorted } from '../utils'
import { CardFiltersBar } from './CardFiltersBar'
import { CardTile } from './CardTile'

// Tiles are rendered in batches as you scroll, so big lists don't render every card up front.
// Phones show two narrow columns, so a smaller batch still fills the screen.
const batchSize = () => (window.matchMedia('(max-width: 640px)').matches ? 10 : 24) // 640px = $mobile in App.scss

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
}

export function CardList({ cards, onOpen, emptyState, title, onAdd }: CardListProps) {
  const [filters, setFiltersState] = useState(DEFAULT_FILTERS)
  const [filtersOpen, setFiltersOpen] = useState(!title)
  const [batch] = useState(batchSize)
  const [shownCount, setShownCount] = useState(batch)
  const sentinelRef = useRef<HTMLDivElement>(null)

  // A new filter shows a different list, so start again from the first batch.
  const setFilters = (next: typeof filters) => {
    setFiltersState(next)
    setShownCount(batch)
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
  const sports = uniqueSorted(
    cards.map((card) => card.sport),
    (a, b) => a.localeCompare(b)
  )

  // Flags the toggle while hidden filters are still narrowing the list (sort order doesn't count).
  const filtering =
    filters.search !== '' || filters.grades.length > 0 || filters.sport !== '' || filters.graded !== 'all'

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
      {filtersOpen && <CardFiltersBar filters={filters} onChange={setFilters} grades={grades} sports={sports} />}
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
