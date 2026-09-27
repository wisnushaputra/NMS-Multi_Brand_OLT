import React, { useState, useEffect, useRef } from 'react';
import {
  Cpu, Terminal, Plus, RefreshCw, Trash2, CheckCircle2, AlertCircle,
  Play, Server, Edit3, X, Wifi, WifiOff, AlertTriangle, Clock, ChevronDown,
  Copy, Download
} from 'lucide-react';
import { createDevice, updateDevice, deleteDevice, getDeviceStatus, executeCommand, detectDeviceCards, detectCardsRaw } from '../services/api';

/* ── Inline Toast Notification ──────────────────────────────────────── */
function ToastContainer({ toasts, onRemove }) {
  return (
    <div style={{
      position: 'fixed', top: '1.5rem', right: '1.5rem', zIndex: 9999,
      display: 'flex', flexDirection: 'column', gap: '0.6rem', pointerEvents: 'none'
    }}>
      {toasts.map((t) => (
        <div key={t.id} className={`toast toast-${t.type}`} style={{ pointerEvents: 'all' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', flex: 1 }}>
            {t.type === 'success' && <CheckCircle2 size={16} />}
            {t.type === 'error' && <AlertCircle size={16} />}
            {t.type === 'warning' && <AlertTriangle size={16} />}
            <span style={{ fontSize: '0.875rem' }}>{t.message}</span>
          </div>
          <button onClick={() => onRemove(t.id)} style={{ background: 'none', border: 'none', color: 'inherit', cursor: 'pointer', opacity: 0.6, padding: '2px' }}>
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
    setToasts((prev) => [...prev, { id, message, type }]);
    setTimeout(() => setToasts((prev) => prev.filter((t) => t.id !== id)), 4000);
  };
  const remove = (id) => setToasts((prev) => prev.filter((t) => t.id !== id));
  return { toasts, toast: { success: (m) => add(m, 'success'), error: (m) => add(m, 'error'), warning: (m) => add(m, 'warning') }, remove };
}

/* ── Status badge helper ─────────────────────────────────────────────── */
function StatusBadge({ status }) {
  const s = (status || 'unknown').toLowerCase();
  let cls = 'status-warning';
  if (s === 'online') cls = 'status-online';
  else if (s === 'offline') cls = 'status-offline';
  return (
    <div className={`status-badge ${cls}`}>
      <span className={`status-dot ${s === 'online' ? 'status-dot-pulse' : ''}`} />
      <span>{status || 'Unknown'}</span>
    </div>
  );
}

/* ── Vendor color helper ─────────────────────────────────────────────── */
function vendorStyle(vendor) {
  if (vendor === 'ZTE') return { bg: 'rgba(59,130,246,0.12)', color: 'var(--primary)', border: 'rgba(59,130,246,0.3)' };
  if (vendor === 'Huawei') return { bg: 'rgba(239,68,68,0.12)', color: 'var(--danger)', border: 'rgba(239,68,68,0.3)' };
  return { bg: 'rgba(16,185,129,0.12)', color: 'var(--success)', border: 'rgba(16,185,129,0.3)' };
}

/* ── Empty form template ─────────────────────────────────────────────── */
const emptyForm = {
  name: '',
  vendor: 'ZTE',
  ip_address: '',
  port: 22,
  pon_ports_count: 16,
  username: '',
  password: '',
  cards: [
    { slot: 1, type: 'GTGH', ports: 16, status: 'OFFLINE' },
    { slot: 2, type: 'GTGH', ports: 16, status: 'INSERVICE' }
  ]
};

/* ── Preset CLI commands per vendor ─────────────────────────────────── */
function getPresetCommands(vendor) {
  if (vendor === 'ZTE') return [
    { label: 'Uncfg ONU', cmd: 'show gpon onu uncfg' },
    { label: 'ONU State', cmd: 'show gpon onu state' },
    { label: 'Version', cmd: 'show version' },
    { label: 'Cards Info', cmd: 'show card' },
    { label: 'GPON Status', cmd: 'show gpon onu detail-info gpon-onu_1/2/1:1' }
  ];
  if (vendor === 'Huawei') return [
    { label: 'Autofind', cmd: 'display ont autofind all' },
    { label: 'Board Info', cmd: 'display board 0' },
    { label: 'Version', cmd: 'display version' },
    { label: 'ONU Info', cmd: 'display ont info 0 all' }
  ];
  return [
    { label: 'Disc ONU', cmd: 'show disc_onu' },
    { label: 'Card Info', cmd: 'show card' },
    { label: 'Version', cmd: 'show version' },
    { label: 'OLT Status', cmd: 'show system' }
  ];
}

/* ── Device Form Modal (Add / Edit) ─────────────────────────────────── */
function DeviceFormModal({ mode, initial, onClose, onSave, deviceId }) {
  const [form, setForm] = useState(() => {
    if (initial) {
      let initCards = initial.cards;
      if (typeof initCards === 'string') {
        try { initCards = JSON.parse(initCards); } catch { initCards = []; }
      }
      if (!initCards || initCards.length === 0) {
        initCards = [
          { slot: 1, type: initial.vendor === 'ZTE' ? 'GTGH' : 'GPFD', ports: initial.pon_ports_count || 16, status: 'INSERVICE' }
        ];
      }
      return { ...initial, cards: initCards };
    }
    return emptyForm;
  });

  const [saving, setSaving] = useState(false);
  const [detecting, setDetecting] = useState(false);
  const [detectMsg, setDetectMsg] = useState(null);
  const isEdit = mode === 'edit';

  const set = (k, v) => setForm((p) => ({ ...p, [k]: v }));

  // Add new card slot
  const handleAddCard = () => {
    const nextSlot = (form.cards && form.cards.length > 0)
      ? Math.max(...form.cards.map(c => parseInt(c.slot, 10) || 1)) + 1
      : 1;
    const newCard = {
      slot: nextSlot,
      type: form.vendor === 'ZTE' ? 'GTGH' : 'GPFD',
      ports: 16,
      status: 'INSERVICE'
    };
    const updatedCards = [...(form.cards || []), newCard];
    set('cards', updatedCards);
    recalcPonPorts(updatedCards);
  };

  // Remove card slot
  const handleRemoveCard = (index) => {
    const updatedCards = (form.cards || []).filter((_, i) => i !== index);
    set('cards', updatedCards);
    recalcPonPorts(updatedCards);
  };

  // Update card field
  const handleCardChange = (index, field, value) => {
    const updatedCards = [...(form.cards || [])];
    updatedCards[index] = {
      ...updatedCards[index],
      [field]: field === 'slot' || field === 'ports' ? parseInt(value, 10) || 1 : value
    };
    set('cards', updatedCards);
    if (field === 'ports' || field === 'status') {
      recalcPonPorts(updatedCards);
    }
  };

  const recalcPonPorts = (cards) => {
    const isCardUp = (s) => ['INSERVICE', 'HWONLINE', 'ONLINE', 'CONFIGING'].includes((s || '').toUpperCase());
    const activeCards = cards.filter(c => isCardUp(c.status) && (parseInt(c.ports, 10) > 0));
    const totalPorts = activeCards.length > 0
      ? activeCards.reduce((acc, c) => acc + (parseInt(c.ports, 10) || 0), 0)
      : cards.reduce((acc, c) => acc + (parseInt(c.ports, 10) || 0), 0);
    if (totalPorts > 0) {
      set('pon_ports_count', totalPorts);
    }
  };

  // Auto-detect cards from hardware via SSH
  const handleDetectHardwareCards = async () => {
    if (!form.ip_address) {
      setDetectMsg({ ok: false, text: 'Harap isi IP Address terlebih dahulu sebelum deteksi card.' });
      return;
    }
    setDetecting(true);
    setDetectMsg(null);
    try {
      let res;
      if (isEdit && deviceId) {
        res = await detectDeviceCards(deviceId);
      } else {
        res = await detectCardsRaw({
          vendor: form.vendor,
          ip_address: form.ip_address,
          port: parseInt(form.port, 10) || 22,
          credentials: { user: form.username || 'zte', pass: form.password || 'zte' }
        });
      }

      if (res && res.cards && res.cards.length > 0) {
        // Filter only PON cards if available, or all cards
        const ponCards = res.cards.filter(c => c.is_pon !== false);
        const finalCards = ponCards.length > 0 ? ponCards : res.cards;
        set('cards', finalCards);
        recalcPonPorts(finalCards);
        setDetectMsg({
          ok: true,
          text: `Berhasil deteksi ${finalCards.length} card dari OLT: ${finalCards.map(c => `Slot ${c.slot} (${c.type} - ${c.status})`).join(', ')}`
        });
      } else {
        setDetectMsg({ ok: false, text: 'Tidak ada data card yang ditemukan dari hardware OLT.' });
      }
    } catch (err) {
      setDetectMsg({ ok: false, text: `Gagal deteksi card: ${err.message}` });
    } finally {
      setDetecting(false);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      await onSave(form);
      onClose();
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="modal-overlay">
      <div className="modal-card" style={{ maxWidth: '640px' }}>
        <div className="modal-header">
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
            <Server size={20} color="#60a5fa" />
            <h3 style={{ fontWeight: 700 }}>{isEdit ? 'Edit Perangkat OLT' : 'Tambah Perangkat OLT Baru'}</h3>
          </div>
          <button className="btn btn-secondary" style={{ padding: '0.25rem 0.5rem' }} onClick={onClose}>
            <X size={16} />
          </button>
        </div>

        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label>Nama Perangkat OLT</label>
            <input type="text" className="form-input" required value={form.name} onChange={(e) => set('name', e.target.value)} placeholder="Misal: OLT-ZTE-WEST-01" />
          </div>

          <div className="form-group">
            <label>Vendor OLT</label>
            <select className="form-select" value={form.vendor} onChange={(e) => set('vendor', e.target.value)}>
              <option value="ZTE">ZTE (C300 / C320 Series)</option>
              <option value="Huawei">Huawei (MA5608T / MA5680T Series)</option>
              <option value="Fiberhome">Fiberhome (AN5516 Series)</option>
            </select>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '1rem' }}>
            <div className="form-group">
              <label>IP Address</label>
              <input type="text" className="form-input" required value={form.ip_address} onChange={(e) => set('ip_address', e.target.value)} placeholder="192.168.1.10" />
            </div>
            <div className="form-group">
              <label>SSH Port</label>
              <input type="number" className="form-input" required value={form.port} onChange={(e) => set('port', e.target.value)} />
            </div>
          </div>

          {/* ── CARD / SLOT CONFIGURATION ──────────────────────────────── */}
          <div style={{
            background: 'var(--bg-surface-elevated)',
            border: '1px solid var(--border-color)',
            borderRadius: '8px',
            padding: '1rem',
            marginBottom: '1.25rem'
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
              <div>
                <span style={{ fontWeight: 700, fontSize: '0.9rem', color: 'var(--text-main)' }}>
                  Daftar Card / Slot OLT
                </span>
                <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginLeft: '0.5rem' }}>
                  (Tentukan slot card GPON yang terpasang)
                </span>
              </div>
              <div style={{ display: 'flex', gap: '0.4rem' }}>
                <button
                  type="button"
                  className="btn btn-secondary"
                  style={{ fontSize: '0.72rem', padding: '0.25rem 0.6rem' }}
                  onClick={handleDetectHardwareCards}
                  disabled={detecting}
                  title="Deteksi card langsung dari CLI show card OLT via SSH"
                >
                  {detecting ? <RefreshCw size={12} className="spin-animate" /> : <Wifi size={12} />}
                  {detecting ? 'Mendeteksi...' : '⚡ Deteksi Otomatis'}
                </button>
                <button
                  type="button"
                  className="btn btn-secondary"
                  style={{ fontSize: '0.72rem', padding: '0.25rem 0.6rem' }}
                  onClick={handleAddCard}
                >
                  <Plus size={12} /> Tambah Slot
                </button>
              </div>
            </div>

            {detectMsg && (
              <div style={{
                fontSize: '0.78rem',
                padding: '0.4rem 0.6rem',
                borderRadius: '6px',
                marginBottom: '0.75rem',
                background: detectMsg.ok ? 'rgba(16,185,129,0.1)' : 'rgba(244,63,94,0.1)',
                color: detectMsg.ok ? '#34d399' : '#fb7185',
                border: `1px solid ${detectMsg.ok ? 'rgba(16,185,129,0.25)' : 'rgba(244,63,94,0.25)'}`
              }}>
                {detectMsg.text}
              </div>
            )}

            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
              {(form.cards || []).map((card, idx) => (
                <div key={idx} style={{
                  display: 'grid',
                  gridTemplateColumns: '80px 1.4fr 90px 110px 36px',
                  gap: '0.5rem',
                  alignItems: 'center',
                  background: 'var(--bg-surface)',
                  padding: '0.5rem 0.6rem',
                  borderRadius: '6px',
                  border: ['INSERVICE', 'HWONLINE', 'ONLINE', 'CONFIGING'].includes((card.status || '').toUpperCase()) ? '1px solid rgba(59,130,246,0.3)' : '1px solid rgba(255,255,255,0.06)'
                }}>
                  <div>
                    <label style={{ fontSize: '0.68rem', color: '#94a3b8', display: 'block', marginBottom: '2px' }}>Slot #</label>
                    <input
                      type="number"
                      className="form-input"
                      style={{ padding: '0.25rem 0.4rem', fontSize: '0.8rem' }}
                      value={card.slot}
                      onChange={(e) => handleCardChange(idx, 'slot', e.target.value)}
                      min={1}
                      max={16}
                      required
                    />
                  </div>
                  <div>
                    <label style={{ fontSize: '0.68rem', color: '#94a3b8', display: 'block', marginBottom: '2px' }}>Tipe Card</label>
                    <input
                      type="text"
                      className="form-input"
                      style={{ padding: '0.25rem 0.4rem', fontSize: '0.8rem' }}
                      value={card.type}
                      onChange={(e) => handleCardChange(idx, 'type', e.target.value)}
                      placeholder="Misal: GTGH, GPFD"
                      required
                    />
                  </div>
                  <div>
                    <label style={{ fontSize: '0.68rem', color: '#94a3b8', display: 'block', marginBottom: '2px' }}>Port PON</label>
                    <input
                      type="number"
                      className="form-input"
                      style={{ padding: '0.25rem 0.4rem', fontSize: '0.8rem' }}
                      value={card.ports}
                      onChange={(e) => handleCardChange(idx, 'ports', e.target.value)}
                      min={0}
                      max={32}
                      required
                    />
                  </div>
                  <div>
                    <label style={{ fontSize: '0.68rem', color: '#94a3b8', display: 'block', marginBottom: '2px' }}>Status Card</label>
                    <select
                      className="form-select"
                      style={{ padding: '0.25rem 0.4rem', fontSize: '0.78rem' }}
                      value={card.status || 'INSERVICE'}
                      onChange={(e) => handleCardChange(idx, 'status', e.target.value)}
                    >
                      <option value="INSERVICE">INSERVICE</option>
                      <option value="HWONLINE">HWONLINE</option>
                      <option value="CONFIGING">CONFIGING</option>
                      <option value="OFFLINE">OFFLINE</option>
                    </select>
                  </div>
                  <div style={{ paddingTop: '14px' }}>
                    <button
                      type="button"
                      className="btn btn-secondary"
                      style={{ padding: '0.3rem', color: '#fb7185' }}
                      onClick={() => handleRemoveCard(idx)}
                      disabled={(form.cards || []).length <= 1}
                      title="Hapus slot card ini"
                    >
                      <X size={14} />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="form-group">
            <label>Total Port PON Aktif</label>
            <input type="number" className="form-input" required value={form.pon_ports_count} onChange={(e) => set('pon_ports_count', e.target.value)} min={1} max={64} />
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
            <div className="form-group">
              <label>SSH Username</label>
              <input type="text" className="form-input" required={!isEdit} value={form.username} onChange={(e) => set('username', e.target.value)} placeholder={isEdit ? '(tidak diubah)' : 'zte'} />
            </div>
            <div className="form-group">
              <label>SSH Password</label>
              <input type="password" className="form-input" required={!isEdit} value={form.password} onChange={(e) => set('password', e.target.value)} placeholder={isEdit ? '(tidak diubah)' : '••••••••'} />
            </div>
          </div>

          <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'flex-end', marginTop: '1.25rem' }}>
            <button type="button" className="btn btn-secondary" onClick={onClose}>Batal</button>
            <button type="submit" className="btn btn-primary" disabled={saving}>
              {saving ? 'Menyimpan...' : isEdit ? 'Simpan Perubahan' : 'Tambah OLT'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

/* ── Confirm Delete Modal ────────────────────────────────────────────── */
function ConfirmDeleteModal({ device, onConfirm, onClose }) {
  const [loading, setLoading] = useState(false);
  return (
    <div className="modal-overlay">
      <div className="modal-card" style={{ maxWidth: '440px' }}>
        <div style={{ textAlign: 'center', padding: '0.5rem 0 1.5rem' }}>
          <div style={{ width: '56px', height: '56px', borderRadius: '50%', background: 'rgba(244,63,94,0.12)', border: '1px solid rgba(244,63,94,0.3)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 1rem' }}>
            <Trash2 size={22} color="#fb7185" />
          </div>
          <h3 style={{ fontWeight: 700, marginBottom: '0.5rem', color: 'var(--text-main)' }}>Hapus Perangkat OLT?</h3>
          <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem' }}>
            Perangkat <strong style={{ color: 'var(--text-main)' }}>{device.name}</strong> ({device.vendor} — {device.ip_address}) akan dihapus beserta semua data ONU yang terhubung. Tindakan ini <strong style={{ color: '#fb7185' }}>tidak dapat dibatalkan</strong>.
          </p>
        </div>
        <div style={{ display: 'flex', gap: '0.75rem' }}>
          <button className="btn btn-secondary" style={{ flex: 1 }} onClick={onClose}>Batalkan</button>
          <button
            className="btn btn-danger" style={{ flex: 1, justifyContent: 'center' }}
            disabled={loading}
            onClick={async () => { setLoading(true); await onConfirm(); }}
          >
            {loading ? 'Menghapus...' : 'Ya, Hapus'}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ── CLI Terminal Panel ──────────────────────────────────────────────── */
function CliTerminal({ device, onClose }) {
  const [cliInput, setCliInput] = useState(getPresetCommands(device.vendor)[0].cmd);
  const [output, setOutput] = useState('');
  const [history, setHistory] = useState([]);
  const [histIdx, setHistIdx] = useState(-1);
  const [executing, setExecuting] = useState(false);
  const bodyRef = useRef(null);

  const scrollToBottom = () => {
    if (bodyRef.current) bodyRef.current.scrollTop = bodyRef.current.scrollHeight;
  };

  const runCommand = async (cmd) => {
    if (!cmd.trim() || executing) return;
    setExecuting(true);
    const ts = new Date().toLocaleTimeString('id-ID');
    try {
      const res = await executeCommand(device.device_id, cmd);
      const line = `[${ts}] $ ${cmd}\n${res.output}\n`;
      setOutput((prev) => prev + line + '\n');
      setHistory((prev) => [cmd, ...prev.slice(0, 49)]);
      setHistIdx(-1);
    } catch (err) {
      setOutput((prev) => prev + `[${ts}] $ ${cmd}\n% ERROR: ${err.message}\n\n`);
    } finally {
      setExecuting(false);
      setTimeout(scrollToBottom, 50);
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter') { runCommand(cliInput); return; }
    if (e.key === 'ArrowUp') {
      e.preventDefault();
      const ni = Math.min(histIdx + 1, history.length - 1);
      setHistIdx(ni);
      if (history[ni]) setCliInput(history[ni]);
    }
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      const ni = Math.max(histIdx - 1, -1);
      setHistIdx(ni);
      setCliInput(ni < 0 ? '' : history[ni]);
    }
  };

  const copyOutput = () => {
    navigator.clipboard.writeText(output).catch(() => {});
  };

  const vs = vendorStyle(device.vendor);

  return (
    <div className="card" style={{ borderColor: vs.border, marginTop: '1.5rem' }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem', paddingBottom: '0.75rem', borderBottom: '1px solid rgba(255,255,255,0.07)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          <Terminal size={20} color={vs.color} />
          <div>
            <div style={{ fontWeight: 700, color: vs.color, fontSize: '0.95rem' }}>
              CLI Terminal — {device.name}
            </div>
            <div style={{ fontSize: '0.75rem', color: '#64748b' }}>
              {device.vendor} Adapter · ssh://{device.ip_address}:{device.port}
            </div>
          </div>
        </div>
        <div style={{ display: 'flex', gap: '0.5rem' }}>
          <button className="btn btn-secondary" style={{ fontSize: '0.75rem', padding: '0.3rem 0.65rem' }} onClick={copyOutput} title="Salin output">
            <Copy size={13} /> Salin
          </button>
          <button className="btn btn-secondary" style={{ fontSize: '0.75rem', padding: '0.3rem 0.65rem' }} onClick={() => setOutput('')} title="Bersihkan layar">
            Hapus Layar
          </button>
          <button className="btn btn-secondary" style={{ fontSize: '0.75rem', padding: '0.3rem 0.65rem' }} onClick={onClose}>
            <X size={13} /> Tutup
          </button>
        </div>
      </div>

      {/* Preset Commands */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.4rem', marginBottom: '0.75rem' }}>
        <span style={{ fontSize: '0.78rem', color: '#64748b', alignSelf: 'center', marginRight: '0.25rem' }}>Preset:</span>
        {getPresetCommands(device.vendor).map(({ label, cmd }) => (
          <button key={cmd} className="btn btn-secondary" style={{ fontSize: '0.73rem', padding: '0.2rem 0.55rem' }} onClick={() => { setCliInput(cmd); }}>
            {label}
          </button>
        ))}
      </div>

      {/* Input bar */}
      <div style={{ display: 'flex', gap: '0.6rem', marginBottom: '0.75rem' }}>
        <input
          type="text"
          className="form-input"
          style={{ flex: 1, fontFamily: 'JetBrains Mono, monospace', fontSize: '0.875rem' }}
          value={cliInput}
          onChange={(e) => setCliInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Ketik command CLI (↑↓ untuk histori)..."
          disabled={executing}
        />
        <button className="btn btn-primary" style={{ whiteSpace: 'nowrap' }} onClick={() => runCommand(cliInput)} disabled={executing || !cliInput.trim()}>
          <Play size={14} />
          {executing ? 'Menjalankan...' : 'Eksekusi'}
        </button>
      </div>

      {/* Terminal window */}
      <div className="terminal-window">
        <div className="terminal-header">
          <div className="terminal-dot dot-red" />
          <div className="terminal-dot dot-yellow" />
          <div className="terminal-dot dot-green" />
          <span style={{ fontSize: '0.72rem', color: '#94a3b8', marginLeft: '0.35rem' }}>
            {device.vendor} OLT · {device.ip_address}:{device.port}
          </span>
        </div>
        <div className="terminal-body" ref={bodyRef} style={{ minHeight: '160px', maxHeight: '380px' }}>
          {output || `% CLI Session Ready — ${device.name} (${device.vendor})\n% Pilih preset atau ketik command, lalu tekan Enter atau klik Eksekusi.\n% Tekan ↑↓ untuk navigasi histori perintah.\n`}
        </div>
      </div>
    </div>
  );
}

/* ── Device Card ─────────────────────────────────────────────────────── */
function DeviceCard({ dev, onEdit, onDelete, onOpenTerminal, terminalOpen, isReadOnly }) {
  const [testing, setTesting] = useState(false);
  const [liveStatus, setLiveStatus] = useState(dev.status);
  const [testResult, setTestResult] = useState(null);
  const { toast } = useToast();
  const vs = vendorStyle(dev.vendor);

  const handleTestConn = async () => {
    setTesting(true);
    setTestResult(null);
    try {
      const res = await getDeviceStatus(dev.device_id);
      setLiveStatus(res.status);
      setTestResult({ ok: res.status === 'Online', msg: `${res.status} — ${res.details?.version || res.details?.prompt || 'OK'}` });
    } catch (err) {
      setLiveStatus('Offline');
      setTestResult({ ok: false, msg: err.message });
    } finally {
      setTesting(false);
    }
  };

  return (
    <div className="card" style={{ borderColor: terminalOpen ? vs.border : undefined, padding: '1.25rem' }}>
      {/* Header row */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1rem', flexWrap: 'wrap', gap: '0.75rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem' }}>
          <span style={{
            width: '9px',
            height: '9px',
            borderRadius: '50%',
            background: liveStatus?.toLowerCase() === 'online' ? 'var(--success)' : 'var(--danger)',
            flexShrink: 0
          }} />
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <h3 style={{ fontSize: '1.02rem', fontWeight: 700, margin: 0, color: 'var(--text-main)', letterSpacing: '-0.01em' }}>{dev.name}</h3>
              <span style={{ fontSize: '0.68rem', fontWeight: 600, padding: '1px 6px', borderRadius: '3px', background: 'var(--bg-surface-elevated)', border: '1px solid var(--border-color)', color: 'var(--text-secondary)' }}>
                {dev.vendor}
              </span>
            </div>
            <div style={{ fontSize: '0.76rem', color: 'var(--text-muted)', fontFamily: 'JetBrains Mono, monospace', marginTop: '2px' }}>
              {dev.ip_address}:{dev.port}
            </div>
          </div>
        </div>
        <StatusBadge status={liveStatus} />
      </div>

      {/* Meta grid - dense telemetry strip */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: '1fr 1fr 1fr',
        gap: '0.5rem',
        background: 'var(--bg-surface-elevated)',
        border: '1px solid var(--border-color)',
        padding: '0.65rem 0.85rem',
        borderRadius: 'var(--radius-sm)',
        marginBottom: '0.85rem',
        fontSize: '0.8rem'
      }}>
        <div>
          <div style={{ color: 'var(--text-muted)', marginBottom: '1px', fontSize: '0.66rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.04em' }}>Vendor HW</div>
          <div style={{ fontWeight: 700, color: 'var(--text-main)', fontSize: '0.9rem' }}>{dev.vendor}</div>
        </div>
        <div>
          <div style={{ color: 'var(--text-muted)', marginBottom: '1px', fontSize: '0.66rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.04em' }}>PON Ports</div>
          <div style={{ fontWeight: 700, color: 'var(--text-main)', fontSize: '0.9rem', fontFamily: 'JetBrains Mono, monospace' }}>{dev.pon_ports_count}</div>
        </div>
        <div>
          <div style={{ color: 'var(--text-muted)', marginBottom: '1px', fontSize: '0.66rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.04em' }}>ONU Aktif</div>
          <div style={{ fontWeight: 700, color: 'var(--success)', fontSize: '0.9rem', fontFamily: 'JetBrains Mono, monospace' }}>{dev.onu_count ?? 0}</div>
        </div>
      </div>

      {/* Cards info row */}
      {dev.cards && dev.cards.length > 0 && (
        <div style={{
          background: 'var(--bg-surface-elevated)',
          border: '1px solid var(--border-color)',
          borderRadius: 'var(--radius-sm)',
          padding: '0.55rem 0.75rem',
          marginBottom: '0.85rem',
          fontSize: '0.76rem'
        }}>
          <div style={{ fontWeight: 600, color: 'var(--text-muted)', fontSize: '0.68rem', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: '0.35rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span>Hardware Slot ({dev.cards.length} Card Terpasang):</span>
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.35rem' }}>
            {dev.cards.map((c, i) => {
              const isUp = ['INSERVICE', 'HWONLINE', 'ONLINE', 'CONFIGING'].includes((c.status || '').toUpperCase());
              return (
                <div key={i} style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.35rem',
                  background: 'var(--bg-card)',
                  border: '1px solid var(--border-color)',
                  padding: '0.2rem 0.45rem',
                  borderRadius: '3px',
                  fontFamily: 'JetBrains Mono, monospace'
                }}>
                  <span style={{
                    width: '5px',
                    height: '5px',
                    borderRadius: '50%',
                    background: isUp ? 'var(--success)' : 'var(--text-muted)'
                  }} />
                  <span style={{ fontWeight: 700, color: 'var(--text-main)' }}>
                    Slot {c.slot}:
                  </span>
                  <span style={{ color: 'var(--text-secondary)' }}>{c.type || 'GPON'} ({c.ports}p)</span>
                  <span style={{ color: isUp ? 'var(--success)' : 'var(--danger)', fontSize: '0.66rem', fontWeight: 600 }}>
                    {c.status}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Test result inline */}
      {testResult && (
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.76rem', padding: '0.4rem 0.7rem', borderRadius: 'var(--radius-sm)', marginBottom: '0.75rem', background: testResult.ok ? 'rgba(16,185,129,0.08)' : 'rgba(244,63,94,0.08)', color: testResult.ok ? 'var(--success)' : 'var(--danger)', border: `1px solid ${testResult.ok ? 'rgba(16,185,129,0.2)' : 'rgba(244,63,94,0.2)'}` }}>
          {testResult.ok ? <CheckCircle2 size={13} /> : <AlertCircle size={13} />}
          {testResult.msg}
        </div>
      )}

      {/* Action row */}
      <div style={{ display: 'flex', gap: '0.45rem', justifyContent: 'flex-end', flexWrap: 'wrap' }}>
        <button className="btn btn-secondary" style={{ fontSize: '0.74rem', padding: '0.32rem 0.65rem' }} onClick={handleTestConn} disabled={testing}>
          {testing ? <RefreshCw size={12} className="spin-animate" /> : <Wifi size={12} />}
          {testing ? 'Ping...' : 'Test SSH'}
        </button>
        {!isReadOnly && (
          <>
            <button className="btn btn-secondary" style={{ fontSize: '0.74rem', padding: '0.32rem 0.65rem' }} onClick={() => onEdit(dev)}>
              <Edit3 size={12} /> Edit
            </button>
            <button
              className={`btn ${terminalOpen ? 'btn-primary' : 'btn-secondary'}`}
              style={{ fontSize: '0.74rem', padding: '0.32rem 0.65rem' }}
              onClick={() => onOpenTerminal(dev)}
            >
              <Terminal size={12} /> CLI
            </button>
            <button className="btn btn-danger" style={{ fontSize: '0.74rem', padding: '0.32rem 0.5rem' }} onClick={() => onDelete(dev)}>
              <Trash2 size={12} />
            </button>
          </>
        )}
      </div>
    </div>
  );
}

/* ── Main DeviceManager ──────────────────────────────────────────────── */
export default function DeviceManager({ devices, onRefresh, currentUser }) {
  const isReadOnly = currentUser?.role === 'helpdesk';
  const [modal, setModal] = useState(null); // null | { type: 'add' } | { type: 'edit', device } | { type: 'delete', device }
  const [terminalDevice, setTerminalDevice] = useState(null);
  const { toasts, toast, remove } = useToast();

  const handleAdd = async (form) => {
    try {
      await createDevice({
        name: form.name,
        vendor: form.vendor,
        ip_address: form.ip_address,
        port: parseInt(form.port),
        pon_ports_count: parseInt(form.pon_ports_count),
        cards: form.cards,
        credentials: { user: form.username, pass: form.password }
      });
      toast.success(`OLT "${form.name}" berhasil ditambahkan.`);
      onRefresh();
    } catch (err) {
      toast.error(err.message);
      throw err;
    }
  };

  const handleEdit = async (form) => {
    try {
      const creds = form.username ? { user: form.username, pass: form.password } : undefined;
      await updateDevice(modal.device.device_id, {
        name: form.name,
        vendor: form.vendor,
        ip_address: form.ip_address,
        port: parseInt(form.port),
        pon_ports_count: parseInt(form.pon_ports_count),
        cards: form.cards,
        ...(creds && { credentials: creds })
      });
      toast.success(`OLT "${form.name}" berhasil diperbarui.`);
      onRefresh();
    } catch (err) {
      toast.error(err.message);
      throw err;
    }
  };

  const handleDelete = async () => {
    try {
      await deleteDevice(modal.device.device_id);
      toast.success(`OLT "${modal.device.name}" dihapus.`);
      if (terminalDevice?.device_id === modal.device.device_id) setTerminalDevice(null);
      setModal(null);
      onRefresh();
    } catch (err) {
      toast.error(err.message);
      setModal(null);
    }
  };

  const openEditModal = (dev) => {
    let creds = {};
    try { creds = typeof dev.credentials === 'string' ? JSON.parse(dev.credentials) : (dev.credentials || {}); } catch {}
    setModal({
      type: 'edit',
      device: dev,
      initial: {
        name: dev.name,
        vendor: dev.vendor,
        ip_address: dev.ip_address,
        port: dev.port,
        pon_ports_count: dev.pon_ports_count,
        cards: dev.cards || [],
        username: creds.user || '',
        password: ''
      }
    });
  };

  const toggleTerminal = (dev) => {
    setTerminalDevice((prev) => prev?.device_id === dev.device_id ? null : dev);
  };

  return (
    <div>
      <ToastContainer toasts={toasts} onRemove={remove} />

      {/* Page header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem' }}>
        <div>
          <h2 style={{ fontSize: '1.25rem', fontWeight: 700, color: 'var(--text-main)', margin: 0, letterSpacing: '-0.02em' }}>Perangkat OLT</h2>
        </div>
        {!isReadOnly && (
          <button className="btn btn-primary" onClick={() => setModal({ type: 'add' })}>
            <Plus size={15} /> Tambah OLT
          </button>
        )}
      </div>

      {/* Device cards grid */}
      <div className="grid-2" style={{ marginBottom: terminalDevice ? '1rem' : '0' }}>
        {devices.length === 0 ? (
          <div className="card" style={{ textAlign: 'center', padding: '3rem 1.5rem', gridColumn: '1 / -1' }}>
            <Server size={36} color="var(--text-muted)" style={{ margin: '0 auto 0.75rem', opacity: 0.4 }} />
            <h3 style={{ fontSize: '1rem', fontWeight: 600, color: 'var(--text-main)', marginBottom: '0.25rem' }}>
              Tidak Ada Perangkat OLT
            </h3>
            {!isReadOnly && (
              <div style={{ marginTop: '1rem' }}>
                <button className="btn btn-primary" onClick={() => setModal({ type: 'add' })}>
                  <Plus size={15} /> Tambah OLT
                </button>
              </div>
            )}
          </div>
        ) : (
          devices.map((dev) => (
            <DeviceCard
              key={dev.device_id}
              dev={dev}
              onEdit={openEditModal}
              onDelete={(d) => setModal({ type: 'delete', device: d })}
              onOpenTerminal={toggleTerminal}
              terminalOpen={terminalDevice?.device_id === dev.device_id}
              isReadOnly={isReadOnly}
            />
          ))
        )}
      </div>

      {/* CLI Terminal panel (below grid) */}
      {terminalDevice && (
        <CliTerminal
          device={terminalDevice}
          onClose={() => setTerminalDevice(null)}
        />
      )}

      {/* Modals */}
      {modal?.type === 'add' && (
        <DeviceFormModal mode="add" onClose={() => setModal(null)} onSave={handleAdd} />
      )}
      {modal?.type === 'edit' && (
        <DeviceFormModal mode="edit" initial={modal.initial} deviceId={modal.device?.device_id} onClose={() => setModal(null)} onSave={handleEdit} />
      )}
      {modal?.type === 'delete' && (
        <ConfirmDeleteModal device={modal.device} onConfirm={handleDelete} onClose={() => setModal(null)} />
      )}
    </div>
  );
}
