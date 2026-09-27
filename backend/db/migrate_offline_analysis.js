import { dbQuery } from './index.js';

async function migrate() {
  console.log('--- Running Migration: Offline Root Cause Analysis (Dying Gasp vs Fiber Cut) ---');
  try {
    const tableInfo = await dbQuery.all('PRAGMA table_info(onus)');
    const columnNames = tableInfo.map(c => c.name);

    if (!columnNames.includes('last_offline_reason')) {
      await dbQuery.run('ALTER TABLE onus ADD COLUMN last_offline_reason TEXT DEFAULT NULL');
      console.log('✓ Added column: last_offline_reason');
    } else {
      console.log('• Column last_offline_reason already exists.');
    }

    if (!columnNames.includes('last_offline_at')) {
      await dbQuery.run('ALTER TABLE onus ADD COLUMN last_offline_at DATETIME DEFAULT NULL');
      console.log('✓ Added column: last_offline_at');
    } else {
      console.log('• Column last_offline_at already exists.');
    }

    // Initialize sample data for demonstration if there are offline ONUs without reason
    const offlineOnus = await dbQuery.all("SELECT onu_id, status FROM onus WHERE status != 'Online'");
    if (offlineOnus.length > 0) {
      let toggle = true;
      for (const o of offlineOnus) {
        const reason = toggle ? 'dying-gasp' : 'los';
        await dbQuery.run(
          'UPDATE onus SET last_offline_reason = ?, last_offline_at = CURRENT_TIMESTAMP WHERE onu_id = ?',
          [reason, o.onu_id]
        );
        toggle = !toggle;
      }
      console.log(`✓ Initialized sample offline reasons for ${offlineOnus.length} offline ONUs.`);
    }

    console.log('Migration completed successfully.');
    process.exit(0);
  } catch (err) {
    console.error('Migration failed:', err);
    process.exit(1);
  }
}

migrate();
