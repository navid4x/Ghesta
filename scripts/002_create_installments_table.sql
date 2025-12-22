-- Create installments table
CREATE TABLE IF NOT EXISTS installments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  creditor_name TEXT NOT NULL,
  item_description TEXT NOT NULL,
  total_amount BIGINT NOT NULL,
  start_date DATE NOT NULL,
  installment_count INTEGER NOT NULL,
  recurrence TEXT NOT NULL CHECK (recurrence IN ('daily', 'weekly', 'monthly', 'yearly')),
  payment_time TIME,
  installment_amount BIGINT NOT NULL,
  reminder_days INTEGER DEFAULT 3,
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create installment_payments table
CREATE TABLE IF NOT EXISTS installment_payments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  installment_id UUID REFERENCES installments(id) ON DELETE CASCADE,
  due_date DATE NOT NULL,
  amount BIGINT NOT NULL,
  is_paid BOOLEAN DEFAULT FALSE,
  paid_date DATE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_installments_user_id ON installments(user_id);
CREATE INDEX IF NOT EXISTS idx_installment_payments_installment_id ON installment_payments(installment_id);
CREATE INDEX IF NOT EXISTS idx_installment_payments_due_date ON installment_payments(due_date, is_paid);

-- Enable RLS
ALTER TABLE installments ENABLE ROW LEVEL SECURITY;
ALTER TABLE installment_payments ENABLE ROW LEVEL SECURITY;

-- RLS Policies for installments
CREATE POLICY "Users can view their own installments"
  ON installments FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own installments"
  ON installments FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own installments"
  ON installments FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own installments"
  ON installments FOR DELETE
  USING (auth.uid() = user_id);

-- RLS Policies for installment_payments
CREATE POLICY "Users can view payments for their installments"
  ON installment_payments FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM installments
    WHERE installments.id = installment_payments.installment_id
    AND installments.user_id = auth.uid()
  ));

CREATE POLICY "Users can update payments for their installments"
  ON installment_payments FOR UPDATE
  USING (EXISTS (
    SELECT 1 FROM installments
    WHERE installments.id = installment_payments.installment_id
    AND installments.user_id = auth.uid()
  ));

CREATE POLICY "Users can insert payments for their installments"
  ON installment_payments FOR INSERT
  WITH CHECK (EXISTS (
    SELECT 1 FROM installments
    WHERE installments.id = installment_payments.installment_id
    AND installments.user_id = auth.uid()
  ));

CREATE POLICY "Users can delete payments for their installments"
  ON installment_payments FOR DELETE
  USING (EXISTS (
    SELECT 1 FROM installments
    WHERE installments.id = installment_payments.installment_id
    AND installments.user_id = auth.uid()
  ));
