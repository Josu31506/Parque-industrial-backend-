ALTER TABLE "Product"
ADD COLUMN "slug" TEXT;

UPDATE "Product" AS product
SET "slug" = CONCAT(
  LOWER(REGEXP_REPLACE(producer."businessName", '[^a-zA-Z0-9]+', '-', 'g')),
  '-',
  LOWER(REGEXP_REPLACE(product."title", '[^a-zA-Z0-9]+', '-', 'g')),
  '-',
  SUBSTRING(MD5(product."id") FROM 1 FOR 8)
)
FROM "Producer" AS producer
WHERE producer."id" = product."producerId";

ALTER TABLE "Product"
ALTER COLUMN "slug" SET NOT NULL;

CREATE UNIQUE INDEX "Product_slug_key" ON "Product"("slug");
