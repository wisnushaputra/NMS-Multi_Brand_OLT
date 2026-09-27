-- NMS Database Schema

CREATE TABLE IF NOT EXISTS users (
    user_id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    role TEXT DEFAULT 'admin',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS devices (
    device_id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    vendor TEXT NOT NULL, -- ZTE, Huawei, Fiberhome
    ip_address TEXT NOT NULL,
    port INTEGER DEFAULT 22,
    credentials TEXT NOT NULL, -- JSON encrypted string / object
    status TEXT DEFAULT 'Online', -- Online, Offline, Warning
    pon_ports_count INTEGER DEFAULT 8,
    last_seen DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS olt_adapters (
    adapter_id INTEGER PRIMARY KEY AUTOINCREMENT,
    vendor TEXT UNIQUE NOT NULL,
    version TEXT NOT NULL,
    path TEXT NOT NULL,
    status TEXT DEFAULT 'Active'
);

CREATE TABLE IF NOT EXISTS service_profiles (
    profile_id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT UNIQUE NOT NULL,
    vlan_id INTEGER NOT NULL,
    vlan_template TEXT NOT NULL,
    wan_config_template TEXT NOT NULL,
    pppoe_username_template TEXT NOT NULL,
    pppoe_password_template TEXT NOT NULL,
    vlan_profile TEXT DEFAULT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS onus (
    onu_id INTEGER PRIMARY KEY AUTOINCREMENT,
    device_id INTEGER NOT NULL,
    serial_number TEXT NOT NULL UNIQUE,
    pon_port_id INTEGER NOT NULL,
    vlan_id INTEGER NOT NULL,
    service_profile_id INTEGER NOT NULL,
    status TEXT DEFAULT 'Online', -- Online, Offline, Loss of Signal
    pppoe_username TEXT,
    pppoe_password TEXT,
    pppoe_profile TEXT DEFAULT 'profile_50mbps',
    billing_status TEXT DEFAULT 'active', -- active, isolated, suspended
    last_isolated_at DATETIME,
    rx_power REAL DEFAULT -19.5,
    distance_meters INTEGER DEFAULT 350,
    onu_name TEXT,
    onu_index INTEGER DEFAULT 1,
    last_offline_reason TEXT DEFAULT NULL, -- 'dying-gasp', 'los', 'manual'
    last_offline_at DATETIME DEFAULT NULL,
    last_repush_at DATETIME DEFAULT NULL,
    wifi_ssid TEXT DEFAULT NULL,
    wifi_password TEXT DEFAULT NULL,
    loop_detected INTEGER DEFAULT 0,
    isolated_lan_port INTEGER DEFAULT NULL,
    last_loop_at DATETIME DEFAULT NULL,
    FOREIGN KEY (device_id) REFERENCES devices (device_id) ON DELETE CASCADE,
    FOREIGN KEY (service_profile_id) REFERENCES service_profiles (profile_id)
);

CREATE TABLE IF NOT EXISTS loop_incidents (
    incident_id INTEGER PRIMARY KEY AUTOINCREMENT,
    onu_id INTEGER NOT NULL,
    device_id INTEGER NOT NULL,
    pon_port INTEGER NOT NULL,
    onu_index INTEGER NOT NULL,
    lan_port INTEGER DEFAULT 1,
    mac_address TEXT,
    vlan_id INTEGER,
    flapping_frequency INTEGER DEFAULT 120,
    storm_rate_pps INTEGER DEFAULT 4500,
    status TEXT DEFAULT 'active', -- active, isolated, resolved
    auto_isolated INTEGER DEFAULT 1,
    mitigation_cli TEXT,
    detected_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    resolved_at DATETIME DEFAULT NULL,
    resolved_by TEXT DEFAULT NULL,
    FOREIGN KEY (onu_id) REFERENCES onus (onu_id) ON DELETE CASCADE,
    FOREIGN KEY (device_id) REFERENCES devices (device_id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS audit_logs (
    log_id INTEGER PRIMARY KEY AUTOINCREMENT,
    timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
    user_id INTEGER,
    username TEXT DEFAULT 'system',
    action TEXT NOT NULL,
    target_device_id INTEGER,
    target_device_name TEXT,
    details TEXT, -- JSON string
    status TEXT DEFAULT 'Success'
);

CREATE TABLE IF NOT EXISTS system_settings (
    key TEXT PRIMARY KEY,
    value TEXT
);

CREATE TABLE IF NOT EXISTS optical_history (
    history_id INTEGER PRIMARY KEY AUTOINCREMENT,
    onu_id INTEGER NOT NULL,
    timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
    rx_power REAL,
    status TEXT,
    FOREIGN KEY (onu_id) REFERENCES onus (onu_id) ON DELETE CASCADE
);

-- GIS & Fiber Outside Plant (FOP) Tables
CREATE TABLE IF NOT EXISTS gis_odc (
    odc_id INTEGER PRIMARY KEY AUTOINCREMENT,
    device_id INTEGER NOT NULL,
    name TEXT NOT NULL UNIQUE,
    latitude REAL NOT NULL,
    longitude REAL NOT NULL,
    capacity INTEGER DEFAULT 48,
    used_ports INTEGER DEFAULT 12,
    splitter_ratio TEXT DEFAULT '1:4',
    address TEXT,
    status TEXT DEFAULT 'Normal',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (device_id) REFERENCES devices (device_id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS gis_odp (
    odp_id INTEGER PRIMARY KEY AUTOINCREMENT,
    odc_id INTEGER NOT NULL,
    name TEXT NOT NULL UNIQUE,
    latitude REAL NOT NULL,
    longitude REAL NOT NULL,
    capacity INTEGER DEFAULT 8,
    used_ports INTEGER DEFAULT 4,
    splitter_ratio TEXT DEFAULT '1:8',
    address TEXT,
    status TEXT DEFAULT 'Normal',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (odc_id) REFERENCES gis_odc (odc_id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS fiber_routes (
    route_id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    type TEXT NOT NULL, -- 'feeder', 'distribution', 'drop'
    source_type TEXT NOT NULL, -- 'olt', 'odc', 'odp'
    source_id INTEGER NOT NULL,
    target_type TEXT NOT NULL, -- 'odc', 'odp', 'onu'
    target_id INTEGER NOT NULL,
    total_distance_m INTEGER NOT NULL,
    core_count INTEGER DEFAULT 24,
    path_geojson TEXT NOT NULL, -- JSON array of [lat, lng] points
    status TEXT DEFAULT 'Normal', -- 'Normal', 'Degraded', 'Broken'
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

