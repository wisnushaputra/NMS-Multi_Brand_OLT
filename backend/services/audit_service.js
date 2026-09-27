import { dbQuery } from '../db/index.js';

export async function createAuditLog({ user = null, user_id = null, username = null, action, target_device_id = null, target_device_name = null, details = {}, status = 'Success' }) {
  try {
    const finalUserId = user?.user_id ?? user_id ?? 1;
    const finalUsername = user?.username ?? username ?? 'system';
    const detailsJson = typeof details === 'string' ? details : JSON.stringify(details);
    const nowIso = new Date().toISOString();
    await dbQuery.run(
      `INSERT INTO audit_logs (timestamp, user_id, username, action, target_device_id, target_device_name, details, status)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [nowIso, finalUserId, finalUsername, action, target_device_id, target_device_name, detailsJson, status]
    );
  } catch (err) {
    console.error('Failed to create audit log:', err);
  }
}
