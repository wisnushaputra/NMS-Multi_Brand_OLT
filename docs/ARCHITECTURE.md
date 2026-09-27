# ARCHITECTURE.md

## High-Level Architecture
NMS berbasis web dengan modularitas tinggi, terutama pada bagian OLT Adapter.

## Komponen
- **Web Dashboard**: Antarmuka pengguna untuk monitoring, konfigurasi, dan provisioning.
- **Backend Service**: Logika bisnis utama, manajemen data, dan orkestrasi.
- **OLT Adapter Layer**: Abstraksi untuk berbagai vendor OLT (ZTE, Huawei, Fiberhome). Menerjemahkan perintah generik menjadi perintah spesifik vendor.
- **Database**: Penyimpanan data konfigurasi, status perangkat, audit log, service profiles.
- **Integrasi Eksternal**:
    - **GenieACS**: Untuk manajemen PPPoE dan profil layanan.
    - **Monitoring Tools**: Untuk visualisasi topologi, status, dan notifikasi.

## Alur Kerja
1. Admin via Web Dashboard kirim perintah ke Backend.
2. Backend tentukan OLT vendor, kirim ke OLT Adapter sesuai.
3. OLT Adapter terjemahkan, eksekusi perintah di OLT.
4. OLT kembalikan status ke Adapter, Adapter ke Backend, Backend ke Dashboard.
5. Setiap aksi tercatat di Audit Log.
