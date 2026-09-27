# API.md

## Endpoint Utama

### Devices (Management)
- `GET /api/devices`: List semua OLT.
- `POST /api/devices`: Tambah OLT baru.
- `PUT /api/devices/{device_id}`: Update info OLT.
- `GET /api/devices/{device_id}/status`: Cek status OLT.

### Provisioning (Automation)
- `POST /api/onu/provision`: Registrasi & konfigurasi ONU (input: `device_id`, `onu_sn`, `pon_port`, `service_profile_id`).
- `POST /api/onu/{onu_id}/pppoe`: Push username/password PPPoE.

### Configuration (Vendor-Specific)
- `POST /api/devices/{device_id}/execute`: Eksekusi command generik (diteruskan ke OLT Adapter).

### Audit
- `GET /api/logs`: Ambil audit logs (filtering: `user_id`, `device_id`, `action`).
