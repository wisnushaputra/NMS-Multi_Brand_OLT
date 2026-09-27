import {
  getMikroTikSettings,
  saveMikroTikSettings,
  testMikroTikConnection
} from '../services/mikrotik_service.js';
import { createAuditLog } from '../services/audit_service.js';

export async function getStatus(req, res) {
  try {
    const status = await testMikroTikConnection();
    res.json({ success: true, data: status });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

export async function getSettings(req, res) {
  try {
    const settings = await getMikroTikSettings();
    res.json({
      success: true,
      data: {
        ...settings,
        mikrotik_pass: settings.mikrotik_pass ? '••••••••' : ''
      }
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

export async function saveSettings(req, res) {
  try {
    const updated = await saveMikroTikSettings(req.body);

    await createAuditLog({
      user: req.user,
      action: 'Simpan Konfigurasi MikroTik BRAS',
      details: {
        host: req.body.mikrotik_host,
        port: req.body.mikrotik_port,
        default_profile: req.body.mikrotik_default_profile
      }
    });

    res.json({
      success: true,
      message: 'Setelan MikroTik Core Router berhasil disimpan',
      data: {
        ...updated,
        mikrotik_pass: '••••••••'
      }
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

