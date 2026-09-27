import { dbQuery } from '../db/index.js';

export async function getTopology(req, res) {
  try {
    const { device_id } = req.query;

    let devices = [];
    if (device_id) {
      devices = await dbQuery.all('SELECT * FROM devices WHERE device_id = ?', [device_id]);
    } else {
      devices = await dbQuery.all('SELECT * FROM devices ORDER BY device_id ASC');
    }

    const onus = await dbQuery.all(`
      SELECT o.*, sp.name as profile_name, d.name as device_name, d.vendor as device_vendor
      FROM onus o
      LEFT JOIN devices d ON o.device_id = d.device_id
      LEFT JOIN service_profiles sp ON o.service_profile_id = sp.profile_id
      ORDER BY o.onu_id ASC
    `);

    // Calculate Summary Metrics
    const totalDevices = devices.length;
    const onlineDevices = devices.filter((d) => d.status === 'Online').length;
    const offlineDevices = totalDevices - onlineDevices;

    const filteredOnus = device_id
      ? onus.filter((o) => o.device_id === parseInt(device_id, 10))
      : onus;

    const totalOnus = filteredOnus.length;
    const onlineOnus = filteredOnus.filter((o) => o.status === 'Online').length;
    const losOnus = filteredOnus.filter((o) => o.status !== 'Online').length;

    let totalRx = 0;
    let validRxCount = 0;
    filteredOnus.forEach((o) => {
      if (o.status === 'Online' && typeof o.rx_power === 'number') {
        totalRx += o.rx_power;
        validRxCount++;
      }
    });
    const avgRxPower = validRxCount > 0 ? (totalRx / validRxCount).toFixed(1) : '-20.5';
    const healthScore = totalOnus > 0 ? Math.round((onlineOnus / totalOnus) * 100) : 100;

    const nodes = [];
    const links = [];
    let totalActivePonPorts = 0;
    let totalPonCapacity = 0;

    devices.forEach((dev) => {
      const devNodeId = `olt-${dev.device_id}`;
      const devONUs = onus.filter((o) => o.device_id === dev.device_id);

      nodes.push({
        id: devNodeId,
        deviceId: dev.device_id,
        label: dev.name,
        type: 'olt',
        vendor: dev.vendor,
        status: dev.status,
        ip: dev.ip_address,
        sshPort: dev.ssh_port || 22,
        ponPortsCount: dev.pon_ports_count || 8,
        activeOnuCount: devONUs.length,
        snmpCommunity: dev.snmp_community || 'public'
      });

      // Parse PON cards
      let ponCards = [];
      try {
        const parsed = JSON.parse(dev.cards || '[]');
        ponCards = parsed.filter(c => c.is_pon || ['gtgh', 'gtgo', 'epfc', 'h901gphf', 'gpon'].some(t => (c.type || c.cfg_type || '').toLowerCase().includes(t)));
      } catch (e) {}

      if (ponCards.length === 0) {
        ponCards = [{ slot: 1, ports: dev.pon_ports_count || 8, type: 'GPON' }];
      }

      // Group ONUs by slot and port
      const ponMap = {};
      devONUs.forEach((o) => {
        const slot = o.card_slot || 1;
        const portKey = `${slot}/${o.pon_port_id}`;
        if (!ponMap[portKey]) ponMap[portKey] = [];
        ponMap[portKey].push(o);
      });

      ponCards.forEach((card) => {
        const slot = card.slot || 1;
        const maxPorts = Math.min(card.ports || 16, 16);
        totalPonCapacity += maxPorts;

        for (let p = 1; p <= maxPorts; p++) {
          const portKey = `${slot}/${p}`;
          const ponNodeId = `pon-${dev.device_id}-${slot}-${p}`;
          const countOnus = ponMap[portKey] ? ponMap[portKey].length : 0;
          if (countOnus > 0) totalActivePonPorts++;

          nodes.push({
            id: ponNodeId,
            deviceId: dev.device_id,
            cardSlot: slot,
            ponPort: p,
            label: `PON 1/${slot}/${p}`,
            cardType: card.type || card.cfg_type || 'GPON',
            type: 'pon',
            status: countOnus > 0 ? 'Active' : 'Idle',
            onuCount: countOnus,
            splitRatio: '1:128 GPON (Maks 128 Customer)',
            parentOltId: devNodeId,
            parentOltName: dev.name
          });

          links.push({
            id: `link-olt-${dev.device_id}-pon-${slot}-${p}`,
            source: devNodeId,
            target: ponNodeId,
            type: 'fiber-feeder',
            bandwidth: 'GPON 2.488G / 1.244G',
            status: dev.status === 'Online' ? 'active' : 'down'
          });

          // Add ONUs connected to this PON port
          if (ponMap[portKey]) {
            ponMap[portKey].forEach((onu) => {
              const onuNodeId = `onu-${onu.onu_id}`;
              let signalQuality = 'Good';
              if (onu.status !== 'Online' || (onu.rx_power && onu.rx_power < -27)) {
                signalQuality = 'Critical';
              } else if (onu.rx_power && onu.rx_power < -24) {
                signalQuality = 'Warning';
              }

              nodes.push({
                id: onuNodeId,
                onuId: onu.onu_id,
                deviceId: dev.device_id,
                deviceName: dev.name,
                deviceVendor: dev.vendor,
                cardSlot: onu.card_slot || slot,
                ponPort: onu.pon_port_id,
                onuIndex: onu.onu_index || 1,
                label: onu.serial_number,
                onuName: onu.onu_name || onu.customer_name || onu.serial_number,
                type: 'onu',
                status: onu.status,
                signalQuality,
                rxPower: onu.rx_power,
                distance: onu.distance_meters,
                pppoe: onu.pppoe_username,
                profile: onu.profile_name || 'Standard Internet',
                vlan: onu.vlan_id,
                parentPonId: ponNodeId
              });

              links.push({
                id: `link-pon-${slot}-${p}-onu-${onu.onu_id}`,
                source: ponNodeId,
                target: onuNodeId,
                type: 'fiber-drop',
                bandwidth: 'Customer Drop',
                status: onu.status === 'Online' ? 'active' : 'los',
                signalQuality
              });
            });
          }
        }
      });
    });

    const summary = {
      totalDevices,
      onlineDevices,
      offlineDevices,
      totalOnus,
      onlineOnus,
      losOnus,
      totalActivePonPorts,
      totalPonCapacity,
      avgRxPower,
      healthScore
    };

    res.json({ nodes, links, summary });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}
