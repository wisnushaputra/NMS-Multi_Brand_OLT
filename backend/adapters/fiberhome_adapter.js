import { BaseOLTAdapter } from './base_adapter.js';

export class FiberhomeAdapter extends BaseOLTAdapter {
  constructor(device) {
    super(device);
    this.vendor = 'Fiberhome';
  }

  async testConnection() {
    const delay = Math.floor(Math.random() * 200) + 100;
    await new Promise((resolve) => setTimeout(resolve, delay));
    return {
      success: true,
      vendor: 'Fiberhome',
      device: this.device.name,
      ip: this.device.ip_address,
      prompt: 'AN5516#',
      version: 'Fiberhome AN5516-01 V3.1.2'
    };
  }

  async executeCommand(command) {
    const timestamp = new Date().toISOString();
    let responseText = '';

    if (command.includes('show disc_onu')) {
      responseText = `Slot  PON  ONU_Type  MAC/SN
----------------------------------------
1     3    AN5506-02 FHTT88990011`;
    } else {
      responseText = `AN5516# ${command}
% Fiberhome CLI command executed successfully on ${this.device.name}.`;
    }

    return {
      command,
      output: responseText,
      timestamp,
      device: this.device.name
    };
  }

  async provisionONU(params) {
    const { serialNumber, ponPort, serviceProfileName, vlanId, onuIndex = 1 } = params;

    const cliCommands = [
      `cd card 1`,
      `set onu auth slot 1 pon ${ponPort} onu ${onuIndex} sn ${serialNumber} type AN5506`,
      `set onu service slot 1 pon ${ponPort} onu ${onuIndex} profile ${serviceProfileName || 'BASIC'}`,
      `set onu vlan slot 1 pon ${ponPort} onu ${onuIndex} vlan ${vlanId}`
    ];

    const logs = [];
    logs.push(`[FIBERHOME-ADAPTER] Connecting to ${this.device.ip_address}...`);
    logs.push(`[FIBERHOME-ADAPTER] Logged into Fiberhome AN5516`);
    cliCommands.forEach((cmd) => logs.push(`AN5516(config)# ${cmd}`));
    logs.push(`[FIBERHOME-ADAPTER] ONU ${serialNumber} provisioned on slot 1 pon ${ponPort}`);

    return {
      success: true,
      vendor: 'Fiberhome',
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
    const cleanUser = (pppoeUsername || '').replace(/[\r\n\t\s"'\\]/g, '');
    const cleanPass = (pppoePassword || '').replace(/[\r\n\t\s"'\\]/g, '');

    const cliCommands = [
      `set onu wan slot 1 pon ${ponPort} onu ${onuIndex} mode pppoe user ${cleanUser} pass ${cleanPass} vlan ${vlanId}`
    ];

    return {
      success: true,
      vendor: 'Fiberhome',
      serialNumber,
      pppoeUsername,
      cliExecuted: cliCommands.join('\n'),
      message: `PPPoE credentials assigned to Fiberhome ONU ${serialNumber}`
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
      `interface pon 1/1/${ponPort}`,
      `  no phy-auth-onu ${onuIndex}`,
      `  phy-auth-onu ${onuIndex} ${newSerialNumber}`,
      customerName ? `  onu-name ${onuIndex} "${customerName}"` : null,
      pppoeUsername ? `  onu-desc ${onuIndex} "$$$$${pppoeUsername}"` : null,
      `  service-port ${onuIndex} gem 1 vlan ${vlanId}`
    ].filter(Boolean);

    const logs = [
      `[FIBERHOME-ADAPTER] Connecting to ${this.device.ip_address}:${this.device.port}...`,
      `[FIBERHOME-ADAPTER] Un-authorizing ONU ${onuIndex} on PON 1/1/${ponPort} (Old SN: ${oldSerialNumber})`,
      `OLT(config-if-pon-1/1/${ponPort})# no phy-auth-onu ${onuIndex}`,
      `[FIBERHOME-ADAPTER] Authorizing New ONU ${onuIndex} (New SN: ${newSerialNumber})`,
      `OLT(config-if-pon-1/1/${ponPort})# phy-auth-onu ${onuIndex} ${newSerialNumber}`,
      `[FIBERHOME-ADAPTER] ONU hardware swap completed successfully: ${oldSerialNumber} ➔ ${newSerialNumber}`
    ];

    return {
      success: true,
      vendor: 'Fiberhome',
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
        serialNumber: 'FHTT88990011',
        ponPort: 3,
        vendor: 'Fiberhome',
        model: 'AN5506-02',
        discoveredAt: '10 mins ago',
        rxPower: -20.2,
        txPower: 1.9,
        opticalStatus: 'Optimal'
      }
    ];
  }

  async checkPreOpticalPower(params) {
    const { serialNumber = '', ponPort = 1 } = params;
    let rx = -20.2;
    if (serialNumber.includes('FAIL') || serialNumber.includes('CRIT')) {
      rx = -30.1;
    } else if (serialNumber.includes('WARN')) {
      rx = -26.1;
    } else if (serialNumber) {
      const hash = Math.abs(serialNumber.split('').reduce((acc, c) => acc + c.charCodeAt(0), 0));
      rx = -19.0 - (hash % 60) / 10;
      rx = Math.round(rx * 10) / 10;
    }

    const tx = 1.9;
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
      vendor: 'Fiberhome',
      rxPower: rx,
      txPower: tx,
      distanceMeters: 550,
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
      `reboot onu 1 ${ponPort} ${onuIndex}`
    ];

    const logs = [];
    logs.push(`[FIBERHOME-ADAPTER] Connecting to ${this.device.ip_address}...`);
    logs.push(`[FIBERHOME-ADAPTER] Logged into Fiberhome AN5516`);
    cliCommands.forEach((cmd) => logs.push(`AN5516(config)# ${cmd}`));
    logs.push(`[FIBERHOME-ADAPTER] Reboot signal dispatched for ONU ${serialNumber} on slot 1 pon ${ponPort}:${onuIndex}`);

    return {
      success: true,
      vendor: 'Fiberhome',
      serialNumber,
      ponPort,
      onuIndex,
      cliExecuted: cliCommands.join('\n'),
      logs,
      message: `Perintah reboot berhasil dikirim ke Fiberhome ONU ${serialNumber} (Slot 1 PON ${ponPort}:${onuIndex})`
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
      vendor: 'Fiberhome',
      rxPower: params.rxPower !== undefined && params.rxPower !== null ? params.rxPower : (isOnline ? -18.2 : (offlineReason === 'los' ? -35.0 : null)),
      txPower: isOnline ? 1.8 : null,
      temperature: isOnline ? '45°C' : 'N/A',
      voltage: isOnline ? '3.3V' : '0.0V',
      status: st,
      omciState: isOnline ? 'Working' : (offlineReason === 'dying-gasp' ? 'PowerOff (Dying-Gasp)' : 'FiberCut (LOS)'),
      distanceMeters: isOnline ? (params.distance || 550) : null,
      offlineReason: isOnline ? null : offlineReason,
      lastOfflineAt: isOnline ? null : (params.lastOfflineAt || new Date().toISOString()),
      offlineDetail: isOnline ? null : {
        cause: offlineReason === 'dying-gasp' ? 'PowerOff / Dying-Gasp' : 'FiberCut / Loss of Signal',
        alarmCode: offlineReason === 'dying-gasp' ? 'FH-ALM-PWR-01' : 'FH-ALM-FBR-02',
        recommendation: offlineReason === 'dying-gasp'
          ? 'Fiberhome OLT mendeteksi event PowerOff dari ONU. Catu daya pelanggan mati. Jangan kirim teknisi penarikan kabel.'
          : 'Event FiberCut terdeteksi pada port PON. Terindikasi putus kabel optik atau konektor kotor. Segera tugaskan teknisi.'
      }
    };
  }

  async modifyServiceProfile({ serialNumber, ponPort, onuIndex, oldProfile, newProfile, vlanId }) {
    const port = ponPort || 1;
    const index = onuIndex || 1;
    const devName = this.device.name || 'Fiberhome-OLT';
    const profileName = newProfile.name || 'profile_default';

    const cliCommands = [
      `${devName}(config)# interface pon 1/1/${port}`,
      `${devName}(config-if-pon)# onu ${index} profile ${profileName}`,
      `${devName}(config-if-pon)# exit`
    ];

    const logs = [
      `[FIBERHOME-ADAPTER] Connecting to ${this.device.ip_address}:${this.device.port || 22} via Telnet...`,
      `[FIBERHOME-ADAPTER] Authenticated as ${devName}`,
      ...cliCommands,
      `[FIBERHOME-ADAPTER] Profile successfully altered for ONU ${serialNumber} on Port 1/1/${port}:${index} to ${profileName}`
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
      message: `Paket layanan ONU Fiberhome ${serialNumber} berhasil diubah ke ${profileName} (Port 1/1/${port}:${index})`
    };
  }

  async getRegisteredONUs() {
    const devName = this.device.name || 'Fiberhome-OLT';
    const cliCommands = [
      `${devName}# show onu info`,
      `${devName}# show authorization 1/1/1`
    ];

    const registered = [
      {
        serial_number: 'FHTT00112233',
        pon_port_id: 1,
        onu_index: 1,
        onu_name: 'LAUNDRY_BERSIH',
        status: 'Online',
        rx_power: -18.2,
        distance_meters: 550,
        vlan_id: 100,
        profile_name: 'INTERNET-100M',
        vendor: 'Fiberhome',
        model: 'HG6245D'
      },
      {
        serial_number: 'FHTT00223344',
        pon_port_id: 1,
        onu_index: 2,
        onu_name: 'CAFE_KOPI_SENJA',
        status: 'Online',
        rx_power: -20.1,
        distance_meters: 480,
        vlan_id: 100,
        profile_name: 'INTERNET-100M',
        vendor: 'Fiberhome',
        model: 'AN5506-04-F'
      }
    ];

    return {
      success: true,
      vendor: 'Fiberhome',
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
      `configure terminal`,
      `interface gpon 1/1/${ponPort}`,
      `  onu wan-connection ${onuIndex} 1 mode route pppoe vlan ${vlanId} username ${pppoeUsername} password ${pppoePassword}`,
      `  onu tr069-server-config ${onuIndex} url ${acsUrl}`,
      `  onu remote-mgmt ${onuIndex} web enable`,
      rebootAfterPush ? `  onu reboot ${onuIndex}` : null,
      `exit`
    ].filter(Boolean);

    return {
      success: true,
      vendor: 'Fiberhome',
      serialNumber,
      ponPort,
      onuIndex,
      pppoeUsername,
      vlanId,
      wifiSsid: wifiSsid || null,
      rebootScheduled: Boolean(rebootAfterPush),
      cliExecuted: cliCommands.join('\n'),
      message: `Konfigurasi lengkap berhasil didorong ulang ke Fiberhome ONU ${serialNumber} (Port 1/1/${ponPort}:${onuIndex})`
    };
  }

  async detectLoopbackEvents() {
    const cliCommands = [
      `show loop-detection`
    ];

    return {
      success: true,
      vendor: 'Fiberhome',
      cliExecuted: cliCommands.join('\n'),
      incidents: []
    };
  }

  async setLanPortState(params) {
    const { ponPort, onuIndex = 1, lanPort = 1, state = 'shutdown' } = params;
    const isShutdown = state.toLowerCase() === 'shutdown' || state.toLowerCase() === 'down';

    const cliCommands = [
      `interface gpon 1/1/${ponPort}`,
      `  onu port ${onuIndex} eth ${lanPort} ${isShutdown ? 'shutdown' : 'no-shutdown'}`,
      `exit`
    ];

    return {
      success: true,
      vendor: 'Fiberhome',
      ponPort,
      onuIndex,
      lanPort,
      state: isShutdown ? 'shutdown' : 'up',
      cliExecuted: cliCommands.join('\n'),
      message: `Port LAN ${lanPort} pada Fiberhome ONU 1/1/${ponPort}:${onuIndex} berhasil di-set: ${isShutdown ? 'SHUTDOWN (Isolated)' : 'NO SHUTDOWN (Active)'}`
    };
  }
}

