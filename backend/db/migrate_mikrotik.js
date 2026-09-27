import { dbQuery } from './index.js';

export async function runMikroTikMigration() {
  console.log('--- Starting MikroTik BRAS & Billing Database Migration ---');

  try {
    await dbQuery.run("ALTER TABLE onus ADD COLUMN billing_status TEXT DEFAULT 'active'");
    console.log('Added billing_status column to onus');
  } catch (e) { /* column might already exist */ }

  try {
    await dbQuery.run("ALTER TABLE onus ADD COLUMN pppoe_profile TEXT DEFAULT 'profile_50mbps'");
    console.log('Added pppoe_profile column to onus');
  } catch (e) { /* column might already exist */ }

  try {
    await dbQuery.run("ALTER TABLE onus ADD COLUMN last_isolated_at DATETIME");
    console.log('Added last_isolated_at column to onus');
  } catch (e) { /* column might already exist */ }

  // Set default billing_status for existing ONUs if null
  await dbQuery.run(`
    UPDATE onus
    SET billing_status = 'active', pppoe_profile = 'profile_50mbps'
    WHERE billing_status IS NULL OR billing_status = ''
  `);

  // Seed default MikroTik settings in system_settings if not present
  const defaultSettings = [
    { key: 'mikrotik_host', value: '10.10.10.1' },
    { key: 'mikrotik_port', value: '8728' },
    { key: 'mikrotik_user', value: 'nms_admin' },
    { key: 'mikrotik_pass', value: 'mikrotik123' },
    { key: 'mikrotik_default_profile', value: 'profile_50mbps' },
    { key: 'mikrotik_isolate_profile', value: 'profile_isolir' },
    { key: 'mikrotik_use_tls', value: 'false' },
    { key: 'mikrotik_enabled', value: 'true' }
  ];

  for (const s of defaultSettings) {
    const existing = await dbQuery.get('SELECT key FROM system_settings WHERE key = ?', [s.key]);
    if (!existing) {
      await dbQuery.run('INSERT INTO system_settings (key, value) VALUES (?, ?)', [s.key, s.value]);
    }
  }
  console.log('MikroTik settings verified in system_settings');

  console.log('--- MikroTik Migration Completed Successfully ---');
}
