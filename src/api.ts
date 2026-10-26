import { THUMB_DIMENSION } from './constants'
import type { Card, CardInput, IdentifiedCard, ListingDetails, PhotoResult, Profile, SharedUser } from './types'
import { optimizePhoto } from './utils'

export class ApiError extends Error {
  status: number

  constructor(message: string, status: number) {
    super(message)
    this.status = status
  }
}

const request = async <T>(path: string, init: RequestInit = {}): Promise<T> => {
  const res = await fetch(path, {
    credentials: 'include',
    ...init,
    headers: init.body && !(init.body instanceof Blob) ? { 'Content-Type': 'application/json', ...init.headers } : init.headers,
  })
  const data = (await res.json().catch(() => ({}))) as T & { error?: string }
  if (!res.ok) throw new ApiError(data.error ?? 'Something went wrong', res.status)
  return data
}

const json = (method: string, body: unknown): RequestInit => ({ method, body: JSON.stringify(body) })

export const api = {
  me: () => request<{ profile: Profile }>('/api/me'),
  login: (email: string, password: string, rememberMe: boolean) =>
    request<{ profile: Profile }>('/api/login', json('POST', { email, password, rememberMe })),
  register: (name: string, email: string, password: string, rememberMe: boolean) =>
    request<{ profile: Profile }>('/api/register', json('POST', { name, email, password, rememberMe })),
  logout: () => request<{ ok: true }>('/api/logout', { method: 'POST' }),
  updateProfile: (values: Pick<Profile, 'name' | 'shareCollection' | 'shareWishlist' | 'avatarImage'>) =>
    request<{ profile: Profile }>('/api/profile', json('PUT', values)),

  listCards: () => request<{ cards: Card[] }>('/api/cards'),
  createCard: (input: CardInput) => request<{ card: Card }>('/api/cards', json('POST', input)),
  updateCard: (id: string, input: CardInput) => request<{ card: Card }>(`/api/cards/${id}`, json('PUT', input)),
  deleteCard: (id: string) => request<{ ok: true }>(`/api/cards/${id}`, { method: 'DELETE' }),

  uploadImage: (blob: Blob) =>
    request<{ key: string }>('/api/images', { method: 'POST', body: blob, headers: { 'Content-Type': blob.type } }),
  uploadThumbnail: (key: string, blob: Blob) =>
    request<unknown>(`/api/images/${key}/thumb`, { method: 'POST', body: blob, headers: { 'Content-Type': blob.type } }),
  /** Card details and photo for a pasted eBay listing link (or item number). */
  ebayListing: (url: string) =>
    request<{ title: string; card: ListingDetails; imageUrl: string | null }>('/api/ebay-listing', json('POST', { url })),
  /** Card details read from an eBay listing title (wishlist card search). */
  parseListing: (title: string) => request<{ card: IdentifiedCard }>('/api/parse-listing', json('POST', { title })),
  /** Photos as data URLs (front first). */
  identifyCard: (images: string[]) =>
    request<{ card: IdentifiedCard; model: string }>('/api/identify', json('POST', { images })),
  /** Listing photos from eBay that match a description of the card. */
  searchPhotos: (query: string) =>
    request<{ results: PhotoResult[] }>(`/api/photo-search?q=${encodeURIComponent(query)}`),
  fetchRemoteImage: async (url: string): Promise<Blob> => {
    const res = await fetch(`/api/remote-image?url=${encodeURIComponent(url)}`, { credentials: 'include' })
    if (!res.ok) throw new ApiError("Couldn't download that photo", res.status)
    return res.blob()
  },

  searchUsers: (query: string) => request<{ users: SharedUser[] }>(`/api/users/search?q=${encodeURIComponent(query)}`),
  getShared: (userId: string) => request<{ user: SharedUser; cards: Card[] }>(`/api/users/${userId}/shared`),
}

export const imageUrl = (key: string | null): string | null => (key ? `/api/images/${key}` : null)

/** The small copy of a card photo for list tiles (the server falls back to the full photo). */
export const thumbUrl = (key: string | null): string | null => (key ? `/api/images/${key}-thumb` : null)

/** Uploads a card photo plus its small copy for tiles, and returns the photo's key. */
export const uploadCardPhoto = async (photo: Blob): Promise<string> => {
  const { key } = await api.uploadImage(photo)
  try {
    await api.uploadThumbnail(key, await optimizePhoto(photo, THUMB_DIMENSION))
  } catch (error) {
    // Tiles fall back to the full photo, so a missing thumbnail only costs speed.
    console.warn('Thumbnail upload failed', error)
  }
  return key
}
