/**
 * Create Admin User Script (Auto)
 * 
 * This script creates an admin user with predefined credentials.
 * Run with: node create-admin-auto.js
 */

const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');

const prisma = new PrismaClient();

async function createAdmin() {
  try {
    console.log('\n=== Create Admin User ===\n');

    const email = 'admin@example.com';
    const name = 'Admin User';
    const password = 'admin123';

    console.log('Creating admin with:');
    console.log('Email:', email);
    console.log('Name:', name);
    console.log('Password:', password);

    // Check if email already exists
    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) {
      console.log('✅ Admin user already exists!');
      console.log('Email:', existing.email);
      console.log('Name:', existing.name);
      console.log('Role:', existing.role);
      console.log('ID:', existing.id);
      return;
    }

    // Hash password
    const hashedPassword = await bcrypt.hash(password, 10);

    // Create admin user
    const admin = await prisma.user.create({
      data: {
        email,
        name,
        password: hashedPassword,
        role: 'ADMIN',
      }
    });

    console.log('\n✅ Admin user created successfully!');
    console.log('Email:', admin.email);
    console.log('Name:', admin.name);
    console.log('Role:', admin.role);
    console.log('ID:', admin.id);
    console.log('\nYou can now login with:');
    console.log('Email: admin@example.com');
    console.log('Password: admin123');

  } catch (error) {
    console.error('\n❌ Error creating admin:', error.message);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

createAdmin();
