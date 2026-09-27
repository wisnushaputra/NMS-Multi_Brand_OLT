import { dbQuery } from '../db/index.js';
import { AdapterFactory } from '../adapters/adapter_factory.js';
import { createAuditLog } from '../services/audit_service.js';
import { syncPPPoESecret, updatePPPoEProfile, kickPPPoESession } from '../services/mikrotik_service.js';
import { dispatchIncidentAlert } from '../services/notification_service.js';

export async function getONUs(req, res) {
  try {
    const { device_id } = req.query;
    let sql = `
      SELECT o.*, d.name as device_name, d.vendor as device_vendor, sp.name as profile_name, sp.vlan_profile
      FROM onus o
      LEFT JOIN devices d ON o.device_id = d.device_id
      LEFT JOIN service_profiles sp ON o.service_profile_id = sp.profile_id
    `;
    const params = [];
    if (device_id && device_id !== 'all') {
      sql += ' WHERE o.device_id = ?';
      params.push(parseInt(device_id, 10));
    }
    sql += ' ORDER BY o.onu_id DESC';

    const onus = await dbQuery.all(sql, params);
    res.json(onus);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

export async function provisionONU(req, res) {
  try {
    const { device_id, serial_number, pon_port_id, service_profile_id, pppoe_username, pppoe_password, onu_name, onu_index, card_slot = 1 } = req.body;

    if (!device_id || !serial_number || !pon_port_id || !service_profile_id) {
      return res.status(400).json({ error: 'device_id, serial_number, pon_port_id, dan service_profile_id wajib diisi' });
    }

    const device = await dbQuery.get('SELECT * FROM devices WHERE device_id = ?', [device_id]);
    if (!device) {
      return res.status(404).json({ error: 'Device OLT tidak ditemukan' });
    }

    const profile = await dbQuery.get('SELECT * FROM service_profiles WHERE profile_id = ?', [service_profile_id]);
    if (!profile) {
      return res.status(404).json({ error: 'Service Profile tidak ditemukan' });
    }

    const finalCardSlot = card_slot ? parseInt(card_slot, 10) : 1;

    // Sanitasi Serial Number (hanya alfanumerik kapital)
    const cleanSerialNumber = (serial_number || '').trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
    if (!cleanSerialNumber || cleanSerialNumber.length < 6) {
      return res.status(400).json({ error: 'Format Serial Number tidak valid (minimal 6 karakter alfanumerik)' });
    }

    // Check duplicate serial number
    const existingONU = await dbQuery.get('SELECT * FROM onus WHERE serial_number = ?', [cleanSerialNumber]);
    if (existingONU) {
      return res.status(400).json({ error: `ONU dengan Serial Number ${cleanSerialNumber} sudah terdaftar` });
    }

    // Sanitasi nama ONU (maks 32 karakter, tanpa karakter kontrol / spasi diganti underscore jika perlu)
    const rawOnuName = (onu_name || '').trim();
    const sanitizedOnuName = rawOnuName
      ? rawOnuName.replace(/[^a-zA-Z0-9_\-\s]/g, '').trim().replace(/\s+/g, '_').slice(0, 32)
      : null;
    const finalOnuName = sanitizedOnuName || `ONU_${cleanSerialNumber}`;

    // Sanitasi kredensial PPPoE
    const finalPppoeUser = pppoe_username ? pppoe_username.trim().replace(/[\r\n\t"'\\]/g, '') : null;
    const finalPppoePass = pppoe_password ? pppoe_password.trim().replace(/[\r\n\t"'\\]/g, '') : null;
    const selectedPppoeProfile = profile.name ? profile.name.trim() : 'profile_50mbps';

    let finalOnuIndex = onu_index ? parseInt(onu_index, 10) : null;

    if (finalOnuIndex) {
      // Anti-collision check: verify if (device_id, card_slot, pon_port_id, onu_index) is already used
      const collision = await dbQuery.get(
        'SELECT * FROM onus WHERE device_id = ? AND card_slot = ? AND pon_port_id = ? AND onu_index = ?',
        [device_id, finalCardSlot, pon_port_id, finalOnuIndex]
      );
      if (collision) {
        return res.status(400).json({
          error: `Bentrok ONU Index! Interface 1/${finalCardSlot}/${pon_port_id} Index ${finalOnuIndex} sudah terpakai oleh ONU ${collision.serial_number} (${collision.onu_name || 'Tanpa Nama'}). Silakan gunakan index lain.`
        });
      }
    } else {
      // Auto-assign lowest available index starting from 1
      const usedRows = await dbQuery.all(
        'SELECT onu_index FROM onus WHERE device_id = ? AND card_slot = ? AND pon_port_id = ?',
        [device_id, finalCardSlot, pon_port_id]
      );
      const usedSet = new Set(usedRows.map((r) => r.onu_index || 1));
      let nextIdx = 1;
      while (usedSet.has(nextIdx) && nextIdx <= 128) {
        nextIdx++;
      }
      finalOnuIndex = nextIdx;
    }

    const finalOnuType = (req.body.onu_type || req.body.onuType || 'VSOL2L').trim();
    const customCli = (typeof req.body.custom_cli === 'string' && req.body.custom_cli.trim().length > 0)
      ? req.body.custom_cli.trim()
      : null;

    // Instantiate adapter and perform provision
    const adapter = AdapterFactory.getAdapter(device);
    const provisionResult = await adapter.provisionONU({
      serialNumber: cleanSerialNumber,
      cardSlot: finalCardSlot,
      ponPort: pon_port_id,
      onuIndex: finalOnuIndex,
      onuType: finalOnuType,
      serviceProfileName: profile.name,
      vlanId: profile.vlan_id,
      onuName: finalOnuName,
      pppoeUsername: finalPppoeUser,
      customCli
    });

    let pppoeResult = null;
    let mikrotikResult = null;

    if (finalPppoeUser && finalPppoePass) {
      const customHandledOmci = customCli && (customCli.includes('pon-onu-mng') || customCli.includes('ont ipconfig') || customCli.includes('set onu wan'));

      if (!customHandledOmci) {
        const tr069Row = await dbQuery.get('SELECT value FROM system_settings WHERE key = ?', ['tr069_acs_url']);
        const finalAcsUrl = req.body.tr069_acs_url || tr069Row?.value || 'http://103.176.227.233:3001/';

        pppoeResult = await adapter.configurePPPoE({
          serialNumber: cleanSerialNumber,
          cardSlot: finalCardSlot,
          ponPort: pon_port_id,
          onuIndex: finalOnuIndex,
          pppoeUsername: finalPppoeUser,
          pppoePassword: finalPppoePass,
          vlanId: profile.vlan_id,
          vlanProfile: profile.vlan_profile,
          profileName: profile.name,
          acsUrl: finalAcsUrl
        });
      } else {
        pppoeResult = {
          success: true,
          message: 'Konfigurasi OMCI PPPoE & TR-069 telah dieksekusi melalui Custom CLI script.'
        };
      }

      // Auto-create PPPoE Secret on MikroTik Core Router with actual package profile
      try {
        mikrotikResult = await syncPPPoESecret({
          username: finalPppoeUser,
          password: finalPppoePass,
          profile: selectedPppoeProfile,
          comment: `ONU ${cleanSerialNumber} (${finalOnuName || device.name})`
        });
      } catch (mErr) {
        console.warn('Warning: Failed to sync PPPoE Secret to MikroTik:', mErr.message);
      }
    }

    // Perform baseline optical power read directly from OLT
    const opticalPreCheck = await adapter.checkPreOpticalPower({
      serialNumber: cleanSerialNumber,
      cardSlot: finalCardSlot,
      ponPort: pon_port_id,
      onuIndex: finalOnuIndex
    });
    const measuredRx = opticalPreCheck?.rxPower ?? null;
    const measuredDist = opticalPreCheck?.distanceMeters ?? null;

    // Save ONU to DB with correct card_slot, onu_type, and PPPoE profile
    const insertResult = await dbQuery.run(
      `INSERT INTO onus (
        device_id, serial_number, onu_name, onu_index, card_slot, pon_port_id, 
        vlan_id, service_profile_id, status, pppoe_username, pppoe_password, 
        pppoe_profile, billing_status, rx_power, distance_meters, onu_type
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        device_id,
        cleanSerialNumber,
        finalOnuName,
        finalOnuIndex,
        finalCardSlot,
        pon_port_id,
        profile.vlan_id,
        service_profile_id,
        'Online',
        finalPppoeUser || null,
        finalPppoePass || null,
        selectedPppoeProfile,
        'active',
        measuredRx,
        measuredDist,
        finalOnuType
      ]
    );

    await createAuditLog({
      user: req.user,
      action: 'Provision ONU',
      target_device_id: device_id,
      target_device_name: device.name,
      details: {
        onu_id: insertResult.lastID,
        serial_number: cleanSerialNumber,
        onu_name: finalOnuName,
        card_slot: finalCardSlot,
        pon_port_id,
        onu_index: finalOnuIndex,
        pon_port: `1/${finalCardSlot}/${pon_port_id}:${finalOnuIndex}`,
        vlan_id: profile.vlan_id,
        profile_name: profile.name,
        pppoe_profile: selectedPppoeProfile,
        pppoe_username: finalPppoeUser,
        mikrotik_secret_synced: !!mikrotikResult
      }
    });

    // Auto-dispatch notification to Telegram NOC Group
    dispatchIncidentAlert({
      eventType: 'ONU_PROVISIONED',
      severity: 'INFO',
      deviceName: device.name,
      targetOnu: serial_number,
      details: {
        status: 'Online (Provisioned)',
        customer_name: finalOnuName,
        port: `1/${finalCardSlot}/${pon_port_id}:${finalOnuIndex}`,
        profile: profile.name,
        pppoe_username: finalPppoeUser,
        rx_power: `${measuredRx} dBm`,
        technician: req.user?.username || 'Admin'
      }
    }).catch((err) => console.warn('Telegram provision dispatch error:', err.message));

    res.status(201).json({
      message: 'Provisi ONU berhasil dilakukan',
      onu_id: insertResult.lastID,
      provisionDetails: provisionResult,
      pppoeDetails: pppoeResult,
      mikrotikDetails: mikrotikResult
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

export async function pushPPPoE(req, res) {
  try {
    const { onu_id } = req.params;
    const { pppoe_username, pppoe_password } = req.body;

    const cleanUsername = (pppoe_username || '').trim().replace(/[\r\n\t"'\\]/g, '');
    const cleanPassword = (pppoe_password || '').trim().replace(/[\r\n\t"'\\]/g, '');

    if (!cleanUsername || !cleanPassword) {
      return res.status(400).json({ error: 'pppoe_username dan pppoe_password valid wajib diisi' });
    }

    const onu = await dbQuery.get('SELECT * FROM onus WHERE onu_id = ?', [onu_id]);
    if (!onu) {
      return res.status(404).json({ error: 'ONU tidak ditemukan' });
    }

    const device = await dbQuery.get('SELECT * FROM devices WHERE device_id = ?', [onu.device_id]);
    if (!device) {
      return res.status(404).json({ error: 'Device OLT tidak ditemukan' });
    }

    const profile = onu.service_profile_id ? await dbQuery.get('SELECT * FROM service_profiles WHERE profile_id = ?', [onu.service_profile_id]) : null;
    const tr069Row = await dbQuery.get('SELECT value FROM system_settings WHERE key = ?', ['tr069_acs_url']);
    const finalAcsUrl = req.body.tr069_acs_url || tr069Row?.value || 'http://103.176.227.233:3001/';

    const adapter = AdapterFactory.getAdapter(device);
    const pppoeResult = await adapter.configurePPPoE({
      serialNumber: onu.serial_number,
      ponPort: onu.pon_port_id,
      onuIndex: onu.onu_index || 1,
      pppoeUsername: cleanUsername,
      pppoePassword: cleanPassword,
      vlanId: onu.vlan_id,
      profileName: profile?.name || 'INTERNET',
      acsUrl: finalAcsUrl
    });

    // Sync updated secret to MikroTik
    try {
      await syncPPPoESecret({
        username: cleanUsername,
        password: cleanPassword,
        profile: onu.pppoe_profile || profile?.name || 'profile_50mbps',
        comment: `ONU ${onu.serial_number} (${onu.onu_name || device.name})`
      });
    } catch (mErr) {
      console.warn('Warning: Failed to sync updated PPPoE Secret to MikroTik:', mErr.message);
    }

    await dbQuery.run(
      'UPDATE onus SET pppoe_username = ?, pppoe_password = ? WHERE onu_id = ?',
      [cleanUsername, cleanPassword, onu_id]
    );

    await createAuditLog({
      user: req.user,
      action: 'Push PPPoE Credentials',
      target_device_id: device.device_id,
      target_device_name: device.name,
      details: { onu_id, serial_number: onu.serial_number, pppoe_username: cleanUsername }
    });

    res.json({
      message: 'Konfigurasi PPPoE berhasil didorong ke ONU',
      result: pppoeResult
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

export async function deleteONU(req, res) {
  try {
    const { onu_id } = req.params;
    const onu = await dbQuery.get('SELECT * FROM onus WHERE onu_id = ?', [onu_id]);
    if (!onu) {
      return res.status(404).json({ error: 'ONU tidak ditemukan' });
    }

    // Unregister from physical OLT hardware if device is online/active
    if (onu.device_id) {
      try {
        const device = await dbQuery.get('SELECT * FROM devices WHERE device_id = ?', [onu.device_id]);
        if (device) {
          const adapter = AdapterFactory.getAdapter(device);
          if (typeof adapter.deleteONU === 'function') {
            await adapter.deleteONU({
              serialNumber: onu.serial_number,
              cardSlot: onu.card_slot || 1,
              ponPort: onu.pon_port_id,
              onuIndex: onu.onu_index
            });
          }
        }
      } catch (adapterErr) {
        console.warn(`[deleteONU] Gagal unregister ONU dari hardware OLT:`, adapterErr.message);
      }
    }

    await dbQuery.run('DELETE FROM onus WHERE onu_id = ?', [onu_id]);

    await createAuditLog({
      user: req.user,
      action: 'Hapus / Unregister ONU',
      target_device_id: onu.device_id,
      details: { onu_id, serial_number: onu.serial_number }
    });

    res.json({ message: 'ONU berhasil dihapus dari sistem dan OLT' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

export async function getUnconfiguredONUs(req, res) {
  try {
    const { device_id } = req.query;
    let devices = [];
    if (device_id) {
      const dev = await dbQuery.get('SELECT * FROM devices WHERE device_id = ?', [device_id]);
      if (dev) devices.push(dev);
    } else {
      devices = await dbQuery.all('SELECT * FROM devices');
    }

    let unconfiguredList = [];
    for (const dev of devices) {
      try {
        const adapter = AdapterFactory.getAdapter(dev);
        const uncfg = await adapter.getUnconfiguredONUs();
        uncfg.forEach(item => {
          unconfiguredList.push({
            ...item,
            device_id: dev.device_id,
            device_name: dev.name,
            device_vendor: dev.vendor
          });
        });
      } catch (e) {
        console.error(`Error scanning unconfigured ONUs on ${dev.name}:`, e.message);
      }
    }

    res.json(unconfiguredList);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

export async function getONUStatus(req, res) {
  try {
    const { onu_id } = req.params;
    const onu = await dbQuery.get(`
      SELECT o.*, d.name as device_name, d.vendor as device_vendor, sp.name as profile_name
      FROM onus o
      JOIN devices d ON o.device_id = d.device_id
      LEFT JOIN service_profiles sp ON o.service_profile_id = sp.profile_id
      WHERE o.onu_id = ?
    `, [onu_id]);

    if (!onu) {
      return res.status(404).json({ error: 'ONU tidak ditemukan' });
    }

    const device = await dbQuery.get('SELECT * FROM devices WHERE device_id = ?', [onu.device_id]);
    if (!device) {
      return res.status(404).json({ error: 'Device OLT tidak ditemukan' });
    }

    const adapter = AdapterFactory.getAdapter(device);
    const statusData = await adapter.getONUStatus(onu.serial_number, {
      cardSlot: onu.card_slot,
      ponPort: onu.pon_port_id,
      onuIndex: onu.onu_index || 1,
      status: onu.status,
      rxPower: onu.rx_power,
      distance: onu.distance_meters,
      offlineReason: onu.last_offline_reason,
      lastOfflineAt: onu.last_offline_at
    });

    // Automatically sync live telemetry back to database if live query succeeded
    if (statusData && (statusData.rxPower !== undefined || statusData.status || statusData.distanceMeters !== undefined)) {
      const updatedRx = statusData.rxPower !== undefined ? statusData.rxPower : onu.rx_power;
      const updatedStatus = statusData.status || onu.status;
      const updatedDist = statusData.distanceMeters !== undefined ? statusData.distanceMeters : onu.distance_meters;

      await dbQuery.run(
        `UPDATE onus SET rx_power = ?, status = ?, distance_meters = ? WHERE onu_id = ?`,
        [updatedRx, updatedStatus, updatedDist, onu.onu_id]
      );

      if (updatedRx !== null && updatedRx !== undefined) {
        dbQuery.run(
          `INSERT INTO optical_history (onu_id, rx_power, status) VALUES (?, ?, ?)`,
          [onu.onu_id, updatedRx, updatedStatus]
        ).catch(() => {});
      }

      onu.rx_power = updatedRx;
      onu.status = updatedStatus;
      onu.distance_meters = updatedDist;
    }

    res.json({
      success: true,
      data: {
        ...onu,
        device_name: device.name,
        device_vendor: device.vendor,
        vendor_status: statusData
      },
      ...onu,
      device_name: device.name,
      device_vendor: device.vendor,
      vendor_status: statusData
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

/**
 * Auto-Find Next Available ONU Index (Anti-Bentrok ID)
 * GET /api/devices/:deviceId/ports/:portId/next-onu-index
 */
export async function getNextAvailableONUIndex(req, res) {
  try {
    const { deviceId, portId } = req.params;
    const cardSlot = parseInt(req.query.card_slot || req.query.cardSlot, 10) || 1;
    const devId = parseInt(deviceId, 10);
    const pId = parseInt(portId, 10);

    if (isNaN(devId) || isNaN(pId)) {
      return res.status(400).json({ error: 'deviceId dan portId harus berupa angka valid' });
    }

    const rows = await dbQuery.all(
      'SELECT onu_id, serial_number, onu_name, onu_index FROM onus WHERE device_id = ? AND card_slot = ? AND pon_port_id = ? ORDER BY onu_index ASC',
      [devId, cardSlot, pId]
    );

    const usedIndices = rows.map((r) => r.onu_index || 1);
    const usedSet = new Set(usedIndices);

    // Standard GPON capacity is 128 ONUs per PON port
    const maxCapacity = 128;
    let nextIndex = 1;
    while (usedSet.has(nextIndex) && nextIndex <= maxCapacity) {
      nextIndex++;
    }

    const isFull = nextIndex > maxCapacity;

    res.json({
      device_id: devId,
      card_slot: cardSlot,
      pon_port_id: pId,
      next_available_index: isFull ? null : nextIndex,
      is_full: isFull,
      max_capacity: maxCapacity,
      used_count: usedIndices.length,
      available_count: Math.max(0, maxCapacity - usedIndices.length),
      used_indices: Array.from(usedSet).sort((a, b) => a - b),
      registered_onus: rows.map((r) => ({
        onu_id: r.onu_id,
        serial_number: r.serial_number,
        onu_name: r.onu_name,
        onu_index: r.onu_index
      }))
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

/**
 * Pre-Activation Optical Power Check
 * POST /api/onu/pre-check-optical
 */
export async function checkPreOpticalPower(req, res) {
  try {
    const { device_id, serial_number, pon_port_id, card_slot, onu_index } = req.body;
    if (!device_id || !serial_number) {
      return res.status(400).json({ error: 'device_id dan serial_number wajib diisi' });
    }

    const device = await dbQuery.get('SELECT * FROM devices WHERE device_id = ?', [device_id]);
    if (!device) {
      return res.status(404).json({ error: 'Device OLT tidak ditemukan' });
    }

    const adapter = AdapterFactory.getAdapter(device);
    const opticalResult = await adapter.checkPreOpticalPower({
      serialNumber: String(serial_number).trim(),
      cardSlot: parseInt(card_slot || req.body.cardSlot, 10) || 2,
      ponPort: parseInt(pon_port_id, 10) || 1,
      onuIndex: onu_index || req.body.onuIndex
    });

    res.json(opticalResult);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

/**
 * Swap / Replace ONU Hardware
 * POST /api/onu/:onu_id/replace
 */
export async function replaceONU(req, res) {
  try {
    const { onu_id } = req.params;
    const { new_serial_number, reason = 'Kerusakan Perangkat / Penggantian Hardware' } = req.body;

    if (!new_serial_number || !new_serial_number.trim()) {
      return res.status(400).json({ error: 'Serial Number baru wajib diisi' });
    }

    const newSN = new_serial_number.trim().toUpperCase();

    // 1. Check existing ONU
    const onu = await dbQuery.get('SELECT * FROM onus WHERE onu_id = ?', [onu_id]);
    if (!onu) {
      return res.status(404).json({ error: 'Data ONU tidak ditemukan' });
    }

    if (onu.serial_number === newSN) {
      return res.status(400).json({ error: 'Serial Number baru tidak boleh sama dengan Serial Number lama' });
    }

    // Check if new serial number is already registered
    const duplicate = await dbQuery.get('SELECT * FROM onus WHERE serial_number = ? AND onu_id != ?', [newSN, onu_id]);
    if (duplicate) {
      return res.status(400).json({ error: `Serial Number ${newSN} sudah terdaftar pada pelanggan ${duplicate.customer_name || duplicate.onu_name || duplicate.onu_id}` });
    }

    const device = await dbQuery.get('SELECT * FROM devices WHERE device_id = ?', [onu.device_id]);
    if (!device) {
      return res.status(404).json({ error: 'Perangkat OLT tidak ditemukan' });
    }

    const profile = onu.service_profile_id ? await dbQuery.get('SELECT * FROM service_profiles WHERE profile_id = ?', [onu.service_profile_id]) : null;
    const tr069Row = await dbQuery.get('SELECT value FROM system_settings WHERE key = ?', ['tr069_acs_url']);
    const acsUrl = req.body.tr069_acs_url || tr069Row?.value || 'http://103.176.227.233:3001/';
    const finalOnuType = (req.body.onu_type || req.body.onuType || req.body.model || onu.onu_type || 'ZTE').trim();

    // 2. Execute adapter swap commands on OLT
    const adapter = AdapterFactory.getAdapter(device);
    const swapResult = await adapter.replaceONU({
      oldSerialNumber: onu.serial_number,
      newSerialNumber: newSN,
      cardSlot: onu.card_slot || 2,
      ponPort: onu.pon_port_id,
      onuIndex: onu.onu_index || 1,
      onuType: finalOnuType,
      customerName: onu.customer_name || onu.onu_name || '',
      pppoeUsername: onu.pppoe_username || '',
      pppoePassword: onu.pppoe_password || '',
      vlanId: onu.vlan_id || profile?.vlan_id || 100,
      vlanProfile: profile?.vlan_profile,
      profileName: profile?.name || 'INTERNET',
      acsUrl
    });

    // 3. Measure optical power of the new ONU
    let measuredRx = -19.5;
    let measuredDist = 450;
    try {
      const opticalPreCheck = await adapter.checkPreOpticalPower({
        serialNumber: newSN,
        ponPort: onu.pon_port_id
      });
      if (opticalPreCheck && opticalPreCheck.rxPower !== undefined) {
        measuredRx = opticalPreCheck.rxPower;
        measuredDist = opticalPreCheck.distanceMeters || 450;
      }
    } catch (optErr) {
      console.warn('Could not read optical diagnostics for swapped ONU:', optErr.message);
    }

    // 4. Update ONU record in DB
    const oldSN = onu.serial_number;
    await dbQuery.run(
      `UPDATE onus SET 
        serial_number = ?, 
        onu_type = ?,
        rx_power = ?, 
        distance_meters = ?, 
        status = 'Online'
      WHERE onu_id = ?`,
      [newSN, finalOnuType, measuredRx, measuredDist, onu_id]
    );

    // 5. Update comment in MikroTik BRAS secret if PPPoE is used
    if (onu.pppoe_username) {
      try {
        await syncPPPoESecret({
          username: onu.pppoe_username,
          password: onu.pppoe_password,
          profile: onu.pppoe_profile || 'profile_50mbps',
          comment: `ONU ${newSN} (${onu.customer_name || onu.onu_name || device.name}) [Swapped from ${oldSN}]`
        });
      } catch (mErr) {
        console.warn('Failed to update MikroTik comment after swap:', mErr.message);
      }
    }

    // 6. Record Audit Log
    await createAuditLog({
      user: req.user,
      action: 'Tukar Perangkat ONU (Swap)',
      target_device_id: device.device_id,
      target_device_name: device.name,
      details: {
        onu_id: onu.onu_id,
        customer_name: onu.customer_name || onu.onu_name,
        port: `1/1/${onu.pon_port_id}:${onu.onu_index || 1}`,
        old_serial_number: oldSN,
        new_serial_number: newSN,
        measured_rx_power: measuredRx,
        reason
      }
    });

    // Auto-dispatch notification to Telegram NOC Group for ONU Swap
    dispatchIncidentAlert({
      eventType: 'ONU_SWAPPED',
      severity: 'WARNING',
      deviceName: device.name,
      targetOnu: newSN,
      details: {
        status: 'Hardware Swapped',
        customer_name: onu.customer_name || onu.onu_name,
        port: `1/1/${onu.pon_port_id}:${onu.onu_index || 1}`,
        old_serial_number: oldSN,
        new_serial_number: newSN,
        reason,
        rx_power: `${measuredRx} dBm`,
        technician: req.user?.username || 'Admin'
      }
    }).catch((err) => console.warn('Telegram swap dispatch error:', err.message));

    res.json({
      success: true,
      message: `Pergantian perangkat berhasil! ONU ${oldSN} digantikan oleh ${newSN}`,
      onu_id: onu.onu_id,
      old_sn: oldSN,
      new_sn: newSN,
      old_serial_number: oldSN,
      new_serial_number: newSN,
      rx_power: measuredRx,
      distance_meters: measuredDist,
      swapDetails: swapResult
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

export async function rebootONU(req, res) {
  try {
    const { onu_id } = req.params;
    const onu = await dbQuery.get('SELECT * FROM onus WHERE onu_id = ?', [onu_id]);
    if (!onu) {
      return res.status(404).json({ error: 'ONU tidak ditemukan' });
    }

    const device = await dbQuery.get('SELECT * FROM devices WHERE device_id = ?', [onu.device_id]);
    if (!device) {
      return res.status(404).json({ error: 'Device OLT tidak ditemukan' });
    }

    const adapter = AdapterFactory.getAdapter(device);
    const rebootResult = await adapter.rebootONU({
      serialNumber: onu.serial_number,
      cardSlot: onu.card_slot || 2,
      ponPort: onu.pon_port_id,
      onuIndex: onu.onu_index || 1
    });

    await createAuditLog({
      user: req.user,
      action: 'Remote Reboot ONU',
      target_device_id: device.device_id,
      target_device_name: device.name,
      details: {
        onu_id: onu.onu_id,
        serial_number: onu.serial_number,
        onu_name: onu.onu_name,
        pon_port: `1/${onu.card_slot || 2}/${onu.pon_port_id}:${onu.onu_index || 1}`,
        reboot_result: rebootResult
      }
    });

    // Auto-dispatch notification to Telegram NOC Group
    dispatchIncidentAlert({
      eventType: 'ONU_REBOOTED',
      severity: 'INFO',
      deviceName: device.name,
      targetOnu: onu.serial_number,
      details: {
        customer_name: onu.onu_name || onu.serial_number,
        port: `1/${onu.card_slot || 2}/${onu.pon_port_id}:${onu.onu_index || 1}`,
        action_by: req.user?.username || 'NOC Admin',
        description: 'Perintah restart modem dikirim melalui NMS Web Console.'
      }
    }).catch((err) => console.warn('Telegram reboot dispatch error:', err.message));

    res.json({
      success: true,
      message: `Perintah remote reboot berhasil dikirim ke ONU ${onu.serial_number}`,
      data: rebootResult
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

/**
 * Change / Override Service Profile without unregistering ONU
 * POST /api/onu/:onu_id/change-profile
 */
export async function changeONUProfile(req, res) {
  try {
    const { onu_id } = req.params;
    const { service_profile_id, kick_session } = req.body;

    if (!service_profile_id) {
      return res.status(400).json({ error: 'service_profile_id baru wajib ditentukan' });
    }

    const onu = await dbQuery.get(`
      SELECT o.*, d.name as device_name, d.vendor as device_vendor, sp.name as current_profile_name
      FROM onus o
      JOIN devices d ON o.device_id = d.device_id
      LEFT JOIN service_profiles sp ON o.service_profile_id = sp.profile_id
      WHERE o.onu_id = ?
    `, [onu_id]);

    if (!onu) {
      return res.status(404).json({ error: 'ONU tidak ditemukan' });
    }

    const newProfile = await dbQuery.get('SELECT * FROM service_profiles WHERE profile_id = ?', [service_profile_id]);
    if (!newProfile) {
      return res.status(404).json({ error: 'Paket layanan baru tidak ditemukan' });
    }

    if (onu.service_profile_id === newProfile.profile_id) {
      return res.status(400).json({ error: `ONU sudah menggunakan paket ${newProfile.name}` });
    }

    const device = await dbQuery.get('SELECT * FROM devices WHERE device_id = ?', [onu.device_id]);
    if (!device) {
      return res.status(404).json({ error: 'Device OLT tidak ditemukan' });
    }

    // 1. Execute CLI on OLT Adapter
    const adapter = AdapterFactory.getAdapter(device);
    const adapterResult = await adapter.modifyServiceProfile({
      serialNumber: onu.serial_number,
      cardSlot: onu.card_slot || 2,
      ponPort: onu.pon_port_id,
      onuIndex: onu.onu_index || 1,
      pppoeUsername: onu.pppoe_username,
      pppoePassword: onu.pppoe_password,
      oldProfile: { name: onu.current_profile_name || 'Standard', vlan_id: onu.vlan_id },
      newProfile: {
        name: newProfile.name,
        bandwidth_up_mbps: newProfile.bandwidth_up_mbps,
        bandwidth_down_mbps: newProfile.bandwidth_down_mbps,
        wan_config_template: newProfile.wan_config_template,
        vlan_template: newProfile.vlan_template,
        vlan_profile: newProfile.vlan_profile
      },
      vlanProfile: newProfile.vlan_profile,
      vlanId: newProfile.vlan_id
    });

    // 2. Synchronize MikroTik BRAS if PPPoE is assigned
    let mikrotikResult = null;
    if (onu.pppoe_username) {
      try {
        mikrotikResult = await updatePPPoEProfile({
          username: onu.pppoe_username,
          newProfile: newProfile.name,
          kickSession: kick_session !== false
        });
      } catch (err) {
        console.warn('Gagal sinkronisasi profil MikroTik:', err.message);
      }
    }

    // 3. Update database record
    await dbQuery.run(`
      UPDATE onus
      SET service_profile_id = ?, vlan_id = ?, pppoe_profile = ?
      WHERE onu_id = ?
    `, [newProfile.profile_id, newProfile.vlan_id, newProfile.name, onu.onu_id]);

    // 4. Create Audit Log
    await createAuditLog({
      user: req.user,
      action: 'Ganti Paket Layanan ONU',
      target_device_id: device.device_id,
      target_device_name: device.name,
      details: {
        onu_id: onu.onu_id,
        serial_number: onu.serial_number,
        customer_name: onu.onu_name,
        pon_port: `1/1/${onu.pon_port_id}:${onu.onu_index || 1}`,
        old_profile: onu.current_profile_name || 'Previous',
        new_profile: newProfile.name,
        bandwidth: `Up ${newProfile.bandwidth_up_mbps}M / Down ${newProfile.bandwidth_down_mbps}M`,
        vlan_id: newProfile.vlan_id,
        pppoe_username: onu.pppoe_username,
        mikrotik_synced: !!mikrotikResult,
        cliExecuted: adapterResult.cliExecuted
      }
    });

    // 5. Dispatch Telegram incident alert
    dispatchIncidentAlert({
      eventType: 'PACKAGE_CHANGED',
      severity: 'INFO',
      deviceName: device.name,
      targetOnu: onu.serial_number,
      details: {
        customer_name: onu.onu_name || onu.serial_number,
        port: `1/1/${onu.pon_port_id}:${onu.onu_index || 1}`,
        old_profile: onu.current_profile_name || 'Previous',
        new_profile: newProfile.name,
        speed: `Up ${newProfile.bandwidth_up_mbps} Mbps / Down ${newProfile.bandwidth_down_mbps} Mbps`,
        vlan_id: newProfile.vlan_id,
        mikrotik_synced: !!mikrotikResult,
        action_by: req.user?.username || 'NOC Admin'
      }
    }).catch((err) => console.warn('Telegram package change dispatch error:', err.message));

    res.json({
      success: true,
      message: `Paket layanan untuk ONU ${onu.onu_name || onu.serial_number} berhasil diubah ke ${newProfile.name}`,
      data: {
        onu_id: onu.onu_id,
        serial_number: onu.serial_number,
        old_profile: onu.current_profile_name,
        new_profile: newProfile.name,
        vlan_id: newProfile.vlan_id,
        cliExecuted: adapterResult.cliExecuted,
        logs: adapterResult.logs,
        mikrotik_synced: !!mikrotikResult
      }
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

/**
 * Simulate ONU State (Dying Gasp vs Fiber Cut vs Online)
 * POST /api/onu/:onu_id/simulate-state
 */
export async function simulateONUState(req, res) {
  try {
    const { onu_id } = req.params;
    const { state, reason } = req.body; // state: 'online' | 'offline' | 'los', reason: 'dying-gasp' | 'los' | 'manual'

    const onu = await dbQuery.get(`
      SELECT o.*, d.name as device_name, d.device_id
      FROM onus o
      JOIN devices d ON o.device_id = d.device_id
      WHERE o.onu_id = ?
    `, [onu_id]);

    if (!onu) {
      return res.status(404).json({ error: 'ONU tidak ditemukan' });
    }

    let newStatus = 'Online';
    let offlineReason = null;
    let offlineAt = null;
    let newRx = -19.5;

    if (state === 'offline' || state === 'dying-gasp' || reason === 'dying-gasp') {
      newStatus = 'Offline';
      offlineReason = 'dying-gasp';
      offlineAt = new Date().toISOString();
      newRx = null;
    } else if (state === 'los' || state === 'fiber-cut' || reason === 'los') {
      newStatus = 'Loss of Signal';
      offlineReason = 'los';
      offlineAt = new Date().toISOString();
      newRx = -34.8;
    } else {
      newStatus = 'Online';
      offlineReason = null;
      offlineAt = null;
      newRx = -19.5;
    }

    await dbQuery.run(`
      UPDATE onus 
      SET status = ?, last_offline_reason = ?, last_offline_at = ?, rx_power = ?
      WHERE onu_id = ?
    `, [newStatus, offlineReason, offlineAt, newRx, onu_id]);

    // Record audit log
    await createAuditLog({
      user: req.user,
      action: 'Simulasi Status Offline ONU',
      target_device_id: onu.device_id,
      target_device_name: onu.device_name,
      details: {
        onu_id,
        serial_number: onu.serial_number,
        previous_status: onu.status,
        new_status: newStatus,
        offline_reason: offlineReason
      }
    });

    res.json({
      success: true,
      message: `Status ONU ${onu.serial_number} berhasil disimulasikan ke ${newStatus} (${offlineReason || 'Online'})`,
      data: {
        onu_id: onu.onu_id,
        serial_number: onu.serial_number,
        status: newStatus,
        last_offline_reason: offlineReason,
        last_offline_at: offlineAt,
        rx_power: newRx
      }
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

/**
 * Sync and import registered ONUs from OLT hardware into NMS
 * POST /api/devices/:device_id/sync-onus or POST /api/onus/sync
 */
export async function syncONUsFromOLT(req, res) {
  try {
    const deviceIdParam = req.params.device_id || req.body.device_id || 'all';
    const rawDefaultProf = req.body.default_service_profile_id || req.body.default_profile_id;
    const shouldOverwriteNames = Boolean(req.body.overwrite_names || req.body.overwrite_existing_names);

    let targetDevices = [];
    if (deviceIdParam && deviceIdParam !== 'all') {
      const dev = await dbQuery.get('SELECT * FROM devices WHERE device_id = ?', [parseInt(deviceIdParam, 10)]);
      if (!dev) return res.status(404).json({ error: 'Device OLT tidak ditemukan' });
      targetDevices.push(dev);
    } else {
      targetDevices = await dbQuery.all('SELECT * FROM devices ORDER BY device_id ASC');
    }

    if (targetDevices.length === 0) {
      return res.status(400).json({ error: 'Tidak ada perangkat OLT aktif untuk disinkronkan' });
    }

    // Available service profiles for mapping
    const profiles = await dbQuery.all('SELECT * FROM service_profiles ORDER BY profile_id ASC');
    const defaultProfile = profiles.find(p => p.profile_id === parseInt(rawDefaultProf, 10)) || profiles[0] || { profile_id: 1, vlan_id: 100, name: 'INTERNET' };

    let totalFoundAll = 0;
    let totalImportedAll = 0;
    let totalUpdatedAll = 0;
    const importedList = [];
    const allOnusList = [];
    const deviceReports = [];

    for (const dev of targetDevices) {
      const adapter = AdapterFactory.getAdapter(dev);
      const scanResult = await adapter.getRegisteredONUs();
      const oltOnus = scanResult.onus || [];
      totalFoundAll += oltOnus.length;

      // Existing ONUs in DB across all devices
      const existingDBOnus = await dbQuery.all('SELECT * FROM onus');
      const dbMap = new Map(existingDBOnus.map(o => [o.serial_number, o]));

      let devImported = 0;
      let devUpdated = 0;

      for (const item of oltOnus) {
        // Resolve matching service profile based on real OLT configuration
        let matchedProfile = null;

        if (item.vlan_id) {
          // Check if profile exists with this VLAN ID or matching name
          matchedProfile = profiles.find(p => p.vlan_id === item.vlan_id || (item.profile_name && p.name?.toLowerCase() === item.profile_name?.toLowerCase()));
          if (!matchedProfile) {
            // Auto-create service profile matching the real OLT configuration
            const profName = item.profile_name || `VLAN-${item.vlan_id}`;
            const insertProf = await dbQuery.run(`
              INSERT INTO service_profiles (name, vlan_id, vlan_template, wan_config_template, pppoe_username_template, pppoe_password_template)
              VALUES (?, ?, ?, ?, ?, ?)
            `, [
              profName,
              item.vlan_id,
              `vlan ${item.vlan_id} tag`,
              'IP_MODE=PPPoE;NAT=ENABLE',
              '{user}@isp.net',
              'secret123'
            ]);
            matchedProfile = { profile_id: insertProf.lastID, name: profName, vlan_id: item.vlan_id };
            profiles.push(matchedProfile);
          }
        } else if (item.profile_name) {
          matchedProfile = profiles.find(p => p.name?.toLowerCase() === item.profile_name?.toLowerCase());
        }

        const profileId = matchedProfile ? matchedProfile.profile_id : null;
        const custName = item.onu_name || `ONU_${item.serial_number}`;

        if (dbMap.has(item.serial_number)) {
          // Existing ONU: update telemetry, status, card_slot, port, index, and sync real vlan/profile/pppoe from OLT
          const existing = dbMap.get(item.serial_number);
          const finalName = shouldOverwriteNames && item.onu_name ? item.onu_name : (existing.onu_name || item.onu_name);
          const finalCardSlot = item.card_slot || existing.card_slot || 1;
          const finalVlanId = item.vlan_id !== null && item.vlan_id !== undefined ? item.vlan_id : existing.vlan_id;
          const finalProfileId = profileId || existing.service_profile_id;
          const finalPPPoEUser = item.pppoe_username !== undefined && item.pppoe_username !== null ? item.pppoe_username : existing.pppoe_username;
          const finalPPPoEPass = item.pppoe_password !== undefined && item.pppoe_password !== null ? item.pppoe_password : existing.pppoe_password;

          await dbQuery.run(`
            UPDATE onus
            SET device_id = ?, card_slot = ?, pon_port_id = ?, onu_index = ?, status = ?, rx_power = ?, 
                distance_meters = ?, last_offline_reason = ?, onu_name = ?,
                vlan_id = ?, service_profile_id = ?, pppoe_username = ?, pppoe_password = ?
            WHERE onu_id = ?
          `, [
            dev.device_id,
            finalCardSlot,
            item.pon_port_id || existing.pon_port_id,
            item.onu_index || existing.onu_index,
            item.status || existing.status,
            item.rx_power !== undefined ? item.rx_power : existing.rx_power,
            item.distance_meters || existing.distance_meters,
            item.last_offline_reason || (item.status === 'Online' ? null : existing.last_offline_reason),
            finalName,
            finalVlanId,
            finalProfileId,
            finalPPPoEUser,
            finalPPPoEPass,
            existing.onu_id
          ]);
          devUpdated++;

          allOnusList.push({
            onu_id: existing.onu_id,
            serial_number: item.serial_number,
            device_name: dev.name,
            device_vendor: dev.vendor,
            card_slot: finalCardSlot,
            pon_port_id: item.pon_port_id || existing.pon_port_id,
            onu_index: item.onu_index || existing.onu_index,
            onu_name: finalName,
            status: item.status || existing.status,
            rx_power: item.rx_power !== undefined ? item.rx_power : existing.rx_power,
            vlan_id: finalVlanId,
            profile_name: matchedProfile?.name || defaultProfile?.name || 'Default',
            pppoe_username: finalPPPoEUser,
            is_new: false
          });
        } else {
          // New ONU: insert into DB with exact OLT vlan, profile, and credentials
          const finalCardSlot = item.card_slot || 1;
          const finalVlanId = item.vlan_id || defaultProfile.vlan_id || 100;
          const finalProfileId = profileId || defaultProfile.profile_id;

          const insertResult = await dbQuery.run(`
            INSERT INTO onus (
              device_id, serial_number, card_slot, pon_port_id, onu_index, vlan_id,
              service_profile_id, pppoe_username, pppoe_password, status, rx_power, distance_meters, onu_name,
              last_offline_reason
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          `, [
            dev.device_id,
            item.serial_number,
            finalCardSlot,
            item.pon_port_id || 1,
            item.onu_index || 1,
            finalVlanId,
            finalProfileId,
            item.pppoe_username || null,
            item.pppoe_password || null,
            item.status || 'Online',
            item.rx_power !== undefined ? item.rx_power : -19.5,
            item.distance_meters || 350,
            custName,
            item.last_offline_reason || null
          ]);

          devImported++;
          const newEntry = {
            onu_id: insertResult.lastID,
            serial_number: item.serial_number,
            device_name: dev.name,
            device_vendor: dev.vendor,
            card_slot: finalCardSlot,
            pon_port_id: item.pon_port_id,
            onu_index: item.onu_index,
            onu_name: custName,
            status: item.status || 'Online',
            rx_power: item.rx_power,
            profile_name: matchedProfile?.name || defaultProfile.name,
            vlan_id: finalVlanId,
            pppoe_username: item.pppoe_username || null,
            is_new: true
          };
          importedList.push(newEntry);
          allOnusList.push(newEntry);
        }
      }

      totalImportedAll += devImported;
      totalUpdatedAll += devUpdated;
      deviceReports.push({
        device_id: dev.device_id,
        device_name: dev.name,
        vendor: dev.vendor,
        total_in_olt: oltOnus.length,
        imported: devImported,
        updated: devUpdated
      });

      // Audit Log per device
      await createAuditLog({
        user: req.user,
        action: 'Sinkronisasi ONU dari OLT',
        target_device_id: dev.device_id,
        target_device_name: dev.name,
        details: {
          total_olt_onus: oltOnus.length,
          newly_imported: devImported,
          updated_existing: devUpdated,
          cli_commands: scanResult.cliExecuted
        }
      });
    }

    // Telegram Notification
    const mainDeviceName = targetDevices.length === 1 ? targetDevices[0].name : `${targetDevices.length} OLT Devices`;
    dispatchIncidentAlert({
      eventType: 'ONU_SYNCED',
      severity: 'INFO',
      deviceName: mainDeviceName,
      targetOnu: `${totalFoundAll} ONU`,
      details: {
        total_olt_onus: totalFoundAll,
        newly_imported: totalImportedAll,
        updated_existing: totalUpdatedAll,
        action_by: req.user?.username || 'NOC Admin'
      }
    }).catch(err => console.warn('Telegram sync alert error:', err.message));

    res.json({
      success: true,
      message: `Sinkronisasi selesai. Ditemukan ${totalFoundAll} ONU di OLT (${totalImportedAll} baru diimpor, ${totalUpdatedAll} diperbarui).`,
      total_found: totalFoundAll,
      total_imported: totalImportedAll,
      total_updated: totalUpdatedAll,
      devices: deviceReports,
      all_onus: allOnusList,
      data: {
        total_olt_onus: totalFoundAll,
        newly_imported: totalImportedAll,
        updated_existing: totalUpdatedAll,
        devices: deviceReports,
        imported_list: importedList,
        all_onus: allOnusList
      }
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

/**
 * 1-Click Re-Push complete configuration to ONU after hardware/factory reset
 * POST /api/onu/:onu_id/repush-config
 */
export async function repushONUConfig(req, res) {
  try {
    const { onu_id } = req.params;
    const {
      pppoe_username,
      pppoe_password,
      vlan_id,
      service_profile_id,
      wifi_ssid,
      wifi_password,
      acs_url,
      kick_mikrotik_session = true,
      reboot_after_push = false
    } = req.body;

    const onu = await dbQuery.get('SELECT * FROM onus WHERE onu_id = ?', [onu_id]);
    if (!onu) {
      return res.status(404).json({ error: 'ONU tidak ditemukan' });
    }

    const device = await dbQuery.get('SELECT * FROM devices WHERE device_id = ?', [onu.device_id]);
    if (!device) {
      return res.status(404).json({ error: 'Device OLT tidak ditemukan' });
    }

    // Determine final parameters with fallback to DB values
    const finalUsername = (pppoe_username || onu.pppoe_username || '').trim();
    const finalPassword = (pppoe_password || onu.pppoe_password || '').trim();
    const finalProfileId = service_profile_id || onu.service_profile_id;
    const profile = finalProfileId ? await dbQuery.get('SELECT * FROM service_profiles WHERE profile_id = ?', [finalProfileId]) : null;
    const finalVlanId = vlan_id || profile?.vlan_id || onu.vlan_id || 100;
    const finalProfileName = profile?.name || 'INTERNET';

    const tr069Row = await dbQuery.get('SELECT value FROM system_settings WHERE key = ?', ['tr069_acs_url']);
    const finalAcsUrl = acs_url || tr069Row?.value || 'http://103.176.227.233:3001/';
    const finalWifiSsid = (wifi_ssid !== undefined ? wifi_ssid : (onu.wifi_ssid || '')).trim();
    const finalWifiPass = (wifi_password !== undefined ? wifi_password : (onu.wifi_password || '')).trim();

    if (!finalUsername || !finalPassword) {
      return res.status(400).json({ error: 'PPPoE Username dan Password wajib tersedia untuk re-push konfigurasi' });
    }

    // Call adapter repushConfig
    const adapter = AdapterFactory.getAdapter(device);
    const repushResult = await adapter.repushConfig({
      serialNumber: onu.serial_number,
      cardSlot: onu.card_slot || 2,
      ponPort: onu.pon_port_id,
      onuIndex: onu.onu_index || 1,
      pppoeUsername: finalUsername,
      pppoePassword: finalPassword,
      vlanId: finalVlanId,
      vlanProfile: profile?.vlan_profile || onu.vlan_profile,
      profileName: finalProfileName,
      acsUrl: finalAcsUrl,
      rebootAfterPush: Boolean(reboot_after_push)
    });

    // Optionally kick active session in MikroTik BRAS & sync secret
    let mikrotikResult = null;
    try {
      await syncPPPoESecret({
        username: finalUsername,
        password: finalPassword,
        profile: onu.pppoe_profile || finalProfileName || 'profile_50mbps',
        comment: `ONU ${onu.serial_number} (${onu.customer_name || onu.onu_name || device.name})`
      });

      if (kick_mikrotik_session) {
        mikrotikResult = await kickPPPoESession({ username: finalUsername });
      }
    } catch (mErr) {
      console.warn('Warning: MikroTik session kick error during repush:', mErr.message);
    }

    // Update database record
    await dbQuery.run(`
      UPDATE onus
      SET pppoe_username = ?, pppoe_password = ?, vlan_id = ?, service_profile_id = ?,
          last_repush_at = CURRENT_TIMESTAMP
      WHERE onu_id = ?
    `, [
      finalUsername,
      finalPassword,
      finalVlanId,
      finalProfileId,
      onu_id
    ]);

    // Audit log
    await createAuditLog({
      user: req.user,
      action: 'Dorong Ulang Konfigurasi ONU (Pasca Reset)',
      target_device_id: device.device_id,
      target_device_name: device.name,
      details: {
        onu_id: onu.onu_id,
        serial_number: onu.serial_number,
        customer_name: onu.customer_name || onu.onu_name,
        port: `${onu.pon_port_id}:${onu.onu_index || 1}`,
        vlan_id: finalVlanId,
        service_profile: finalProfileName,
        pppoe_username: finalUsername,
        session_kicked: Boolean(kick_mikrotik_session),
        reboot_scheduled: Boolean(reboot_after_push),
        cli_commands: repushResult.cliExecuted
      }
    });

    // Telegram notification
    dispatchIncidentAlert({
      eventType: 'ONU_CONFIG_REPUSHED',
      severity: 'INFO',
      deviceName: device.name,
      targetOnu: onu.serial_number,
      details: {
        customer_name: onu.customer_name || onu.onu_name,
        port: `1/1/${onu.pon_port_id}:${onu.onu_index || 1}`,
        vlan_id: finalVlanId,
        profile_name: finalProfileName,
        pppoe_username: finalUsername,
        session_kicked: Boolean(kick_mikrotik_session),
        action_by: req.user?.username || 'NOC Admin'
      }
    }).catch(err => console.warn('Telegram repush alert error:', err.message));

    res.json({
      success: true,
      message: `Konfigurasi lengkap berhasil didorong ulang ke ONU ${onu.serial_number}`,
      onu_id: onu.onu_id,
      serial_number: onu.serial_number,
      customer_name: onu.customer_name || onu.onu_name,
      vlan_id: finalVlanId,
      profile_name: finalProfileName,
      pppoe_username: finalUsername,
      session_kicked: Boolean(kick_mikrotik_session),
      reboot_scheduled: Boolean(reboot_after_push),
      cli_executed: repushResult.cliExecuted,
      result: repushResult,
      mikrotik: mikrotikResult
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}





