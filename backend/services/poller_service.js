import { dbQuery } from '../db/index.js';
import { AdapterFactory } from '../adapters/adapter_factory.js';
import { createAuditLog } from './audit_service.js';
import { dispatchIncidentAlert } from './notification_service.js';
import { broadcastEvent } from './event_bus.js';

let pollerTimer = null;
let isSweeping = false;
let pollerState = {
  isRunning: false,
  intervalSeconds: 30,
  lastRun: null,
  totalCycles: 0,
  lastStats: {
    devicesChecked: 0,
    onusChecked: 0,
    alarmsTriggered: 0
  }
};

export function getPollerState() {
  return { ...pollerState };
}

export async function executePollerSweep(isManual = false) {
  if (isSweeping) {
    return { skipped: true, message: 'Poller sweep is already in progress' };
  }

  isSweeping = true;
  const sweepStart = new Date();
  let devicesChecked = 0;
  let onusChecked = 0;
  let alarmsTriggered = 0;

  try {
    const devices = await dbQuery.all('SELECT * FROM devices');
    const onus = await dbQuery.all('SELECT * FROM onus');

    // 1. Poll Devices (OLTs)
    for (const dev of devices) {
      devicesChecked++;
      try {
        const adapter = AdapterFactory.getAdapter(dev);
        const connResult = await adapter.testConnection();
        const newStatus = connResult.success ? 'Online' : 'Offline';

        // Check if status changed from Online to Offline
        if (dev.status === 'Online' && newStatus === 'Offline') {
          alarmsTriggered++;
          await dispatchIncidentAlert({
            eventType: 'OLT_DEVICE_UNREACHABLE',
            severity: 'CRITICAL',
            deviceName: dev.name,
            targetOnu: 'ALL',
            details: {
              status: 'Offline',
              ip_address: dev.ip_address,
              description: `OLT ${dev.name} (${dev.ip_address}) tidak merespon koneksi manajemen SSH/Telnet.`
            }
          });

          await createAuditLog({
            action: 'Auto-Alarm OLT Offline',
            target_device_id: dev.device_id,
            target_device_name: dev.name,
            details: { prev_status: dev.status, new_status: newStatus }
          });
        } else if (dev.status === 'Offline' && newStatus === 'Online') {
          // OLT Recovery
          await dispatchIncidentAlert({
            eventType: 'OLT_DEVICE_RECOVERED',
            severity: 'INFO',
            deviceName: dev.name,
            targetOnu: 'ALL',
            details: {
              status: 'Online',
              ip_address: dev.ip_address,
              description: `OLT ${dev.name} (${dev.ip_address}) telah terhubung kembali dan manajemen aktif normal.`
            }
          });
        }

        if (dev.status !== newStatus) {
          await dbQuery.run('UPDATE devices SET status = ?, last_seen = CURRENT_TIMESTAMP WHERE device_id = ?', [
            newStatus,
            dev.device_id
          ]);
          broadcastEvent('DEVICE_STATUS_CHANGED', {
            device_id: dev.device_id,
            name: dev.name,
            status: newStatus
          });
        }

        // Loopback and Broadcast Storm detection check
        try {
          const loopEvents = await adapter.detectLoopbackEvents();
          if (loopEvents && loopEvents.incidents && loopEvents.incidents.length > 0) {
            for (const inc of loopEvents.incidents) {
              alarmsTriggered++;
              const existingInc = await dbQuery.get(
                "SELECT * FROM loop_incidents WHERE device_id = ? AND pon_port = ? AND onu_index = ? AND status != 'resolved'",
                [dev.device_id, inc.ponPort, inc.onuIndex]
              );
              if (!existingInc) {
                const shutdownRes = await adapter.setLanPortState({
                  ponPort: inc.ponPort,
                  onuIndex: inc.onuIndex,
                  lanPort: inc.lanPort || 1,
                  state: 'shutdown'
                });

                const matchedOnu = onus.find(o => o.device_id === dev.device_id && o.pon_port_id === inc.ponPort && o.onu_index === inc.onuIndex);
                if (matchedOnu) {
                  await dbQuery.run(
                    'UPDATE onus SET loop_detected = 1, isolated_lan_port = ?, last_loop_at = CURRENT_TIMESTAMP WHERE onu_id = ?',
                    [inc.lanPort || 1, matchedOnu.onu_id]
                  );
                }

                await dbQuery.run(`
                  INSERT INTO loop_incidents (
                    onu_id, device_id, pon_port, onu_index, lan_port, mac_address,
                    flapping_frequency, storm_rate_pps, status, auto_isolated,
                    mitigation_cli, detected_at
                  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'isolated', 1, ?, CURRENT_TIMESTAMP)
                `, [
                  matchedOnu ? matchedOnu.onu_id : 0,
                  dev.device_id,
                  inc.ponPort,
                  inc.onuIndex,
                  inc.lanPort || 1,
                  inc.macAddress || '00:00:00:00:00:00',
                  inc.flappingFrequency || 120,
                  inc.stormRatePps || 4500,
                  shutdownRes.cliExecuted
                ]);

                await dispatchIncidentAlert({
                  eventType: 'LOOPBACK_DETECTED',
                  severity: 'CRITICAL',
                  deviceName: dev.name,
                  targetOnu: matchedOnu?.serial_number || `Port ${inc.ponPort}:${inc.onuIndex}`,
                  details: {
                    customer_name: matchedOnu?.customer_name || matchedOnu?.onu_name,
                    port: `${inc.ponPort}:${inc.onuIndex}`,
                    lan_port: inc.lanPort || 1,
                    mac_address: inc.macAddress,
                    storm_rate_pps: inc.stormRatePps || 4500,
                    auto_isolated: true
                  }
                });

                broadcastEvent('LOOPBACK_DETECTED', {
                  device_name: dev.name,
                  pon_port: inc.ponPort,
                  onu_index: inc.onuIndex,
                  lan_port: inc.lanPort || 1
                });
              }
            }
          }
        } catch (lErr) {
          // ignore scan error
        }
      } catch (err) {
        console.error(`Error polling device ${dev.name}:`, err.message);
      }
    }

    // 2. Poll ONUs
    for (const onu of onus) {
      onusChecked++;
      const dev = devices.find((d) => d.device_id === onu.device_id);
      if (!dev) continue;

      try {
        const adapter = AdapterFactory.getAdapter(dev);
        const statusData = await adapter.getONUStatus(onu.serial_number, {
          cardSlot: onu.card_slot,
          ponPort: onu.pon_port_id,
          onuIndex: onu.onu_index,
          status: onu.status,
          rxPower: onu.rx_power,
          distance: onu.distance_meters,
          offlineReason: onu.last_offline_reason,
          lastOfflineAt: onu.last_offline_at
        });

        const newRx = statusData.rxPower !== undefined ? statusData.rxPower : onu.rx_power;
        const newStatus = statusData.status || onu.status;
        const newDistance = statusData.distanceMeters || onu.distance_meters;

        // Offline detection
        const isNowLOS = newStatus.toLowerCase().includes('loss') || newStatus === 'Offline' || newRx < -28.0;
        const wasLOS = onu.status.toLowerCase().includes('loss') || onu.status === 'Offline' || onu.rx_power < -28.0;

        let offlineReason = onu.last_offline_reason;
        let offlineAt = onu.last_offline_at;

        if (!wasLOS && isNowLOS) {
          alarmsTriggered++;
          offlineReason = statusData.offlineReason || (newStatus.toLowerCase().includes('loss') ? 'los' : 'dying-gasp');
          offlineAt = new Date().toISOString();

          if (offlineReason === 'dying-gasp') {
            await dispatchIncidentAlert({
              eventType: 'ONU_DYING_GASP',
              severity: 'WARNING',
              deviceName: dev.name,
              targetOnu: onu.serial_number,
              details: {
                status: 'Offline (Mati Listrik / Dying Gasp)',
                customer_name: onu.customer_name || onu.onu_name || '-',
                port: `1/1/${onu.pon_port_id}:${onu.onu_index || 1}`,
                rx_power: `${newRx || '0.0'} dBm`,
                description: `Sinyal Dying Gasp terdeteksi pada ONU ${onu.serial_number}. Catu daya terputus (mati lampu / adaptor dicabut). Tidak perlu penanganan kabel.`
              }
            });

            await createAuditLog({
              action: 'Auto-Alarm ONU Dying Gasp',
              target_device_id: dev.device_id,
              target_device_name: dev.name,
              details: { onu_id: onu.onu_id, serial_number: onu.serial_number, reason: 'dying-gasp' }
            });

            broadcastEvent('INCIDENT_ALARM', {
              type: 'ONU_DYING_GASP',
              onu_id: onu.onu_id,
              serial_number: onu.serial_number,
              deviceName: dev.name,
              reason: 'dying-gasp'
            });
          } else {
            await dispatchIncidentAlert({
              eventType: 'ONU_LOSS_OF_SIGNAL',
              severity: 'CRITICAL',
              deviceName: dev.name,
              targetOnu: onu.serial_number,
              details: {
                status: 'Loss of Signal (Kabel Putus / LOS)',
                customer_name: onu.customer_name || onu.onu_name || '-',
                port: `1/1/${onu.pon_port_id}:${onu.onu_index || 1}`,
                rx_power: `${newRx} dBm`,
                description: `Redaman optik ONU ${onu.serial_number} anjlok (${newRx} dBm) tanpa sinyal Dying Gasp. Kemungkinan kabel drop core putus / bending.`
              }
            });

            await createAuditLog({
              action: 'Auto-Alarm ONU LOS',
              target_device_id: dev.device_id,
              target_device_name: dev.name,
              details: { onu_id: onu.onu_id, serial_number: onu.serial_number, rx_power: newRx, reason: 'los' }
            });

            broadcastEvent('INCIDENT_ALARM', {
              type: 'ONU_LOSS_OF_SIGNAL',
              onu_id: onu.onu_id,
              serial_number: onu.serial_number,
              deviceName: dev.name,
              rx_power: newRx,
              reason: 'los'
            });
          }
        } else if (wasLOS && !isNowLOS) {
          // Recovery Trigger
          offlineReason = null;
          offlineAt = null;

          await dispatchIncidentAlert({
            eventType: 'ONU_RECOVERED',
            severity: 'INFO',
            deviceName: dev.name,
            targetOnu: onu.serial_number,
            details: {
              status: 'Online',
              customer_name: onu.customer_name || onu.onu_name || '-',
              port: `1/1/${onu.pon_port_id}:${onu.onu_index || 1}`,
              rx_power: `${newRx} dBm`,
              description: `ONU ${onu.serial_number} kembali online dengan sinyal normal (${newRx} dBm).`
            }
          });

          broadcastEvent('ONU_RECOVERED', {
            onu_id: onu.onu_id,
            serial_number: onu.serial_number,
            deviceName: dev.name,
            rx_power: newRx
          });
        } else if (!isNowLOS && newRx < -26.5 && (!onu.rx_power || onu.rx_power >= -26.5)) {
          // Warning Trigger: Optical Degradation
          await dispatchIncidentAlert({
            eventType: 'OPTICAL_DEGRADATION_WARNING',
            severity: 'WARNING',
            deviceName: dev.name,
            targetOnu: onu.serial_number,
            details: {
              status: 'Warning (High Attenuation)',
              customer_name: onu.customer_name || onu.onu_name || '-',
              port: `1/1/${onu.pon_port_id}:${onu.onu_index || 1}`,
              rx_power: `${newRx} dBm`,
              description: `Redaman optik ONU ${onu.serial_number} melemah (${newRx} dBm). Periksa lekukan kabel sebelum terjadi LOS.`
            }
          });
        }

        // Update database with latest metrics and offline root cause analysis
        await dbQuery.run(
          'UPDATE onus SET rx_power = ?, status = ?, distance_meters = ?, last_offline_reason = ?, last_offline_at = ? WHERE onu_id = ?',
          [newRx, newStatus, newDistance, offlineReason, offlineAt, onu.onu_id]
        );

        // Store snapshot in optical_history
        await dbQuery.run(
          'INSERT INTO optical_history (onu_id, rx_power, status) VALUES (?, ?, ?)',
          [onu.onu_id, newRx, newStatus]
        );
      } catch (e) {
        console.error(`Error polling ONU ${onu.serial_number}:`, e.message);
      }
    }

    // Prune history older than 7 days to maintain lightweight database
    await dbQuery.run("DELETE FROM optical_history WHERE timestamp < datetime('now', '-7 days')");

    // Update poller state
    pollerState.totalCycles++;
    pollerState.lastRun = sweepStart.toISOString();
    pollerState.lastStats = {
      devicesChecked,
      onusChecked,
      alarmsTriggered
    };

    // Broadcast cycle completion to connected frontend clients
    broadcastEvent('POLLER_CYCLE_DONE', {
      timestamp: pollerState.lastRun,
      totalCycles: pollerState.totalCycles,
      stats: pollerState.lastStats,
      isManual
    });

    return {
      success: true,
      sweepDurationMs: Date.now() - sweepStart.getTime(),
      stats: pollerState.lastStats
    };
  } finally {
    isSweeping = false;
  }
}

export function startPollerDaemon(intervalSeconds = 30) {
  if (pollerTimer) {
    clearInterval(pollerTimer);
  }

  pollerState.intervalSeconds = intervalSeconds;
  pollerState.isRunning = true;

  // Run initial sweep immediately after start
  executePollerSweep(false).catch((err) => console.error('Poller initial sweep error:', err));

  // Recurring background interval
  pollerTimer = setInterval(() => {
    executePollerSweep(false).catch((err) => console.error('Poller sweep error:', err));
  }, intervalSeconds * 1000);

  console.log(`[POLLER-DAEMON] Background worker started with interval: ${intervalSeconds}s`);
}

export function stopPollerDaemon() {
  if (pollerTimer) {
    clearInterval(pollerTimer);
    pollerTimer = null;
  }
  pollerState.isRunning = false;
  console.log('[POLLER-DAEMON] Background worker stopped');
}
