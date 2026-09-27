import { dbQuery } from '../db/index.js';
import { AdapterFactory } from '../adapters/adapter_factory.js';
import { createAuditLog } from '../services/audit_service.js';
import { detectOLTCards } from '../services/olt_ssh_service.js';

export async function getDevices(req, res) {
  try {
    const devices = await dbQuery.all('SELECT * FROM devices ORDER BY device_id ASC');
    // Calculate connected ONU count per device
    const onus = await dbQuery.all('SELECT device_id, COUNT(*) as onu_count FROM onus GROUP BY device_id');
    const onuMap = {};
    onus.forEach(o => { onuMap[o.device_id] = o.onu_count; });

    const result = devices.map(d => {
      let parsedCards = [];
      try {
        parsedCards = typeof d.cards === 'string' ? JSON.parse(d.cards) : (d.cards || []);
      } catch {
        parsedCards = [];
      }
      if (!parsedCards || parsedCards.length === 0) {
        parsedCards = [{ slot: 1, type: d.vendor === 'ZTE' ? 'GTGO' : 'GPFD', ports: d.pon_ports_count || 8, status: 'INSERVICE' }];
      }
      return {
        ...d,
        cards: parsedCards,
        onu_count: onuMap[d.device_id] || 0
      };
    });

    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

export async function createDevice(req, res) {
  try {
    const { name, vendor, ip_address, port = 22, credentials, pon_ports_count = 8, cards } = req.body;
    if (!name || !vendor || !ip_address) {
      return res.status(400).json({ error: 'Nama, vendor, dan IP address wajib diisi' });
    }

    const credStr = typeof credentials === 'string' ? credentials : JSON.stringify(credentials || { user: 'admin', pass: 'admin' });
    
    // Normalize cards
    let finalCards = cards;
    if (!finalCards || (Array.isArray(finalCards) && finalCards.length === 0)) {
      finalCards = [{ slot: 1, type: vendor === 'ZTE' ? 'GTGO' : 'GPFD', ports: pon_ports_count, status: 'INSERVICE' }];
    }
    const cardsStr = typeof finalCards === 'string' ? finalCards : JSON.stringify(finalCards);

    const result = await dbQuery.run(
      `INSERT INTO devices (name, vendor, ip_address, port, credentials, status, pon_ports_count, cards)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [name, vendor, ip_address, port, credStr, 'Online', pon_ports_count, cardsStr]
    );

    await createAuditLog({
      user: req.user,
      action: 'Tambah Device OLT',
      target_device_id: result.lastID,
      target_device_name: name,
      details: { vendor, ip_address, pon_ports_count, cards: finalCards }
    });

    res.status(201).json({ message: 'Perangkat OLT berhasil ditambahkan', device_id: result.lastID });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

export async function updateDevice(req, res) {
  try {
    const { device_id } = req.params;
    const { name, vendor, ip_address, port, credentials, pon_ports_count, cards } = req.body;

    const device = await dbQuery.get('SELECT * FROM devices WHERE device_id = ?', [device_id]);
    if (!device) {
      return res.status(404).json({ error: 'Device tidak ditemukan' });
    }

    const credStr = credentials ? (typeof credentials === 'string' ? credentials : JSON.stringify(credentials)) : device.credentials;
    const cardsStr = cards !== undefined
      ? (typeof cards === 'string' ? cards : JSON.stringify(cards))
      : device.cards;

    await dbQuery.run(
      `UPDATE devices SET name = ?, vendor = ?, ip_address = ?, port = ?, credentials = ?, pon_ports_count = ?, cards = ?, last_seen = CURRENT_TIMESTAMP WHERE device_id = ?`,
      [
        name || device.name,
        vendor || device.vendor,
        ip_address || device.ip_address,
        port || device.port,
        credStr,
        pon_ports_count || device.pon_ports_count,
        cardsStr,
        device_id
      ]
    );

    await createAuditLog({
      user: req.user,
      action: 'Update Device OLT',
      target_device_id: device_id,
      target_device_name: name || device.name,
      details: { vendor, ip_address, cards }
    });

    res.json({ message: 'Perangkat OLT berhasil diperbarui' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

export async function deleteDevice(req, res) {
  try {
    const { device_id } = req.params;
    const device = await dbQuery.get('SELECT * FROM devices WHERE device_id = ?', [device_id]);
    if (!device) {
      return res.status(404).json({ error: 'Device tidak ditemukan' });
    }

    await dbQuery.run('DELETE FROM devices WHERE device_id = ?', [device_id]);

    await createAuditLog({
      user: req.user,
      action: 'Hapus Device OLT',
      target_device_id: device_id,
      target_device_name: device.name,
      details: { vendor: device.vendor, ip_address: device.ip_address }
    });

    res.json({ message: 'Perangkat OLT berhasil dihapus' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

export async function getDeviceStatus(req, res) {
  try {
    const { device_id } = req.params;
    const device = await dbQuery.get('SELECT * FROM devices WHERE device_id = ?', [device_id]);
    if (!device) {
      return res.status(404).json({ error: 'Device tidak ditemukan' });
    }

    const adapter = AdapterFactory.getAdapter(device);
    const connStatus = await adapter.testConnection();
    const newStatus = connStatus.success ? 'Online' : 'Offline';

    // Update status in DB
    await dbQuery.run('UPDATE devices SET status = ?, last_seen = CURRENT_TIMESTAMP WHERE device_id = ?', [newStatus, device_id]);

    res.json({
      device_id: device.device_id,
      name: device.name,
      vendor: device.vendor,
      ip_address: device.ip_address,
      status: newStatus,
      details: connStatus
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

export async function executeDeviceCommand(req, res) {
  try {
    const { device_id } = req.params;
    const { command } = req.body;
    if (!command) {
      return res.status(400).json({ error: 'Perintah (command) wajib diisi' });
    }

    const device = await dbQuery.get('SELECT * FROM devices WHERE device_id = ?', [device_id]);
    if (!device) {
      return res.status(404).json({ error: 'Device tidak ditemukan' });
    }

    const adapter = AdapterFactory.getAdapter(device);
    const result = await adapter.executeCommand(command);

    await createAuditLog({
      user: req.user,
      action: 'Eksekusi CLI OLT',
      target_device_id: device_id,
      target_device_name: device.name,
      details: { command, vendor: device.vendor }
    });

    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

/**
 * Detect physical cards on existing device via SSH
 */
export async function detectDeviceCards(req, res) {
  try {
    const { device_id } = req.params;
    const device = await dbQuery.get('SELECT * FROM devices WHERE device_id = ?', [device_id]);
    if (!device) {
      return res.status(404).json({ error: 'Device tidak ditemukan' });
    }

    const result = await detectOLTCards(device);
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

/**
 * Detect physical cards directly using provided connection parameters (e.g. before saving new device)
 */
export async function detectCardsRaw(req, res) {
  try {
    const { vendor = 'ZTE', ip_address, port = 22, credentials } = req.body;
    if (!ip_address) {
      return res.status(400).json({ error: 'IP Address wajib diisi untuk deteksi card' });
    }

    const tempDevice = {
      vendor,
      ip_address,
      port,
      credentials
    };

    const result = await detectOLTCards(tempDevice);
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

/**
 * Fetch supported ONU Types configured or available on the OLT
 */
export async function getDeviceONUTypes(req, res) {
  try {
    const { device_id } = req.params;
    const device = await dbQuery.get('SELECT * FROM devices WHERE device_id = ?', [device_id]);
    if (!device) {
      return res.status(404).json({ error: 'Device tidak ditemukan' });
    }

    const adapter = AdapterFactory.getAdapter(device);
    if (typeof adapter.getONUTypes === 'function') {
      const types = await adapter.getONUTypes();
      return res.json(types);
    }

    // Default fallback
    res.json([
      { name: 'VSOL2L', description: '2LAN_WIFI' },
      { name: 'ALL', description: 'Universal 4ETH+4WiFi' },
      { name: 'ZTE', description: 'ZTE Standard' }
    ]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}


