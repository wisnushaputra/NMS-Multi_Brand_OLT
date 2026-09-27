import { dbQuery } from './index.js';

export async function runONUTypeMigration() {
  try {
    const tableInfo = await dbQuery.all("PRAGMA table_info(onus)");
    const hasCol = tableInfo.some(col => col.name === 'onu_type');
    if (!hasCol) {
      await dbQuery.run("ALTER TABLE onus ADD COLUMN onu_type TEXT DEFAULT 'VSOL2L'");
      console.log('✓ Added column onu_type to onus table');
    }
  } catch (err) {
    console.warn('ONU type migration warning:', err.message);
  }
}
