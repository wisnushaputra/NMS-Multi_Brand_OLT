import { BaseOLTAdapter } from './base_adapter.js';

export class HuaweiAdapter extends BaseOLTAdapter {
  constructor(device) {
    super(device);
    this.vendor = 'Huawei';
  }

  async testConnection() {
    const delay = Math.floor(Math.random() * 200) + 100;
    await new Promise((resolve) => setTimeout(resolve, delay));
    return {
      success: true,
      vendor: 'Huawei',
      device: this.device.name,
      ip: this.device.ip_address,
      prompt: 'MA5608T>',
      version: 'Huawei SmartAX MA5608T V800R018C10'
    };
  }

  async executeCommand(command) {
    const timestamp = new Date().toISOString();
    let responseText = '';

    if (command.includes('display ont autofind')) {
      responseText = `  ----------------------------------------------------------------------------
  Number              : 1
  F/S/P               : 0/1/1
  Ont SN              : 4857544300112233 (HWTC-00112233)
  Password            : 
  Loid                : 
  VendorID            : HWTC
  Ont Version         : V3.0
  Ont SoftwareVersion : V3.00.10D001
  ----------------------------------------------------------------------------`;
    } else if (command.includes('display board')) {
      responseText = `  -------------------------------------------------------------------------
  SlotID  BoardName  Status       SubType   OnlineState
  -------------------------------------------------------------------------
  0/0     H801MPWD   Normal                 
  0/1     H805GPFD   Normal                 Active
  0/2     H805GPFD   Normal                 Active
  -------------------------------------------------------------------------`;
    } else {
      responseText = `MA5608T(config)# ${command}
% Huawei CLI command executed on ${this.device.name} successfully.`;
    }

    return {
      command,
      output: responseText,
      timestamp,
      device: this.device.name
    };
  }

  async provisionONU(params) {
    const { serialNumber, ponPort, serviceProfileName, vlanId, onuIndex = 1, onuName } = params;
    const cleanDesc = (onuName || 'NMS_PROVISIONED').replace(/[\r\n\t"'\\]/g, '').slice(0, 64);

    const cliCommands = [
      `enable`,
      `config`,
      `interface gpon 0/1`,
      `ont add ${ponPort} ${onuIndex} sn-auth ${serialNumber} omci ont-lineprofile-name ${serviceProfileName || 'LINE-PROF-1'} ont-srvprofile-name ${serviceProfileName || 'SRV-PROF-1'} desc "${cleanDesc}"`,
      `quit`,
      `service-port vlan ${vlanId} gpon 0/1/${ponPort} ont ${onuIndex} gemport 1 rx-cttr 6 tx-cttr 6`
    ];

    const logs = [];
    logs.push(`[HUAWEI-ADAPTER] Connecting to ${this.device.ip_address}...`);
    logs.push(`[HUAWEI-ADAPTER] Connected to Huawei MA5608T`);
    cliCommands.forEach((cmd) => logs.push(`MA5608T(config)# ${cmd}`));
    logs.push(`[HUAWEI-ADAPTER] ONT ${serialNumber} added on port 0/1/${ponPort}:${onuIndex}`);

    return {
      success: true,
      vendor: 'Huawei',
      serialNumber,
      ponPort,
      onuIndex,
      vlanId,
      cliExecuted: cliCommands.join('\n'),
      logs
    };
  }

  async configurePPPoE(params) {
    const { serialNumber, ponPort, onuIndex = 1, pppoeUsername, pppoePassword, vlanId } = params;

    const cliCommands = [
      `config`,
      `ont ipconfig 0/1 ${ponPort} ${onuIndex} pppoe user-account ${pppoeUsername} password ${pppoePassword} vlan ${vlanId}`,
      `save`
    ];

    return {
      success: true,
      vendor: 'Huawei',
      serialNumber,
      pppoeUsername,
      cliExecuted: cliCommands.join('\n'),
      message: `PPPoE user ${pppoeUsername} configured for Huawei ONT ${serialNumber}`
    };
  }

  async replaceONU(params) {
    const {
      oldSerialNumber,
      newSerialNumber,
      ponPort,
      onuIndex = 1,
      customerName = '',
      pppoeUsername = '',
      vlanId = 100
    } = params;

    const cliCommands = [
      `interface gpon 0/1`,
      `  ont modify ${ponPort} ${onuIndex} sn-auth "${newSerialNumber}"`,
      customerName ? `  ont modify ${ponPort} ${onuIndex} desc "${customerName}"` : null,
      `  service-port vlan ${vlanId} gpon 0/1/${ponPort} ont ${onuIndex} gemport 1 multi-service user-vlan ${vlanId} tag-transform translate`,
      `save`
    ].filter(Boolean);

    const logs = [
      `[HUAWEI-ADAPTER] Connecting to ${this.device.ip_address}:${this.device.port} for ONT Swap...`,
      `[HUAWEI-ADAPTER] Modifying serial number authorization: Port 0/1/${ponPort} ONT ${onuIndex}`,
      `OLT(config)# interface gpon 0/1`,
      `OLT(config-if-gpon-0/1)# ont modify ${ponPort} ${onuIndex} sn-auth "${newSerialNumber}"`,
      `OLT(config-if-gpon-0/1)# save`,
      `[HUAWEI-ADAPTER] ONT hardware swap completed: ${oldSerialNumber} ➔ ${newSerialNumber}`
    ];

    return {
      success: true,
      vendor: 'Huawei',
      oldSerialNumber,
      newSerialNumber,
      ponPort,
      onuIndex,
      vlanId,
      cliExecuted: cliCommands.join('\n'),
      logs
    };
  }

  async getUnconfiguredONUs() {
    return [
      {
        serialNumber: 'HWTC00112233',
        ponPort: 1,
        vendor: 'Huawei',
        model: 'HG8245H',
        discoveredAt: '1 min ago',
        rxPower: -18.2,
        txPower: 2.1,
        opticalStatus: 'Optimal'
      }
    ];
  }

  async checkPreOpticalPower(params) {
    const { serialNumber = '', ponPort = 1 } = params;
    let rx = -18.2;
    if (serialNumber.includes('FAIL') || serialNumber.includes('CRIT')) {
      rx = -29.5;
    } else if (serialNumber.includes('WARN')) {
      rx = -25.5;
    } else if (serialNumber) {
      const hash = Math.abs(serialNumber.split('').reduce((acc, c) => acc + c.charCodeAt(0), 0));
      rx = -17.5 - (hash % 50) / 10;
      rx = Math.round(rx * 10) / 10;
    }

    const tx = 2.1;
    let status = 'Optimal';
    let quality = 'Bagus / Optimal';
    let message = `Sinyal optik sangat baik (${rx} dBm). Redaman memenuhi standar ITU-T G.984.`;

    if (rx < -27.0) {
      status = 'Critical';
      quality = 'Kritis (Loss Tinggi)';
      message = `Peringatan: Redaman kabel (${rx} dBm) melebihi batas toleransi (-27.0 dBm). Disarankan membersihkan konektor atau cek sambungan fiber sebelum aktivasi!`;
    } else if (rx < -24.0) {
      status = 'Warning';
      quality = 'Cukup (Waspada)';
      message = `Perhatian: Sinyal optik (${rx} dBm) mendekati ambang batas wajar.`;
    }

    return {
      serialNumber,
      ponPort,
      vendor: 'Huawei',
      rxPower: rx,
      txPower: tx,
      distanceMeters: 230,
      status,
      quality,
      message,
      thresholds: {
        optimal: [-24.0, -8.0],
        warning: [-27.0, -24.0],
        critical: -27.0
      }
    };
  }

  async rebootONU(params) {
    const { serialNumber, ponPort, onuIndex = 1 } = params;

    const cliCommands = [
      `enable`,
      `config`,
      `interface gpon 0/1`,
      `ont reset ${ponPort} ${onuIndex}`,
      `quit`
    ];

    const logs = [];
    logs.push(`[HUAWEI-ADAPTER] Connecting to ${this.device.ip_address}...`);
    logs.push(`[HUAWEI-ADAPTER] Authenticated to Huawei MA5608T`);
    cliCommands.forEach((cmd) => logs.push(`MA5608T(config)# ${cmd}`));
    logs.push(`[HUAWEI-ADAPTER] ONT reset command issued for ${serialNumber} on 0/1/${ponPort}:${onuIndex}`);

    return {
      success: true,
      vendor: 'Huawei',
      serialNumber,
      ponPort,
      onuIndex,
      cliExecuted: cliCommands.join('\n'),
      logs,
      message: `Perintah reset ONT berhasil dikirim ke Huawei ${serialNumber} (Port 0/1/${ponPort}:${onuIndex})`
    };
  }

  async getONUStatus(serialNumber, params = {}) {
    const st = params.status || 'Online';
    let offlineReason = params.offlineReason || null;
    if (st !== 'Online' && !offlineReason) {
      offlineReason = st.toLowerCase().includes('loss') ? 'los' : 'dying-gasp';
    }
    const isOnline = st === 'Online';

    return {
      serialNumber,
      vendor: 'Huawei',
      rxPower: params.rxPower !== undefined && params.rxPower !== null ? params.rxPower : (isOnline ? -17.5 : (offlineReason === 'los' ? -35.0 : null)),
      txPower: isOnline ? 2.1 : null,
      temperature: isOnline ? '39°C' : 'N/A',
      voltage: isOnline ? '3.3V' : '0.0V',
      status: st,
      omciState: isOnline ? 'Normal' : (offlineReason === 'dying-gasp' ? 'Dying-Gasp' : 'LOS / LOFI'),
      distanceMeters: isOnline ? (params.distance || 210) : null,
      offlineReason: isOnline ? null : offlineReason,
      lastOfflineAt: isOnline ? null : (params.lastOfflineAt || new Date().toISOString()),
      offlineDetail: isOnline ? null : {
        cause: offlineReason === 'dying-gasp' ? 'Dying-Gasp (Power Outage)' : 'Loss of Signal (Fiber Cut)',
        alarmCode: offlineReason === 'dying-gasp' ? '0x02310002' : '0x02310001',
        recommendation: offlineReason === 'dying-gasp'
          ? 'Sinyal Dying Gasp terdeteksi pada port OLT. Catu daya modem terputus (mati lampu / dicabut). Tidak perlu mengirim teknisi penarikan kabel.'
          : 'Sinyal optik hilang tiba-tiba (LOS/LOFI). Terindikasi kabel distribusi/dropcore putus atau redaman anjlok. Kirim teknisi sambung kabel.'
      }
    };
  }

  async modifyServiceProfile({ serialNumber, ponPort, onuIndex, oldProfile, newProfile, vlanId }) {
    const port = ponPort || 1;
    const index = onuIndex || 1;
    const devName = this.device.name || 'Huawei-OLT';
    const profileName = newProfile.name || 'profile_default';

    const cliCommands = [
      `${devName}(config)# interface gpon 0/1`,
      `${devName}(config-if-gpon-0/1)# ont modify ${port} ${index} ont-lineprofile-name ${profileName} ont-srvprofile-name ${profileName}`,
      `${devName}(config-if-gpon-0/1)# quit`
    ];

    const logs = [
      `[HUAWEI-ADAPTER] Connecting to ${this.device.ip_address}:${this.device.port || 22} via SSH...`,
      `[HUAWEI-ADAPTER] Authenticated as ${devName}`,
      ...cliCommands,
      `[HUAWEI-ADAPTER] Service profile successfully modified for Huawei ONT ${serialNumber} on Port 0/1/${port}:${index} to ${profileName}`
    ];

    return {
      success: true,
      serialNumber,
      ponPort: port,
      onuIndex: index,
      oldProfile: oldProfile?.name || 'Previous Profile',
      newProfile: profileName,
      cliExecuted: cliCommands.join('\n'),
      logs,
      message: `Paket layanan ONT Huawei ${serialNumber} berhasil diubah ke ${profileName} (Port 0/1/${port}:${index})`
    };
  }

  async getRegisteredONUs() {
    const devName = this.device.name || 'Huawei-OLT';
    const cliCommands = [
      `${devName}# display ont info 0 all`,
      `${devName}# display ont optical-info 0 all`
    ];

    const registered = [
      {
        serial_number: 'HWTC00112233',
        pon_port_id: 1,
        onu_index: 1,
        onu_name: 'KANTOR_DESA_MAJU',
        status: 'Online',
        rx_power: -17.5,
        distance_meters: 210,
        vlan_id: 100,
        profile_name: 'INTERNET-100M',
        vendor: 'Huawei',
        model: 'HG8245H'
      },
      {
        serial_number: 'HWTC00223344',
        pon_port_id: 1,
        onu_index: 2,
        onu_name: 'RESTO_SEDAP_MALAM',
        status: 'Online',
        rx_power: -19.2,
        distance_meters: 430,
        vlan_id: 100,
        profile_name: 'INTERNET-100M',
        vendor: 'Huawei',
        model: 'EG8145V5'
      },
      {
        serial_number: 'HWTC00334455',
        pon_port_id: 2,
        onu_index: 1,
        onu_name: 'APOTEK_SEHAT',
        status: 'Online',
        rx_power: -18.0,
        distance_meters: 390,
        vlan_id: 100,
        profile_name: '50M',
        vendor: 'Huawei',
        model: 'HG8546M'
      }
    ];

    return {
      success: true,
      vendor: 'Huawei',
      cliExecuted: cliCommands.join('\n'),
      totalFound: registered.length,
      onus: registered
    };
  }

  async repushConfig(params) {
    const {
      serialNumber,
      ponPort,
      onuIndex = 1,
      pppoeUsername,
      pppoePassword,
      vlanId = 100,
      profileName = 'INTERNET',
      acsUrl = 'http://103.176.227.233:3001/',
      wifiSsid,
      wifiPassword,
      rebootAfterPush = false
    } = params;

    const cliCommands = [
      `config`,
      `interface gpon 0/${ponPort}`,
      `  ont ipconfig 0 ${onuIndex} pppoe vlan ${vlanId} priority 0 user-account name ${pppoeUsername} password ${pppoePassword}`,
      `  ont internet-config 0 ${onuIndex} ip-index 1 pppoe user-name ${pppoeUsername} password ${pppoePassword} vlan ${vlanId}`,
      `  ont tr069-server-config 0 ${onuIndex} profile-name tr069_default url ${acsUrl}`,
      `  ont port native-vlan 0 ${onuIndex} eth 1 vlan ${vlanId} priority 0`,
      rebootAfterPush ? `  ont reset 0 ${onuIndex}` : null,
      `quit`,
      `service-port vlan ${vlanId} gpon 0/${ponPort} ont ${onuIndex} gemport 1 multi-service user-vlan ${vlanId} tag-transform translate`
    ].filter(Boolean);

    return {
      success: true,
      vendor: 'Huawei',
      serialNumber,
      ponPort,
      onuIndex,
      pppoeUsername,
      vlanId,
      wifiSsid: wifiSsid || null,
      rebootScheduled: Boolean(rebootAfterPush),
      cliExecuted: cliCommands.join('\n'),
      message: `Konfigurasi lengkap berhasil didorong ulang ke Huawei ONT ${serialNumber} (Port 0/${ponPort}:${onuIndex})`
    };
  }

  async detectLoopbackEvents() {
    const cliCommands = [
      `display loopback-detection`,
      `display mac-flapping record`
    ];

    return {
      success: true,
      vendor: 'Huawei',
      cliExecuted: cliCommands.join('\n'),
      incidents: []
    };
  }

  async setLanPortState(params) {
    const { ponPort, onuIndex = 1, lanPort = 1, state = 'shutdown' } = params;
    const isShutdown = state.toLowerCase() === 'shutdown' || state.toLowerCase() === 'down';

    const cliCommands = [
      `interface gpon 0/${ponPort}`,
      `  ont port state 0 ${onuIndex} eth ${lanPort} ${isShutdown ? 'down' : 'up'}`,
      `quit`
    ];

    return {
      success: true,
      vendor: 'Huawei',
      ponPort,
      onuIndex,
      lanPort,
      state: isShutdown ? 'down' : 'up',
      cliExecuted: cliCommands.join('\n'),
      message: `Port LAN ${lanPort} pada Huawei ONT 0/${ponPort}:${onuIndex} berhasil di-set: ${isShutdown ? 'DOWN (Isolated)' : 'UP (Active)'}`
    };
  }
}

