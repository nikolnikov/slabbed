import { api } from '../api'
import type { Card, CardInput } from '../types'
import { CardForm } from './CardForm'

type EditCardProps = {
  card: Card
  onSaved: (card: Card) => void
  onCancel: () => void
}

/** Full-page edit form, laid out like the add-card screen. */
export function EditCard({ card, onSaved, onCancel }: EditCardProps) {
  const save = async (input: CardInput) => {
    const { card: updated } = await api.updateCard(card.id, input)
    onSaved(updated)
  }

  return (
    <section className="add-card">
      <h1 className="page-title">Edit {card.list === 'wishlist' ? 'wishlist card' : 'card'}</h1>
      <CardForm
        initial={card}
        submitLabel="Save changes"
        onSave={save}
        onCancel={onCancel}
        hideListPicker
        hidePhotos={card.list === 'wishlist'}
      />
    </section>
  )
}
