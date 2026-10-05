CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  password_salt TEXT NOT NULL,
  name TEXT NOT NULL,
  share_collection INTEGER NOT NULL DEFAULT 0,
  share_wishlist INTEGER NOT NULL DEFAULT 0,
  avatar_image TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS cards (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  list TEXT NOT NULL CHECK (list IN ('collection', 'wishlist')),
  is_graded INTEGER NOT NULL DEFAULT 1,
  grader TEXT, -- 'PSA', 'BGS', 'SGC' or 'TAG'
  cert_number TEXT,
  grade REAL,
  grade_label TEXT,
  sport TEXT,
  year TEXT,
  brand TEXT,
  card_number TEXT,
  player TEXT NOT NULL,
  variety TEXT,
  population INTEGER,
  population_higher INTEGER,
  notes TEXT,
  front_image TEXT,
  back_image TEXT,
  psa_json TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS cards_user_list ON cards (user_id, list);
CREATE INDEX IF NOT EXISTS cards_user_cert ON cards (user_id, cert_number);
