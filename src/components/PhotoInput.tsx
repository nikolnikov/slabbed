import { useState } from 'react'
import type { ChangeEvent } from 'react'
import { CameraIcon, CloseIcon } from '../icons'
import type { PhotoValue } from '../types'
import { optimizePhoto, toDecodablePhoto } from '../utils'

type PhotoInputProps = {
  label: string
  value: PhotoValue
  onChange: (value: PhotoValue) => void
  /**
   * When given, a newly taken photo goes here full-size instead of to onChange, so the caller can
   * edit it first (e.g. crop it) and then pass the result to onChange itself.
   */
  onOriginal?: (photo: Blob) => void
}

export function PhotoInput({ label, value, onChange, onOriginal }: PhotoInputProps) {
  const [error, setError] = useState<string | null>(null)
  // "Back (optional)" -> "back", for spoken button names like "Upload back photo".
  const name = label.replace(/\s*\(.*\)/, '').toLowerCase()

  const handleFile = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return
    setError(null)
    try {
      if (onOriginal) return onOriginal(await toDecodablePhoto(file))
      const blob = await optimizePhoto(file)
      onChange({ kind: 'new', blob, src: URL.createObjectURL(blob) })
    } catch {
      setError("Couldn't read that photo")
    }
  }

  return (
    <div className="photo-input">
      <span className="photo-input__label">{label}</span>
      <div className="photo-input__box">
        {/* The whole frame picks a photo. Without `capture`, phones offer Take Photo or Photo Library
            and desktops open the file browser. With a photo already there, it picks a replacement. */}
        <label className="photo-input__frame" title={value ? `Replace ${name} photo` : `Add ${name} photo`}>
          {value ? (
            <img src={value.src} alt={label} />
          ) : (
            <span className="photo-input__empty">
              <CameraIcon />
              Add photo
            </span>
          )}
          <input type="file" accept="image/*" className="visually-hidden" onChange={handleFile} />
          <span className="visually-hidden">{value ? `Replace ${name} photo` : `Add ${name} photo`}</span>
        </label>
        {value && (
          <button
            type="button"
            className="button button--icon button--danger photo-input__remove"
            title="Remove"
            onClick={() => onChange(null)}
          >
            <CloseIcon />
            <span className="visually-hidden">Remove {name} photo</span>
          </button>
        )}
      </div>
      {error && <p className="notice notice--error notice--flush" role="alert">{error}</p>}
    </div>
  )
}
