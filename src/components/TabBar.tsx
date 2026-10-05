import type { ReactNode } from 'react'
import { GridIcon, PlusIcon, SettingsIcon, StarIcon, UsersIcon } from '../icons'
import type { Tab } from '../types'

const TABS: { key: Tab; label: string; icon: ReactNode }[] = [
  { key: 'collection', label: 'Collection', icon: <GridIcon /> },
  { key: 'wishlist', label: 'Wishlist', icon: <StarIcon /> },
  { key: 'add', label: 'Add', icon: <PlusIcon /> },
  { key: 'friends', label: 'Friends', icon: <UsersIcon /> },
  { key: 'settings', label: 'Settings', icon: <SettingsIcon /> },
]

type TabBarProps = {
  activeTab: Tab
  onChange: (tab: Tab) => void
  /** Shown in place of the Settings icon and label. */
  avatar: ReactNode
}

export function TabBar({ activeTab, onChange, avatar }: TabBarProps) {
  return (
    <nav className="tabs">
      {TABS.map(({ key, label, icon }) => (
        <button
          key={key}
          type="button"
          className={`tabs__tab tabs__tab--${key}${activeTab === key ? ' tabs__tab--active' : ''}`}
          aria-current={activeTab === key ? 'page' : undefined}
          onClick={() => onChange(key)}
        >
          {key === 'settings' ? avatar : icon}
          <span className={key === 'settings' ? 'visually-hidden' : 'tabs__label'}>{label}</span>
        </button>
      ))}
    </nav>
  )
}
