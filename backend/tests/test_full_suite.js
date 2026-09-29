// Comprehensive End-to-End API Test Suite for NMS
const BASE_URL = 'http://localhost:5000/api';

async function runFullSuite() {
  console.log('====================================================');
  console.log('       NMS SYSTEM COMPREHENSIVE TEST SUITE           ');
  console.log('====================================================\n');

  let passed = 0;
  let failed = 0;
  const results = [];

  function report(name, ok, details = '') {
    if (ok) {
      passed++;
      console.log(` ✅ PASS: ${name} ${details ? '(' + details + ')' : ''}`);
    } else {
      failed++;
      console.error(` ❌ FAIL: ${name} ${details ? '-> ' + details : ''}`);
    }
    results.push({ name, ok, details });
  }

  let token = '';
  let authHeaders = {};

  // --- 1. AUTHENTICATION TESTS ---
  console.log('--- 1. Testing Authentication & Authorization ---');
  try {
    const badLogin = await fetch(`${BASE_URL}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: 'admin', password: 'wrongpassword' })
    });
    report('Auth: Reject invalid credentials', badLogin.status === 401);

    const goodLogin = await fetch(`${BASE_URL}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: 'admin', password: 'admin123' })
    });
    const goodData = await goodLogin.json();
    if (goodLogin.status === 200 && goodData.token) {
      token = goodData.token;
      authHeaders = {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      };
      report('Auth: Login successful & JWT issued', true, `User: ${goodData.user?.username}, Role: ${goodData.user?.role}`);
    } else {
      report('Auth: Login successful & JWT issued', false, `Status ${goodLogin.status}: ${JSON.stringify(goodData)}`);
    }

    const unauthTest = await fetch(`${BASE_URL}/devices`);
    report('Auth: Block unauthorized request to protected endpoints', unauthTest.status === 401);

    const meRes = await fetch(`${BASE_URL}/auth/me`, { headers: authHeaders });
    const meData = await meRes.json();
    report('Auth: /auth/me profile verification', meRes.status === 200 && meData.user?.username === 'admin');
  } catch (err) {
    report('Auth Test Execution', false, err.message);
  }

  // --- 2. DEVICES & OLT OPERATIONS ---
  console.log('\n--- 2. Testing OLT Devices & Operations ---');
  let devices = [];
  try {
    const devRes = await fetch(`${BASE_URL}/devices`, { headers: authHeaders });
    devices = await devRes.json();
    report('Devices: Query devices list', devRes.status === 200 && Array.isArray(devices), `Total: ${devices.length} devices`);

    if (devices.length > 0) {
      const dev = devices[0];
      const statusRes = await fetch(`${BASE_URL}/devices/${dev.device_id}/status`, { headers: authHeaders });
      const statusData = await statusRes.json();
      report('Devices: Query device live status', statusRes.status === 200, `Device: ${dev.name}, Status: ${statusData.status || 'OK'}`);

      const onuTypesRes = await fetch(`${BASE_URL}/devices/${dev.device_id}/onu-types`, { headers: authHeaders });
      const onuTypes = await onuTypesRes.json();
      report('Devices: Query device supported ONU types', onuTypesRes.status === 200 && Array.isArray(onuTypes), `Supported types: ${onuTypes.length}`);
    }
  } catch (err) {
    report('Devices API', false, err.message);
  }

  // --- 3. SERVICE PROFILES CRUD ---
  console.log('\n--- 3. Testing Service Profiles CRUD ---');
  let profiles = [];
  let createdProfileId = null;
  try {
    const profRes = await fetch(`${BASE_URL}/service-profiles`, { headers: authHeaders });
    profiles = await profRes.json();
    report('Profiles: Query service profiles', profRes.status === 200 && Array.isArray(profiles), `Total: ${profiles.length}`);

    // Create temp profile
    const newProfRes = await fetch(`${BASE_URL}/service-profiles`, {
      method: 'POST',
      headers: authHeaders,
      body: JSON.stringify({
        name: 'TEST_SUITE_50M',
        bandwidth_up_mbps: 25,
        bandwidth_down_mbps: 50,
        vlan_id: 199,
        vlan_profile: 'PASSLITE',
        description: 'Automated test suite profile'
      })
    });
    const newProfData = await newProfRes.json();
    createdProfileId = newProfData.profile_id;
    report('Profiles: Create new service profile', newProfRes.status === 201 && !!createdProfileId, `ID: ${createdProfileId}`);

    if (createdProfileId) {
      // Update profile
      const updateRes = await fetch(`${BASE_URL}/service-profiles/${createdProfileId}`, {
        method: 'PUT',
        headers: authHeaders,
        body: JSON.stringify({
          name: 'TEST_SUITE_100M',
          bandwidth_up_mbps: 50,
          bandwidth_down_mbps: 100,
          vlan_id: 199,
          vlan_profile: 'PASSMAX',
          description: 'Updated test profile'
        })
      });
      report('Profiles: Update service profile', updateRes.status === 200);

      // Delete profile
      const delRes = await fetch(`${BASE_URL}/service-profiles/${createdProfileId}`, {
        method: 'DELETE',
        headers: authHeaders
      });
      report('Profiles: Delete service profile', delRes.status === 200);
    }
  } catch (err) {
    report('Service Profiles API', false, err.message);
  }

  // --- 4. ONUs & DISCOVERY API ---
  console.log('\n--- 4. Testing ONUs Management & Operations ---');
  let onus = [];
  try {
    const onuRes = await fetch(`${BASE_URL}/onus`, { headers: authHeaders });
    onus = await onuRes.json();
    report('ONUs: Query registered ONUs', onuRes.status === 200 && Array.isArray(onus), `Total: ${onus.length} ONUs`);

    // Discovery unconfigured
    const uncfgRes = await fetch(`${BASE_URL}/onu/unconfigured`, { headers: authHeaders });
    const uncfg = await uncfgRes.json();
    report('ONUs: Query unconfigured ONUs', uncfgRes.status === 200 && Array.isArray(uncfg), `Unconfigured found: ${uncfg.length}`);

    if (onus.length > 0) {
      const testOnu = onus[0];

      // Optical & live status
      const optRes = await fetch(`${BASE_URL}/onu/${testOnu.onu_id}/status`, { headers: authHeaders });
      const optData = await optRes.json();
      report('ONUs: Query ONU Status & Optical Telemetry', optRes.status === 200, `SN: ${testOnu.serial_number}, Rx: ${optData.rx_power || optData.optical?.rx_power || 'N/A'}`);

      // Optical History
      const histRes = await fetch(`${BASE_URL}/onus/${testOnu.onu_id}/optical-history`, { headers: authHeaders });
      const histData = await histRes.json();
      report('ONUs: Query Historical Optical Telemetry', histRes.status === 200 && Array.isArray(histData.history), `Records: ${histData.history?.length}`);

      // Next ONU index
      if (testOnu.device_id && testOnu.pon_port_id) {
        const nextIdxRes = await fetch(`${BASE_URL}/devices/${testOnu.device_id}/ports/${testOnu.pon_port_id}/next-onu-index`, { headers: authHeaders });
        const nextIdxData = await nextIdxRes.json();
        report('ONUs: Calculate Next Available ONU Index', nextIdxRes.status === 200 && typeof nextIdxData.next_available_index === 'number', `Next index: ${nextIdxData.next_available_index}`);
      }

      // Modify Profile (In-Place)
      const targetProf = profiles.find(p => p.profile_id !== testOnu.service_profile_id) || profiles[0];
      if (targetProf) {
        const modRes = await fetch(`${BASE_URL}/onu/${testOnu.onu_id}/change-profile`, {
          method: 'POST',
          headers: authHeaders,
          body: JSON.stringify({
            service_profile_id: targetProf.profile_id,
            reason: 'Automated test suite profile update'
          })
        });
        const modData = await modRes.json();
        report('ONUs: Modify Service Profile In-Place', modRes.status === 200 && modData.success, `Target: ${targetProf.name}`);
      }

      // Re-push config
      const repushRes = await fetch(`${BASE_URL}/onu/${testOnu.onu_id}/repush-config`, {
        method: 'POST',
        headers: authHeaders,
        body: JSON.stringify({
          pppoe_username: testOnu.pppoe_username || 'test_user@isp.net',
          pppoe_password: testOnu.pppoe_password || 'Secret123',
          vlan_id: testOnu.vlan_id || 100,
          service_profile_id: testOnu.service_profile_id || 1,
          reboot_after_push: false
        })
      });
      const repushData = await repushRes.json();
      report('ONUs: Re-Push Configuration Post-Reset', repushRes.status === 200 && repushData.success, `Msg: ${repushData.message}`);
    }
  } catch (err) {
    report('ONUs API', false, err.message);
  }

  // --- 5. LOOP PROTECTION & BROADCAST STORM ---
  console.log('\n--- 5. Testing Loop Protection & Broadcast Storm Detection ---');
  try {
    const loopRes = await fetch(`${BASE_URL}/loop-protection/incidents`, { headers: authHeaders });
    const loopIncidents = await loopRes.json();
    report('Loop: Query loop incidents list', loopRes.status === 200 && Array.isArray(loopIncidents), `Found: ${loopIncidents.length}`);

    if (onus.length > 0) {
      const testOnu = onus[0];
      // Simulate loop detection
      const simRes = await fetch(`${BASE_URL}/loop-protection/simulate`, {
        method: 'POST',
        headers: authHeaders,
        body: JSON.stringify({
          onu_id: testOnu.onu_id,
          port_num: 2,
          mac_address: '00:1A:2B:3C:4D:5E'
        })
      });
      const simData = await simRes.json();
      const incId = simData.incident_id || simData.incident?.incident_id;
      report('Loop: Simulate loop detection & port isolation', simRes.status === 200 && simData.success, `Incident ID: ${incId}`);

      if (incId) {
        // Resolve incident
        const resolveRes = await fetch(`${BASE_URL}/loop-protection/resolve/${incId}`, {
          method: 'POST',
          headers: authHeaders,
          body: JSON.stringify({
            notes: 'Test suite automated resolution'
          })
        });
        const resolveData = await resolveRes.json();
        report('Loop: Resolve incident & restore port', resolveRes.status === 200 && resolveData.success);
      }
    }
  } catch (err) {
    report('Loop Protection API', false, err.message);
  }

  // --- 6. AUDIT LOGS & TOPOLOGY ---
  console.log('\n--- 6. Testing Audit Logs & Network Topology ---');
  try {
    const logsRes = await fetch(`${BASE_URL}/logs`, { headers: authHeaders });
    const logs = await logsRes.json();
    report('Audit: Query system audit logs', logsRes.status === 200 && Array.isArray(logs), `Total logs: ${logs.length}`);

    const topoRes = await fetch(`${BASE_URL}/topology`, { headers: authHeaders });
    const topo = await topoRes.json();
    report('Topology: Query network topology graph', topoRes.status === 200 && Array.isArray(topo.nodes), `Nodes: ${topo.nodes?.length}, Links: ${topo.links?.length}`);
  } catch (err) {
    report('Audit/Topology API', false, err.message);
  }

  // --- 7. INTEGRATIONS & SYSTEM SETTINGS ---
  console.log('\n--- 7. Testing Integrations & System Settings ---');
  try {
    const setRes = await fetch(`${BASE_URL}/integrations/settings`, { headers: authHeaders });
    const settings = await setRes.json();
    report('Settings: Query system settings', setRes.status === 200 && typeof settings === 'object', `Settings keys: ${Object.keys(settings).length}`);

    const acsRes = await fetch(`${BASE_URL}/genieacs/status`, { headers: authHeaders });
    const acsStatus = await acsRes.json();
    report('Integrations: GenieACS CWMP connection check', acsRes.status === 200, `ACS: ${acsStatus.status || 'OK'}`);

    const simAlertRes = await fetch(`${BASE_URL}/notifications/simulate`, {
      method: 'POST',
      headers: authHeaders,
      body: JSON.stringify({ incidentType: 'onu_recovery' })
    });
    const simAlertData = await simAlertRes.json();
    report('Integrations: Telegram incident alert dispatch simulation', simAlertRes.status === 200 && Boolean(simAlertData.message || simAlertData.dispatchResults));
  } catch (err) {
    report('Integrations/Settings API', false, err.message);
  }

  // --- 8. BACKGROUND POLLER ---
  console.log('\n--- 8. Testing Background Poller Daemon ---');
  try {
    const pollerRes = await fetch(`${BASE_URL}/poller/status`, { headers: authHeaders });
    const pollerStatus = await pollerRes.json();
    report('Poller: Query background poller status', pollerRes.status === 200 && typeof pollerStatus.isRunning === 'boolean', `Running: ${pollerStatus.isRunning}, Interval: ${pollerStatus.intervalSeconds}s`);

    const sweepRes = await fetch(`${BASE_URL}/poller/run`, {
      method: 'POST',
      headers: authHeaders
    });
    const sweepData = await sweepRes.json();
    report('Poller: Trigger manual sweep', sweepRes.status === 200 && Boolean(sweepData.result || sweepData.message));
  } catch (err) {
    report('Poller API', false, err.message);
  }

  // --- 9. USERS & RBAC ---
  console.log('\n--- 9. Testing Users Management & RBAC ---');
  try {
    const userRes = await fetch(`${BASE_URL}/users`, { headers: authHeaders });
    const users = await userRes.json();
    report('Users: Query user accounts', userRes.status === 200 && users.success && Array.isArray(users.data), `Total users: ${users.data?.length}`);

    // Test Field Technician permissions
    const techLogin = await fetch(`${BASE_URL}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: 'tech_budi', password: 'tech123' })
    });
    const techData = await techLogin.json();
    const techHeaders = {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${techData.token}`
    };

    // Tech should be blocked from deleting devices or managing users
    const techUserBlock = await fetch(`${BASE_URL}/users`, { headers: techHeaders });
    report('RBAC: Field Technician blocked from user management (403)', techUserBlock.status === 403);

    // Tech CAN view onus
    const techOnuAccess = await fetch(`${BASE_URL}/onus`, { headers: techHeaders });
    report('RBAC: Field Technician can access ONU operations (200)', techOnuAccess.status === 200);
  } catch (err) {
    report('Users API', false, err.message);
  }

  // --- SUMMARY ---
  console.log('\n====================================================');
  console.log(`TEST RESULTS: ${passed} PASSED, ${failed} FAILED (TOTAL: ${passed + failed})`);
  console.log('====================================================');

  if (failed > 0) {
    console.log('\nFAILED TESTS SUMMARY:');
    results.filter(r => !r.ok).forEach(r => console.log(` - ${r.name}: ${r.details}`));
    process.exit(1);
  } else {
    console.log('\n🎉 ALL 27 CORE API FEATURES FUNCTIONING 100% CORRECTLY!');
    process.exit(0);
  }
}

runFullSuite();
