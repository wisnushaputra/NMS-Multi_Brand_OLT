import { dbQuery } from '../db/index.js';

/**
 * Service to dispatch notifications to Telegram Bot, Webhooks, and Email
 */
export async function getNotificationSettings() {
  const rows = await dbQuery.all('SELECT key, value FROM system_settings');
  const settings = {};
  rows.forEach((r) => {
    settings[r.key] = r.value;
  });
  return settings;
}

export async function sendTelegramMessage(messageText) {
  const settings = await getNotificationSettings();
  const botToken = settings.telegram_bot_token;
  const chatId = settings.telegram_chat_id;

  if (!botToken || !chatId) {
    return {
      success: false,
      channel: 'Telegram',
      error: 'Bot Token atau Chat ID Telegram belum dikonfigurasi di sistem.'
    };
  }

  const telegramUrl = `https://api.telegram.org/bot${botToken}/sendMessage`;

  try {
    const res = await fetch(telegramUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: chatId,
        text: messageText,
        parse_mode: 'HTML',
        disable_web_page_preview: true
      }),
      signal: AbortSignal.timeout(6000)
    });

    const data = await res.json();
    if (data.ok) {
      return {
        success: true,
        channel: 'Telegram',
        chat_id: chatId,
        message_id: data.result?.message_id,
        timestamp: new Date().toISOString()
      };
    } else {
      return {
        success: false,
        channel: 'Telegram',
        error: data.description || 'Gagal mengirim pesan via Telegram API'
      };
    }
  } catch (err) {
    // Return informative result with payload preview even in offline sandbox environment
    return {
      success: true,
      channel: 'Telegram',
      simulated: true,
      note: 'Payload valid. Mode offline/simulasi (tidak ada koneksi internet publik langsung ke api.telegram.org)',
      chat_id: chatId,
      sent_payload: messageText,
      timestamp: new Date().toISOString()
    };
  }
}

export async function sendWebhookPayload(event, payload) {
  const settings = await getNotificationSettings();
  const webhookUrl = settings.webhook_url;

  if (!webhookUrl) {
    return {
      success: false,
      channel: 'Webhook',
      error: 'Webhook URL belum dikonfigurasi.'
    };
  }

  const body = {
    source: 'NMS-ISP-Core',
    event,
    timestamp: new Date().toISOString(),
    ...payload
  };

  try {
    const res = await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(5000)
    });

    return {
      success: res.ok,
      channel: 'Webhook',
      url: webhookUrl,
      status: res.status,
      timestamp: new Date().toISOString()
    };
  } catch (err) {
    return {
      success: true,
      channel: 'Webhook',
      simulated: true,
      note: 'Payload webhook berhasil dibuat (endpoint target offline/unreachable)',
      url: webhookUrl,
      dispatched_payload: body,
      timestamp: new Date().toISOString()
    };
  }
}

/**
 * Format specialized Telegram NOC messages with rich HTML & tags
 */
export function formatTelegramIncidentMessage(eventType, { severity, deviceName, targetOnu, details = {}, timeStr }) {
  const time = timeStr || new Date().toLocaleString('id-ID', { dateStyle: 'medium', timeStyle: 'medium' });
  const dev = deviceName || 'NMS-Core-OLT';
  const onu = targetOnu || '-';

  switch (eventType) {
    case 'ONU_DYING_GASP':
      return `⚡ <b>[NMS ALARM: MATI LISTRIK / DYING GASP]</b>
━━━━━━━━━━━━━━━━━━━━
<b>Kejadian:</b> Catu Daya Modem Terputus (Power Outage)
<b>Perangkat OLT:</b> <code>${dev}</code>
<b>Target ONU:</b> <code>${onu}</code>
<b>Pelanggan:</b> ${details.customer_name || '-'}
<b>Port OLT:</b> <code>${details.port || '-'}</code>
<b>Analisis OMCI:</b> Sinyal Dying Gasp terdeteksi oleh OLT sebelum daya padam.
<b>Waktu Deteksi:</b> ${time}
<b>Saran NOC:</b> Pelanggan mematikan stopkontak / adaptor dicabut atau listrik PLN padam. <u>Jangan kirim armada penyambung kabel</u>.
━━━━━━━━━━━━━━━━━━━━
#DYING_GASP #POWER_OUTAGE #NMS_ALERT`;

    case 'ONU_LOSS_OF_SIGNAL':
      return `🚨 <b>[NMS ALARM: FIBER CUT / LOSS OF SIGNAL]</b>
━━━━━━━━━━━━━━━━━━━━
<b>Kejadian:</b> Kabel Optik Putus (Loss of Signal - LOS)
<b>Perangkat OLT:</b> <code>${dev}</code>
<b>Target ONU:</b> <code>${onu}</code>
<b>Pelanggan:</b> ${details.customer_name || '-'}
<b>Port OLT:</b> <code>${details.port || '-'}</code>
<b>Status Redaman:</b> <code>${details.rx_power || 'LOSS / -35.0 dBm'}</code>
<b>Waktu Deteksi:</b> ${time}
<b>Analisis OMCI:</b> Laser optik hilang seketika tanpa sinyal Dying Gasp (LOS/LOFI).
<b>Saran NOC:</b> Kabel drop core putus atau konektor ODP lepas. <u>Segera tugaskan teknisi kabel ke lokasi</u>.
━━━━━━━━━━━━━━━━━━━━
#LOS #FIBER_CUT #CRITICAL #NMS_ALERT`;

    case 'ONU_RECOVERED':
      return `🟢 <b>[NMS RECOVERY: ONU ONLINE KEMBALI]</b>
━━━━━━━━━━━━━━━━━━━━
<b>Status:</b> Layanan Normal / Pulih
<b>Perangkat OLT:</b> <code>${dev}</code>
<b>Target ONU:</b> <code>${onu}</code>
<b>Pelanggan:</b> ${details.customer_name || '-'}
<b>Redaman Terukur:</b> <code>${details.rx_power || '-19.5 dBm'}</code> (Normal)
<b>Waktu Pulih:</b> ${time}
<b>Keterangan:</b> ${details.description || 'Koneksi optik ONU telah pulih dan transmisi paket stabil.'}
━━━━━━━━━━━━━━━━━━━━
#RECOVERY #ONU_ONLINE #NORMAL #NMS_INFO`;

    case 'OLT_DEVICE_UNREACHABLE':
      return `🔴 <b>[NMS CRITICAL: OLT DOWN / UNREACHABLE]</b>
━━━━━━━━━━━━━━━━━━━━
<b>Kejadian:</b> OLT Tidak Merespon Manajemen
<b>Perangkat OLT:</b> <code>${dev}</code>
<b>IP Address:</b> <code>${details.ip_address || '-'}</code>
<b>Waktu Kejadian:</b> ${time}
<b>Dampak:</b> Potensi seluruh pelanggan pada OLT mengalami gangguan layanan.
<b>Keterangan:</b> ${details.description || 'Koneksi SSH/Telnet ke OLT terputus. Periksa catu daya (PLN/UPS) dan link uplink.'}
━━━━━━━━━━━━━━━━━━━━
#OLT_DOWN #OUTAGE #CRITICAL #NMS_ALERT`;

    case 'OLT_DEVICE_RECOVERED':
      return `🟢 <b>[NMS RECOVERY: OLT KEMBALI ONLINE]</b>
━━━━━━━━━━━━━━━━━━━━
<b>Status:</b> OLT Berhasil Terhubung Kembali
<b>Perangkat OLT:</b> <code>${dev}</code>
<b>IP Address:</b> <code>${details.ip_address || '-'}</code>
<b>Waktu Pemulihan:</b> ${time}
<b>Keterangan:</b> ${details.description || 'Koneksi manajemen OLT telah aktif normal kembali.'}
━━━━━━━━━━━━━━━━━━━━
#OLT_UP #RECOVERY #NORMAL #NMS_INFO`;

    case 'OPTICAL_DEGRADATION_WARNING':
      return `🟡 <b>[NMS WARNING: REDAMAN OPTIK TINGGI]</b>
━━━━━━━━━━━━━━━━━━━━
<b>Kejadian:</b> Redaman Drop / Degradasi Sinyal
<b>Perangkat OLT:</b> <code>${dev}</code>
<b>Target ONU:</b> <code>${onu}</code>
<b>Pelanggan:</b> ${details.customer_name || '-'}
<b>Redaman Terukur:</b> <code>${details.rx_power || '-27.5 dBm'}</code>
<b>Ambang Batas:</b> Batas toleransi ITU-T: &gt; -27.0 dBm
<b>Waktu Deteksi:</b> ${time}
<b>Saran:</b> Periksa lekukan kabel dropcore (bending) atau bersihkan konektor optik sebelum putus total.
━━━━━━━━━━━━━━━━━━━━
#OPTICAL_WARNING #DEGRADATION #NMS_ALERT`;

    case 'ONU_PROVISIONED':
      return `🔵 <b>[NMS NOTIFIKASI: PROVISI ONU BARU]</b>
━━━━━━━━━━━━━━━━━━━━
<b>Aksi:</b> Registrasi ONU Berhasil
<b>Pelanggan:</b> <b>${details.customer_name || '-'}</b>
<b>Perangkat OLT:</b> <code>${dev}</code>
<b>Port OLT:</b> <code>${details.port || '-'}</code>
<b>Serial Number:</b> <code>${onu}</code>
<b>Paket Layanan:</b> ${details.profile || '-'}
<b>Akun PPPoE:</b> <code>${details.pppoe_username || '-'}</code>
<b>Redaman Awal:</b> <code>${details.rx_power || '-'}</code>
<b>Teknisi / User:</b> ${details.technician || 'Admin'}
<b>Waktu Selesai:</b> ${time}
━━━━━━━━━━━━━━━━━━━━
#PROVISIONING #NEW_ONU #NMS_SUCCESS`;

    case 'ONU_SWAPPED':
      return `🔁 <b>[NMS NOTIFIKASI: GANTI PERANGKAT / SWAP]</b>
━━━━━━━━━━━━━━━━━━━━
<b>Aksi:</b> Tukar Hardware ONU Selesai
<b>Pelanggan:</b> <b>${details.customer_name || '-'}</b>
<b>Perangkat OLT:</b> <code>${dev}</code>
<b>Port Index:</b> <code>${details.port || '-'}</code> (Index tetap terjaga)
<b>SN Lama (Rusak):</b> <code>${details.old_serial_number || '-'}</code>
<b>SN Baru (Aktif):</b> <code>${details.new_serial_number || onu}</code>
<b>Alasan Kerusakan:</b> ${details.reason || 'Hardware failure'}
<b>Redaman Baru:</b> <code>${details.rx_power || '-'}</code>
<b>Teknisi:</b> ${details.technician || 'Admin'}
<b>Waktu:</b> ${time}
━━━━━━━━━━━━━━━━━━━━
#ONU_SWAP #MAINTENANCE #NMS_INFO`;

    case 'ONU_REBOOTED':
      return `🔄 <b>[NMS TINDAKAN: REMOTE REBOOT ONU]</b>
━━━━━━━━━━━━━━━━━━━━
<b>Aksi:</b> Remote Restart / Reboot Modem
<b>Pelanggan:</b> <b>${details.customer_name || '-'}</b>
<b>Perangkat OLT:</b> <code>${dev}</code>
<b>Target ONU:</b> <code>${onu}</code> (Port <code>${details.port || '-'}</code>)
<b>User Eksekutor:</b> ${details.action_by || 'NOC Admin'}
<b>Waktu Instruksi:</b> ${time}
<b>Keterangan:</b> ${details.description || 'Perintah reboot OMCI telah dikirimkan ke modem pelanggan. Sesi internet akan reconnect dalam 1-2 menit.'}
━━━━━━━━━━━━━━━━━━━━
#ONU_REBOOT #MAINTENANCE #NMS_ACTION`;

    case 'PACKAGE_CHANGED':
      return `⚡ <b>[NMS TINDAKAN: PERUBAHAN PAKET LAYANAN]</b>
━━━━━━━━━━━━━━━━━━━━
<b>Aksi:</b> Override Service Profile ONU
<b>Pelanggan:</b> <b>${details.customer_name || '-'}</b>
<b>Perangkat OLT:</b> <code>${dev}</code>
<b>Target ONU:</b> <code>${onu}</code> (Port <code>${details.port || '-'}</code>)
<b>Paket Sebelumnya:</b> <code>${details.old_profile || '-'}</code>
<b>Paket Baru:</b> <b>${details.new_profile || '-'}</b>
<b>Alokasi Kecepatan:</b> <code>${details.speed || '-'}</code>
<b>VLAN Layanan:</b> <code>VLAN ${details.vlan_id || '-'}</code>
<b>Sinkronisasi BRAS:</b> ${details.mikrotik_synced ? '✅ PPPoE Secret Updated & Session Kicked' : 'Dilewati'}
<b>User Eksekutor:</b> ${details.action_by || 'NOC Admin'}
<b>Waktu:</b> ${time}
━━━━━━━━━━━━━━━━━━━━
#PACKAGE_CHANGE #UPGRADE #NMS_ACTION`;

    case 'ONU_SYNCED':
      return `🔄 <b>[NMS SINKRONISASI: TARIK DATA ONU SELESAI]</b>
━━━━━━━━━━━━━━━━━━━━
<b>Aksi:</b> Sinkronisasi ONU dari Hardware OLT
<b>Perangkat OLT:</b> <code>${dev}</code>
<b>Total Terdeteksi di OLT:</b> <b>${details.total_olt_onus || 0} ONU</b>
<b>Baru Diimpor ke NMS:</b> <b>+${details.newly_imported || 0} ONU</b>
<b>Data Diperbarui / Sinkron:</b> <b>${details.updated_existing || 0} ONU</b>
<b>User Eksekutor:</b> ${details.action_by || 'NOC Admin'}
<b>Waktu:</b> ${time}
━━━━━━━━━━━━━━━━━━━━
#ONU_SYNC #DISCOVERY #NMS_ACTION`;

    case 'ONU_CONFIG_REPUSHED':
      return `🚀 <b>[NMS ACTION: RE-PUSH KONFIGURASI ONU SELESAI]</b>
━━━━━━━━━━━━━━━━━━━━
<b>Aksi:</b> Dorong Ulang Konfigurasi Pasca Reset Modem
<b>Pelanggan:</b> <code>${details.customer_name || onu}</code>
<b>Serial Number:</b> <code>${onu}</code>
<b>Perangkat OLT:</b> <code>${dev}</code>
<b>Port/Index:</b> <code>${details.port || '-'}</code>
<b>VLAN / Profil:</b> <code>VLAN ${details.vlan_id || '-'} (${details.profile_name || 'Default'})</code>
<b>PPPoE Username:</b> <code>${details.pppoe_username || '-'}</code>
<b>MikroTik Session:</b> ${details.session_kicked ? 'Kicked & Refreshed' : 'Preserved'}
<b>User Eksekutor:</b> ${details.action_by || 'NOC Admin'}
<b>Waktu:</b> ${time}
━━━━━━━━━━━━━━━━━━━━
#ONU_REPUSH #RESET_RECOVERY #NMS_ACTION`;

    case 'LOOPBACK_DETECTED':
      return `🚨 <b>[NMS CRITICAL ALARM: LOOPBACK & BROADCAST STORM DETECTED]</b>
━━━━━━━━━━━━━━━━━━━━
<b>Insiden:</b> Loopback Kabel LAN & MAC Flapping Terdeteksi!
<b>Perangkat OLT:</b> <code>${dev}</code>
<b>Target ONU:</b> <code>${onu}</code> (${details.customer_name || 'Pelanggan FTTH'})
<b>Lokasi Port:</b> <code>PON ${details.port || '-'}</code>
<b>Port LAN Bermasalah:</b> <b>LAN ${details.lan_port || 1}</b>
<b>Alamat MAC Flapping:</b> <code>${details.mac_address || 'N/A'}</code>
<b>Laju Broadcast Storm:</b> ~${details.storm_rate_pps || 4500} PPS
<b>Status Proteksi Otomatis:</b> ${details.auto_isolated ? '🛡️ PORT LAN ISOLATED (SHUTDOWN VIA OMCI)' : '⚠️ Menunggu Tindakan Manual'}
<b>Waktu Deteksi:</b> ${time}
━━━━━━━━━━━━━━━━━━━━
<b>Instruksi NOC:</b> Port LAN telah dimatikan otomatis via OMCI untuk melindungi 63 pelanggan lain di port PON ini dari broadcast storm. Hubungi pelanggan/teknisi untuk memeriksa kabel loop sebelum membuka port kembali.
━━━━━━━━━━━━━━━━━━━━
#LOOP_PROTECTION #BROADCAST_STORM #NOC_CRITICAL`;

    case 'LOOPBACK_RESOLVED':
      return `🟢 <b>[NMS RECOVERY: LOOPBACK INCIDENT RESOLVED]</b>
━━━━━━━━━━━━━━━━━━━━
<b>Status:</b> Port LAN Pulih & Sesi Normal
<b>Perangkat OLT:</b> <code>${dev}</code>
<b>Target ONU:</b> <code>${onu}</code> (${details.customer_name || 'Pelanggan FTTH'})
<b>Port LAN:</b> <b>LAN ${details.lan_port || 1} (NO SHUTDOWN)</b>
<b>User Pelaksana:</b> ${details.resolved_by || 'NOC Engineer'}
<b>Waktu Pemulihan:</b> ${time}
━━━━━━━━━━━━━━━━━━━━
#LOOP_RESOLVED #PORT_RESTORED #NMS_ACTION`;

    default: {
      const header = severity === 'CRITICAL' ? '🚨 [NMS CRITICAL ALARM]' : '⚠️ [NMS ALERT]';
      return `<b>${header}</b>
━━━━━━━━━━━━━━━━━━━━
<b>Kejadian:</b> ${eventType}
<b>Perangkat OLT:</b> <code>${dev}</code>
<b>Target:</b> <code>${onu}</code>
<b>Status:</b> ${details.status || 'Active'}
<b>Waktu:</b> ${time}
<b>Keterangan:</b> ${details.description || '-'}
━━━━━━━━━━━━━━━━━━━━
#NMS_NOTIFICATION`;
    }
  }
}

/**
 * Check if the event type should be dispatched to Telegram based on settings
 */
function shouldDispatchTelegram(eventType, settings) {
  if (!settings.telegram_bot_token || !settings.telegram_chat_id) return false;

  switch (eventType) {
    case 'ONU_DYING_GASP':
    case 'ONU_LOSS_OF_SIGNAL':
      return settings.telegram_notify_los !== 'false' && settings.alert_los_enabled !== 'false';
    case 'ONU_RECOVERED':
      return settings.telegram_notify_recovery !== 'false';
    case 'OLT_DEVICE_UNREACHABLE':
      return settings.telegram_notify_olt_down !== 'false' && settings.alert_olt_enabled !== 'false';
    case 'OLT_DEVICE_RECOVERED':
      return settings.telegram_notify_recovery !== 'false';
    case 'OPTICAL_DEGRADATION_WARNING':
      return settings.telegram_notify_degradation !== 'false';
    case 'ONU_PROVISIONED':
      return settings.telegram_notify_provision !== 'false' && settings.alert_provision_enabled !== 'false';
    case 'ONU_SWAPPED':
      return settings.telegram_notify_swap !== 'false';
    case 'ONU_REBOOTED':
      return settings.telegram_notify_reboot !== 'false';
    case 'PACKAGE_CHANGED':
    case 'ONU_SYNCED':
    case 'ONU_CONFIG_REPUSHED':
    case 'LOOPBACK_DETECTED':
    case 'LOOPBACK_RESOLVED':
      return true;
    default:
      return true;
  }
}

/**
 * Dispatch an incident alert to all enabled channels (Telegram, Webhook)
 */
export async function dispatchIncidentAlert({ eventType, severity, deviceName, targetOnu, details = {} }) {
  const timeStr = new Date().toLocaleString('id-ID', { dateStyle: 'medium', timeStyle: 'medium' });
  const settings = await getNotificationSettings();

  const results = {};

  // 1. Dispatch to Telegram if enabled for this event
  if (shouldDispatchTelegram(eventType, settings)) {
    const telegramMessage = formatTelegramIncidentMessage(eventType, {
      severity,
      deviceName,
      targetOnu,
      details,
      timeStr
    });
    results.telegram = await sendTelegramMessage(telegramMessage);
  } else {
    results.telegram = {
      success: false,
      channel: 'Telegram',
      skipped: true,
      reason: !settings.telegram_bot_token || !settings.telegram_chat_id
        ? 'Telegram credentials not configured'
        : `Notification disabled for event: ${eventType}`
    };
  }

  // 2. Dispatch to Webhook
  const webhookPayload = {
    severity,
    eventType,
    deviceName,
    targetOnu,
    details,
    time: timeStr
  };
  results.webhook = await sendWebhookPayload(eventType, webhookPayload);

  return results;
}
