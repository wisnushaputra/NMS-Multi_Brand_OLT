# TASKS.md

## Fase 1: Setup & Core
- [x] Initialize project (Repo, Docker/Composer).
- [x] Setup Database schema (Migration scripts).
- [x] Implement User Auth (Login, Session).
- [x] Dashboard Skeleton & Layout.

## Fase 2: OLT Management & Adapters
- [x] CRUD Device OLT.
- [x] OLT Adapter Base Class (Interface).
- [x] Implement OLT Adapter ZTE.
- [x] Implement OLT Adapter Huawei.
- [x] Implement OLT Adapter Fiberhome.
- [x] CLI Terminal Runner (Interactive multi-vendor command runner).

## Fase 3: Provisioning & Automation
- [x] Service Profile Management (VLAN & PPPoE templates).
- [x] Flow Unconfigured ONU Scan (ZTE, Huawei, Fiberhome).
- [x] Provisi ONU API endpoint & multi-vendor CLI execution.
- [x] PPPoE Auto-configuration & Push credentials module.
- [x] OMCI Optical diagnostics (Rx/Tx dBm, Distance, Temp).

## Fase 4: Monitoring & Logs
- [x] Audit Log Service with user attribution & search/filters.
- [x] Real-time Status Monitoring & Optical health scoring.
- [x] Interactive SVG Network Topology Visualization & ODF matrix view.

## Fase 5: Integrasi & Polish
- [x] Integrasi GenieACS TR-069 (REST client, CPE parameter mapping, reboot task).
- [x] Notifikasi Gangguan (Telegram Bot & HTTP Webhook).
- [x] Incident Simulator (Loss of Signal & OLT Down stress test).
- [x] Modern Minimalist Neutral Zinc UI (Anti AI-slop).
- [x] Testing & Verification.

## Fase 6: Real-Time Poller Daemon & Auto-Alarm (Background Worker)
- [x] Background Poller Worker Daemon (configurable interval, default 30s).
- [x] Automatic Optical Health & Reachability checks (OLT & ONU sweeps).
- [x] Incident Auto-Alarm Detection (State transition to LOS or OLT Unreachable -> Telegram & Webhook alert).
- [x] Optical Power Historical Telemetry (`optical_history` table with 7-day auto-pruning).
- [x] Server-Sent Events (SSE) Live Event Stream (`/api/events/stream`) with automatic dashboard sync.
- [x] Poller Daemon Control & Status bar on Dashboard (Cycle counter, pause/resume, manual sweep trigger).
- [x] Interactive SVG Optical Power History Chart (Normal >-24 dBm, Warning -24 to -27 dBm, Critical <-27 dBm) in ONU details modal.

## Fase 7: Peta Geografis GIS & Manajemen ODC/ODP (Fiber Cable Mapping) [Dinonaktifkan / Dihapus]
- [x] Fitur Peta GIS & Fiber Outside Plant (ODC/ODP) telah dinonaktifkan dan dihapus dari aplikasi utama sesuai permintaan pengguna (belum terpakai saat ini). Bundle frontend menjadi lebih ringan (-190 kB).

## Fase 8: Manajemen Pengguna & Hak Akses Berjenjang (RBAC)
- [x] Middleware Otorisasi Backend `requireRole(...allowedRoles)` dengan proteksi HTTP 403 Forbidden.
- [x] 4 Level Peran Spesifik: Super Admin (`superadmin`), NOC Engineer (`noc_engineer`), Field Technician (`field_technician`), dan Helpdesk / CS (`helpdesk`).
- [x] Seeder 4 Akun Demo Multi-Role (`admin`, `noc_ryan`, `tech_budi`, `helpdesk_siti`).
- [x] REST API Manajemen Pengguna (CRUD user, reset password, proteksi anti hapus akun sendiri).
- [x] Halaman UI Manajemen Pengguna (`UserManager.jsx`) dengan kartu matriks izin RBAC dan filter peran.
- [x] Adaptasi Dinamis Sidebar & Header (penyaringan menu yang diizinkan per role, badge peran di profil pengguna).
- [x] Isolasi Hak Akses Operasional (proteksi read-only pada tombol tambah OLT, terminal CLI, dan hapus ONU).
## Fase 9: Integrasi MikroTik Core Router (BRAS/PPPoE & Isolir Otomatis)
- [x] Database Schema Migration: `billing_status` ('active' | 'isolated'), `pppoe_profile`, `last_isolated_at` pada tabel `onus` dan tabel setelan `system_settings` router MikroTik.
- [x] MikroTik RouterOS API Client & Driver (`backend/services/mikrotik_service.js`): RouterOS v7 REST client / Socket API dengan graceful simulation fallback engine.
- [x] Otomatisasi Sinkronisasi PPPoE Secret saat provisi ONU di NMS (`onu_controller.js`).
- [x] Fitur Isolir / Suspend Pelanggan Otomatis: Satu klik untuk mengisolir pelanggan menunggak (mengubah profil PPPoE ke `profile_isolir` Walled Garden 128 kbps, kick sesi aktif di `/ppp/active` untuk memaksa re-dial seketika).
- [x] Fitur Buka Isolir (1-Klik Pulihkan Layanan): Mengembalikan profil pelanggan ke reguler (`profile_50mbps`), me-refresh koneksi, dan mencatat audit trail.
- [x] Monitoring Real-Time Traffic Bandwidth Pelanggan: Live Rx/Tx gauges, SVG dynamic sparkline chart, total kuota GB, IP lease BRAS, MAC address, dan uptime sesi.
- [x] Tab Konfigurasi MikroTik Core Router (BRAS) di Integrasi Sistem: Telemetri kesehatan router (Model board, RouterOS version, CPU load %, Free RAM, Active PPPoE sessions) dan form kredensial API dengan tombol Uji Koneksi.
- [x] Penegakan Keamanan RBAC: Izin isolir/buka isolir khusus untuk Super Admin & NOC Engineer; teknisi dan CS memiliki akses monitoring traffic (read-only).
