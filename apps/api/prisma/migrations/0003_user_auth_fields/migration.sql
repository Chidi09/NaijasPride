-- Add email verification fields to User
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "emailVerified" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "emailVerificationToken" TEXT;
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "emailVerificationExpires" TIMESTAMP(3);

-- Add password reset fields to User
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "passwordResetToken" TEXT;
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "passwordResetExpires" TIMESTAMP(3);

-- CreateIndex for fast token lookups
CREATE INDEX IF NOT EXISTS "User_emailVerificationToken_idx" ON "User"("emailVerificationToken");
CREATE INDEX IF NOT EXISTS "User_passwordResetToken_idx" ON "User"("passwordResetToken");
