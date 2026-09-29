import ssh2 from 'ssh2';

const { Client } = ssh2;

/**
 * Parse device credentials object/JSON string safely
 */
export function parseCredentials(creds) {
  if (!creds) return { user: 'admin', pass: '' };
  if (typeof creds === 'object') return { user: creds.user || creds.username || 'admin', pass: creds.pass || creds.password || '' };
  try {
    const parsed = JSON.parse(creds);
    return { user: parsed.user || parsed.username || 'admin', pass: parsed.pass || parsed.password || '' };
  } catch {
    return { user: 'admin', pass: String(creds) };
  }
}

/**
 * Execute a series of commands on an OLT via interactive SSH Shell session
 */
export async function executeSSHCommands(device, commands = [], timeoutMs = 8000) {
  const creds = parseCredentials(device.credentials);
  const host = device.ip_address;
  const port = parseInt(device.port, 10) || 22;

  return new Promise((resolve, reject) => {
    const conn = new Client();
    let isDone = false;
    let timer = null;

    const cleanup = () => {
      if (timer) clearTimeout(timer);
      try { conn.end(); } catch {}
    };

    timer = setTimeout(() => {
      if (!isDone) {
        isDone = true;
        cleanup();
        reject(new Error(`Koneksi SSH ke OLT ${host}:${port} timeout setelah ${timeoutMs}ms`));
      }
    }, timeoutMs);

    conn.on('ready', () => {
      conn.shell({ term: 'vt100', rows: 80, cols: 160 }, (err, stream) => {
        if (err) {
          if (!isDone) {
            isDone = true;
            cleanup();
            reject(err);
          }
          return;
        }

        let output = '';

        stream.on('data', (data) => {
          const str = data.toString('utf8');
          output += str;

          // Safely confirm logout only if OLT explicitly prompts on exit
          if (str.toLowerCase().includes('confirm to logout')) {
            try { stream.write('yes\n'); } catch {}
          }
        });

        stream.on('close', () => {
          if (!isDone) {
            isDone = true;
            cleanup();
            resolve({ output, success: true });
          }
        });

        // Send initialization commands
        stream.write('terminal length 0\n');

        // Send commands with adaptive pacing so OLT terminal does not drop buffer
        const cmdList = Array.isArray(commands) ? commands : [commands];
        let cmdIdx = 0;

        const sendNext = () => {
          if (isDone) return;
          if (cmdIdx < cmdList.length) {
            const cmd = cmdList[cmdIdx];
            cmdIdx++;
            stream.write(`${cmd}\n`);

            let delay = 220;
            const trimmedCmd = cmd.trim();
            if (trimmedCmd === 'write' || trimmedCmd === 'save') {
              delay = 2500;
            } else if (trimmedCmd.startsWith('reboot') || trimmedCmd.startsWith('restore factory')) {
              delay = 600;
            }
            setTimeout(sendNext, delay);
          } else {
            setTimeout(() => {
              // Disconnect session cleanly without sending unsolicited yes
              stream.write('exit\n');
              setTimeout(() => {
                if (!isDone) {
                  isDone = true;
                  cleanup();
                  resolve({ output, success: true });
                }
              }, 1000);
            }, 500);
          }
        };

        sendNext();
      });
    });

    conn.on('error', (err) => {
      if (!isDone) {
        isDone = true;
        cleanup();
        reject(err);
      }
    });

    try {
      conn.connect({
        host,
        port,
        username: creds.user,
        password: creds.pass,
        algorithms: {
          kex: [
            'diffie-hellman-group1-sha1',
            'diffie-hellman-group14-sha1',
            'diffie-hellman-group-exchange-sha1',
            'ecdh-sha2-nistp256'
          ],
          cipher: [
            'aes128-ctr', 'aes192-ctr', 'aes256-ctr',
            'aes128-cbc', '3des-cbc', 'aes256-cbc'
          ],
          serverHostKey: ['ssh-rsa', 'ssh-dss', 'ecdsa-sha2-nistp256']
        },
        readyTimeout: timeoutMs
      });
    } catch (e) {
      if (!isDone) {
        isDone = true;
        cleanup();
        reject(e);
      }
    }
  });
}

/**
 * Fetch registered ONUs directly from physical ZTE C300/C320/C600 hardware
 */
export async function fetchZTERegisteredONUs(device) {
  // Step 1: Read ONU state table
  const stateRes = await executeSSHCommands(device, ['show gpon onu state'], 7000);
  const rawState = stateRes.output || '';

  const registered = [];
  const lines = rawState.split('\n');

  // Match: 1/2/1:1     enable       disable     OffLine      1(GPON)
  // Or:    1/1/1:2     enable       enable      working      1(GPON)
  const regex = /(\d+\/\d+\/\d+):(\d+)\s+(\S+)\s+(\S+)\s+(\S+)/g;
  let m;

  const foundOnuRefs = [];
  while ((m = regex.exec(rawState)) !== null) {
    const fullIface = m[1]; // e.g. '1/2/1'
    const onuIndex = parseInt(m[2], 10); // e.g. 1
    const adminState = m[3];
    const omccState = m[4];
    const phaseState = m[5];

    // Format ZTE: shelf/slot/port, e.g. 1/2/1
    const ifaceParts = fullIface.split('/');
    const cardSlot = ifaceParts.length >= 2 ? parseInt(ifaceParts[1], 10) : 1;
    const portNum = parseInt(ifaceParts[ifaceParts.length - 1], 10) || 1;

    foundOnuRefs.push({
      fullIface,
      cardSlot,
      portNum,
      onuIndex,
      adminState,
      omccState,
      phaseState
    });
  }

  // If no ONUs found, return empty array immediately (NO FAKE DATA)
  if (foundOnuRefs.length === 0) {
    return {
      success: true,
      vendor: 'ZTE',
      cliExecuted: stateRes.output,
      totalFound: 0,
      onus: []
    };
  }

  // Step 2: Query details, optical power, and running configurations for each found ONU (READ-ONLY)
  const detailCommands = [];
  const uniquePonPorts = [...new Set(foundOnuRefs.map(o => o.fullIface))];
  for (const pon of uniquePonPorts) {
    detailCommands.push(`show pon power onu-rx gpon-olt_${pon}`);
  }
  for (const o of foundOnuRefs) {
    const onuIface = `gpon-onu_${o.fullIface}:${o.onuIndex}`;
    detailCommands.push(`show gpon onu detail-info ${onuIface}`);
    detailCommands.push(`show running-config interface ${onuIface}`);
    detailCommands.push(`show onu run config ${onuIface}`);
  }

  const detailRes = await executeSSHCommands(device, detailCommands, 10000 + foundOnuRefs.length * 1500);
  const detailOutput = detailRes.output || '';

  // Parse real Rx power map from 'show pon power onu-rx gpon-olt_...'
  const rxPowerMap = {};
  const rxLines = detailOutput.split('\n');
  for (const rline of rxLines) {
    const rxM = rline.match(/gpon-onu_(\d+\/\d+\/\d+:\d+)\s+([\d\.\-]+)\(dbm\)/i);
    if (rxM) {
      rxPowerMap[rxM[1]] = parseFloat(rxM[2]);
    } else {
      const naMatch = rline.match(/gpon-onu_(\d+\/\d+\/\d+:\d+)\s+N\/A/i);
      if (naMatch) {
        rxPowerMap[naMatch[1]] = null;
      }
    }
  }

  for (const ref of foundOnuRefs) {
    const blockKey = `gpon-onu_${ref.fullIface}:${ref.onuIndex}`;
    const detailSectionMatch = detailOutput.match(new RegExp(`ONU interface:\\s*${blockKey}[\\s\\S]*?(?:------------------------------------------|zte#|$)`));
    const detailSection = detailSectionMatch ? detailSectionMatch[0] : '';
    const snMatch = detailSection.match(/Serial number:\s*([A-Za-z0-9]+)/);
    const nameMatch = detailSection.match(/Name:\s*([^\r\n]+)/);
    const typeMatch = detailSection.match(/Type:\s*([^\r\n]+)/);
    const distMatch = detailSection.match(/ONU Distance:\s*(\d+)\s*m/i);

    const serialNumber = snMatch ? snMatch[1].trim() : `ZTE_${ref.fullIface.replace(/\//g, '')}_${ref.onuIndex}`;
    const rawName = nameMatch ? nameMatch[1].trim() : '';
    const onuName = rawName && rawName !== 'N/A' && rawName !== '' ? rawName : `ONU-${ref.cardSlot}/${ref.portNum}:${ref.onuIndex}`;
    const rawModel = typeMatch ? typeMatch[1].trim() : '';
    const model = rawModel && rawModel !== 'N/A' && rawModel !== '' ? rawModel : 'ZTE-ONU';
    const isOnline = ref.phaseState?.toLowerCase() === 'working';
    const realDistance = distMatch ? parseInt(distMatch[1], 10) : (isOnline ? 1 : null);

    const fullRefKey = `${ref.fullIface}:${ref.onuIndex}`;
    const realRxPower = rxPowerMap[fullRefKey] !== undefined ? rxPowerMap[fullRefKey] : null;

    // Parse interface running-config block
    const ifaceBlockMatch = detailOutput.match(new RegExp(`interface ${blockKey}[\\s\\S]*?(?:!|end)`));
    const ifaceBlock = ifaceBlockMatch ? ifaceBlockMatch[0] : '';

    // Parse pon-onu-mng config block
    const mngBlockMatch = detailOutput.match(new RegExp(`pon-onu-mng ${blockKey}[\\s\\S]*?(?:!|end)`));
    const mngBlock = mngBlockMatch ? mngBlockMatch[0] : '';

    // Extract VLAN from service-port or service gemport
    let vlanId = null;
    const vlanMatch = (ifaceBlock + '\n' + mngBlock).match(/(?:service-port\s+\d+\s+vport\s+\d+(?:\s+user-vlan\s+\d+)?\s+vlan\s+(\d+)|service\s+\S+\s+gemport\s+\d+\s+vlan\s+(\d+))/i);
    if (vlanMatch) {
      vlanId = parseInt(vlanMatch[1] || vlanMatch[2], 10);
    }

    // Extract profile name from tcont or vlan-profile
    let profileName = null;
    const tcontMatches = [...ifaceBlock.matchAll(/tcont\s+\d+\s+name\s+\S+\s+profile\s+(\S+)/gi)];
    for (const tm of tcontMatches) {
      if (tm[1] && tm[1].toLowerCase() !== 'default') {
        profileName = tm[1];
        break;
      }
    }
    if (!profileName) {
      const vlanProfMatch = mngBlock.match(/vlan-profile\s+(\S+)/i);
      if (vlanProfMatch) {
        profileName = vlanProfMatch[1];
      }
    }

    // Extract PPPoE credentials if configured on OLT
    let pppoeUsername = null;
    let pppoePassword = null;
    const pppoeMatch = mngBlock.match(/wan-ip\s+\d+\s+mode\s+pppoe\s+username\s+(\S+)(?:\s+password\s+(\S+))?/i);
    if (pppoeMatch) {
      pppoeUsername = pppoeMatch[1];
      pppoePassword = pppoeMatch[2] || null;
    }

    let offlineReason = null;
    if (!isOnline) {
      offlineReason = ref.phaseState?.toLowerCase().includes('dying') ? 'dying-gasp' : 'los';
    }

    registered.push({
      serial_number: serialNumber,
      card_slot: ref.cardSlot,
      pon_port_id: ref.portNum,
      onu_index: ref.onuIndex,
      interface: `1/${ref.cardSlot}/${ref.portNum}:${ref.onuIndex}`,
      onu_name: onuName,
      status: isOnline ? 'Online' : 'Offline',
      rx_power: realRxPower,
      distance_meters: realDistance,
      vlan_id: vlanId,
      profile_name: profileName,
      pppoe_username: pppoeUsername,
      pppoe_password: pppoePassword,
      vendor: 'ZTE',
      model,
      last_offline_reason: offlineReason
    });
  }

  return {
    success: true,
    vendor: 'ZTE',
    cliExecuted: [stateRes.output, detailRes.output].join('\n---\n'),
    totalFound: registered.length,
    onus: registered
  };
}

/**
 * Parse raw CLI output of ZTE 'show gpon onu uncfg'
 */
export function parseZTEUnconfiguredOutput(raw = '') {
  if (!raw || raw.includes('No related information')) {
    return [];
  }

  const unconfigured = [];
  // Match lines like:
  // gpon-onu_1/2/1:1       ZTEGC9988776        unknown
  // gpon-olt_1/2/1:1       ZTEGC9988776        unconfigured
  // 1/2/1:1                ZTEGC9988776        initial
  const lines = raw.split(/\r?\n/);
  const regex = /(?:gpon-(?:onu|olt)_)?(\d+\/\d+\/\d+):(\d+)\s+([A-Za-z0-9]{4,32})(?:\s+(\S+))?/;

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('OnuIndex') || trimmed.startsWith('---') || trimmed.startsWith('zte#') || trimmed.startsWith('%')) {
      continue;
    }
    const m = trimmed.match(regex);
    if (m) {
      const iface = m[1]; // e.g. "1/2/1"
      const onuIndex = parseInt(m[2], 10);
      const sn = m[3];
      const state = m[4] || 'unknown';
      const parts = iface.split('/');
      const cardSlot = parts.length >= 2 ? parseInt(parts[1], 10) : 1;
      const port = parseInt(parts[parts.length - 1], 10) || 1;

      unconfigured.push({
        serial_number: sn,
        card_slot: cardSlot,
        pon_port_id: port,
        onu_index: onuIndex,
        interface: `gpon-onu_${iface}:${onuIndex}`,
        vendor: sn.startsWith('ZTE') ? 'ZTE' : (sn.startsWith('HWTC') ? 'Huawei' : (sn.startsWith('FHTT') ? 'Fiberhome' : 'Auto')),
        status: state
      });
    }
  }

  return unconfigured;
}

/**
 * Fetch unconfigured ONUs from ZTE hardware (show gpon onu uncfg)
 */
export async function fetchZTEUnconfiguredONUs(device) {
  const uncfgRes = await executeSSHCommands(device, ['show gpon onu uncfg'], 6000);
  const raw = uncfgRes.output || '';
  const unconfigured = parseZTEUnconfiguredOutput(raw);

  return {
    success: true,
    cliExecuted: raw,
    unconfigured
  };
}

/**
 * Detect physical cards / boards installed on the OLT via SSH CLI
 */
export async function detectOLTCards(device) {
  const vendor = (device.vendor || 'ZTE').toUpperCase();

  if (vendor.includes('ZTE')) {
    const res = await executeSSHCommands(device, ['show card'], 7000);
    const raw = res.output || '';
    const cards = [];

    // ZTE format:
    // Rack Shelf Slot CfgType RealType Port  HardVer SoftVer         Status
    // -------------------------------------------------------------------------------
    // 1    1     1    GTGH             16                            OFFLINE
    // 1    1     2    GTGH             16                            HWONLINE
    // 1    1     3    PRAM    PRAM     3     V1.0.0  V1.01           INSERVICE
    // 1    1     4    SMXA    SMXA     3     V1.0.0  V2.1.0          INSERVICE
    const lines = raw.split('\n');
    let headerLine = '';
    let headerIndex = -1;

    for (let i = 0; i < lines.length; i++) {
      if (lines[i].includes('Rack') && lines[i].includes('Slot') && lines[i].includes('CfgType')) {
        headerLine = lines[i];
        headerIndex = i;
        break;
      }
    }

    if (headerIndex !== -1 && headerLine) {
      const rSlot = headerLine.indexOf('Slot');
      const rCfg = headerLine.indexOf('CfgType');
      const rReal = headerLine.indexOf('RealType');
      const rPort = headerLine.indexOf('Port');
      const rHard = headerLine.indexOf('HardVer');
      const rStatus = headerLine.indexOf('Status');

      for (let i = headerIndex + 1; i < lines.length; i++) {
        const line = lines[i];
        if (!line.trim() || line.includes('---') || line.includes('show card') || line.includes('zte#')) continue;

        const slotStr = rSlot !== -1 && rCfg !== -1 ? line.substring(rSlot, rCfg).trim() : '';
        const slot = parseInt(slotStr, 10);
        if (isNaN(slot)) continue;

        const cfgType = rCfg !== -1 && rReal !== -1 ? line.substring(rCfg, rReal).trim() : '';
        const realType = rReal !== -1 && rPort !== -1 ? line.substring(rReal, rPort).trim() : '';

        let portStr = '';
        if (rPort !== -1) {
          const nextIdx = rHard !== -1 ? rHard : (rStatus !== -1 ? rStatus : line.length);
          portStr = line.substring(rPort, nextIdx).trim().split(/\s+/)[0];
        }
        let ports = parseInt(portStr, 10);
        if (isNaN(ports) || ports <= 0) ports = 16;

        let rawStatus = rStatus !== -1 ? line.substring(rStatus).trim().split(/\s+/)[0] : '';
        if (!rawStatus) {
          const tokens = line.trim().split(/\s+/);
          rawStatus = tokens[tokens.length - 1];
        }

        const isPonCard = /^(GTG|GTO|GFG|ETG|ETO|GP)/i.test(cfgType) || /GTGH|GTGO|GTGHG|GFGM/i.test(cfgType);
        const effectivePorts = isPonCard ? (ports || 16) : 0;

        cards.push({
          slot,
          type: cfgType || realType || 'GTGH',
          cfg_type: cfgType,
          real_type: realType || null,
          ports: effectivePorts,
          raw_ports: ports,
          status: rawStatus ? rawStatus.toUpperCase() : 'OFFLINE',
          is_pon: isPonCard
        });
      }
    } else {
      // Fallback token parsing if header was missed
      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith('Rack') || trimmed.startsWith('--') || trimmed.includes('#')) continue;

        const tokens = trimmed.split(/\s+/);
        if (tokens.length >= 4) {
          const slot = parseInt(tokens[2], 10);
          if (isNaN(slot)) continue;

          const cfgType = tokens[3] || '';
          const isPonCard = /^(GTG|GTO|GFG|ETG|ETO|GP)/i.test(cfgType) || /GTGH|GTGO|GTGHG|GFGM/i.test(cfgType);
          const rawStatus = tokens[tokens.length - 1] || 'OFFLINE';

          let ports = 16;
          for (let i = 4; i < tokens.length - 1; i++) {
            const num = parseInt(tokens[i], 10);
            if (num === 8 || num === 16 || num === 32 || num === 4) {
              ports = num;
              break;
            }
          }

          const realType = tokens.length > 5 && tokens[4] !== String(ports) ? tokens[4] : '';

          cards.push({
            slot,
            type: cfgType || realType || 'GTGH',
            cfg_type: cfgType,
            real_type: realType || null,
            ports: isPonCard ? ports : 0,
            raw_ports: ports,
            status: rawStatus.toUpperCase(),
            is_pon: isPonCard
          });
        }
      }
    }

    return {
      success: true,
      vendor: 'ZTE',
      cliExecuted: raw,
      cards
    };
  } else if (vendor.includes('HUAWEI')) {
    const res = await executeSSHCommands(device, ['display board 0'], 7000);
    const raw = res.output || '';
    const cards = [];

    // Parse Huawei display board 0
    const lines = raw.split('\n');
    for (const line of lines) {
      const trimmed = line.trim();
      const match = trimmed.match(/^(\d+)\s+([A-Za-z0-9]+)\s+([A-Za-z0-9]+)/);
      if (match) {
        const slot = parseInt(match[1], 10);
        const boardName = match[2];
        const status = /Active|Normal/i.test(trimmed) ? 'INSERVICE' : 'OFFLINE';
        const isPon = /GPFD|GPBD|GPHF|EPFD/i.test(boardName);
        cards.push({
          slot,
          type: boardName,
          ports: isPon ? 16 : 0,
          status,
          is_pon: isPon
        });
      }
    }

    return {
      success: true,
      vendor: 'Huawei',
      cliExecuted: raw,
      cards
    };
  }

  // Fallback default
  return {
    success: true,
    vendor,
    cards: [
      { slot: 1, type: 'GPON', ports: device.pon_ports_count || 8, status: 'INSERVICE' }
    ]
  };
}

/**
 * Fetch supported ONU Types from ZTE OLT hardware (show onu-type gpon)
 */
export async function fetchZTEONUTypes(device) {
  try {
    const res = await executeSSHCommands(device, ['show onu-type gpon'], 8000);
    const raw = res.output || '';
    const types = [];
    const seen = new Set();
    const blocks = raw.split(/ONU type name:\s+/i);

    for (let i = 1; i < blocks.length; i++) {
      const block = blocks[i];
      const lines = block.split(/\r?\n/);
      const name = lines[0]?.trim();
      if (!name || seen.has(name.toUpperCase())) continue;
      seen.add(name.toUpperCase());

      let desc = '';
      const descLine = lines.find((l) => /^Description:\s*/i.test(l.trim()));
      if (descLine) {
        desc = descLine.replace(/^Description:\s*/i, '').trim();
      }

      types.push({
        name,
        description: desc || ''
      });
    }

    if (types.length > 0) {
      return types;
    }
  } catch (err) {
    console.warn(`[fetchZTEONUTypes] Error reading onu-types from ${device.name}:`, err.message);
  }

  // Fallback defaults for ZTE
  return [
    { name: 'VSOL2L', description: '2LAN_WIFI' },
    { name: 'ALL', description: 'Universal 4ETH+4WiFi' },
    { name: 'ZTE', description: 'ZTE Standard' },
    { name: 'ZTE-F601', description: '1ETH' },
    { name: 'ZTE-F660', description: '4ETH, 2POTS, 1WiFi' }
  ];
}


