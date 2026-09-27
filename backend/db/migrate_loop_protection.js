import { dbQuery } from './index.js';

export async function runLoopProtectionMigration() {
  console.log('--- Running Migration: Loop Protection & Broadcast Storm Mitigation ---');
  try {
    // 1. Create loop_incidents table
    await dbQuery.exec(`
      CREATE TABLE IF NOT EXISTS loop_incidents (
        incident_id INTEGER PRIMARY KEY AUTOINCREMENT,
        onu_id INTEGER NOT NULL,
        device_id INTEGER NOT NULL,
        pon_port INTEGER NOT NULL,
        onu_index INTEGER NOT NULL,
        lan_port INTEGER DEFAULT 1,
        mac_address TEXT,
        vlan_id INTEGER,
        flapping_frequency INTEGER DEFAULT 120,
        storm_rate_pps INTEGER DEFAULT 4500,
        status TEXT DEFAULT 'active', -- active, isolated, resolved
        auto_isolated INTEGER DEFAULT 1,
        mitigation_cli TEXT,
        detected_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        resolved_at DATETIME DEFAULT NULL,
        resolved_by TEXT DEFAULT NULL,
        FOREIGN KEY (onu_id) REFERENCES onus (onu_id) ON DELETE CASCADE,
        FOREIGN KEY (device_id) REFERENCES devices (device_id) ON DELETE CASCADE
      );
    `);
    console.log('✓ Table loop_incidents created or verified.');

    // 2. Add columns to onus table if not exist
    const tableInfo = await dbQuery.all('PRAGMA table_info(onus)');
    const columnNames = tableInfo.map(c => c.name);

    if (!columnNames.includes('loop_detected')) {
      await dbQuery.run('ALTER TABLE onus ADD COLUMN loop_detected INTEGER DEFAULT 0');
      console.log('✓ Added column: loop_detected');
    } else {
      console.log('• Column loop_detected already exists.');
    }

    if (!columnNames.includes('isolated_lan_port')) {
      await dbQuery.run('ALTER TABLE onus ADD COLUMN isolated_lan_port INTEGER DEFAULT NULL');
      console.log('✓ Added column: isolated_lan_port');
    } else {
      console.log('• Column isolated_lan_port already exists.');
    }

    if (!columnNames.includes('last_loop_at')) {
      await dbQuery.run('ALTER TABLE onus ADD COLUMN last_loop_at DATETIME DEFAULT NULL');
      console.log('✓ Added column: last_loop_at');
    } else {
      console.log('• Column last_loop_at already exists.');
    }

    console.log('Loop protection migration completed successfully.');
  } catch (err) {
    console.error('Migration error:', err.message);
  }
}

// Allow direct execution
if (process.argv[1]?.endsWith('migrate_loop_protection.js')) {
  runLoopProtectionMigration().then(() => process.exit(0)).catch(() => process.exit(1));
}
