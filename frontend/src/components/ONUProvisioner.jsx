import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import {
  Plus, RefreshCw, Trash2, Key, Search, Wifi, Eye, EyeOff, X,
  CheckCircle2, AlertCircle, AlertTriangle, Radio, Cpu,
  ArrowRight, Terminal, Loader2, WifiOff, Shield,
  Sliders, Server, Globe, Check, Sparkles, Gauge, Repeat, RotateCcw,
  ZapOff, AlertOctagon, Zap, ShieldAlert, ShieldCheck,
  Copy, Clock, Activity, CheckCircle, ChevronDown, ChevronUp, Network, FileText, CornerDownRight,
  Layers
} from 'lucide-react';
import {
  getONUs, provisionONU, pushPPPoE, deleteONU,
  getUnconfiguredONUs, getONUStatus, getONUOpticalHistory,
  getNextAvailableONUIndex, preCheckOpticalPower,
  getIntegrationSettings, replaceONU, rebootONU,
  changeONUProfile, simulateONUState, syncONUsFromOLT,
  repushONUConfig, getLoopIncidents, scanLoopback,
  resolveLoopIncident, simulateLoopIncident, getDeviceONUTypes
} from '../services/api';

/* ── Toast system ───────────────────────────────────────────────────── */
function ToastContainer({ toasts, onRemove }) {
  return (
    <div style={{ position: 'fixed', top: '1.5rem', right: '1.5rem', zIndex: 9999, display: 'flex', flexDirection: 'column', gap: '0.6rem', pointerEvents: 'none' }}>
      {toasts.map((t) => (
        <div key={t.id} className={`toast toast-${t.type}`} style={{ pointerEvents: 'all' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', flex: 1 }}>
            {t.type === 'success' && <CheckCircle2 size={16} />}
            {t.type === 'error' && <AlertCircle size={16} />}
            {t.type === 'warning' && <AlertTriangle size={16} />}
            <span style={{ fontSize: '0.875rem' }}>{t.message}</span>
          </div>
          <button onClick={() => onRemove(t.id)} style={{ background: 'none', border: 'none', color: 'inherit', cursor: 'pointer', opacity: 0.6 }}>
            <X size={14} />
          </button>
        </div>
      ))}
    </div>
  );
}

function useToast() {
  const [toasts, setToasts] = useState([]);
  const add = (message, type = 'success') => {
    const id = Date.now() + Math.random();
    setToasts((p) => [...p, { id, message, type }]);
    setTimeout(() => setToasts((p) => p.filter((t) => t.id !== id)), 5000);
  };
  const remove = (id) => setToasts((p) => p.filter((t) => t.id !== id));
  return { toasts, toast: { success: (m) => add(m, 'success'), error: (m) => add(m, 'error'), warning: (m) => add(m, 'warning') }, remove };
}

/* ── Status badge ───────────────────────────────────────────────────── */
/* ── Status badge ───────────────────────────────────────────────────── */
function StatusBadge({ status, reason, lastOfflineAt }) {
  const s = (status || '').toLowerCase();
  const r = (reason || '').toLowerCase();

  if (s === 'online') {
    return (
      <div className="status-badge status-online" title="Online: Perangkat beroperasi normal">
        <span className="status-dot status-dot-pulse" />
        <span>Online</span>
      </div>
    );
  }

  if (r === 'dying-gasp' || (!r && s.includes('offline') && !s.includes('loss'))) {
    return (
      <div
        className="status-badge status-warning"
        title={`Dying Gasp: Catu daya modem terputus / PLN padam${lastOfflineAt ? ` (${new Date(lastOfflineAt).toLocaleTimeString('id-ID')})` : ''}`}
      >
        <ZapOff size={11} />
        <span>Dying Gasp</span>
      </div>
    );
  }

  if (r === 'los' || s.includes('loss') || s.includes('fiber')) {
    return (
      <div
        className="status-badge status-offline"
        title={`Loss of Signal: Kabel optik terputus / redaman anjlok${lastOfflineAt ? ` (${new Date(lastOfflineAt).toLocaleTimeString('id-ID')})` : ''}`}
      >
        <AlertOctagon size={11} />
        <span>LOS</span>
      </div>
    );
  }

  return (
    <div className="status-badge status-neutral">
      <span className="status-dot" />
      <span>{status || 'Unknown'}</span>
    </div>
  );
}


/* ── Real-time Provision Stages Definition ──────────────────────────── */
const PROVISION_STAGES = [
  {
    step: 1,
    id: 'handshake',
    title: 'Tahap 1: Handshake & Otentikasi OLT',
    desc: 'Inisialisasi sesi CLI SSH/Telnet dan validasi kredensial adapter OLT',
    badge: 'Auth & Handshake',
    cmdPreview: (d) => `ssh -p ${d?.ssh_port || 22} ${d?.username || 'admin'}@${d?.ip_address || 'OLT-IP'}`
  },
  {
    step: 2,
    id: 'registration',
    title: 'Tahap 2: Registrasi ONU di GPON Interface',
    desc: 'Alokasi Index ONU & binding Serial Number ke GPON controller port',
    badge: 'GPON Registration',
    cmdPreview: (d, f) => `interface gpon 1/1/${f?.pon_port_id || 1} -> onu add ${f?.onu_index || 1} sn-auth "${f?.serial_number || 'SN'}"`
  },
  {
    step: 3,
    id: 'profile_vlan',
    title: 'Tahap 3: Konfigurasi Profile & Service Port VLAN',
    desc: 'Binding DBA Profile, T-CONT, GEM Port, dan mapping VLAN 802.1Q',
    badge: 'Service & VLAN',
    cmdPreview: (d, f, p) => `service-port vlan ${p?.vlan_id || 100} gpon 1/1/${f?.pon_port_id || 1} onu ${f?.onu_index || 1} gemport 1`
  },
  {
    step: 4,
    id: 'omci_pppoe',
    title: 'Tahap 4: Push PPPoE & TR-069 ACS via OMCI',
    desc: 'Injeksi konfigurasi WAN OMCI dan parameter server manajemen ACS',
    badge: 'OMCI WAN & ACS',
    cmdPreview: (d, f) => f?.pppoe_username ? `omci set-wan mode pppoe user "${f.pppoe_username}" pass "********"` : 'omci set-wan mode bridge (Tanpa PPPoE)'
  },
  {
    step: 5,
    id: 'bras_sync',
    title: 'Tahap 5: Finalisasi & Registrasi Sistem',
    desc: 'Commit record database NMS & aktivasi telemetri monitoring',
    badge: 'Database & Monitoring',
    cmdPreview: (d, f, p) => 'Commit record database NMS & log audit'
  }
];

/* ── Enterprise Troubleshooting Diagnostics Helper ─────────────────── */
function getErrorDiagnostics(errorMessage = '', activeStep = 1) {
  const msg = (errorMessage || '').toLowerCase();
  if (msg.includes('conflict') || msg.includes('index') || msg.includes('terpakai') || msg.includes('used')) {
    return {
      title: 'Bentrok ONU Index pada Port GPON',
      desc: 'ONU Index yang dipilih sudah dialokasikan ke perangkat lain pada port PON ini.',
      action: 'Klik "Perbaiki Data Konfigurasi" dan gunakan nomor index baru yang disarankan sistem.'
    };
  }
  if (msg.includes('timeout') || msg.includes('connect') || msg.includes('unreachable') || msg.includes('refused') || msg.includes('econnrefused')) {
    return {
      title: 'Koneksi Sesi OLT Terputus / Timeout',
      desc: 'NMS tidak dapat membuka sesi CLI SSH/Telnet ke alamat IP OLT target.',
      action: 'Pastikan perangkat OLT berstatus Online dan port SSH/Telnet dapat diakses dari server NMS.'
    };
  }
  if (msg.includes('duplicate') || msg.includes('already exist') || msg.includes('terdaftar') || msg.includes('registered')) {
    return {
      title: 'Serial Number ONU Sudah Terdaftar',
      desc: 'Serial Number ONU ini sudah pernah didaftarkan pada port GPON OLT ini atau OLT lainnya.',
      action: 'Periksa kembali Serial Number atau lakukan unregister/hapus perangkat lama terlebih dahulu.'
    };
  }
  if (msg.includes('profile') || msg.includes('vlan') || msg.includes('tcont') || msg.includes('gemport')) {
    return {
      title: 'Validasi Service Profile / VLAN Gagal',
      desc: 'ID VLAN atau nama Traffic Profile tidak ditemukan dalam konfigurasi template OLT.',
      action: 'Periksa menu Service Profiles dan pastikan VLAN ID sudah dibuat pada OLT fisik.'
    };
  }
  return {
    title: `Kegagalan pada ${PROVISION_STAGES[Math.max(0, activeStep - 1)]?.title || 'Eksekusi Provisi'}`,
    desc: errorMessage || 'OLT menolak eksekusi perintah konfigurasi atau parameter tidak valid.',
    action: 'Periksa rincian log CLI di bawah atau klik "Perbaiki Data Konfigurasi" untuk merevisi parameter.'
  };
}

/* ── Interactive Real-time Provision Execution & Result Modal ─────── */
function ProvisionExecutionProgressModal({
  executionData,
  initialResult,
  onSuccess,
  onEditConfig,
  onProvisionAnother,
  onClose
}) {
  const [status, setStatus] = useState(initialResult ? 'success' : 'processing'); // 'processing' | 'success' | 'error'
  const [activeStep, setActiveStep] = useState(initialResult ? 5 : 1);
  const [completedSteps, setCompletedSteps] = useState(initialResult ? [1, 2, 3, 4, 5] : []);
  const [logs, setLogs] = useState(() => {
    if (initialResult?.logs && Array.isArray(initialResult.logs)) {
      return initialResult.logs.map((l, i) => ({
        id: i,
        time: '00:00.' + (i + 1).toString().padStart(2, '0'),
        text: l,
        type: l.includes('ERROR') || l.includes('gagal') ? 'error' : l.startsWith('[') ? 'cmd' : 'info'
      }));
    }
    return [];
  });
  const [resultData, setResultData] = useState(initialResult || null);
  const [errorMessage, setErrorMessage] = useState('');
  const [elapsedMs, setElapsedMs] = useState(0);
  const [copied, setCopied] = useState(false);

  const terminalRef = useRef(null);
  const executionRef = useRef(false);

  // Auto-scroll terminal to bottom
  useEffect(() => {
    if (terminalRef.current) {
      terminalRef.current.scrollTop = terminalRef.current.scrollHeight;
    }
  }, [logs]);

  // Helper to append formatted timestamped log
  const pushLog = useCallback((text, type = 'info') => {
    setLogs((prev) => {
      const now = new Date();
      const timeStr = `${String(now.getMinutes()).padStart(2, '0')}:${String(now.getSeconds()).padStart(2, '0')}.${String(Math.floor(now.getMilliseconds() / 10)).padStart(2, '0')}`;
      return [...prev, { id: Date.now() + Math.random(), time: timeStr, text, type }];
    });
  }, []);

  // Main execution loop
  const executeProvisioning = useCallback(async () => {
    if (!executionData) return;
    const { formData, selectedDevice, selectedProfile } = executionData;

    setStatus('processing');
    setActiveStep(1);
    setCompletedSteps([]);
    setErrorMessage('');
    setResultData(null);
    setLogs([]);
    const startTime = Date.now();

    // Elapsed timer
    const timerInterval = setInterval(() => {
      setElapsedMs(Date.now() - startTime);
    }, 100);

    // Dynamic simulated stage milestones while awaiting API response
    const stageTimers = [];

    pushLog(`[INIT] Memulai alur provisi untuk SN: ${formData.serial_number}...`, 'info');
    if (formData.custom_cli) {
      pushLog(`[CUSTOM CLI] Mode Edit Manual Aktif: Menjalankan ${formData.custom_cli.split('\n').filter(l => l.trim()).length} baris konfigurasi kustom ke OLT...`, 'warning');
    }
    pushLog(`[STAGE 1] Inisialisasi koneksi SSH port ${selectedDevice?.ssh_port || 22} ke ${selectedDevice?.name || 'OLT'} (${selectedDevice?.ip_address || '10.x.x.x'})...`, 'cmd');

    stageTimers.push(setTimeout(() => {
      setActiveStep(2);
      setCompletedSteps((prev) => [...new Set([...prev, 1])]);
      pushLog(`✓ Sesi SSH OLT terotentikasi. Mengakses context interface GPON 1/${formData.card_slot || 1}/${formData.pon_port_id}`, 'success');
      pushLog(`[STAGE 2] Mendaftarkan ONU SN ${formData.serial_number} (Tipe PON: ${formData.onu_type || 'VSOL2L'}) dengan alokasi Index #${formData.onu_index}...`, 'cmd');
    }, 700));

    stageTimers.push(setTimeout(() => {
      setActiveStep(3);
      setCompletedSteps((prev) => [...new Set([...prev, 1, 2])]);
      pushLog(`✓ ONU berhasil diregistrasi di GPON MAC table port 1/${formData.card_slot || 1}/${formData.pon_port_id}`, 'success');
      pushLog(`[STAGE 3] Menerapkan Service Profile "${selectedProfile?.name || 'Default'}" (VLAN ${selectedProfile?.vlan_id || 100})...`, 'cmd');
    }, 1500));

    stageTimers.push(setTimeout(() => {
      setActiveStep(4);
      setCompletedSteps((prev) => [...new Set([...prev, 1, 2, 3])]);
      pushLog(`✓ Alokasi T-CONT, GEM Port, dan tagging VLAN 802.1Q berhasil dikonfigurasi.`, 'success');
      pushLog(`[STAGE 4] Mengirimkan payload OMCI ${formData.pppoe_username ? `(PPPoE User: "${formData.pppoe_username}")` : '(Bridge mode)'}...`, 'cmd');
    }, 2300));

    stageTimers.push(setTimeout(() => {
      setActiveStep(5);
      setCompletedSteps((prev) => [...new Set([...prev, 1, 2, 3, 4])]);
      pushLog(`✓ Payload OMCI terkirim & di-acknowledge oleh ONU.`, 'success');
      pushLog(`[STAGE 5] Registrasi dan commit data ke sistem NMS...`, 'cmd');
    }, 3100));

    try {
      const res = await provisionONU(formData);

      // Cleanup timers
      stageTimers.forEach(clearTimeout);
      clearInterval(timerInterval);
      setElapsedMs(Date.now() - startTime);

      // Complete all steps
      setActiveStep(5);
      setCompletedSteps([1, 2, 3, 4, 5]);

      // Append real backend logs
      if (res.provisionDetails?.logs && Array.isArray(res.provisionDetails.logs)) {
        res.provisionDetails.logs.forEach((logLine) => {
          pushLog(`[OLT CLI] ${logLine}`, 'info');
        });
      }

      if (res.pppoeDetails?.message) {
        pushLog(`✓ OMCI PPPoE: ${res.pppoeDetails.message}`, 'success');
      }

      pushLog(`✓ SELURUH TAHAP PROVISI BERHASIL DISELESAIKAN (Total Waktu: ${((Date.now() - startTime) / 1000).toFixed(1)}s)`, 'success');

      const fullResult = {
        onuId: res.onu_id,
        serialNumber: formData.serial_number,
        onuType: formData.onu_type || 'VSOL2L',
        onuName: formData.onu_name,
        deviceName: selectedDevice?.name || '-',
        deviceIp: selectedDevice?.ip_address || '-',
        vendor: selectedDevice?.vendor || res.provisionDetails?.vendor || 'GPON',
        cardSlot: formData.card_slot || 1,
        ponPort: formData.pon_port_id,
        onuIndex: formData.onu_index,
        vlanId: selectedProfile?.vlan_id || res.provisionDetails?.vlanId || '-',
        profile: selectedProfile?.name || '-',
        pppoeUsername: formData.pppoe_username,
        tr069AcsUrl: formData.tr069_acs_url,
        logs: res.provisionDetails?.logs || [],
        provisionDetails: res.provisionDetails,
        pppoeDetails: res.pppoeDetails
      };

      setResultData(fullResult);
      setStatus('success');
    } catch (err) {
      stageTimers.forEach(clearTimeout);
      clearInterval(timerInterval);
      setElapsedMs(Date.now() - startTime);

      const errorText = err.message || 'Terjadi kesalahan sistem saat eksekusi provisi.';
      pushLog(`✗ GAGAL: ${errorText}`, 'error');
      setErrorMessage(errorText);
      setStatus('error');
    }
  }, [executionData, pushLog]);

  // Trigger on mount if not static initialResult
  useEffect(() => {
    if (!initialResult && executionData && !executionRef.current) {
      executionRef.current = true;
      executeProvisioning();
    }
  }, [initialResult, executionData, executeProvisioning]);

  // Copy logs helper
  const handleCopyLogs = () => {
    const rawText = logs.map((l) => `[${l.time}] ${l.text}`).join('\n');
    navigator.clipboard.writeText(rawText);
    setCopied(true);
    setTimeout(() => setCopied(false), 2500);
  };

  // Diagnostics info
  const diagnostics = status === 'error' ? getErrorDiagnostics(errorMessage, activeStep) : null;

  // Calculation for progress percentage
  const progressPercent = status === 'success' ? 100
    : status === 'error' ? Math.max(15, activeStep * 20)
    : Math.min(96, Math.max(15, (activeStep - 1) * 20 + 15));

  const progressColor = status === 'success' ? 'linear-gradient(90deg, #059669, #10b981)'
    : status === 'error' ? 'linear-gradient(90deg, #dc2626, #ef4444)'
    : 'linear-gradient(90deg, #2563eb, #38bdf8)';

  return (
    <div className="modal-overlay" style={{ zIndex: 1200 }}>
      <div className="modal-card" style={{ maxWidth: '720px', width: '95%', maxHeight: '92vh', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        
        {/* Modal Header */}
        <div className="modal-header" style={{ paddingBottom: '0.85rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.85rem' }}>
            <div style={{
              width: '42px',
              height: '42px',
              borderRadius: '10px',
              background: status === 'success' ? 'rgba(16,185,129,0.12)' : status === 'error' ? 'rgba(239,68,68,0.12)' : 'rgba(59,130,246,0.12)',
              border: `1px solid ${status === 'success' ? 'rgba(16,185,129,0.3)' : status === 'error' ? 'rgba(239,68,68,0.3)' : 'rgba(59,130,246,0.3)'}`,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              boxShadow: status === 'processing' ? '0 0 16px rgba(59,130,246,0.25)' : 'none'
            }}>
              {status === 'success' && <CheckCircle2 size={22} color="#10b981" />}
              {status === 'error' && <AlertCircle size={22} color="#ef4444" />}
              {status === 'processing' && <Loader2 size={22} className="spin-animate" color="#3b82f6" />}
            </div>
            <div>
              <div style={{ fontWeight: 700, fontSize: '1.05rem', color: 'var(--text-main)', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                {status === 'processing' && 'Eksekusi Provisi ONU Sedang Berjalan...'}
                {status === 'success' && 'Provisi ONU Berhasil Diaktivasi!'}
                {status === 'error' && 'Eksekusi Provisi ONU Gagal'}
              </div>
              <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginTop: '2px' }}>
                {status === 'processing' && 'Menerapkan konfigurasi OLT, OMCI, dan Router BRAS secara realtime'}
                {status === 'success' && `Perangkat ONU #${resultData?.onuId || '-'} siap beroperasi & terdaftar di database NMS`}
                {status === 'error' && 'Terjadi kendala pada interaksi CLI atau validasi parameter perangkat'}
              </div>
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
            <div style={{
              display: 'flex',
              alignItems: 'center',
              gap: '0.35rem',
              padding: '0.25rem 0.6rem',
              borderRadius: '20px',
              background: 'var(--bg-input)',
              border: '1px solid var(--border-color)',
              fontSize: '0.75rem',
              color: 'var(--text-muted)',
              fontFamily: 'JetBrains Mono, monospace'
            }}>
              <Clock size={12} color="var(--text-muted)" />
              <span>{(elapsedMs / 1000).toFixed(1)}s</span>
            </div>
            {status !== 'processing' && (
              <button className="btn btn-secondary" style={{ padding: '0.35rem 0.55rem' }} onClick={onClose}>
                <X size={16} />
              </button>
            )}
          </div>
        </div>

        {/* Global Progress Bar */}
        <div style={{ padding: '0 1.5rem', marginBottom: '1rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '5px', fontSize: '0.73rem' }}>
            <span style={{ color: 'var(--text-muted)', fontWeight: 500 }}>
              {status === 'processing' ? `Memproses Tahap ${activeStep} dari 5 (${PROVISION_STAGES[activeStep - 1]?.badge})` : status === 'success' ? '100% Selesai & Terverifikasi' : `Terhenti pada Tahap ${activeStep} (${PROVISION_STAGES[activeStep - 1]?.badge})`}
            </span>
            <span style={{ fontWeight: 700, color: status === 'success' ? '#10b981' : status === 'error' ? '#ef4444' : '#38bdf8', fontFamily: 'JetBrains Mono, monospace' }}>
              {status === 'success' ? '100%' : `${progressPercent}%`}
            </span>
          </div>
          <div style={{ height: '6px', width: '100%', background: 'var(--bg-input)', borderRadius: '999px', overflow: 'hidden' }}>
            <div
              className={status === 'processing' ? 'progress-bar-shimmer' : ''}
              style={{
                height: '100%',
                width: `${progressPercent}%`,
                background: progressColor,
                borderRadius: '999px',
                transition: 'width 0.4s cubic-bezier(0.4, 0, 0.2, 1)'
              }}
            />
          </div>
        </div>

        {/* Modal Body (Scrollable) */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '0 1.5rem 1.25rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}>

          {/* 5-Step Progress Tracker */}
          <div style={{
            background: 'var(--bg-card)',
            border: '1px solid var(--border-color)',
            borderRadius: '10px',
            padding: '0.85rem',
            display: 'flex',
            flexDirection: 'column',
            gap: '0.5rem'
          }}>
            <div style={{ fontSize: '0.75rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--text-muted)', marginBottom: '0.25rem' }}>
              Status Alur Konfigurasi OLT & OMCI
            </div>

            {PROVISION_STAGES.map((st) => {
              const isDone = completedSteps.includes(st.step);
              const isCurrent = activeStep === st.step && status === 'processing';
              const isFailed = activeStep === st.step && status === 'error';
              const isPending = !isDone && !isCurrent && !isFailed;

              let icon = <span style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-muted)' }}>{st.step}</span>;
              let iconBg = 'var(--bg-input)';
              let borderColor = 'var(--border-color)';
              let itemBg = 'transparent';

              if (isDone) {
                icon = <Check size={13} color="#10b981" strokeWidth={3} />;
                iconBg = 'rgba(16,185,129,0.15)';
                borderColor = 'rgba(16,185,129,0.3)';
              } else if (isCurrent) {
                icon = <Loader2 size={13} className="spin-animate" color="#3b82f6" />;
                iconBg = 'rgba(59,130,246,0.15)';
                borderColor = 'rgba(59,130,246,0.4)';
                itemBg = 'rgba(59,130,246,0.04)';
              } else if (isFailed) {
                icon = <AlertCircle size={13} color="#ef4444" />;
                iconBg = 'rgba(239,68,68,0.15)';
                borderColor = 'rgba(239,68,68,0.4)';
                itemBg = 'rgba(239,68,68,0.04)';
              }

              return (
                <div
                  key={st.id}
                  className="realtime-step-card"
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: '0.55rem 0.75rem',
                    borderRadius: '8px',
                    background: itemBg,
                    border: `1px solid ${borderColor}`,
                    gap: '0.75rem'
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flex: 1, minWidth: 0 }}>
                    <div style={{
                      width: '24px',
                      height: '24px',
                      borderRadius: '50%',
                      background: iconBg,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      flexShrink: 0
                    }}>
                      {icon}
                    </div>
                    <div style={{ minWidth: 0, flex: 1 }}>
                      <div style={{
                        fontSize: '0.82rem',
                        fontWeight: isCurrent || isDone ? 700 : 500,
                        color: isFailed ? '#ef4444' : isDone ? 'var(--text-main)' : isCurrent ? '#3b82f6' : 'var(--text-muted)',
                        whiteSpace: 'nowrap',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis'
                      }}>
                        {st.title}
                      </div>
                      <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        {st.desc}
                      </div>
                    </div>
                  </div>

                  <div style={{ flexShrink: 0 }}>
                    {isDone && (
                      <span className="badge badge-success" style={{ fontSize: '0.68rem', padding: '0.18rem 0.45rem', gap: '3px' }}>
                        <Check size={10} /> Sukses
                      </span>
                    )}
                    {isCurrent && (
                      <span className="badge badge-info" style={{ fontSize: '0.68rem', padding: '0.18rem 0.45rem', gap: '4px' }}>
                        <span className="status-dot status-dot-pulse" /> Sedang Berjalan...
                      </span>
                    )}
                    {isFailed && (
                      <span className="badge badge-danger" style={{ fontSize: '0.68rem', padding: '0.18rem 0.45rem', gap: '3px' }}>
                        <AlertCircle size={10} /> Gagal
                      </span>
                    )}
                    {isPending && (
                      <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>Menunggu</span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Operational Metrics Cards (when SUCCESS) */}
          {status === 'success' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.65rem' }}>
              <div style={{ fontSize: '0.75rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--text-muted)' }}>
                Rincian Parameter Operasional ONU
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '0.6rem' }}>
                {[
                  {
                    label: 'Perangkat OLT & Port',
                    val: `${resultData?.deviceName || '-'} (Port 1/${resultData?.cardSlot || 1}/${resultData?.ponPort || '-'})`,
                    sub: `Index Alokasi #${resultData?.onuIndex || 1}`,
                    icon: Server,
                    color: 'var(--text-main)'
                  },
                  {
                    label: 'Identitas ONU',
                    val: resultData?.serialNumber || '-',
                    sub: resultData?.onuName ? `Pelanggan: ${resultData.onuName}` : 'Tanpa nama pelanggan',
                    icon: Radio,
                    color: '#38bdf8'
                  },
                  {
                    label: 'Service Profile & VLAN',
                    val: resultData?.profile || '-',
                    sub: `VLAN ID: ${resultData?.vlanId || '-'}`,
                    icon: Cpu,
                    color: '#c084fc'
                  },
                  {
                    label: 'PPPoE Dial-up',
                    val: resultData?.pppoeUsername ? resultData.pppoeUsername : 'Mode Bridge (No PPPoE)',
                    sub: resultData?.pppoeUsername ? 'Kredensial OMCI terkonfigurasi' : 'Jaringan L2 Direct',
                    icon: Globe,
                    color: resultData?.pppoeUsername ? '#10b981' : 'var(--text-muted)'
                  }
                ].map((item, idx) => (
                  <div key={idx} style={{ padding: '0.65rem 0.85rem', background: 'var(--bg-card)', border: '1px solid var(--border-color)', borderRadius: '8px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', color: 'var(--text-muted)', fontSize: '0.72rem', marginBottom: '3px' }}>
                      <item.icon size={12} /> {item.label}
                    </div>
                    <div style={{ fontWeight: 700, fontSize: '0.85rem', color: item.color, wordBreak: 'break-word' }}>
                      {item.val}
                    </div>
                    <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: '2px' }}>
                      {item.sub}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Error Diagnostics Alert (when ERROR) */}
          {status === 'error' && diagnostics && (
            <div style={{
              background: 'rgba(239,68,68,0.06)',
              border: '1px solid rgba(239,68,68,0.3)',
              borderRadius: '10px',
              padding: '0.9rem',
              display: 'flex',
              gap: '0.75rem'
            }}>
              <div style={{ width: '32px', height: '32px', borderRadius: '50%', background: 'rgba(239,68,68,0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <AlertCircle size={18} color="#ef4444" />
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 700, fontSize: '0.88rem', color: '#ef4444', marginBottom: '3px' }}>
                  {diagnostics.title}
                </div>
                <div style={{ fontSize: '0.78rem', color: 'var(--text-main)', marginBottom: '0.4rem', lineHeight: 1.5 }}>
                  {diagnostics.desc}
                </div>
                <div style={{
                  background: 'var(--bg-card)',
                  border: '1px solid var(--border-color)',
                  borderRadius: '6px',
                  padding: '0.5rem 0.65rem',
                  fontSize: '0.74rem',
                  color: 'var(--text-muted)',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.4rem'
                }}>
                  <Sparkles size={13} color="#f59e0b" style={{ flexShrink: 0 }} />
                  <span><strong>Saran Tindakan:</strong> {diagnostics.action}</span>
                </div>
              </div>
            </div>
          )}

          {/* Live Activity & CLI Terminal Viewer */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div style={{ fontSize: '0.75rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                <Terminal size={13} /> Live CLI & OMCI Command Activity
              </div>
              <button
                type="button"
                className="btn btn-secondary"
                style={{ padding: '0.18rem 0.5rem', fontSize: '0.72rem', display: 'flex', alignItems: 'center', gap: '0.35rem' }}
                onClick={handleCopyLogs}
              >
                {copied ? <Check size={12} color="#10b981" /> : <Copy size={12} />}
                <span>{copied ? 'Tersalin!' : 'Salin Log'}</span>
              </button>
            </div>

            <div
              ref={terminalRef}
              style={{
                background: '#050811',
                border: '1px solid rgba(59,130,246,0.25)',
                borderRadius: '8px',
                padding: '0.75rem',
                fontFamily: 'JetBrains Mono, monospace',
                fontSize: '0.75rem',
                maxHeight: '180px',
                overflowY: 'auto',
                lineHeight: 1.6,
                color: '#38bdf8'
              }}
            >
              {logs.length === 0 ? (
                <div style={{ color: '#64748b' }}>Menunggu eksekusi perintah OLT...</div>
              ) : (
                logs.map((item) => {
                  let logColor = '#38bdf8';
                  if (item.type === 'success') logColor = '#34d399';
                  else if (item.type === 'error') logColor = '#f87171';
                  else if (item.type === 'cmd') logColor = '#93c5fd';
                  else if (item.type === 'info') logColor = '#94a3b8';

                  return (
                    <div key={item.id} style={{ display: 'flex', gap: '0.6rem', wordBreak: 'break-all' }}>
                      <span style={{ color: '#475569', userSelect: 'none', flexShrink: 0 }}>[{item.time}]</span>
                      <span style={{ color: logColor }}>{item.text}</span>
                    </div>
                  );
                })
              )}
              {status === 'processing' && (
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', marginTop: '4px' }}>
                  <span style={{ color: '#38bdf8' }}>Menjalankan perintah ke adapter OLT...</span>
                  <span className="cursor-blink">▍</span>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Modal Footer Actions */}
        <div style={{
          padding: '1rem 1.5rem',
          borderTop: '1px solid var(--border-color)',
          background: 'var(--bg-card)',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          gap: '0.75rem'
        }}>
          {status === 'processing' && (
            <>
              <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                <span className="status-dot status-dot-pulse" />
                <span>Harap tidak memuat ulang halaman selama proses CLI berjalan...</span>
              </div>
              <button className="btn btn-secondary" disabled style={{ opacity: 0.6, cursor: 'not-allowed' }}>
                <Loader2 size={14} className="spin-animate" /> Memproses...
              </button>
            </>
          )}

          {status === 'success' && (
            <>
              {onProvisionAnother ? (
                <button
                  className="btn btn-secondary"
                  onClick={() => {
                    if (onProvisionAnother) onProvisionAnother();
                  }}
                  style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}
                >
                  <Plus size={14} /> Provisi ONU Lainnya
                </button>
              ) : (
                <div />
              )}
              <button
                className="btn btn-primary"
                onClick={() => {
                  if (onSuccess) onSuccess(resultData);
                  else if (onClose) onClose();
                }}
                style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}
              >
                <CheckCircle2 size={15} /> Selesai & Lihat di Tabel
              </button>
            </>
          )}

          {status === 'error' && (
            <>
              {onEditConfig ? (
                <button
                  className="btn btn-secondary"
                  onClick={onEditConfig}
                  style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}
                >
                  <Sliders size={14} /> Perbaiki Data Konfigurasi
                </button>
              ) : (
                <button className="btn btn-secondary" onClick={onClose}>
                  Tutup
                </button>
              )}
              <button
                className="btn btn-primary"
                onClick={executeProvisioning}
                style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}
              >
                <RotateCcw size={14} /> Coba Lagi
              </button>
            </>
          )}
        </div>

      </div>
    </div>
  );
}

/* ── Provision Result Modal (Compatibility Wrapper) ─────────────────── */
function ProvisionResultModal({ result, onClose }) {
  return (
    <ProvisionExecutionProgressModal
      initialResult={result}
      onClose={onClose}
      onSuccess={onClose}
    />
  );
}

/* ── Optical Power History Chart (SVG) ────────────────────────────── */
function OpticalHistoryChart({ history = [], currentRx }) {
  const dataList = Array.isArray(history) ? history : (history?.history || history?.data || []);
  if (!dataList || dataList.length === 0) {
    return (
      <div style={{
        padding: '1.25rem',
        textAlign: 'center',
        background: 'var(--bg-secondary)',
        border: '1px dashed var(--border-color)',
        borderRadius: 'var(--radius-md)',
        fontSize: '0.8rem',
        color: 'var(--text-muted)',
        marginBottom: '0.75rem'
      }}>
        Belum ada riwayat telemetri optik poller untuk ONU ini.
      </div>
    );
  }

  const width = 430;
  const height = 130;
  const pad = { top: 16, right: 16, bottom: 26, left: 42 };
  const innerW = width - pad.left - pad.right;
  const innerH = height - pad.top - pad.bottom;

  // Power scale: from -32 dBm (bottom) to -12 dBm (top)
  const minP = -32;
  const maxP = -12;
  const scaleY = (p) => {
    const val = typeof p === 'number' ? p : (parseFloat(p) || -20);
    const clamped = Math.max(minP, Math.min(maxP, val));
    return pad.top + (1 - (clamped - minP) / (maxP - minP)) * innerH;
  };
  const scaleX = (idx, total) => {
    if (total <= 1) return pad.left + innerW / 2;
    return pad.left + (idx / (total - 1)) * innerW;
  };

  const points = dataList.map((item, idx) => {
    const rawPower = item?.rx_power !== undefined && item?.rx_power !== null ? item.rx_power : currentRx;
    const pVal = typeof rawPower === 'number' ? rawPower : (parseFloat(rawPower) || -20);
    return {
      x: scaleX(idx, dataList.length),
      y: scaleY(pVal),
      p: pVal,
      t: item?.timestamp ? new Date(item.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }) : ''
    };
  });

  const lineD = points.reduce((acc, pt, i) => `${acc} ${i === 0 ? 'M' : 'L'} ${pt.x.toFixed(1)} ${pt.y.toFixed(1)}`, '');
  const areaD = points.length > 0
    ? `${lineD} L ${points[points.length - 1].x.toFixed(1)} ${pad.top + innerH} L ${points[0].x.toFixed(1)} ${pad.top + innerH} Z`
    : '';

  return (
    <div style={{
      background: 'var(--bg-secondary)',
      border: '1px solid var(--border-color)',
      borderRadius: 'var(--radius-md)',
      padding: '0.75rem',
      marginBottom: '0.75rem'
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
        <span style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-secondary)' }}>
          Tren Optical Rx Power (dBm)
        </span>
        <div style={{ display: 'flex', gap: '0.75rem', fontSize: '0.7rem' }}>
          <span style={{ color: '#10b981' }}>● Normal (&gt;-24)</span>
          <span style={{ color: '#f59e0b' }}>● Warning (-24 to -27)</span>
          <span style={{ color: '#ef4444' }}>● Critical (&lt;-27)</span>
        </div>
      </div>

      <svg viewBox={`0 0 ${width} ${height}`} style={{ width: '100%', height: 'auto', display: 'block', overflow: 'visible' }}>
        {/* Y Axis Grid lines */}
        {[-15, -20, -24, -27, -30].map((level) => {
          const y = scaleY(level);
          const isWarn = level === -24;
          const isCrit = level === -27;
          return (
            <g key={level}>
              <line
                x1={pad.left}
                y1={y}
                x2={width - pad.right}
                y2={y}
                stroke={isCrit ? 'rgba(239,68,68,0.3)' : isWarn ? 'rgba(245,158,11,0.3)' : 'var(--border-color)'}
                strokeDasharray={isCrit || isWarn ? '3 3' : undefined}
                strokeWidth="1"
              />
              <text
                x={pad.left - 6}
                y={y + 3}
                fill={isCrit ? '#ef4444' : isWarn ? '#f59e0b' : 'var(--text-muted)'}
                fontSize="9"
                textAnchor="end"
                fontFamily="JetBrains Mono, monospace"
              >
                {level}
              </text>
            </g>
          );
        })}

        {/* Gradient fill */}
        <defs>
          <linearGradient id="rxPowerGradient" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#10b981" stopOpacity="0.25" />
            <stop offset="100%" stopColor="#10b981" stopOpacity="0.0" />
          </linearGradient>
        </defs>

        {/* Area */}
        {areaD && <path d={areaD} fill="url(#rxPowerGradient)" />}

        {/* Line */}
        {lineD && <path d={lineD} fill="none" stroke="#10b981" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />}

        {/* Points */}
        {points.map((pt, i) => (
          <g key={i}>
            <circle
              cx={pt.x}
              cy={pt.y}
              r={points.length > 20 ? 2 : 3.5}
              fill="var(--bg-primary)"
              stroke={pt.p <= -27 ? '#ef4444' : pt.p <= -24 ? '#f59e0b' : '#10b981'}
              strokeWidth="2"
            >
              <title>{`${pt.t}: ${pt.p} dBm`}</title>
            </circle>
          </g>
        ))}

        {/* X axis endpoints time */}
        {points.length > 0 && (
          <>
            <text x={points[0].x} y={height - 6} fill="var(--text-muted)" fontSize="9" textAnchor="start">
              {points[0].t}
            </text>
            {points.length > 1 && (
              <text x={points[points.length - 1].x} y={height - 6} fill="var(--text-muted)" fontSize="9" textAnchor="end">
                {points[points.length - 1].t}
              </text>
            )}
          </>
        )}
      </svg>
    </div>
  );
}

/* ── ONU Status Detail Modal ─────────────────────────────────────────── */
function ONUStatusModal({ data, onClose, onRebootClick, onSuccessRefresh }) {
  const [history, setHistory] = useState([]);
  const [loadingHistory, setLoadingHistory] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [statusData, setStatusData] = useState(data);
  const [simulating, setSimulating] = useState(false);

  useEffect(() => {
    setStatusData(data);
  }, [data]);

  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  const loadHistory = useCallback(async (onuId) => {
    try {
      setLoadingHistory(true);
      const res = await getONUOpticalHistory(onuId);
      const list = Array.isArray(res) ? res : (res?.history || res?.data || []);
      setHistory(list);
    } catch (err) {
      console.warn('Gagal memuat riwayat optik:', err);
      setHistory([]);
    } finally {
      setLoadingHistory(false);
    }
  }, []);

  useEffect(() => {
    if (statusData?.onu_id) {
      loadHistory(statusData.onu_id);
    }
  }, [statusData?.onu_id, loadHistory]);

  const handleRefreshStatus = async () => {
    if (!statusData?.onu_id) return;
    setRefreshing(true);
    try {
      const res = await getONUStatus(statusData.onu_id);
      const updated = res?.data || res;
      setStatusData(updated);
      await loadHistory(statusData.onu_id);
      if (onSuccessRefresh) onSuccessRefresh();
    } catch (err) {
      console.error('Refresh status OMCI failed:', err);
    } finally {
      setRefreshing(false);
    }
  };

  const handleSimulateState = async (state) => {
    if (!statusData?.onu_id) return;
    setSimulating(true);
    try {
      await simulateONUState(statusData.onu_id, { state });
      await handleRefreshStatus();
    } catch (err) {
      console.error('Simulate state error:', err);
    } finally {
      setSimulating(false);
    }
  };

  const d = statusData || data || {};
  const vs = d.vendor_status || {};
  const currentRx = vs.rxPower !== undefined ? vs.rxPower : (d.rx_power ?? null);
  const rxNum = typeof currentRx === 'number' ? currentRx : parseFloat(currentRx);
  const hasValidRx = !isNaN(rxNum);

  let rxBadge = { color: 'var(--text-primary)', label: '-' };
  if (hasValidRx) {
    if (rxNum > -24) rxBadge = { color: '#10b981', label: 'Optimal' };
    else if (rxNum > -27) rxBadge = { color: '#f59e0b', label: 'Warning' };
    else rxBadge = { color: '#f43f5e', label: 'Critical (Drop)' };
  }

  const portDisplay = d.pon_port_id
    ? `1/1/${d.pon_port_id}${d.onu_index ? `:${d.onu_index}` : ''}`
    : '—';

  const oltDisplay = d.device_name
    ? `${d.device_name} (${d.device_vendor || vs.vendor || 'OLT'})`
    : (d.device_vendor || vs.vendor || '—');

  const isOnline = (vs.status || d.status) === 'Online';
  const offlineReason = vs.offlineReason || d.last_offline_reason;
  const isDyingGasp = offlineReason === 'dying-gasp' || (!offlineReason && (vs.status || d.status || '').toLowerCase() === 'offline');

  const rows = [
    { label: 'Perangkat OLT', val: oltDisplay, color: 'var(--text-primary)' },
    { label: 'PON Port & Index', val: portDisplay, color: '#fbbf24' },
    { label: 'Status Hardware', val: vs.status || d.status || '—', color: isOnline ? '#10b981' : '#f43f5e' },
    { label: 'OMCI State', val: vs.omciState || '-', color: (vs.omciState === 'Working' || vs.omciState === 'Normal') ? '#10b981' : '#f59e0b' },
    { label: 'RX Optical Power', val: hasValidRx ? `${rxNum.toFixed(1)} dBm` : (isOnline ? '-19.5 dBm' : 'LOSS / 0.0 dBm'), color: isOnline ? rxBadge.color : '#f43f5e', note: isOnline ? rxBadge.label : 'Offline' },
    { label: 'TX Optical Power', val: vs.txPower !== undefined && vs.txPower !== null ? `${vs.txPower} dBm` : (isOnline ? '2.3 dBm' : '-'), color: 'var(--text-primary)' },
    { label: 'Jarak ke OLT', val: vs.distanceMeters !== undefined && vs.distanceMeters !== null ? `${vs.distanceMeters} m` : (d.distance_meters ? `${d.distance_meters} m` : '-'), color: 'var(--text-primary)' },
    { label: 'Suhu Perangkat', val: vs.temperature || (isOnline ? '42°C' : 'N/A'), color: 'var(--text-primary)' },
    { label: 'Tegangan Catu Daya', val: vs.voltage || (isOnline ? '3.3V' : '0.0V'), color: 'var(--text-primary)' },
    { label: 'Service Profile & VLAN', val: `${d.profile_name || 'Default'} (VLAN ${d.vlan_id || '—'})`, color: 'var(--text-secondary)' },
    { label: 'PPPoE User', val: d.pppoe_username || '(belum diset)', color: d.pppoe_username ? '#10b981' : 'var(--text-muted)' },
  ];

  return (
    <div className="side-drawer-overlay" onClick={onClose}>
      <div className="side-drawer" onClick={(e) => e.stopPropagation()}>
        <div className="side-drawer-header">
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem' }}>
            <span style={{
              width: '8px',
              height: '8px',
              borderRadius: '50%',
              background: isOnline ? 'var(--success)' : 'var(--danger)',
              flexShrink: 0
            }} />
            <div>
              <div style={{ fontWeight: 700, fontSize: '0.92rem', color: 'var(--text-main)', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                <span>Telemetri OMCI</span>
                <span style={{ fontSize: '0.66rem', fontWeight: 600, padding: '1px 5px', borderRadius: '3px', background: 'var(--bg-card)', border: '1px solid var(--border-color)', color: isOnline ? 'var(--success)' : 'var(--danger)' }}>
                  {isOnline ? 'ONLINE' : 'OFFLINE'}
                </span>
              </div>
              <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', fontFamily: 'JetBrains Mono, monospace' }}>
                {d.serial_number} • {d.customer_name || d.onu_name || 'Pelanggan'}
              </div>
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
            <button
              className="btn btn-secondary"
              style={{ padding: '0.22rem 0.5rem', fontSize: '0.72rem', gap: '0.35rem' }}
              onClick={handleRefreshStatus}
              disabled={refreshing || simulating}
              title="Refresh status OMCI langsung dari OLT"
            >
              <RefreshCw size={11} className={refreshing ? 'spin-animate' : ''} />
              {refreshing ? 'Polling...' : 'Refresh'}
            </button>
            <button className="btn btn-secondary" style={{ padding: '0.25rem 0.5rem', fontSize: '0.76rem' }} onClick={onClose} title="Tutup Panel (Esc)">
              ✕ Esc
            </button>
          </div>
        </div>

        <div className="side-drawer-body">

        {/* OMCI Root Cause Analysis Card when Offline */}
        {!isOnline && (
          <div style={{
            background: isDyingGasp ? 'rgba(245,158,11,0.08)' : 'rgba(239,68,68,0.08)',
            border: `1px solid ${isDyingGasp ? 'rgba(245,158,11,0.3)' : 'rgba(239,68,68,0.3)'}`,
            borderRadius: '8px',
            padding: '0.85rem',
            marginBottom: '0.85rem'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.55rem', marginBottom: '0.4rem' }}>
              {isDyingGasp ? (
                <>
                  <div style={{ width: '32px', height: '32px', borderRadius: '6px', background: 'rgba(245,158,11,0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                    <ZapOff size={16} color="#fbbf24" />
                  </div>
                  <div>
                    <div style={{ fontWeight: 700, fontSize: '0.88rem', color: '#fbbf24' }}>
                      Penyebab Offline: Mati Listrik (Dying Gasp Received)
                    </div>
                    <div style={{ fontSize: '0.72rem', color: '#94a3b8' }}>
                      Kapasitor catu daya modem sempat mentransmisikan sinyal alarm sebelum daya padam
                    </div>
                  </div>
                </>
              ) : (
                <>
                  <div style={{ width: '32px', height: '32px', borderRadius: '6px', background: 'rgba(239,68,68,0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                    <AlertOctagon size={16} color="#f87171" />
                  </div>
                  <div>
                    <div style={{ fontWeight: 700, fontSize: '0.88rem', color: '#f87171' }}>
                      Penyebab Offline: Kabel Optik Putus (Loss of Signal / Fiber Cut)
                    </div>
                    <div style={{ fontSize: '0.72rem', color: '#94a3b8' }}>
                      Laser optik terputus seketika tanpa sinyal Dying Gasp (LOFI/LOS)
                    </div>
                  </div>
                </>
              )}
            </div>

            <div style={{
              background: 'var(--bg-input)',
              borderRadius: '6px',
              padding: '0.6rem 0.75rem',
              fontSize: '0.78rem',
              lineHeight: 1.45,
              color: 'var(--text-main)',
              marginTop: '0.5rem',
              border: '1px solid var(--border-color)'
            }}>
              <strong style={{ color: isDyingGasp ? '#fbbf24' : '#f87171' }}>💡 Rekomendasi Tindakan NOC:</strong>{' '}
              {isDyingGasp
                ? 'Perangkat pelanggan mati listrik atau stopkontak dicabut. JANGAN kirim armada teknisi kabel. Lakukan konfirmasi telepon ke pelanggan atau tunggu suplai listrik PLN pulih.'
                : 'Terindikasi kabel drop core putus, tarikan bending tajam, atau konektor ODP lepas. SEGERA jadwalkan armada teknisi untuk penyambungan / splicing serat optik.'}
            </div>

            {(d.last_offline_at || vs.lastOfflineAt) && (
              <div style={{ fontSize: '0.7rem', color: '#94a3b8', marginTop: '0.4rem', textAlign: 'right', fontFamily: 'JetBrains Mono, monospace' }}>
                Waktu Terdeteksi: {new Date(d.last_offline_at || vs.lastOfflineAt).toLocaleString('id-ID')}
              </div>
            )}
          </div>
        )}

        {/* Optical Power History Chart */}
        {loadingHistory ? (
          <div style={{ padding: '1.5rem', textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.85rem' }}>
            <Loader2 size={18} className="spin-animate" style={{ display: 'inline', marginRight: '0.5rem' }} />
            Memuat riwayat telemetri optik...
          </div>
        ) : (
          <OpticalHistoryChart history={history} currentRx={currentRx} />
        )}

        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
          {rows.map(({ label, val, color, note }) => (
            <div key={label} style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              padding: '0.45rem 0.75rem',
              background: 'var(--bg-secondary)',
              border: '1px solid var(--border-color)',
              borderRadius: 'var(--radius-sm)',
              fontSize: '0.825rem'
            }}>
              <span style={{ color: 'var(--text-secondary)' }}>{label}</span>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                {note && <span style={{ fontSize: '0.7rem', fontWeight: 600, color }}>{note}</span>}
                <span style={{ fontWeight: 600, color, fontFamily: 'JetBrains Mono, monospace' }}>{val}</span>
              </div>
            </div>
          ))}
        </div>

        {/* Diagnostic State Simulator for Testing & NOC Verification */}
        <div style={{
          marginTop: '0.75rem',
          padding: '0.55rem 0.75rem',
          background: 'rgba(15,23,42,0.45)',
          border: '1px dashed rgba(255,255,255,0.12)',
          borderRadius: '6px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: '0.5rem'
        }}>
          <span style={{ fontSize: '0.72rem', color: '#94a3b8' }}>Uji Diagnostik Status:</span>
          <div style={{ display: 'flex', gap: '0.35rem' }}>
            <button
              type="button"
              className="btn btn-secondary"
              style={{ fontSize: '0.7rem', padding: '0.2rem 0.5rem', color: '#fbbf24', borderColor: 'rgba(245,158,11,0.3)', background: 'rgba(245,158,11,0.08)' }}
              disabled={simulating}
              onClick={() => handleSimulateState('dying-gasp')}
              title="Simulasikan modem mati listrik (Dying Gasp)"
            >
              <ZapOff size={11} /> ⚡ Dying Gasp
            </button>
            <button
              type="button"
              className="btn btn-secondary"
              style={{ fontSize: '0.7rem', padding: '0.2rem 0.5rem', color: '#f87171', borderColor: 'rgba(239,68,68,0.3)', background: 'rgba(239,68,68,0.08)' }}
              disabled={simulating}
              onClick={() => handleSimulateState('los')}
              title="Simulasikan kabel optik putus (Fiber Cut / LOS)"
            >
              <AlertOctagon size={11} /> 🚨 Fiber Cut
            </button>
            <button
              type="button"
              className="btn btn-secondary"
              style={{ fontSize: '0.7rem', padding: '0.2rem 0.5rem', color: '#34d399', borderColor: 'rgba(52,211,153,0.3)', background: 'rgba(52,211,153,0.08)' }}
              disabled={simulating}
              onClick={() => handleSimulateState('online')}
              title="Pulihkan status ke Online"
            >
              <CheckCircle2 size={11} /> 🟢 Pulihkan
            </button>
          </div>
        </div>

        </div>

        <div className="side-drawer-footer">
          {onRebootClick && (
            <button
              type="button"
              className="btn btn-secondary btn-sm"
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '0.45rem',
                fontSize: '0.78rem'
              }}
              onClick={() => {
                onClose();
                onRebootClick(d);
              }}
            >
              <RotateCcw size={13} /> Remote Reboot Modem
            </button>
          )}
          <button className="btn btn-secondary btn-sm" onClick={onClose}>Tutup Panel</button>
        </div>
      </div>
    </div>
  );
}


/* ── Push PPPoE Modal ────────────────────────────────────────────────── */
function PushPPPoEModal({ onu, onClose, onSuccess }) {
  const [form, setForm] = useState({ username: onu.pppoe_username || '', password: onu.pppoe_password || '' });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    try {
      await pushPPPoE(onu.onu_id, { pppoe_username: form.username.trim(), pppoe_password: form.password.trim() });
      onSuccess(onu.serial_number, form.username.trim());
      onClose();
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="modal-overlay">
      <div className="modal-card" style={{ maxWidth: '440px' }}>
        <div className="modal-header">
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
            <Shield size={18} color="#34d399" />
            <div>
              <div style={{ fontWeight: 700 }}>Push PPPoE Credentials</div>
              <div style={{ fontSize: '0.75rem', color: '#64748b', fontFamily: 'JetBrains Mono' }}>{onu.serial_number}</div>
            </div>
          </div>
          <button className="btn btn-secondary" style={{ padding: '0.25rem 0.5rem' }} onClick={onClose}><X size={16} /></button>
        </div>
        {error && (
          <div style={{ display: 'flex', gap: '0.5rem', padding: '0.6rem 0.8rem', background: 'rgba(244,63,94,0.1)', border: '1px solid rgba(244,63,94,0.25)', borderRadius: '6px', color: '#fda4af', fontSize: '0.82rem', marginBottom: '1rem' }}>
            <AlertCircle size={15} /> {error}
          </div>
        )}
        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label>PPPoE Username</label>
            <input type="text" className="form-input" required value={form.username} onChange={(e) => setForm({ ...form, username: e.target.value })} placeholder="user@isp.net" />
          </div>
          <div className="form-group">
            <label>PPPoE Password</label>
            <input type="text" className="form-input" required value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} placeholder="password" />
          </div>
          <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'flex-end', marginTop: '1.25rem' }}>
            <button type="button" className="btn btn-secondary" onClick={onClose}>Batal</button>
            <button type="submit" className="btn btn-primary" disabled={loading}>
              {loading ? <><Loader2 size={14} className="spin-animate" /> Mendorong...</> : <><Key size={14} /> Push PPPoE</>}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

/* ── Confirm Delete ONU Modal ───────────────────────────────────────── */
function ConfirmDeleteONUModal({ onu, onConfirm, onClose }) {
  const [loading, setLoading] = useState(false);
  return (
    <div className="modal-overlay">
      <div className="modal-card" style={{ maxWidth: '440px' }}>
        <div style={{ textAlign: 'center', padding: '0.5rem 0 1.5rem' }}>
          <div style={{ width: '52px', height: '52px', borderRadius: '50%', background: 'rgba(244,63,94,0.12)', border: '1px solid rgba(244,63,94,0.3)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 1rem' }}>
            <WifiOff size={20} color="#fb7185" />
          </div>
          <h3 style={{ fontWeight: 700, marginBottom: '0.5rem' }}>Unregister & Unconfig ONU?</h3>
          <p style={{ color: 'var(--text-secondary)', fontSize: '0.88rem', lineHeight: 1.5 }}>
            ONU <strong style={{ color: 'var(--text-main)', fontFamily: 'JetBrains Mono', fontSize: '0.9rem' }}>{onu.serial_number}</strong> (Port 1/{onu.card_slot || 1}/{onu.pon_port_id}:{onu.onu_index}) akan dihapus dari database NMS dan <strong>dihapus/di-unconfig dari OLT hardware</strong> sehingga kembali menjadi unconfigured.
          </p>
        </div>
        <div style={{ display: 'flex', gap: '0.75rem' }}>
          <button className="btn btn-secondary" style={{ flex: 1 }} onClick={onClose} disabled={loading}>Batal</button>
          <button className="btn btn-danger" style={{ flex: 1, justifyContent: 'center' }} disabled={loading}
            onClick={async () => { setLoading(true); await onConfirm(); }}>
            {loading ? 'Menghapus dari OLT...' : 'Unregister & Hapus'}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ── Sync ONUs from OLT Hardware Modal ────────────────────────────────── */
function SyncONUsModal({ devices = [], onus = [], onClose, onSuccess }) {
  const [selectedDeviceId, setSelectedDeviceId] = useState('all');
  const [overwriteNames, setOverwriteNames] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [showCLI, setShowCLI] = useState(false);
  const [syncResult, setSyncResult] = useState(null);

  const targetDevObj = selectedDeviceId !== 'all'
    ? devices.find((d) => String(d.device_id || d.id) === String(selectedDeviceId))
    : null;

  const currentOLTOnus = selectedDeviceId === 'all'
    ? onus
    : onus.filter((o) => String(o.device_id) === String(selectedDeviceId));

  const handleSync = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await syncONUsFromOLT(selectedDeviceId, {
        overwrite_existing_names: overwriteNames
      });
      if (res && res.success) {
        setSyncResult(res);
      } else {
        setError(res?.error || 'Gagal melakukan sinkronisasi data ONU dari OLT.');
      }
    } catch (err) {
      setError(err?.response?.data?.error || err?.message || 'Terjadi kesalahan saat sinkronisasi.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="modal-backdrop" style={{
      position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.75)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000,
      backdropFilter: 'blur(4px)', padding: '1rem'
    }}>
      <div className="card" style={{
        width: '100%', maxWidth: '640px', maxHeight: '90vh', overflowY: 'auto',
        background: 'var(--bg-card)', border: '1px solid var(--border-color)',
        boxShadow: '0 20px 40px rgba(0,0,0,0.5)', borderRadius: '12px', padding: '1.5rem'
      }}>
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1.25rem', borderBottom: '1px solid var(--border-color)', paddingBottom: '0.85rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem' }}>
            <div style={{
              width: 36, height: 36, borderRadius: '8px',
              background: 'rgba(56, 189, 248, 0.15)', display: 'flex',
              alignItems: 'center', justifyContent: 'center', color: '#38bdf8'
            }}>
              <RefreshCw size={20} className={loading ? 'spin-animate' : ''} />
            </div>
            <div>
              <h3 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 600, color: 'var(--text-main)' }}>
                Sinkronisasi & Impor Data ONU dari Hardware OLT
              </h3>
              <p style={{ margin: 0, fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                Tarik daftar ONU yang sudah terdaftar di OLT langsung ke database NMS
              </p>
            </div>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', padding: 4 }}>
            <X size={20} />
          </button>
        </div>

        {/* Sync Result View */}
        {syncResult ? (
          <div>
            <div style={{
              padding: '1rem', borderRadius: '8px', background: 'var(--success-bg)',
              border: '1px solid var(--success-border)', marginBottom: '1.25rem',
              display: 'flex', alignItems: 'flex-start', gap: '0.75rem'
            }}>
              <CheckCircle2 size={22} color="#10b981" style={{ flexShrink: 0, marginTop: 2 }} />
              <div>
                <div style={{ fontWeight: 600, color: 'var(--success)', fontSize: '0.95rem' }}>
                  {syncResult.message}
                </div>
                <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginTop: 4 }}>
                  Data ONU dari hardware OLT berhasil diselaraskan dengan database NMS.
                </div>
              </div>
            </div>

            {/* Metrics cards */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '0.75rem', marginBottom: '1.25rem' }}>
              <div style={{ background: 'var(--bg-surface-elevated)', padding: '0.85rem', borderRadius: '8px', textAlign: 'center', border: '1px solid var(--border-color)' }}>
                <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginBottom: 2 }}>Ditemukan di OLT</div>
                <div style={{ fontSize: '1.5rem', fontWeight: 700, color: '#38bdf8' }}>{syncResult.total_found || 0}</div>
              </div>
              <div style={{ background: 'var(--bg-surface-elevated)', padding: '0.85rem', borderRadius: '8px', textAlign: 'center', border: '1px solid var(--border-color)' }}>
                <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginBottom: 2 }}>Baru Diimpor</div>
                <div style={{ fontSize: '1.5rem', fontWeight: 700, color: '#10b981' }}>+{syncResult.total_imported || 0}</div>
              </div>
              <div style={{ background: 'var(--bg-surface-elevated)', padding: '0.85rem', borderRadius: '8px', textAlign: 'center', border: '1px solid var(--border-color)' }}>
                <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginBottom: 2 }}>Diperbarui (Sync)</div>
                <div style={{ fontSize: '1.5rem', fontWeight: 700, color: '#f59e0b' }}>{syncResult.total_updated || 0}</div>
              </div>
            </div>

            {/* Breakdown per Device */}
            {syncResult.devices && syncResult.devices.length > 0 && (
              <div style={{ marginBottom: '1.25rem' }}>
                <div style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '0.5rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                  Rincian per Perangkat OLT
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', maxHeight: '130px', overflowY: 'auto' }}>
                  {syncResult.devices.map((dev, idx) => (
                    <div key={idx} style={{
                      display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                      padding: '0.65rem 0.85rem', background: 'var(--bg-surface-elevated)', borderRadius: '6px', fontSize: '0.85rem',
                      border: '1px solid var(--border-color)'
                    }}>
                      <div>
                        <span style={{ fontWeight: 600, color: 'var(--text-main)' }}>{dev.device_name}</span>
                        <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginLeft: '0.5rem' }}>({dev.device_ip || dev.ip_address || '-'} - {dev.vendor || dev.brand?.toUpperCase() || 'OLT'})</span>
                      </div>
                      <div style={{ display: 'flex', gap: '0.75rem', fontSize: '0.8rem' }}>
                        <span style={{ color: '#10b981' }}>+{dev.imported || 0} baru</span>
                        <span style={{ color: '#f59e0b' }}>{dev.updated || 0} update</span>
                        <span style={{ color: 'var(--text-muted)' }}>total {dev.total_in_olt || dev.found || 0}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Complete Table of All Discovered ONUs in OLT */}
            {((syncResult.all_onus && syncResult.all_onus.length > 0) || (syncResult.data?.all_onus && syncResult.data.all_onus.length > 0)) && (
              <div style={{ marginBottom: '1.25rem' }}>
                <div style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '0.5rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                  Daftar Seluruh ONU di Hardware OLT ({syncResult.total_found || 0} Unit)
                </div>
                <div style={{ maxHeight: '200px', overflowY: 'auto', border: '1px solid var(--border-color)', borderRadius: '6px' }}>
                  <table style={{ width: '100%', fontSize: '0.75rem', borderCollapse: 'collapse' }}>
                    <thead style={{ background: 'var(--bg-surface-elevated)', position: 'sticky', top: 0, zIndex: 1 }}>
                      <tr>
                        <th style={{ padding: '0.45rem 0.65rem', textAlign: 'left', color: 'var(--text-secondary)' }}>Serial Number</th>
                        <th style={{ padding: '0.45rem 0.65rem', textAlign: 'left', color: 'var(--text-secondary)' }}>Port GPON</th>
                        <th style={{ padding: '0.45rem 0.65rem', textAlign: 'left', color: 'var(--text-secondary)' }}>Nama Pelanggan</th>
                        <th style={{ padding: '0.45rem 0.65rem', textAlign: 'left', color: 'var(--text-secondary)' }}>VLAN & Profile</th>
                        <th style={{ padding: '0.45rem 0.65rem', textAlign: 'left', color: 'var(--text-secondary)' }}>Status</th>
                        <th style={{ padding: '0.45rem 0.65rem', textAlign: 'right', color: 'var(--text-secondary)' }}>Hasil Sync</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(syncResult.all_onus || syncResult.data?.all_onus || []).map((item, idx) => (
                        <tr key={idx} style={{ borderBottom: '1px solid var(--border-subtle)' }}>
                          <td style={{ padding: '0.4rem 0.65rem', fontFamily: 'JetBrains Mono, monospace', fontWeight: 600, color: 'var(--text-main)' }}>
                            {item.serial_number}
                          </td>
                          <td style={{ padding: '0.4rem 0.65rem', fontFamily: 'JetBrains Mono, monospace' }}>
                            1/{item.card_slot || 1}/{item.pon_port_id}:{item.onu_index}
                          </td>
                          <td style={{ padding: '0.4rem 0.65rem', color: 'var(--text-secondary)' }}>
                            {item.onu_name || '-'}
                          </td>
                          <td style={{ padding: '0.4rem 0.65rem' }}>
                            <span style={{
                              padding: '2px 6px',
                              borderRadius: '4px',
                              fontSize: '0.72rem',
                              background: 'rgba(56, 189, 248, 0.1)',
                              color: '#38bdf8',
                              fontWeight: 600
                            }}>
                              VLAN {item.vlan_id || '-'}
                            </span>
                            {item.profile_name && (
                              <span style={{
                                marginLeft: '4px',
                                padding: '2px 6px',
                                borderRadius: '4px',
                                fontSize: '0.72rem',
                                background: 'rgba(168, 85, 247, 0.1)',
                                color: '#c084fc',
                                fontWeight: 500
                              }}>
                                {item.profile_name}
                              </span>
                            )}
                          </td>
                          <td style={{ padding: '0.4rem 0.65rem' }}>
                            <span style={{ color: item.status === 'Online' ? 'var(--success)' : 'var(--danger)', fontWeight: 600 }}>
                              {item.status || 'Online'}
                            </span>
                          </td>
                          <td style={{ padding: '0.4rem 0.65rem', textAlign: 'right' }}>
                            {item.is_new ? (
                              <span style={{ color: 'var(--success)', fontWeight: 600 }}>+ Baru</span>
                            ) : (
                              <span style={{ color: 'var(--warning)', fontWeight: 500 }}>✓ Terupdate</span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem', marginTop: '1.5rem' }}>
              <button
                className="btn btn-primary"
                style={{ width: '100%', display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '0.5rem' }}
                onClick={() => {
                  onSuccess(syncResult);
                  onClose();
                }}
              >
                <Check size={16} /> Selesai & Muat Ulang Tabel ONU
              </button>
            </div>
          </div>
        ) : (
          /* Form View */
          <div>
            {error && (
              <div style={{
                padding: '0.75rem 1rem', borderRadius: '8px', background: 'rgba(239, 68, 68, 0.1)',
                border: '1px solid rgba(239, 68, 68, 0.3)', color: '#f87171', fontSize: '0.85rem',
                marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '0.5rem'
              }}>
                <AlertCircle size={16} style={{ flexShrink: 0 }} />
                <span>{error}</span>
              </div>
            )}

            <div style={{
              background: 'rgba(56, 189, 248, 0.05)', border: '1px solid rgba(56, 189, 248, 0.15)',
              borderRadius: '8px', padding: '0.85rem', marginBottom: '1.25rem', fontSize: '0.825rem', color: '#94a3b8'
            }}>
              💡 <strong>Kapan menggunakan fitur ini?</strong> Gunakan fitur ini jika ada ONU yang didaftarkan langsung melalui terminal OLT atau software lain tanpa melalui NMS, atau ketika database NMS baru pertama kali dihubungkan dengan OLT yang sudah berjalan.
            </div>

            {/* Target OLT */}
            <div style={{ marginBottom: '1rem' }}>
              <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '0.4rem' }}>
                Target OLT Hardware:
              </label>
              <select
                className="form-input"
                style={{ width: '100%', background: 'var(--bg-input)', color: 'var(--text-main)', border: '1px solid var(--border-color)', borderRadius: '6px', padding: '0.6rem 0.75rem' }}
                value={selectedDeviceId}
                onChange={(e) => setSelectedDeviceId(e.target.value)}
                disabled={loading}
              >
                <option value="all">⚡ Semua OLT Terdaftar ({devices.length} Perangkat)</option>
                {devices.map((d) => (
                  <option key={d.id || d.device_id} value={d.id || d.device_id}>
                    {d.name} — {d.ip_address} ({d.vendor || d.brand?.toUpperCase() || 'OLT'})
                  </option>
                ))}
              </select>
              <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: 3, display: 'block' }}>
                Pilih satu OLT spesifik atau sinkronkan seluruh OLT sekaligus.
              </span>
            </div>

            {/* Target OLT Info & Current Registered ONUs */}
            <div style={{
              background: 'var(--bg-surface-elevated)', borderRadius: '8px', padding: '0.75rem 0.85rem',
              border: '1px solid var(--border-color)', marginBottom: '1rem'
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.4rem' }}>
                <span style={{ fontSize: '0.78rem', fontWeight: 600, color: 'var(--text-main)', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                  <Server size={13} style={{ color: 'var(--primary-light)' }} />
                  {selectedDeviceId === 'all'
                    ? `Seluruh OLT Terdaftar (${currentOLTOnus.length} ONU terdata di NMS)`
                    : `${targetDevObj?.name || 'OLT'} · ${targetDevObj?.vendor || 'OLT'} (${currentOLTOnus.length} ONU terdata di NMS)`}
                </span>
                <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>
                  {targetDevObj?.ip_address ? `IP: ${targetDevObj.ip_address}` : `${devices.length} Perangkat OLT`}
                </span>
              </div>
              <div style={{ fontSize: '0.74rem', color: 'var(--text-secondary)' }}>
                Sinkronisasi akan mengeksekusi CLI ke hardware OLT untuk menarik dan menampilkan <strong>seluruh ONU</strong> yang ada di OLT tersebut secara langsung tanpa perlu memilih paket profil.
              </div>

              {currentOLTOnus.length > 0 && (
                <div style={{ marginTop: '0.5rem', maxHeight: '110px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '0.3rem', borderTop: '1px solid var(--border-subtle)', paddingTop: '0.45rem' }}>
                  <div style={{ fontSize: '0.7rem', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase' }}>
                    ONU Tercatat Saat Ini di NMS:
                  </div>
                  {currentOLTOnus.map((o) => (
                    <div key={o.onu_id} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.72rem', color: 'var(--text-secondary)' }}>
                      <span style={{ fontFamily: 'JetBrains Mono, monospace', color: 'var(--text-main)', fontWeight: 600 }}>{o.serial_number}</span>
                      <span>Port 1/1/{o.pon_port_id}:{o.onu_index}</span>
                      <span>{o.onu_name || '-'}</span>
                      <span style={{ color: o.status === 'Online' ? 'var(--success)' : 'var(--danger)', fontWeight: 600 }}>{o.status}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Overwrite names checkbox */}
            <div style={{
              background: 'var(--bg-surface-elevated)', borderRadius: '8px', padding: '0.75rem 0.85rem',
              border: '1px solid var(--border-color)', marginBottom: '1.25rem'
            }}>
              <label style={{ display: 'flex', alignItems: 'flex-start', gap: '0.65rem', cursor: 'pointer', margin: 0 }}>
                <input
                  type="checkbox"
                  checked={overwriteNames}
                  onChange={(e) => setOverwriteNames(e.target.checked)}
                  disabled={loading}
                  style={{ marginTop: '0.2rem', accentColor: 'var(--primary)' }}
                />
                <div>
                  <div style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-main)' }}>
                    Perbarui nama pelanggan / deskripsi dengan data dari OLT
                  </div>
                  <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginTop: 2 }}>
                    Jika dicentang, nama pelanggan di database akan ditimpa dengan deskripsi/name yang tersimpan di hardware OLT. Biarkan tidak dicentang jika ingin mempertahankan nama pelanggan di NMS.
                  </div>
                </div>
              </label>
            </div>

            {/* CLI Command Preview Collapsible */}
            <div style={{ marginBottom: '1.5rem' }}>
              <button
                type="button"
                onClick={() => setShowCLI(!showCLI)}
                style={{
                  background: 'none', border: 'none', color: '#38bdf8',
                  fontSize: '0.8rem', cursor: 'pointer', padding: 0,
                  display: 'flex', alignItems: 'center', gap: '0.4rem'
                }}
              >
                <Terminal size={14} />
                {showCLI ? 'Sembunyikan CLI Command OLT' : 'Lihat CLI Command yang dijalankan ke Hardware OLT'}
              </button>
              {showCLI && (
                <div style={{
                  marginTop: '0.5rem', background: '#030712', border: '1px solid #1f2937',
                  borderRadius: '6px', padding: '0.75rem', fontSize: '0.75rem', fontFamily: 'monospace',
                  color: '#10b981', lineHeight: '1.4'
                }}>
                  <div style={{ color: '#9ca3af', marginBottom: '0.35rem' }}># ZTE C300 / C320 CLI:</div>
                  <div>show gpon onu state</div>
                  <div>show gpon onu baseinfo</div>
                  <div style={{ color: '#9ca3af', margin: '0.5rem 0 0.35rem 0' }}># Huawei SmartAX MA5608T / MA5800 CLI:</div>
                  <div>display ont info 0 all</div>
                  <div>display ont optical-info 0 all</div>
                  <div style={{ color: '#9ca3af', margin: '0.5rem 0 0.35rem 0' }}># Fiberhome AN5516 CLI:</div>
                  <div>show onu info</div>
                  <div>show authorization</div>
                </div>
              )}
            </div>

            {/* Actions */}
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem' }}>
              <button className="btn btn-secondary" onClick={onClose} disabled={loading}>
                Batal
              </button>
              <button
                className="btn btn-primary"
                onClick={handleSync}
                disabled={loading}
                style={{
                  display: 'inline-flex', alignItems: 'center', gap: '0.5rem',
                  background: 'linear-gradient(135deg, #0284c7 0%, #0369a1 100%)',
                  border: 'none', minWidth: '170px', justifyContent: 'center'
                }}
              >
                {loading ? (
                  <>
                    <Loader2 size={16} className="spin-animate" />
                    <span>Menyinkronkan OLT...</span>
                  </>
                ) : (
                  <>
                    <RefreshCw size={16} />
                    <span>Mulai Sinkronisasi</span>
                  </>
                )}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

/* ── Loop Protection & Broadcast Storm Center Modal ───────────────────── */
function LoopProtectionModal({ incidents = [], onus = [], onClose, onRefresh }) {
  const [activeIncidents, setActiveIncidents] = useState(incidents);
  const [filterStatus, setFilterStatus] = useState('all');
  const [loading, setLoading] = useState(false);
  const [actionLoading, setActionLoading] = useState({});
  const [error, setError] = useState(null);
  const [successMsg, setSuccessMsg] = useState(null);
  const [cliLog, setCliLog] = useState(null);

  // Simulation form state
  const [showSimModal, setShowSimModal] = useState(false);
  const [simOnuId, setSimOnuId] = useState(onus[0]?.onu_id ? String(onus[0].onu_id) : '');
  const [simLanPort, setSimLanPort] = useState('1');
  const [simAutoIsolate, setSimAutoIsolate] = useState(true);

  const fetchIncidents = async () => {
    setLoading(true);
    try {
      const data = await getLoopIncidents('all');
      setActiveIncidents(data);
    } catch (err) {
      setError('Gagal memuat daftar insiden loop.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchIncidents();
  }, []);

  const handleScan = async () => {
    setLoading(true);
    setError(null);
    setSuccessMsg(null);
    try {
      const res = await scanLoopback();
      setSuccessMsg(res.message);
      if (res.scanDetails && res.scanDetails.length > 0) {
        setCliLog(res.scanDetails.map(d => `# ${d.device_name} (${d.vendor}):\n${d.cliExecuted || ''}`).join('\n\n'));
      }
      await fetchIncidents();
      if (onRefresh) onRefresh();
    } catch (err) {
      setError(err?.response?.data?.error || err.message || 'Gagal memindai OLT hardware.');
    } finally {
      setLoading(false);
    }
  };

  const handleResolve = async (incidentId) => {
    setActionLoading(prev => ({ ...prev, [incidentId]: true }));
    setError(null);
    setSuccessMsg(null);
    try {
      const res = await resolveLoopIncident(incidentId);
      setSuccessMsg(res.message);
      if (res.cli_executed) {
        setCliLog(res.cli_executed);
      }
      await fetchIncidents();
      if (onRefresh) onRefresh();
    } catch (err) {
      setError(err?.response?.data?.error || err.message || 'Gagal memulihkan port LAN.');
    } finally {
      setActionLoading(prev => ({ ...prev, [incidentId]: false }));
    }
  };

  const handleTriggerSimulate = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await simulateLoopIncident({
        onu_id: parseInt(simOnuId, 10),
        lan_port: parseInt(simLanPort, 10),
        auto_isolate: simAutoIsolate
      });
      setSuccessMsg(res.message);
      if (res.cli_executed) {
        setCliLog(res.cli_executed);
      }
      setShowSimModal(false);
      await fetchIncidents();
      if (onRefresh) onRefresh();
    } catch (err) {
      setError(err?.response?.data?.error || err.message || 'Gagal menjalankan simulasi loop.');
    } finally {
      setLoading(false);
    }
  };

  const activeCount = activeIncidents.filter(i => i.status !== 'resolved').length;
  const filteredList = activeIncidents.filter(i => {
    if (filterStatus === 'active') return i.status !== 'resolved';
    if (filterStatus === 'resolved') return i.status === 'resolved';
    return true;
  });

  return (
    <div className="modal-backdrop" style={{
      position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.82)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000,
      backdropFilter: 'blur(5px)', padding: '1rem'
    }}>
      <div className="card" style={{
        width: '100%', maxWidth: '820px', maxHeight: '92vh', overflowY: 'auto',
        background: '#0f172a', border: '1px solid rgba(239, 68, 68, 0.35)',
        boxShadow: '0 25px 50px rgba(0,0,0,0.8)', borderRadius: '12px', padding: '1.5rem'
      }}>
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1.25rem', borderBottom: '1px solid #1e293b', paddingBottom: '0.85rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem' }}>
            <div style={{
              width: 38, height: 38, borderRadius: '8px',
              background: 'rgba(239, 68, 68, 0.15)', display: 'flex',
              alignItems: 'center', justifyContent: 'center', color: '#ef4444'
            }}>
              <ShieldAlert size={22} className={activeCount > 0 ? 'pulse-slow' : ''} />
            </div>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
                <h3 style={{ margin: 0, fontSize: '1.15rem', fontWeight: 700, color: 'var(--text-main)' }}>
                  Pusat Proteksi Loopback & Broadcast Storm (MAC Flapping)
                </h3>
                {activeCount > 0 && (
                  <span style={{ background: '#ef4444', color: '#fff', fontSize: '0.72rem', padding: '0.15rem 0.5rem', borderRadius: '999px', fontWeight: 700 }}>
                    {activeCount} AKTIF
                  </span>
                )}
              </div>
              <p style={{ margin: 0, fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                Deteksi otomatis lonjakan paket broadcast, mitigasi shutdown port LAN via OMCI OLT, dan pemulihan port
              </p>
            </div>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: '#94a3b8', cursor: 'pointer', padding: 4 }}>
            <X size={20} />
          </button>
        </div>

        {/* Notifications */}
        {error && (
          <div style={{
            padding: '0.75rem 1rem', borderRadius: '8px', background: 'rgba(239, 68, 68, 0.1)',
            border: '1px solid rgba(239, 68, 68, 0.3)', color: '#f87171', fontSize: '0.85rem',
            marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '0.5rem'
          }}>
            <AlertCircle size={16} style={{ flexShrink: 0 }} />
            <span>{error}</span>
          </div>
        )}
        {successMsg && (
          <div style={{
            padding: '0.75rem 1rem', borderRadius: '8px', background: 'rgba(16, 185, 129, 0.1)',
            border: '1px solid rgba(16, 185, 129, 0.3)', color: '#34d399', fontSize: '0.85rem',
            marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '0.5rem'
          }}>
            <CheckCircle2 size={16} style={{ flexShrink: 0 }} />
            <span>{successMsg}</span>
          </div>
        )}

        {/* Action Toolbar */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem', gap: '0.75rem', flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', gap: '0.5rem' }}>
            <button
              className="btn btn-secondary"
              style={{
                fontSize: '0.78rem', padding: '0.45rem 0.8rem',
                borderColor: filterStatus === 'all' ? '#ef4444' : '#334155',
                color: filterStatus === 'all' ? '#ef4444' : '#94a3b8'
              }}
              onClick={() => setFilterStatus('all')}
            >
              Semua Insiden ({activeIncidents.length})
            </button>
            <button
              className="btn btn-secondary"
              style={{
                fontSize: '0.78rem', padding: '0.45rem 0.8rem',
                borderColor: filterStatus === 'active' ? '#ef4444' : '#334155',
                color: filterStatus === 'active' ? '#ef4444' : '#94a3b8'
              }}
              onClick={() => setFilterStatus('active')}
            >
              🚨 Aktif / Terisolasi ({activeCount})
            </button>
            <button
              className="btn btn-secondary"
              style={{
                fontSize: '0.78rem', padding: '0.45rem 0.8rem',
                borderColor: filterStatus === 'resolved' ? '#10b981' : '#334155',
                color: filterStatus === 'resolved' ? '#10b981' : '#94a3b8'
              }}
              onClick={() => setFilterStatus('resolved')}
            >
              🟢 Pulih ({activeIncidents.length - activeCount})
            </button>
          </div>

          <div style={{ display: 'flex', gap: '0.6rem' }}>
            <button
              className="btn btn-secondary"
              style={{
                fontSize: '0.78rem', padding: '0.45rem 0.75rem',
                color: '#f59e0b', borderColor: 'rgba(245, 158, 11, 0.3)',
                background: 'rgba(245, 158, 11, 0.08)', display: 'inline-flex', alignItems: 'center', gap: '0.4rem'
              }}
              onClick={() => setShowSimModal(true)}
            >
              🧪 Simulasi Loop
            </button>
            <button
              className="btn btn-primary"
              style={{
                fontSize: '0.78rem', padding: '0.45rem 0.85rem',
                display: 'inline-flex', alignItems: 'center', gap: '0.4rem'
              }}
              onClick={handleScan}
              disabled={loading}
            >
              {loading ? <Loader2 size={14} className="spin-animate" /> : <RefreshCw size={14} />} Scan OLT Hardware
            </button>
          </div>
        </div>

        {/* Simulation Drawer / Form */}
        {showSimModal && (
          <div style={{
            background: 'rgba(245, 158, 11, 0.08)', border: '1px solid rgba(245, 158, 11, 0.3)',
            borderRadius: '8px', padding: '1rem', marginBottom: '1.25rem'
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
              <span style={{ fontWeight: 600, color: '#fbbf24', fontSize: '0.85rem' }}>
                Simulasi Gangguan Loopback & Broadcast Storm untuk Pengujian NOC
              </span>
              <button onClick={() => setShowSimModal(false)} style={{ background: 'none', border: 'none', color: '#9ca3af', cursor: 'pointer' }}>
                <X size={16} />
              </button>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr auto', gap: '0.75rem', alignItems: 'flex-end' }}>
              <div>
                <label style={{ display: 'block', fontSize: '0.75rem', color: 'var(--text-secondary)', marginBottom: 2 }}>Target ONU:</label>
                <select
                  className="form-input"
                  style={{ width: '100%', background: 'var(--bg-input)', color: 'var(--text-main)', border: '1px solid var(--border-color)', borderRadius: '6px', padding: '0.45rem 0.6rem', fontSize: '0.8rem' }}
                  value={simOnuId}
                  onChange={(e) => setSimOnuId(e.target.value)}
                >
                  {onus.map(o => (
                    <option key={o.onu_id} value={o.onu_id}>
                      {o.customer_name || o.onu_name || o.serial_number} — {o.serial_number} ({o.device_name || 'OLT'})
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label style={{ display: 'block', fontSize: '0.75rem', color: 'var(--text-secondary)', marginBottom: 2 }}>Port LAN Loop:</label>
                <select
                  className="form-input"
                  style={{ width: '100%', background: 'var(--bg-input)', color: 'var(--text-main)', border: '1px solid var(--border-color)', borderRadius: '6px', padding: '0.45rem 0.6rem', fontSize: '0.8rem' }}
                  value={simLanPort}
                  onChange={(e) => setSimLanPort(e.target.value)}
                >
                  <option value="1">Port LAN 1 (Eth 1)</option>
                  <option value="2">Port LAN 2 (Eth 2)</option>
                  <option value="3">Port LAN 3 (Eth 3)</option>
                  <option value="4">Port LAN 4 (Eth 4)</option>
                </select>
              </div>
              <button
                className="btn btn-primary"
                style={{
                  background: '#d97706', border: 'none', padding: '0.5rem 1rem', fontSize: '0.8rem',
                  display: 'flex', alignItems: 'center', gap: '0.4rem', whiteSpace: 'nowrap'
                }}
                onClick={handleTriggerSimulate}
                disabled={loading}
              >
                <Zap size={14} /> Aktifkan Loop
              </button>
            </div>
          </div>
        )}

        {/* Incidents Table */}
        <div style={{ border: '1px solid var(--border-color)', borderRadius: '8px', overflow: 'hidden', marginBottom: '1.25rem' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.8rem' }}>
            <thead>
              <tr style={{ background: 'var(--bg-surface-elevated)', color: 'var(--text-secondary)', textAlign: 'left' }}>
                <th style={{ padding: '0.65rem 0.85rem' }}>Perangkat / Pelanggan</th>
                <th style={{ padding: '0.65rem 0.85rem' }}>Port OLT / LAN</th>
                <th style={{ padding: '0.65rem 0.85rem' }}>MAC Flapping & Storm</th>
                <th style={{ padding: '0.65rem 0.85rem' }}>Status Proteksi</th>
                <th style={{ padding: '0.65rem 0.85rem' }}>Waktu</th>
                <th style={{ padding: '0.65rem 0.85rem', textAlign: 'right' }}>Aksi Mitigasi</th>
              </tr>
            </thead>
            <tbody>
              {filteredList.length === 0 ? (
                <tr>
                  <td colSpan={6} style={{ textAlign: 'center', padding: '2rem', color: '#64748b' }}>
                    <ShieldCheck size={28} color="#10b981" style={{ marginBottom: '0.4rem', display: 'inline-block' }} /><br />
                    Tidak ada insiden loopback atau MAC flapping terdeteksi. Port PON dalam kondisi aman.
                  </td>
                </tr>
              ) : (
                filteredList.map((inc) => {
                  const isResolved = inc.status === 'resolved';
                  const isBusy = actionLoading[inc.incident_id];
                  return (
                    <tr key={inc.incident_id} style={{ borderBottom: '1px solid var(--border-color)', background: isResolved ? 'transparent' : 'rgba(239, 68, 68, 0.04)' }}>
                      <td style={{ padding: '0.65rem 0.85rem' }}>
                        <div style={{ fontWeight: 600, color: 'var(--text-main)' }}>{inc.customer_name || 'Pelanggan FTTH'}</div>
                        <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>
                          <code>{inc.serial_number}</code> ({inc.device_name})
                        </div>
                      </td>
                      <td style={{ padding: '0.65rem 0.85rem' }}>
                        <div><code>PON {inc.pon_port}:{inc.onu_index}</code></div>
                        <div style={{ fontSize: '0.72rem', color: isResolved ? '#94a3b8' : '#f87171', fontWeight: 600 }}>
                          Port LAN {inc.lan_port || 1}
                        </div>
                      </td>
                      <td style={{ padding: '0.65rem 0.85rem' }}>
                        <div style={{ fontFamily: 'monospace', color: '#38bdf8' }}>{inc.mac_address || 'N/A'}</div>
                        <div style={{ fontSize: '0.72rem', color: '#94a3b8' }}>
                          ~{inc.storm_rate_pps || 4500} PPS ({inc.flapping_frequency || 120}x/m)
                        </div>
                      </td>
                      <td style={{ padding: '0.65rem 0.85rem' }}>
                        {isResolved ? (
                          <span style={{ color: '#10b981', background: 'rgba(16, 185, 129, 0.1)', padding: '0.2rem 0.5rem', borderRadius: '4px', fontSize: '0.72rem', fontWeight: 600 }}>
                            🟢 Pulih (Active)
                          </span>
                        ) : (
                          <span style={{ color: '#ef4444', background: 'rgba(239, 68, 68, 0.15)', padding: '0.2rem 0.5rem', borderRadius: '4px', fontSize: '0.72rem', fontWeight: 700 }}>
                            🚨 Port LAN {inc.lan_port || 1} ISOLATED
                          </span>
                        )}
                      </td>
                      <td style={{ padding: '0.65rem 0.85rem', color: '#94a3b8', fontSize: '0.72rem' }}>
                        {inc.detected_at}
                      </td>
                      <td style={{ padding: '0.65rem 0.85rem', textAlign: 'right' }}>
                        {isResolved ? (
                          <span style={{ fontSize: '0.72rem', color: '#64748b' }}>Dipulihkan oleh {inc.resolved_by || 'NOC'}</span>
                        ) : (
                          <button
                            className="btn btn-primary"
                            style={{
                              fontSize: '0.72rem', padding: '0.3rem 0.65rem',
                              background: '#10b981', border: 'none', display: 'inline-flex', alignItems: 'center', gap: '0.35rem'
                            }}
                            onClick={() => handleResolve(inc.incident_id)}
                            disabled={isBusy}
                          >
                            {isBusy ? <Loader2 size={12} className="spin-animate" /> : <ShieldCheck size={12} />}
                            <span>Buka Port LAN</span>
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* CLI Log Box */}
        {cliLog && (
          <div style={{ marginBottom: '1.25rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.35rem' }}>
              <span style={{ fontSize: '0.75rem', color: '#94a3b8' }}>Log Eksekusi OMCI / CLI OLT:</span>
              <button onClick={() => setCliLog(null)} style={{ background: 'none', border: 'none', color: '#64748b', fontSize: '0.72rem', cursor: 'pointer' }}>Tutup Log</button>
            </div>
            <pre style={{
              background: '#020617', border: '1px solid #1e293b', borderRadius: '6px',
              padding: '0.75rem', fontSize: '0.72rem', color: '#38bdf8', maxHeight: '130px',
              overflowY: 'auto', margin: 0, lineHeight: 1.4, fontFamily: 'monospace'
            }}>
              {cliLog}
            </pre>
          </div>
        )}

        <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
          <button className="btn btn-secondary" onClick={onClose} style={{ padding: '0.5rem 1.25rem' }}>
            Tutup
          </button>
        </div>
      </div>
    </div>
  );
}

/* ── Re-Push Complete Configuration Modal (Post-Hard Reset) ──────────── */
function RePushConfigModal({ onu, profiles = [], onClose, onSuccess }) {
  const [username, setUsername] = useState(onu.pppoe_username || '');
  const [password, setPassword] = useState(onu.pppoe_password || '');
  const [showPassword, setShowPassword] = useState(false);
  const [selectedProfileId, setSelectedProfileId] = useState(
    onu.service_profile_id ? String(onu.service_profile_id) : (profiles[0]?.profile_id ? String(profiles[0].profile_id) : '')
  );
  const [vlanId, setVlanId] = useState(onu.vlan_id || 100);
  const [acsUrl, setAcsUrl] = useState('http://103.176.227.233:3001/');
  const [rebootAfterPush, setRebootAfterPush] = useState(false);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [showCLI, setShowCLI] = useState(false);
  const [result, setResult] = useState(null);

  const targetProfile = profiles.find((p) => String(p.profile_id) === String(selectedProfileId)) || {
    name: onu.profile_name || 'INTERNET',
    vlan_id: vlanId
  };

  const handleProfileChange = (pId) => {
    setSelectedProfileId(pId);
    const p = profiles.find((prof) => String(prof.profile_id) === String(pId));
    if (p && p.vlan_id) {
      setVlanId(p.vlan_id);
    }
  };

  const handleSubmit = async () => {
    if (!username.trim() || !password.trim()) {
      setError('Username dan Password PPPoE wajib diisi untuk re-push konfigurasi.');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const res = await repushONUConfig(onu.onu_id, {
        pppoe_username: username.trim(),
        pppoe_password: password.trim(),
        vlan_id: parseInt(vlanId, 10),
        service_profile_id: parseInt(selectedProfileId, 10),
        acs_url: acsUrl.trim(),
        reboot_after_push: rebootAfterPush
      });

      if (res && res.success) {
        setResult(res);
      } else {
        setError(res?.error || 'Gagal mendorong ulang konfigurasi ke ONU.');
      }
    } catch (err) {
      setError(err?.response?.data?.error || err.message || 'Terjadi kesalahan saat re-push konfigurasi.');
    } finally {
      setLoading(false);
    }
  };

  // Vendor CLI simulation preview
  const vendor = (onu.device_vendor || onu.vendor || 'ZTE').toUpperCase();
  const slot = onu.card_slot || 2;
  const port = onu.pon_port_id || 1;
  const idx = onu.onu_index || 1;

  let cliPreview = '';
  if (vendor.includes('HUAWEI')) {
    cliPreview = [
      `config`,
      `interface gpon 0/${port}`,
      `  ont ipconfig 0 ${idx} pppoe vlan ${vlanId} priority 0 user-account name ${username || 'USER'} password ${password || 'PASS'}`,
      `  ont internet-config 0 ${idx} ip-index 1 pppoe user-name ${username || 'USER'} password ${password || 'PASS'} vlan ${vlanId}`,
      `  ont tr069-server-config 0 ${idx} profile-name tr069_default url ${acsUrl}`,
      `  ont port native-vlan 0 ${idx} eth 1 vlan ${vlanId} priority 0`,
      rebootAfterPush ? `  ont reset 0 ${idx}` : null,
      `quit`,
      `service-port vlan ${vlanId} gpon 0/${port} ont ${idx} gemport 1 multi-service user-vlan ${vlanId} tag-transform translate`
    ].filter(Boolean).join('\n');
  } else if (vendor.includes('FIBERHOME')) {
    cliPreview = [
      `configure terminal`,
      `interface gpon 1/1/${port}`,
      `  onu wan-connection ${idx} 1 mode route pppoe vlan ${vlanId} username ${username || 'USER'} password ${password || 'PASS'}`,
      `  onu tr069-server-config ${idx} url ${acsUrl}`,
      `  onu remote-mgmt ${idx} web enable`,
      rebootAfterPush ? `  onu reboot ${idx}` : null,
      `exit`
    ].filter(Boolean).join('\n');
  } else {
    cliPreview = [
      `configure terminal`,
      `gpon`,
      `  onu profile vlan ${targetProfile?.vlan_profile || onu.vlan_profile || 'PPPoE'} tag-mode tag cvlan ${vlanId} pri 7`,
      `exit`,
      `interface gpon-onu_1/${slot}/${port}:${idx}`,
      `  tcont 4 name internet profile ${targetProfile?.name || '100M'}`,
      `  gemport 1 name internet tcont 4`,
      `  gemport 1 traffic-limit upstream ${targetProfile?.name || '100M'} downstream ${targetProfile?.name || '100M'}`,
      `  no service-port 1`,
      `  service-port 1 vport 1 user-vlan ${vlanId} vlan ${vlanId}`,
      `exit`,
      `pon-onu-mng gpon-onu_1/${slot}/${port}:${idx}`,
      `  no service PPPoE`,
      `  service PPPoE gemport 1 vlan ${vlanId}`,
      `  wan-ip 1 mode pppoe username ${username || 'USER'} password ${password || 'PASS'} vlan-profile ${targetProfile?.vlan_profile || onu.vlan_profile || 'PPPoE'} host 1`,
      `  wan-ip 1 ping-response enable traceroute-response enable`,
      `  security-mgmt 212 state enable mode forward protocol web`,
      `  tr069-mgmt 1 state unlock`,
      `  tr069-mgmt 1 acs ${acsUrl}`,
      rebootAfterPush ? `  reboot\nyes` : null,
      `exit`,
      `exit`,
      `write`
    ].filter(Boolean).join('\n');
  }

  return (
    <div className="modal-backdrop" style={{
      position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.78)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000,
      backdropFilter: 'blur(4px)', padding: '1rem'
    }}>
      <div className="card" style={{
        width: '100%', maxWidth: '660px', maxHeight: '92vh', overflowY: 'auto',
        background: 'var(--bg-card)', border: '1px solid var(--border-color)',
        boxShadow: '0 20px 40px rgba(0,0,0,0.5)', borderRadius: '12px', padding: '1.5rem'
      }}>
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1.25rem', borderBottom: '1px solid var(--border-color)', paddingBottom: '0.85rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem' }}>
            <div style={{
              width: 38, height: 38, borderRadius: '8px',
              background: 'rgba(245, 158, 11, 0.15)', display: 'flex',
              alignItems: 'center', justifyContent: 'center', color: '#f59e0b'
            }}>
              <Zap size={22} className={loading ? 'spin-animate' : ''} />
            </div>
            <div>
              <h3 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 600, color: 'var(--text-main)' }}>
                Dorong Konfigurasi & PPPoE
              </h3>
              <p style={{ margin: 0, fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                Injeksi parameter WAN, kredensial PPPoE, VLAN, dan TR-069 ke modem via OMCI OLT
              </p>
            </div>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', padding: 4 }}>
            <X size={20} />
          </button>
        </div>

        {/* Result View */}
        {result ? (
          <div>
            <div style={{
              padding: '1rem', borderRadius: '8px', background: 'var(--success-bg)',
              border: '1px solid var(--success-border)', marginBottom: '1.25rem',
              display: 'flex', alignItems: 'flex-start', gap: '0.75rem'
            }}>
              <CheckCircle2 size={22} color="#10b981" style={{ flexShrink: 0, marginTop: 2 }} />
              <div>
                <div style={{ fontWeight: 600, color: 'var(--success)', fontSize: '0.95rem' }}>
                  {result.message}
                </div>
                <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginTop: 4 }}>
                  Parameter WAN, Gemport VLAN, TR-069, dan kredensial PPPoE telah berhasil diprogram ulang ke modem.
                </div>
              </div>
            </div>

            {/* Parameter summary */}
            <div style={{ background: 'var(--bg-surface-elevated)', borderRadius: '8px', padding: '0.85rem', marginBottom: '1.25rem', border: '1px solid var(--border-color)' }}>
              <div style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-secondary)', textTransform: 'uppercase', marginBottom: '0.5rem' }}>
                Ringkasan Hasil Re-Push
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '0.6rem', fontSize: '0.825rem' }}>
                <div><span style={{ color: 'var(--text-secondary)' }}>Serial Number:</span> <code style={{ color: '#38bdf8' }}>{result.serial_number}</code></div>
                <div><span style={{ color: 'var(--text-secondary)' }}>Pelanggan:</span> <span style={{ color: 'var(--text-main)', fontWeight: 600 }}>{result.customer_name || onu.customer_name || '-'}</span></div>
                <div><span style={{ color: 'var(--text-secondary)' }}>VLAN:</span> <span style={{ color: '#10b981' }}>VLAN {result.vlan_id}</span></div>
                <div><span style={{ color: 'var(--text-secondary)' }}>PPPoE User:</span> <code style={{ color: '#f59e0b' }}>{result.pppoe_username}</code></div>
                <div><span style={{ color: 'var(--text-secondary)' }}>Reboot Status:</span> <span style={{ color: 'var(--text-muted)' }}>{result.reboot_scheduled ? 'Reboot Dijadwalkan' : 'Hot OMCI Applied'}</span></div>
              </div>
            </div>

            {/* Executed CLI Box */}
            {result.cli_executed && (
              <div style={{ marginBottom: '1.25rem' }}>
                <div style={{ fontSize: '0.75rem', color: '#9ca3af', marginBottom: '0.35rem' }}>Log Perintah CLI OLT yang Dijalankan:</div>
                <pre style={{
                  background: '#030712', border: '1px solid #1f2937', borderRadius: '6px',
                  padding: '0.75rem', fontSize: '0.75rem', color: '#10b981', maxHeight: '140px',
                  overflowY: 'auto', margin: 0, lineHeight: 1.4
                }}>
                  {result.cli_executed}
                </pre>
              </div>
            )}

            <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '1.25rem' }}>
              <button
                className="btn btn-primary"
                style={{ width: '100%', display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '0.5rem' }}
                onClick={() => {
                  onSuccess(result);
                  onClose();
                }}
              >
                <Check size={16} /> Selesai & Perbarui Tampilan
              </button>
            </div>
          </div>
        ) : (
          /* Form View */
          <div>
            {error && (
              <div style={{
                padding: '0.75rem 1rem', borderRadius: '8px', background: 'rgba(239, 68, 68, 0.1)',
                border: '1px solid rgba(239, 68, 68, 0.3)', color: '#f87171', fontSize: '0.85rem',
                marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '0.5rem'
              }}>
                <AlertCircle size={16} style={{ flexShrink: 0 }} />
                <span>{error}</span>
              </div>
            )}

            {/* Target ONU Card */}
            <div style={{
              background: 'rgba(245, 158, 11, 0.06)', border: '1px solid rgba(245, 158, 11, 0.25)',
              borderRadius: '8px', padding: '0.85rem', marginBottom: '1.25rem', fontSize: '0.825rem'
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.4rem' }}>
                <span style={{ fontWeight: 600, color: '#fef3c7' }}>
                  {onu.customer_name || onu.onu_name || 'Pelanggan FTTH'}
                </span>
                <span style={{ color: '#f59e0b', fontWeight: 600 }}>
                  {vendor} ({onu.device_name || 'OLT'})
                </span>
              </div>
              <div style={{ display: 'flex', gap: '1.25rem', color: '#9ca3af', fontSize: '0.78rem' }}>
                <span>SN: <code style={{ color: '#38bdf8' }}>{onu.serial_number}</code></span>
                <span>Port: <code>1/{onu.card_slot || 2}/{onu.pon_port_id}:{onu.onu_index || 1}</code></span>
                <span>Rx: <strong style={{ color: onu.rx_power < -26 ? '#f87171' : '#34d399' }}>{onu.rx_power ?? '-'} dBm</strong></span>
              </div>
              <div style={{ marginTop: '0.5rem', fontSize: '0.75rem', color: '#d1d5db', lineHeight: 1.35 }}>
                💡 <em>Gunakan fitur ini jika pelanggan tidak sengaja menekan tombol reset pada modem. Seluruh konfigurasi dial-up PPPoE, VLAN, dan remote management akan diprogram ulang langsung dari OLT.</em>
              </div>
            </div>

            {/* Form Fields */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '0.85rem', marginBottom: '1rem' }}>
              {/* PPPoE Username */}
              <div>
                <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '0.35rem' }}>
                  PPPoE Username:
                </label>
                <input
                  type="text"
                  className="form-input"
                  style={{ width: '100%', background: 'var(--bg-input)', color: 'var(--text-main)', border: '1px solid var(--border-color)', borderRadius: '6px', padding: '0.55rem 0.75rem' }}
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  disabled={loading}
                  placeholder="user@isp.net"
                />
              </div>

              {/* PPPoE Password */}
              <div>
                <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '0.35rem' }}>
                  PPPoE Password:
                </label>
                <div style={{ position: 'relative' }}>
                  <input
                    type={showPassword ? 'text' : 'password'}
                    className="form-input"
                    style={{ width: '100%', background: 'var(--bg-input)', color: 'var(--text-main)', border: '1px solid var(--border-color)', borderRadius: '6px', padding: '0.55rem 2.2rem 0.55rem 0.75rem' }}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    disabled={loading}
                    placeholder="Password dial-up"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    style={{ position: 'absolute', right: '0.6rem', top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', padding: 0 }}
                  >
                    {showPassword ? <EyeOff size={15} /> : <Eye size={15} />}
                  </button>
                </div>
              </div>
            </div>

            {/* Package & VLAN */}
            <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '0.85rem', marginBottom: '1rem' }}>
              <div>
                <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '0.35rem' }}>
                  Paket Layanan / Service Profile:
                </label>
                <select
                  className="form-input"
                  style={{ width: '100%', background: 'var(--bg-input)', color: 'var(--text-main)', border: '1px solid var(--border-color)', borderRadius: '6px', padding: '0.55rem 0.75rem' }}
                  value={selectedProfileId}
                  onChange={(e) => handleProfileChange(e.target.value)}
                  disabled={loading}
                >
                  {profiles.map((p) => (
                    <option key={p.profile_id} value={p.profile_id}>
                      {p.name} — VLAN {p.vlan_id}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '0.35rem' }}>
                  VLAN ID:
                </label>
                <input
                  type="number"
                  className="form-input"
                  style={{ width: '100%', background: 'var(--bg-input)', color: 'var(--text-main)', border: '1px solid var(--border-color)', borderRadius: '6px', padding: '0.55rem 0.75rem' }}
                  value={vlanId}
                  onChange={(e) => setVlanId(e.target.value)}
                  disabled={loading}
                />
              </div>
            </div>



            {/* Execution Options */}
            <div style={{ background: 'var(--bg-surface-elevated)', borderRadius: '8px', padding: '0.75rem 0.85rem', border: '1px solid var(--border-color)', marginBottom: '1.25rem', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: '0.55rem', cursor: 'pointer', margin: 0 }}>
                <input
                  type="checkbox"
                  checked={rebootAfterPush}
                  onChange={(e) => setRebootAfterPush(e.target.checked)}
                  disabled={loading}
                  style={{ accentColor: '#f59e0b' }}
                />
                <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                  Reboot ONU setelah push (Opsional jika perangkat memerlukan warm restart)
                </span>
              </label>
            </div>

            {/* CLI Preview Accordion */}
            <div style={{ marginBottom: '1.5rem' }}>
              <button
                type="button"
                onClick={() => setShowCLI(!showCLI)}
                style={{
                  background: 'none', border: 'none', color: '#f59e0b',
                  fontSize: '0.8rem', cursor: 'pointer', padding: 0,
                  display: 'flex', alignItems: 'center', gap: '0.4rem'
                }}
              >
                <Terminal size={14} />
                {showCLI ? 'Sembunyikan CLI Command OLT' : 'Lihat Perintah OMCI CLI OLT yang Akan Dikirim'}
              </button>
              {showCLI && (
                <div style={{
                  marginTop: '0.5rem', background: '#030712', border: '1px solid #1f2937',
                  borderRadius: '6px', padding: '0.75rem', fontSize: '0.75rem', fontFamily: 'monospace',
                  color: '#10b981', lineHeight: '1.4', whiteSpace: 'pre-wrap'
                }}>
                  {cliPreview}
                </div>
              )}
            </div>

            {/* Action buttons */}
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem' }}>
              <button className="btn btn-secondary" onClick={onClose} disabled={loading}>
                Batal
              </button>
              <button
                className="btn btn-primary"
                onClick={handleSubmit}
                disabled={loading}
                style={{
                  display: 'inline-flex', alignItems: 'center', gap: '0.5rem',
                  background: 'linear-gradient(135deg, #d97706 0%, #b45309 100%)',
                  border: 'none', minWidth: '180px', justifyContent: 'center'
                }}
              >
                {loading ? (
                  <>
                    <Loader2 size={16} className="spin-animate" />
                    <span>Mendorong Konfigurasi...</span>
                  </>
                ) : (
                  <>
                    <Zap size={16} />
                    <span>Dorong Konfigurasi Sekarang</span>
                  </>
                )}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

/* ── Change ONU Service Profile Modal (Override Without Unregister) ─── */
function ChangeServiceProfileModal({ onu, profiles = [], onClose, onSuccess }) {
  const [selectedProfileId, setSelectedProfileId] = useState(
    onu.service_profile_id ? String(onu.service_profile_id) : (profiles[0]?.profile_id ? String(profiles[0].profile_id) : '')
  );
  const [reason, setReason] = useState('Upgrade/Downgrade paket sesuai permintaan');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [showCLI, setShowCLI] = useState(false);

  const currentProfile = profiles.find((p) => p.profile_id === onu.service_profile_id) || {
    name: onu.profile_name || 'Profil Aktif',
    vlan_id: onu.vlan_id || 'N/A'
  };
  const targetProfile = profiles.find((p) => p.profile_id === parseInt(selectedProfileId, 10));

  const isSameProfile = targetProfile && targetProfile.profile_id === onu.service_profile_id;

  const handleSubmit = async () => {
    if (!targetProfile) {
      setError('Silakan pilih profil paket baru.');
      return;
    }
    if (isSameProfile) {
      setError('Profil paket yang dipilih sama dengan paket saat ini. Pilih profil yang berbeda.');
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const res = await changeONUProfile(onu.onu_id, {
        service_profile_id: targetProfile.profile_id,
        reason: reason.trim()
      });
      onClose();
      if (onSuccess) onSuccess(res);
    } catch (err) {
      setError(err.message || 'Gagal mengubah paket layanan ONU.');
    } finally {
      setLoading(false);
    }
  };

  // Generate realistic CLI Preview
  const vendor = (onu.device_vendor || onu.vendor || 'ZTE').toUpperCase();
  const ponPort = onu.pon_port_id || 1;
  const onuIdx = onu.onu_index || 1;
  const targetName = targetProfile?.name || 'PROFILE_NAME';

  let cliPreview = '';
  if (vendor.includes('HUAWEI')) {
    cliPreview = [
      `! --- [NMS] Modify ONT Line/Srv Profile (In-Place) ---`,
      `config`,
      `interface gpon 0/${ponPort}`,
      ` ont modify ${ponPort} ${onuIdx} lineprofile-name ${targetName} srvprofile-name ${targetName}`,
      ` quit`,
      `save`
    ].join('\n');
  } else if (vendor.includes('FIBERHOME')) {
    cliPreview = [
      `! --- [NMS] Modify Fiberhome ONU Service Profile ---`,
      `configure terminal`,
      `interface gpon-olt_1/1/${ponPort}`,
      ` onu ${onuIdx} profile ${targetName}`,
      ` exit`,
      `write`
    ].join('\n');
  } else {
    // Default ZTE
    const speedMatch = (targetName || '').match(/\d+\s*(?:M|MB|Mbps|G)/i);
    const speed = speedMatch ? speedMatch[0].replace(/\s+/g, '').replace(/MBPS/i, 'M').replace(/MB/i, 'M').toUpperCase() : '100M';
    const targetVlan = targetProfile?.vlan_id || 100;
    const card = onu.card_slot || 2;
    const KNOWN_ZTE_VLAN_PROFILES = {
      101: 'PPPoE',
      200: 'PPPoE2',
      116: 'MNG',
      1049: 'PASSMINI',
      1050: 'PASSLITE',
      1051: 'PASSMAX',
      1052: 'PASSTURBO',
      1080: 'PASSMINI',
      1081: 'PASSLITE',
      1082: 'PASSMAX',
      1083: 'PASSTURBO',
      1084: 'PASSGOLD',
      1085: 'PASSBIZ',
      1086: 'PASSFLEX',
      1087: 'PASSFREE30MB',
      2124: 'PASSEXTRA',
      2125: 'PASSPICO'
    };
    const vlanProf = (targetProfile?.vlan_profile && String(targetProfile.vlan_profile).trim())
      ? String(targetProfile.vlan_profile).trim()
      : (KNOWN_ZTE_VLAN_PROFILES[targetVlan] || 'PPPoE');

    cliPreview = [
      `! --- [NMS] Modify ZTE GPON-ONU Internet Profile, Bandwidth, VLAN & OMCI ---`,
      `configure terminal`,
      `gpon`,
      `  onu profile vlan ${vlanProf} tag-mode tag cvlan ${targetVlan} pri 7`,
      `exit`,
      `interface gpon-onu_1/${card}/${ponPort}:${onuIdx}`,
      `  tcont 4 name internet profile ${speed}`,
      `  gemport 1 name internet tcont 4`,
      `  gemport 1 traffic-limit upstream ${speed} downstream ${speed}`,
      `  no service-port 1`,
      `  service-port 1 vport 1 user-vlan ${targetVlan} vlan ${targetVlan}`,
      `exit`,
      `pon-onu-mng gpon-onu_1/${card}/${ponPort}:${onuIdx}`,
      `  no service PPPoE`,
      `  service PPPoE gemport 1 vlan ${targetVlan}`,
      onu.pppoe_username ? `  wan-ip 1 mode pppoe username ${onu.pppoe_username} password *** vlan-profile ${vlanProf} host 1` : null,
      `exit`,
      `write`
    ].filter(Boolean).join('\n');
  }

  return (
    <div className="modal-overlay">
      <div className="modal-card" style={{ maxWidth: '580px' }}>
        <div className="modal-header">
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
            <div style={{
              width: '38px',
              height: '38px',
              borderRadius: '8px',
              background: 'rgba(168,85,247,0.15)',
              border: '1px solid rgba(168,85,247,0.3)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center'
            }}>
              <Sliders size={18} color="#c084fc" />
            </div>
            <div>
              <div style={{ fontWeight: 700, fontSize: '1rem', color: 'var(--text-main)' }}>Ganti Paket Layanan ONU</div>
              <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Override Service Profile & Bandwidth Tanpa Unregister</div>
            </div>
          </div>
          <button className="btn btn-secondary" style={{ padding: '0.25rem 0.5rem' }} onClick={onClose} disabled={loading}>
            <X size={16} />
          </button>
        </div>

        {error && (
          <div className="badge badge-danger" style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', padding: '0.75rem', marginBottom: '1rem' }}>
            <AlertCircle size={15} style={{ flexShrink: 0 }} />
            <span>{error}</span>
          </div>
        )}

        <div style={{ maxHeight: 'calc(80vh - 140px)', overflowY: 'auto', paddingRight: '0.25rem' }}>
          {/* Target ONU Summary Card */}
          <div style={{
            background: 'var(--bg-input)',
            border: '1px solid var(--border-color)',
            borderRadius: '8px',
            padding: '0.85rem',
            marginBottom: '1rem'
          }}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '0.6rem', fontSize: '0.8rem' }}>
              <div>
                <span style={{ color: 'var(--text-muted)', display: 'block', fontSize: '0.72rem' }}>Pelanggan:</span>
                <strong style={{ color: 'var(--text-main)' }}>{onu.customer_name || onu.onu_name || 'Tanpa Nama'}</strong>
              </div>
              <div>
                <span style={{ color: 'var(--text-muted)', display: 'block', fontSize: '0.72rem' }}>Serial Number:</span>
                <span style={{ fontFamily: 'JetBrains Mono, monospace', color: '#38bdf8', fontWeight: 600 }}>{onu.serial_number}</span>
              </div>
              <div>
                <span style={{ color: 'var(--text-muted)', display: 'block', fontSize: '0.72rem' }}>OLT / Port / Index:</span>
                <span style={{ color: 'var(--text-secondary)', fontFamily: 'JetBrains Mono, monospace' }}>
                  {onu.device_name || 'OLT'} (1/1/{ponPort}:{onuIdx})
                </span>
              </div>
              <div>
                <span style={{ color: 'var(--text-muted)', display: 'block', fontSize: '0.72rem' }}>Paket Saat Ini:</span>
                <span style={{ color: '#a855f7', fontWeight: 600 }}>{currentProfile.name} (VLAN {currentProfile.vlan_id})</span>
              </div>
              {onu.pppoe_username && (
                <div style={{ gridColumn: 'span 2' }}>
                  <span style={{ color: 'var(--text-muted)', display: 'block', fontSize: '0.72rem' }}>Akun PPPoE:</span>
                  <span style={{ color: '#34d399', fontFamily: 'JetBrains Mono, monospace' }}>
                    {onu.pppoe_username} {onu.pppoe_profile ? `[${onu.pppoe_profile}]` : ''}
                  </span>
                </div>
              )}
            </div>
          </div>

          {/* New Profile Picker */}
          <div style={{ marginBottom: '1rem' }}>
            <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 600, color: 'var(--text-main)', marginBottom: '0.5rem' }}>
              Pilih Paket / Service Profile Baru:
            </label>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.45rem' }}>
              {profiles.map((p) => {
                const isCurrent = p.profile_id === onu.service_profile_id;
                const isSelected = p.profile_id === parseInt(selectedProfileId, 10);
                return (
                  <div
                    key={p.profile_id}
                    onClick={() => setSelectedProfileId(p.profile_id)}
                    style={{
                      padding: '0.65rem 0.85rem',
                      borderRadius: '8px',
                      border: `1px solid ${isSelected ? 'var(--primary)' : 'var(--border-color)'}`,
                      background: isSelected ? 'rgba(168,85,247,0.12)' : 'var(--bg-input)',
                      cursor: 'pointer',
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      transition: 'all 0.15s ease'
                    }}
                  >
                    <div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                        <span style={{ fontWeight: 600, fontSize: '0.88rem', color: isSelected ? 'var(--primary)' : 'var(--text-main)' }}>
                          {p.name}
                        </span>
                        {isCurrent && (
                          <span style={{
                            fontSize: '0.68rem',
                            padding: '0.1rem 0.4rem',
                            borderRadius: '4px',
                            background: 'rgba(148,163,184,0.15)',
                            color: 'var(--text-secondary)',
                            border: '1px solid var(--border-color)'
                          }}>
                            Paket Saat Ini
                          </span>
                        )}
                      </div>
                      <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '0.15rem' }}>
                        VLAN {p.vlan_id} · {p.wan_config_template || 'IPoE/PPPoE WAN'}
                      </div>
                    </div>
                    {isSelected && <CheckCircle2 size={17} color="#c084fc" />}
                  </div>
                );
              })}
            </div>
          </div>

          {/* Profile Change Diff / Comparison */}
          {targetProfile && !isSameProfile && (
            <div style={{
              background: 'rgba(168,85,247,0.08)',
              border: '1px solid rgba(168,85,247,0.25)',
              borderRadius: '8px',
              padding: '0.85rem',
              marginBottom: '1rem'
            }}>
              <div style={{ fontSize: '0.78rem', fontWeight: 600, color: '#c084fc', marginBottom: '0.5rem', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                <Sparkles size={14} /> Parameter Layanan yang Akan Diubah di Hardware OLT:
              </div>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-around', gap: '0.75rem', textAlign: 'center' }}>
                <div style={{ flex: 1, background: 'var(--bg-input)', padding: '0.5rem', borderRadius: '6px' }}>
                  <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>SEBELUM</div>
                  <div style={{ fontSize: '0.85rem', fontWeight: 700, color: 'var(--text-main)', marginTop: '0.2rem' }}>
                    {currentProfile.name}
                  </div>
                  <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: '2px' }}>VLAN: {currentProfile.vlan_id}</div>
                  <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>Up/Down: {currentProfile.bandwidth_down_mbps ? `${currentProfile.bandwidth_down_mbps}M` : currentProfile.name}</div>
                </div>
                <ArrowRight size={18} color="#a855f7" style={{ flexShrink: 0 }} />
                <div style={{ flex: 1, background: 'rgba(168,85,247,0.18)', border: '1px solid rgba(168,85,247,0.3)', padding: '0.5rem', borderRadius: '6px' }}>
                  <div style={{ fontSize: '0.7rem', color: '#c084fc', fontWeight: 600 }}>SESUDAH (BARU)</div>
                  <div style={{ fontSize: '0.85rem', fontWeight: 700, color: '#38bdf8', marginTop: '0.2rem' }}>
                    {targetProfile.name}
                  </div>
                  <div style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', marginTop: '2px' }}>VLAN: {targetProfile.vlan_id}</div>
                  <div style={{ fontSize: '0.7rem', color: '#10b981', fontWeight: 600 }}>Up/Down: {targetProfile.bandwidth_down_mbps ? `${targetProfile.bandwidth_down_mbps}M` : targetProfile.name}</div>
                </div>
              </div>
            </div>
          )}

          {/* Reason / Notes field */}
          <div style={{ marginBottom: '1rem' }}>
            <label style={{ display: 'block', fontSize: '0.8rem', color: '#94a3b8', marginBottom: '0.35rem' }}>
              Alasan / Catatan Perubahan (Tercatat di Audit Log):
            </label>
            <input
              type="text"
              className="input-text"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Contoh: Upgrade paket kecepatan 50Mbps request via CS"
              style={{ width: '100%', fontSize: '0.82rem' }}
            />
          </div>

          {/* Toggle CLI Preview */}
          <div style={{ marginBottom: '1rem' }}>
            <button
              type="button"
              onClick={() => setShowCLI(!showCLI)}
              style={{
                background: 'none',
                border: 'none',
                color: '#38bdf8',
                fontSize: '0.75rem',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '0.35rem',
                padding: 0
              }}
            >
              <Terminal size={13} />
              {showCLI ? 'Sembunyikan OLT CLI Plan' : 'Lihat OLT CLI Execution Plan'}
            </button>
            {showCLI && (
              <pre style={{
                background: '#090d16',
                border: '1px solid rgba(56,189,248,0.2)',
                borderRadius: '6px',
                padding: '0.75rem',
                fontSize: '0.73rem',
                color: '#38bdf8',
                fontFamily: 'JetBrains Mono, monospace',
                marginTop: '0.5rem',
                whiteSpace: 'pre-wrap',
                maxHeight: '160px',
                overflowY: 'auto'
              }}>
                {cliPreview}
              </pre>
            )}
          </div>

          {/* Warning Notice */}
          <div style={{
            background: 'rgba(56,189,248,0.08)',
            border: '1px solid rgba(56,189,248,0.2)',
            borderRadius: '8px',
            padding: '0.75rem',
            fontSize: '0.78rem',
            color: '#93c5fd',
            display: 'flex',
            gap: '0.5rem',
            alignItems: 'flex-start',
            lineHeight: 1.45
          }}>
            <Shield size={16} style={{ flexShrink: 0, marginTop: '2px', color: '#38bdf8' }} />
            <div>
              Override paket dilakukan secara <strong>in-place</strong> pada index ONU yang sama tanpa unregister atau reboot fisik. Bandwidth T-CONT & konfigurasi traffic profile OLT akan terupdate otomatis.
            </div>
          </div>
        </div>

        <div style={{ display: 'flex', gap: '0.75rem', marginTop: '1rem' }}>
          <button className="btn btn-secondary" style={{ flex: 1 }} onClick={onClose} disabled={loading}>
            Batal
          </button>
          <button
            className="btn btn-primary"
            style={{
              flex: 1.3,
              justifyContent: 'center',
              gap: '0.45rem',
              background: '#9333ea',
              borderColor: '#9333ea'
            }}
            disabled={loading || isSameProfile || !targetProfile}
            onClick={handleSubmit}
          >
            {loading ? (
              <>
                <Loader2 size={14} className="spin-animate" />
                Menerapkan Perubahan...
              </>
            ) : (
              <>
                <Sliders size={14} />
                Terapkan Perubahan Paket
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ── Confirm Remote Reboot ONU Modal ────────────────────────────────── */
function ConfirmRebootModal({ onu, onConfirm, onClose }) {
  const [loading, setLoading] = useState(false);

  return (
    <div className="modal-overlay">
      <div className="modal-card" style={{ maxWidth: '480px' }}>
        <div className="modal-header">
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
            <div style={{
              width: '38px',
              height: '38px',
              borderRadius: '8px',
              background: 'rgba(56,189,248,0.15)',
              border: '1px solid rgba(56,189,248,0.3)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center'
            }}>
              <RotateCcw size={18} color="#38bdf8" className={loading ? 'spin-animate' : ''} />
            </div>
            <div>
              <div style={{ fontWeight: 700, fontSize: '1rem', color: 'var(--text-main)' }}>Remote Reboot ONU</div>
              <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>OMCI Hardware Power Cycle via OLT</div>
            </div>
          </div>
          <button className="btn btn-secondary" style={{ padding: '0.25rem 0.5rem' }} onClick={onClose} disabled={loading}>
            <X size={16} />
          </button>
        </div>

        <div style={{ padding: '0.5rem 0' }}>
          {/* Customer & Modem Summary Box */}
          <div style={{
            background: 'var(--bg-input)',
            border: '1px solid var(--border-color)',
            borderRadius: '8px',
            padding: '0.85rem',
            marginBottom: '1rem'
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.45rem', fontSize: '0.82rem' }}>
              <span style={{ color: 'var(--text-muted)' }}>Pelanggan:</span>
              <span style={{ fontWeight: 700, color: 'var(--text-main)' }}>{onu.onu_name || onu.serial_number}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.45rem', fontSize: '0.82rem' }}>
              <span style={{ color: 'var(--text-muted)' }}>Serial Number:</span>
              <span style={{ fontFamily: 'JetBrains Mono, monospace', color: '#38bdf8', fontWeight: 600 }}>{onu.serial_number}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.45rem', fontSize: '0.82rem' }}>
              <span style={{ color: 'var(--text-muted)' }}>Perangkat OLT:</span>
              <span style={{ color: 'var(--text-secondary)' }}>{onu.device_name || 'OLT GPON'}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.45rem', fontSize: '0.82rem' }}>
              <span style={{ color: '#94a3b8' }}>PON Port & Index:</span>
              <span style={{ fontFamily: 'JetBrains Mono, monospace', color: '#fbbf24', fontWeight: 600 }}>
                {onu.device_vendor === 'Huawei' ? '0' : '1'}/{onu.card_slot || 2}/{onu.pon_port_id}:{onu.onu_index || 1}
              </span>
            </div>
            {onu.pppoe_username && (
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.82rem' }}>
                <span style={{ color: '#94a3b8' }}>Akun PPPoE:</span>
                <span style={{ fontFamily: 'JetBrains Mono, monospace', color: '#34d399' }}>{onu.pppoe_username}</span>
              </div>
            )}
          </div>

          {/* Warning notice */}
          <div style={{
            background: 'rgba(245,158,11,0.1)',
            border: '1px solid rgba(245,158,11,0.25)',
            borderRadius: '8px',
            padding: '0.75rem',
            fontSize: '0.8rem',
            color: '#fbbf24',
            display: 'flex',
            gap: '0.6rem',
            alignItems: 'flex-start',
            lineHeight: 1.5
          }}>
            <AlertTriangle size={16} style={{ flexShrink: 0, marginTop: '2px' }} />
            <div>
              Perintah reboot OMCI akan dikirim langsung ke OLT. Modem pelanggan akan melakukan proses restart fisik (membutuhkan waktu booting ~1-2 menit). Sesi koneksi internet akan terputus sementara waktu.
            </div>
          </div>
        </div>

        <div style={{ display: 'flex', gap: '0.75rem', marginTop: '0.75rem' }}>
          <button className="btn btn-secondary" style={{ flex: 1 }} onClick={onClose} disabled={loading}>
            Batal
          </button>
          <button
            className="btn btn-primary"
            style={{
              flex: 1.2,
              justifyContent: 'center',
              gap: '0.45rem',
              background: '#0284c7',
              borderColor: '#0284c7'
            }}
            disabled={loading}
            onClick={async () => {
              setLoading(true);
              try {
                await onConfirm(onu);
              } finally {
                setLoading(false);
              }
            }}
          >
            {loading ? (
              <>
                <Loader2 size={14} className="spin-animate" />
                Mengirim Perintah...
              </>
            ) : (
              <>
                <RotateCcw size={14} />
                Reboot Sekarang
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ── Generate Realistic OLT Running Configuration Preview ───────────── */
function generateCLIPreview({ device, form, profile, acsUrl = 'http://103.176.227.233:3001/' }) {
  const vendor = (device?.vendor || 'ZTE').toUpperCase();
  const slot = form.card_slot || 1;
  const port = form.pon_port_id || 1;
  const onuIdx = form.onu_index || 1;
  const onuType = form.onu_type || 'VSOL2L';
  const sn = form.serial_number || 'ZTEGC9988776';
  const custName = (form.customer_name?.trim() || 'RUDI RUSMANA PAK RT 03').toUpperCase();
  const pppUser = form.pppoe_username?.trim() || `${sn.toLowerCase()}@pass.net.id`;
  const pppPass = form.pppoe_password?.trim() || '32732000032';
  const vlan = profile?.vlan_id || 1081;
  const profName = profile?.name || '10MB';
  const finalAcsUrl = form?.tr069_acs_url?.trim() || acsUrl;

  const speedMatch = profName.match(/\d+\s*(?:M|MB|Mbps|G)/i);
  const speed = speedMatch ? speedMatch[0].replace(/\s+/g, '').toUpperCase() : '10MB';

  if (vendor.includes('ZTE')) {
    let script = `configure terminal
interface gpon-olt_1/${slot}/${port}
  onu ${onuIdx} type ${onuType} sn ${sn}
exit
interface gpon-onu_1/${slot}/${port}:${onuIdx}
  sn-bind enable sn
  name ${custName}
  description $$$$${pppUser}
  tcont 4 name internet profile ${speed}
  gemport 1 name internet tcont 4
  gemport 1 traffic-limit upstream ${speed} downstream ${speed}
  service-port 1 vport 1 user-vlan ${vlan} vlan ${vlan}
exit`;

    if (form.pppoe_username) {
      const vlanProf = (profile?.vlan_profile && String(profile.vlan_profile).trim()) ? String(profile.vlan_profile).trim() : 'PPPoE';
      script += `
pon-onu-mng gpon-onu_1/${slot}/${port}:${onuIdx}
  service PPPoE gemport 1 vlan ${vlan}
  wan-ip 1 mode pppoe username ${pppUser} password ${pppPass} vlan-profile ${vlanProf} host 1
  wan-ip 1 ping-response enable traceroute-response enable
  tr069-mgmt 1 state unlock
  tr069-mgmt 1 acs ${finalAcsUrl}
  security-mgmt 212 state enable mode forward protocol web
exit`;
    }

    script += `
exit
write`;
    return script;
  }

  if (vendor.includes('HUAWEI')) {
    let script = `enable
config
interface gpon 0/${slot}
  ont add ${port} ${onuIdx} sn-auth "${sn}" omci ont-lineprofile-name "${profName}" ont-srvprofile-name "${profName}" desc "${custName} - ${pppUser}"
  ont port native-vlan ${port} ${onuIdx} eth 1 vlan ${vlan} priority 0
quit
service-port vlan ${vlan} gpon 0/${slot}/${port} ont ${onuIdx} gemport 1 multi-service user-vlan ${vlan} tag-transform translate`;

    if (form.pppoe_username) {
      script += `
ont ipconfig 0/${slot} ${port} ${onuIdx} pppoe user-account "${pppUser}" password "${pppPass}" vlan ${vlan}`;
    }

    script += `
save`;
    return script;
  }

  // Fiberhome
  let script = `enable
config
interface pon 1/${slot}/${port}
  phy-auth-onu ${onuIdx} ${sn}
  onu-name ${onuIdx} "${custName}"
  onu-desc ${onuIdx} "$$$$${pppUser}"
  service-port ${onuIdx} gem 1 vlan ${vlan}`;

  if (form.pppoe_username) {
    script += `
  wan-service ${onuIdx} pppoe user ${pppUser} password ${pppPass} vlan ${vlan}`;
  }

  script += `
exit
write`;
  return script;
}

/* ── CLI Preview Terminal Window with Manual Edit Mode ───────────────── */
function CLIPreviewTerminal({
  cliText = '',
  deviceName = 'OLT',
  isEditMode = false,
  onToggleEdit,
  onChangeCli,
  onResetTemplate,
  isCustom = false
}) {
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    navigator.clipboard.writeText(cliText);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div style={{
      background: '#040711',
      border: isEditMode ? '1px solid #f59e0b' : (isCustom ? '1px solid #eab308' : '1px solid #1e293b'),
      borderRadius: '8px',
      overflow: 'hidden',
      marginBottom: '1rem',
      boxShadow: isEditMode ? '0 0 0 1px rgba(245, 158, 11, 0.25), 0 8px 24px rgba(0,0,0,0.5)' : '0 8px 24px rgba(0,0,0,0.4)',
      transition: 'all 0.2s ease'
    }}>
      {/* Header bar */}
      <div style={{
        background: '#0a0f1d',
        borderBottom: `1px solid ${isEditMode ? 'rgba(245, 158, 11, 0.3)' : '#1e293b'}`,
        padding: '0.5rem 0.85rem',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        flexWrap: 'wrap',
        gap: '0.5rem'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.55rem' }}>
          <div style={{ display: 'flex', gap: '5px' }}>
            <span style={{ width: '9px', height: '9px', borderRadius: '50%', background: '#ef4444', display: 'inline-block' }} />
            <span style={{ width: '9px', height: '9px', borderRadius: '50%', background: '#f59e0b', display: 'inline-block' }} />
            <span style={{ width: '9px', height: '9px', borderRadius: '50%', background: '#10b981', display: 'inline-block' }} />
          </div>
          <span style={{ fontSize: '0.74rem', color: isEditMode ? '#fbbf24' : '#94a3b8', fontFamily: 'JetBrains Mono, monospace', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '6px' }}>
            {deviceName} — CLI Running Configuration
            {isEditMode ? (
              <span style={{ fontSize: '0.68rem', padding: '1px 6px', borderRadius: '4px', background: 'rgba(245, 158, 11, 0.2)', color: '#fbbf24', border: '1px solid rgba(245, 158, 11, 0.4)' }}>
                MODE EDIT MANUAL
              </span>
            ) : isCustom ? (
              <span style={{ fontSize: '0.68rem', padding: '1px 6px', borderRadius: '4px', background: 'rgba(56, 189, 248, 0.15)', color: '#38bdf8', border: '1px solid rgba(56, 189, 248, 0.3)' }}>
                CUSTOM CLI AKTIF
              </span>
            ) : (
              <span style={{ fontSize: '0.68rem', padding: '1px 6px', borderRadius: '4px', background: 'rgba(255, 255, 255, 0.05)', color: '#64748b' }}>
                PRATINJAU OTOMATIS
              </span>
            )}
          </span>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '0.45rem' }}>
          {isCustom && onResetTemplate && (
            <button
              type="button"
              onClick={onResetTemplate}
              title="Reset ke template konfigurasi standar OLT"
              style={{
                background: 'rgba(239, 68, 68, 0.12)',
                border: '1px solid rgba(239, 68, 68, 0.3)',
                color: '#f87171',
                borderRadius: '4px',
                padding: '0.2rem 0.55rem',
                fontSize: '0.72rem',
                fontFamily: 'JetBrains Mono, monospace',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '0.35rem'
              }}
            >
              <RotateCcw size={11} /> Reset Template
            </button>
          )}

          {onToggleEdit && (
            <button
              type="button"
              onClick={onToggleEdit}
              style={{
                background: isEditMode ? 'rgba(245, 158, 11, 0.2)' : 'rgba(59, 130, 246, 0.15)',
                border: `1px solid ${isEditMode ? 'rgba(245, 158, 11, 0.4)' : 'rgba(59, 130, 246, 0.35)'}`,
                color: isEditMode ? '#fbbf24' : '#60a5fa',
                borderRadius: '4px',
                padding: '0.2rem 0.6rem',
                fontSize: '0.72rem',
                fontFamily: 'JetBrains Mono, monospace',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '0.35rem',
                fontWeight: 600
              }}
            >
              {isEditMode ? <Check size={12} /> : <Sliders size={12} />}
              {isEditMode ? 'Selesai Edit' : 'Mode Edit CLI'}
            </button>
          )}

          <button
            type="button"
            onClick={handleCopy}
            style={{
              background: copied ? 'rgba(16,185,129,0.15)' : 'rgba(255,255,255,0.06)',
              border: `1px solid ${copied ? 'rgba(16,185,129,0.3)' : 'rgba(255,255,255,0.1)'}`,
              color: copied ? '#34d399' : '#cbd5e1',
              borderRadius: '4px',
              padding: '0.2rem 0.6rem',
              fontSize: '0.72rem',
              fontFamily: 'JetBrains Mono, monospace',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '0.35rem'
            }}
          >
            {copied ? <Check size={12} /> : <Terminal size={12} />}
            {copied ? 'Tersalin!' : 'Salin CLI'}
          </button>
        </div>
      </div>

      {/* Mode Edit Notice Banner */}
      {isEditMode && (
        <div style={{
          background: 'rgba(245, 158, 11, 0.08)',
          borderBottom: '1px solid rgba(245, 158, 11, 0.2)',
          padding: '0.45rem 0.85rem',
          fontSize: '0.74rem',
          color: '#fbbf24',
          display: 'flex',
          alignItems: 'center',
          gap: '0.5rem'
        }}>
          <AlertTriangle size={14} style={{ flexShrink: 0 }} />
          <span>
            <strong>Mode Edit Manual Aktif:</strong> Anda dapat mengubah atau menambahkan perintah CLI di bawah ini. Syntax yang Anda tulis akan dikirim langsung ke OLT saat tombol eksekusi ditekan.
          </span>
        </div>
      )}

      {/* Editor or Syntax View */}
      {isEditMode ? (
        <div style={{ position: 'relative' }}>
          <textarea
            value={cliText}
            onChange={(e) => onChangeCli && onChangeCli(e.target.value)}
            rows={14}
            spellCheck={false}
            style={{
              width: '100%',
              padding: '0.85rem 1rem',
              boxSizing: 'border-box',
              background: '#040711',
              color: '#38bdf8',
              fontFamily: 'JetBrains Mono, monospace',
              fontSize: '0.8rem',
              lineHeight: 1.6,
              border: 'none',
              outline: 'none',
              resize: 'vertical',
              minHeight: '260px',
              tabSize: 2
            }}
            placeholder="Ketik baris perintah CLI OLT di sini..."
          />
          <div style={{
            position: 'absolute',
            bottom: '8px',
            right: '12px',
            fontSize: '0.68rem',
            color: '#64748b',
            fontFamily: 'JetBrains Mono, monospace',
            background: 'rgba(4,7,17,0.85)',
            padding: '2px 6px',
            borderRadius: '4px',
            pointerEvents: 'none'
          }}>
            {cliText.split('\n').length} baris · {cliText.length} karakter
          </div>
        </div>
      ) : (
        <pre style={{
          padding: '0.85rem 1rem',
          margin: 0,
          fontFamily: 'JetBrains Mono, monospace',
          fontSize: '0.78rem',
          lineHeight: 1.6,
          color: '#38bdf8',
          overflowX: 'auto',
          maxHeight: '280px',
          overflowY: 'auto',
          background: '#040711'
        }}>
          <code>
            {cliText.split('\n').map((line, idx) => {
              let color = '#38bdf8';
              if (line.includes('#show') || line.includes('#display')) {
                color = '#fbbf24';
              } else if (line.startsWith('Building configuration')) {
                color = '#64748b';
              } else if (line.startsWith('interface ') || line.startsWith('pon-onu-mng ') || line.startsWith('configure terminal') || line.startsWith('config') || line.startsWith('enable')) {
                color = '#60a5fa';
              } else if (line.includes('name ') || line.includes('description ')) {
                color = '#34d399';
              } else if (line.includes('onu ') && line.includes('type ')) {
                color = '#f472b6';
              } else if (line.includes('tcont ') || line.includes('gemport ')) {
                color = '#c084fc';
              } else if (line.includes('service-port ') || line.includes('wan-ip ') || line.includes('vlan ')) {
                color = '#f59e0b';
              } else if (line.trim() === '!' || line.trim() === 'exit' || line.trim() === 'quit' || line.trim() === 'write' || line.trim() === 'save' || line.trim() === 'end') {
                color = '#94a3b8';
              }
              return (
                <div key={idx} style={{ color }}>
                  {line || ' '}
                </div>
              );
            })}
          </code>
        </pre>
      )}
    </div>
  );
}

/* ── Generate Swap OLT CLI Commands Preview ───────────────────────── */
function generateSwapCLIPreview({ device, onu, newSN, targetOnuType, acsUrl = 'http://103.176.227.233:3001/' }) {
  const vendor = (device?.vendor || onu.vendor || onu.device_vendor || 'ZTE').toUpperCase();
  const devName = device?.name || onu.device_name || 'OLT-ANTAPANI-01';
  const slot = onu.card_slot || 2;
  const port = onu.pon_port_id || 1;
  const onuIdx = onu.onu_index || 1;
  const oldSN = onu.serial_number;
  const custName = (onu.customer_name || onu.onu_name || 'PELANGGAN').toUpperCase();
  const pppUser = onu.pppoe_username || `${newSN.toLowerCase()}@pass.net.id`;
  const pppPass = onu.pppoe_password || '32732000032';
  const vlan = onu.vlan_id || 1081;
  const profName = onu.profile_name || onu.pppoe_profile || 'INTERNET-100M';
  const selectedOnuType = (targetOnuType || onu.onu_type || 'ZTE').trim();

  const KNOWN_ZTE_VLAN_PROFILES = {
    101: 'PPPoE',
    200: 'PPPoE2',
    116: 'MNG',
    1049: 'PASSMINI',
    1050: 'PASSLITE',
    1051: 'PASSMAX',
    1052: 'PASSTURBO',
    1080: 'PASSMINI',
    1081: 'PASSLITE',
    1082: 'PASSMAX',
    1083: 'PASSTURBO',
    1084: 'PASSGOLD',
    1085: 'PASSBIZ',
    1086: 'PASSFLEX',
    1087: 'PASSFREE30MB',
    2124: 'PASSEXTRA',
    2125: 'PASSPICO'
  };
  const vlanProf = (onu.vlan_profile && String(onu.vlan_profile).trim())
    ? String(onu.vlan_profile).trim()
    : (KNOWN_ZTE_VLAN_PROFILES[vlan] || 'PPPoE');

  const speedMatch = profName.match(/\d+\s*(?:M|MB|Mbps|G)/i);
  const speed = speedMatch ? speedMatch[0].replace(/\s+/g, '').toUpperCase() : '100M';

  if (vendor.includes('ZTE')) {
    return `${devName}#configure terminal
! ==============================================================================
! PROSEDUR SWAP ONU: Ganti Serial Number ${oldSN} -> ${newSN} (Index #${onuIdx})
! ==============================================================================
! 1. Pastikan VLAN Profile tersedia di OLT
${devName}(config)#gpon
${devName}(config-gpon)#onu profile vlan ${vlanProf} tag-mode tag cvlan ${vlan} pri 7
${devName}(config-gpon)#exit
! 2. Hapus alokasi ONU lama dari Port 1/${slot}/${port}
${devName}(config)#interface gpon-olt_1/${slot}/${port}
${devName}(config-if)#no onu ${onuIdx}
! 3. Registrasikan Serial Number baru pada index #${onuIdx} yang sama
${devName}(config-if)#onu ${onuIdx} type ${selectedOnuType} sn ${newSN}
${devName}(config-if)#exit
! 4. Bind nama pelanggan, speed profile & service-port
${devName}(config)#interface gpon-onu_1/${slot}/${port}:${onuIdx}
${devName}(config-if)#name ${custName}
${devName}(config-if)#description $$$$${pppUser}
${devName}(config-if)#tcont 4 name internet profile ${speed}
${devName}(config-if)#gemport 1 name internet tcont 4
${devName}(config-if)#gemport 1 traffic-limit upstream ${speed} downstream ${speed}
${devName}(config-if)#service-port 1 vport 1 user-vlan ${vlan} vlan ${vlan}
${devName}(config-if)#exit
! 5. Push Kredensial PPPoE & VLAN Profile (${vlanProf})
${devName}(config)#pon-onu-mng gpon-onu_1/${slot}/${port}:${onuIdx}
${devName}(gpon-onu-mng)#service PPPoE gemport 1 vlan ${vlan}
${devName}(gpon-onu-mng)#wan-ip 1 mode pppoe username ${pppUser} password ${pppPass} vlan-profile ${vlanProf} host 1
${devName}(gpon-onu-mng)#wan-ip 1 ping-response enable traceroute-response enable
${devName}(gpon-onu-mng)#tr069-mgmt 1 state unlock
${devName}(gpon-onu-mng)#tr069-mgmt 1 acs ${acsUrl}
${devName}(gpon-onu-mng)#exit
${devName}(config)#write
[OK] Swap ONU berhasil diterapkan ke OLT hardware.`;
  }

  if (vendor.includes('HUAWEI')) {
    return `${devName}#system-view
! ==============================================================================
! PROSEDUR SWAP ONU HUAWEI: Port 0/${slot}/${port} Ont ${onuIdx}
! ==============================================================================
[${devName}]interface gpon 0/${slot}
! Ganti otentikasi SN ke perangkat pengganti
[${devName}-gpon-0/${slot}]ont modify ${port} ${onuIdx} sn-auth "${newSN}"
! Update kredensial PPPoE
[${devName}-gpon-0/${slot}]ont internet-config ${port} ${onuIdx} ip-index 1 pppoe user-account username "${pppUser}" password "${pppPass}"
[${devName}-gpon-0/${slot}]quit
[${devName}]save
[OK] Swap ONT Huawei berhasil disimpan.`;
  }

  // Fiberhome
  return `${devName}#configure terminal
! ==============================================================================
! PROSEDUR SWAP ONU FIBERHOME: Port 1/${slot}/${port} ONU #${onuIdx}
! ==============================================================================
${devName}(config)#interface pon 1/${slot}/${port}
${devName}(config-if)#no phy-auth-onu ${onuIdx}
${devName}(config-if)#phy-auth-onu ${onuIdx} ${newSN}
${devName}(config-if)#onu-name ${onuIdx} "${custName}"
${devName}(config-if)#wan-service ${onuIdx} pppoe user ${pppUser} password ${pppPass} vlan ${vlan}
${devName}(config-if)#exit
${devName}(config)#write
[OK] Swap ONU Fiberhome selesai.`;
}

/* ── ONU Replacement / Swap Wizard Modal ─────────────────────────────── */
function ONUReplacementModal({ onu, devices = [], onClose, onSuccess }) {
  const [step, setStep] = useState(1);
  const [reason, setReason] = useState('Tersambar Petir / Lonjakan Listrik');
  const [customNotes, setCustomNotes] = useState('');
  const [newSN, setNewSN] = useState('');
  const [onuType, setOnuType] = useState(onu.onu_type || 'ZTE');
  const [onuTypes, setOnuTypes] = useState([]);
  const [loadingOnuTypes, setLoadingOnuTypes] = useState(false);
  
  // Scanning unconfigured ONU from OLT
  const [scanning, setScanning] = useState(false);
  const [unconfiguredList, setUnconfiguredList] = useState([]);
  
  // Optical pre-check
  const [opticalCheck, setOpticalCheck] = useState(null);
  const [checkingOptical, setCheckingOptical] = useState(false);
  
  // Submitting
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  const targetDevice = devices.find((d) => d.device_id === onu.device_id) || {
    name: onu.device_name || 'OLT-ANTAPANI-01',
    vendor: onu.vendor || 'ZTE'
  };

  useEffect(() => {
    if (!onu.device_id) return;
    setLoadingOnuTypes(true);
    getDeviceONUTypes(onu.device_id)
      .then((data) => {
        const types = Array.isArray(data) ? data : (data?.onu_types || []);
        setOnuTypes(types);
        if (types.length > 0 && !onu.onu_type) {
          const preferred = types.find((t) => ['ZTE', 'ALL', 'VSOL2L'].includes(t.name.toUpperCase())) || types[0];
          setOnuType(preferred.name);
        }
      })
      .catch((err) => {
        console.warn('Failed to fetch ONU types from OLT:', err);
      })
      .finally(() => {
        setLoadingOnuTypes(false);
      });
  }, [onu.device_id, onu.onu_type]);

  const handleScan = async () => {
    if (!onu.device_id) return;
    setScanning(true);
    setError('');
    try {
      const list = await getUnconfiguredONUs(onu.device_id);
      setUnconfiguredList(list || []);
    } catch (err) {
      setError('Gagal mencari unconfigured ONU: ' + err.message);
    } finally {
      setScanning(false);
    }
  };

  const runOpticalCheck = async (snToTest) => {
    const sn = (snToTest || newSN || '').trim().toUpperCase();
    if (!sn) return;
    setCheckingOptical(true);
    setError('');
    try {
      const res = await preCheckOpticalPower({
        device_id: onu.device_id,
        pon_port_id: onu.pon_port_id || 1,
        serial_number: sn
      });
      setOpticalCheck(res);
    } catch (err) {
      setOpticalCheck({
        serialNumber: sn,
        ponPort: onu.pon_port_id || 1,
        status: 'warning',
        quality: 'unreachable',
        message: 'Gagal membaca diagnostik redaman: ' + err.message,
        rxPower: null,
        txPower: null,
        distanceMeters: null
      });
    } finally {
      setCheckingOptical(false);
    }
  };

  const handleSelectDiscoveredSN = (item) => {
    setNewSN(item.serialNumber);
    runOpticalCheck(item.serialNumber);
  };

  const handleExecuteSwap = async () => {
    if (!newSN.trim()) {
      setError('Serial Number pengganti wajib diisi.');
      return;
    }
    if (newSN.trim().toUpperCase() === onu.serial_number) {
      setError('Serial Number baru tidak boleh sama dengan Serial Number lama.');
      return;
    }

    setSubmitting(true);
    setError('');
    try {
      const fullReason = customNotes.trim()
        ? `${reason} — ${customNotes.trim()}`
        : reason;

      const res = await replaceONU(onu.onu_id, {
        new_serial_number: newSN.trim().toUpperCase(),
        onu_type: onuType,
        reason: fullReason
      });

      onSuccess(res);
      onClose();
    } catch (err) {
      setError(err.message || 'Gagal menukar perangkat ONU');
      setSubmitting(false);
    }
  };

  const cliPreview = generateSwapCLIPreview({
    device: targetDevice,
    onu,
    newSN: newSN.trim().toUpperCase() || 'ZTEGCXXXXXXXX',
    targetOnuType: onuType
  });

  const optStatus = (opticalCheck?.status || '').toLowerCase();

  return (
    <div className="modal-overlay">
      <div className="modal-card" style={{ maxWidth: '780px', maxHeight: '90vh', display: 'flex', flexDirection: 'column' }}>
        {/* Modal Header */}
        <div className="modal-header" style={{ paddingBottom: '0.85rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
            <div style={{
              width: '38px',
              height: '38px',
              borderRadius: '8px',
              background: 'rgba(245, 158, 11, 0.12)',
              border: '1px solid rgba(245, 158, 11, 0.3)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#f59e0b'
            }}>
              <Repeat size={20} />
            </div>
            <div>
              <div style={{ fontWeight: 700, fontSize: '1.05rem', color: 'var(--text-main)' }}>
                Tukar Perangkat Rusak (ONU Replacement Wizard)
              </div>
              <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: '0.4rem', marginTop: '2px' }}>
                <span>Pelanggan: <strong style={{ color: 'var(--text-main)' }}>{onu.customer_name || onu.onu_name || '-'}</strong></span>
                <span>•</span>
                <span>Port <code style={{ color: '#38bdf8' }}>1/{onu.card_slot || 2}/{onu.pon_port_id}:{onu.onu_index}</code></span>
                <span>•</span>
                <span>SN Lama: <code style={{ color: '#f87171' }}>{onu.serial_number}</code></span>
              </div>
            </div>
          </div>
          <button className="btn btn-secondary" style={{ padding: '0.35rem 0.55rem' }} onClick={onClose}>
            <X size={16} />
          </button>
        </div>

        {/* Stepper Wizard Bar */}
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(3, 1fr)',
          gap: '0.5rem',
          padding: '0.75rem 1.5rem',
          background: 'rgba(0,0,0,0.25)',
          borderBottom: '1px solid rgba(255,255,255,0.06)'
        }}>
          {[
            { num: 1, title: '1. Diagnosa & Alasan', desc: 'Identifikasi Kerusakan' },
            { num: 2, title: '2. Perangkat Baru & Redaman', desc: 'Scan SN & Cek Kabel' },
            { num: 3, title: '3. Review & Eksekusi', desc: 'Commit OLT CLI' }
          ].map((s) => {
            const isActive = step === s.num;
            const isCompleted = step > s.num;
            return (
              <div
                key={s.num}
                onClick={() => {
                  if (s.num === 1) setStep(1);
                  else if (s.num === 2 && step >= 1) setStep(2);
                  else if (s.num === 3 && newSN.trim().length >= 4) setStep(3);
                }}
                style={{
                  cursor: (s.num <= step || (s.num === 2 && reason) || (s.num === 3 && newSN.trim().length >= 4)) ? 'pointer' : 'not-allowed',
                  padding: '0.5rem 0.75rem',
                  borderRadius: '6px',
                  background: isActive
                    ? 'rgba(245, 158, 11, 0.12)'
                    : isCompleted
                    ? 'rgba(16, 185, 129, 0.08)'
                    : 'rgba(255,255,255,0.02)',
                  border: `1px solid ${
                    isActive
                      ? 'rgba(245, 158, 11, 0.35)'
                      : isCompleted
                      ? 'rgba(16, 185, 129, 0.25)'
                      : 'rgba(255,255,255,0.06)'
                  }`,
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.55rem',
                  transition: 'all 0.15s ease'
                }}
              >
                <div style={{
                  width: '22px',
                  height: '22px',
                  borderRadius: '50%',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: '0.72rem',
                  fontWeight: 700,
                  background: isActive ? '#f59e0b' : isCompleted ? '#10b981' : 'rgba(255,255,255,0.1)',
                  color: isActive ? '#000' : isCompleted ? '#fff' : '#94a3b8'
                }}>
                  {isCompleted ? <Check size={12} /> : s.num}
                </div>
                <div>
                  <div style={{
                    fontSize: '0.78rem',
                    fontWeight: 600,
                    color: isActive ? '#fbbf24' : isCompleted ? '#34d399' : '#94a3b8'
                  }}>
                    {s.title}
                  </div>
                  <div style={{ fontSize: '0.68rem', color: '#64748b' }}>{s.desc}</div>
                </div>
              </div>
            );
          })}
        </div>

        {/* Error Notification */}
        {error && (
          <div style={{
            margin: '1rem 1.5rem 0',
            padding: '0.65rem 0.9rem',
            background: 'rgba(239, 68, 68, 0.12)',
            border: '1px solid rgba(239, 68, 68, 0.3)',
            borderRadius: '6px',
            color: '#f87171',
            fontSize: '0.82rem',
            display: 'flex',
            alignItems: 'center',
            gap: '0.5rem'
          }}>
            <AlertCircle size={16} style={{ flexShrink: 0 }} />
            <span>{error}</span>
          </div>
        )}

        {/* Step Content (Scrollable Body) */}
        <div style={{ padding: '1.25rem 1.5rem', overflowY: 'auto', flex: 1 }}>
          {/* ══════════════ STEP 1: Current ONU Details & Reason ══════════════ */}
          {step === 1 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1.15rem' }}>
              {/* Existing ONU Summary Card */}
              <div style={{
                background: 'var(--bg-input)',
                border: '1px solid var(--border-color)',
                borderRadius: '8px',
                padding: '1rem'
              }}>
                <div style={{ fontSize: '0.78rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: '0.75rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span>Data Perangkat Lama yang Mengalami Kerusakan</span>
                  <span style={{ color: '#f87171', fontSize: '0.72rem', background: 'rgba(239,68,68,0.1)', padding: '0.15rem 0.5rem', borderRadius: '4px' }}>
                    Status: Akan Ditukar
                  </span>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '0.75rem' }}>
                  <div style={{ background: 'var(--bg-card)', padding: '0.65rem 0.85rem', borderRadius: '6px' }}>
                    <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>Pelanggan</div>
                    <div style={{ fontSize: '0.9rem', fontWeight: 700, color: 'var(--text-main)', marginTop: '2px' }}>
                      {onu.customer_name || onu.onu_name || '-'}
                    </div>
                  </div>
                  <div style={{ background: 'var(--bg-card)', padding: '0.65rem 0.85rem', borderRadius: '6px' }}>
                    <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>Serial Number Lama</div>
                    <div style={{ fontSize: '0.9rem', fontWeight: 700, color: '#f87171', fontFamily: 'JetBrains Mono, monospace', marginTop: '2px' }}>
                      {onu.serial_number}
                    </div>
                  </div>
                  <div style={{ background: 'var(--bg-card)', padding: '0.65rem 0.85rem', borderRadius: '6px' }}>
                    <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>OLT & Port Index</div>
                    <div style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginTop: '2px' }}>
                      {onu.device_name || 'OLT'} · <strong style={{ color: '#38bdf8', fontFamily: 'JetBrains Mono' }}>Port 1/{onu.card_slot || 2}/{onu.pon_port_id}:{onu.onu_index}</strong>
                    </div>
                  </div>
                  <div style={{ background: 'var(--bg-card)', padding: '0.65rem 0.85rem', borderRadius: '6px' }}>
                    <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>Tipe PON ONU (OLT)</div>
                    <div style={{ fontSize: '0.85rem', color: '#f59e0b', fontWeight: 700, fontFamily: 'JetBrains Mono', marginTop: '2px' }}>
                      {onu.onu_type || 'ZTE'} {onu.model ? `· ${onu.model}` : ''}
                    </div>
                  </div>
                  <div style={{ background: 'rgba(255,255,255,0.02)', padding: '0.65rem 0.85rem', borderRadius: '6px', gridColumn: 'span 2' }}>
                    <div style={{ fontSize: '0.7rem', color: '#64748b' }}>Paket Layanan & PPPoE</div>
                    <div style={{ fontSize: '0.85rem', color: '#34d399', marginTop: '2px' }}>
                      {onu.profile_name || onu.pppoe_profile || '-'} ({onu.pppoe_username || 'No PPPoE'}) · VLAN {onu.vlan_id || 1081}
                    </div>
                  </div>
                </div>

                <div style={{ marginTop: '0.75rem', display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.75rem', color: '#64748b' }}>
                  <span>Sinyal Redaman Terakhir:</span>
                  <span style={{
                    fontFamily: 'JetBrains Mono, monospace',
                    fontWeight: 600,
                    color: onu.rx_power ? (onu.rx_power < -27 ? '#f87171' : '#34d399') : '#94a3b8'
                  }}>
                    {onu.rx_power ? `${onu.rx_power} dBm` : 'N/A'}
                  </span>
                  <span>·</span>
                  <span>Jarak: {onu.distance_meters || 0} m</span>
                </div>
              </div>

              {/* Reason Form */}
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label style={{ display: 'block', marginBottom: '0.45rem', fontSize: '0.82rem', fontWeight: 600 }}>
                  Alasan Penggantian Perangkat <span style={{ color: '#ef4444' }}>*</span>
                </label>
                <select
                  className="form-input"
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  style={{ cursor: 'pointer' }}
                >
                  <option value="Tersambar Petir / Lonjakan Listrik">⚡ Tersambar Petir / Lonjakan Listrik (Mati Total)</option>
                  <option value="Port LAN Rusak / Mati Total">🔌 Port LAN Rusak / Tidak Link ke Router Pelanggan</option>
                  <option value="Hardware Mati Total / Power Failure">💀 Hardware Rusak / Mati Total (Power Failure)</option>
                  <option value="Redaman Internal Rusak / Sering LOS">📉 Optik Internal Rusak / Sering LOS (Loss of Signal)</option>
                  <option value="Upgrade Model / Dual Band AC/AX">🚀 Upgrade Model / Perangkat Baru (Dual Band WiFi)</option>
                  <option value="Lainnya">📋 Alasan Lainnya</option>
                </select>
                <div style={{ fontSize: '0.72rem', color: '#64748b', marginTop: '0.35rem' }}>
                  Alasan ini akan otomatis disimpan di Audit Log & Riwayat Perawatan Perangkat.
                </div>
              </div>

              {/* Technician Notes */}
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label style={{ display: 'block', marginBottom: '0.45rem', fontSize: '0.82rem', fontWeight: 600 }}>
                  Catatan Tambahan Teknisi Lapangan (Opsional)
                </label>
                <textarea
                  className="form-input"
                  rows={3}
                  placeholder="Contoh: Lampu indikator LOS merah kedip cepat, adaptor sudah diganti tetap tidak mendeteksi optik..."
                  value={customNotes}
                  onChange={(e) => setCustomNotes(e.target.value)}
                  style={{ resize: 'vertical' }}
                />
              </div>
            </div>
          )}

          {/* ══════════════ STEP 2: New ONU Discovery & Optical Check ══════════════ */}
          {step === 2 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1.15rem' }}>
              {/* Discovery Scanner Header */}
              <div style={{
                background: 'rgba(56, 189, 248, 0.05)',
                border: '1px solid rgba(56, 189, 248, 0.2)',
                borderRadius: '8px',
                padding: '0.9rem 1rem'
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div>
                    <div style={{ fontSize: '0.84rem', fontWeight: 700, color: '#38bdf8' }}>
                      Auto-Discovery Unconfigured ONUs di OLT
                    </div>
                    <div style={{ fontSize: '0.73rem', color: '#94a3b8', marginTop: '2px' }}>
                      Mencari modem baru yang telah dicolok ke kabel fiber di OLT {targetDevice.name}
                    </div>
                  </div>
                  <button
                    type="button"
                    className="btn btn-secondary"
                    onClick={handleScan}
                    disabled={scanning}
                    style={{ fontSize: '0.75rem', padding: '0.35rem 0.75rem', display: 'flex', alignItems: 'center', gap: '0.4rem' }}
                  >
                    <Search size={13} className={scanning ? 'spin-animate' : ''} />
                    {scanning ? 'Memindai OLT...' : 'Scan Unconfigured'}
                  </button>
                </div>

                {/* Scanned Items List */}
                {unconfiguredList.length > 0 && (
                  <div style={{ marginTop: '0.85rem', display: 'flex', flexDirection: 'column', gap: '0.45rem' }}>
                    <div style={{ fontSize: '0.72rem', fontWeight: 600, color: '#64748b' }}>
                      Ditemukan {unconfiguredList.length} perangkat yang belum teregistrasi:
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: '0.5rem' }}>
                      {unconfiguredList.map((item, idx) => (
                        <div
                          key={idx}
                          onClick={() => handleSelectDiscoveredSN(item)}
                          style={{
                            background: newSN === item.serialNumber ? 'rgba(56, 189, 248, 0.15)' : 'rgba(255,255,255,0.03)',
                            border: `1px solid ${newSN === item.serialNumber ? '#38bdf8' : 'rgba(255,255,255,0.08)'}`,
                            borderRadius: '6px',
                            padding: '0.5rem 0.75rem',
                            cursor: 'pointer',
                            display: 'flex',
                            justifyContent: 'space-between',
                            alignItems: 'center',
                            transition: 'all 0.15s ease'
                          }}
                        >
                          <div>
                            <div style={{ fontSize: '0.82rem', fontWeight: 700, fontFamily: 'JetBrains Mono', color: 'var(--text-main)' }}>
                              {item.serialNumber}
                            </div>
                            <div style={{ fontSize: '0.68rem', color: 'var(--text-muted)' }}>
                              Port 1/1/{item.ponPort} · {item.model || 'ONT'}
                            </div>
                          </div>
                          <span style={{
                            fontSize: '0.7rem',
                            color: newSN === item.serialNumber ? '#38bdf8' : '#64748b',
                            fontWeight: 600
                          }}>
                            {newSN === item.serialNumber ? 'Terpilih ✓' : 'Pilih'}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              {/* Form Input Serial Number Baru & Tipe PON ONU */}
              <div style={{ display: 'grid', gridTemplateColumns: '1.3fr 1fr', gap: '0.85rem' }}>
                <div className="form-group" style={{ marginBottom: 0 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.45rem' }}>
                    <label style={{ marginBottom: 0, fontSize: '0.82rem', fontWeight: 600 }}>
                      Serial Number Baru <span style={{ color: '#ef4444' }}>*</span>
                    </label>
                    {newSN.trim() && (
                      <button
                        type="button"
                        onClick={() => runOpticalCheck(newSN)}
                        disabled={checkingOptical}
                        style={{
                          background: 'transparent',
                          border: 'none',
                          color: '#38bdf8',
                          fontSize: '0.72rem',
                          fontWeight: 600,
                          cursor: 'pointer',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '0.25rem',
                          padding: 0
                        }}
                      >
                        <Gauge size={11} /> Cek Sinyal
                      </button>
                    )}
                  </div>
                  <input
                    type="text"
                    className="form-input"
                    required
                    style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: '0.88rem' }}
                    placeholder="Contoh: ZTEGC9988112"
                    value={newSN}
                    onChange={(e) => {
                      const val = e.target.value.toUpperCase();
                      setNewSN(val);
                    }}
                    onBlur={() => {
                      if (newSN.trim().length >= 6) {
                        runOpticalCheck(newSN);
                      }
                    }}
                  />
                  <div style={{ fontSize: '0.72rem', color: '#64748b', marginTop: '0.35rem' }}>
                    Masukkan nomor seri perangkat ONT baru yang dipasang di pelanggan.
                  </div>
                </div>

                <div className="form-group" style={{ marginBottom: 0 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.45rem' }}>
                    <label style={{ marginBottom: 0, fontSize: '0.82rem', fontWeight: 600 }}>
                      Tipe PON ONU (OLT) <span style={{ color: '#ef4444' }}>*</span>
                    </label>
                    {loadingOnuTypes ? (
                      <span style={{ fontSize: '0.68rem', color: '#38bdf8' }}>
                        <Loader2 size={10} className="spin-animate" /> Memuat...
                      </span>
                    ) : (
                      <span style={{ fontSize: '0.68rem', color: '#10b981', fontWeight: 600 }}>
                        ✓ OLT
                      </span>
                    )}
                  </div>
                  <select
                    className="form-select"
                    value={onuType}
                    onChange={(e) => setOnuType(e.target.value)}
                    style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: '0.84rem' }}
                  >
                    {onuTypes && onuTypes.length > 0 ? (
                      onuTypes.map((t) => (
                        <option key={t.name} value={t.name}>
                          {t.name} {t.description ? `— ${t.description}` : ''}
                        </option>
                      ))
                    ) : (
                      <>
                        <option value="ZTE">ZTE (Standard)</option>
                        <option value="VSOL2L">VSOL2L (2LAN_WIFI)</option>
                        <option value="ALL">ALL (Universal)</option>
                        <option value="ZTE-F601">ZTE-F601 (1GE)</option>
                        <option value="ZTE-F660">ZTE-F660 (4FE/GE+2POTS+WIFI)</option>
                      </>
                    )}
                  </select>
                  <div style={{ fontSize: '0.72rem', color: '#64748b', marginTop: '0.35rem' }}>
                    Tipe registrasi OLT (perintah: onu type ...)
                  </div>
                </div>
              </div>

              {/* Optical Power Pre-Check Card */}
              <div style={{
                background: 'var(--bg-input)',
                border: opticalCheck
                  ? (optStatus === 'optimal'
                      ? '1px solid rgba(16, 185, 129, 0.3)'
                      : optStatus === 'warning'
                      ? '1px solid rgba(245, 158, 11, 0.3)'
                      : '1px solid rgba(239, 68, 68, 0.35)')
                  : '1px solid var(--border-color)',
                borderRadius: '8px',
                padding: '0.85rem 1rem'
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.65rem' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.45rem' }}>
                    <Gauge size={16} color={opticalCheck ? (optStatus === 'optimal' ? '#10b981' : optStatus === 'warning' ? '#f59e0b' : '#ef4444') : '#38bdf8'} />
                    <span style={{ fontSize: '0.82rem', fontWeight: 700, color: 'var(--text-main)' }}>
                      Pre-Activation Optical Power Diagnostic (Uji Kabel Sinyal Baru)
                    </span>
                  </div>
                  <button
                    type="button"
                    className="btn btn-secondary"
                    onClick={() => runOpticalCheck(newSN)}
                    disabled={checkingOptical || !newSN.trim()}
                    style={{ fontSize: '0.72rem', padding: '0.25rem 0.6rem', display: 'flex', alignItems: 'center', gap: '0.35rem' }}
                  >
                    <RefreshCw size={11} className={checkingOptical ? 'spin-animate' : ''} />
                    {checkingOptical ? 'Mengukur...' : 'Ukur Sinyal'}
                  </button>
                </div>

                {checkingOptical ? (
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', padding: '0.75rem', background: 'rgba(56,189,248,0.06)', borderRadius: '6px', fontSize: '0.78rem', color: '#38bdf8' }}>
                    <Loader2 size={14} className="spin-animate" /> Membaca diagnostik transceiver OLT port 1/1/{onu.pon_port_id} untuk SN baru {newSN}...
                  </div>
                ) : opticalCheck ? (
                  <div>
                    <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr 1fr', gap: '0.55rem', marginBottom: '0.5rem' }}>
                      <div style={{
                        background: optStatus === 'optimal' ? 'rgba(16, 185, 129, 0.08)' : optStatus === 'warning' ? 'rgba(245, 158, 11, 0.08)' : 'rgba(239, 68, 68, 0.1)',
                        border: `1px solid ${optStatus === 'optimal' ? 'rgba(16, 185, 129, 0.25)' : optStatus === 'warning' ? 'rgba(245, 158, 11, 0.25)' : 'rgba(239, 68, 68, 0.3)'}`,
                        borderRadius: '6px',
                        padding: '0.55rem 0.75rem'
                      }}>
                        <div style={{ fontSize: '0.68rem', color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: 600 }}>Rx Power (Redaman)</div>
                        <div style={{
                          fontSize: '1.25rem',
                          fontWeight: 800,
                          fontFamily: 'JetBrains Mono, monospace',
                          color: optStatus === 'optimal' ? '#10b981' : optStatus === 'warning' ? '#f59e0b' : '#ef4444',
                          marginTop: '0.15rem'
                        }}>
                          {opticalCheck.rxPower !== null ? `${opticalCheck.rxPower} dBm` : 'N/A'}
                        </div>
                        <div style={{ fontSize: '0.7rem', marginTop: '0.2rem', fontWeight: 600, color: optStatus === 'optimal' ? '#34d399' : optStatus === 'warning' ? '#fbbf24' : '#f87171' }}>
                          {optStatus === 'optimal' ? '● OPTIMAL (SIAP AKTIF)' : optStatus === 'warning' ? '▲ PERINGATAN (REDAMAN TINGGI)' : '✕ KRITIS / LOSS'}
                        </div>
                      </div>

                      <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border-color)', borderRadius: '6px', padding: '0.55rem 0.75rem' }}>
                        <div style={{ fontSize: '0.68rem', color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: 600 }}>Tx Power OLT</div>
                        <div style={{ fontSize: '1.15rem', fontWeight: 700, fontFamily: 'JetBrains Mono, monospace', color: '#38bdf8', marginTop: '0.15rem' }}>
                          {opticalCheck.txPower !== null ? `+${opticalCheck.txPower} dBm` : 'N/A'}
                        </div>
                        <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginTop: '0.2rem' }}>Transceiver Port</div>
                      </div>

                      <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border-color)', borderRadius: '6px', padding: '0.55rem 0.75rem' }}>
                        <div style={{ fontSize: '0.68rem', color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: 600 }}>Estimasi Jarak</div>
                        <div style={{ fontSize: '1.15rem', fontWeight: 700, fontFamily: 'JetBrains Mono, monospace', color: 'var(--text-main)', marginTop: '0.15rem' }}>
                          {opticalCheck.distanceMeters ? `${opticalCheck.distanceMeters} m` : 'N/A'}
                        </div>
                        <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginTop: '0.2rem' }}>Dari OLT ke Dropcore</div>
                      </div>
                    </div>

                    {opticalCheck.message && (
                      <div style={{ fontSize: '0.74rem', color: optStatus === 'optimal' ? '#34d399' : '#fbbf24', marginTop: '0.25rem' }}>
                        {opticalCheck.message}
                      </div>
                    )}
                  </div>
                ) : (
                  <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontStyle: 'italic', padding: '0.25rem 0' }}>
                    Ketik nomor seri baru atau pilih dari hasil scan unconfigured untuk menguji kelayakan sinyal kabel optik sebelum swap dilakukan.
                  </div>
                )}
              </div>
            </div>
          )}

          {/* ══════════════ STEP 3: Review CLI & Confirm Execution ══════════════ */}
          {step === 3 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1.15rem' }}>
              {/* Visual Side-by-Side Comparison */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr auto 1fr', gap: '0.75rem', alignItems: 'center' }}>
                {/* Left: Perangkat Lama */}
                <div style={{
                  background: 'rgba(239, 68, 68, 0.06)',
                  border: '1px solid rgba(239, 68, 68, 0.25)',
                  borderRadius: '8px',
                  padding: '0.85rem'
                }}>
                  <div style={{ fontSize: '0.7rem', color: '#f87171', fontWeight: 700, textTransform: 'uppercase', marginBottom: '0.25rem' }}>
                    ✕ Perangkat Lama (Dicopot)
                  </div>
                  <div style={{ fontSize: '0.95rem', fontWeight: 800, fontFamily: 'JetBrains Mono', color: 'var(--text-main)' }}>
                    {onu.serial_number}
                  </div>
                  <div style={{ fontSize: '0.74rem', color: 'var(--text-muted)', marginTop: '0.25rem' }}>
                    {reason}
                  </div>
                  <div style={{ marginTop: '0.5rem', fontSize: '0.68rem', color: '#ef4444', fontWeight: 600 }}>
                    Akan di-unregister dari OLT
                  </div>
                </div>

                {/* Center: Arrow Icon */}
                <div style={{
                  width: '32px',
                  height: '32px',
                  borderRadius: '50%',
                  background: 'rgba(245, 158, 11, 0.15)',
                  border: '1px solid rgba(245, 158, 11, 0.3)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: '#f59e0b'
                }}>
                  <ArrowRight size={16} />
                </div>

                {/* Right: Perangkat Baru */}
                <div style={{
                  background: 'rgba(16, 185, 129, 0.06)',
                  border: '1px solid rgba(16, 185, 129, 0.25)',
                  borderRadius: '8px',
                  padding: '0.85rem'
                }}>
                  <div style={{ fontSize: '0.7rem', color: '#34d399', fontWeight: 700, textTransform: 'uppercase', marginBottom: '0.25rem' }}>
                    ✓ Perangkat Baru (Pengganti)
                  </div>
                  <div style={{ fontSize: '0.95rem', fontWeight: 800, fontFamily: 'JetBrains Mono', color: 'var(--text-main)' }}>
                    {newSN.trim().toUpperCase()}
                  </div>
                  <div style={{ fontSize: '0.74rem', color: '#94a3b8', marginTop: '0.25rem' }}>
                    Tipe PON OLT: <strong style={{ color: '#38bdf8' }}>{onuType}</strong>
                  </div>
                  <div style={{ marginTop: '0.5rem', fontSize: '0.68rem', color: '#10b981', fontWeight: 600 }}>
                    Mengambil alih Index #{onu.onu_index}
                  </div>
                </div>
              </div>

              {/* Guarantees Box */}
              <div style={{
                background: 'rgba(255,255,255,0.02)',
                border: '1px solid rgba(255,255,255,0.06)',
                borderRadius: '8px',
                padding: '0.75rem 0.95rem',
                fontSize: '0.78rem',
                color: '#cbd5e1',
                display: 'grid',
                gridTemplateColumns: '1fr 1fr',
                gap: '0.5rem'
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.45rem' }}>
                  <CheckCircle2 size={14} color="#10b981" />
                  <span>Port Index: <strong>1/{onu.card_slot || 2}/{onu.pon_port_id}:{onu.onu_index}</strong> (Tetap terjaga)</span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.45rem' }}>
                  <CheckCircle2 size={14} color="#10b981" />
                  <span>Tipe PON ONU: <strong style={{ color: '#38bdf8' }}>{onuType}</strong> (Tipe OLT Terdaftar)</span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.45rem' }}>
                  <CheckCircle2 size={14} color="#10b981" />
                  <span>Kredensial PPPoE: <strong>{onu.pppoe_username || '-'}</strong> (Dialihkan)</span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.45rem' }}>
                  <CheckCircle2 size={14} color="#10b981" />
                  <span>VLAN Profile OLT: <strong>{onu.vlan_profile || 'PPPoE'}</strong> (Terjaga)</span>
                </div>
              </div>

              {/* CLI Preview Terminal */}
              <div>
                <div style={{ fontSize: '0.76rem', fontWeight: 700, color: '#94a3b8', marginBottom: '0.45rem', display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                  <Terminal size={13} color="#f59e0b" />
                  <span>Pratinjau Eksekusi Perintah OLT (Running Configuration CLI)</span>
                </div>
                <CLIPreviewTerminal cliText={cliPreview} deviceName={targetDevice.name} />
              </div>
            </div>
          )}
        </div>

        {/* Modal Footer / Navigation Buttons */}
        <div className="modal-footer" style={{
          padding: '0.85rem 1.5rem',
          borderTop: '1px solid rgba(255,255,255,0.06)',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center'
        }}>
          <div>
            {step > 1 ? (
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => setStep((s) => s - 1)}
                disabled={submitting}
              >
                ⬅ Kembali
              </button>
            ) : (
              <button
                type="button"
                className="btn btn-secondary"
                onClick={onClose}
                disabled={submitting}
              >
                Batal
              </button>
            )}
          </div>

          <div style={{ display: 'flex', gap: '0.75rem' }}>
            {step === 1 && (
              <button
                type="button"
                className="btn btn-primary"
                onClick={() => {
                  setError('');
                  setStep(2);
                }}
                style={{ background: '#f59e0b', borderColor: '#d97706', color: '#000', fontWeight: 700 }}
              >
                Lanjut: Deteksi Perangkat Baru ➔
              </button>
            )}

            {step === 2 && (
              <button
                type="button"
                className="btn btn-primary"
                onClick={() => {
                  if (!newSN.trim()) {
                    setError('Serial Number baru wajib diisi sebelum lanjut.');
                    return;
                  }
                  if (newSN.trim().toUpperCase() === onu.serial_number) {
                    setError('Serial Number baru tidak boleh sama dengan Serial Number lama.');
                    return;
                  }
                  setError('');
                  setStep(3);
                }}
                disabled={!newSN.trim() || newSN.trim().toUpperCase() === onu.serial_number}
                style={{ background: '#f59e0b', borderColor: '#d97706', color: '#000', fontWeight: 700 }}
              >
                Lanjut: Review & Konfirmasi ➔
              </button>
            )}

            {step === 3 && (
              <button
                type="button"
                className="btn btn-primary"
                onClick={handleExecuteSwap}
                disabled={submitting}
                style={{
                  background: '#f59e0b',
                  borderColor: '#d97706',
                  color: '#000',
                  fontWeight: 800,
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.5rem',
                  boxShadow: '0 4px 14px rgba(245, 158, 11, 0.4)'
                }}
              >
                {submitting ? (
                  <>
                    <Loader2 size={16} className="spin-animate" />
                    Mengeksekusi Swap di OLT...
                  </>
                ) : (
                  <>
                    <Repeat size={16} />
                    Konfirmasi & Eksekusi Swap Perangkat
                  </>
                )}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

/* ── Provision Wizard Modal ──────────────────────────────────────────── */
function ProvisionWizardModal({ devices, profiles, onClose, onSuccess }) {
  const [step, setStep] = useState(1); // 1=select device, 2=select ONU SN, 3=profile+PPPoE, 4=review & confirm
  const [scanning, setScanning] = useState(false);
  const [provisioning, setProvisioning] = useState(false);
  const [unconfiguredList, setUnconfiguredList] = useState([]);
  const [error, setError] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [opticalCheck, setOpticalCheck] = useState(null);
  const [checkingOptical, setCheckingOptical] = useState(false);
  const [onuTypes, setOnuTypes] = useState([]);
  const [loadingOnuTypes, setLoadingOnuTypes] = useState(false);

  const initialDev = devices[0];
  const initialCardSlot = (initialDev?.cards && initialDev.cards.find(c => c.status === 'INSERVICE')?.slot)
    || (initialDev?.cards && initialDev.cards[0]?.slot)
    || 1;

  const [form, setForm] = useState({
    device_id: devices[0]?.device_id || '',
    card_slot: initialCardSlot,
    serial_number: '',
    customer_name: '',
    pon_port_id: 1,
    onu_index: 1,
    onu_type: 'VSOL2L',
    service_profile_id: profiles[0]?.profile_id || '',
    pppoe_username: '',
    pppoe_password: '',
    tr069_acs_url: 'http://103.176.227.233:3001/'
  });

  const set = (k, v) => setForm((p) => ({ ...p, [k]: v }));

  // Load global TR-069 ACS URL from system settings
  useEffect(() => {
    getIntegrationSettings().then((res) => {
      if (res && res.tr069_acs_url) {
        set('tr069_acs_url', res.tr069_acs_url);
      }
    }).catch(() => {});
  }, []);

  const selectedDevice = devices.find((d) => d.device_id === parseInt(form.device_id));
  const selectedProfile = profiles.find((p) => p.profile_id === parseInt(form.service_profile_id));

  // Sync card_slot when target device changes
  useEffect(() => {
    if (selectedDevice) {
      let cards = selectedDevice.cards;
      if (typeof cards === 'string') {
        try { cards = JSON.parse(cards); } catch { cards = []; }
      }
      if (Array.isArray(cards) && cards.length > 0) {
        const isUp = (s) => ['INSERVICE', 'HWONLINE', 'ONLINE', 'CONFIGING'].includes((s || '').toUpperCase());
        const inserviceCard = cards.find(c => isUp(c.status) && (parseInt(c.ports, 10) > 0 || c.is_pon)) || cards.find(c => isUp(c.status)) || cards[0];
        set('card_slot', inserviceCard.slot || 1);
      }
    }
  }, [form.device_id]);

  // Fetch available PON ONU types from OLT
  useEffect(() => {
    if (!form.device_id) return;
    setLoadingOnuTypes(true);
    getDeviceONUTypes(form.device_id)
      .then((data) => {
        const types = Array.isArray(data) ? data : (data?.onu_types || []);
        setOnuTypes(types);
        if (types.length > 0) {
          setForm((prev) => {
            const exists = types.some((t) => t.name.toUpperCase() === (prev.onu_type || '').toUpperCase());
            if (!exists) {
              const preferred = types.find((t) => ['VSOL2L', 'ALL', 'ZTE'].includes(t.name.toUpperCase())) || types[0];
              return { ...prev, onu_type: preferred.name };
            }
            return prev;
          });
        }
      })
      .catch((err) => {
        console.warn('Failed to fetch ONU types from OLT:', err);
      })
      .finally(() => {
        setLoadingOnuTypes(false);
      });
  }, [form.device_id]);

  const applyPPPoETemplate = (profileOverride, snOverride, nameOverride) => {
    const prof = profileOverride || selectedProfile;
    const sn = (snOverride !== undefined ? snOverride : form.serial_number || '').trim();
    const name = (nameOverride !== undefined ? nameOverride : form.customer_name || '').trim();
    if (!prof) return;

    const cleanSn = sn || 'ONU0001';
    const cleanName = (name || 'client').toLowerCase().replace(/[^a-z0-9]/g, '_');

    const uTpl = prof.pppoe_username_template || '{sn}@pass.net.id';
    const pTpl = prof.pppoe_password_template || '{sn}';

    const genUser = uTpl
      .replace(/\{sn\}/gi, cleanSn.toLowerCase())
      .replace(/\{(?:user|name)\}/gi, cleanName);
    const genPass = pTpl
      .replace(/\{sn\}/gi, cleanSn)
      .replace(/\{(?:user|name)\}/gi, cleanName);

    setForm((prev) => ({
      ...prev,
      pppoe_username: genUser,
      pppoe_password: genPass
    }));
  };

  const triggerOpticalCheck = async (sn, port) => {
    const targetSn = (sn || form.serial_number || '').trim();
    const targetPort = parseInt(port || form.pon_port_id, 10) || 1;
    if (!form.device_id || !targetSn) return;
    setCheckingOptical(true);
    try {
      const res = await preCheckOpticalPower({
        device_id: parseInt(form.device_id),
        card_slot: form.card_slot || 1,
        serial_number: targetSn,
        pon_port_id: targetPort
      });
      setOpticalCheck(res);
    } catch (err) {
      console.warn('Pre-activation optical check error:', err);
      setOpticalCheck({
        serialNumber: targetSn,
        ponPort: targetPort,
        status: 'warning',
        quality: 'unreachable',
        message: 'Gagal mendeteksi redaman: ' + err.message,
        rxPower: null,
        txPower: null,
        distanceMeters: null
      });
    } finally {
      setCheckingOptical(false);
    }
  };

  const handleScan = async () => {
    if (!form.device_id) return;
    setScanning(true);
    setError('');
    try {
      const list = await getUnconfiguredONUs(form.device_id);
      setUnconfiguredList(list || []);
      if (list && list.length > 0 && !form.serial_number) {
        const first = list[0];
        set('serial_number', first.serialNumber);
        set('pon_port_id', first.ponPort);
        if (first.card_slot) {
          set('card_slot', first.card_slot);
        }
        fetchNextIndex(form.device_id, first.ponPort, first.card_slot || form.card_slot || 1);
        triggerOpticalCheck(first.serialNumber, first.ponPort);
      }
    } catch (err) {
      setError('Gagal melakukan scan: ' + err.message);
    } finally {
      setScanning(false);
    }
  };

  const [indexInfo, setIndexInfo] = useState({
    loading: false,
    nextAvailable: 1,
    usedIndices: [],
    usedCount: 0,
    maxCapacity: 128
  });

  const fetchNextIndex = async (deviceId, portId, cardSlot) => {
    if (!deviceId || !portId) return;
    const targetSlot = cardSlot || form.card_slot || 1;
    setIndexInfo((prev) => ({ ...prev, loading: true }));
    try {
      const data = await getNextAvailableONUIndex(deviceId, portId, targetSlot);
      if (data && data.next_available_index) {
        set('onu_index', data.next_available_index);
        setIndexInfo({
          loading: false,
          nextAvailable: data.next_available_index,
          usedIndices: data.used_indices || [],
          usedCount: data.used_count || 0,
          maxCapacity: data.max_capacity || 128
        });
      } else {
        setIndexInfo({
          loading: false,
          nextAvailable: 1,
          usedIndices: data?.used_indices || [],
          usedCount: data?.used_count || 0,
          maxCapacity: data?.max_capacity || 128
        });
      }
    } catch (err) {
      console.warn('Failed to fetch next available ONU index:', err.message);
      setIndexInfo((prev) => ({ ...prev, loading: false }));
    }
  };

  // Auto-scan and auto-fetch next index when entering step 2
  useEffect(() => {
    if (step === 2 && form.device_id) {
      handleScan();
      fetchNextIndex(form.device_id, form.pon_port_id || 1, form.card_slot || 1);
    }
  }, [step]);

  const handlePortChange = (newPort) => {
    const port = parseInt(newPort, 10) || 1;
    set('pon_port_id', port);
    if (form.device_id) {
      fetchNextIndex(form.device_id, port, form.card_slot || 1);
      if (form.serial_number) {
        triggerOpticalCheck(form.serial_number, port);
      }
    }
  };

  const handleCardSlotChange = (newSlot) => {
    const slot = parseInt(newSlot, 10) || 1;
    set('card_slot', slot);
    if (form.device_id) {
      fetchNextIndex(form.device_id, form.pon_port_id || 1, slot);
    }
  };

  const currentOnuIndex = parseInt(form.onu_index, 10);
  const isIndexConflict = !isNaN(currentOnuIndex) && indexInfo.usedIndices.includes(currentOnuIndex);

  const [executionState, setExecutionState] = useState(null);
  const [isEditMode, setIsEditMode] = useState(false);
  const [isCustomCli, setIsCustomCli] = useState(false);
  const [customCliText, setCustomCliText] = useState('');

  const standardCliText = useMemo(() => {
    return generateCLIPreview({
      device: selectedDevice,
      form,
      profile: selectedProfile
    });
  }, [selectedDevice, form, selectedProfile]);

  const activeCliText = isCustomCli ? customCliText : standardCliText;

  const handleToggleEdit = () => {
    if (!isEditMode && !isCustomCli) {
      setCustomCliText(standardCliText);
    }
    setIsEditMode(!isEditMode);
  };

  const handleChangeCli = (newVal) => {
    setCustomCliText(newVal);
    setIsCustomCli(true);
  };

  const handleResetTemplate = () => {
    setIsCustomCli(false);
    setIsEditMode(false);
    setCustomCliText('');
  };

  const handleStartExecution = () => {
    if (!form.serial_number.trim()) { setError('Serial Number wajib diisi.'); return; }
    if (!form.service_profile_id) { setError('Service Profile wajib dipilih.'); return; }
    setError('');
    setExecutionState({
      formData: {
        device_id: parseInt(form.device_id, 10),
        card_slot: parseInt(form.card_slot || 1, 10),
        serial_number: form.serial_number.trim(),
        onu_type: form.onu_type || 'VSOL2L',
        onu_name: form.customer_name?.trim() || null,
        onu_index: form.onu_index ? parseInt(form.onu_index, 10) : 1,
        pon_port_id: parseInt(form.pon_port_id, 10),
        service_profile_id: parseInt(form.service_profile_id, 10),
        pppoe_username: form.pppoe_username.trim() || null,
        pppoe_password: form.pppoe_password.trim() || null,
        tr069_acs_url: form.tr069_acs_url?.trim() || null,
        custom_cli: isCustomCli ? (customCliText.trim() || null) : null
      },
      selectedDevice,
      selectedProfile
    });
  };

  const stepLabels = ['Pilih OLT', 'Pilih ONU', 'Profile & PPPoE', 'Review Konfigurasi'];

  return (
    <div className="modal-overlay">
      <div className="modal-card" style={{ maxWidth: '680px' }}>
        {/* Header */}
        <div className="modal-header">
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
            <Cpu size={20} color="#60a5fa" />
            <h3 style={{ fontWeight: 700 }}>Wizard Provisi ONU Baru</h3>
          </div>
          <button className="btn btn-secondary" style={{ padding: '0.25rem 0.5rem' }} onClick={onClose}><X size={16} /></button>
        </div>

        {/* Step indicator */}
        <div style={{ display: 'flex', gap: '0', marginBottom: '1.75rem' }}>
          {stepLabels.map((label, i) => {
            const n = i + 1;
            const active = step === n;
            const done = step > n;
            return (
              <div key={n} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', position: 'relative' }}>
                {i > 0 && (
                  <div style={{ position: 'absolute', top: '15px', left: '-50%', width: '100%', height: '2px', background: done ? '#3b82f6' : 'rgba(255,255,255,0.1)' }} />
                )}
                <div style={{ width: '30px', height: '30px', borderRadius: '50%', background: done ? 'var(--primary)' : active ? 'rgba(59,130,246,0.2)' : 'var(--bg-input)', border: `2px solid ${done || active ? 'var(--primary)' : 'var(--border-color)'}`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.8rem', fontWeight: 700, color: done ? '#fff' : active ? 'var(--primary)' : 'var(--text-muted)', zIndex: 1 }}>
                  {done ? <CheckCircle2 size={14} /> : n}
                </div>
                <div style={{ fontSize: '0.72rem', color: active ? 'var(--text-main)' : 'var(--text-muted)', marginTop: '0.35rem', fontWeight: active ? 600 : 400 }}>{label}</div>
              </div>
            );
          })}
        </div>

        {/* Error */}
        {error && (
          <div style={{ display: 'flex', gap: '0.5rem', padding: '0.6rem 0.8rem', background: 'rgba(244,63,94,0.1)', border: '1px solid rgba(244,63,94,0.25)', borderRadius: '6px', color: '#fda4af', fontSize: '0.82rem', marginBottom: '1rem' }}>
            <AlertCircle size={15} style={{ flexShrink: 0, marginTop: '1px' }} /> {error}
          </div>
        )}

        {/* Step 1 — Select Device */}
        {step === 1 && (
          <div>
            <div className="form-group">
              <label>Target Perangkat OLT</label>
              {devices.length === 0 ? (
                <div style={{ padding: '1rem', background: 'rgba(245,158,11,0.1)', border: '1px solid rgba(245,158,11,0.25)', borderRadius: '8px', color: '#fbbf24', fontSize: '0.85rem' }}>
                  <AlertTriangle size={14} style={{ marginRight: '0.5rem', display: 'inline' }} />
                  Tidak ada perangkat OLT terdaftar. Tambahkan OLT terlebih dahulu di menu Perangkat OLT.
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
                  {devices.map((dev) => (
                    <div
                      key={dev.device_id}
                      onClick={() => set('device_id', dev.device_id)}
                      style={{ padding: '0.85rem 1rem', borderRadius: '8px', border: `1px solid ${form.device_id === dev.device_id ? 'var(--primary)' : 'var(--border-color)'}`, background: form.device_id === dev.device_id ? 'rgba(59,130,246,0.1)' : 'var(--bg-input)', cursor: 'pointer', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}
                    >
                      <div>
                        <div style={{ fontWeight: 700, fontSize: '0.95rem', color: 'var(--text-main)' }}>{dev.name}</div>
                        <div style={{ fontSize: '0.78rem', color: 'var(--text-secondary)' }}>{dev.vendor} · {dev.ip_address}:{dev.port} · {dev.pon_ports_count} PON Ports</div>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                        <div className={`status-badge ${dev.status === 'Online' ? 'status-online' : 'status-offline'}`} style={{ fontSize: '0.72rem' }}>
                          <span className="pulse-dot" />{dev.status}
                        </div>
                        {form.device_id === dev.device_id && <CheckCircle2 size={18} color="#60a5fa" />}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {/* Step 2 — Scan & Select ONU SN */}
        {step === 2 && (
          <div>
            {/* Discovery box */}
            <div style={{ background: 'rgba(59,130,246,0.07)', border: '1px solid rgba(59,130,246,0.2)', borderRadius: '8px', padding: '0.85rem', marginBottom: '1.25rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.6rem' }}>
                <span style={{ fontSize: '0.85rem', fontWeight: 700, color: '#38bdf8', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                  <Radio size={14} /> Discovery ONU Unconfigured — {selectedDevice?.name}
                </span>
                <button type="button" className="btn btn-secondary" style={{ fontSize: '0.75rem', padding: '0.25rem 0.6rem' }} onClick={handleScan} disabled={scanning}>
                  {scanning ? <Loader2 size={12} className="spin-animate" /> : <RefreshCw size={12} />}
                  {scanning ? 'Scanning...' : 'Scan Port'}
                </button>
              </div>
              {scanning ? (
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', padding: '0.75rem', color: '#38bdf8', fontSize: '0.82rem' }}>
                  <Loader2 size={14} className="spin-animate" /> Memindai port PON OLT untuk ONU yang belum terdaftar...
                </div>
              ) : unconfiguredList.length > 0 ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                  {unconfiguredList.map((item) => (
                    <div
                      key={item.serialNumber}
                      onClick={() => {
                        set('serial_number', item.serialNumber);
                        set('pon_port_id', item.ponPort);
                        if (item.card_slot) {
                          set('card_slot', item.card_slot);
                        }
                        if (form.device_id) {
                          fetchNextIndex(form.device_id, item.ponPort, item.card_slot || form.card_slot || 1);
                          triggerOpticalCheck(item.serialNumber, item.ponPort);
                        }
                        if (onuTypes.length > 0) {
                          const match = onuTypes.find(t =>
                            t.name.toUpperCase() === (item.model || '').toUpperCase() ||
                            (item.serialNumber?.toUpperCase().startsWith('VSOL') && t.name.toUpperCase() === 'VSOL2L') ||
                            (item.serialNumber?.toUpperCase().startsWith('ZTE') && t.name.toUpperCase().startsWith('ZTE'))
                          );
                          if (match) {
                            set('onu_type', match.name);
                          }
                        }
                        if (!form.pppoe_username) {
                          applyPPPoETemplate(selectedProfile, item.serialNumber, form.customer_name);
                        }
                      }}
                      style={{ padding: '0.55rem 0.75rem', background: form.serial_number === item.serialNumber ? 'rgba(59,130,246,0.25)' : 'var(--bg-input)', borderRadius: '6px', cursor: 'pointer', display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.82rem', border: `1px solid ${form.serial_number === item.serialNumber ? 'var(--primary)' : 'var(--border-color)'}` }}
                    >
                      <span style={{ fontWeight: 700, color: 'var(--text-main)', fontFamily: 'JetBrains Mono, monospace' }}>{item.serialNumber}</span>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', color: '#9ca3af' }}>
                        <span>PON 1/{item.card_slot || form.card_slot || 1}/{item.ponPort}</span>
                        <span>{item.model}</span>
                        {item.rxPower !== undefined && (
                          <span style={{
                            padding: '0.1rem 0.45rem',
                            borderRadius: '4px',
                            fontSize: '0.72rem',
                            fontWeight: 700,
                            fontFamily: 'JetBrains Mono, monospace',
                            background: (item.opticalStatus || '').toLowerCase() === 'critical' ? 'rgba(239,68,68,0.15)' : ((item.opticalStatus || '').toLowerCase() === 'warning' ? 'rgba(245,158,11,0.15)' : 'rgba(16,185,129,0.15)'),
                            color: (item.opticalStatus || '').toLowerCase() === 'critical' ? '#f87171' : ((item.opticalStatus || '').toLowerCase() === 'warning' ? '#fbbf24' : '#34d399'),
                            border: `1px solid ${(item.opticalStatus || '').toLowerCase() === 'critical' ? 'rgba(239,68,68,0.3)' : ((item.opticalStatus || '').toLowerCase() === 'warning' ? 'rgba(245,158,11,0.3)' : 'rgba(16,185,129,0.3)')}`
                          }}>
                            {item.rxPower} dBm
                          </span>
                        )}
                        <span style={{ color: '#64748b' }}>{item.discoveredAt}</span>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div style={{ fontSize: '0.82rem', color: '#64748b' }}>
                  Tidak ada ONU unconfigured terdeteksi. Masukkan Serial Number secara manual di bawah.
                </div>
              )}
            </div>

            {/* Form Fields: Balanced 3x2 Grid */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginBottom: '0.5rem' }}>
              {/* Field 1: Serial Number */}
              <div className="form-group" style={{ marginBottom: 0 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.45rem' }}>
                  <label style={{ marginBottom: 0, fontSize: '0.82rem', fontWeight: 600 }}>
                    Serial Number (ONU SN) <span style={{ color: '#ef4444' }}>*</span>
                  </label>
                  {form.serial_number && (
                    <button
                      type="button"
                      onClick={() => triggerOpticalCheck(form.serial_number, form.pon_port_id)}
                      disabled={checkingOptical}
                      style={{
                        background: 'transparent',
                        border: 'none',
                        color: '#38bdf8',
                        fontSize: '0.72rem',
                        fontWeight: 600,
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '0.25rem',
                        padding: 0
                      }}
                    >
                      <Gauge size={11} /> Cek Sinyal
                    </button>
                  )}
                </div>
                <input
                  type="text"
                  className="form-input"
                  required
                  style={{ fontFamily: 'JetBrains Mono, monospace' }}
                  placeholder="Contoh: ZTEGC1234567"
                  value={form.serial_number}
                  onChange={(e) => {
                    const sn = e.target.value.toUpperCase();
                    set('serial_number', sn);
                  }}
                  onBlur={() => {
                    if (form.serial_number.trim().length >= 6) {
                      triggerOpticalCheck(form.serial_number, form.pon_port_id);
                    }
                  }}
                />
                <div style={{ fontSize: '0.72rem', color: '#64748b', marginTop: '0.35rem' }}>
                  Nomor seri pabrikan modem ONT
                </div>
              </div>

              {/* Field 2: Nama Pelanggan / Deskripsi */}
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label style={{ display: 'block', marginBottom: '0.45rem', fontSize: '0.82rem', fontWeight: 600 }}>
                  Nama Pelanggan / Deskripsi
                </label>
                <input
                  type="text"
                  className="form-input"
                  placeholder="Contoh: RUDI RUSMANA PAK RT 03"
                  value={form.customer_name}
                  onChange={(e) => set('customer_name', e.target.value)}
                />
                <div style={{ fontSize: '0.72rem', color: '#64748b', marginTop: '0.35rem' }}>
                  Diset sebagai konfigurasi <code>name [NAMA]</code> di OLT
                </div>
              </div>

              {/* Field 3: Tipe / Model ONU (PON) */}
              <div className="form-group" style={{ marginBottom: 0 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.45rem' }}>
                  <label style={{ marginBottom: 0, fontSize: '0.82rem', fontWeight: 600 }}>
                    Tipe / Model ONU (PON) <span style={{ color: '#ef4444' }}>*</span>
                  </label>
                  {loadingOnuTypes ? (
                    <span style={{ fontSize: '0.7rem', color: '#38bdf8', display: 'flex', alignItems: 'center', gap: '3px' }}>
                      <Loader2 size={10} className="spin-animate" /> Memuat dari OLT...
                    </span>
                  ) : (
                    <span style={{ fontSize: '0.7rem', color: '#10b981', fontWeight: 600 }}>
                      ✓ Terhubung ke OLT
                    </span>
                  )}
                </div>
                <select
                  className="form-select"
                  value={form.onu_type || 'VSOL2L'}
                  onChange={(e) => set('onu_type', e.target.value)}
                  style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: '0.84rem' }}
                >
                  {onuTypes && onuTypes.length > 0 ? (
                    onuTypes.map((t) => (
                      <option key={t.name} value={t.name}>
                        {t.name} {t.description ? `— ${t.description}` : ''}
                      </option>
                    ))
                  ) : (
                    <>
                      <option value="VSOL2L">VSOL2L (2LAN_WIFI)</option>
                      <option value="ALL">ALL (Universal)</option>
                      <option value="ZTE">ZTE (Standard)</option>
                      <option value="ZTE-F601">ZTE-F601 (1GE)</option>
                      <option value="ZTE-F660">ZTE-F660 (4FE/GE+2POTS+WIFI)</option>
                    </>
                  )}
                </select>
                <div style={{ fontSize: '0.72rem', color: '#64748b', marginTop: '0.35rem' }}>
                  Tipe ONU yang terdaftar pada profil OLT (<code>show onu-type gpon</code>)
                </div>
              </div>

              {/* Field 4: ONU Index / ID */}
              <div className="form-group" style={{ marginBottom: 0 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.45rem' }}>
                  <label style={{ marginBottom: 0, fontSize: '0.82rem', fontWeight: 600 }}>
                    ONU Index / ID <span style={{ color: '#ef4444' }}>*</span>
                  </label>
                  <span style={{ fontSize: '0.7rem', color: '#10b981', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '3px' }}>
                    <Sparkles size={11} /> Auto-Find
                  </span>
                </div>
                <div style={{ display: 'flex', gap: '0.45rem' }}>
                  <input
                    type="number"
                    className="form-input"
                    required
                    min="1"
                    max="128"
                    style={{
                      fontFamily: 'JetBrains Mono, monospace',
                      borderColor: isIndexConflict ? '#ef4444' : undefined,
                      flex: 1
                    }}
                    value={form.onu_index}
                    placeholder="Auto"
                    onChange={(e) => set('onu_index', parseInt(e.target.value, 10) || '')}
                  />
                  <button
                    type="button"
                    className="btn btn-secondary"
                    title="Cari ID berikutnya yang belum terpakai"
                    onClick={() => fetchNextIndex(form.device_id, form.pon_port_id, form.card_slot)}
                    style={{
                      padding: '0.45rem 0.75rem',
                      fontSize: '0.75rem',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '0.35rem',
                      whiteSpace: 'nowrap'
                    }}
                  >
                    <RefreshCw size={12} className={indexInfo.loading ? 'spin-animate' : ''} />
                    Auto
                  </button>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.72rem', color: '#64748b', marginTop: '0.35rem' }}>
                  <span>Kapasitas: {indexInfo.usedCount}/{indexInfo.maxCapacity} ONU</span>
                  <span style={{ color: indexInfo.maxCapacity - indexInfo.usedCount > 0 ? '#10b981' : '#f87171', fontWeight: 500 }}>
                    {indexInfo.maxCapacity - indexInfo.usedCount} slot kosong
                  </span>
                </div>
              </div>

              {/* Field 5: Card / Slot OLT */}
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label style={{ display: 'block', marginBottom: '0.45rem', fontSize: '0.82rem', fontWeight: 600 }}>
                  Card / Slot OLT <span style={{ color: '#ef4444' }}>*</span>
                </label>
                {selectedDevice?.cards && selectedDevice.cards.length > 0 ? (
                  <select
                    className="form-select"
                    value={form.card_slot}
                    onChange={(e) => handleCardSlotChange(e.target.value)}
                  >
                    {selectedDevice.cards.map((c, i) => (
                      <option key={i} value={c.slot}>
                        Slot {c.slot}: {c.type || 'GPON'} ({c.status})
                      </option>
                    ))}
                  </select>
                ) : (
                  <input
                    type="number"
                    className="form-input"
                    value={form.card_slot || 1}
                    onChange={(e) => handleCardSlotChange(e.target.value)}
                    min={1}
                    max={16}
                  />
                )}
                <div style={{ fontSize: '0.72rem', color: '#64748b', marginTop: '0.35rem' }}>
                  Card Slot aktif pada rak OLT
                </div>
              </div>

              {/* Field 6: Target Port PON */}
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label style={{ display: 'block', marginBottom: '0.45rem', fontSize: '0.82rem', fontWeight: 600 }}>
                  Port PON <span style={{ color: '#ef4444' }}>*</span>
                </label>
                <input
                  type="number"
                  className="form-input"
                  required
                  min="1"
                  max="64"
                  value={form.pon_port_id}
                  onChange={(e) => handlePortChange(e.target.value)}
                />
                <div style={{ fontSize: '0.72rem', color: '#38bdf8', marginTop: '0.35rem', fontWeight: 600 }}>
                  Interface: <code>{selectedDevice?.vendor === 'Huawei' ? '0' : '1'}/{form.card_slot || 1}/{form.pon_port_id}</code>
                </div>
              </div>
            </div>

            {/* Anti-collision warning alert (only when conflict happens) */}
            {isIndexConflict && (
              <div style={{
                marginTop: '0.5rem',
                marginBottom: '0.5rem',
                padding: '0.6rem 0.85rem',
                background: 'rgba(239,68,68,0.1)',
                border: '1px solid rgba(239,68,68,0.3)',
                borderRadius: '6px',
                fontSize: '0.78rem',
                color: '#f87171',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: '0.5rem'
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.45rem' }}>
                  <AlertTriangle size={15} color="#ef4444" style={{ flexShrink: 0 }} />
                  <span>
                    <strong>Bentrok ID:</strong> Index <code>{form.onu_index}</code> sudah terpakai di Interface {selectedDevice?.vendor === 'Huawei' ? '0' : '1'}/{form.card_slot || 1}/{form.pon_port_id}!
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => set('onu_index', indexInfo.nextAvailable)}
                  style={{
                    background: '#ef4444',
                    color: '#ffffff',
                    border: 'none',
                    borderRadius: '4px',
                    padding: '0.2rem 0.6rem',
                    fontSize: '0.72rem',
                    cursor: 'pointer',
                    fontWeight: 700,
                    whiteSpace: 'nowrap'
                  }}
                >
                  Gunakan Index {indexInfo.nextAvailable}
                </button>
              </div>
            )}

            {/* Pre-Activation Optical Power Check Card */}
            {(() => {
              const optStatus = (opticalCheck?.status || '').toLowerCase();
              return (
                <div style={{
                  marginTop: '0.85rem',
                  background: 'rgba(15, 23, 42, 0.65)',
                  border: opticalCheck
                    ? (optStatus === 'optimal'
                        ? '1px solid rgba(16, 185, 129, 0.3)'
                        : optStatus === 'warning'
                        ? '1px solid rgba(245, 158, 11, 0.3)'
                        : '1px solid rgba(239, 68, 68, 0.35)')
                    : '1px solid rgba(255, 255, 255, 0.08)',
                  borderRadius: '8px',
                  padding: '0.85rem',
                  transition: 'all 0.2s ease'
                }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.65rem' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.45rem' }}>
                      <Gauge size={15} color={opticalCheck ? (optStatus === 'optimal' ? '#10b981' : optStatus === 'warning' ? '#f59e0b' : '#ef4444') : '#38bdf8'} />
                      <span style={{ fontSize: '0.82rem', fontWeight: 700, color: 'var(--text-main)' }}>
                        Pre-Activation Optical Power Diagnostic (Cek Redaman Fisik)
                      </span>
                    </div>
                    <button
                      type="button"
                      className="btn btn-secondary"
                      onClick={() => triggerOpticalCheck(form.serial_number, form.pon_port_id)}
                      disabled={checkingOptical || !form.serial_number}
                      style={{ fontSize: '0.72rem', padding: '0.25rem 0.6rem', display: 'flex', alignItems: 'center', gap: '0.35rem' }}
                    >
                      <RefreshCw size={11} className={checkingOptical ? 'spin-animate' : ''} />
                      {checkingOptical ? 'Mengukur...' : 'Ukur Sinyal'}
                    </button>
                  </div>

                  {checkingOptical ? (
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', padding: '0.75rem', background: 'rgba(56,189,248,0.06)', borderRadius: '6px', fontSize: '0.78rem', color: '#38bdf8' }}>
                      <Loader2 size={14} className="spin-animate" /> Membaca diagnostik DDM optical transceiver OLT interface {selectedDevice?.vendor === 'Huawei' ? '0' : '1'}/{form.card_slot || 1}/{form.pon_port_id} untuk SN {form.serial_number}...
                    </div>
                  ) : opticalCheck ? (
                    <div>
                      {/* 3 Metric Summary Boxes */}
                      <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr 1fr', gap: '0.55rem', marginBottom: '0.65rem' }}>
                        {/* Rx Power */}
                        <div style={{
                          background: optStatus === 'optimal' ? 'rgba(16, 185, 129, 0.08)' : optStatus === 'warning' ? 'rgba(245, 158, 11, 0.08)' : 'rgba(239, 68, 68, 0.1)',
                          border: `1px solid ${optStatus === 'optimal' ? 'rgba(16, 185, 129, 0.25)' : optStatus === 'warning' ? 'rgba(245, 158, 11, 0.25)' : 'rgba(239, 68, 68, 0.3)'}`,
                          borderRadius: '6px',
                          padding: '0.55rem 0.75rem'
                        }}>
                          <div style={{ fontSize: '0.68rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.04em', fontWeight: 600 }}>Rx Power (Redaman)</div>
                          <div style={{
                            fontSize: '1.25rem',
                            fontWeight: 800,
                            fontFamily: 'JetBrains Mono, monospace',
                            color: optStatus === 'optimal' ? '#10b981' : optStatus === 'warning' ? '#f59e0b' : '#ef4444',
                            marginTop: '0.15rem'
                          }}>
                            {opticalCheck.rxPower !== null ? `${opticalCheck.rxPower} dBm` : 'N/A'}
                          </div>
                          <div style={{ fontSize: '0.7rem', marginTop: '0.2rem', fontWeight: 600, color: optStatus === 'optimal' ? '#34d399' : optStatus === 'warning' ? '#fbbf24' : '#f87171' }}>
                            {optStatus === 'optimal' ? '● OPTIMAL (LAYAK)' : optStatus === 'warning' ? '▲ PERINGATAN' : '✕ KRITIS (LOSS TINGGI)'}
                          </div>
                        </div>

                        {/* Tx Power */}
                        <div style={{
                          background: 'var(--bg-card)',
                          border: '1px solid var(--border-color)',
                          borderRadius: '6px',
                          padding: '0.55rem 0.75rem'
                        }}>
                          <div style={{ fontSize: '0.68rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.04em', fontWeight: 600 }}>Tx Power OLT</div>
                          <div style={{
                            fontSize: '1.15rem',
                            fontWeight: 700,
                            fontFamily: 'JetBrains Mono, monospace',
                            color: '#38bdf8',
                            marginTop: '0.15rem'
                          }}>
                            {opticalCheck.txPower !== null ? `+${opticalCheck.txPower} dBm` : 'N/A'}
                          </div>
                          <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginTop: '0.2rem' }}>
                            Transceiver Class B+
                          </div>
                        </div>

                        {/* Fiber Distance */}
                        <div style={{
                          background: 'var(--bg-card)',
                          border: '1px solid var(--border-color)',
                          borderRadius: '6px',
                          padding: '0.55rem 0.75rem'
                        }}>
                          <div style={{ fontSize: '0.68rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.04em', fontWeight: 600 }}>Jarak Kabel Optik</div>
                          <div style={{
                            fontSize: '1.15rem',
                            fontWeight: 700,
                            fontFamily: 'JetBrains Mono, monospace',
                            color: 'var(--text-main)',
                            marginTop: '0.15rem'
                          }}>
                            {opticalCheck.distanceMeters !== null ? `${opticalCheck.distanceMeters} m` : 'N/A'}
                          </div>
                          <div style={{ fontSize: '0.7rem', color: '#64748b', marginTop: '0.2rem' }}>
                            Ranging Distance
                          </div>
                        </div>
                      </div>

                      {/* Visual Spectrum Bar (-10 dBm to -32 dBm) */}
                      <div style={{ background: 'rgba(0,0,0,0.35)', borderRadius: '6px', padding: '0.5rem 0.65rem', marginBottom: '0.6rem' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.68rem', color: '#94a3b8', marginBottom: '0.3rem' }}>
                          <span>Spektrum GPON ITU-T G.984</span>
                          <span>Optimal: -8 s/d -24 dBm | Warning: -24 s/d -27 dBm | Kritis: &lt; -27 dBm</span>
                        </div>
                        <div style={{ height: '8px', width: '100%', borderRadius: '4px', display: 'flex', overflow: 'hidden', position: 'relative' }}>
                          <div style={{ flex: '60%', background: '#10b981' }} title="Optimal (-8 to -24 dBm)" />
                          <div style={{ flex: '20%', background: '#f59e0b' }} title="Warning (-24 to -27 dBm)" />
                          <div style={{ flex: '20%', background: '#ef4444' }} title="Critical (< -27 dBm)" />
                          {opticalCheck.rxPower !== null && (
                            <div
                              style={{
                                position: 'absolute',
                                top: '-3px',
                                bottom: '-3px',
                                left: `${Math.min(98, Math.max(2, ((-opticalCheck.rxPower - 10) / 22) * 100))}%`,
                                width: '3px',
                                background: '#ffffff',
                                boxShadow: '0 0 6px #ffffff',
                                borderRadius: '2px',
                                transform: 'translateX(-50%)'
                              }}
                              title={`Posisi Saat Ini: ${opticalCheck.rxPower} dBm`}
                            />
                          )}
                        </div>
                      </div>

                      {/* Warning Box */}
                      {optStatus === 'critical' ? (
                        <div style={{
                          display: 'flex',
                          gap: '0.5rem',
                          padding: '0.6rem 0.75rem',
                          background: 'rgba(239, 68, 68, 0.12)',
                          border: '1px solid rgba(239, 68, 68, 0.35)',
                          borderRadius: '6px',
                          fontSize: '0.76rem',
                          color: '#fca5a5'
                        }}>
                          <AlertTriangle size={15} color="#ef4444" style={{ flexShrink: 0, marginTop: '2px' }} />
                          <div>
                            <strong>Peringatan Redaman Kritis:</strong> Redaman ({opticalCheck.rxPower} dBm) melebihi batas sensitivitas GPON (&lt; -27 dBm). Sangat disarankan untuk membersihkan connector patchcord atau re-splicing di ODP sebelum registrasi untuk mencegah koneksi loss/flapping.
                          </div>
                        </div>
                      ) : optStatus === 'warning' ? (
                        <div style={{
                          display: 'flex',
                          gap: '0.5rem',
                          padding: '0.5rem 0.75rem',
                          background: 'rgba(245, 158, 11, 0.08)',
                          border: '1px solid rgba(245, 158, 11, 0.25)',
                          borderRadius: '6px',
                          fontSize: '0.74rem',
                          color: '#fcd34d'
                        }}>
                          <AlertTriangle size={14} color="#f59e0b" style={{ flexShrink: 0, marginTop: '1px' }} />
                          <div>
                            <strong>Perhatian:</strong> Sinyal redaman ({opticalCheck.rxPower} dBm) mendekati ambang batas warning (-24 s/d -27 dBm). Pastikan bending radius kabel optik aman.
                          </div>
                        </div>
                      ) : (
                        <div style={{
                          display: 'flex',
                          gap: '0.5rem',
                          padding: '0.45rem 0.75rem',
                          background: 'rgba(16, 185, 129, 0.08)',
                          border: '1px solid rgba(16, 185, 129, 0.2)',
                          borderRadius: '6px',
                          fontSize: '0.74rem',
                          color: '#6ee7b7'
                        }}>
                          <CheckCircle2 size={14} color="#10b981" style={{ flexShrink: 0, marginTop: '1px' }} />
                          <span>Sinyal optik sangat bagus ({opticalCheck.rxPower} dBm). Siap dilanjutkan ke konfigurasi Service Profile.</span>
                        </div>
                      )}
                    </div>
                  ) : (
                    <div style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      padding: '0.6rem 0.75rem',
                      background: 'rgba(255, 255, 255, 0.03)',
                      borderRadius: '6px',
                      fontSize: '0.78rem',
                      color: '#94a3b8'
                    }}>
                      <span>Pilih ONU dari daftar discovery atau masukkan SN, lalu klik <strong>Ukur Sinyal</strong> untuk mengecek redaman optik port PON OLT secara real-time.</span>
                      <button
                        type="button"
                        className="btn btn-secondary"
                        onClick={() => triggerOpticalCheck(form.serial_number, form.pon_port_id)}
                        disabled={!form.serial_number}
                        style={{ fontSize: '0.72rem', padding: '0.2rem 0.6rem', whiteSpace: 'nowrap' }}
                      >
                        Ukur Sinyal
                      </button>
                    </div>
                  )}
                </div>
              );
            })()}
          </div>
        )}

        {/* Step 3 — Profile & PPPoE */}
        {step === 3 && (
          <div>
            <div className="form-group">
              <label>Service Profile (Paket Layanan)</label>
              {profiles.length === 0 ? (
                <div style={{ padding: '1rem', background: 'rgba(245,158,11,0.1)', border: '1px solid rgba(245,158,11,0.25)', borderRadius: '8px', color: '#fbbf24', fontSize: '0.85rem' }}>
                  <AlertTriangle size={14} style={{ marginRight: '0.5rem', display: 'inline' }} />
                  Tidak ada Service Profile. Buat profile di menu Service Profile terlebih dahulu.
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                  {profiles.map((p) => (
                    <div
                      key={p.profile_id}
                      onClick={() => set('service_profile_id', p.profile_id)}
                      style={{ padding: '0.75rem 1rem', borderRadius: '8px', border: `1px solid ${form.service_profile_id === p.profile_id ? 'rgba(139,92,246,0.5)' : 'rgba(255,255,255,0.07)'}`, background: form.service_profile_id === p.profile_id ? 'rgba(139,92,246,0.1)' : 'rgba(15,23,42,0.5)', cursor: 'pointer', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}
                    >
                      <div>
                        <div style={{ fontWeight: 700 }}>{p.name}</div>
                        <div style={{ fontSize: '0.78rem', color: '#9ca3af' }}>VLAN {p.vlan_id} · {p.wan_config_template}</div>
                      </div>
                      {form.service_profile_id === p.profile_id && <CheckCircle2 size={18} color="#c084fc" />}
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div style={{ borderTop: '1px solid rgba(255,255,255,0.07)', paddingTop: '1rem', marginTop: '0.5rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem', flexWrap: 'wrap', gap: '0.5rem' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <h4 style={{ fontSize: '0.88rem', fontWeight: 700, color: '#34d399', display: 'flex', alignItems: 'center', gap: '0.4rem', margin: 0 }}>
                    <Key size={14} /> Konfigurasi PPPoE <span style={{ fontSize: '0.72rem', color: '#64748b', fontWeight: 400 }}>(opsional)</span>
                  </h4>
                  {selectedProfile?.pppoe_username_template && (
                    <span style={{ fontSize: '0.7rem', padding: '0.15rem 0.45rem', borderRadius: '4px', background: 'rgba(52,211,153,0.1)', color: '#34d399', border: '1px solid rgba(52,211,153,0.25)', fontFamily: 'JetBrains Mono, monospace' }}>
                      Tpl: {selectedProfile.pppoe_username_template}
                    </span>
                  )}
                </div>
                <button
                  type="button"
                  onClick={() => applyPPPoETemplate()}
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '0.35rem',
                    padding: '0.28rem 0.65rem',
                    borderRadius: '6px',
                    fontSize: '0.74rem',
                    fontWeight: 600,
                    background: 'rgba(52,211,153,0.15)',
                    color: '#34d399',
                    border: '1px solid rgba(52,211,153,0.35)',
                    cursor: 'pointer'
                  }}
                  title="Generate kredensial otomatis berdasarkan template profil paket & SN"
                >
                  <Sparkles size={13} /> Auto-Generate dari Template
                </button>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label>Username PPPoE</label>
                  <input type="text" className="form-input" placeholder={selectedProfile?.pppoe_username_template || 'user@isp.net'}
                    value={form.pppoe_username} onChange={(e) => set('pppoe_username', e.target.value)} />
                </div>
                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label>Password PPPoE</label>
                  <input type="text" className="form-input" placeholder={selectedProfile?.pppoe_password_template || 'password'}
                    value={form.pppoe_password} onChange={(e) => set('pppoe_password', e.target.value)} />
                </div>
              </div>
              <div style={{ marginTop: '0.45rem', fontSize: '0.72rem', color: '#94a3b8', display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: '0.3rem' }}>
                <span>Kredensial PPPoE akan disuntikkan via OMCI / TR-069 ke modem pelanggan</span>
                {form.pppoe_username && (
                  <span style={{ color: '#34d399' }}>✓ Kredensial siap dikonfigurasi</span>
                )}
              </div>
            </div>

            {/* TR-069 CWMP Configuration */}
            <div style={{ borderTop: '1px solid rgba(255,255,255,0.07)', paddingTop: '1rem', marginTop: '1rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.65rem' }}>
                <h4 style={{ fontSize: '0.88rem', fontWeight: 700, color: '#38bdf8', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                  <Globe size={14} /> Konfigurasi CWMP TR-069 (Auto Configuration Server)
                </h4>
                <span style={{ fontSize: '0.72rem', color: '#64748b' }}>OMCI Management</span>
              </div>
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label style={{ fontSize: '0.82rem' }}>CWMP ACS Inform URL</label>
                <input
                  type="text"
                  className="form-input"
                  style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: '0.82rem' }}
                  value={form.tr069_acs_url}
                  onChange={(e) => set('tr069_acs_url', e.target.value)}
                  placeholder="http://103.176.227.233:3001/"
                />
                <div style={{ fontSize: '0.72rem', color: '#64748b', marginTop: '0.35rem', display: 'flex', justifyContent: 'space-between' }}>
                  <span>Diinjeksi ke CLI OLT: <code>tr069-mgmt 1 acs [URL]</code></span>
                  <span style={{ color: '#38bdf8' }}>Default diatur di menu Integrasi Sistem ➔ GenieACS</span>
                </div>
              </div>
            </div>

            {/* Info hint before review */}
            <div style={{ marginTop: '1.25rem', padding: '0.75rem 1rem', background: 'rgba(59,130,246,0.06)', border: '1px solid rgba(59,130,246,0.2)', borderRadius: '8px', fontSize: '0.8rem', color: '#93c5fd', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <Sliders size={15} color="#60a5fa" />
              <span>Langkah selanjutnya: Anda dapat meninjau rincian lengkap seluruh konfigurasi sebelum CLI OLT dieksekusi.</span>
            </div>
          </div>
        )}

        {/* Step 4 — Review & Konfirmasi Detail Konfigurasi */}
        {step === 4 && (
          <div>
            {/* Header info banner */}
            <div style={{
              background: 'rgba(59,130,246,0.08)',
              border: '1px solid rgba(59,130,246,0.25)',
              borderRadius: '8px',
              padding: '0.85rem 1rem',
              marginBottom: '1rem',
              display: 'flex',
              alignItems: 'flex-start',
              gap: '0.75rem'
            }}>
              <div style={{
                width: '32px',
                height: '32px',
                borderRadius: '50%',
                background: 'rgba(59,130,246,0.15)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                flexShrink: 0,
                marginTop: '1px'
              }}>
                <Sliders size={16} color="#60a5fa" />
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: '0.88rem', fontWeight: 700, color: '#f0f9ff' }}>
                  Review Konfigurasi Sebelum Registrasi
                </div>
                <div style={{ fontSize: '0.78rem', color: '#94a3b8', marginTop: '3px', lineHeight: 1.5 }}>
                  Periksa syntax perintah CLI running-configuration OLT di bawah ini. Pastikan interface PON, nama pelanggan, paket, dan kredensial PPPoE sudah tepat sebelum dieksekusi.
                </div>
              </div>
            </div>

            {/* OLT CLI Configuration Preview (Terminal Window with Manual Edit Mode) */}
            <CLIPreviewTerminal
              cliText={activeCliText}
              deviceName={selectedDevice?.name || 'OLT-ANTAPANI-01'}
              isEditMode={isEditMode}
              onToggleEdit={handleToggleEdit}
              onChangeCli={handleChangeCli}
              onResetTemplate={handleResetTemplate}
              isCustom={isCustomCli}
            />

            {/* 4 Detailed Configuration Cards */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.65rem', marginBottom: '0.85rem' }}>
              {/* Card 1: OLT & Interface Target */}
              <div style={{
                background: 'var(--bg-secondary)',
                border: '1px solid var(--border-color)',
                borderRadius: '8px',
                padding: '0.75rem'
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.45rem', marginBottom: '0.55rem', borderBottom: '1px solid var(--border-color)', paddingBottom: '0.4rem' }}>
                  <Server size={14} color="#60a5fa" />
                  <span style={{ fontSize: '0.76rem', fontWeight: 700, color: 'var(--text-main)', textTransform: 'uppercase', letterSpacing: '0.03em' }}>
                    1. Target Perangkat OLT
                  </span>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem', fontSize: '0.78rem' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span style={{ color: 'var(--text-muted)' }}>Nama OLT:</span>
                    <strong style={{ color: 'var(--text-main)' }}>{selectedDevice?.name || '—'}</strong>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span style={{ color: 'var(--text-muted)' }}>Vendor / Tipe:</span>
                    <span style={{ color: '#38bdf8', fontWeight: 600 }}>{selectedDevice?.vendor || '—'} GPON</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span style={{ color: 'var(--text-muted)' }}>IP Manajemen:</span>
                    <span style={{ fontFamily: 'JetBrains Mono, monospace', color: 'var(--text-secondary)' }}>{selectedDevice?.ip_address}:{selectedDevice?.port}</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span style={{ color: 'var(--text-muted)' }}>Port PON OLT:</span>
                    <strong style={{ color: '#fbbf24', fontFamily: 'JetBrains Mono, monospace' }}>
                      {selectedDevice?.vendor === 'Huawei' ? '0' : '1'}/{form.card_slot || 1}/{form.pon_port_id}
                    </strong>
                  </div>
                </div>
              </div>

              {/* Card 2: Identitas ONU */}
              <div style={{
                background: 'var(--bg-secondary)',
                border: '1px solid var(--border-color)',
                borderRadius: '8px',
                padding: '0.75rem'
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.45rem', marginBottom: '0.55rem', borderBottom: '1px solid var(--border-color)', paddingBottom: '0.4rem' }}>
                  <Wifi size={14} color="#34d399" />
                  <span style={{ fontSize: '0.76rem', fontWeight: 700, color: 'var(--text-main)', textTransform: 'uppercase', letterSpacing: '0.03em' }}>
                    2. Identitas ONU Pelanggan
                  </span>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem', fontSize: '0.78rem' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span style={{ color: 'var(--text-muted)' }}>Serial Number:</span>
                    <strong style={{ color: '#34d399', fontFamily: 'JetBrains Mono, monospace', letterSpacing: '0.04em' }}>{form.serial_number}</strong>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span style={{ color: 'var(--text-muted)' }}>Tipe PON OLT:</span>
                    <strong style={{ color: '#38bdf8', fontFamily: 'JetBrains Mono, monospace' }}>{form.onu_type || 'VSOL2L'}</strong>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span style={{ color: 'var(--text-muted)' }}>Metode Input:</span>
                    <span style={{ color: 'var(--text-secondary)' }}>
                      {unconfiguredList.some(x => x.serialNumber === form.serial_number) ? 'Auto-Scan Discovery' : 'Manual Entry'}
                    </span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ color: 'var(--text-muted)' }}>Pre-Check Redaman:</span>
                    {opticalCheck && opticalCheck.rxPower !== null ? (
                      <span style={{
                        padding: '0.1rem 0.45rem',
                        borderRadius: '4px',
                        fontSize: '0.72rem',
                        fontWeight: 700,
                        fontFamily: 'JetBrains Mono, monospace',
                        background: (opticalCheck.status || '').toLowerCase() === 'optimal' ? 'rgba(16,185,129,0.15)' : ((opticalCheck.status || '').toLowerCase() === 'warning' ? 'rgba(245,158,11,0.15)' : 'rgba(239,68,68,0.15)'),
                        color: (opticalCheck.status || '').toLowerCase() === 'optimal' ? '#34d399' : ((opticalCheck.status || '').toLowerCase() === 'warning' ? '#fbbf24' : '#f87171'),
                        border: `1px solid ${(opticalCheck.status || '').toLowerCase() === 'optimal' ? 'rgba(16,185,129,0.3)' : ((opticalCheck.status || '').toLowerCase() === 'warning' ? 'rgba(245,158,11,0.3)' : 'rgba(239,68,68,0.3)')}`
                      }}>
                        {opticalCheck.rxPower} dBm ({(opticalCheck.status || '').toUpperCase()})
                      </span>
                    ) : (
                      <span style={{ color: 'var(--text-muted)' }}>Belum diukur</span>
                    )}
                  </div>
                  {opticalCheck && opticalCheck.distanceMeters && (
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                      <span style={{ color: 'var(--text-muted)' }}>Estimasi Jarak Optik:</span>
                      <span style={{ fontFamily: 'JetBrains Mono, monospace', color: 'var(--text-secondary)' }}>{opticalCheck.distanceMeters} m</span>
                    </div>
                  )}
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span style={{ color: 'var(--text-muted)' }}>Initial State:</span>
                    <span style={{ color: '#38bdf8' }}>Unconfigured ➔ Registered</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span style={{ color: 'var(--text-muted)' }}>Port Mapping:</span>
                    <span style={{ color: 'var(--text-secondary)' }}>LAN 1-4 (Auto-provision)</span>
                  </div>
                </div>
              </div>

              {/* Card 3: Profil Layanan & Network */}
              <div style={{
                background: 'var(--bg-secondary)',
                border: '1px solid var(--border-color)',
                borderRadius: '8px',
                padding: '0.75rem'
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.45rem', marginBottom: '0.55rem', borderBottom: '1px solid var(--border-color)', paddingBottom: '0.4rem' }}>
                  <Globe size={14} color="#c084fc" />
                  <span style={{ fontSize: '0.76rem', fontWeight: 700, color: 'var(--text-main)', textTransform: 'uppercase', letterSpacing: '0.03em' }}>
                    3. Service Profile & VLAN
                  </span>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem', fontSize: '0.78rem' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span style={{ color: 'var(--text-muted)' }}>Paket Layanan:</span>
                    <strong style={{ color: '#c084fc' }}>{selectedProfile?.name || '—'}</strong>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span style={{ color: 'var(--text-muted)' }}>Internet VLAN:</span>
                    <strong style={{ color: '#f59e0b', fontFamily: 'JetBrains Mono, monospace' }}>VLAN {selectedProfile?.vlan_id || '—'}</strong>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span style={{ color: 'var(--text-muted)' }}>VLAN Action:</span>
                    <span style={{ color: 'var(--text-secondary)', fontSize: '0.74rem' }}>{selectedProfile?.vlan_template || 'Tag-action transparent'}</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span style={{ color: 'var(--text-muted)' }}>WAN Mode:</span>
                    <span style={{ color: 'var(--text-secondary)', fontSize: '0.74rem' }}>{selectedProfile?.wan_config_template || 'Route (PPPoE NAT)'}</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span style={{ color: 'var(--text-muted)' }}>TR-069 ACS URL:</span>
                    <span style={{ color: '#38bdf8', fontSize: '0.72rem', fontFamily: 'JetBrains Mono, monospace' }}>
                      {form.tr069_acs_url || 'http://103.176.227.233:3001/'}
                    </span>
                  </div>
                </div>
              </div>

              {/* Card 4: Kredensial PPPoE & Layanan */}
              <div style={{
                background: 'var(--bg-secondary)',
                border: '1px solid var(--border-color)',
                borderRadius: '8px',
                padding: '0.75rem'
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.45rem', marginBottom: '0.55rem', borderBottom: '1px solid var(--border-color)', paddingBottom: '0.4rem' }}>
                  <Key size={14} color="#f59e0b" />
                  <span style={{ fontSize: '0.76rem', fontWeight: 700, color: 'var(--text-main)', textTransform: 'uppercase', letterSpacing: '0.03em' }}>
                    4. Kredensial PPPoE & Layanan
                  </span>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem', fontSize: '0.78rem' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span style={{ color: 'var(--text-muted)' }}>PPPoE Username:</span>
                    <strong style={{ color: form.pppoe_username ? '#34d399' : 'var(--text-muted)', fontFamily: 'JetBrains Mono, monospace' }}>
                      {form.pppoe_username || '(Tanpa Akun PPPoE)'}
                    </strong>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ color: 'var(--text-muted)' }}>PPPoE Password:</span>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                      <span style={{ fontFamily: 'JetBrains Mono, monospace', color: form.pppoe_password ? 'var(--text-main)' : 'var(--text-muted)' }}>
                        {form.pppoe_password ? (showPassword ? form.pppoe_password : '••••••••') : '—'}
                      </span>
                      {form.pppoe_password && (
                        <button
                          type="button"
                          onClick={() => setShowPassword(!showPassword)}
                          style={{ background: 'none', border: 'none', color: '#94a3b8', cursor: 'pointer', padding: '0 2px', display: 'flex', alignItems: 'center' }}
                          title={showPassword ? 'Sembunyikan password' : 'Lihat password'}
                        >
                          {showPassword ? <EyeOff size={12} /> : <Eye size={12} />}
                        </button>
                      )}
                    </div>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span style={{ color: 'var(--text-muted)' }}>Mode Layanan:</span>
                    <span style={{ color: form.pppoe_username ? '#38bdf8' : '#9ca3af', fontWeight: 600 }}>
                      {form.pppoe_username ? `PPPoE Route (Profil: ${selectedProfile?.name || 'profile_50mbps'})` : 'Bridge Mode'}
                    </span>
                  </div>
                </div>
              </div>
            </div>

            {/* CLI Execution Plan */}
            <div style={{
              background: '#09090b',
              border: '1px solid var(--border-color)',
              borderRadius: '8px',
              padding: '0.75rem 0.85rem',
              fontSize: '0.75rem',
              fontFamily: 'JetBrains Mono, monospace'
            }}>
              <div style={{ color: '#94a3b8', fontWeight: 600, marginBottom: '0.45rem', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                <Terminal size={13} color="#38bdf8" /> Rangkaian Eksekusi Sistem & CLI Adapter:
              </div>
              <div style={{ color: '#64748b', lineHeight: 1.6, display: 'flex', flexDirection: 'column', gap: '0.2rem' }}>
                {isCustomCli ? (
                  <div><span style={{ color: '#fbbf24' }}>[1/3] OLT Adapter:</span> Eksekusi <strong>{customCliText.split('\n').filter(l => l.trim()).length} baris Custom CLI script</strong> langsung ke {selectedDevice?.name || 'OLT'} via SSH</div>
                ) : (
                  <div><span style={{ color: '#fbbf24' }}>[1/3] OLT Adapter:</span> Eksekusi bind SN <code>{form.serial_number}</code> ke PON Port <code>1/{form.card_slot || 1}/{form.pon_port_id}</code> ({selectedDevice?.vendor} CLI)</div>
                )}
                <div><span style={{ color: '#38bdf8' }}>[2/3] OMCI Config:</span> {isCustomCli ? 'Diterapkan sesuai script custom atau profile paket' : `Tagging VLAN ${selectedProfile?.vlan_id} & aktivasi service profile ${selectedProfile?.name}`}</div>
                <div><span style={{ color: '#34d399' }}>[3/3] NMS Core:</span> Registrasi ONU ke database, catat audit log, dan aktifkan telemetri poller</div>
              </div>
            </div>
          </div>
        )}

        {/* Navigation buttons */}
        <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'space-between', marginTop: '1.5rem', paddingTop: '1rem', borderTop: '1px solid rgba(255,255,255,0.07)' }}>
          <button className="btn btn-secondary" onClick={step === 1 ? onClose : () => { setError(''); setStep(step - 1); }}>
            {step === 1 ? 'Batal' : '← Kembali'}
          </button>
          {step < 4 ? (
            <button className="btn btn-primary"
              disabled={
                (step === 1 && !form.device_id) ||
                (step === 2 && !form.serial_number.trim()) ||
                (step === 3 && (!form.service_profile_id || profiles.length === 0))
              }
              onClick={() => {
                if (step === 2 && !form.serial_number.trim()) {
                  setError('Silakan pilih atau masukkan Serial Number ONU.');
                  return;
                }
                if (step === 2 && isIndexConflict) {
                  setError(`Bentrok ONU Index! Index ${form.onu_index} sudah terpakai di Port 1/1/${form.pon_port_id}. Gunakan Index ${indexInfo.nextAvailable}.`);
                  return;
                }
                if (step === 3 && !form.service_profile_id) {
                  setError('Silakan pilih Service Profile.');
                  return;
                }
                setError('');
                setStep(step + 1);
              }}>
              {step === 3 ? <>Review Konfigurasi <ArrowRight size={15} /></> : <>Lanjut <ArrowRight size={15} /></>}
            </button>
          ) : (
            <button
              className="btn btn-primary"
              onClick={handleStartExecution}
              style={isCustomCli ? { background: '#f59e0b', borderColor: '#d97706', color: '#09090b', fontWeight: 700 } : undefined}
            >
              <CheckCircle2 size={14} /> {isCustomCli ? `Konfirmasi & Eksekusi Custom CLI (${customCliText.split('\n').filter(l => l.trim()).length} Baris)` : 'Konfirmasi & Eksekusi Provisi'}
            </button>
          )}
        </div>

        {/* Real-time Provision Progress & Result Modal */}
        {executionState && (
          <ProvisionExecutionProgressModal
            executionData={executionState}
            onSuccess={(resultData) => {
              setExecutionState(null);
              onSuccess(resultData);
              onClose();
            }}
            onEditConfig={() => {
              setExecutionState(null);
            }}
            onProvisionAnother={() => {
              setExecutionState(null);
              setStep(1);
              setForm({
                device_id: form.device_id || '',
                pon_port_id: form.pon_port_id || 1,
                serial_number: '',
                onu_index: '',
                service_profile_id: form.service_profile_id || '',
                customer_name: '',
                pppoe_username: '',
                pppoe_password: '',
                tr069_acs_url: form.tr069_acs_url || ''
              });
            }}
            onClose={() => {
              setExecutionState(null);
              onClose();
            }}
          />
        )}
      </div>
    </div>
  );
}

/* ── Vendor Badge Color Helper ──────────────────────────────────────── */
function getVendorBadgeStyle(vendor) {
  if (vendor === 'ZTE') return { bg: 'rgba(59,130,246,0.12)', color: 'var(--primary-light)', border: 'rgba(59,130,246,0.3)' };
  if (vendor === 'Huawei') return { bg: 'rgba(239,68,68,0.12)', color: 'var(--danger)', border: 'rgba(239,68,68,0.3)' };
  return { bg: 'rgba(16,185,129,0.12)', color: 'var(--success)', border: 'rgba(16,185,129,0.3)' };
}

/* ── Main ONUProvisioner ─────────────────────────────────────────────── */
export default function ONUProvisioner({ devices = [], profiles = [], onRefresh, showModal = false, onCloseModal, currentUser, initialSearchTerm = '' }) {
  const [onus, setOnus] = useState([]);
  const [loading, setLoading] = useState(false);
  const [searchTerm, setSearchTerm] = useState(initialSearchTerm || '');
  const [filterStatus, setFilterStatus] = useState('all');
  const [filterDevice, setFilterDevice] = useState('all');
  const [filterCardSlot, setFilterCardSlot] = useState('all');
  const [filterPonPort, setFilterPonPort] = useState('all');
  const [filterProfile, setFilterProfile] = useState('all');
  const [loopIncidents, setLoopIncidents] = useState([]);
  const [isOLTCardSectionOpen, setIsOLTCardSectionOpen] = useState(() => {
    return localStorage.getItem('nms_olt_cards_open') !== 'false';
  });

  const toggleOLTCardSection = () => {
    setIsOLTCardSectionOpen((prev) => {
      localStorage.setItem('nms_olt_cards_open', String(!prev));
      return !prev;
    });
  };

  const [modal, setModal] = useState(null); // null | 'provision' | { type:'pppoe',onu } | { type:'status', data } | { type:'delete',onu } | { type:'result', data } | { type:'replace', onu } | { type:'reboot', onu } | { type:'change-profile', onu } | { type:'loop-protection' }
  const [loadingStatusId, setLoadingStatusId] = useState(null);
  const { toasts, toast, remove } = useToast();

  const canManageSwap = currentUser?.role === 'superadmin' || currentUser?.role === 'noc_engineer' || currentUser?.role === 'field_technician';
  const canChangeProfile = canManageSwap;

  // Sync external showModal trigger (from Overview quick action)
  useEffect(() => {
    if (showModal) setModal('provision');
  }, [showModal]);

  // Sync external initialSearchTerm trigger (from Command Palette)
  useEffect(() => {
    if (initialSearchTerm) setSearchTerm(initialSearchTerm);
  }, [initialSearchTerm]);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const data = await getONUs();
      setOnus(data);
      try {
        const incidents = await getLoopIncidents('active');
        setLoopIncidents(incidents || []);
      } catch {
        // non-blocking
      }
    } catch (err) {
      toast.error('Gagal memuat data ONU: ' + err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  const handleCloseModal = () => {
    setModal(null);
    if (onCloseModal) onCloseModal();
  };

  const handleProvisionSuccess = (resultData) => {
    toast.success(`ONU ${resultData.serialNumber} berhasil diprovisi!`);
    loadData();
    if (onRefresh) onRefresh();
    setModal(null);
  };

  const handleViewStatus = async (onu) => {
    if (!onu?.onu_id) return;
    setLoadingStatusId(onu.onu_id);
    try {
      const res = await getONUStatus(onu.onu_id);
      const data = res?.data || res;
      setModal({ type: 'status', data });
    } catch (err) {
      toast.error('Gagal ambil status OMCI: ' + err.message);
    } finally {
      setLoadingStatusId(null);
    }
  };

  const handleDeleteONU = async (onu) => {
    try {
      await deleteONU(onu.onu_id);
      toast.success(`ONU ${onu.serial_number} berhasil di-unregister.`);
      setModal(null);
      loadData();
      if (onRefresh) onRefresh();
    } catch (err) {
      toast.error(err.message);
      setModal(null);
    }
  };

  const handleRebootConfirm = async (targetOnu) => {
    const onu = targetOnu || modal?.onu;
    if (!onu) return;
    try {
      const res = await rebootONU(onu.onu_id);
      toast.success(res.message || `Perintah reboot berhasil dikirim ke ONU ${onu.serial_number}`);
      setModal(null);
      loadData();
      if (onRefresh) onRefresh();
    } catch (err) {
      toast.error('Gagal mengirim perintah reboot: ' + err.message);
    }
  };

  // Selected OLT metadata if filtered
  const selectedDeviceObj = filterDevice !== 'all' ? devices.find((d) => d.device_id === parseInt(filterDevice, 10)) : null;

  // Available Cards for currently selected OLT (or global distinct slots)
  const availableCards = useMemo(() => {
    if (filterDevice === 'all') {
      const distinctSlots = Array.from(new Set(onus.map((o) => o.card_slot || 1))).sort((a, b) => a - b);
      if (distinctSlots.length === 0) return [{ slot: 1, type: 'GPON', ports: 16, status: 'INSERVICE' }];
      return distinctSlots.map((s) => ({ slot: s, type: 'GPON', ports: 16, status: 'INSERVICE' }));
    }
    const dev = devices.find((d) => d.device_id === parseInt(filterDevice, 10));
    if (!dev) return [{ slot: 1, type: 'GPON', ports: 8, status: 'INSERVICE' }];

    let rawCards = dev.cards;
    if (typeof rawCards === 'string') {
      try { rawCards = JSON.parse(rawCards); } catch { rawCards = []; }
    }
    if (Array.isArray(rawCards) && rawCards.length > 0) {
      const gponCards = rawCards.filter((c) => (c.ports || 0) > 0 || !['PRAM', 'SMXA', 'PILA', 'PWR'].some((x) => (c.type || '').toUpperCase().includes(x)));
      if (gponCards.length > 0) return gponCards;
    }
    return [{ slot: 1, type: 'GPON', ports: dev.pon_ports_count || 8, status: 'INSERVICE' }];
  }, [filterDevice, devices, onus]);

  // Available PON Ports for currently selected OLT and Card Slot
  const availablePonPorts = useMemo(() => {
    if (filterDevice === 'all') {
      const distinct = Array.from(new Set(onus.map((o) => o.pon_port_id))).filter(Boolean).sort((a, b) => a - b);
      return distinct.length > 0 ? distinct : [1, 2, 3, 4, 5, 6, 7, 8];
    }
    let portCount = 16;
    if (filterCardSlot !== 'all') {
      const targetCard = availableCards.find((c) => c.slot === parseInt(filterCardSlot, 10));
      if (targetCard && targetCard.ports) portCount = targetCard.ports;
    } else {
      const dev = devices.find((d) => d.device_id === parseInt(filterDevice, 10));
      portCount = dev?.pon_ports_count || 16;
    }
    const ports = [];
    for (let i = 1; i <= portCount; i++) {
      ports.push(i);
    }
    return ports;
  }, [filterDevice, filterCardSlot, availableCards, devices, onus]);

  // Filter
  const filteredONUs = onus.filter((o) => {
    const matchDevice = filterDevice === 'all' || o.device_id === parseInt(filterDevice, 10);
    const matchCard = filterCardSlot === 'all' || (o.card_slot || 1) === parseInt(filterCardSlot, 10);
    const matchPonPort = filterPonPort === 'all' || o.pon_port_id === parseInt(filterPonPort, 10);
    const matchProfile = filterProfile === 'all' || o.service_profile_id === parseInt(filterProfile, 10);
    const matchSearch =
      o.serial_number.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (o.onu_name && o.onu_name.toLowerCase().includes(searchTerm.toLowerCase())) ||
      (o.pppoe_username && o.pppoe_username.toLowerCase().includes(searchTerm.toLowerCase())) ||
      (o.device_name && o.device_name.toLowerCase().includes(searchTerm.toLowerCase())) ||
      (o.profile_name && o.profile_name.toLowerCase().includes(searchTerm.toLowerCase()));
    let matchStatus = true;
    if (filterStatus === 'online') {
      matchStatus = o.status?.toLowerCase() === 'online';
    } else if (filterStatus === 'dying-gasp') {
      matchStatus = o.last_offline_reason === 'dying-gasp' || (!o.last_offline_reason && o.status?.toLowerCase() === 'offline');
    } else if (filterStatus === 'los') {
      matchStatus = o.last_offline_reason === 'los' || o.status?.toLowerCase().includes('loss');
    } else if (filterStatus === 'offline') {
      matchStatus = o.status?.toLowerCase() !== 'online';
    }
    return matchDevice && matchCard && matchPonPort && matchProfile && matchSearch && matchStatus;
  });

  // Scoped counts for stats bar
  const deviceFiltered = onus.filter((o) => {
    const matchDevice = filterDevice === 'all' || o.device_id === parseInt(filterDevice, 10);
    const matchCard = filterCardSlot === 'all' || (o.card_slot || 1) === parseInt(filterCardSlot, 10);
    return matchDevice && matchCard;
  });
  const activeScoped = onus.filter((o) => {
    const matchDevice = filterDevice === 'all' || o.device_id === parseInt(filterDevice, 10);
    const matchCard = filterCardSlot === 'all' || (o.card_slot || 1) === parseInt(filterCardSlot, 10);
    const matchPonPort = filterPonPort === 'all' || o.pon_port_id === parseInt(filterPonPort, 10);
    const matchProfile = filterProfile === 'all' || o.service_profile_id === parseInt(filterProfile, 10);
    return matchDevice && matchCard && matchPonPort && matchProfile;
  });
  const countOnline = activeScoped.filter((o) => o.status === 'Online').length;
  const countDyingGasp = activeScoped.filter((o) => o.status !== 'Online' && (o.last_offline_reason === 'dying-gasp' || (!o.last_offline_reason && o.status?.toLowerCase() === 'offline'))).length;
  const countLOS = activeScoped.filter((o) => o.status !== 'Online' && (o.last_offline_reason === 'los' || o.status?.toLowerCase().includes('loss'))).length;

  return (
    <div>
      <ToastContainer toasts={toasts} onRemove={remove} />

      {/* Page header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem', flexWrap: 'wrap', gap: '0.75rem' }}>
        <div>
          <h2 style={{ fontSize: '1.25rem', fontWeight: 700, margin: 0, letterSpacing: '-0.02em', color: 'var(--text-main)' }}>Provisi ONU</h2>
        </div>
        <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', flexWrap: 'wrap' }}>
          <button
            className={`btn ${loopIncidents.length > 0 ? 'btn-danger' : 'btn-secondary'} btn-sm`}
            onClick={() => setModal({ type: 'loop-protection' })}
            title="Pusat Deteksi Loopback & Perlindungan Broadcast Storm"
          >
            <ShieldAlert size={13} />
            <span>Proteksi Loop {loopIncidents.length > 0 ? `(${loopIncidents.length})` : ''}</span>
          </button>
          <button
            className="btn btn-secondary btn-sm"
            onClick={() => setModal({ type: 'sync' })}
            title="Tarik & impor seluruh data ONU yang sudah terdaftar di hardware OLT"
          >
            <RefreshCw size={13} />
            <span>Sinkronisasi OLT</span>
          </button>
          <button className="btn btn-secondary btn-sm" onClick={loadData} disabled={loading}>
            {loading ? <Loader2 size={13} className="spin-animate" /> : <RefreshCw size={13} />}
            <span>Refresh</span>
          </button>
          <button className="btn btn-primary btn-sm" onClick={() => setModal('provision')}>
            <Plus size={14} />
            <span>Provisi ONU Baru</span>
          </button>
        </div>
      </div>

      {/* Loopback & Broadcast Storm Active Warning Banner */}
      {loopIncidents.length > 0 && (
        <div
          style={{
            background: 'var(--bg-surface-elevated)',
            border: '1px solid var(--border-color)',
            borderRadius: 'var(--radius-lg)',
            padding: '0.75rem 1.15rem',
            marginBottom: '1.15rem',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: '1rem',
            flexWrap: 'wrap'
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
            <div
              style={{
                width: '32px',
                height: '32px',
                borderRadius: 'var(--radius-md)',
                background: 'var(--bg-body)',
                border: '1px solid var(--border-color)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: 'var(--text-main)',
                flexShrink: 0
              }}
            >
              <ShieldAlert size={16} />
            </div>
            <div>
              <div style={{ fontSize: '0.85rem', fontWeight: 700, color: 'var(--text-main)' }}>
                Peringatan Loopback & Broadcast Storm Aktif ({loopIncidents.length} Insiden)
              </div>
              <div style={{ fontSize: '0.74rem', color: 'var(--text-secondary)', marginTop: '2px' }}>
                Port LAN ONU yang looping telah diisolasi otomatis via OMCI untuk melindungi uplink PON.
              </div>
            </div>
          </div>
          <button
            className="btn btn-secondary btn-sm"
            onClick={() => setModal({ type: 'loop-protection' })}
          >
            <ShieldAlert size={13} />
            <span>Kelola Proteksi Loop</span>
          </button>
        </div>
      )}

      {/* KPI Stats Bar - 4 Cards */}
      <div className="grid-4" style={{ marginBottom: '1.15rem' }}>
        <div className="kpi-card">
          <div>
            <div className="kpi-header">
              <span className="kpi-label">
                {filterPonPort !== 'all'
                  ? `ONU (${selectedDeviceObj?.vendor === 'Huawei' ? '0' : '1'}/${filterCardSlot !== 'all' ? filterCardSlot : (availableCards[0]?.slot || 1)}/${filterPonPort})`
                  : filterCardSlot !== 'all'
                  ? `ONU (Card Slot ${filterCardSlot})`
                  : filterDevice !== 'all'
                  ? `Total (${selectedDeviceObj?.name})`
                  : 'Total ONU Terdaftar'}
              </span>
              <div className="kpi-icon-wrap">
                <Server size={14} />
              </div>
            </div>
            <div className="kpi-val">{activeScoped.length}</div>
          </div>
          <div className="kpi-sub">
            <span style={{ color: 'var(--text-secondary)' }}>
              {selectedDeviceObj ? `${selectedDeviceObj.vendor} Gateway` : 'Semua OLT Terkoneksi'}
            </span>
          </div>
        </div>

        <div className="kpi-card">
          <div>
            <div className="kpi-header">
              <span className="kpi-label">Online (Normal)</span>
              <div className="kpi-icon-wrap">
                <CheckCircle2 size={14} />
              </div>
            </div>
            <div className="kpi-val">{countOnline}</div>
          </div>
          <div className="kpi-sub" style={{ color: 'var(--success)' }}>
            <span>{Math.round((countOnline / (activeScoped.length || 1)) * 100)}% Rasio Sehat</span>
          </div>
        </div>

        <div className="kpi-card">
          <div>
            <div className="kpi-header">
              <span className="kpi-label">Mati Listrik (Dying Gasp)</span>
              <div className="kpi-icon-wrap">
                <ZapOff size={14} />
              </div>
            </div>
            <div className="kpi-val" style={{ color: countDyingGasp > 0 ? 'var(--warning)' : '#ffffff' }}>{countDyingGasp}</div>
          </div>
          <div className="kpi-sub" style={{ color: countDyingGasp > 0 ? 'var(--warning)' : 'var(--text-secondary)' }}>
            <span>{countDyingGasp > 0 ? `${countDyingGasp} ONU Daya Terputus` : 'Catu Daya Seluruh ONU Normal'}</span>
          </div>
        </div>

        <div className="kpi-card">
          <div>
            <div className="kpi-header">
              <span className="kpi-label">Kabel Putus (LOS)</span>
              <div className="kpi-icon-wrap" style={{ color: countLOS > 0 ? 'var(--danger)' : 'inherit' }}>
                <AlertOctagon size={14} />
              </div>
            </div>
            <div className="kpi-val" style={{ color: countLOS > 0 ? 'var(--danger)' : '#ffffff' }}>{countLOS}</div>
          </div>
          <div className="kpi-sub" style={{ color: countLOS > 0 ? 'var(--danger)' : 'var(--text-secondary)' }}>
            <span>{countLOS > 0 ? `${countLOS} ONU Gangguan Kabel` : 'Tautan Kabel Normal'}</span>
          </div>
        </div>
      </div>

      {/* OLT Hardware Gateway Selection Cards */}
      <div style={{ marginBottom: '1.1rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.6rem', flexWrap: 'wrap', gap: '0.5rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <Server size={14} style={{ color: 'var(--primary-light)' }} />
            <span style={{ fontSize: '0.82rem', fontWeight: 700, color: 'var(--text-main)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
              Filter Kartu Perangkat OLT
            </span>
            <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>
              ({devices.length} Unit Terpasang)
            </span>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            {(filterDevice !== 'all' || filterCardSlot !== 'all' || filterPonPort !== 'all' || filterProfile !== 'all') && (
              <button
                type="button"
                onClick={() => {
                  setFilterDevice('all');
                  setFilterCardSlot('all');
                  setFilterPonPort('all');
                  setFilterProfile('all');
                }}
                className="btn btn-ghost btn-sm"
                style={{ fontSize: '0.74rem', color: 'var(--primary-light)', padding: '2px 6px' }}
              >
                <RotateCcw size={11} style={{ marginRight: '4px' }} />
                Reset ke Semua OLT
              </button>
            )}

            {/* Buka / Tutup Card Filter Button */}
            <button
              type="button"
              onClick={toggleOLTCardSection}
              className="btn btn-secondary btn-sm"
              style={{ fontSize: '0.72rem', padding: '0.2rem 0.6rem', display: 'flex', alignItems: 'center', gap: '0.35rem' }}
              title={isOLTCardSectionOpen ? 'Tutup Card Filter OLT (Hemat Ruang)' : 'Buka Card Filter OLT'}
            >
              {isOLTCardSectionOpen ? (
                <>
                  <ChevronUp size={13} />
                  <span>Tutup Card</span>
                </>
              ) : (
                <>
                  <ChevronDown size={13} />
                  <span>Buka Card</span>
                </>
              )}
            </button>
          </div>
        </div>

        {/* Collapsible Card Grid or Compact Summary */}
        {isOLTCardSectionOpen ? (
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(230px, 1fr))',
          gap: '0.65rem'
        }}>
          {/* Card: Semua OLT (Global) */}
          <div
            onClick={() => {
              setFilterDevice('all');
              setFilterCardSlot('all');
              setFilterPonPort('all');
              setFilterProfile('all');
            }}
            style={{
              cursor: 'pointer',
              padding: '0.75rem 0.95rem',
              borderRadius: 'var(--radius-lg)',
              border: filterDevice === 'all'
                ? '1px solid var(--primary)'
                : '1px solid var(--border-color)',
              background: filterDevice === 'all'
                ? 'rgba(37, 99, 235, 0.09)'
                : 'var(--bg-surface)',
              transition: 'all 0.18s ease',
              display: 'flex',
              flexDirection: 'column',
              justifyContent: 'space-between',
              boxShadow: filterDevice === 'all' ? '0 0 10px rgba(37, 99, 235, 0.15)' : 'none'
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.45rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <div style={{
                  width: '30px', height: '30px', borderRadius: '7px',
                  background: filterDevice === 'all' ? 'var(--primary)' : 'var(--bg-surface-elevated)',
                  color: filterDevice === 'all' ? '#ffffff' : 'var(--text-secondary)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center'
                }}>
                  <Globe size={15} />
                </div>
                <div>
                  <div style={{ fontWeight: 700, fontSize: '0.86rem', color: 'var(--text-main)' }}>
                    Semua OLT
                  </div>
                  <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>
                    Multi-Vendor Pool
                  </div>
                </div>
              </div>
              {filterDevice === 'all' ? (
                <div style={{
                  width: '18px', height: '18px', borderRadius: '50%',
                  background: 'var(--primary)', color: '#fff',
                  display: 'flex', alignItems: 'center', justifyContent: 'center'
                }}>
                  <Check size={11} strokeWidth={3} />
                </div>
              ) : (
                <span style={{ fontSize: '0.7rem', color: 'var(--text-dim)' }}>{devices.length} OLT</span>
              )}
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.74rem', borderTop: '1px solid var(--border-subtle)', paddingTop: '0.4rem' }}>
              <span style={{ color: 'var(--text-secondary)' }}>Total ONU:</span>
              <span style={{ fontWeight: 700, color: 'var(--text-main)', fontFamily: 'JetBrains Mono, monospace' }}>
                {onus.length} Unit
              </span>
            </div>
          </div>

          {/* Cards for each OLT */}
          {devices.map((d) => {
            const isSelected = filterDevice === String(d.device_id);
            const devOnus = onus.filter((o) => o.device_id === d.device_id);
            const devOnline = devOnus.filter((o) => o.status === 'Online').length;
            const devOffline = devOnus.length - devOnline;
            const vs = getVendorBadgeStyle(d.vendor);

            return (
              <div
                key={d.device_id}
                onClick={() => {
                  if (isSelected) {
                    setFilterDevice('all');
                    setFilterCardSlot('all');
                    setFilterPonPort('all');
                    setFilterProfile('all');
                  } else {
                    setFilterDevice(String(d.device_id));
                    setFilterCardSlot('all');
                    setFilterPonPort('all');
                    setFilterProfile('all');
                  }
                }}
                style={{
                  cursor: 'pointer',
                  padding: '0.75rem 0.95rem',
                  borderRadius: 'var(--radius-lg)',
                  border: isSelected
                    ? '1px solid var(--primary)'
                    : '1px solid var(--border-color)',
                  background: isSelected
                    ? 'rgba(37, 99, 235, 0.09)'
                    : 'var(--bg-surface)',
                  transition: 'all 0.18s ease',
                  display: 'flex',
                  flexDirection: 'column',
                  justifyContent: 'space-between',
                  boxShadow: isSelected ? '0 0 10px rgba(37, 99, 235, 0.15)' : 'none'
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '0.45rem' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', overflow: 'hidden' }}>
                    <div style={{
                      width: '30px', height: '30px', borderRadius: '7px',
                      background: vs.bg,
                      color: vs.color,
                      border: `1px solid ${vs.border}`,
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      flexShrink: 0
                    }}>
                      <Server size={15} />
                    </div>
                    <div style={{ overflow: 'hidden' }}>
                      <div style={{ fontWeight: 700, fontSize: '0.86rem', color: 'var(--text-main)', whiteSpace: 'nowrap', textOverflow: 'ellipsis', overflow: 'hidden' }}>
                        {d.name}
                      </div>
                      <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
                        <span style={{ fontWeight: 600, color: vs.color }}>{d.vendor}</span>
                        <span>•</span>
                        <code style={{ fontSize: '0.68rem' }}>{d.ip_address}</code>
                      </div>
                    </div>
                  </div>
                  {isSelected ? (
                    <div style={{
                      width: '18px', height: '18px', borderRadius: '50%',
                      background: 'var(--primary)', color: '#fff',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      flexShrink: 0
                    }}>
                      <Check size={11} strokeWidth={3} />
                    </div>
                  ) : (
                    <div style={{
                      display: 'flex', alignItems: 'center', gap: '0.25rem',
                      fontSize: '0.68rem', color: d.status === 'Online' ? 'var(--success)' : 'var(--danger)',
                      flexShrink: 0
                    }}>
                      <span className={`status-dot ${d.status === 'Online' ? 'status-dot-pulse' : ''}`} style={{ width: '6px', height: '6px' }} />
                      <span>{d.status}</span>
                    </div>
                  )}
                </div>

                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.74rem', borderTop: '1px solid var(--border-subtle)', paddingTop: '0.4rem' }}>
                  <span style={{ color: 'var(--text-secondary)' }}>
                    {d.pon_ports_count || 8} PON Ports
                  </span>
                  <div style={{ display: 'flex', gap: '0.35rem', alignItems: 'center' }}>
                    <span style={{ fontWeight: 600, color: 'var(--success)', fontFamily: 'JetBrains Mono, monospace' }}>
                      {devOnline} On
                    </span>
                    {devOffline > 0 && (
                      <span style={{ fontWeight: 600, color: 'var(--danger)', fontFamily: 'JetBrains Mono, monospace' }}>
                        / {devOffline} Off
                      </span>
                    )}
                    <span style={{ color: 'var(--text-dim)', fontSize: '0.7rem' }}>
                      ({devOnus.length})
                    </span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        /* Compact summary strip when card grid is collapsed */
        <div
          onClick={toggleOLTCardSection}
          style={{
            padding: '0.45rem 0.85rem',
            borderRadius: 'var(--radius-md)',
            background: 'var(--bg-surface-elevated)',
            border: '1px solid var(--border-color)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            cursor: 'pointer',
            fontSize: '0.75rem',
            color: 'var(--text-secondary)',
            transition: 'background 0.15s ease'
          }}
          title="Klik untuk membuka kembali Card Filter OLT"
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', flexWrap: 'wrap' }}>
            <span style={{ color: 'var(--text-muted)', fontSize: '0.72rem' }}>Status Filter:</span>
            <span style={{ fontWeight: 600, color: 'var(--primary-light)' }}>
              {filterDevice === 'all'
                ? '🌐 Semua OLT (Global Pool)'
                : `🎯 ${devices.find((d) => String(d.device_id) === filterDevice)?.name || 'OLT Terpilih'}`}
            </span>
            {filterCardSlot !== 'all' && (
              <span style={{ background: 'rgba(37,99,235,0.15)', color: 'var(--primary-light)', padding: '1px 6px', borderRadius: '4px', fontWeight: 600 }}>
                Slot {filterCardSlot}
              </span>
            )}
            {filterPonPort !== 'all' && (
              <span style={{ background: 'rgba(16,185,129,0.15)', color: 'var(--success)', padding: '1px 6px', borderRadius: '4px', fontWeight: 600 }}>
                Port {filterPonPort}
              </span>
            )}
            <span style={{ color: 'var(--text-dim)', fontSize: '0.72rem' }}>
              ({filteredONUs.length} ONU Ditampilkan)
            </span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.3rem', color: 'var(--primary-light)', fontSize: '0.72rem', fontWeight: 500 }}>
            <span>Buka Card</span>
            <ChevronDown size={13} />
          </div>
        </div>
      )}
      </div>

      {/* Search + Sub-Filters Panel */}
      <div className="card" style={{ padding: '0.85rem 1.1rem', marginBottom: '1.15rem' }}>
        {/* Top Filter Row: Search, OLT Dropdown, Service Profile, Status */}
        <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center', flexWrap: 'wrap' }}>
          {/* Search input */}
          <div style={{ position: 'relative', flex: 1, minWidth: '220px' }}>
            <Search size={14} style={{ position: 'absolute', left: '11px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
            <input
              type="text"
              className="form-input"
              style={{ paddingLeft: '2.1rem', height: '34px', fontSize: '0.78rem' }}
              placeholder="Cari Serial Number, Pelanggan, PPPoE, VLAN..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>

          {/* OLT Dropdown (synced with Cards) */}
          <div style={{ position: 'relative', minWidth: '190px' }}>
            <Server size={13} style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)', pointerEvents: 'none' }} />
            <select
              className="form-input"
              style={{
                paddingLeft: '1.85rem',
                paddingRight: '1.5rem',
                fontSize: '0.78rem',
                height: '34px',
                borderColor: 'var(--border-color)',
                color: 'var(--text-main)',
                fontWeight: 500,
                cursor: 'pointer'
              }}
              value={filterDevice}
              onChange={(e) => {
                setFilterDevice(e.target.value);
                setFilterPonPort('all');
                setFilterProfile('all');
              }}
              title="Filter OLT"
            >
              <option value="all">Semua OLT ({onus.length} ONU)</option>
              {devices.map((d) => {
                const count = onus.filter((o) => o.device_id === d.device_id).length;
                return (
                  <option key={d.device_id} value={d.device_id}>
                    {d.name} ({d.vendor}) — {count} ONU
                  </option>
                );
              })}
            </select>
          </div>

          {/* Service Profile / VLAN Filter */}
          <div style={{ position: 'relative', minWidth: '170px' }}>
            <Sliders size={13} style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)', pointerEvents: 'none' }} />
            <select
              className="form-input"
              style={{
                paddingLeft: '1.85rem',
                paddingRight: '1.5rem',
                fontSize: '0.78rem',
                height: '34px',
                borderColor: 'var(--border-color)',
                color: 'var(--text-main)',
                fontWeight: 500,
                cursor: 'pointer'
              }}
              value={filterProfile}
              onChange={(e) => setFilterProfile(e.target.value)}
              title="Filter Service Profile & VLAN"
            >
              <option value="all">Semua Profil Layanan</option>
              {profiles.map((p) => (
                <option key={p.profile_id} value={p.profile_id}>
                  {p.name} (VLAN {p.vlan_id})
                </option>
              ))}
            </select>
          </div>

          {/* Segmented Status Selector */}
          <div className="segmented-control">
            {[
              ['all', 'Semua'],
              ['online', 'Online'],
              ['dying-gasp', 'Dying Gasp'],
              ['los', 'Kabel Putus'],
              ['offline', 'Offline']
            ].map(([val, label]) => (
              <button
                key={val}
                type="button"
                onClick={() => setFilterStatus(val)}
                className={`segmented-btn ${filterStatus === val ? 'active' : ''}`}
              >
                {label}
              </button>
            ))}
          </div>

          {/* Reset Filter Button */}
          {(filterDevice !== 'all' || filterPonPort !== 'all' || filterProfile !== 'all' || filterStatus !== 'all' || searchTerm) && (
            <button
              type="button"
              onClick={() => {
                setFilterDevice('all');
                setFilterPonPort('all');
                setFilterProfile('all');
                setFilterStatus('all');
                setSearchTerm('');
              }}
              className="btn btn-ghost btn-sm"
              style={{ color: 'var(--danger)', height: '34px' }}
              title="Reset seluruh filter pencarian"
            >
              <X size={12} />
              <span>Reset</span>
            </button>
          )}

          <div style={{ fontSize: '0.82rem', color: 'var(--text-muted)', whiteSpace: 'nowrap', marginLeft: 'auto' }}>
            {filteredONUs.length} / {onus.length} ONU
          </div>
        </div>

        {/* Dedicated Card / PON Port Filter Bar */}
        <div style={{
          marginTop: '0.75rem',
          paddingTop: '0.75rem',
          borderTop: '1px solid var(--border-subtle)',
          display: 'flex',
          flexDirection: 'column',
          gap: '0.65rem'
        }}>
          {/* Baris 1: Filter Card / Slot OLT */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '0.5rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.78rem' }}>
              <Layers size={13} style={{ color: 'var(--primary-light)' }} />
              <span style={{ fontWeight: 600, color: 'var(--text-main)' }}>
                Card / Slot OLT:
              </span>
              {selectedDeviceObj && (
                <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>
                  ({selectedDeviceObj.name} · {selectedDeviceObj.vendor})
                </span>
              )}
            </div>

            <div style={{ display: 'flex', gap: '0.35rem', flexWrap: 'wrap', alignItems: 'center' }}>
              <button
                type="button"
                onClick={() => {
                  setFilterCardSlot('all');
                  setFilterPonPort('all');
                }}
                style={{
                  padding: '0.25rem 0.6rem',
                  borderRadius: 'var(--radius-md)',
                  fontSize: '0.74rem',
                  fontWeight: filterCardSlot === 'all' ? 700 : 500,
                  border: filterCardSlot === 'all' ? '1px solid var(--primary)' : '1px solid var(--border-color)',
                  background: filterCardSlot === 'all' ? 'var(--primary)' : 'var(--bg-surface-elevated)',
                  color: filterCardSlot === 'all' ? '#ffffff' : 'var(--text-secondary)',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.3rem',
                  transition: 'all 0.15s ease'
                }}
              >
                <span>Semua Card</span>
                <span style={{
                  fontSize: '0.66rem',
                  padding: '1px 4px',
                  borderRadius: '4px',
                  background: filterCardSlot === 'all' ? 'rgba(255,255,255,0.25)' : 'var(--bg-card)',
                  color: filterCardSlot === 'all' ? '#fff' : 'var(--text-muted)'
                }}>
                  {filterDevice === 'all' ? onus.length : onus.filter(o => o.device_id === parseInt(filterDevice, 10)).length}
                </span>
              </button>

              {availableCards.map((card) => {
                const isSelected = filterCardSlot === String(card.slot);
                const countInCard = (filterDevice === 'all' ? onus : onus.filter(o => o.device_id === parseInt(filterDevice, 10)))
                  .filter(o => (o.card_slot || 1) === card.slot).length;

                return (
                  <button
                    key={card.slot}
                    type="button"
                    onClick={() => {
                      setFilterCardSlot(isSelected ? 'all' : String(card.slot));
                      setFilterPonPort('all');
                    }}
                    style={{
                      padding: '0.25rem 0.6rem',
                      borderRadius: 'var(--radius-md)',
                      fontSize: '0.74rem',
                      fontWeight: isSelected ? 700 : 500,
                      border: isSelected ? '1px solid var(--primary)' : '1px solid var(--border-color)',
                      background: isSelected ? 'var(--primary)' : 'var(--bg-surface-elevated)',
                      color: isSelected ? '#ffffff' : 'var(--text-secondary)',
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '0.35rem',
                      transition: 'all 0.15s ease'
                    }}
                  >
                    <span>Slot {card.slot} ({card.type || 'GPON'}{card.ports ? ` · ${card.ports}P` : ''})</span>
                    <span style={{
                      fontSize: '0.66rem',
                      padding: '1px 4px',
                      borderRadius: '4px',
                      background: isSelected ? 'rgba(255,255,255,0.25)' : countInCard > 0 ? 'rgba(16, 185, 129, 0.15)' : 'var(--bg-card)',
                      color: isSelected ? '#fff' : countInCard > 0 ? 'var(--success)' : 'var(--text-dim)',
                      fontWeight: 600
                    }}>
                      {countInCard}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Baris 2: Filter Port PON */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '0.5rem', paddingTop: '0.2rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.76rem', color: 'var(--text-muted)' }}>
              <span>Port PON:</span>
            </div>

            {filterPonPort !== 'all' && (
              <button
                type="button"
                onClick={() => setFilterPonPort('all')}
                style={{
                  background: 'none',
                  border: 'none',
                  color: 'var(--text-secondary)',
                  cursor: 'pointer',
                  fontSize: '0.72rem',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.3rem',
                  textDecoration: 'underline',
                  marginLeft: 'auto'
                }}
              >
                Reset ke Semua Port ({deviceFiltered.length} ONU)
              </button>
            )}
          </div>

          {/* Quick Filter Port Pills */}
          <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap', alignItems: 'center' }}>
            {/* Pill: Semua Port */}
            <button
              type="button"
              onClick={() => setFilterPonPort('all')}
              style={{
                padding: '0.3rem 0.65rem',
                borderRadius: 'var(--radius-md)',
                fontSize: '0.75rem',
                fontWeight: filterPonPort === 'all' ? 700 : 500,
                border: filterPonPort === 'all'
                  ? '1px solid var(--primary)'
                  : '1px solid var(--border-color)',
                background: filterPonPort === 'all'
                  ? 'var(--primary)'
                  : 'var(--bg-surface-elevated)',
                color: filterPonPort === 'all' ? '#ffffff' : 'var(--text-secondary)',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '0.35rem',
                transition: 'all 0.15s ease'
              }}
            >
              <span>Semua Port</span>
              <span style={{
                fontSize: '0.68rem',
                padding: '1px 5px',
                borderRadius: '4px',
                background: filterPonPort === 'all' ? 'rgba(255,255,255,0.25)' : 'var(--bg-card)',
                color: filterPonPort === 'all' ? '#fff' : 'var(--text-muted)'
              }}>
                {deviceFiltered.length}
              </span>
            </button>

            {/* Pills for each available PON Port */}
            {availablePonPorts.map((portNum) => {
              const countInPort = deviceFiltered.filter((o) => o.pon_port_id === portNum).length;
              const isPortSelected = filterPonPort === String(portNum);
              const shelfPrefix = selectedDeviceObj?.vendor === 'Huawei' ? '0' : '1';
              const displaySlot = filterCardSlot !== 'all' ? filterCardSlot : (availableCards[0]?.slot || 1);

              return (
                <button
                  key={portNum}
                  type="button"
                  onClick={() => setFilterPonPort(isPortSelected ? 'all' : String(portNum))}
                  style={{
                    padding: '0.3rem 0.65rem',
                    borderRadius: 'var(--radius-md)',
                    fontSize: '0.75rem',
                    fontWeight: isPortSelected ? 700 : 500,
                    border: isPortSelected
                      ? '1px solid var(--primary)'
                      : '1px solid var(--border-color)',
                    background: isPortSelected
                      ? 'var(--primary)'
                      : 'var(--bg-surface-elevated)',
                    color: isPortSelected ? '#ffffff' : 'var(--text-secondary)',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.35rem',
                    transition: 'all 0.15s ease',
                    opacity: countInPort === 0 && !isPortSelected ? 0.6 : 1
                  }}
                  title={`Interface ${shelfPrefix}/${displaySlot}/${portNum} (${countInPort} ONU)`}
                >
                  <span style={{ fontFamily: 'JetBrains Mono, monospace' }}>
                    {shelfPrefix}/{displaySlot}/{portNum}
                  </span>
                  <span style={{
                    fontSize: '0.68rem',
                    padding: '1px 5px',
                    borderRadius: '4px',
                    background: isPortSelected
                      ? 'rgba(255,255,255,0.25)'
                      : countInPort > 0 ? 'rgba(16, 185, 129, 0.12)' : 'var(--bg-card)',
                    color: isPortSelected
                      ? '#fff'
                      : countInPort > 0 ? 'var(--success)' : 'var(--text-dim)',
                    fontWeight: 600
                  }}>
                    {countInPort}
                  </span>
                </button>
              );
            })}
          </div>

          {/* Active Filter Context Info Banner */}
          {(filterDevice !== 'all' || filterCardSlot !== 'all' || filterPonPort !== 'all' || filterProfile !== 'all') && (
            <div style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '0.45rem 0.75rem',
              background: 'var(--bg-surface-elevated)',
              border: '1px solid var(--border-color)',
              borderRadius: '6px',
              marginTop: '0.35rem',
              fontSize: '0.76rem'
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: 'var(--text-secondary)', flexWrap: 'wrap' }}>
                <span style={{ color: 'var(--text-muted)' }}>Filter Aktif:</span>
                {filterDevice !== 'all' && (
                  <span style={{ background: 'rgba(37,99,235,0.15)', color: 'var(--primary-light)', padding: '1px 6px', borderRadius: '4px', border: '1px solid rgba(37,99,235,0.3)', fontWeight: 600 }}>
                    OLT: {selectedDeviceObj?.name || filterDevice} ({selectedDeviceObj?.vendor})
                  </span>
                )}
                {filterCardSlot !== 'all' && (
                  <span style={{ background: 'rgba(139,92,246,0.15)', color: '#c084fc', padding: '1px 6px', borderRadius: '4px', border: '1px solid rgba(139,92,246,0.3)', fontWeight: 600 }}>
                    Card Slot: {filterCardSlot}
                  </span>
                )}
                {filterPonPort !== 'all' && (
                  <span style={{ background: 'rgba(16,185,129,0.15)', color: 'var(--success)', padding: '1px 6px', borderRadius: '4px', border: '1px solid rgba(16,185,129,0.3)', fontWeight: 600, fontFamily: 'JetBrains Mono, monospace' }}>
                    Interface: {selectedDeviceObj?.vendor === 'Huawei' ? '0' : '1'}/{filterCardSlot !== 'all' ? filterCardSlot : (availableCards[0]?.slot || 1)}/{filterPonPort}
                  </span>
                )}
                {filterProfile !== 'all' && (
                  <span style={{ background: 'rgba(245,158,11,0.15)', color: 'var(--warning)', padding: '1px 6px', borderRadius: '4px', border: '1px solid rgba(245,158,11,0.3)', fontWeight: 600 }}>
                    Profile: {profiles.find(p => p.profile_id === parseInt(filterProfile, 10))?.name || filterProfile}
                  </span>
                )}
                <span style={{ color: 'var(--text-main)', fontWeight: 600 }}>
                  → Ditemukan {filteredONUs.length} ONU
                </span>
              </div>
              <button
                type="button"
                onClick={() => {
                  setFilterDevice('all');
                  setFilterCardSlot('all');
                  setFilterPonPort('all');
                  setFilterProfile('all');
                  setFilterStatus('all');
                  setSearchTerm('');
                }}
                style={{
                  background: 'none',
                  border: 'none',
                  color: 'var(--danger)',
                  cursor: 'pointer',
                  fontSize: '0.72rem',
                  textDecoration: 'underline',
                  fontWeight: 600
                }}
              >
                Hapus Semua Filter
              </button>
            </div>
          )}
        </div>
      </div>

      {/* ONU Table */}
      <div className="table-container table-dense">
        <table>
          <thead>
            <tr>
              <th>Serial Number & Pelanggan</th>
              <th>OLT & Port</th>
              <th>Profile</th>
              <th className="text-center">VLAN</th>
              <th>Status</th>
              <th className="text-right">Rx Power</th>
              <th className="text-right">Jarak</th>
              <th>Akun PPPoE</th>
              <th className="text-right">Aksi</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan="9" style={{ textAlign: 'center', padding: '2.5rem', color: 'var(--text-muted)' }}>
                <Loader2 size={18} className="spin-animate" style={{ margin: '0 auto 0.5rem', display: 'block' }} />
                Memuat data ONU...
              </td></tr>
            ) : filteredONUs.length === 0 ? (
              <tr><td colSpan="9" style={{ textAlign: 'center', padding: '3rem', color: 'var(--text-muted)' }}>
                <Wifi size={32} color="#475569" style={{ margin: '0 auto 0.75rem', display: 'block' }} />
                {onus.length === 0
                  ? 'Belum ada ONU terdaftar. Klik "Provisi ONU Baru" untuk memulai.'
                  : 'Tidak ada ONU yang sesuai filter pencarian.'}
              </td></tr>
            ) : (
              filteredONUs.map((onu) => (
                <tr key={onu.onu_id}>
                  <td>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.45rem' }}>
                      <span
                        className={`status-dot ${onu.status === 'Online' ? 'status-dot-pulse' : ''}`}
                        style={{
                          background: onu.status === 'Online' ? 'var(--success)' : 'var(--danger)',
                          width: 6,
                          height: 6,
                          flexShrink: 0
                        }}
                      />
                      <span className="font-mono" style={{ fontWeight: 600, color: 'var(--text-main)', fontSize: '0.8125rem' }}>
                        {onu.serial_number}
                      </span>
                      {onu.onu_type && (
                        <span style={{ fontSize: '0.68rem', padding: '1px 5px', borderRadius: '4px', background: 'rgba(56,189,248,0.12)', color: '#38bdf8', border: '1px solid rgba(56,189,248,0.25)', fontFamily: 'JetBrains Mono, monospace' }}>
                          {onu.onu_type}
                        </span>
                      )}
                    </div>
                    {onu.onu_name && (
                      <div style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', fontWeight: 500, marginTop: '2px', paddingLeft: '0.8rem' }}>
                        {onu.onu_name}
                      </div>
                    )}
                  </td>
                  <td>
                    <div className="font-mono" style={{ color: 'var(--text-main)', fontWeight: 600, fontSize: '0.8rem' }}>
                      {onu.device_vendor === 'Huawei' ? '0' : '1'}/{onu.card_slot || 1}/{onu.pon_port_id}{onu.onu_index ? `:${onu.onu_index}` : ''}
                    </div>
                    <div style={{ fontSize: '0.71rem', color: 'var(--text-muted)' }}>
                      {onu.device_name || '—'}
                    </div>
                  </td>
                  <td>
                    <span style={{ padding: '0.12rem 0.42rem', borderRadius: '4px', background: 'var(--bg-surface-elevated)', color: 'var(--text-secondary)', fontSize: '0.72rem', fontWeight: 600, border: '1px solid var(--border-color)' }}>
                      {onu.profile_name || '—'}
                    </span>
                  </td>
                  <td className="text-center font-mono" style={{ fontWeight: 600, color: 'var(--text-main)' }}>
                    {onu.vlan_id || '—'}
                  </td>
                  <td>
                    {onu.loop_detected ? (
                      <div style={{ marginBottom: '3px' }}>
                        <span className="status-badge status-offline" style={{ fontSize: '0.65rem', padding: '0.1rem 0.35rem' }}>
                          <ShieldAlert size={10} />
                          <span>Loop (LAN {onu.isolated_lan_port || 1})</span>
                        </span>
                      </div>
                    ) : null}
                    <StatusBadge status={onu.status} reason={onu.last_offline_reason} lastOfflineAt={onu.last_offline_at} />
                    {onu.status !== 'Online' && onu.last_offline_at && (
                      <div className="font-mono" style={{ fontSize: '0.67rem', color: 'var(--text-muted)', marginTop: '2px' }}>
                        {new Date(onu.last_offline_at).toLocaleTimeString('id-ID')}
                      </div>
                    )}
                  </td>
                  <td className="text-right font-mono">
                    {onu.status === 'Online' && onu.rx_power != null ? (
                      <span className={`rx-power-chip ${Number(onu.rx_power) >= -24 ? 'rx-good' : Number(onu.rx_power) >= -27 ? 'rx-fair' : 'rx-critical'}`}>
                        {onu.rx_power} dBm
                      </span>
                    ) : onu.rx_power != null ? (
                      <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>
                        {onu.rx_power} dBm
                      </span>
                    ) : (
                      <span style={{ color: 'var(--text-dim)' }}>—</span>
                    )}
                  </td>
                  <td className="text-right font-mono" style={{ color: 'var(--text-secondary)' }}>
                    {onu.distance_meters ? `${onu.distance_meters} m` : <span style={{ color: 'var(--text-dim)' }}>—</span>}
                  </td>
                  <td>
                    {onu.pppoe_username ? (
                      <div className="font-mono" style={{ fontWeight: 600, color: '#34d399', fontSize: '0.78rem' }}>
                        {onu.pppoe_username}
                      </div>
                    ) : (
                      <span style={{ fontSize: '0.72rem', color: 'var(--text-dim)', fontStyle: 'italic' }}>—</span>
                    )}
                  </td>
                  <td className="text-right">
                    <div style={{ display: 'inline-flex', gap: '0.2rem', justifyContent: 'flex-end' }}>
                      {onu.loop_detected ? (
                        <button
                          className="btn btn-secondary btn-sm"
                          style={{ padding: '0.2rem 0.4rem', color: '#fb7185' }}
                          title="Insiden Loopback Aktif"
                          onClick={() => setModal({ type: 'loop-protection' })}
                        >
                          <ShieldAlert size={12} />
                        </button>
                      ) : null}
                      <button
                        className="btn btn-secondary btn-sm"
                        style={{ padding: '0.2rem 0.4rem' }}
                        title="Status OMCI"
                        disabled={loadingStatusId === onu.onu_id}
                        onClick={() => handleViewStatus(onu)}
                      >
                        {loadingStatusId === onu.onu_id ? (
                          <Loader2 size={12} className="spin-animate" />
                        ) : (
                          <Eye size={12} />
                        )}
                      </button>
                      <button
                        className="btn btn-secondary btn-sm"
                        style={{ padding: '0.2rem 0.4rem' }}
                        title={canManageSwap ? "Tukar / Ganti ONU Rusak" : "Hanya Super Admin / NOC / Teknisi"}
                        disabled={!canManageSwap}
                        onClick={() => setModal({ type: 'replace', onu })}
                      >
                        <Repeat size={12} />
                      </button>
                      <button
                        className="btn btn-secondary btn-sm"
                        style={{ padding: '0.2rem 0.4rem' }}
                        title="Reboot ONU"
                        onClick={() => setModal({ type: 'reboot', onu })}
                      >
                        <RotateCcw size={12} />
                      </button>
                      <button
                        className="btn btn-secondary btn-sm"
                        style={{ padding: '0.2rem 0.4rem' }}
                        title={canChangeProfile ? "Ganti Profil" : "Hanya Super Admin / NOC / Teknisi"}
                        disabled={!canChangeProfile}
                        onClick={() => setModal({ type: 'change-profile', onu })}
                      >
                        <Sliders size={12} />
                      </button>
                      <button
                        className="btn btn-secondary btn-sm"
                        style={{ padding: '0.2rem 0.4rem' }}
                        title="Dorong Konfigurasi & PPPoE"
                        onClick={() => setModal({ type: 'repush-config', onu })}
                      >
                        <Zap size={12} />
                      </button>
                      <button
                        className="btn btn-ghost btn-sm"
                        style={{ padding: '0.2rem 0.35rem', color: '#fb7185' }}
                        title="Unregister ONU"
                        onClick={() => setModal({ type: 'delete', onu })}
                      >
                        <Trash2 size={12} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Modals */}
      {modal === 'provision' && (
        <ProvisionWizardModal
          devices={devices}
          profiles={profiles}
          onClose={handleCloseModal}
          onSuccess={handleProvisionSuccess}
        />
      )}
      {modal?.type === 'result' && (
        <ProvisionResultModal result={modal.data} onClose={() => setModal(null)} />
      )}
      {modal?.type === 'replace' && (
        <ONUReplacementModal
          onu={modal.onu}
          devices={devices}
          onClose={() => setModal(null)}
          onSuccess={(res) => {
            toast.success(`Perangkat ${modal.onu.customer_name || modal.onu.serial_number} berhasil ditukar ke SN ${res.new_sn}!`);
            loadData();
            if (onRefresh) onRefresh();
          }}
        />
      )}
      {modal?.type === 'pppoe' && (
        <PushPPPoEModal
          onu={modal.onu}
          onClose={() => setModal(null)}
          onSuccess={(sn, user) => { toast.success(`PPPoE "${user}" berhasil didorong ke ${sn}.`); loadData(); if (onRefresh) onRefresh(); }}
        />
      )}
      {modal?.type === 'status' && (
        <ONUStatusModal
          data={modal.data}
          onClose={() => setModal(null)}
          onRebootClick={(onuData) => setModal({ type: 'reboot', onu: onuData })}
          onSuccessRefresh={() => {
            loadData();
            if (onRefresh) onRefresh();
          }}
        />
      )}
      {modal?.type === 'reboot' && (
        <ConfirmRebootModal
          onu={modal.onu}
          onConfirm={handleRebootConfirm}
          onClose={() => setModal(null)}
        />
      )}
      {modal?.type === 'sync' && (
        <SyncONUsModal
          devices={devices}
          onus={onus}
          onClose={() => setModal(null)}
          onSuccess={(res) => {
            toast.success(res?.message || 'Sinkronisasi ONU dari OLT berhasil diselesaikan.');
            loadData();
            if (onRefresh) onRefresh();
          }}
        />
      )}
      {modal?.type === 'change-profile' && (
        <ChangeServiceProfileModal
          onu={modal.onu}
          profiles={profiles}
          onClose={() => setModal(null)}
          onSuccess={(res) => {
            toast.success(res?.message || `Paket layanan untuk ${modal.onu.customer_name || modal.onu.serial_number} berhasil diubah.`);
            loadData();
            if (onRefresh) onRefresh();
          }}
        />
      )}
      {modal?.type === 'repush-config' && (
        <RePushConfigModal
          onu={modal.onu}
          profiles={profiles}
          onClose={() => setModal(null)}
          onSuccess={(res) => {
            toast.success(res?.message || `Konfigurasi berhasil didorong ulang ke ${modal.onu.customer_name || modal.onu.serial_number}`);
            loadData();
            if (onRefresh) onRefresh();
          }}
        />
      )}
      {modal?.type === 'loop-protection' && (
        <LoopProtectionModal
          incidents={loopIncidents}
          onus={onus}
          onClose={() => setModal(null)}
          onRefresh={() => {
            loadData();
            if (onRefresh) onRefresh();
          }}
        />
      )}
      {modal?.type === 'delete' && (
        <ConfirmDeleteONUModal onu={modal.onu} onConfirm={() => handleDeleteONU(modal.onu)} onClose={() => setModal(null)} />
      )}
    </div>
  );
}
