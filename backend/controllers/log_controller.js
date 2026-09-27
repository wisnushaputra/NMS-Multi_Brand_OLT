import { dbQuery } from '../db/index.js';

export async function getAuditLogs(req, res) {
  try {
    const { user_id, device_id, action, search } = req.query;

    let sql = 'SELECT * FROM audit_logs WHERE 1=1';
    const params = [];

    if (user_id) {
      sql += ' AND user_id = ?';
      params.push(user_id);
    }
    if (device_id) {
      sql += ' AND target_device_id = ?';
      params.push(device_id);
    }
    if (action) {
      sql += ' AND action LIKE ?';
      params.push(`%${action}%`);
    }
    if (search) {
      sql += ' AND (action LIKE ? OR username LIKE ? OR target_device_name LIKE ? OR details LIKE ?)';
      const s = `%${search}%`;
      params.push(s, s, s, s);
    }

    sql += ' ORDER BY log_id DESC LIMIT 200';

    const logs = await dbQuery.all(sql, params);
    const formattedLogs = logs.map((l) => {
      let ts = l.timestamp;
      if (ts && typeof ts === 'string' && !ts.includes('Z') && !ts.includes('+')) {
        // SQLite CURRENT_TIMESTAMP is UTC without timezone indicator; append Z so browsers convert to local time properly
        ts = ts.replace(' ', 'T') + 'Z';
      }
      return {
        ...l,
        timestamp: ts
      };
    });
    res.json(formattedLogs);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}
