export type CardList = 'collection' | 'wishlist'
export type Tab = CardList | 'add' | 'friends' | 'settings'
export type AuthStatus = 'loading' | 'login' | 'register' | 'app'

export type Profile = {
  id: string
  email: string
  name: string
  shareCollection: boolean
  shareWishlist: boolean
  /** R2 key of the profile picture, or null to show the name's initial. */
  avatarImage: string | null
}

export type Grader = 'PSA' | 'BGS' | 'SGC' | 'TAG'

export type CardFields = {
  list: CardList
  isGraded: boolean
  /** Grading company; null for raw cards or when it isn't known. */
  grader: Grader | null
  certNumber: string | null
  grade: number | null
  gradeLabel: string | null
  sport: string | null
  year: string | null
  brand: string | null
  cardNumber: string | null
  player: string
  variety: string | null
  population: number | null
  populationHigher: number | null
  notes: string | null
}

export type Card = CardFields & {
  id: string
  /** R2 key, served from /api/images/:key */
  frontImage: string | null
  backImage: string | null
  createdAt: string
  updatedAt: string
}

/** What gets sent when saving: images are R2 keys or https URLs of found photos to import. */
export type CardInput = CardFields & {
  frontImage: string | null
  backImage: string | null
}

/** A listing photo from /api/photo-search. */
export type PhotoResult = {
  id: string
  title: string
  thumbnailUrl: string
  /** Full-size version, imported into R2 when the card is saved. */
  imageUrl: string
  listingUrl: string | null
}

/** What /api/identify reads off card photos; every field may be missing. */
export type IdentifiedCard = {
  player: string | null
  year: string | null
  brand: string | null
  cardNumber: string | null
  variety: string | null
  sport: string | null
  isGraded: boolean
  grader: Grader | null
  grade: number | null
  gradeLabel: string | null
  certNumber: string | null
}

export type SharedUser = {
  id: string
  name: string
  sharesCollection: boolean
  sharesWishlist: boolean
}

/** A photo in the card form: either already stored/remote, or a new capture awaiting upload. */
export type PhotoValue = { kind: 'stored'; ref: string; src: string } | { kind: 'new'; blob: Blob; src: string } | null

export type GradedFilter = 'all' | 'graded' | 'ungraded'
export type SortKey = 'recent' | 'grade' | 'year' | 'player'

export type CardFilters = {
  search: string
  grades: number[]
  /** Grading company, or '' for any. */
  grader: Grader | ''
  graded: GradedFilter
  sort: SortKey
}
