-- =============================================================================
-- Laboratory 4: Role-Based Asset Transaction and Approval Management System
-- Database Schema for Supabase (PostgreSQL)
-- =============================================================================

-- 1. EXTENSIONS & CLEANUP
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

DROP TABLE IF EXISTS audit_logs CASCADE;
DROP TABLE IF EXISTS transactions CASCADE;
DROP TABLE IF EXISTS equipment CASCADE;
DROP TABLE IF EXISTS users CASCADE;

-- 2. USERS TABLE
-- Create each account first in Supabase Dashboard > Authentication > Users.
-- The UUID from auth.users must be used as id in this table.
CREATE TABLE users (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    full_name VARCHAR(100) NOT NULL,
    email VARCHAR(100) UNIQUE NOT NULL,
    role VARCHAR(30) NOT NULL CHECK (role IN ('Administrator', 'Laboratory Staff', 'Requester / Viewer')),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Automatically create the matching role profile whenever an Auth user is created.
CREATE OR REPLACE FUNCTION public.create_user_profile()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    INSERT INTO public.users (id, full_name, email, role)
    VALUES (
        NEW.id,
        COALESCE(NEW.raw_user_meta_data->>'full_name', split_part(NEW.email, '@', 1)),
        NEW.email,
        CASE lower(NEW.email)
            WHEN 'admin@gmail.com' THEN 'Administrator'
            WHEN 'staff@gmail.com' THEN 'Laboratory Staff'
            WHEN 'requester@gmail.com' THEN 'Requester / Viewer'
            ELSE 'Requester / Viewer'
        END
    )
    ON CONFLICT (id) DO UPDATE SET email = EXCLUDED.email;
    RETURN NEW;
END;
$$;

CREATE OR REPLACE TRIGGER on_auth_user_created
AFTER INSERT ON auth.users
FOR EACH ROW EXECUTE FUNCTION public.create_user_profile();

-- 3. EQUIPMENT TABLE
CREATE TABLE equipment (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    asset_code VARCHAR(50) UNIQUE NOT NULL,
    name VARCHAR(150) NOT NULL,
    category VARCHAR(50) NOT NULL,
    status VARCHAR(30) NOT NULL DEFAULT 'Available' CHECK (status IN ('Available', 'Borrowed', 'Maintenance')),
    condition_status VARCHAR(50) DEFAULT 'Good',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 4. TRANSACTIONS TABLE
CREATE TABLE transactions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    requester_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    equipment_id UUID NOT NULL REFERENCES equipment(id) ON DELETE CASCADE,
    status VARCHAR(30) NOT NULL DEFAULT 'Pending' CHECK (status IN ('Pending', 'Approved', 'Rejected', 'Released', 'Returned', 'Overdue', 'Closed')),
    approved_by UUID REFERENCES users(id),
    request_date TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    action_date TIMESTAMP WITH TIME ZONE,
    release_date TIMESTAMP WITH TIME ZONE,
    return_date TIMESTAMP WITH TIME ZONE,
    notes TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 5. AUDIT LOGS TABLE
CREATE TABLE audit_logs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    user_name VARCHAR(100),
    action VARCHAR(50) NOT NULL,
    module VARCHAR(50) NOT NULL,
    record_id VARCHAR(100) NOT NULL,
    description TEXT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 6. INDEXES FOR PERFORMANCE
CREATE INDEX idx_transactions_status ON transactions(status);
CREATE INDEX idx_transactions_requester ON transactions(requester_id);
CREATE INDEX idx_equipment_status ON equipment(status);
CREATE INDEX idx_audit_created_at ON audit_logs(created_at DESC);

-- 7. AUDIT TRAIL AUTOMATION TRIGGER
CREATE OR REPLACE FUNCTION log_transaction_audit()
RETURNS TRIGGER AS $$
BEGIN
    IF (TG_OP = 'INSERT') THEN
        INSERT INTO audit_logs (user_id, action, module, record_id, description)
        VALUES (
            NEW.requester_id,
            'SUBMITTED',
            'Borrowing',
            NEW.id::text,
            CONCAT('Submitted borrowing request for equipment ID: ', NEW.equipment_id)
        );
    ELSIF (TG_OP = 'UPDATE') THEN
        IF OLD.status IS DISTINCT FROM NEW.status THEN
            INSERT INTO audit_logs (user_id, action, module, record_id, description)
            VALUES (
                NEW.approved_by,
                UPPER(NEW.status),
                'Borrowing',
                NEW.id::text,
                CONCAT('Transaction status updated from ', OLD.status, ' to ', NEW.status)
            );
        END IF;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_audit_transactions
AFTER INSERT OR UPDATE ON transactions
FOR EACH ROW EXECUTE FUNCTION log_transaction_audit();

-- 8. ROW LEVEL SECURITY (RLS) POLICIES
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE equipment ENABLE ROW LEVEL SECURITY;
ALTER TABLE transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;

-- Read policies
CREATE POLICY "Allow public read access to equipment" ON equipment FOR SELECT USING (true);
CREATE POLICY "Allow users to view own transactions or admin/staff all" ON transactions FOR SELECT USING (true);
CREATE POLICY "Allow public read to audit_logs" ON audit_logs FOR SELECT USING (true);
CREATE POLICY "Allow public read to users" ON users FOR SELECT USING (true);

-- Insert / Update policies
CREATE POLICY "Allow users to insert transactions" ON transactions FOR INSERT WITH CHECK (true);
CREATE POLICY "Allow status updates on transactions" ON transactions FOR UPDATE USING (true);
CREATE POLICY "Allow insert audit logs" ON audit_logs FOR INSERT WITH CHECK (true);

-- 9. PROFILE SEED DATA FOR TESTING
-- Create these three accounts first in Supabase Authentication > Users.
-- Change the email addresses below if your Auth accounts use different emails.
-- This backfill also fixes Auth users that already existed before the trigger.
INSERT INTO users (id, full_name, email, role)
SELECT id, 'Admin Maria Santos', email, 'Administrator'
FROM auth.users WHERE email = 'admin@gmail.com'
ON CONFLICT (id) DO UPDATE SET role = EXCLUDED.role, full_name = EXCLUDED.full_name;

INSERT INTO users (id, full_name, email, role)
SELECT id, 'Staff Juan Dela Cruz', email, 'Laboratory Staff'
FROM auth.users WHERE email = 'staff@gmail.com'
ON CONFLICT (id) DO UPDATE SET role = EXCLUDED.role, full_name = EXCLUDED.full_name;

INSERT INTO users (id, full_name, email, role)
SELECT id, 'Student Ana Reyes', email, 'Requester / Viewer'
FROM auth.users WHERE email = 'requester@gmail.com'
ON CONFLICT (id) DO UPDATE SET role = EXCLUDED.role, full_name = EXCLUDED.full_name;

INSERT INTO equipment (id, asset_code, name, category, status, condition_status) VALUES
('a1111111-1111-1111-1111-111111111111', 'LAP-001', 'Dell XPS 15 Laptop', 'Computing', 'Available', 'Good'),
('a2222222-2222-2222-2222-222222222222', 'OSC-002', 'Digital Oscilloscope 100MHz', 'Electronics', 'Available', 'Good'),
('a3333333-3333-3333-3333-333333333333', 'PROJ-003', 'Epson 4K Projector', 'AV Gear', 'Maintenance', 'Under Repair'),
('a4444444-4444-4444-4444-444444444444', 'MIC-004', 'Digital Microscope 1000x', 'Biology', 'Borrowed', 'Good');

INSERT INTO transactions (id, requester_id, equipment_id, status, approved_by, notes)
SELECT 'c1111111-1111-1111-1111-111111111111', id,
       'a1111111-1111-1111-1111-111111111111', 'Pending', NULL,
       'For SAD Laboratory Project Presentation'
FROM users WHERE email = 'requester@gmail.com'
ON CONFLICT (id) DO NOTHING;

INSERT INTO audit_logs (id, user_id, user_name, action, module, record_id, description)
SELECT 'b1111111-1111-1111-1111-111111111111', id, full_name, 'SUBMITTED',
       'Borrowing', 'c1111111-1111-1111-1111-111111111111',
       'Submitted borrowing request for LAP-001'
FROM users WHERE email = 'requester@gmail.com'
ON CONFLICT (id) DO NOTHING;
