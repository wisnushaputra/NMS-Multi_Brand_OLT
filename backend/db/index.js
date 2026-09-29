import sqlite3 from 'sqlite3';
import bcrypt from 'bcryptjs';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const dbPath = path.join(__dirname, 'nms.sqlite');
const verboseSqlite = sqlite3.verbose();

export const db = new verboseSqlite.Database(dbPath, (err) => {
  if (err) {
    console.error('Error opening database:', err);
  } else {
    console.log('Connected to SQLite database at:', dbPath);
  }
});

// Promisified helper methods
export const dbQuery = {
  all: (sql, params = []) => {
    return new Promise((resolve, reject) => {
      db.all(sql, params, (err, rows) => {
        if (err) reject(err);
        else resolve(rows);
      });
    });
  },
  get: (sql, params = []) => {
    return new Promise((resolve, reject) => {
      db.get(sql, params, (err, row) => {
        if (err) reject(err);
        else resolve(row);
      });
    });
  },
  run: (sql, params = []) => {
    return new Promise((resolve, reject) => {
      db.run(sql, params, function (err) {
        if (err) reject(err);
        else resolve({ lastID: this.lastID, changes: this.changes });
      });
    });
  },
  exec: (sql) => {
    return new Promise((resolve, reject) => {
      db.exec(sql, (err) => {
        if (err) reject(err);
        else resolve();
      });
    });
  }
};

export async function initDatabase() {
  const schemaPath = path.join(__dirname, 'schema.sql');
  const schemaSql = fs.readFileSync(schemaPath, 'utf8');

  await dbQuery.exec(schemaSql);
  await seedData();
  const { runRepushConfigMigration } = await import('./migrate_repush_config.js');
  await runRepushConfigMigration();
  const { runLoopProtectionMigration } = await import('./migrate_loop_protection.js');
  await runLoopProtectionMigration();
  const { runCardsMigration } = await import('./migrate_cards.js');
  await runCardsMigration();
  const { runONUTypeMigration } = await import('./migrate_onu_type.js');
  await runONUTypeMigration();
  const { runVlanProfileMigration } = await import('./migrate_vlan_profile.js');
  await runVlanProfileMigration();
}

async function seedData() {
  // Check and seed RBAC demo users
  const seedUsers = [
    { username: 'admin', password: 'admin123', role: 'superadmin' },
    { username: 'noc_ryan', password: 'noc123', role: 'noc_engineer' },
    { username: 'tech_budi', password: 'tech123', role: 'field_technician' },
    { username: 'helpdesk_siti', password: 'helpdesk123', role: 'helpdesk' }
  ];

  for (const u of seedUsers) {
    const existingUser = await dbQuery.get('SELECT * FROM users WHERE username = ?', [u.username]);
    if (!existingUser) {
      const passwordHash = await bcrypt.hash(u.password, 10);
      await dbQuery.run(
        'INSERT INTO users (username, password_hash, role) VALUES (?, ?, ?)',
        [u.username, passwordHash, u.role]
      );
      console.log(`Seeded RBAC user: ${u.username} (${u.role})`);
    } else if (u.username === 'admin' && existingUser.role === 'administrator') {
      await dbQuery.run("UPDATE users SET role = 'superadmin' WHERE username = 'admin'");
    }
  }

  // Check if adapters exist
  const adapterCount = await dbQuery.get('SELECT COUNT(*) as count FROM olt_adapters');
  if (adapterCount.count === 0) {
    await dbQuery.run(
      'INSERT INTO olt_adapters (vendor, version, path, status) VALUES (?, ?, ?, ?)',
      ['ZTE', 'v2.1.0', 'adapters/zte_adapter.js', 'Active']
    );
    await dbQuery.run(
      'INSERT INTO olt_adapters (vendor, version, path, status) VALUES (?, ?, ?, ?)',
      ['Huawei', 'v1.8.4', 'adapters/huawei_adapter.js', 'Active']
    );
    await dbQuery.run(
      'INSERT INTO olt_adapters (vendor, version, path, status) VALUES (?, ?, ?, ?)',
      ['Fiberhome', 'v1.5.0', 'adapters/fiberhome_adapter.js', 'Active']
    );
    console.log('Seeded OLT Adapters (ZTE, Huawei, Fiberhome)');
  }

  // Adapters and admin user are preserved as foundational system configuration
  console.log('Database initialized without dummy data.');
}
