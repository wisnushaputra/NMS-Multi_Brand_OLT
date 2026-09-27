import { dbQuery } from './index.js';

export async function runVlanProfileMigration() {
  try {
    const tableInfo = await dbQuery.all(`PRAGMA table_info(service_profiles);`);
    const hasVlanProfile = tableInfo.some((col) => col.name === 'vlan_profile');

    if (!hasVlanProfile) {
      console.log('[MIGRATION] Adding vlan_profile column to service_profiles...');
      await dbQuery.exec(`ALTER TABLE service_profiles ADD COLUMN vlan_profile TEXT DEFAULT NULL;`);
      console.log('[MIGRATION] vlan_profile column added successfully.');
    }

    // Set sensible defaults for existing profiles if null
    await dbQuery.run(`
      UPDATE service_profiles 
      SET vlan_profile = CASE 
        WHEN vlan_id = 101 THEN 'PPPoE'
        WHEN vlan_id = 200 THEN 'PPPoE2'
        WHEN vlan_id = 2125 THEN 'PASSPICO'
        ELSE 'PPPoE'
      END
      WHERE vlan_profile IS NULL OR vlan_profile = ''
    `);
  } catch (err) {
    console.error('[MIGRATION] Error migrating vlan_profile column:', err.message);
  }
}
