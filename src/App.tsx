import { useEffect, useEffectEvent, useState } from 'react'
import './App.scss'
import { ApiError, api, imageUrl } from './api'
import logo from './assets/logo.avif'
import { AddCard } from './components/AddCard'
import { Avatar } from './components/Avatar'
import { CardDetail } from './components/CardDetail'
import { CardList } from './components/CardList'
import { EditCard } from './components/EditCard'
import { FriendsTab } from './components/FriendsTab'
import { LoginScreen } from './components/LoginScreen'
import { SettingsTab } from './components/SettingsTab'
import { Spinner } from './components/Spinner'
import { TabBar } from './components/TabBar'
import type { AuthStatus, Card, CardList as CardListKey, Profile, Tab } from './types'
import { watchForUpdates } from './updates'

function App() {
  const [authStatus, setAuthStatus] = useState<AuthStatus>('loading')
  const [profile, setProfile] = useState<Profile | null>(null)
  const [authError, setAuthError] = useState<string | null>(null)
  const [authSubmitting, setAuthSubmitting] = useState(false)

  const [activeTab, setActiveTab] = useState<Tab>('collection')
  // The list the add flow starts on: set when started from a list page, null (ask) from the tab bar.
  const [addList, setAddList] = useState<CardListKey | null>(null)
  // Remounts the add flow each time it's started so it begins from the right step.
  const [addKey, setAddKey] = useState(0)
  const [cards, setCards] = useState<Card[] | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [openCardId, setOpenCardId] = useState<string | null>(null)
  // A card being edited takes over the page, like the add-card screen.
  const [editingCardId, setEditingCardId] = useState<string | null>(null)

  // Picking up a new deploy reloads the page, so never do it while a card is being added or
  // edited (taking a photo briefly backgrounds the app); it waits for the next close/reopen.
  const canReload = useEffectEvent(() => activeTab !== 'add' && openCardId === null && editingCardId === null)
  useEffect(() => watchForUpdates(canReload), [])

  useEffect(() => {
    api
      .me()
      .then((data) => {
        setProfile(data.profile)
        setAuthStatus('app')
      })
      .catch(() => setAuthStatus('login'))
  }, [])

  useEffect(() => {
    if (authStatus !== 'app') return
    api
      .listCards()
      .then((data) => setCards(data.cards))
      .catch((err) => {
        if (err instanceof ApiError && err.status === 401) setAuthStatus('login')
        else setLoadError('Could not load your cards')
      })
  }, [authStatus])

  const handleAuthSubmit = async (values: { name: string; email: string; password: string; rememberMe: boolean }) => {
    setAuthError(null)
    setAuthSubmitting(true)
    try {
      const { profile } =
        authStatus === 'register'
          ? await api.register(values.name, values.email, values.password, values.rememberMe)
          : await api.login(values.email, values.password, values.rememberMe)
      setProfile(profile)
      setAuthStatus('app')
    } catch (err) {
      setAuthError(err instanceof ApiError ? err.message : 'Something went wrong')
    } finally {
      setAuthSubmitting(false)
    }
  }

  const handleLogout = async () => {
    await api.logout().catch(() => {})
    setProfile(null)
    setCards(null)
    setActiveTab('collection')
    setAuthStatus('login')
  }

  const changeTab = (tab: Tab) => {
    setEditingCardId(null)
    // The Add tab (phones only) adds to the list you're looking at, or asks which list otherwise.
    if (tab === 'add') return startAdd(activeTab === 'collection' || activeTab === 'wishlist' ? activeTab : null)
    setActiveTab(tab)
  }

  const startAdd = (list: CardListKey | null) => {
    setAddList(list)
    setAddKey((key) => key + 1)
    setEditingCardId(null)
    setActiveTab('add')
  }

  const handleCardSaved = (card: Card) => {
    setCards((prev) => [card, ...(prev ?? [])])
    changeTab(card.list)
  }

  const handleCardUpdated = (card: Card) => {
    setCards((prev) => prev?.map((c) => (c.id === card.id ? card : c)) ?? null)
  }

  const handleCardDeleted = (id: string) => {
    setCards((prev) => prev?.filter((c) => c.id !== id) ?? null)
    setOpenCardId(null)
  }

  if (authStatus === 'loading') {
    return (
      <main className="app app--centered">
        <Spinner />
      </main>
    )
  }

  if (authStatus === 'login' || authStatus === 'register') {
    return (
      <main className="app app--centered">
        <LoginScreen
          mode={authStatus}
          onModeChange={(mode) => {
            setAuthError(null)
            setAuthStatus(mode)
          }}
          onSubmit={handleAuthSubmit}
          error={authError}
          submitting={authSubmitting}
        />
      </main>
    )
  }

  const openCard = cards?.find((card) => card.id === openCardId) ?? null
  const editingCard = cards?.find((card) => card.id === editingCardId) ?? null

  const startEdit = (id: string) => {
    setOpenCardId(null)
    setEditingCardId(id)
    window.scrollTo(0, 0)
  }

  // Saving or cancelling returns to the card's list, with its details closed.
  const finishEdit = (card: Card) => {
    setEditingCardId(null)
    setActiveTab(card.list)
  }

  const renderList = (list: CardListKey) => {
    if (loadError) return <p className="notice notice--error" role="alert">{loadError}</p>
    if (!cards) return <Spinner />
    const listCards = cards.filter((card) => card.list === list)
    return (
      <section className={listCards.length === 0 ? 'list-page--empty' : undefined}>
        <CardList
          key={list}
          // Remembered per account and per list, so each keeps its own filters.
          storageKey={profile ? `slabbbed:filters:${profile.id}:${list}` : undefined}
          title={list === 'collection' ? 'My collection' : 'My wishlist'}
          onAdd={() => startAdd(list)}
          cards={listCards}
          onOpen={(card) => setOpenCardId(card.id)}
          emptyState={
            <>
              <p>{list === 'collection' ? 'No cards in your collection yet.' : 'Your wishlist is empty.'}</p>
              <button type="button" className="button button--primary" onClick={() => startAdd(list)}>
                Add a card
              </button>
            </>
          }
        />
      </section>
    )
  }

  return (
    <main className="app">
      <header className="app__header">
        <img className="app__logo" src={logo} alt="Slabbbed!" />
        <TabBar
          activeTab={activeTab}
          onChange={changeTab}
          avatar={profile && <Avatar name={profile.name} src={imageUrl(profile.avatarImage)} className="tabs__avatar" />}
        />
      </header>

      <div className="app__content">
        {editingCard ? (
          <EditCard
            key={editingCard.id}
            card={editingCard}
            onSaved={(card) => {
              handleCardUpdated(card)
              finishEdit(card)
            }}
            onCancel={() => finishEdit(editingCard)}
          />
        ) : (
          (activeTab === 'collection' || activeTab === 'wishlist') && renderList(activeTab)
        )}
        {activeTab === 'add' && (
          <AddCard
            key={addKey}
            list={addList}
            onSaved={handleCardSaved}
            onCancel={() => changeTab(addList ?? 'collection')}
          />
        )}
        {activeTab === 'friends' && <FriendsTab />}
        {activeTab === 'settings' && profile && (
          <SettingsTab
            profile={profile}
            onSave={async (values) => setProfile((await api.updateProfile(values)).profile)}
            onLogout={handleLogout}
          />
        )}
      </div>

      {openCard && (
        <CardDetail
          key={openCard.id}
          card={openCard}
          onClose={() => setOpenCardId(null)}
          onUpdated={handleCardUpdated}
          onDeleted={handleCardDeleted}
          onEdit={() => startEdit(openCard.id)}
        />
      )}
    </main>
  )
}

export default App
