import { dbQuery } from '../db/index.js';
import { createAuditLog } from '../services/audit_service.js';
import {
  sendTelegramMessage,
  sendWebhookPayload,
  dispatchIncidentAlert,
  getNotificationSettings
} from '../services/notification_service.js';
import {
  testGenieACSConnection,
  fetchGenieACSCPEs,
  rebootCPE,
  getGenieACSSettings
} from '../services/genieacs_service.js';

export async function getIntegrationSettings(req, res) {
  try {
    const settings = await getNotificationSettings();
    const acsSettings = await getGenieACSSettings();

    res.json({
      genieacs_url: acsSettings.url,
      genieacs_status: acsSettings.status,
      tr069_acs_url: acsSettings.acsUrl,
      tr069_state: acsSettings.state,
      telegram_bot_token: settings.telegram_bot_token ? '••••••••' + settings.telegram_bot_token.slice(-4) : '',
      telegram_has_token: !!settings.telegram_bot_token,
      telegram_chat_id: settings.telegram_chat_id || '',
      telegram_notify_los: settings.telegram_notify_los !== 'false',
      telegram_notify_olt_down: settings.telegram_notify_olt_down !== 'false',
      telegram_notify_recovery: settings.telegram_notify_recovery !== 'false',
      telegram_notify_degradation: settings.telegram_notify_degradation !== 'false',
      telegram_notify_provision: settings.telegram_notify_provision !== 'false',
      telegram_notify_swap: settings.telegram_notify_swap !== 'false',
      telegram_notify_reboot: settings.telegram_notify_reboot !== 'false',
      webhook_url: settings.webhook_url || '',
      alert_los_enabled: settings.alert_los_enabled !== 'false',
      alert_olt_enabled: settings.alert_olt_enabled !== 'false',
      alert_provision_enabled: settings.alert_provision_enabled === 'true'
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

export async function saveIntegrationSettings(req, res) {
  try {
    const {
      genieacs_url,
      tr069_acs_url,
      tr069_state,
      telegram_bot_token,
      telegram_chat_id,
      telegram_notify_los,
      telegram_notify_olt_down,
      telegram_notify_recovery,
      telegram_notify_degradation,
      telegram_notify_provision,
      telegram_notify_swap,
      telegram_notify_reboot,
      webhook_url,
      alert_los_enabled,
      alert_olt_enabled,
      alert_provision_enabled
    } = req.body;

    const upsertSetting = async (k, v) => {
      if (v !== undefined && v !== null) {
        await dbQuery.run(
          'INSERT INTO system_settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value',
          [k, String(v)]
        );
      }
    };

    if (genieacs_url !== undefined) await upsertSetting('genieacs_url', genieacs_url.trim());
    if (tr069_acs_url !== undefined) await upsertSetting('tr069_acs_url', tr069_acs_url.trim());
    if (tr069_state !== undefined) await upsertSetting('tr069_state', tr069_state.trim());
    if (telegram_bot_token && !telegram_bot_token.includes('••••')) {
      await upsertSetting('telegram_bot_token', telegram_bot_token.trim());
    }
    if (telegram_chat_id !== undefined) await upsertSetting('telegram_chat_id', telegram_chat_id.trim());
    if (telegram_notify_los !== undefined) await upsertSetting('telegram_notify_los', String(telegram_notify_los));
    if (telegram_notify_olt_down !== undefined) await upsertSetting('telegram_notify_olt_down', String(telegram_notify_olt_down));
    if (telegram_notify_recovery !== undefined) await upsertSetting('telegram_notify_recovery', String(telegram_notify_recovery));
    if (telegram_notify_degradation !== undefined) await upsertSetting('telegram_notify_degradation', String(telegram_notify_degradation));
    if (telegram_notify_provision !== undefined) await upsertSetting('telegram_notify_provision', String(telegram_notify_provision));
    if (telegram_notify_swap !== undefined) await upsertSetting('telegram_notify_swap', String(telegram_notify_swap));
    if (telegram_notify_reboot !== undefined) await upsertSetting('telegram_notify_reboot', String(telegram_notify_reboot));
    if (webhook_url !== undefined) await upsertSetting('webhook_url', webhook_url.trim());
    if (alert_los_enabled !== undefined) await upsertSetting('alert_los_enabled', String(alert_los_enabled));
    if (alert_olt_enabled !== undefined) await upsertSetting('alert_olt_enabled', String(alert_olt_enabled));
    if (alert_provision_enabled !== undefined) await upsertSetting('alert_provision_enabled', String(alert_provision_enabled));

    await createAuditLog({
      user: req.user,
      action: 'Simpan Setelan Integrasi',
      details: {
        genieacs_configured: !!genieacs_url,
        telegram_configured: !!telegram_chat_id,
        webhook_configured: !!webhook_url
      }
    });

    res.json({ message: 'Setelan integrasi berhasil disimpan' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

export async function getGenieACSStatus(req, res) {
  try {
    const acsSettings = await getGenieACSSettings();
    const totalCpe = await dbQuery.get('SELECT COUNT(*) as count FROM onus WHERE pppoe_username IS NOT NULL');

    res.json({
      url: acsSettings.url,
      status: acsSettings.status,
      version: 'GenieACS v1.2.9 REST API',
      activeCPEs: totalCpe?.count || 0,
      lastSync: new Date().toISOString()
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

export async function syncGenieACS(req, res) {
  try {
    const { genieacs_url } = req.body;
    const acsSettings = await getGenieACSSettings();
    const targetUrl = genieacs_url || acsSettings.url;

    if (genieacs_url) {
      await dbQuery.run(
        'INSERT INTO system_settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value',
        ['genieacs_url', genieacs_url.trim()]
      );
    }

    const testResult = await testGenieACSConnection(targetUrl);
    const cpeList = await fetchGenieACSCPEs(targetUrl);

    await createAuditLog({
      user: req.user,
      action: 'Sync GenieACS TR-069',
      details: {
        target_url: targetUrl,
        cpe_count: cpeList.length
      }
    });

    res.json({
      message: 'Sinkronisasi GenieACS TR-069 berhasil dilakukan',
      connectionStatus: testResult.status,
      syncedCPECount: cpeList.length,
      cpes: cpeList,
      timestamp: new Date().toISOString()
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

export async function rebootGenieACSCPE(req, res) {
  try {
    const { cpe_id } = req.params;
    const result = await rebootCPE(cpe_id);

    await createAuditLog({
      user: req.user,
      action: 'TR-069 Reboot CPE',
      details: { cpe_id }
    });

    res.json({
      message: `Perintah reboot berhasil dikirim ke CPE ${cpe_id}`,
      result
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

export async function sendTestNotification(req, res) {
  try {
    const { target, message } = req.body;
    let result = null;

    if (target === 'Telegram') {
      const msg = message || '<b>[NMS Test Alert]</b>\nUji coba konektivitas Bot Telegram Network Operations Center berhasil.';
      result = await sendTelegramMessage(msg);
    } else if (target === 'Webhook') {
      result = await sendWebhookPayload('TEST_NOTIFICATION', {
        message: message || 'Uji coba Webhook dispatch dari NMS ISP Core',
        testId: Math.floor(Math.random() * 90000) + 10000
      });
    } else {
      // Both
      const tRes = await sendTelegramMessage(message || 'Test Alert NMS Multi-Channel');
      const wRes = await sendWebhookPayload('TEST_NOTIFICATION', { message: message || 'Test Alert' });
      result = { telegram: tRes, webhook: wRes };
    }

    await createAuditLog({
      user: req.user,
      action: 'Kirim Notifikasi Uji Coba',
      details: { target, result }
    });

    res.json({
      message: `Uji coba notifikasi ke ${target} selesai dijalankan`,
      details: result
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

export async function simulateIncidentAlert(req, res) {
  try {
    const { incidentType } = req.body;

    let eventType = 'ONU_LOSS_OF_SIGNAL';
    let severity = 'CRITICAL';
    let deviceName = 'OLT-ZTE-WEST-01';
    let targetOnu = 'ZTEGC9988776';
    let details = {
      status: 'Loss of Signal',
      customer_name: 'RUDI RUSMANA (RT 03)',
      port: '1/1/2:4',
      rx_power: '-33.2 dBm (Loss)',
      description: 'Optical Rx Power drop di bawah -32.0 dBm (Loss of Signal / Kabel Dropcore Putus)'
    };

    if (incidentType === 'olt_down') {
      eventType = 'OLT_DEVICE_UNREACHABLE';
      severity = 'CRITICAL';
      deviceName = 'OLT-HUAWEI-EAST-01';
      targetOnu = 'ALL_ONUS';
      details = {
        status: 'Unreachable / Down',
        ip_address: '10.10.10.25',
        description: 'Koneksi SSH dan manajemen OLT terputus (Power failure / Uplink down)'
      };
    } else if (incidentType === 'onu_recovery') {
      eventType = 'ONU_RECOVERED';
      severity = 'INFO';
      deviceName = 'OLT-ZTE-WEST-01';
      targetOnu = 'ZTEGC9988776';
      details = {
        status: 'Online (Recovered)',
        customer_name: 'RUDI RUSMANA (RT 03)',
        rx_power: '-19.4 dBm',
        description: 'Koneksi fiber optik pelanggan telah pulih normal kembali.'
      };
    } else if (incidentType === 'optical_degradation') {
      eventType = 'OPTICAL_DEGRADATION_WARNING';
      severity = 'WARNING';
      deviceName = 'OLT-ZTE-WEST-01';
      targetOnu = 'ZTEGC9988776';
      details = {
        status: 'Warning (High Attenuation)',
        customer_name: 'RUDI RUSMANA (RT 03)',
        rx_power: '-27.8 dBm',
        description: 'Redaman sinyal drop melewati batas aman ITU-T (-27 dBm). Potensi bending kabel optik.'
      };
    } else if (incidentType === 'onu_provisioned') {
      eventType = 'ONU_PROVISIONED';
      severity = 'INFO';
      deviceName = 'OLT-ANTAPANI-01';
      targetOnu = 'ZTEGC1122334';
      details = {
        status: 'Online (Provisioned)',
        customer_name: 'HENDRA WIJAYA',
        port: '1/1/3:7',
        profile: 'INTERNET-100M',
        pppoe_username: 'hendra@pass.net.id',
        rx_power: '-19.8 dBm',
        technician: req.user?.username || 'tech_budi'
      };
    } else if (incidentType === 'onu_swapped') {
      eventType = 'ONU_SWAPPED';
      severity = 'WARNING';
      deviceName = 'OLT-ANTAPANI-01';
      targetOnu = 'ZTEGC8899001';
      details = {
        status: 'Swapped',
        customer_name: 'HENDRA WIJAYA',
        port: '1/1/3:7',
        old_serial_number: 'ZTEGC1122334',
        new_serial_number: 'ZTEGC8899001',
        reason: 'Tersambar Petir / Port LAN 1 Rusak',
        rx_power: '-20.1 dBm',
        technician: req.user?.username || 'tech_budi'
      };
    } else if (incidentType === 'customer_isolated') {
      eventType = 'CUSTOMER_ISOLATED';
      severity = 'WARNING';
      deviceName = 'MikroTik BRAS';
      targetOnu = 'ZTEGC9988776';
      details = {
        status: 'Isolated',
        customer_name: 'RUDI RUSMANA',
        pppoe_username: 'rudi@pass.net.id',
        reason: 'Tunggakan Tagihan Bulanan',
        action_by: req.user?.username || 'admin'
      };
    } else if (incidentType === 'customer_restored') {
      eventType = 'CUSTOMER_RESTORED';
      severity = 'INFO';
      deviceName = 'MikroTik BRAS';
      targetOnu = 'ZTEGC9988776';
      details = {
        status: 'Restored',
        customer_name: 'RUDI RUSMANA',
        pppoe_username: 'rudi@pass.net.id',
        profile: 'profile_50mbps',
        action_by: req.user?.username || 'admin'
      };
    }

    const dispatchResults = await dispatchIncidentAlert({
      eventType,
      severity,
      deviceName,
      targetOnu,
      details
    });

    await createAuditLog({
      user: req.user,
      action: 'Simulasi Alarm Gangguan',
      details: {
        incidentType,
        eventType,
        deviceName,
        targetOnu,
        dispatchResults
      }
    });

    res.json({
      message: `Alarm gangguan [${eventType}] berhasil disimulasikan dan didorong ke kanal notifikasi`,
      dispatchResults
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}
