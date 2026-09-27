import { dbQuery } from '../db/index.js';
import { AdapterFactory } from '../adapters/adapter_factory.js';
import { createAuditLog } from '../services/audit_service.js';
import { dispatchIncidentAlert } from '../services/notification_service.js';
import { broadcastEvent } from '../services/event_bus.js';

/**
 * Get active and historical loop incidents
 * GET /api/loop-protection/incidents
 */
export async function getLoopIncidents(req, res) {
  try {
    const { status, device_id } = req.query;
    let sql = `
      SELECT li.*, 
             o.serial_number, 
             o.onu_name as customer_name,
             o.status as onu_status,
             d.name as device_name,
             d.vendor as device_vendor,
             d.ip_address as device_ip
      FROM loop_incidents li
      LEFT JOIN onus o ON li.onu_id = o.onu_id
      LEFT JOIN devices d ON li.device_id = d.device_id
      WHERE 1=1
    `;
    const params = [];

    if (status === 'active') {
      sql += " AND li.status IN ('active', 'isolated')";
    } else if (status && status !== 'all') {
      sql += ' AND li.status = ?';
      params.push(status);
    }
    if (device_id && device_id !== 'all') {
      sql += ' AND li.device_id = ?';
      params.push(parseInt(device_id, 10));
    }

    sql += ' ORDER BY li.incident_id DESC LIMIT 100';

    const incidents = await dbQuery.all(sql, params);
    res.json(incidents);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

/**
 * Trigger manual hardware CLI scan for loopback & MAC flapping across OLTs
 * POST /api/loop-protection/scan
 */
export async function scanLoopback(req, res) {
  try {
    const devices = await dbQuery.all('SELECT * FROM devices ORDER BY device_id ASC');
    const scanResults = [];

    for (const dev of devices) {
      try {
        const adapter = AdapterFactory.getAdapter(dev);
        const result = await adapter.detectLoopbackEvents();
        scanResults.push({
          device_id: dev.device_id,
          device_name: dev.name,
          vendor: dev.vendor,
          success: true,
          cliExecuted: result.cliExecuted,
          incidentsFound: result.incidents ? result.incidents.length : 0
        });
      } catch (devErr) {
        scanResults.push({
          device_id: dev.device_id,
          device_name: dev.name,
          vendor: dev.vendor,
          success: false,
          error: devErr.message
        });
      }
    }

    // Count active incidents in database
    const activeCount = await dbQuery.get("SELECT COUNT(*) as count FROM loop_incidents WHERE status != 'resolved'");

    res.json({
      success: true,
      message: `Pemindaian loopback OLT selesai. Ditemukan ${activeCount.count} insiden aktif di sistem.`,
      devicesScanned: scanResults.length,
      activeIncidentsCount: activeCount.count,
      scanDetails: scanResults
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

/**
 * Resolve a loop incident: re-enable isolated LAN port via OMCI and mark resolved
 * POST /api/loop-protection/resolve/:incident_id
 */
export async function resolveLoopIncident(req, res) {
  try {
    const { incident_id } = req.params;
    const incident = await dbQuery.get('SELECT * FROM loop_incidents WHERE incident_id = ?', [incident_id]);
    if (!incident) {
      return res.status(404).json({ error: 'Insiden loopback tidak ditemukan' });
    }

    const onu = await dbQuery.get('SELECT * FROM onus WHERE onu_id = ?', [incident.onu_id]);
    const device = await dbQuery.get('SELECT * FROM devices WHERE device_id = ?', [incident.device_id]);

    let cliResult = null;
    if (device && onu) {
      const adapter = AdapterFactory.getAdapter(device);
      cliResult = await adapter.setLanPortState({
        ponPort: incident.pon_port || onu.pon_port_id,
        onuIndex: incident.onu_index || onu.onu_index || 1,
        lanPort: incident.lan_port || 1,
        state: 'no-shutdown'
      });
    }

    // Update incident status
    const resolvedBy = req.user?.username || 'NOC Engineer';
    await dbQuery.run(`
      UPDATE loop_incidents
      SET status = 'resolved', resolved_at = CURRENT_TIMESTAMP, resolved_by = ?
      WHERE incident_id = ?
    `, [resolvedBy, incident_id]);

    // Check if there are other active incidents for this ONU
    const remainingActive = await dbQuery.get(
      "SELECT COUNT(*) as count FROM loop_incidents WHERE onu_id = ? AND status != 'resolved'",
      [incident.onu_id]
    );

    if (remainingActive.count === 0 && onu) {
      await dbQuery.run(
        'UPDATE onus SET loop_detected = 0, isolated_lan_port = NULL WHERE onu_id = ?',
        [incident.onu_id]
      );
    }

    // Audit log
    await createAuditLog({
      user: req.user,
      action: 'Pemulihan Loopback Port LAN (Un-isolate)',
      target_device_id: device?.device_id || incident.device_id,
      target_device_name: device?.name || 'OLT',
      details: {
        incident_id,
        onu_id: incident.onu_id,
        serial_number: onu?.serial_number,
        lan_port: incident.lan_port,
        cli_commands: cliResult?.cliExecuted
      }
    });

    // Telegram notification
    dispatchIncidentAlert({
      eventType: 'LOOPBACK_RESOLVED',
      severity: 'INFO',
      deviceName: device?.name || 'OLT',
      targetOnu: onu?.serial_number || `ONU-${incident.onu_id}`,
      details: {
        customer_name: onu?.customer_name || onu?.onu_name,
        port: `${incident.pon_port}:${incident.onu_index}`,
        lan_port: incident.lan_port,
        resolved_by: resolvedBy
      }
    }).catch(err => console.warn('Telegram loop resolve alert error:', err.message));

    // Broadcast SSE
    broadcastEvent('LOOPBACK_RESOLVED', {
      incident_id,
      onu_id: incident.onu_id,
      lan_port: incident.lan_port
    });

    res.json({
      success: true,
      message: `Port LAN ${incident.lan_port} pada ONU ${onu?.serial_number || incident.onu_id} berhasil dipulihkan (no shutdown).`,
      incident_id,
      cli_executed: cliResult?.cliExecuted
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

/**
 * Simulate a loop incident for demo/testing NOC protections
 * POST /api/loop-protection/simulate
 */
export async function simulateLoopIncident(req, res) {
  try {
    const { onu_id, lan_port = 1, auto_isolate = true } = req.body;

    let targetOnu = null;
    if (onu_id) {
      targetOnu = await dbQuery.get('SELECT * FROM onus WHERE onu_id = ?', [onu_id]);
    } else {
      targetOnu = await dbQuery.get("SELECT * FROM onus WHERE status = 'Online' LIMIT 1") || await dbQuery.get("SELECT * FROM onus LIMIT 1");
    }

    if (!targetOnu) {
      return res.status(404).json({ error: 'Tidak ada ONU yang tersedia untuk simulasi loop' });
    }

    const device = await dbQuery.get('SELECT * FROM devices WHERE device_id = ?', [targetOnu.device_id]);
    if (!device) {
      return res.status(404).json({ error: 'Device OLT tidak ditemukan' });
    }

    const adapter = AdapterFactory.getAdapter(device);
    let mitigationCli = '';

    // Auto-isolate LAN port via OMCI if enabled
    if (auto_isolate) {
      const shutdownRes = await adapter.setLanPortState({
        ponPort: targetOnu.pon_port_id,
        onuIndex: targetOnu.onu_index || 1,
        lanPort: parseInt(lan_port, 10),
        state: 'shutdown'
      });
      mitigationCli = shutdownRes.cliExecuted;
    }

    // Insert loop incident
    const randomHex = () => Math.floor(Math.random() * 256).toString(16).padStart(2, '0').toUpperCase();
    const syntheticMac = `00:E0:4C:${randomHex()}:${randomHex()}:${randomHex()}`;

    const insertResult = await dbQuery.run(`
      INSERT INTO loop_incidents (
        onu_id, device_id, pon_port, onu_index, lan_port, mac_address,
        vlan_id, flapping_frequency, storm_rate_pps, status, auto_isolated,
        mitigation_cli, detected_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
    `, [
      targetOnu.onu_id,
      device.device_id,
      targetOnu.pon_port_id,
      targetOnu.onu_index || 1,
      parseInt(lan_port, 10),
      syntheticMac,
      targetOnu.vlan_id || 100,
      142, // flapping frequency
      5400, // broadcast storm pps
      auto_isolate ? 'isolated' : 'active',
      auto_isolate ? 1 : 0,
      mitigationCli
    ]);

    // Update ONU status flag
    await dbQuery.run(`
      UPDATE onus
      SET loop_detected = 1, isolated_lan_port = ?, last_loop_at = CURRENT_TIMESTAMP
      WHERE onu_id = ?
    `, [parseInt(lan_port, 10), targetOnu.onu_id]);

    // Audit log
    await createAuditLog({
      user: req.user,
      action: 'Deteksi & Isolasi Otomatis Loopback Port LAN (Simulasi)',
      target_device_id: device.device_id,
      target_device_name: device.name,
      details: {
        incident_id: insertResult.lastID,
        onu_id: targetOnu.onu_id,
        serial_number: targetOnu.serial_number,
        lan_port,
        flapping_mac: syntheticMac,
        storm_rate_pps: 5400,
        auto_isolated: auto_isolate,
        mitigation_cli: mitigationCli
      }
    });

    // Telegram CRITICAL Alert
    dispatchIncidentAlert({
      eventType: 'LOOPBACK_DETECTED',
      severity: 'CRITICAL',
      deviceName: device.name,
      targetOnu: targetOnu.serial_number,
      details: {
        customer_name: targetOnu.customer_name || targetOnu.onu_name,
        port: `${targetOnu.pon_port_id}:${targetOnu.onu_index || 1}`,
        lan_port,
        mac_address: syntheticMac,
        storm_rate_pps: 5400,
        auto_isolated: auto_isolate
      }
    }).catch(err => console.warn('Telegram loop alert error:', err.message));

    // Broadcast SSE
    broadcastEvent('LOOPBACK_DETECTED', {
      incident_id: insertResult.lastID,
      onu_id: targetOnu.onu_id,
      device_name: device.name,
      lan_port,
      mac_address: syntheticMac
    });

    res.json({
      success: true,
      message: `Simulasi gangguan loopback & broadcast storm berhasil diaktifkan pada ONU ${targetOnu.serial_number} (Port LAN ${lan_port} diisolasi).`,
      incident_id: insertResult.lastID,
      onu_id: targetOnu.onu_id,
      serial_number: targetOnu.serial_number,
      lan_port,
      mac_address: syntheticMac,
      auto_isolated: auto_isolate,
      cli_executed: mitigationCli
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}
