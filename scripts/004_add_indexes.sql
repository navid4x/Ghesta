-- ========================================
-- Database Performance Optimization
-- Add indexes for frequently queried fields
-- ========================================

-- Index on user_id for faster user-specific queries
CREATE INDEX IF NOT EXISTS idx_installments_user_id 
ON installments(user_id);

-- Index on deleted_at for filtering active/deleted items
CREATE INDEX IF NOT EXISTS idx_installments_deleted_at 
ON installments(deleted_at);

-- Composite index for user queries with deleted filter
CREATE INDEX IF NOT EXISTS idx_installments_user_deleted 
ON installments(user_id, deleted_at);

-- Index on updated_at for sync operations
CREATE INDEX IF NOT EXISTS idx_installments_updated_at 
ON installments(updated_at DESC);

-- Index on installment_id for payment lookups
CREATE INDEX IF NOT EXISTS idx_payments_installment_id 
ON installment_payments(installment_id);

-- Index on due_date for date-based queries
CREATE INDEX IF NOT EXISTS idx_payments_due_date 
ON installment_payments(due_date);

-- Index on is_paid for filtering paid/unpaid
CREATE INDEX IF NOT EXISTS idx_payments_is_paid 
ON installment_payments(is_paid);

-- Composite index for common payment queries
CREATE INDEX IF NOT EXISTS idx_payments_installment_paid 
ON installment_payments(installment_id, is_paid, due_date);

-- Index on deleted_at for payments
CREATE INDEX IF NOT EXISTS idx_payments_deleted_at 
ON installment_payments(deleted_at);

-- Index on push_subscriptions for user lookups
CREATE INDEX IF NOT EXISTS idx_push_subscriptions_user_id 
ON push_subscriptions(user_id);

-- ========================================
-- Analyze tables for query optimization
-- ========================================
ANALYZE installments;
ANALYZE installment_payments;
ANALYZE push_subscriptions;

-- ========================================
-- Add comments for documentation
-- ========================================
COMMENT ON INDEX idx_installments_user_id IS 'Optimizes user-specific installment queries';
COMMENT ON INDEX idx_installments_deleted_at IS 'Optimizes filtering of active/deleted items';
COMMENT ON INDEX idx_installments_user_deleted IS 'Optimizes combined user and deleted status queries';
COMMENT ON INDEX idx_installments_updated_at IS 'Optimizes sync operations based on update time';
COMMENT ON INDEX idx_payments_installment_id IS 'Optimizes payment lookups by installment';
COMMENT ON INDEX idx_payments_due_date IS 'Optimizes date-based payment queries';
COMMENT ON INDEX idx_payments_is_paid IS 'Optimizes filtering of paid/unpaid payments';
COMMENT ON INDEX idx_payments_installment_paid IS 'Optimizes common payment status queries';
COMMENT ON INDEX idx_payments_deleted_at IS 'Optimizes filtering of active/deleted payments';
COMMENT ON INDEX idx_push_subscriptions_user_id IS 'Optimizes push subscription lookups';
