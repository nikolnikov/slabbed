type AvatarProps = {
  name: string
  /** Image URL of the profile picture; without one the name's first initial is shown. */
  src: string | null
  className?: string
}

export function Avatar({ name, src, className = '' }: AvatarProps) {
  return (
    <span className={`avatar ${className}`.trim()} aria-hidden="true">
      {src ? <img src={src} alt="" /> : name.trim().charAt(0).toUpperCase() || '?'}
    </span>
  )
}
