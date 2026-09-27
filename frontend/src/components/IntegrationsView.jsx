import React, { useState, useEffect } from 'react';
import {
  Server, Send, RefreshCw, CheckCircle2, XCircle, AlertTriangle,
  RotateCcw, Save, ShieldAlert, Wifi, Globe, Terminal, Play,
  Check, ExternalLink, Key, MessageSquare, Bell, Sliders, Cpu,
  Repeat, Lock, Unlock, HelpCircle, Eye, Info, Zap
} from 'lucide-react';
import {
  getIntegrationSettings,
  saveIntegrationSettings,
  syncGenieACS,
  rebootGenieACSCPE,
  sendTestNotification,
  simulateIncidentAlert,
  getMikroTikSettings,
  saveMikroTikSettings,
  getMikroTikStatus
} from '../services/api';

export default function IntegrationsView() {
  const [activeSubTab, setActiveSubTab] = useState('mikrotik'); // 'mikrotik' | 'genieacs' | 'telegram' | 'webhook' | 'simulator'
  const [loading, setLoading] = useState(false);
  const [toast, setToast] = useState(null);

  // MikroTik BRAS State
  const [mikrotikSettings, setMikrotikSettings] = useState({
    host: '10.10.10.1',
    port: 8728,
    username: 'admin',
    password: '',
    use_tls: false,
    default_profile: 'profile_50mbps'
  });
  const [mikrotikStatus, setMikrotikStatus] = useState(null);
  const [isTestingMikrotik, setIsTestingMikrotik] = useState(false);
  const [isSavingMikrotik, setIsSavingMikrotik] = useState(false);

  // Settings State
  const [settings, setSettings] = useState({
    genieacs_url: '',
    genieacs_status: 'Belum Dikonfigurasi',
    telegram_bot_token: '',
    telegram_has_token: false,
    telegram_chat_id: '',
    telegram_notify_los: true,
    telegram_notify_olt_down: true,
    telegram_notify_recovery: true,
    telegram_notify_degradation: true,
    telegram_notify_provision: true,
    telegram_notify_swap: true,
    telegram_notify_reboot: true,
    webhook_url: '',
    alert_los_enabled: true,
    alert_olt_enabled: true,
    alert_provision_enabled: false
  });

  // GenieACS CPEs state
  const [cpes, setCpes] = useState([]);
  const [cpeLoading, setCpeLoading] = useState(false);
  const [cpeSearch, setCpeSearch] = useState('');
  const [selectedCpe, setSelectedCpe] = useState(null);
  const [actionLoading, setActionLoading] = useState(null);
  const [isSyncingAcs, setIsSyncingAcs] = useState(false);
  const [rebootingId, setRebootingId] = useState(null);

  // Test Notification state
  const [testTarget, setTestTarget] = useState('Telegram');
  const [testMsg, setTestMsg] = useState('');
  const [isSendingNotif, setIsSendingNotif] = useState(false);
  const [notifResult, setNotifResult] = useState(null);
  const [telegramPreviewScenario, setTelegramPreviewScenario] = useState('los');
  const [showBotGuide, setShowBotGuide] = useState(false);

  const telegramPresets = {
    los: {
      label: '🚨 Fiber Cut / LOS',
      text: `🚨 <b>[NMS ALARM: FIBER CUT / LOS]</b>\n━━━━━━━━━━━━━━━━━━━━\n<b>Kejadian:</b> Loss of Signal (Kabel Optik Putus)\n<b>Perangkat OLT:</b> <code>OLT-ANTAPANI-01</code>\n<b>Target ONU:</b> <code>ZTEGC9988776</code>\n<b>Pelanggan:</b> RUDI RUSMANA (RT 03)\n<b>Port OLT:</b> <code>1/1/2:4</code>\n<b>Status Redaman:</b> <code>LOSS (-33.2 dBm)</code>\n<b>Waktu Deteksi:</b> ${new Date().toLocaleTimeString('id-ID')}\n<b>Keterangan:</b> Kabel drop core terputus atau konektor ODP lepas.\n━━━━━━━━━━━━━━━━━━━━\n#LOS #FIBER_CUT #CRITICAL #NMS_ALERT`
    },
    olt_down: {
      label: '🔴 OLT Down',
      text: `🔴 <b>[NMS CRITICAL: OLT DOWN / UNREACHABLE]</b>\n━━━━━━━━━━━━━━━━━━━━\n<b>Kejadian:</b> OLT Tidak Merespon Manajemen\n<b>Perangkat OLT:</b> <code>OLT-HUAWEI-EAST-01</code>\n<b>IP Address:</b> <code>10.10.10.25</code>\n<b>Waktu Kejadian:</b> ${new Date().toLocaleTimeString('id-ID')}\n<b>Dampak:</b> Seluruh pelanggan pada OLT berpotensi terganggu.\n<b>Keterangan:</b> Koneksi SSH/Telnet terputus. Periksa catu daya & uplink.\n━━━━━━━━━━━━━━━━━━━━\n#OLT_DOWN #OUTAGE #CRITICAL #NMS_ALERT`
    },
    recovery: {
      label: '🟢 Recovery Online',
      text: `🟢 <b>[NMS RECOVERY: ONU ONLINE KEMBALI]</b>\n━━━━━━━━━━━━━━━━━━━━\n<b>Status:</b> Layanan Normal / Pulih\n<b>Perangkat OLT:</b> <code>OLT-ANTAPANI-01</code>\n<b>Target ONU:</b> <code>ZTEGC9988776</code>\n<b>Pelanggan:</b> RUDI RUSMANA (RT 03)\n<b>Redaman Terukur:</b> <code>-19.4 dBm</code> (Normal)\n<b>Waktu Pulih:</b> ${new Date().toLocaleTimeString('id-ID')}\n<b>Keterangan:</b> Koneksi optik ONU telah pulih dan transmisi paket stabil.\n━━━━━━━━━━━━━━━━━━━━\n#RECOVERY #ONU_ONLINE #NORMAL #NMS_INFO`
    },
    degradation: {
      label: '🟡 Redaman Tinggi',
      text: `🟡 <b>[NMS WARNING: REDAMAN OPTIK TINGGI]</b>\n━━━━━━━━━━━━━━━━━━━━\n<b>Kejadian:</b> Redaman Drop / Degradasi Sinyal\n<b>Perangkat OLT:</b> <code>OLT-ANTAPANI-01</code>\n<b>Target ONU:</b> <code>ZTEGC9988776</code>\n<b>Pelanggan:</b> RUDI RUSMANA (RT 03)\n<b>Redaman Terukur:</b> <code>-27.8 dBm</code>\n<b>Ambang Batas:</b> Batas toleransi ITU-T: > -27.0 dBm\n<b>Waktu Deteksi:</b> ${new Date().toLocaleTimeString('id-ID')}\n<b>Saran:</b> Periksa lekukan kabel dropcore sebelum putus total.\n━━━━━━━━━━━━━━━━━━━━\n#OPTICAL_WARNING #DEGRADATION #NMS_ALERT`
    },
    provision: {
      label: '🔵 Provisi Baru',
      text: `🔵 <b>[NMS NOTIFIKASI: PROVISI ONU BARU]</b>\n━━━━━━━━━━━━━━━━━━━━\n<b>Aksi:</b> Registrasi ONU Berhasil\n<b>Pelanggan:</b> <b>HENDRA WIJAYA</b>\n<b>Perangkat OLT:</b> <code>OLT-ANTAPANI-01</code>\n<b>Port OLT:</b> <code>1/1/3:7</code>\n<b>Serial Number:</b> <code>ZTEGC1122334</code>\n<b>Paket Layanan:</b> INTERNET-100M\n<b>Akun PPPoE:</b> <code>hendra@pass.net.id</code>\n<b>Redaman Awal:</b> <code>-19.8 dBm</code>\n<b>Teknisi:</b> tech_budi\n<b>Waktu Selesai:</b> ${new Date().toLocaleTimeString('id-ID')}\n━━━━━━━━━━━━━━━━━━━━\n#PROVISIONING #NEW_ONU #NMS_SUCCESS`
    },
    swap: {
      label: '🔁 Swap Perangkat',
      text: `🔁 <b>[NMS NOTIFIKASI: GANTI PERANGKAT / SWAP]</b>\n━━━━━━━━━━━━━━━━━━━━\n<b>Aksi:</b> Tukar Hardware ONU Selesai\n<b>Pelanggan:</b> <b>HENDRA WIJAYA</b>\n<b>Perangkat OLT:</b> <code>OLT-ANTAPANI-01</code>\n<b>Port Index:</b> <code>1/1/3:7</code> (Index tetap terjaga)\n<b>SN Lama:</b> <code>ZTEGC1122334</code> (Rusak)\n<b>SN Baru:</b> <code>ZTEGC8899001</code> (Aktif)\n<b>Alasan Kerusakan:</b> Tersambar Petir / Port LAN 1 Rusak\n<b>Redaman Baru:</b> <code>-20.1 dBm</code>\n<b>Teknisi:</b> tech_budi\n<b>Waktu:</b> ${new Date().toLocaleTimeString('id-ID')}\n━━━━━━━━━━━━━━━━━━━━\n#ONU_SWAP #MAINTENANCE #NMS_INFO`
    },
    reboot: {
      label: '🔄 Remote Reboot ONU',
      text: `🔄 <b>[NMS TINDAKAN: REMOTE REBOOT ONU]</b>\n━━━━━━━━━━━━━━━━━━━━\n<b>Aksi:</b> Remote Restart / Reboot Modem\n<b>Pelanggan:</b> <b>HENDRA WIJAYA</b>\n<b>Perangkat OLT:</b> <code>OLT-ANTAPANI-01</code>\n<b>Target ONU:</b> <code>ZTEGC1122334</code> (Port <code>1/1/3:7</code>)\n<b>User Eksekutor:</b> NOC Admin\n<b>Waktu Instruksi:</b> ${new Date().toLocaleTimeString('id-ID')}\n<b>Keterangan:</b> Perintah reboot OMCI telah dikirimkan ke modem pelanggan. Sesi internet akan reconnect dalam 1-2 menit.\n━━━━━━━━━━━━━━━━━━━━\n#ONU_REBOOT #MAINTENANCE #NMS_ACTION`
    }
  };

  // Simulation state
  const [isSimulating, setIsSimulating] = useState(false);
  const [simulationResult, setSimulationResult] = useState(null);

  useEffect(() => {
    loadSettings();
    loadMikroTik();
  }, []);

  const showToast = (type, message) => {
    setToast({ type, message });
    setTimeout(() => setToast(null), 4000);
  };

  const loadMikroTik = async () => {
    try {
      const [sets, status] = await Promise.all([
        getMikroTikSettings(),
        getMikroTikStatus()
      ]);
      const s = sets.data || sets;
      const st = status.data || status;
      setMikrotikSettings({
        host: s.mikrotik_host || s.host || '10.10.10.1',
        port: parseInt(s.mikrotik_port || s.port) || 8728,
        username: s.mikrotik_user || s.username || 'admin',
        password: '',
        use_tls: s.mikrotik_use_tls === 'true' || s.mikrotik_use_tls === true || s.use_tls === true,
        default_profile: s.mikrotik_default_profile || s.default_profile || 'profile_50mbps'
      });
      setMikrotikStatus(st);
    } catch (err) {
      console.error('Failed to load MikroTik info:', err);
    }
  };

  const handleSaveMikroTikSettings = async (e) => {
    if (e) e.preventDefault();
    setIsSavingMikrotik(true);
    try {
      await saveMikroTikSettings(mikrotikSettings);
      showToast('success', 'Setelan MikroTik Core Router BRAS berhasil disimpan.');
      loadMikroTik();
    } catch (err) {
      showToast('error', `Gagal menyimpan setelan MikroTik: ${err.message}`);
    } finally {
      setIsSavingMikrotik(false);
    }
  };

  const handleTestMikroTik = async () => {
    setIsTestingMikrotik(true);
    try {
      const res = await getMikroTikStatus();
      const st = res.data || res;
      setMikrotikStatus(st);
      showToast('success', `Koneksi MikroTik ${st.board || st.board_model || 'RouterOS'} terverifikasi.`);
    } catch (err) {
      showToast('error', `Uji koneksi gagal: ${err.message}`);
    } finally {
      setIsTestingMikrotik(false);
    }
  };

  const loadSettings = async () => {
    setLoading(true);
    try {
      const data = await getIntegrationSettings();
      setSettings(data);
      if (data.genieacs_url) {
        // Automatically sync initial CPEs list
        const syncData = await syncGenieACS(data.genieacs_url);
        setCpes(syncData.cpes || []);
      }
    } catch (err) {
      console.error('Failed to load integration settings:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleSaveSettings = async (e) => {
    if (e) e.preventDefault();
    try {
      await saveIntegrationSettings(settings);
      showToast('success', 'Setelan integrasi berhasil disimpan ke sistem');
      loadSettings();
    } catch (err) {
      showToast('error', `Gagal menyimpan setelan: ${err.message}`);
    }
  };

  const handleSyncACS = async () => {
    if (!settings.genieacs_url) {
      showToast('error', 'Masukkan Server URL GenieACS terlebih dahulu');
      return;
    }
    setIsSyncingAcs(true);
    try {
      const res = await syncGenieACS(settings.genieacs_url);
      setCpes(res.cpes || []);
      setSettings((prev) => ({ ...prev, genieacs_status: res.connectionStatus }));
      showToast('success', `Sinkronisasi selesai. ${res.syncedCPECount} CPE berhasil dipetakan via TR-069.`);
    } catch (err) {
      showToast('error', `Gagal sync GenieACS: ${err.message}`);
    } finally {
      setIsSyncingAcs(false);
    }
  };

  const handleRebootCPE = async (cpe) => {
    if (!window.confirm(`Kirim perintah TR-069 Reboot ke CPE ${cpe.serialNumber}?`)) return;
    setRebootingId(cpe.id);
    try {
      const res = await rebootGenieACSCPE(cpe.id);
      showToast('success', res.message || `Perintah reboot terkirim ke CPE ${cpe.serialNumber}`);
    } catch (err) {
      showToast('error', `Gagal reboot CPE: ${err.message}`);
    } finally {
      setRebootingId(null);
    }
  };

  const handleSendTestNotification = async () => {
    setIsSendingNotif(true);
    setNotifResult(null);
    try {
      const res = await sendTestNotification(testTarget, testMsg || undefined);
      setNotifResult(res);
      showToast('success', `Uji coba pesan ke ${testTarget} berhasil dieksekusi`);
    } catch (err) {
      showToast('error', `Gagal kirim notifikasi: ${err.message}`);
    } finally {
      setIsSendingNotif(false);
    }
  };

  const handleSimulateIncident = async (incidentType) => {
    setIsSimulating(true);
    setSimulationResult(null);
    try {
      const res = await simulateIncidentAlert(incidentType);
      setSimulationResult(res);
      showToast('success', 'Alarm simulasi berhasil didorong ke kanal aktif');
    } catch (err) {
      showToast('error', `Gagal simulasi alarm: ${err.message}`);
    } finally {
      setIsSimulating(false);
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
      {/* Toast Notification Container */}
      {toast && (
        <div style={{ position: 'fixed', top: '20px', right: '20px', zIndex: 100 }}>
          <div className={`toast toast-${toast.type}`}>
            {toast.type === 'success' && <CheckCircle2 size={16} />}
            {toast.type === 'error' && <XCircle size={16} />}
            {toast.type === 'warning' && <AlertTriangle size={16} />}
            <span>{toast.message}</span>
          </div>
        </div>
      )}

      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem', marginBottom: '0.25rem' }}>
        <div>
          <h2 style={{ fontSize: '1.25rem', fontWeight: 700, color: 'var(--text-main)', margin: 0, letterSpacing: '-0.02em' }}>
            Integrasi Sistem
          </h2>
        </div>

        <div style={{ display: 'flex', gap: '0.6rem' }}>
          <button className="btn btn-primary" onClick={handleSaveSettings} disabled={loading}>
            <Save size={14} /> Simpan Setelan
          </button>
          <button className="btn btn-secondary" onClick={loadSettings} disabled={loading}>
            <RefreshCw size={14} className={loading ? 'spin-animate' : ''} />
          </button>
        </div>
      </div>

      {/* Subtabs Navigation */}
      <div style={{ display: 'flex', gap: '0.4rem', borderBottom: '1px solid var(--border-color)', paddingBottom: '0.5rem', flexWrap: 'wrap' }}>
        {[
          { id: 'mikrotik', label: 'MikroTik Core Router (BRAS)', icon: Globe },
          { id: 'genieacs', label: 'GenieACS TR-069', icon: Server },
          { id: 'telegram', label: 'Bot Notifikasi Telegram', icon: MessageSquare },
          { id: 'webhook', label: 'Webhook & Incident Triggers', icon: Bell },
          { id: 'simulator', label: 'Simulasi Alarm Gangguan', icon: ShieldAlert }
        ].map((t) => {
          const Icon = t.icon;
          const isActive = activeSubTab === t.id;
          return (
            <button
              key={t.id}
              onClick={() => setActiveSubTab(t.id)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '0.45rem',
                padding: '0.45rem 0.85rem',
                fontSize: '0.82rem',
                fontWeight: 600,
                borderRadius: 'var(--radius-md)',
                border: isActive ? '1px solid var(--border-light)' : '1px solid transparent',
                background: isActive ? 'var(--bg-card)' : 'transparent',
                color: isActive ? 'var(--text-main)' : 'var(--text-secondary)',
                cursor: 'pointer',
                transition: 'all 0.15s ease'
              }}
            >
              <Icon size={14} color={isActive ? 'var(--primary)' : 'currentColor'} />
              <span>{t.label}</span>
            </button>
          );
        })}
      </div>

      {/* SUBTAB: MIKROTIK CORE ROUTER BRAS */}
      {activeSubTab === 'mikrotik' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
          {/* Status & Telemetry Cards */}
          <div className="card">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem', borderBottom: '1px solid var(--border-color)', paddingBottom: '0.85rem', flexWrap: 'wrap', gap: '0.75rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                <div style={{ width: '38px', height: '38px', borderRadius: '8px', background: 'rgba(56,189,248,0.1)', border: '1px solid rgba(56,189,248,0.25)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <Globe size={20} color="#38bdf8" />
                </div>
                <div>
                  <h3 style={{ fontSize: '1.05rem', fontWeight: 700, color: 'var(--text-main)' }}>
                    MikroTik RouterOS BRAS & PPPoE Server
                  </h3>
                  <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                    Sinkronisasi otomatis akun PPPoE Secret pelanggan pada Router MikroTik BRAS
                  </div>
                </div>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
                <div style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '0.4rem',
                  padding: '0.3rem 0.75rem',
                  borderRadius: '9999px',
                  background: mikrotikStatus?.connected ? 'rgba(16,185,129,0.12)' : 'rgba(245,158,11,0.12)',
                  border: `1px solid ${mikrotikStatus?.connected ? 'rgba(16,185,129,0.25)' : 'rgba(245,158,11,0.25)'}`,
                  color: mikrotikStatus?.connected ? '#34d399' : '#fbbf24',
                  fontSize: '0.78rem',
                  fontWeight: 600
                }}>
                  <span className="pulse-dot" style={{ background: mikrotikStatus?.connected ? '#34d399' : '#fbbf24' }} />
                  {mikrotikStatus?.connected ? 'Terhubung (REST API / BRAS)' : 'Simulasi BRAS Aktif'}
                </div>
                <button
                  className="btn btn-secondary"
                  style={{ fontSize: '0.78rem', padding: '0.35rem 0.75rem' }}
                  onClick={handleTestMikroTik}
                  disabled={isTestingMikrotik}
                >
                  <RefreshCw size={13} className={isTestingMikrotik ? 'spin-animate' : ''} />
                  {isTestingMikrotik ? 'Menguji...' : 'Uji Koneksi'}
                </button>
              </div>
            </div>

            {/* Hardware & Session Metrics */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '0.85rem' }}>
              <div style={{ padding: '0.85rem', background: 'var(--bg-surface-elevated)', borderRadius: '8px', border: '1px solid var(--border-color)' }}>
                <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginBottom: '0.25rem' }}>Model Hardware</div>
                <div style={{ fontSize: '0.95rem', fontWeight: 700, color: 'var(--text-main)' }}>
                  {mikrotikStatus?.board || mikrotikStatus?.board_model || 'MikroTik CCR2004-16G-2S+'}
                </div>
                <div style={{ fontSize: '0.7rem', color: '#38bdf8', marginTop: '0.2rem' }}>
                  {mikrotikStatus?.version || 'RouterOS v7.14'}
                </div>
              </div>

              <div style={{ padding: '0.85rem', background: 'var(--bg-surface-elevated)', borderRadius: '8px', border: '1px solid var(--border-color)' }}>
                <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginBottom: '0.25rem' }}>CPU Load</div>
                <div style={{ fontSize: '1.25rem', fontWeight: 800, color: '#10b981' }}>
                  {mikrotikStatus?.cpuLoad || mikrotikStatus?.cpu_load || '14%'}
                </div>
                <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginTop: '0.2rem' }}>
                  Multi-core ARM64
                </div>
              </div>

              <div style={{ padding: '0.85rem', background: 'var(--bg-surface-elevated)', borderRadius: '8px', border: '1px solid var(--border-color)' }}>
                <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginBottom: '0.25rem' }}>RAM Bebas / Total</div>
                <div style={{ fontSize: '0.95rem', fontWeight: 700, color: 'var(--text-main)' }}>
                  {mikrotikStatus?.freeMemory || mikrotikStatus?.free_memory || '3.4 GB'} / {mikrotikStatus?.totalMemory || mikrotikStatus?.total_memory || '4.0 GB'}
                </div>
                <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginTop: '0.2rem' }}>
                  Uptime: {mikrotikStatus?.uptime || '18d 6h 40m'}
                </div>
              </div>

              <div style={{ padding: '0.85rem', background: 'var(--bg-surface-elevated)', borderRadius: '8px', border: '1px solid var(--border-color)' }}>
                <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginBottom: '0.25rem' }}>Sesi PPPoE Aktif</div>
                <div style={{ fontSize: '1.25rem', fontWeight: 800, color: 'var(--primary)' }}>
                  {mikrotikStatus?.activeSessionsCount ?? mikrotikStatus?.active_pppoe_count ?? 8} <span style={{ fontSize: '0.75rem', fontWeight: 500, color: 'var(--text-muted)' }}>pelanggan</span>
                </div>
                <div style={{ fontSize: '0.7rem', color: 'var(--text-secondary)', marginTop: '0.2rem' }}>
                  Dynamic Simple Queues
                </div>
              </div>
            </div>
          </div>

          {/* Configuration Form */}
          <div className="card">
            <h4 style={{ fontSize: '0.92rem', fontWeight: 700, marginBottom: '1rem', color: 'var(--text-main)' }}>
              Konfigurasi API RouterOS & Profil Billing
            </h4>
            <form onSubmit={handleSaveMikroTikSettings}>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '1rem', marginBottom: '1rem' }}>
                <div className="form-group">
                  <label>Host / IP Address Router BRAS</label>
                  <input
                    type="text"
                    className="form-input"
                    value={mikrotikSettings.host || ''}
                    onChange={(e) => setMikrotikSettings({ ...mikrotikSettings, host: e.target.value })}
                    placeholder="10.10.10.1"
                    required
                  />
                </div>

                <div className="form-group">
                  <label>API Port (RouterOS REST / Socket)</label>
                  <input
                    type="number"
                    className="form-input"
                    value={mikrotikSettings.port || 8728}
                    onChange={(e) => setMikrotikSettings({ ...mikrotikSettings, port: parseInt(e.target.value) || 8728 })}
                    placeholder="8728"
                    required
                  />
                </div>

                <div className="form-group">
                  <label>API Username</label>
                  <input
                    type="text"
                    className="form-input"
                    value={mikrotikSettings.username || ''}
                    onChange={(e) => setMikrotikSettings({ ...mikrotikSettings, username: e.target.value })}
                    placeholder="admin"
                    required
                  />
                </div>

                <div className="form-group">
                  <label>API Password</label>
                  <input
                    type="password"
                    className="form-input"
                    value={mikrotikSettings.password || ''}
                    onChange={(e) => setMikrotikSettings({ ...mikrotikSettings, password: e.target.value })}
                    placeholder="••••••••"
                  />
                </div>

                <div className="form-group">
                  <label>Profil PPPoE Default (Aktif)</label>
                  <input
                    type="text"
                    className="form-input"
                    value={mikrotikSettings.default_profile || ''}
                    onChange={(e) => setMikrotikSettings({ ...mikrotikSettings, default_profile: e.target.value })}
                    placeholder="profile_50mbps"
                    required
                  />
                </div>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', marginBottom: '1.25rem' }}>
                <input
                  type="checkbox"
                  id="mikrotik_tls"
                  checked={mikrotikSettings.use_tls || false}
                  onChange={(e) => setMikrotikSettings({ ...mikrotikSettings, use_tls: e.target.checked })}
                  style={{ width: '16px', height: '16px', cursor: 'pointer' }}
                />
                <label htmlFor="mikrotik_tls" style={{ fontSize: '0.82rem', color: 'var(--text-secondary)', cursor: 'pointer', margin: 0 }}>
                  Gunakan Koneksi Aman SSL/TLS (HTTPS Port 443 / API-SSL 8729)
                </label>
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                <button type="submit" className="btn btn-primary" disabled={isSavingMikrotik}>
                  <Save size={14} />
                  {isSavingMikrotik ? 'Menyimpan...' : 'Simpan Konfigurasi MikroTik'}
                </button>
              </div>
            </form>
          </div>

          {/* Architecture Explainer Card */}
          <div className="card" style={{ background: 'var(--bg-surface-elevated)', border: '1px solid var(--border-color)' }}>
            <h4 style={{ fontSize: '0.88rem', fontWeight: 700, color: 'var(--text-main)', marginBottom: '0.6rem', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
              <Terminal size={14} /> Mekanisme Sinkronisasi PPPoE Otomatis NMS & MikroTik BRAS
            </h4>
            <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', lineHeight: 1.6 }}>
              <p style={{ marginBottom: '0.5rem' }}>
                1. <strong>Provisi Otomatis</strong>: Setiap ONU yang didaftarkan di NMS secara otomatis dibuatkan akun PPPoE Secret di router MikroTik BRAS dengan profil layanan yang dipilih.
              </p>
              <p style={{ margin: 0 }}>
                2. <strong>Swap Perangkat Otomatis</strong>: Saat terjadi penggantian modem pelanggan (Swap Wizard), NMS mempertahankan kredensial PPPoE dan menyinkronkan status ke MikroTik tanpa gangguan konfigurasi router.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* SUBTAB 1: GENIEACS TR-069 */}
      {activeSubTab === 'genieacs' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
          {/* Connection & Configuration Card */}
          <div className="card">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem', borderBottom: '1px solid var(--border-color)', paddingBottom: '0.85rem' }}>
              <div>
                <h3 style={{ fontSize: '1rem', fontWeight: 700, color: 'var(--text-main)' }}>Konfigurasi Server GenieACS & Protokol TR-069</h3>
                <div style={{ fontSize: '0.76rem', color: 'var(--text-muted)' }}>Pengaturan URL CWMP ACS untuk OMCI OLT serta REST API NMS untuk manajemen remote CPE</div>
              </div>
              <span className={`status-badge ${settings.genieacs_status.includes('Connected') ? 'status-online' : 'status-offline'}`}>
                <span className="status-dot"></span>
                <span>{settings.genieacs_status}</span>
              </span>
            </div>

            <form onSubmit={handleSaveSettings}>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '1rem', marginBottom: '1rem' }}>
                {/* Field 1: CWMP ACS Inform URL for OLT CLI */}
                <div className="form-group" style={{ margin: 0 }}>
                  <label style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                    <Globe size={13} color="#38bdf8" />
                    <span>CWMP ACS Inform URL (OLT & CPE)</span>
                    <span style={{ color: '#ef4444' }}>*</span>
                  </label>
                  <input
                    type="text"
                    className="form-input"
                    style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: '0.82rem' }}
                    placeholder="misal: http://103.176.227.233:3001/"
                    value={settings.tr069_acs_url || ''}
                    onChange={(e) => setSettings({ ...settings, tr069_acs_url: e.target.value })}
                    required
                  />
                  <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginTop: '0.3rem' }}>
                    URL yang otomatis diinjeksi ke CLI OLT: <code>tr069-mgmt 1 acs [URL]</code> saat provisi ONU.
                  </div>
                </div>

                {/* Field 2: GenieACS NBI REST API URL */}
                <div className="form-group" style={{ margin: 0 }}>
                  <label style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                    <Server size={13} color="#a855f7" />
                    <span>GenieACS REST API URL (Port 7557)</span>
                  </label>
                  <input
                    type="text"
                    className="form-input"
                    style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: '0.82rem' }}
                    placeholder="misal: http://10.0.0.80:7557"
                    value={settings.genieacs_url || ''}
                    onChange={(e) => setSettings({ ...settings, genieacs_url: e.target.value })}
                  />
                  <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginTop: '0.3rem' }}>
                    Endpoint NBI untuk memetakan inventori CPE, Wi-Fi SSID, dan perintah reboot remote.
                  </div>
                </div>

                {/* Field 3: TR-069 Management State */}
                <div className="form-group" style={{ margin: 0 }}>
                  <label>Status Manajemen TR-069 (OLT State)</label>
                  <select
                    className="form-input"
                    value={settings.tr069_state || 'unlock'}
                    onChange={(e) => setSettings({ ...settings, tr069_state: e.target.value })}
                  >
                    <option value="unlock">unlock (Aktif & Terbuka untuk ACS)</option>
                    <option value="lock">lock (Terkunci / Nonaktif)</option>
                  </select>
                  <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginTop: '0.3rem' }}>
                    Parameter perintah: <code>tr069-mgmt 1 state unlock</code>
                  </div>
                </div>
              </div>

              {/* Action Buttons */}
              <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center', paddingTop: '0.5rem', borderTop: '1px solid var(--border-color)' }}>
                <button
                  type="submit"
                  className="btn btn-primary"
                  style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}
                >
                  <Save size={14} />
                  <span>Simpan Setelan TR-069</span>
                </button>

                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={handleSyncACS}
                  disabled={isSyncingAcs}
                  style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}
                >
                  <RefreshCw size={14} className={isSyncingAcs ? 'spin-animate' : ''} />
                  <span>{isSyncingAcs ? 'Menyinkronkan...' : 'Uji Koneksi & Sinkronkan CPE'}</span>
                </button>
              </div>
            </form>

            {/* Explanation box */}
            <div style={{ marginTop: '1rem', padding: '0.75rem 0.9rem', background: 'rgba(56,189,248,0.06)', border: '1px solid rgba(56,189,248,0.2)', borderRadius: '6px', fontSize: '0.76rem', color: '#93c5fd', lineHeight: 1.5 }}>
              💡 <strong>Integrasi Otomatis dengan Wizard Provisi</strong>: Nilai <strong>CWMP ACS Inform URL</strong> yang Anda simpan di sini akan otomatis diterapkan pada konfigurasi OLT running-config saat teknisi melakukan pendaftaran modem ONU baru di menu <strong>Provisi ONU</strong>.
            </div>
          </div>

          {/* Managed CPEs Table */}
          <div className="card">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
              <div>
                <h3 style={{ fontSize: '0.95rem', fontWeight: 700, color: 'var(--text-main)' }}>
                  CPE Router Terkelola via TR-069 ({cpes.length} Unit)
                </h3>
                <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                  Data status WAN IP, Wi-Fi SSID, dan firmware yang dipetakan dari GenieACS
                </div>
              </div>
            </div>

            <div className="table-container">
              <table>
                <thead>
                  <tr>
                    <th>Serial Number / CPE ID</th>
                    <th>Perangkat OLT</th>
                    <th>Model Router</th>
                    <th>WAN IP Address</th>
                    <th>Wi-Fi SSID</th>
                    <th>Firmware</th>
                    <th>Last Inform</th>
                    <th style={{ textAlign: 'right' }}>Aksi TR-069</th>
                  </tr>
                </thead>
                <tbody>
                  {cpes.length === 0 ? (
                    <tr>
                      <td colSpan="8" style={{ textAlign: 'center', padding: '3rem 1rem', color: 'var(--text-muted)' }}>
                        <Server size={32} style={{ margin: '0 auto 0.5rem', opacity: 0.3 }} />
                        <div>Belum ada data CPE TR-069. Klik "Sinkronkan CPE Sekarang" di atas.</div>
                      </td>
                    </tr>
                  ) : (
                    cpes.map((cpe) => (
                      <tr key={cpe.id}>
                        <td>
                          <div style={{ fontWeight: 700, fontFamily: 'JetBrains Mono', color: 'var(--text-main)' }}>
                            {cpe.serialNumber}
                          </div>
                          <div style={{ fontSize: '0.68rem', color: 'var(--text-muted)' }}>
                            {cpe.pppoeUser}
                          </div>
                        </td>
                        <td>{cpe.oltDevice || '-'}</td>
                        <td>
                          <span style={{ fontWeight: 600 }}>{cpe.model}</span>
                          <div style={{ fontSize: '0.68rem', color: 'var(--text-muted)' }}>{cpe.manufacturer}</div>
                        </td>
                        <td style={{ fontFamily: 'JetBrains Mono', fontSize: '0.8rem', color: '#60a5fa' }}>
                          {cpe.ip}
                        </td>
                        <td>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '0.8rem' }}>
                            <Wifi size={13} color="#22c55e" />
                            <span>{cpe.ssid}</span>
                          </div>
                          <div style={{ fontSize: '0.68rem', color: 'var(--text-muted)' }}>
                            {cpe.connectedClients} Klien Aktif
                          </div>
                        </td>
                        <td style={{ fontFamily: 'JetBrains Mono', fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                          {cpe.firmware}
                        </td>
                        <td style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                          {cpe.lastInform}
                        </td>
                        <td style={{ textAlign: 'right' }}>
                          <button
                            className="btn btn-secondary"
                            onClick={() => handleRebootCPE(cpe)}
                            disabled={rebootingId === cpe.id}
                            style={{ padding: '0.25rem 0.55rem', fontSize: '0.74rem' }}
                            title="Kirim task reboot TR-069"
                          >
                            <RotateCcw size={12} className={rebootingId === cpe.id ? 'spin-animate' : ''} />
                            <span>Reboot</span>
                          </button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* SUBTAB 2: TELEGRAM BOT NOTIFICATIONS */}
      {activeSubTab === 'telegram' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
          {/* Row 1: Credentials & Trigger Matrix */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(360px, 1fr))', gap: '1.25rem' }}>
            {/* Telegram Config Form */}
            <div className="card">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem', borderBottom: '1px solid var(--border-color)', paddingBottom: '0.85rem' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem' }}>
                  <div style={{ width: '32px', height: '32px', borderRadius: '8px', background: 'rgba(56, 189, 248, 0.12)', border: '1px solid rgba(56, 189, 248, 0.3)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <MessageSquare size={17} color="#38bdf8" />
                  </div>
                  <div>
                    <h3 style={{ fontSize: '1rem', fontWeight: 700, color: 'var(--text-main)' }}>Kredensial Bot Telegram NOC</h3>
                    <div style={{ fontSize: '0.74rem', color: 'var(--text-muted)' }}>Token API Bot & Chat ID Grup / Channel</div>
                  </div>
                </div>
                <span className={`status-badge ${settings.telegram_chat_id ? 'status-online' : 'status-offline'}`} style={{ fontSize: '0.72rem' }}>
                  <span className="status-dot" />
                  <span>{settings.telegram_chat_id ? 'Terkonfigurasi' : 'Belum Terhubung'}</span>
                </span>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                <div className="form-group" style={{ margin: 0 }}>
                  <label style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span>Telegram Bot Token</span>
                    {settings.telegram_has_token && <span style={{ color: '#34d399', fontSize: '0.7rem' }}>✓ Token Tersimpan</span>}
                  </label>
                  <input
                    type="password"
                    className="form-input"
                    placeholder={settings.telegram_has_token ? '•••••••• (Token Tersimpan)' : '123456:ABC-DEF1234ghIkl-zyx...'}
                    value={settings.telegram_bot_token}
                    onChange={(e) => setSettings({ ...settings, telegram_bot_token: e.target.value })}
                  />
                  <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginTop: '0.25rem' }}>
                    Dibuat melalui <code>@BotFather</code> di aplikasi Telegram
                  </div>
                </div>

                <div className="form-group" style={{ margin: 0 }}>
                  <label>Telegram Chat ID (Grup / Channel NOC)</label>
                  <input
                    type="text"
                    className="form-input"
                    style={{ fontFamily: 'JetBrains Mono, monospace' }}
                    placeholder="misal: -100123456789 atau @channel_noc"
                    value={settings.telegram_chat_id}
                    onChange={(e) => setSettings({ ...settings, telegram_chat_id: e.target.value })}
                  />
                  <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginTop: '0.25rem' }}>
                    ID Grup Telegram diawali dengan <code>-100</code> (misal: <code>-1002345678901</code>)
                  </div>
                </div>

                {/* Collapsible Setup Guide */}
                <div style={{
                  background: 'var(--bg-surface-elevated)',
                  border: '1px solid var(--border-color)',
                  borderRadius: '6px',
                  padding: '0.65rem 0.85rem'
                }}>
                  <div
                    onClick={() => setShowBotGuide(!showBotGuide)}
                    style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', cursor: 'pointer', fontSize: '0.76rem', color: '#38bdf8', fontWeight: 600 }}
                  >
                    <span style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                      <HelpCircle size={13} />
                      Panduan Singkat Setup Bot & Grup NOC
                    </span>
                    <span>{showBotGuide ? '▲ Tutup' : '▼ Lihat Panduan'}</span>
                  </div>

                  {showBotGuide && (
                    <div style={{ marginTop: '0.65rem', fontSize: '0.73rem', color: 'var(--text-secondary)', lineHeight: 1.6, borderTop: '1px solid var(--border-color)', paddingTop: '0.5rem' }}>
                      <ol style={{ paddingLeft: '1.2rem', margin: 0 }}>
                        <li style={{ marginBottom: '0.3rem' }}>
                          Buka Telegram, cari akun <strong>@BotFather</strong>, ketik <code>/newbot</code>, dan ikuti langkah untuk membuat bot baru.
                        </li>
                        <li style={{ marginBottom: '0.3rem' }}>
                          Salin <strong>HTTP API Token</strong> yang diberikan dan tempelkan pada kolom <em>Telegram Bot Token</em> di atas.
                        </li>
                        <li style={{ marginBottom: '0.3rem' }}>
                          Buat grup Telegram untuk tim NOC (misal: <em>NOC ISP Alert</em>), lalu tambahkan bot Anda ke dalam grup tersebut dan jadikan sebagai <strong>Admin</strong>.
                        </li>
                        <li>
                          Undang bot pembaca ID seperti <strong>@RawDataBot</strong> ke grup Anda untuk menyalin <strong>Chat ID</strong> (berawalan <code>-100...</code>), lalu tempelkan di atas.
                        </li>
                      </ol>
                    </div>
                  )}
                </div>

                <button className="btn btn-primary" onClick={handleSaveSettings} style={{ marginTop: '0.25rem' }}>
                  <Save size={14} /> Simpan Konfigurasi Bot
                </button>
              </div>
            </div>

            {/* Event Triggers Checklist Matrix */}
            <div className="card">
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem', marginBottom: '1.25rem', borderBottom: '1px solid var(--border-color)', paddingBottom: '0.85rem' }}>
                <div style={{ width: '32px', height: '32px', borderRadius: '8px', background: 'rgba(245, 158, 11, 0.12)', border: '1px solid rgba(245, 158, 11, 0.3)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <Bell size={17} color="#f59e0b" />
                </div>
                <div>
                  <h3 style={{ fontSize: '1rem', fontWeight: 700, color: 'var(--text-main)' }}>Matriks Pemicu Notifikasi Otomatis</h3>
                  <div style={{ fontSize: '0.74rem', color: 'var(--text-muted)' }}>Pilih jenis alarm yang otomatis diteruskan ke grup NOC</div>
                </div>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                {[
                  {
                    key: 'telegram_notify_los',
                    title: '🚨 Fiber Cut / Loss of Signal (LOS)',
                    desc: 'Kabel dropcore putus, redaman drop drastis di bawah -28 dBm, atau ONU mati mendadak.',
                    color: '#f87171'
                  },
                  {
                    key: 'telegram_notify_olt_down',
                    title: '🔴 OLT Down / Unreachable',
                    desc: 'Catu daya OLT mati (PLN/UPS padam) atau koneksi uplink BGP/management putus.',
                    color: '#ef4444'
                  },
                  {
                    key: 'telegram_notify_recovery',
                    title: '🟢 Pemulihan Layanan (Recovery)',
                    desc: 'Notifikasi pemulihan saat kabel optik tersambung atau OLT kembali aktif online.',
                    color: '#34d399'
                  },
                  {
                    key: 'telegram_notify_degradation',
                    title: '🟡 Redaman Optik Tinggi (Warning)',
                    desc: 'Redaman sinyal drop melewati batas aman ITU-T (antara -24 s/d -28 dBm).',
                    color: '#fbbf24'
                  },
                  {
                    key: 'telegram_notify_provision',
                    title: '🔵 Registrasi & Provisi ONU Baru',
                    desc: 'Notifikasi sukses saat teknisi lapangan selesai mendaftarkan pelanggan baru.',
                    color: '#60a5fa'
                  },
                  {
                    key: 'telegram_notify_swap',
                    title: '🔁 Tukar Perangkat Rusak (Swap Wizard)',
                    desc: 'Notifikasi saat hardware modem diganti dengan Serial Number baru.',
                    color: '#f59e0b'
                  },
                  {
                    key: 'telegram_notify_reboot',
                    title: '🔄 Remote Reboot / Restart ONU',
                    desc: 'Notifikasi saat teknisi atau NOC mengirimkan perintah reboot remote via OMCI.',
                    color: '#c084fc'
                  }
                ].map((item) => (
                  <label
                    key={item.key}
                    style={{
                      display: 'flex',
                      alignItems: 'flex-start',
                      gap: '0.65rem',
                      padding: '0.55rem 0.75rem',
                      borderRadius: '6px',
                      background: settings[item.key] ? 'var(--bg-surface-elevated)' : 'transparent',
                      border: `1px solid ${settings[item.key] ? 'var(--border-color)' : 'transparent'}`,
                      cursor: 'pointer',
                      transition: 'all 0.15s ease'
                    }}
                  >
                    <input
                      type="checkbox"
                      checked={!!settings[item.key]}
                      onChange={(e) => setSettings({ ...settings, [item.key]: e.target.checked })}
                      style={{ marginTop: '3px', cursor: 'pointer' }}
                    />
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: '0.8rem', fontWeight: 600, color: item.color }}>
                        {item.title}
                      </div>
                      <div style={{ fontSize: '0.7rem', color: 'var(--text-secondary)', marginTop: '1px' }}>
                        {item.desc}
                      </div>
                    </div>
                  </label>
                ))}

                <button className="btn btn-secondary" onClick={handleSaveSettings} style={{ marginTop: '0.25rem' }}>
                  <Save size={14} /> Simpan Aturan Pemicu
                </button>
              </div>
            </div>
          </div>

          {/* Row 2: Preset Testing & Live Mock Telegram Preview */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(360px, 1fr))', gap: '1.25rem' }}>
            {/* Test Sender & Preset Templates */}
            <div className="card">
              <div style={{ marginBottom: '1rem', borderBottom: '1px solid var(--border-color)', paddingBottom: '0.75rem' }}>
                <h3 style={{ fontSize: '1rem', fontWeight: 700, color: 'var(--text-main)' }}>Uji Coba Pengiriman & Preset Skenario</h3>
                <div style={{ fontSize: '0.74rem', color: 'var(--text-muted)' }}>Pilih preset skenario untuk melihat format pesan dan menguji pengiriman ke grup</div>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.9rem' }}>
                {/* Preset scenario buttons */}
                <div>
                  <div style={{ fontSize: '0.72rem', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '0.4rem' }}>
                    Pilih Template Skenario:
                  </div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.35rem' }}>
                    {Object.entries(telegramPresets).map(([key, preset]) => {
                      const isSelected = telegramPreviewScenario === key;
                      return (
                        <button
                          key={key}
                          type="button"
                          onClick={() => {
                            setTelegramPreviewScenario(key);
                            setTestMsg(preset.text);
                          }}
                          style={{
                            padding: '0.25rem 0.55rem',
                            fontSize: '0.72rem',
                            borderRadius: '4px',
                            cursor: 'pointer',
                            background: isSelected ? 'var(--primary)' : 'var(--bg-surface-elevated)',
                            color: isSelected ? '#ffffff' : 'var(--text-main)',
                            border: `1px solid ${isSelected ? 'var(--primary)' : 'var(--border-color)'}`,
                            transition: 'all 0.15s ease'
                          }}
                        >
                          {preset.label}
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div className="form-group" style={{ margin: 0 }}>
                  <label style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span>Pesan Uji Coba (HTML Format)</span>
                    <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>Mendukung tag HTML &lt;b&gt;, &lt;code&gt;</span>
                  </label>
                  <textarea
                    className="form-textarea"
                    rows={6}
                    style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: '0.76rem', lineHeight: 1.5 }}
                    value={testMsg || telegramPresets[telegramPreviewScenario]?.text || ''}
                    placeholder="Ketik teks pesan atau pilih template skenario di atas..."
                    onChange={(e) => setTestMsg(e.target.value)}
                  />
                </div>

                <button
                  className="btn btn-primary"
                  onClick={handleSendTestNotification}
                  disabled={isSendingNotif}
                  style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem' }}
                >
                  <Send size={14} className={isSendingNotif ? 'spin-animate' : ''} />
                  <span>{isSendingNotif ? 'Mengirim ke Telegram...' : 'Kirim Pesan ke Grup Telegram'}</span>
                </button>

                {notifResult && (
                  <div style={{
                    padding: '0.85rem',
                    background: notifResult.details?.success ? 'rgba(16, 185, 129, 0.08)' : 'rgba(239, 68, 68, 0.08)',
                    border: `1px solid ${notifResult.details?.success ? 'rgba(16, 185, 129, 0.3)' : 'rgba(239, 68, 68, 0.3)'}`,
                    borderRadius: 'var(--radius-md)',
                    fontSize: '0.8rem'
                  }}>
                    <div style={{ fontWeight: 700, color: notifResult.details?.success ? 'var(--success)' : 'var(--danger)' }}>
                      {notifResult.message}
                    </div>
                    <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: '4px' }}>
                      Status: {notifResult.details?.success ? (notifResult.details?.simulated ? 'Terkirim (Mode Simulasi)' : 'Terkirim Sukses ke Telegram') : notifResult.details?.error || 'Gagal'}
                    </div>
                    {notifResult.details?.chat_id && (
                      <div style={{ fontSize: '0.7rem', color: '#64748b', marginTop: '2px', fontFamily: 'JetBrains Mono' }}>
                        Target Chat ID: {notifResult.details.chat_id}
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>

            {/* Live Mock Telegram Message Preview Card (Telegram Dark Mode Style) */}
            <div className="card" style={{ background: '#0e1621', borderColor: '#1e2c3a' }}>
              <div style={{ marginBottom: '0.75rem', borderBottom: '1px solid #1e2c3a', paddingBottom: '0.65rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <div style={{ width: '28px', height: '28px', borderRadius: '50%', background: '#2481cc', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontSize: '0.75rem', fontWeight: 700 }}>
                    NOC
                  </div>
                  <div>
                    <div style={{ fontSize: '0.84rem', fontWeight: 700, color: '#f8fafc', display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                      <span>NMS Alert Bot</span>
                      <span style={{ fontSize: '0.65rem', background: '#2481cc', color: '#fff', padding: '0 4px', borderRadius: '3px', fontWeight: 600 }}>BOT</span>
                    </div>
                    <div style={{ fontSize: '0.68rem', color: '#4fa3e3' }}>online</div>
                  </div>
                </div>
                <span style={{ fontSize: '0.7rem', color: '#6c7883' }}>Telegram Preview</span>
              </div>

              {/* Telegram Message Bubble */}
              <div style={{
                background: '#182533',
                border: '1px solid #202f3e',
                borderRadius: '8px 8px 8px 2px',
                padding: '0.85rem 1rem',
                color: '#e4ecf2',
                fontSize: '0.8rem',
                lineHeight: 1.6,
                boxShadow: '0 2px 8px rgba(0,0,0,0.3)',
                position: 'relative'
              }}>
                <div
                  style={{ whiteSpace: 'pre-line', wordBreak: 'break-word' }}
                  dangerouslySetInnerHTML={{
                    __html: testMsg || telegramPresets[telegramPreviewScenario]?.text || ''
                  }}
                />

                <div style={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center', gap: '4px', marginTop: '0.5rem', fontSize: '0.68rem', color: '#6c7883' }}>
                  <span>{new Date().toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })}</span>
                  <span style={{ color: '#4fa3e3' }}>✓✓</span>
                </div>
              </div>

              <div style={{ marginTop: '0.85rem', padding: '0.65rem', background: 'rgba(255,255,255,0.02)', borderRadius: '6px', fontSize: '0.72rem', color: '#8292a0', lineHeight: 1.5 }}>
                💡 <em>Pesan di atas adalah representasi nyata bagaimana tim NOC menerima alert insiden di smartphone dan desktop Telegram secara seketika saat kejadian jaringan terjadi.</em>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* SUBTAB 3: WEBHOOK & TRIGGER SETTINGS */}
      {activeSubTab === 'webhook' && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(340px, 1fr))', gap: '1.25rem' }}>
          {/* Webhook URL & Events */}
          <div className="card">
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem', marginBottom: '1.25rem', borderBottom: '1px solid var(--border-color)', paddingBottom: '0.85rem' }}>
              <Globe size={18} color="#3b82f6" />
              <div>
                <h3 style={{ fontSize: '1rem', fontWeight: 700, color: 'var(--text-main)' }}>Konfigurasi HTTP Webhook</h3>
                <div style={{ fontSize: '0.74rem', color: 'var(--text-muted)' }}>Kirim JSON payload ke Slack, Discord, atau sistem ticketing NOC internal</div>
              </div>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              <div className="form-group" style={{ margin: 0 }}>
                <label>Target Webhook Endpoint URL</label>
                <input
                  type="text"
                  className="form-input"
                  placeholder="https://hooks.slack.com/... atau https://api.isp.net/webhook"
                  value={settings.webhook_url}
                  onChange={(e) => setSettings({ ...settings, webhook_url: e.target.value })}
                />
              </div>

              <div style={{ borderTop: '1px solid var(--border-color)', paddingTop: '0.85rem' }}>
                <div style={{ fontSize: '0.8rem', fontWeight: 700, color: 'var(--text-main)', marginBottom: '0.65rem' }}>
                  Pemicu Kejadian (Event Triggers):
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', fontSize: '0.82rem' }}>
                  <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer' }}>
                    <input
                      type="checkbox"
                      checked={settings.alert_los_enabled}
                      onChange={(e) => setSettings({ ...settings, alert_los_enabled: e.target.checked })}
                    />
                    <span>Alarm Loss of Signal (LOS) / Kabel Fiber Putus</span>
                  </label>

                  <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer' }}>
                    <input
                      type="checkbox"
                      checked={settings.alert_olt_enabled}
                      onChange={(e) => setSettings({ ...settings, alert_olt_enabled: e.target.checked })}
                    />
                    <span>Perangkat OLT Offline / SSH Unreachable</span>
                  </label>

                  <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer' }}>
                    <input
                      type="checkbox"
                      checked={settings.alert_provision_enabled}
                      onChange={(e) => setSettings({ ...settings, alert_provision_enabled: e.target.checked })}
                    />
                    <span>Registrasi & Provisi ONU Berhasil</span>
                  </label>
                </div>
              </div>

              <button className="btn btn-primary" onClick={handleSaveSettings}>
                <Save size={14} /> Simpan Aturan Webhook
              </button>
            </div>
          </div>

          {/* Webhook JSON Payload Preview */}
          <div className="card">
            <div style={{ marginBottom: '0.75rem', borderBottom: '1px solid var(--border-color)', paddingBottom: '0.75rem' }}>
              <h3 style={{ fontSize: '0.95rem', fontWeight: 700, color: 'var(--text-main)' }}>Contoh Skema Payload Webhook</h3>
              <div style={{ fontSize: '0.74rem', color: 'var(--text-muted)' }}>Format JSON yang dikirimkan saat ada pemicu alarm</div>
            </div>

            <div className="terminal-window">
              <div className="terminal-body" style={{ maxHeight: '220px' }}>
{`{
  "source": "NMS-ISP-Core",
  "event": "ONU_LOSS_OF_SIGNAL",
  "severity": "CRITICAL",
  "timestamp": "${new Date().toISOString()}",
  "deviceName": "OLT-ZTE-WEST-01",
  "targetOnu": "ZTEGC9988776",
  "details": {
    "status": "CRITICAL",
    "description": "Rx Power drop < -32 dBm"
  }
}`}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* SUBTAB 4: INCIDENT SIMULATOR */}
      {activeSubTab === 'simulator' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
          <div className="card">
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem', marginBottom: '1.25rem', borderBottom: '1px solid var(--border-color)', paddingBottom: '0.85rem' }}>
              <ShieldAlert size={20} color="#f59e0b" />
              <div>
                <h3 style={{ fontSize: '1rem', fontWeight: 700, color: 'var(--text-main)' }}>
                  Simulasi Alarm Insiden Gangguan (NOC Stress Test)
                </h3>
                <div style={{ fontSize: '0.74rem', color: 'var(--text-muted)' }}>
                  Uji coba alur alarm otomatis dari deteksi OLT hingga penerimaan notifikasi di Telegram & Webhook
                </div>
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '1rem' }}>
              {/* Scenario 1: ONU LOS */}
              <div style={{ background: 'var(--bg-input)', padding: '1rem', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-color)', display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', color: 'var(--danger)', fontWeight: 700, fontSize: '0.88rem' }}>
                    <AlertTriangle size={15} />
                    <span>Skenario 1: ONU Loss of Signal (LOS)</span>
                  </div>
                  <p style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', marginTop: '0.5rem', lineHeight: 1.5 }}>
                    Mensimulasikan kabel drop fiber optik pelanggan terputus atau redaman drop di bawah -32 dBm pada OLT ZTE.
                  </p>
                </div>
                <button
                  className="btn btn-danger"
                  onClick={() => handleSimulateIncident('onu_los')}
                  disabled={isSimulating}
                  style={{ marginTop: '1rem', width: '100%' }}
                >
                  <Play size={13} />
                  <span>Jalankan Simulasi LOS</span>
                </button>
              </div>

              {/* Scenario 2: OLT Down */}
              <div style={{ background: 'var(--bg-input)', padding: '1rem', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-color)', display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', color: '#f59e0b', fontWeight: 700, fontSize: '0.88rem' }}>
                    <Server size={15} />
                    <span>Skenario 2: Perangkat OLT Unreachable</span>
                  </div>
                  <p style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', marginTop: '0.5rem', lineHeight: 1.5 }}>
                    Mensimulasikan koneksi manajemen SSH/SNMP ke OLT Huawei terputus (Power failure / Uplink core down).
                  </p>
                </div>
                <button
                  className="btn btn-warning"
                  onClick={() => handleSimulateIncident('olt_down')}
                  disabled={isSimulating}
                  style={{ marginTop: '1rem', width: '100%' }}
                >
                  <Play size={13} />
                  <span>Jalankan Simulasi OLT Down</span>
                </button>
              </div>
            </div>

            {/* Simulation Results Output */}
            {simulationResult && (
              <div style={{ marginTop: '1.25rem', borderTop: '1px solid var(--border-color)', paddingTop: '1rem' }}>
                <div style={{ fontSize: '0.82rem', fontWeight: 700, color: 'var(--success)', marginBottom: '0.5rem' }}>
                  Hasil Eksekusi Simulasi Alarm:
                </div>
                <div className="terminal-window">
                  <div className="terminal-body">
                    {JSON.stringify(simulationResult, null, 2)}
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
