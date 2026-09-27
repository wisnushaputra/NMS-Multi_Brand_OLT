import React, { useState, useEffect, useMemo } from 'react';
import {
  Server, Cpu, Wifi, Radio, RefreshCw, Search,
  Activity, ShieldCheck, AlertTriangle,
  Layers, ArrowRight, Eye, Zap, CheckCircle2, XCircle, Info, Filter,
  Cable, Check
} from 'lucide-react';
import { getTopology, getDevices } from '../services/api';

export default function TopologyView() {
  const [topologyData, setTopologyData] = useState({ nodes: [], links: [], summary: {} });
  const [devicesList, setDevicesList] = useState([]);
  const [loading, setLoading] = useState(false);
  const [selectedNode, setSelectedNode] = useState(null);
  const [filterDevice, setFilterDevice] = useState('');
  const [filterStatus, setFilterStatus] = useState('ALL');
  const [onlyActivePorts, setOnlyActivePorts] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [focusedPortId, setFocusedPortId] = useState(null);

  useEffect(() => {
    loadDevices();
    loadTopologyData();
  }, [filterDevice]);

  // Close drawer on Escape key press
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape' && selectedNode) {
        setSelectedNode(null);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [selectedNode]);

  const loadDevices = async () => {
    try {
      const data = await getDevices();
      setDevicesList(data);
    } catch (e) {
      console.error('Failed to load devices list:', e);
    }
  };

  const loadTopologyData = async () => {
    setLoading(true);
    try {
      const data = await getTopology(filterDevice || undefined);
      setTopologyData(data);
    } catch (err) {
      console.error('Failed to load topology:', err);
    } finally {
      setLoading(false);
    }
  };

  // Node categorization
  const oltNodes = useMemo(() => (topologyData.nodes || []).filter((n) => n.type === 'olt'), [topologyData]);
  const ponNodes = useMemo(() => (topologyData.nodes || []).filter((n) => n.type === 'pon'), [topologyData]);
  const onuNodes = useMemo(() => (topologyData.nodes || []).filter((n) => n.type === 'onu'), [topologyData]);

  // Filtered ONUs based on status filter & search term
  const filteredOnus = useMemo(() => {
    return onuNodes.filter((onu) => {
      if (filterStatus === 'ONLINE' && onu.status !== 'Online') return false;
      if (filterStatus === 'LOS' && onu.status === 'Online') return false;
      if (searchTerm) {
        const q = searchTerm.toLowerCase();
        const snMatch = onu.label && onu.label.toLowerCase().includes(q);
        const nameMatch = onu.onuName && onu.onuName.toLowerCase().includes(q);
        const pppoeMatch = onu.pppoe && onu.pppoe.toLowerCase().includes(q);
        const oltMatch = onu.deviceName && onu.deviceName.toLowerCase().includes(q);
        if (!snMatch && !nameMatch && !pppoeMatch && !oltMatch) return false;
      }
      return true;
    });
  }, [onuNodes, filterStatus, searchTerm]);

  const summary = topologyData.summary || {};

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem' }}>
        <div>
          <h2 style={{ fontSize: '1.25rem', fontWeight: 700, color: 'var(--text-main)', margin: 0, letterSpacing: '-0.02em' }}>
            Topologi Jaringan
          </h2>
        </div>

        <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center', flexWrap: 'wrap' }}>
          <button className="btn btn-secondary" onClick={loadTopologyData} disabled={loading} style={{ padding: '0.45rem 0.85rem', fontSize: '0.82rem' }}>
            <RefreshCw size={14} className={loading ? 'spin-animate' : ''} />
            {loading ? 'Memuat...' : 'Reload Topologi'}
          </button>
        </div>
      </div>

      {/* Telemetry Summary Strip */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))',
        background: 'var(--bg-card)',
        border: '1px solid var(--border-color)',
        borderRadius: 'var(--radius-lg)',
        overflow: 'hidden'
      }}>
        <div style={{ padding: '0.85rem 1.15rem', borderRight: '1px solid var(--border-color)' }}>
          <div style={{ fontSize: '0.68rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
            Perangkat OLT
          </div>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: '0.45rem', marginTop: '0.25rem' }}>
            <span style={{ fontSize: '1.35rem', fontWeight: 800, color: 'var(--text-main)', fontFamily: 'JetBrains Mono, monospace' }}>
              {summary.onlineDevices || 0}/{summary.totalDevices || 0}
            </span>
            <span style={{ fontSize: '0.72rem', color: 'var(--success)', fontWeight: 600 }}>Unit Aktif</span>
          </div>
        </div>

        <div style={{ padding: '0.85rem 1.15rem', borderRight: '1px solid var(--border-color)' }}>
          <div style={{ fontSize: '0.68rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
            Port PON Terisi
          </div>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: '0.45rem', marginTop: '0.25rem' }}>
            <span style={{ fontSize: '1.35rem', fontWeight: 800, color: 'var(--text-main)', fontFamily: 'JetBrains Mono, monospace' }}>
              {summary.totalActivePonPorts || 0}
            </span>
            <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>/ {summary.totalPonCapacity || 16} Port</span>
          </div>
        </div>

        <div style={{ padding: '0.85rem 1.15rem', borderRight: '1px solid var(--border-color)' }}>
          <div style={{ fontSize: '0.68rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
            Pelanggan ONU
          </div>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: '0.45rem', marginTop: '0.25rem' }}>
            <span style={{ fontSize: '1.35rem', fontWeight: 800, color: 'var(--text-main)', fontFamily: 'JetBrains Mono, monospace' }}>
              {summary.onlineOnus || 0}
            </span>
            <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>/ {summary.totalOnus || 0} Unit</span>
          </div>
        </div>

        <div style={{ padding: '0.85rem 1.15rem', borderRight: '1px solid var(--border-color)' }}>
          <div style={{ fontSize: '0.68rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
            Alarm Redaman / LOS
          </div>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: '0.45rem', marginTop: '0.25rem' }}>
            <span style={{ fontSize: '1.35rem', fontWeight: 800, color: (summary.losOnus > 0) ? 'var(--danger)' : 'var(--success)', fontFamily: 'JetBrains Mono, monospace' }}>
              {summary.losOnus || 0}
            </span>
            <span style={{ fontSize: '0.72rem', color: (summary.losOnus > 0) ? 'var(--danger)' : 'var(--success)', fontWeight: 600 }}>
              {summary.losOnus > 0 ? 'Kejadian' : 'Normal'}
            </span>
          </div>
        </div>

        <div style={{ padding: '0.85rem 1.15rem' }}>
          <div style={{ fontSize: '0.68rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
            Rerata Rx Power
          </div>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: '0.35rem', marginTop: '0.25rem' }}>
            <span style={{ fontSize: '1.35rem', fontWeight: 800, color: 'var(--text-main)', fontFamily: 'JetBrains Mono, monospace' }}>
              {summary.avgRxPower || '-20.5'}
            </span>
            <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>dBm</span>
          </div>
        </div>
      </div>

      {/* Filter & Search Bar */}
      <div className="card" style={{ padding: '0.75rem 1rem' }}>
        <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center', flexWrap: 'wrap' }}>
          {/* Search */}
          <div style={{ position: 'relative', flex: '1 1 240px' }}>
            <Search size={15} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
            <input
              type="text"
              className="form-input"
              placeholder="Cari Serial Number, nama pelanggan, PPPoE, atau OLT..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              style={{ paddingLeft: '2.3rem', paddingRight: '0.75rem', width: '100%', fontSize: '0.82rem' }}
            />
          </div>

          {/* OLT Filter */}
          <div style={{ flex: '0 1 200px' }}>
            <select
              className="form-input"
              value={filterDevice}
              onChange={(e) => setFilterDevice(e.target.value)}
              style={{ width: '100%', fontSize: '0.82rem' }}
            >
              <option value="">Semua OLT ({devicesList.length})</option>
              {devicesList.map((d) => (
                <option key={d.device_id || d.id} value={d.device_id || d.id}>
                  {d.name} ({d.vendor || 'OLT'})
                </option>
              ))}
            </select>
          </div>

          {/* Status Filter */}
          <div style={{ flex: '0 1 180px' }}>
            <select
              className="form-input"
              value={filterStatus}
              onChange={(e) => setFilterStatus(e.target.value)}
              style={{ width: '100%', fontSize: '0.82rem' }}
            >
              <option value="ALL">Semua Status ONU</option>
              <option value="ONLINE">Hanya Online</option>
              <option value="LOS">Hanya LOS / Offline</option>
            </select>
          </div>

          {/* Toggle Port Filter: Hanya Port Terisi */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', background: 'var(--bg-surface-elevated)', padding: '0.45rem 0.75rem', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border-color)' }}>
            <input
              type="checkbox"
              id="onlyActivePortsCheckbox"
              checked={onlyActivePorts}
              onChange={(e) => setOnlyActivePorts(e.target.checked)}
              style={{ cursor: 'pointer', accentColor: 'var(--primary)' }}
            />
            <label htmlFor="onlyActivePortsCheckbox" style={{ fontSize: '0.78rem', color: 'var(--text-main)', cursor: 'pointer', fontWeight: 500 }}>
              Hanya Port Terisi ({summary.totalActivePonPorts || 0})
            </label>
          </div>
        </div>
      </div>

      {/* ODF / PORT MATRIX HIERARCHY VIEW */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
        {oltNodes.length === 0 && !loading && (
          <div className="card" style={{ padding: '2.5rem', textAlign: 'center', color: 'var(--text-muted)' }}>
            <Server size={36} style={{ margin: '0 auto 0.75rem', opacity: 0.35 }} />
            <div style={{ fontWeight: 600, fontSize: '0.95rem', color: 'var(--text-secondary)' }}>Tidak Ada Data OLT</div>
            <p style={{ fontSize: '0.82rem', marginTop: '0.25rem' }}>Silakan tambahkan perangkat OLT di menu Manajemen Perangkat atau sesuaikan filter.</p>
          </div>
        )}

        {oltNodes.map((olt) => {
          const allPonsForBlade = ponNodes.filter((p) => p.parentOltId === olt.id);
          const devOnus = filteredOnus.filter((o) => o.deviceId === olt.deviceId);

          const totalDevOnus = devOnus.length;
          const onlineDevOnus = devOnus.filter((o) => o.status === 'Online').length;
          const losDevOnus = totalDevOnus - onlineDevOnus;

          // Determine displayed PON ports
          let displayedPons = allPonsForBlade;
          if (focusedPortId) {
            const hasMatch = displayedPons.some((p) => p.id === focusedPortId);
            if (hasMatch) {
              displayedPons = displayedPons.filter((p) => p.id === focusedPortId);
            }
          } else if (onlyActivePorts) {
            displayedPons = displayedPons.filter((p) => {
              const count = devOnus.filter((o) => (o.cardSlot || 1) === (p.cardSlot || 1) && o.ponPort === p.ponPort).length;
              return count > 0;
            });
          }

          return (
            <div key={olt.id} className="rackmount-chassis">
              {/* Chassis Faceplate Banner */}
              <div className="chassis-faceplate">
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.85rem' }}>
                  <div style={{
                    background: 'rgba(255, 255, 255, 0.05)',
                    border: '1px solid rgba(255, 255, 255, 0.1)',
                    padding: '0.35rem 0.6rem',
                    borderRadius: 'var(--radius-sm)',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.45rem'
                  }}>
                    <Server size={15} color="var(--primary)" />
                    <span style={{ fontSize: '0.7rem', fontWeight: 700, fontFamily: 'JetBrains Mono, monospace', color: 'var(--text-secondary)' }}>
                      1U OLT CHASSIS
                    </span>
                  </div>

                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
                      <h3 style={{ fontSize: '1.05rem', fontWeight: 700, color: 'var(--text-main)', margin: 0 }}>{olt.label}</h3>
                      <span style={{ fontSize: '0.68rem', fontWeight: 700, padding: '2px 6px', borderRadius: '3px', background: 'var(--bg-surface-elevated)', border: '1px solid var(--border-color)', color: 'var(--text-secondary)' }}>
                        {olt.vendor}
                      </span>
                      <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)', fontFamily: 'JetBrains Mono, monospace' }}>
                        {olt.ip}:{olt.sshPort || 22}
                      </span>
                    </div>
                    <div style={{ fontSize: '0.74rem', color: 'var(--text-secondary)', marginTop: '2px' }}>
                      Kapasitas: <strong style={{ color: 'var(--text-main)', fontFamily: 'JetBrains Mono, monospace' }}>{olt.ponPortsCount || 16} Port GPON</strong> • Terhubung: <strong style={{ color: 'var(--success)', fontFamily: 'JetBrains Mono, monospace' }}>{totalDevOnus} ONU ({onlineDevOnus} Online, {losDevOnus} LOS)</strong>
                    </div>
                  </div>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
                  {/* Hardware Diagnostic LEDs */}
                  <div className="chassis-led-group">
                    <div className="chassis-led-item" title="Catu Daya OLT Normal">
                      <span className="led-indicator led-green" />
                      <span>PWR</span>
                    </div>
                    <div className="chassis-led-item" title="Firmware Daemon Aktif">
                      <span className="led-indicator led-green led-pulse" />
                      <span>RUN</span>
                    </div>
                    <div className="chassis-led-item" title={losDevOnus > 0 ? `Alarm Aktif: ${losDevOnus} ONU Mengalami LOS` : 'Tidak Ada Alarm Optik'}>
                      <span className={`led-indicator ${losDevOnus > 0 ? 'led-red' : 'led-dim'}`} />
                      <span>ALM</span>
                    </div>
                  </div>

                  <button className="btn btn-secondary" onClick={() => setSelectedNode(olt)} style={{ fontSize: '0.76rem', padding: '0.35rem 0.75rem' }}>
                    <Info size={13} /> Spek OLT
                  </button>
                </div>
              </div>

              {/* ODF SFP Blade Patch Panel Strip */}
              <div className="odf-blade-strip">
                <div className="odf-blade-label">
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <Cable size={14} color="var(--primary)" />
                    <span style={{ fontSize: '0.72rem', fontWeight: 700, letterSpacing: '0.04em', textTransform: 'uppercase', color: 'var(--text-main)', fontFamily: 'JetBrains Mono, monospace' }}>
                      ODF RACKMOUNT BLADE • SFP OPTICAL TRANSCEIVER MATRIX
                    </span>
                    <span style={{ fontSize: '0.68rem', color: 'var(--text-muted)' }}>
                      ({allPonsForBlade.length} Port SFP)
                    </span>
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem' }}>
                    {focusedPortId && allPonsForBlade.some((p) => p.id === focusedPortId) && (
                      <button
                        className="btn btn-ghost btn-sm"
                        onClick={() => setFocusedPortId(null)}
                        style={{ fontSize: '0.7rem', padding: '0.15rem 0.5rem', color: 'var(--primary)' }}
                      >
                        Reset Fokus Port
                      </button>
                    )}
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.66rem', color: 'var(--text-muted)' }}>
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: '3px' }}>
                        <span className="led-indicator led-green" style={{ width: 5, height: 5 }} /> Online
                      </span>
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: '3px' }}>
                        <span className="led-indicator led-red" style={{ width: 5, height: 5 }} /> Alarm
                      </span>
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: '3px' }}>
                        <span className="led-indicator led-dim" style={{ width: 5, height: 5 }} /> Idle
                      </span>
                    </div>
                  </div>
                </div>

                {/* SFP Port Matrix Cage Bar */}
                <div className="odf-port-matrix">
                  {allPonsForBlade.map((pon) => {
                    const ponOnus = devOnus.filter(
                      (o) => (o.cardSlot || 1) === (pon.cardSlot || 1) && o.ponPort === pon.ponPort
                    );
                    const onlineCount = ponOnus.filter((o) => o.status === 'Online').length;
                    const losCount = ponOnus.length - onlineCount;
                    const isActive = ponOnus.length > 0;
                    const isSelected = focusedPortId === pon.id;

                    return (
                      <div
                        key={pon.id}
                        className={`sfp-port-cage ${isActive ? (losCount > 0 ? 'port-alarm' : 'port-active') : ''} ${isSelected ? 'port-selected' : ''}`}
                        onClick={() => setFocusedPortId(isSelected ? null : pon.id)}
                        title={`Klik untuk fokus: PON 1/${pon.cardSlot || 1}/${pon.ponPort} — ${ponOnus.length} Pelanggan (${onlineCount} Online, ${losCount} LOS)`}
                      >
                        <div className="sfp-port-header">
                          P{pon.ponPort}
                        </div>
                        <div className="sfp-jack-opening" />
                        <div className="sfp-port-leds">
                          <span className={`led-indicator ${onlineCount > 0 ? 'led-green led-pulse' : 'led-dim'}`} style={{ width: 5, height: 5 }} />
                          <span className={`led-indicator ${losCount > 0 ? 'led-red' : 'led-dim'}`} style={{ width: 5, height: 5 }} />
                        </div>
                        <div className="sfp-port-count">
                          {isActive ? `${ponOnus.length}U` : 'IDLE'}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* PON Port Cassette Cards Grid */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(295px, 1fr))', gap: '0.85rem' }}>
                {displayedPons.map((pon) => {
                  const ponOnus = devOnus.filter(
                    (o) => (o.cardSlot || 1) === (pon.cardSlot || 1) && o.ponPort === pon.ponPort
                  );

                  const isActive = ponOnus.length > 0;
                  const onlineCount = ponOnus.filter((o) => o.status === 'Online').length;
                  const losCount = ponOnus.length - onlineCount;
                  const isSelected = focusedPortId === pon.id;

                  const onlinePct = Math.round((onlineCount / 128) * 100);
                  const losPct = Math.round((losCount / 128) * 100);

                  return (
                    <div
                      key={pon.id}
                      className={`odf-cassette-card ${isSelected ? 'is-focused' : ''}`}
                    >
                      {/* Port Header */}
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                          <span className={`led-indicator ${isActive ? (losCount > 0 ? 'led-red' : 'led-green led-pulse') : 'led-dim'}`} />
                          <span style={{ fontWeight: 700, fontSize: '0.88rem', color: 'var(--text-main)', fontFamily: 'JetBrains Mono, monospace' }}>
                            {pon.label}
                          </span>
                        </div>
                        <span
                          style={{
                            fontSize: '0.68rem',
                            fontWeight: 600,
                            padding: '1px 6px',
                            borderRadius: '3px',
                            background: isActive ? 'var(--bg-card)' : 'transparent',
                            color: isActive ? 'var(--success)' : 'var(--text-muted)',
                            border: '1px solid var(--border-color)',
                            fontFamily: 'JetBrains Mono, monospace'
                          }}
                        >
                          {isActive ? `${ponOnus.length}/128 ONU` : 'IDLE'}
                        </span>
                      </div>

                      {/* Multi-Segment Splitter Capacity Meter */}
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.68rem', color: 'var(--text-muted)', fontFamily: 'JetBrains Mono, monospace' }}>
                          <span>Splitter 1:128 GPON</span>
                          <span>{ponOnus.length}/128 ({onlinePct + losPct}%)</span>
                        </div>
                        <div style={{ width: '100%', height: '4px', background: 'rgba(255, 255, 255, 0.08)', borderRadius: '2px', overflow: 'hidden', display: 'flex' }}>
                          {onlineCount > 0 && (
                            <div
                              style={{
                                width: `${(onlineCount / 128) * 100}%`,
                                height: '100%',
                                background: 'var(--success)',
                                transition: 'width 0.3s ease'
                              }}
                              title={`${onlineCount} Online`}
                            />
                          )}
                          {losCount > 0 && (
                            <div
                              style={{
                                width: `${(losCount / 128) * 100}%`,
                                height: '100%',
                                background: 'var(--danger)',
                                transition: 'width 0.3s ease'
                              }}
                              title={`${losCount} LOS / Alarm`}
                            />
                          )}
                        </div>
                      </div>

                      {/* List of ONUs on this PON port */}
                      {ponOnus.length === 0 ? (
                        <div style={{
                          fontSize: '0.72rem',
                          color: 'var(--text-muted)',
                          background: 'var(--bg-card)',
                          borderRadius: '4px',
                          padding: '0.6rem',
                          textAlign: 'center',
                          border: '1px dashed var(--border-color)'
                        }}>
                          Port Bebas (0/128 Customer)
                        </div>
                      ) : (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                          {ponOnus.map((onu) => {
                            const isOnline = onu.status === 'Online';
                            const sigColor = onu.signalQuality === 'Good' ? 'var(--success)' : onu.signalQuality === 'Warning' ? 'var(--warning)' : 'var(--danger)';

                            return (
                              <div
                                key={onu.id}
                                onClick={() => setSelectedNode(onu)}
                                style={{
                                  display: 'flex',
                                  justifyContent: 'space-between',
                                  alignItems: 'center',
                                  padding: '0.5rem 0.65rem',
                                  background: 'var(--bg-card)',
                                  border: '1px solid var(--border-color)',
                                  borderRadius: 'var(--radius-sm)',
                                  cursor: 'pointer',
                                  transition: 'border-color 0.15s ease'
                                }}
                                onMouseEnter={(e) => {
                                  e.currentTarget.style.borderColor = 'var(--text-secondary)';
                                }}
                                onMouseLeave={(e) => {
                                  e.currentTarget.style.borderColor = 'var(--border-color)';
                                }}
                              >
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '2px', overflow: 'hidden' }}>
                                  <div style={{ fontWeight: 600, fontSize: '0.78rem', color: 'var(--text-main)', display: 'flex', alignItems: 'center', gap: '6px' }}>
                                    <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: isOnline ? 'var(--success)' : 'var(--danger)', flexShrink: 0 }} />
                                    <span style={{ fontFamily: 'JetBrains Mono, monospace' }}>{onu.label}</span>
                                    <span style={{ fontSize: '0.68rem', color: 'var(--text-muted)', fontFamily: 'JetBrains Mono, monospace' }}>:{onu.onuIndex || 1}</span>
                                  </div>
                                  <div style={{ fontSize: '0.7rem', color: 'var(--text-secondary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                    {onu.onuName !== onu.label ? onu.onuName : (onu.pppoe || 'Pelanggan FTTH')}
                                  </div>
                                  <div style={{ display: 'flex', gap: '4px', marginTop: '1px', flexWrap: 'wrap' }}>
                                    <span style={{ fontSize: '0.62rem', padding: '1px 4px', borderRadius: '2px', background: 'var(--bg-surface-elevated)', border: '1px solid var(--border-color)', color: 'var(--text-secondary)', fontFamily: 'JetBrains Mono, monospace' }}>
                                      VLAN {onu.vlan || 100}
                                    </span>
                                    {onu.profile && (
                                      <span style={{ fontSize: '0.62rem', padding: '1px 4px', borderRadius: '2px', background: 'var(--bg-surface-elevated)', border: '1px solid var(--border-color)', color: 'var(--text-muted)' }}>
                                        {onu.profile}
                                      </span>
                                    )}
                                  </div>
                                </div>

                                <div style={{ textAlign: 'right', flexShrink: 0, paddingLeft: '0.5rem' }}>
                                  <div style={{ fontSize: '0.78rem', fontWeight: 700, color: sigColor, fontFamily: 'JetBrains Mono, monospace' }}>
                                    {isOnline ? `${onu.rxPower || '-19.5'} dBm` : 'LOS'}
                                  </div>
                                  <div style={{ fontSize: '0.65rem', color: 'var(--text-muted)', fontFamily: 'JetBrains Mono, monospace' }}>
                                    {onu.distance ? `${onu.distance}m` : '350m'}
                                  </div>
                                  <span style={{
                                    fontSize: '0.62rem',
                                    fontWeight: 600,
                                    color: isOnline ? 'var(--success)' : 'var(--danger)'
                                  }}>
                                    {isOnline ? 'ONLINE' : 'LOS'}
                                  </span>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>

      {/* Node Inspector Side-Drawer (Enterprise Sheet Pattern) */}
      {selectedNode && (
        <div className="side-drawer-overlay" onClick={() => setSelectedNode(null)}>
          <div
            className="side-drawer"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="side-drawer-header">
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem' }}>
                <span style={{
                  width: '8px',
                  height: '8px',
                  borderRadius: '50%',
                  background: selectedNode.status === 'Online' || selectedNode.type === 'olt' ? 'var(--success)' : 'var(--danger)',
                  flexShrink: 0
                }} />
                <div>
                  <div style={{ fontSize: '0.92rem', fontWeight: 700, color: 'var(--text-main)', letterSpacing: '-0.01em', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                    <span>Detail {selectedNode.type.toUpperCase()}</span>
                    <span style={{ fontSize: '0.66rem', fontWeight: 600, padding: '1px 5px', borderRadius: '3px', background: 'var(--bg-card)', border: '1px solid var(--border-color)', color: 'var(--text-secondary)' }}>
                      {selectedNode.type === 'onu' ? (selectedNode.status || 'Offline') : selectedNode.vendor || 'Hardware'}
                    </span>
                  </div>
                  <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', fontFamily: 'JetBrains Mono, monospace', marginTop: '1px' }}>
                    {selectedNode.label || selectedNode.id}
                  </div>
                </div>
              </div>
              <button
                className="btn btn-secondary"
                style={{ padding: '0.28rem 0.55rem', fontSize: '0.76rem' }}
                onClick={() => setSelectedNode(null)}
                title="Tutup Panel (Esc)"
              >
                ✕ Esc
              </button>
            </div>

            <div className="side-drawer-body">
              {/* OLT Details */}
              {selectedNode.type === 'olt' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', fontSize: '0.82rem' }}>
                  <div style={{ padding: '0.75rem', background: 'var(--bg-surface-elevated)', border: '1px solid var(--border-color)', borderRadius: 'var(--radius-sm)' }}>
                    <div style={{ fontSize: '0.68rem', color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.04em' }}>Perangkat OLT</div>
                    <div style={{ fontWeight: 700, fontSize: '0.95rem', color: 'var(--text-main)', marginTop: '2px' }}>{selectedNode.label}</div>
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem' }}>
                    <div style={{ padding: '0.65rem 0.75rem', background: 'var(--bg-surface-elevated)', border: '1px solid var(--border-color)', borderRadius: 'var(--radius-sm)' }}>
                      <div style={{ fontSize: '0.68rem', color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase' }}>Vendor</div>
                      <div style={{ fontWeight: 700, color: 'var(--text-main)', marginTop: '2px' }}>{selectedNode.vendor}</div>
                    </div>
                    <div style={{ padding: '0.65rem 0.75rem', background: 'var(--bg-surface-elevated)', border: '1px solid var(--border-color)', borderRadius: 'var(--radius-sm)' }}>
                      <div style={{ fontSize: '0.68rem', color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase' }}>IP Management</div>
                      <div style={{ fontWeight: 700, color: 'var(--text-main)', fontFamily: 'JetBrains Mono, monospace', marginTop: '2px' }}>{selectedNode.ip}:{selectedNode.sshPort}</div>
                    </div>
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem' }}>
                    <div style={{ padding: '0.65rem 0.75rem', background: 'var(--bg-surface-elevated)', border: '1px solid var(--border-color)', borderRadius: 'var(--radius-sm)' }}>
                      <div style={{ fontSize: '0.68rem', color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase' }}>Port PON</div>
                      <div style={{ fontWeight: 700, color: 'var(--text-main)', fontFamily: 'JetBrains Mono, monospace', marginTop: '2px' }}>{selectedNode.ponPortsCount} Port</div>
                    </div>
                    <div style={{ padding: '0.65rem 0.75rem', background: 'var(--bg-surface-elevated)', border: '1px solid var(--border-color)', borderRadius: 'var(--radius-sm)' }}>
                      <div style={{ fontSize: '0.68rem', color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase' }}>ONU Terhubung</div>
                      <div style={{ fontWeight: 700, color: 'var(--success)', fontFamily: 'JetBrains Mono, monospace', marginTop: '2px' }}>{selectedNode.activeOnuCount} Unit</div>
                    </div>
                  </div>
                </div>
              )}

              {/* PON Details */}
              {selectedNode.type === 'pon' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', fontSize: '0.82rem' }}>
                  <div style={{ padding: '0.75rem', background: 'var(--bg-surface-elevated)', border: '1px solid var(--border-color)', borderRadius: 'var(--radius-sm)' }}>
                    <div style={{ fontSize: '0.68rem', color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase' }}>Port Interface</div>
                    <div style={{ fontWeight: 700, fontSize: '0.95rem', color: 'var(--text-main)', fontFamily: 'JetBrains Mono, monospace', marginTop: '2px' }}>{selectedNode.label}</div>
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem' }}>
                    <div style={{ padding: '0.65rem 0.75rem', background: 'var(--bg-surface-elevated)', border: '1px solid var(--border-color)', borderRadius: 'var(--radius-sm)' }}>
                      <div style={{ fontSize: '0.68rem', color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase' }}>Splitter Ratio</div>
                      <div style={{ fontWeight: 700, color: 'var(--text-main)', fontFamily: 'JetBrains Mono, monospace', marginTop: '2px' }}>{selectedNode.splitRatio}</div>
                    </div>
                    <div style={{ padding: '0.65rem 0.75rem', background: 'var(--bg-surface-elevated)', border: '1px solid var(--border-color)', borderRadius: 'var(--radius-sm)' }}>
                      <div style={{ fontSize: '0.68rem', color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase' }}>Beban ONU</div>
                      <div style={{ fontWeight: 700, color: 'var(--text-main)', fontFamily: 'JetBrains Mono, monospace', marginTop: '2px' }}>{selectedNode.onuCount} / 128 Unit</div>
                    </div>
                  </div>
                </div>
              )}

              {/* Customer ONU Details */}
              {selectedNode.type === 'onu' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', fontSize: '0.82rem' }}>
                  <div style={{ padding: '0.75rem', background: 'var(--bg-surface-elevated)', border: '1px solid var(--border-color)', borderRadius: 'var(--radius-sm)' }}>
                    <div style={{ fontSize: '0.68rem', color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase' }}>Serial Number & Pelanggan</div>
                    <div style={{ fontWeight: 700, fontSize: '1rem', color: 'var(--text-main)', marginTop: '2px', fontFamily: 'JetBrains Mono, monospace' }}>
                      {selectedNode.label}
                    </div>
                    <div style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', marginTop: '2px' }}>
                      {selectedNode.onuName || '-'}
                    </div>
                  </div>

                  {/* Optical Power Diagnostic Card */}
                  <div
                    style={{
                      background: 'var(--bg-surface-elevated)',
                      border: '1px solid var(--border-color)',
                      borderRadius: 'var(--radius-sm)',
                      padding: '0.75rem'
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span style={{ fontSize: '0.68rem', color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase' }}>Diagnostik Sinyal Rx</span>
                      <span
                        style={{
                          fontSize: '0.7rem',
                          fontWeight: 600,
                          color: selectedNode.signalQuality === 'Good' ? 'var(--success)' : selectedNode.signalQuality === 'Warning' ? 'var(--warning)' : 'var(--danger)'
                        }}
                      >
                        {selectedNode.status === 'Online' ? (selectedNode.signalQuality === 'Good' ? 'Kualitas Baik' : 'Peringatan Redaman') : 'Loss of Signal'}
                      </span>
                    </div>

                    <div style={{ display: 'flex', alignItems: 'baseline', gap: '0.35rem', marginTop: '0.35rem' }}>
                      <span style={{ fontSize: '1.4rem', fontWeight: 800, color: 'var(--text-main)', fontFamily: 'JetBrains Mono, monospace' }}>
                        {selectedNode.status === 'Online' ? selectedNode.rxPower : '-∞'}
                      </span>
                      <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>dBm</span>
                    </div>

                    {/* Optical Signal Bar */}
                    <div className="optical-meter" style={{ height: '4px', marginTop: '0.45rem', background: 'var(--border-color)', borderRadius: '2px' }}>
                      <div
                        className="optical-meter-fill"
                        style={{
                          width: selectedNode.status === 'Online' ? `${Math.min(100, Math.max(10, (1 - (Math.abs(selectedNode.rxPower || 20) - 15) / 20) * 100))}%` : '0%',
                          background: selectedNode.signalQuality === 'Good' ? 'var(--success)' : selectedNode.signalQuality === 'Warning' ? 'var(--warning)' : 'var(--danger)'
                        }}
                      />
                    </div>

                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.65rem', color: 'var(--text-muted)', marginTop: '4px', fontFamily: 'JetBrains Mono, monospace' }}>
                      <span>-15 dBm</span>
                      <span>-24 dBm</span>
                      <span>-30 dBm</span>
                    </div>
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem' }}>
                    <div style={{ padding: '0.65rem 0.75rem', background: 'var(--bg-surface-elevated)', border: '1px solid var(--border-color)', borderRadius: 'var(--radius-sm)' }}>
                      <div style={{ fontSize: '0.68rem', color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase' }}>Port Interface</div>
                      <div style={{ fontWeight: 700, color: 'var(--text-main)', fontFamily: 'JetBrains Mono, monospace', marginTop: '2px' }}>1/{selectedNode.cardSlot || 1}/{selectedNode.ponPort}:{selectedNode.onuIndex || 1}</div>
                    </div>
                    <div style={{ padding: '0.65rem 0.75rem', background: 'var(--bg-surface-elevated)', border: '1px solid var(--border-color)', borderRadius: 'var(--radius-sm)' }}>
                      <div style={{ fontSize: '0.68rem', color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase' }}>Estimasi Jarak</div>
                      <div style={{ fontWeight: 700, color: 'var(--text-main)', fontFamily: 'JetBrains Mono, monospace', marginTop: '2px' }}>{selectedNode.distance || 350} m</div>
                    </div>
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem' }}>
                    <div style={{ padding: '0.65rem 0.75rem', background: 'var(--bg-surface-elevated)', border: '1px solid var(--border-color)', borderRadius: 'var(--radius-sm)' }}>
                      <div style={{ fontSize: '0.68rem', color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase' }}>VLAN ID</div>
                      <div style={{ fontWeight: 700, color: 'var(--text-main)', fontFamily: 'JetBrains Mono, monospace', marginTop: '2px' }}>VLAN {selectedNode.vlan || 100}</div>
                    </div>
                    <div style={{ padding: '0.65rem 0.75rem', background: 'var(--bg-surface-elevated)', border: '1px solid var(--border-color)', borderRadius: 'var(--radius-sm)' }}>
                      <div style={{ fontSize: '0.68rem', color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase' }}>Service Profile</div>
                      <div style={{ fontWeight: 700, color: 'var(--text-main)', marginTop: '2px' }}>{selectedNode.profile || '-'}</div>
                    </div>
                  </div>

                  {selectedNode.pppoe && (
                    <div style={{ padding: '0.65rem 0.75rem', background: 'var(--bg-surface-elevated)', border: '1px solid var(--border-color)', borderRadius: 'var(--radius-sm)' }}>
                      <div style={{ fontSize: '0.68rem', color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase' }}>Username PPPoE</div>
                      <div style={{ fontWeight: 700, color: 'var(--text-main)', fontFamily: 'JetBrains Mono, monospace', marginTop: '2px' }}>
                        {selectedNode.pppoe}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>

            <div className="side-drawer-footer">
              <button className="btn btn-secondary btn-sm" onClick={() => setSelectedNode(null)}>
                Tutup Panel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
