/**
 * Admin User Creation Script
 * 
 * Run this to create a new admin user:
 * npx ts-node tools/scripts/create-admin.ts
 * 
 * Or use the SQL output below directly in your database
 */

import bcrypt from 'bcrypt';

// Admin user details - CHANGE THESE
const ADMIN_EMAIL = 'admin@naijaspride.com';
const ADMIN_PASSWORD = 'Admin123!';
const ADMIN_NAME = 'NaijasPride Admin';

async function createAdmin() {
  // Hash password with bcrypt (10 rounds - same as auth.service.ts)
  const hashedPassword = await bcrypt.hash(ADMIN_PASSWORD, 10);
  
  console.log('\n=== ADMIN USER CREATED ===\n');
  console.log('Email:', ADMIN_EMAIL);
  console.log('Password:', ADMIN_PASSWORD);
  console.log('Name:', ADMIN_NAME);
  console.log('\n=== SQL COMMAND ===\n');
  
  // Generate UUID
  const { v4: uuidv4 } = await import('uuid');
  const userId = uuidv4();
  
  const sql = `-- Insert admin user
INSERT INTO "User" (id, email, password, name, role, "isPremium", "subStatus", "createdAt", "updatedAt")
VALUES (
  '${userId}',
  '${ADMIN_EMAIL}',
  '${hashedPassword}',
  '${ADMIN_NAME}',
  'ADMIN',
  false,
  'inactive',
  NOW(),
  NOW()
)
ON CONFLICT (email) DO UPDATE 
SET 
  password = EXCLUDED.password,
  role = 'ADMIN',
  name = EXCLUDED.name,
  "updatedAt" = NOW();

-- Verify the user was created
SELECT id, email, name, role, "createdAt" FROM "User" WHERE email = '${ADMIN_EMAIL}';`;

  console.log(sql);
  
  console.log('\n=== INSTRUCTIONS ===\n');
  console.log('1. Copy the SQL command above');
  console.log('2. Connect to your PostgreSQL database (via Pxxl.dev dashboard or psql)');
  console.log('3. Run the SQL command');
  console.log('4. Login at: https://naijaspride.pxxl.click/auth/login');
  console.log('\nOr run: npx prisma db execute --file <sql-file>');
}

createAdmin().catch(console.error);
