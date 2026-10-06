import { SORT_OPTIONS } from '../constants'
import type { CardFilters, GradeChoice, GradedFilter, Grader, SortKey } from '../types'

type CardFiltersBarProps = {
  filters: CardFilters
  onChange: (filters: CardFilters) => void
  grades: number[]
  /** Whether the list has raw (ungraded) cards, for the Raw grade chip. */
  hasRaw: boolean
  /** Grading companies present in the list. */
  graders: Grader[]
}

const GRADED_OPTIONS: { key: GradedFilter; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'graded', label: 'Graded' },
  { key: 'ungraded', label: 'Ungraded' },
]

export function CardFiltersBar({ filters, onChange, grades, hasRaw, graders }: CardFiltersBarProps) {
  const update = (patch: Partial<CardFilters>) => onChange({ ...filters, ...patch })

  const toggleGrade = (grade: GradeChoice) =>
    update({
      grades: filters.grades.includes(grade) ? filters.grades.filter((g) => g !== grade) : [...filters.grades, grade],
    })

  // Raw sits after the numeric grades; it can't match anything while only graded cards are shown.
  const chips: GradeChoice[] = hasRaw && filters.graded !== 'graded' ? [...grades, 'raw'] : grades

  return (
    <div className="filters">
      <input
        className="field__input filters__search"
        type="search"
        placeholder="Search player, set, year, cert…"
        value={filters.search}
        onChange={(e) => update({ search: e.target.value })}
      />

      <div className="filters__row">
        <div className="segmented segmented--compact" role="group" aria-label="Graded">
          {GRADED_OPTIONS.map(({ key, label }) => (
            <button
              key={key}
              type="button"
              className={`segmented__option${filters.graded === key ? ' segmented__option--active' : ''}`}
              aria-pressed={filters.graded === key}
              onClick={() => update({ graded: key, grades: key === 'graded' ? filters.grades.filter((g) => g !== 'raw') : filters.grades })}
            >
              {label}
            </button>
          ))}
        </div>

        <select
          className="field__input filters__select"
          value={filters.grader}
          onChange={(e) => update({ grader: e.target.value as Grader | '' })}
          aria-label="Grading service"
        >
          <option value="">All graders</option>
          {graders.map((grader) => (
            <option key={grader} value={grader}>
              {grader}
            </option>
          ))}
        </select>

        <select
          className="field__input filters__select"
          value={filters.sort}
          onChange={(e) => update({ sort: e.target.value as SortKey })}
          aria-label="Sort"
        >
          {SORT_OPTIONS.map(({ key, label }) => (
            <option key={key} value={key}>
              {label}
            </option>
          ))}
        </select>
      </div>

      {chips.length > 0 && filters.graded !== 'ungraded' && (
        <div className="chips" role="group" aria-label="Grade">
          <span className="chips__label">Grade</span>
          {chips.map((grade) => (
            <button
              key={grade}
              type="button"
              className={`chip${filters.grades.includes(grade) ? ' chip--active' : ''}`}
              aria-pressed={filters.grades.includes(grade)}
              onClick={() => toggleGrade(grade)}
            >
              {grade === 'raw' ? 'Raw' : grade}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
