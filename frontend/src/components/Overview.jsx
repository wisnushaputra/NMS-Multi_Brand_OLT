import React, { useState, useEffect } from 'react';
import {
  Server, Network, AlertTriangle, FileText, CheckCircle2,
  ArrowRight, Plus, Layers, GitBranch,
  RefreshCw, Play, Pause, Activity, Clock
} from 'lucide-react';
import { getPollerStatus, togglePoller, triggerManualSweep } from '../services/api';

export default function Overview({ devices, onus, logs, setActiveTab, onOpenProvisionModal }) {
  const [pollerInfo, setPollerInfo] = useState(null);
  const [isSweeping, setIsSweeping] = useState(false);
  const [isToggling, setIsToggling] = useState(false);

  const onlineDevices = devices.filter((d) => d.status === 'Online').length;
  const onlineONUs = onus.filter((o) => o.status === 'Online').length;
  const losONUs = onus.filter((o) => o.status !== 'Online').length;

  useEffect(() => {
    loadPoller();
    const timer = setInterval(loadPoller, 10000);
    return () => clearInterval(timer);
  }, []);

  const loadPoller = async () => {
    try {
      const data = await getPollerStatus();
      setPollerInfo(data);
    } catch (e) {
      console.warn('Could not fetch poller status:', e.message);
    }
  };

  const handleManualSweep = async () => {
    setIsSweeping(true);
    try {
      await triggerManualSweep();
      await loadPoller();
    } catch (e) {
      console.error('Manual sweep error:', e);
    } finally {
      setIsSweeping(false);
    }
  };

  const handleToggleDaemon = async () => {
    if (!pollerInfo) return;
    setIsToggling(true);
    try {
      await togglePoller(!pollerInfo.isRunning);
      await loadPoller();
    } catch (e) {
      console.error('Toggle poller error:', e);
    } finally {
      setIsToggling(false);
    }
  };

  const formatLogTime = (ts) => {
    if (!ts) return '-';
    const cleanTs = typeof ts === 'string' && !ts.includes('Z') && !ts.includes('+')
      ? ts.replace(' ', 'T') + 'Z'
      : ts;
    const d = new Date(cleanTs);
    if (isNaN(d.getTime())) return ts;
    return d.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false }).replace(/\./g, ':');
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
      {/* Page Header & Primary Actions */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.75rem' }}>
        <div>
          <h2 style={{ fontSize: '1.25rem', fontWeight: 700, color: 'var(--text-main)', margin: 0, letterSpacing: '-0.02em' }}>
            Overview
          </h2>
        </div>

        <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
          <button className="btn btn-primary btn-sm" onClick={onOpenProvisionModal}>
            <Plus size={13} /> Provisi ONU
          </button>
          <button className="btn btn-secondary btn-sm" onClick={() => setActiveTab('devices')}>
            <Server size={13} /> Kelola OLT
          </button>
          <button className="btn btn-secondary btn-sm" onClick={() => setActiveTab('topology')}>
            <Layers size={13} /> Matriks Port
          </button>
        </div>
      </div>

      {/* Unified Executive Telemetry Strip (High-Density, Engineering Style) */}
      <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))',
          divideX: '1px solid var(--border-color)'
        }}>
          {/* Metric 1: OLT Hardware */}
          <div style={{ padding: '0.85rem 1.15rem', borderRight: '1px solid var(--border-color)' }}>
            <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
              Perangkat OLT
            </div>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: '0.4rem', marginTop: '0.25rem' }}>
              <span style={{ fontSize: '1.45rem', fontWeight: 800, fontFamily: 'JetBrains Mono, monospace', color: 'var(--text-main)' }}>
                {onlineDevices}
              </span>
              <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)', fontFamily: 'JetBrains Mono, monospace' }}>
                / {devices.length} Unit
              </span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', marginTop: '0.2rem', fontSize: '0.72rem' }}>
              <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: onlineDevices === devices.length && devices.length > 0 ? 'var(--success)' : 'var(--warning)' }} />
              <span style={{ color: onlineDevices === devices.length && devices.length > 0 ? 'var(--success)' : 'var(--warning)', fontWeight: 500 }}>
                {onlineDevices === devices.length && devices.length > 0 ? 'Semua OLT Beroperasi' : `${devices.length - onlineDevices} OLT Offline`}
              </span>
            </div>
          </div>

          {/* Metric 2: Active ONUs */}
          <div style={{ padding: '0.85rem 1.15rem', borderRight: '1px solid var(--border-color)' }}>
            <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
              ONU Pelanggan Aktif
            </div>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: '0.4rem', marginTop: '0.25rem' }}>
              <span style={{ fontSize: '1.45rem', fontWeight: 800, fontFamily: 'JetBrains Mono, monospace', color: 'var(--text-main)' }}>
                {onlineONUs}
              </span>
              <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)', fontFamily: 'JetBrains Mono, monospace' }}>
                / {onus.length} Terdaftar
              </span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', marginTop: '0.2rem', fontSize: '0.72rem' }}>
              <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: 'var(--success)' }} />
              <span style={{ color: 'var(--text-secondary)' }}>
                {onus.length > 0 ? `${Math.round((onlineONUs / onus.length) * 100)}% Rasio Online` : '0%'}
              </span>
            </div>
          </div>

          {/* Metric 3: Fiber Alarms (LOS) */}
          <div style={{ padding: '0.85rem 1.15rem', borderRight: '1px solid var(--border-color)' }}>
            <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
              Alarm Loss of Signal
            </div>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: '0.4rem', marginTop: '0.25rem' }}>
              <span style={{ fontSize: '1.45rem', fontWeight: 800, fontFamily: 'JetBrains Mono, monospace', color: losONUs > 0 ? 'var(--danger)' : 'var(--text-main)' }}>
                {losONUs}
              </span>
              <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                Kejadian
              </span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', marginTop: '0.2rem', fontSize: '0.72rem' }}>
              <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: losONUs > 0 ? 'var(--danger)' : 'var(--success)' }} />
              <span style={{ color: losONUs > 0 ? 'var(--danger)' : 'var(--success)', fontWeight: 500 }}>
                {losONUs > 0 ? `${losONUs} ONU Putus Sinyal` : 'Tautan Optik Normal'}
              </span>
            </div>
          </div>

          {/* Metric 4: Background Poller Daemon */}
          <div style={{ padding: '0.85rem 1.15rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                Poller Daemon ({pollerInfo?.intervalSeconds || 30}s)
              </span>
              <span style={{
                fontSize: '0.65rem',
                padding: '1px 5px',
                borderRadius: '3px',
                background: pollerInfo?.isRunning ? 'var(--success-bg)' : 'var(--warning-bg)',
                color: pollerInfo?.isRunning ? 'var(--success)' : 'var(--warning)',
                border: `1px solid ${pollerInfo?.isRunning ? 'var(--success-border)' : 'var(--warning-border)'}`,
                fontWeight: 600
              }}>
                {pollerInfo?.isRunning ? 'Active' : 'Paused'}
              </span>
            </div>
            <div style={{ fontSize: '0.76rem', color: 'var(--text-secondary)', marginTop: '0.3rem' }}>
              Siklus: <strong style={{ fontFamily: 'JetBrains Mono', color: 'var(--text-main)' }}>{pollerInfo?.totalCycles ?? 0}x</strong> • Terakhir:{' '}
              <span style={{ fontFamily: 'JetBrains Mono' }}>{pollerInfo?.lastRun ? formatLogTime(pollerInfo.lastRun) : 'Menunggu...'}</span>
            </div>
            <div style={{ display: 'flex', gap: '0.4rem', marginTop: '0.35rem' }}>
              <button
                className="btn btn-secondary btn-sm"
                onClick={handleManualSweep}
                disabled={isSweeping}
                style={{ padding: '0.15rem 0.45rem', fontSize: '0.68rem' }}
                title="Pindai ulang seluruh OLT sekarang"
              >
                <RefreshCw size={11} className={isSweeping ? 'spin-animate' : ''} />
                <span>{isSweeping ? 'Memindai...' : 'Sweep Now'}</span>
              </button>
              <button
                className="btn btn-secondary btn-sm"
                onClick={handleToggleDaemon}
                disabled={isToggling}
                style={{ padding: '0.15rem 0.45rem', fontSize: '0.68rem' }}
                title={pollerInfo?.isRunning ? 'Jeda background worker' : 'Aktifkan background worker'}
              >
                {pollerInfo?.isRunning ? <Pause size={11} /> : <Play size={11} />}
                <span>{pollerInfo?.isRunning ? 'Jeda' : 'Mulai'}</span>
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Main Operational Row: Adapter Engine & Activity Log */}
      <div className="grid-2" style={{ marginBottom: 0 }}>
        {/* Hardware Driver Status (Tabular Engineering View) */}
        <div className="card" style={{ padding: '1rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem', paddingBottom: '0.5rem', borderBottom: '1px solid var(--border-color)' }}>
            <div style={{ fontSize: '0.84rem', fontWeight: 700, color: 'var(--text-main)' }}>Driver Adaptor OLT</div>
            <button className="btn btn-ghost btn-sm" onClick={() => setActiveTab('devices')} style={{ fontSize: '0.72rem' }}>
              Daftar OLT <ArrowRight size={12} />
            </button>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
            {[
              { vendor: 'ZTE', name: 'ZTE C300 / C320 Series', driver: 'zte_adapter.js', version: 'v2.1', count: devices.filter((d) => d.vendor === 'ZTE').length },
              { vendor: 'Huawei', name: 'Huawei SmartAX MA5608T / MA5800', driver: 'huawei_adapter.js', version: 'v1.8', count: devices.filter((d) => d.vendor === 'Huawei').length },
              { vendor: 'Fiberhome', name: 'Fiberhome AN5516 Series', driver: 'fiberhome_adapter.js', version: 'v1.5', count: devices.filter((d) => d.vendor === 'Fiberhome').length }
            ].map((item) => (
              <div
                key={item.vendor}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: '0.5rem 0.65rem',
                  background: 'var(--bg-surface-elevated)',
                  borderRadius: 'var(--radius-sm)',
                  border: '1px solid var(--border-color)'
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <span style={{
                    fontSize: '0.68rem',
                    fontWeight: 700,
                    padding: '2px 5px',
                    borderRadius: '3px',
                    background: item.count > 0 ? 'rgba(56, 189, 248, 0.1)' : 'var(--bg-input)',
                    color: item.count > 0 ? '#38bdf8' : 'var(--text-muted)',
                    fontFamily: 'JetBrains Mono',
                    border: '1px solid var(--border-color)'
                  }}>
                    {item.vendor}
                  </span>
                  <div>
                    <div style={{ fontWeight: 600, fontSize: '0.78rem', color: 'var(--text-main)' }}>
                      {item.name}
                    </div>
                    <div style={{ fontSize: '0.68rem', color: 'var(--text-muted)', fontFamily: 'JetBrains Mono' }}>
                      {item.driver}
                    </div>
                  </div>
                </div>

                <div style={{ textAlign: 'right' }}>
                  <span style={{
                    fontSize: '0.68rem',
                    fontWeight: 600,
                    color: item.count > 0 ? 'var(--success)' : 'var(--text-muted)',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '4px',
                    justifyContent: 'flex-end'
                  }}>
                    <span style={{ width: '5px', height: '5px', borderRadius: '50%', background: item.count > 0 ? 'var(--success)' : 'var(--text-muted)' }} />
                    {item.count > 0 ? `${item.count} Perangkat` : 'Idle'}
                  </span>
                  <div style={{ fontSize: '0.65rem', color: 'var(--text-muted)', fontFamily: 'JetBrains Mono' }}>
                    {item.version}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Recent Audit Stream (Compact Log Feed) */}
        <div className="card" style={{ padding: '1rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem', paddingBottom: '0.5rem', borderBottom: '1px solid var(--border-color)' }}>
            <div style={{ fontSize: '0.84rem', fontWeight: 700, color: 'var(--text-main)' }}>Log Aktivitas Terkini</div>
            <button className="btn btn-ghost btn-sm" onClick={() => setActiveTab('logs')} style={{ fontSize: '0.72rem' }}>
              Semua Log <ArrowRight size={12} />
            </button>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
            {logs.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '2rem 1rem', color: 'var(--text-muted)', fontSize: '0.75rem' }}>
                Belum ada catatan aktivitas audit log.
              </div>
            ) : (
              logs.slice(0, 5).map((log) => (
                <div
                  key={log.log_id}
                  style={{
                    padding: '0.45rem 0.65rem',
                    background: 'var(--bg-surface-elevated)',
                    borderRadius: 'var(--radius-sm)',
                    border: '1px solid var(--border-color)',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    gap: '0.5rem'
                  }}
                >
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <div style={{ fontWeight: 600, fontSize: '0.78rem', color: 'var(--text-main)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {log.action}
                    </div>
                    <div style={{ fontSize: '0.68rem', color: 'var(--text-muted)', marginTop: '1px' }}>
                      {log.username} • {log.target_device_name || 'System'}
                    </div>
                  </div>
                  <div style={{ textAlign: 'right', flexShrink: 0 }}>
                    <span style={{
                      fontSize: '0.65rem',
                      fontWeight: 600,
                      padding: '1px 5px',
                      borderRadius: '3px',
                      background: log.status === 'Success' ? 'var(--success-bg)' : 'var(--danger-bg)',
                      color: log.status === 'Success' ? 'var(--success)' : 'var(--danger)',
                      border: `1px solid ${log.status === 'Success' ? 'var(--success-border)' : 'var(--danger-border)'}`
                    }}>
                      {log.status}
                    </span>
                    <div style={{ fontSize: '0.65rem', color: 'var(--text-muted)', marginTop: '2px', fontFamily: 'JetBrains Mono, monospace' }}>
                      {formatLogTime(log.timestamp)}
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
