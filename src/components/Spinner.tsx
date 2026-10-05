type SpinnerProps = {
  label?: string
}

export function Spinner({ label = 'Loading' }: SpinnerProps) {
  return (
    <div className="spinner" role="status" aria-label={label}>
      <svg viewBox="0 0 24 24" className="spinner__icon" fill="none">
        <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="2.5" opacity="0.25" />
        <path d="M21 12a9 9 0 0 0-9-9" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
      </svg>
    </div>
  )
}
