import { useState } from 'react'
import type { ChangeEvent, FormEvent } from 'react'
import { ApiError, api, imageUrl } from '../api'
import { UploadIcon } from '../icons'
import type { Profile } from '../types'
import { optimizePhoto } from '../utils'
import { Avatar } from './Avatar'

type ProfileValues = Pick<Profile, 'name' | 'shareCollection' | 'shareWishlist' | 'avatarImage'>

// Profile pictures only ever show small, so there's no need to keep a full-size photo.
const AVATAR_DIMENSION = 512

type SettingsTabProps = {
  profile: Profile
  onSave: (values: ProfileValues) => Promise<void>
  onLogout: () => void
}

export function SettingsTab({ profile, onSave, onLogout }: SettingsTabProps) {
  const [values, setValues] = useState<ProfileValues>({
    name: profile.name,
    shareCollection: profile.shareCollection,
    shareWishlist: profile.shareWishlist,
    avatarImage: profile.avatarImage,
  })
  // A newly picked picture, uploaded only when the form is saved.
  const [newAvatar, setNewAvatar] = useState<{ blob: Blob; src: string } | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [message, setMessage] = useState<{ type: 'ok' | 'error'; text: string } | null>(null)

  const handleAvatar = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return
    setMessage(null)
    try {
      const blob = await optimizePhoto(file, AVATAR_DIMENSION)
      setNewAvatar({ blob, src: URL.createObjectURL(blob) })
    } catch {
      setMessage({ type: 'error', text: "Couldn't read that photo" })
    }
  }

  const removeAvatar = () => {
    setNewAvatar(null)
    setValues({ ...values, avatarImage: null })
  }

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault()
    setSubmitting(true)
    setMessage(null)
    try {
      const avatarImage = newAvatar ? (await api.uploadImage(newAvatar.blob)).key : values.avatarImage
      await onSave({ ...values, avatarImage })
      setValues((prev) => ({ ...prev, avatarImage }))
      setNewAvatar(null)
      setMessage({ type: 'ok', text: 'Saved' })
    } catch (err) {
      setMessage({ type: 'error', text: err instanceof ApiError ? err.message : 'Could not save' })
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <section className="settings">
      <h1 className="page-title">Settings</h1>
      <form className="settings-form" onSubmit={handleSubmit}>
        <div className="settings-form__avatar">
          <Avatar name={values.name} src={newAvatar?.src ?? imageUrl(values.avatarImage)} className="avatar--large" />
          <div className="settings-form__avatar-actions">
            <label className="button button--small">
              <UploadIcon /> {newAvatar || values.avatarImage ? 'Change photo' : 'Upload photo'}
              <input type="file" accept="image/*" hidden onChange={handleAvatar} />
            </label>
            {(newAvatar || values.avatarImage) && (
              <button type="button" className="button button--small button--danger" onClick={removeAvatar}>
                Remove
              </button>
            )}
          </div>
        </div>

        <label className="field">
          <span className="field__label">Display name</span>
          <input
            className="field__input"
            value={values.name}
            onChange={(e) => setValues({ ...values, name: e.target.value })}
            required
          />
        </label>
        <label className="field">
          <span className="field__label">Email</span>
          <input className="field__input" value={profile.email} disabled />
        </label>

        {/* A div rather than fieldset/legend: iOS Safari cuts the legend into the top border. */}
        <div className="settings-form__sharing" role="group" aria-labelledby="sharing-heading">
          <span id="sharing-heading" className="field__label">
            Sharing
          </span>
          <p className="muted">
            Shared lists are visible to anyone signed in to Slabbbed who finds you by name or email.
          </p>
          <label className="toggle">
            <input
              type="checkbox"
              checked={values.shareCollection}
              onChange={(e) => setValues({ ...values, shareCollection: e.target.checked })}
            />
            <span>Share my collection</span>
          </label>
          <label className="toggle">
            <input
              type="checkbox"
              checked={values.shareWishlist}
              onChange={(e) => setValues({ ...values, shareWishlist: e.target.checked })}
            />
            <span>Share my wishlist</span>
          </label>
        </div>

        {message && <p className={message.type === 'ok' ? 'form-success' : 'form-error'}>{message.text}</p>}
        <div className="settings-form__actions">
          <button type="submit" className="button button--primary" disabled={submitting}>
            {submitting ? 'Saving…' : 'Save'}
          </button>
          <button type="button" className="button button--ghost" onClick={onLogout}>
            Sign out
          </button>
        </div>
      </form>

      <p className="muted settings-version">
        Version{' '}
        {new Date(__BUILD_TIME__).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })}
      </p>
    </section>
  )
}
