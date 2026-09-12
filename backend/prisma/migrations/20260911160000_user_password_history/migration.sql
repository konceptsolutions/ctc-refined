-- Keep previous password hashes so users cannot reuse an old password.
CREATE TABLE IF NOT EXISTS "UserPasswordHistory" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "passwordHash" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "UserPasswordHistory_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "UserPasswordHistory_userId_idx"
  ON "UserPasswordHistory"("userId");

CREATE INDEX IF NOT EXISTS "UserPasswordHistory_userId_createdAt_idx"
  ON "UserPasswordHistory"("userId", "createdAt");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'UserPasswordHistory_userId_fkey'
  ) THEN
    ALTER TABLE "UserPasswordHistory"
      ADD CONSTRAINT "UserPasswordHistory_userId_fkey"
      FOREIGN KEY ("userId") REFERENCES "User"("id")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;
