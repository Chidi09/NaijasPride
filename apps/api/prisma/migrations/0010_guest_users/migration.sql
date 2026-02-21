-- Add guest user support fields to User
ALTER TABLE "User"
  ADD COLUMN IF NOT EXISTS "isGuest"        BOOLEAN   NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "guestExpiresAt" TIMESTAMP(3);
