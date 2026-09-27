import React, { useState, useEffect } from 'react';
import {
  FileText, Search, RefreshCw, Eye, CheckCircle2, XCircle,
  Download, Filter, Copy, Check, Calendar, User, Server
} from 'lucide-react';
import { getAuditLogs } from '../services/api';

const ACTION_FILTERS = [
  'Semua',
  'Tambah Device OLT',
  'Eksekusi CLI OLT',
  'Buat Service Profile',
  'Provision ONU',
  'Push PPPoE Credentials',
  'Hapus / Unregister ONU'
];

export default function AuditLogsView() {
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedAction, setSelectedAction] = useState('Semua');
  const [selectedLog, setSelectedLog] = useState(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    loadLogs();
  }, [selectedAction]);

  const loadLogs = async () => {
    setLoading(true);
    try {
      const filters = {};
      if (searchTerm) filters.search = searchTerm;
      if (selectedAction !== 'Semua') filters.action = selectedAction;

      const data = await getAuditLogs(filters);
      setLogs(data);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const formatLogTimestamp = (ts) => {
    if (!ts) return '-';
    const cleanTs = typeof ts === 'string' && !ts.includes('Z') && !ts.includes('+')
      ? ts.replace(' ', 'T') + 'Z'
      : ts;
    const d = new Date(cleanTs);
    if (isNaN(d.getTime())) return String(ts);
    return d.toLocaleString('id-ID', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false
    }).replace(/\./g, ':');
  };

  const parseDetails = (str) => {
    try {
      return JSON.stringify(JSON.parse(str), null, 2);
    } catch (e) {
      return str;
    }
  };

  const handleCopyDetails = () => {
    if (!selectedLog) return;
    navigator.clipboard.writeText(parseDetails(selectedLog.details));
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const exportCSV = () => {
    if (logs.length === 0) return;
    const headers = ['Log ID', 'Waktu (WIB)', 'User', 'Aksi', 'Device Target', 'Status', 'Details'];
    const rows = logs.map((l) => [
      l.log_id,
      `"${formatLogTimestamp(l.timestamp)}"`,
      `"${l.username}"`,
      `"${l.action}"`,
      `"${l.target_device_name || '-'}"`,
      `"${l.status}"`,
      `"${(l.details || '').replace(/"/g, '""')}"`
    ]);

    const csvContent = 'data:text/csv;charset=utf-8,' + [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `audit_logs_${new Date().toISOString().split('T')[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem' }}>
        <div>
          <h2 style={{ fontSize: '1.25rem', fontWeight: 700, color: 'var(--text-main)', margin: 0, letterSpacing: '-0.02em' }}>
            Audit Log
          </h2>
        </div>

        <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center', flexWrap: 'wrap' }}>
          <button className="btn btn-secondary" onClick={exportCSV} disabled={logs.length === 0} style={{ padding: '0.45rem 0.85rem', fontSize: '0.82rem' }}>
            <Download size={14} /> Export CSV
          </button>
          <button className="btn btn-secondary" onClick={loadLogs} disabled={loading} style={{ padding: '0.45rem 0.85rem', fontSize: '0.82rem' }}>
            <RefreshCw size={14} className={loading ? 'spin-animate' : ''} />
            {loading ? 'Memuat...' : 'Refresh Log'}
          </button>
        </div>
      </div>

      {/* Search & Action Chips */}
      <div className="card" style={{ padding: '1rem 1.25rem', background: 'rgba(15,23,42,0.7)', borderColor: 'rgba(255,255,255,0.08)' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          <div style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
            <div style={{ position: 'relative', flex: 1 }}>
              <Search size={16} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: '#64748b' }} />
              <input
                type="text"
                className="form-input"
                style={{ paddingLeft: '2.4rem', width: '100%', fontSize: '0.84rem' }}
                placeholder="Cari berdasarkan kata kunci aksi, username, perangkat OLT, atau parameter..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && loadLogs()}
              />
            </div>
            <button className="btn btn-primary" onClick={loadLogs} style={{ padding: '0.45rem 1rem', fontSize: '0.84rem' }}>
              Cari
            </button>
          </div>

          {/* Filter Chips */}
          <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', alignItems: 'center' }}>
            <span style={{ fontSize: '0.75rem', color: '#94a3b8', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '4px' }}>
              <Filter size={12} /> Kategori Aksi:
            </span>
            {ACTION_FILTERS.map((act) => {
              const isActive = selectedAction === act;
              return (
                <button
                  key={act}
                  onClick={() => setSelectedAction(act)}
                  style={{
                    borderRadius: '4px',
                    padding: '0.25rem 0.65rem',
                    fontSize: '0.75rem',
                    fontWeight: 600,
                    cursor: 'pointer',
                    background: isActive ? '#27272a' : '#18181b',
                    color: isActive ? '#ffffff' : '#a1a1aa',
                    border: isActive ? '1px solid #3f3f46' : '1px solid #27272a',
                    transition: 'all 0.15s ease'
                  }}
                >
                  {act}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* Logs Table */}
      <div className="table-container table-dense">
        <table>
          <thead>
            <tr>
              <th style={{ width: '180px' }}>Waktu (Timestamp)</th>
              <th style={{ width: '140px' }}>Pengguna (User)</th>
              <th>Aksi Konfigurasi</th>
              <th>Target Perangkat OLT</th>
              <th style={{ width: '120px' }}>Status</th>
              <th style={{ width: '80px', textAlign: 'right' }}>Detail</th>
            </tr>
          </thead>
          <tbody>
            {logs.length === 0 ? (
              <tr>
                <td colSpan="6" style={{ textAlign: 'center', padding: '3rem 1rem', color: '#9ca3af' }}>
                  <FileText size={32} style={{ margin: '0 auto 0.5rem', opacity: 0.4 }} />
                  <div>Tidak ada catatan aktivitas audit log yang sesuai.</div>
                </td>
              </tr>
            ) : (
              logs.map((log) => (
                <tr key={log.log_id}>
                  <td style={{ fontFamily: 'JetBrains Mono', fontSize: '0.78rem', color: '#94a3b8' }}>
                    {formatLogTimestamp(log.timestamp)}
                  </td>
                  <td>
                    <span style={{ fontWeight: 600, color: 'var(--text-main)', display: 'flex', alignItems: 'center', gap: '5px' }}>
                      <User size={13} color="var(--text-muted)" /> {log.username}
                    </span>
                  </td>
                  <td style={{ fontWeight: 700, color: 'var(--primary)' }}>{log.action}</td>
                  <td>
                    {log.target_device_name ? (
                      <span style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                        <Server size={13} color="var(--text-secondary)" /> {log.target_device_name}
                      </span>
                    ) : (
                      <span style={{ color: 'var(--text-muted)' }}>-</span>
                    )}
                  </td>
                  <td>
                    <span className={`status-badge ${log.status === 'Success' ? 'status-online' : 'status-offline'}`}>
                      {log.status === 'Success' ? <CheckCircle2 size={12} /> : <XCircle size={12} />}
                      {log.status}
                    </span>
                  </td>
                  <td style={{ textAlign: 'right' }}>
                    <button
                      className="btn btn-secondary"
                      style={{ padding: '0.25rem 0.55rem', fontSize: '0.75rem' }}
                      onClick={() => setSelectedLog(log)}
                      title="Lihat Detail JSON"
                    >
                      <Eye size={13} /> JSON
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Details JSON Modal */}
      {selectedLog && (
        <div className="modal-overlay" onClick={() => setSelectedLog(null)}>
          <div className="modal-card" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '640px' }}>
            <div className="modal-header">
              <h3 style={{ fontWeight: 800, fontSize: '1.05rem', color: 'var(--text-main)' }}>
                Detail Audit Log #{selectedLog.log_id}
              </h3>
              <button
                className="btn btn-secondary"
                style={{ padding: '0.25rem 0.5rem' }}
                onClick={() => setSelectedLog(null)}
              >
                ✕
              </button>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '0.75rem', marginBottom: '1.25rem', fontSize: '0.82rem' }}>
              <div className="card" style={{ padding: '0.65rem 0.85rem' }}>
                <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>USER</span>
                <div style={{ fontWeight: 700, color: 'var(--text-main)', marginTop: '2px' }}>{selectedLog.username}</div>
              </div>
              <div className="card" style={{ padding: '0.65rem 0.85rem' }}>
                <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>AKSI</span>
                <div style={{ fontWeight: 700, color: 'var(--primary)', marginTop: '2px' }}>{selectedLog.action}</div>
              </div>
              <div className="card" style={{ padding: '0.65rem 0.85rem' }}>
                <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>STATUS</span>
                <div style={{ fontWeight: 700, color: selectedLog.status === 'Success' ? '#10b981' : '#ef4444', marginTop: '2px' }}>
                  {selectedLog.status}
                </div>
              </div>
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
              <span style={{ fontSize: '0.78rem', color: '#94a3b8', fontWeight: 600 }}>RAW PAYLOAD PARAMETER (JSON)</span>
              <button
                className="btn btn-secondary"
                onClick={handleCopyDetails}
                style={{ padding: '0.2rem 0.5rem', fontSize: '0.74rem' }}
              >
                {copied ? <Check size={12} color="#34d399" /> : <Copy size={12} />}
                {copied ? 'Tersalin!' : 'Salin JSON'}
              </button>
            </div>

            <div className="terminal-window">
              <div className="terminal-body" style={{ maxHeight: '280px', overflowY: 'auto' }}>
                {parseDetails(selectedLog.details)}
              </div>
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '1.5rem' }}>
              <button className="btn btn-secondary" onClick={() => setSelectedLog(null)}>
                Tutup
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
