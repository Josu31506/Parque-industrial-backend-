-- Add a dedicated index for cart queries and writes by product.
CREATE INDEX "CartItem_productId_idx" ON "CartItem"("productId");
