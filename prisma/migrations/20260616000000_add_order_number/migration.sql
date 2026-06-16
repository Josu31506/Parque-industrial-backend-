-- Add a public, sequential order number without exposing technical cuid ids.
ALTER TABLE "Order" ADD COLUMN "orderNumber" INTEGER;

WITH numbered_orders AS (
  SELECT
    id,
    ROW_NUMBER() OVER (ORDER BY "createdAt", id) AS next_number
  FROM "Order"
)
UPDATE "Order"
SET "orderNumber" = numbered_orders.next_number
FROM numbered_orders
WHERE "Order".id = numbered_orders.id;

CREATE SEQUENCE IF NOT EXISTS "Order_orderNumber_seq";

SELECT setval(
  '"Order_orderNumber_seq"',
  GREATEST((SELECT COALESCE(MAX("orderNumber"), 0) FROM "Order"), 1),
  true
);

ALTER TABLE "Order"
  ALTER COLUMN "orderNumber" SET DEFAULT nextval('"Order_orderNumber_seq"'),
  ALTER COLUMN "orderNumber" SET NOT NULL;

ALTER SEQUENCE "Order_orderNumber_seq" OWNED BY "Order"."orderNumber";

CREATE UNIQUE INDEX "Order_orderNumber_key" ON "Order"("orderNumber");
