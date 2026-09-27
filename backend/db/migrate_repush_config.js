import { dbQuery } from './index.js';

export async function runRepushConfigMigration() {
  console.log('--- Running Migration: Re-Push Config pasca Reset Modem ---');
  try {
    const tableInfo = await dbQuery.all('PRAGMA table_info(onus)');
    const columnNames = tableInfo.map(c => c.name);

    if (!columnNames.includes('last_repush_at')) {
      await dbQuery.run('ALTER TABLE onus ADD COLUMN last_repush_at DATETIME DEFAULT NULL');
      console.log('✓ Added column: last_repush_at');
    } else {
      console.log('• Column last_repush_at already exists.');
    }

    if (!columnNames.includes('wifi_ssid')) {
      await dbQuery.run('ALTER TABLE onus ADD COLUMN wifi_ssid TEXT DEFAULT NULL');
      console.log('✓ Added column: wifi_ssid');
    } else {
      console.log('• Column wifi_ssid already exists.');
    }

    if (!columnNames.includes('wifi_password')) {
      await dbQuery.run('ALTER TABLE onus ADD COLUMN wifi_password TEXT DEFAULT NULL');
      console.log('✓ Added column: wifi_password');
    } else {
      console.log('• Column wifi_password already exists.');
    }

    console.log('Re-push config migration completed successfully.');
  } catch (err) {
    console.error('Migration error:', err.message);
  }
}

// Allow direct execution: node backend/db/migrate_repush_config.js
if (process.argv[1]?.endsWith('migrate_repush_config.js')) {
  runRepushConfigMigration().then(() => process.exit(0)).catch(() => process.exit(1));
}
