ALTER TYPE "QuoteStatus" ADD VALUE IF NOT EXISTS 'ANSWERED';
ALTER TYPE "QuoteStatus" ADD VALUE IF NOT EXISTS 'ACCEPTED';

ALTER TABLE "Producer"
  ADD COLUMN IF NOT EXISTS "imageUrl" TEXT,
  ADD COLUMN IF NOT EXISTS "phone" TEXT,
  ADD COLUMN IF NOT EXISTS "bankName" TEXT,
  ADD COLUMN IF NOT EXISTS "bankAccountNumber" TEXT,
  ADD COLUMN IF NOT EXISTS "bankAccountType" TEXT,
  ADD COLUMN IF NOT EXISTS "cci" TEXT,
  ADD COLUMN IF NOT EXISTS "accountHolderName" TEXT;

ALTER TABLE "CartItem"
  ALTER COLUMN "productId" DROP NOT NULL,
  ADD COLUMN IF NOT EXISTS "quoteId" TEXT,
  ADD COLUMN IF NOT EXISTS "titleSnapshot" TEXT,
  ADD COLUMN IF NOT EXISTS "quotedPriceSnapshot" DECIMAL(12, 2);

ALTER TABLE "Order"
  ADD COLUMN IF NOT EXISTS "deliveredAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "claimDeadlineAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "completedAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "fundsReleasedAt" TIMESTAMP(3);

ALTER TABLE "OrderItem"
  ALTER COLUMN "productId" DROP NOT NULL,
  ADD COLUMN IF NOT EXISTS "quoteId" TEXT,
  ADD COLUMN IF NOT EXISTS "titleSnapshot" TEXT;

ALTER TABLE "Sale"
  ADD COLUMN IF NOT EXISTS "releasedAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "paidAt" TIMESTAMP(3);

ALTER TABLE "SaleItem"
  ALTER COLUMN "productId" DROP NOT NULL,
  ADD COLUMN IF NOT EXISTS "quoteId" TEXT,
  ADD COLUMN IF NOT EXISTS "titleSnapshot" TEXT;

ALTER TABLE "QuoteRequest"
  ADD COLUMN IF NOT EXISTS "producerId" TEXT,
  ADD COLUMN IF NOT EXISTS "quotedPrice" DECIMAL(12, 2),
  ADD COLUMN IF NOT EXISTS "quotedDeliveryDays" INTEGER,
  ADD COLUMN IF NOT EXISTS "sellerComment" TEXT,
  ADD COLUMN IF NOT EXISTS "validUntil" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "convertedToCartAt" TIMESTAMP(3);

CREATE INDEX IF NOT EXISTS "CartItem_quoteId_idx" ON "CartItem"("quoteId");
CREATE UNIQUE INDEX IF NOT EXISTS "CartItem_userId_quoteId_key" ON "CartItem"("userId", "quoteId");
CREATE INDEX IF NOT EXISTS "OrderItem_quoteId_idx" ON "OrderItem"("quoteId");
CREATE INDEX IF NOT EXISTS "SaleItem_quoteId_idx" ON "SaleItem"("quoteId");
CREATE INDEX IF NOT EXISTS "QuoteRequest_producerId_idx" ON "QuoteRequest"("producerId");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'CartItem_quoteId_fkey'
  ) THEN
    ALTER TABLE "CartItem"
      ADD CONSTRAINT "CartItem_quoteId_fkey"
      FOREIGN KEY ("quoteId") REFERENCES "QuoteRequest"("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'OrderItem_quoteId_fkey'
  ) THEN
    ALTER TABLE "OrderItem"
      ADD CONSTRAINT "OrderItem_quoteId_fkey"
      FOREIGN KEY ("quoteId") REFERENCES "QuoteRequest"("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'SaleItem_quoteId_fkey'
  ) THEN
    ALTER TABLE "SaleItem"
      ADD CONSTRAINT "SaleItem_quoteId_fkey"
      FOREIGN KEY ("quoteId") REFERENCES "QuoteRequest"("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'QuoteRequest_producerId_fkey'
  ) THEN
    ALTER TABLE "QuoteRequest"
      ADD CONSTRAINT "QuoteRequest_producerId_fkey"
      FOREIGN KEY ("producerId") REFERENCES "Producer"("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;
