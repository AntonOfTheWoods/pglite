-- Create the tables for the linearlite example
CREATE TABLE IF NOT EXISTS "issue" (
    "id" UUID NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "priority" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "modified" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    "created" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    "kanbanorder" TEXT NOT NULL,
    "user_id" UUID NOT NULL,
    CONSTRAINT "issue_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "comment" (
    "id" UUID NOT NULL,
    "body" TEXT NOT NULL,
    "user_id" UUID NOT NULL,
    "issue_id" UUID NOT NULL,
    "modified" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    "created" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT "comment_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "profiles" (
  -- id UUID REFERENCES auth.users NOT NULL,
  id UUID NOT NULL,
  updated_at TIMESTAMPTZ,
  username TEXT UNIQUE,
  avatar_url TEXT,
  website TEXT,

  PRIMARY KEY (id),
  UNIQUE(username),
  CONSTRAINT username_length CHECK (CHAR_LENGTH(username) >= 3)
);
