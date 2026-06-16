-- Add a dedicated index for loading a user's cart quickly.
CREATE INDEX "CartItem_userId_idx" ON "CartItem"("userId");
