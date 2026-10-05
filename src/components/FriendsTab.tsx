import { useEffect, useState } from 'react'
import { ApiError, api } from '../api'
import { ChevronLeftIcon } from '../icons'
import type { Card, CardList as CardListKey, SharedUser } from '../types'
import { CardDetail } from './CardDetail'
import { CardList } from './CardList'
import { Spinner } from './Spinner'

const SEARCH_DEBOUNCE_MS = 300

function SharedProfile({ user, onBack }: { user: SharedUser; onBack: () => void }) {
  const [cards, setCards] = useState<Card[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [list, setList] = useState<CardListKey>(user.sharesCollection ? 'collection' : 'wishlist')
  const [openCard, setOpenCard] = useState<Card | null>(null)

  useEffect(() => {
    api
      .getShared(user.id)
      .then((data) => setCards(data.cards))
      .catch((err) => setError(err instanceof ApiError ? err.message : 'Could not load cards'))
  }, [user.id])

  const lists = [user.sharesCollection && 'collection', user.sharesWishlist && 'wishlist'].filter(
    (l): l is CardListKey => !!l
  )

  return (
    <section className={!cards && !error ? 'page--loading' : undefined}>
      <div>
        <button type="button" className="back-link" onClick={onBack}>
          <ChevronLeftIcon /> Back to search
        </button>
        <h1 className="page-title">{user.name}</h1>

        {lists.length > 1 && (
          <div className="segmented" role="group" aria-label="List">
            {lists.map((l) => (
              <button
                key={l}
                type="button"
                className={`segmented__option${list === l ? ' segmented__option--active' : ''}`}
                aria-pressed={list === l}
                onClick={() => setList(l)}
              >
                {l === 'collection' ? 'Collection' : 'Wishlist'}
              </button>
            ))}
          </div>
        )}
      </div>

      {error && <p className="notice notice--error" role="alert">{error}</p>}
      {!cards && !error && <Spinner />}
      {cards && (
        <CardList
          key={list}
          cards={cards.filter((card) => card.list === list)}
          onOpen={setOpenCard}
          emptyState={<p>{user.name}'s {list} is empty.</p>}
        />
      )}
      {openCard && <CardDetail card={openCard} onClose={() => setOpenCard(null)} />}
    </section>
  )
}

export function FriendsTab() {
  const [query, setQuery] = useState('')
  const [searchResults, setResults] = useState<SharedUser[] | null>(null)
  const [selected, setSelected] = useState<SharedUser | null>(null)
  const trimmed = query.trim()
  const results = trimmed.length >= 2 ? searchResults : null

  useEffect(() => {
    if (trimmed.length < 2) return
    let stale = false
    const timer = window.setTimeout(() => {
      api
        .searchUsers(trimmed)
        .then((data) => !stale && setResults(data.users))
        .catch(() => !stale && setResults([]))
    }, SEARCH_DEBOUNCE_MS)
    return () => {
      stale = true
      window.clearTimeout(timer)
    }
  }, [trimmed])

  if (selected) return <SharedProfile user={selected} onBack={() => setSelected(null)} />

  return (
    <section>
      <h1 className="page-title">Friends</h1>
      <p className="muted">Find collectors by name or exact email address. Only people who share their collection or wishlist show up.</p>
      {results && results.length === 0 && <p className="notice notice--info">No collectors found.</p>}
      <input
        className="field__input"
        type="search"
        placeholder="Name or email"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        autoFocus
      />

      {results && results.length > 0 && (
        <ul className="user-list">
          {results.map((user) => (
            <li key={user.id}>
              <button type="button" className="user-list__item" onClick={() => setSelected(user)}>
                <span className="user-list__avatar">{user.name.charAt(0).toUpperCase()}</span>
                <span className="user-list__name">{user.name}</span>
                <span className="user-list__shares">
                  {[user.sharesCollection && 'Collection', user.sharesWishlist && 'Wishlist'].filter(Boolean).join(' · ')}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
