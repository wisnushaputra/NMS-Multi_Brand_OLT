# DATABASE.md

## Entitas Utama
- **Devices (Perangkat)**:
    - `device_id` (PK)
    - `name` (Nama perangkat)
    - `vendor` (ZTE, Huawei, Fiberhome)
    - `ip_address`
    - `port`
    - `credentials` (Encrypted)
    - `status` (Online/Offline)
    - `last_seen`
- **OLT Adapters**:
    - `adapter_id` (PK)
    - `vendor` (Foreign Key ke Devices.vendor atau lookup table)
    - `version`
    - `path` (Lokasi file adapter)
- **ONUs**:
    - `onu_id` (PK)
    - `device_id` (FK ke Devices)
    - `serial_number`
    - `pon_port_id`
    - `vlan_id`
    - `service_profile_id` (FK ke ServiceProfiles)
    - `status`
- **ServiceProfiles**:
    - `profile_id` (PK)
    - `name`
    - `vlan_template`
    - `wan_config_template`
    - `pppoe_username_template`
    - `pppoe_password_template`
- **AuditLogs**:
    - `log_id` (PK)
    - `timestamp`
    - `user_id`
    - `action` (e.g., "Provision ONU", "Change VLAN")
    - `target_device_id` (FK ke Devices)
    - `details` (JSONb untuk detail konfigurasi)
    - `status` (Success/Failed)
- **Users**:
    - `user_id` (PK)
    - `username`
    - `password_hash`
    - `role`

## Relasi
- One-to-Many: `Devices` -> `ONUs` (satu OLT memiliki banyak ONU)
- One-to-Many: `ServiceProfiles` -> `ONUs` (satu profil layanan bisa untuk banyak ONU)
- Many-to-One: `AuditLogs` -> `Devices`, `Users`
