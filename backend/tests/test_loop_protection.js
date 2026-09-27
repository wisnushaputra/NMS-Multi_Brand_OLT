// Test Script: Deteksi Loopback & Perlindungan Broadcast Storm (Loop Protection & MAC Flapping Alert)

const BASE_URL = 'http://localhost:5000/api';

async function runTest() {
  console.log('=== TEST: Loopback Detection & Broadcast Storm Protection ===\n');

  // 1. Login
  console.log('1. Logging in as admin...');
  const loginRes = await fetch(`${BASE_URL}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: 'admin', password: 'admin123' })
  });
  const loginData = await loginRes.json();
  if (!loginRes.ok) throw new Error('Login failed: ' + JSON.stringify(loginData));
  const token = loginData.token;
  console.log('   ✓ Login success as:', loginData.user.username);

  const authHeaders = {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${token}`
  };

  // 1b. Clean up previous test incidents to make test idempotent
  const prevIncRes = await fetch(`${BASE_URL}/loop-protection/incidents?status=active`, { headers: authHeaders });
  const prevIncidents = await prevIncRes.json();
  if (Array.isArray(prevIncidents)) {
    for (const inc of prevIncidents) {
      await fetch(`${BASE_URL}/loop-protection/resolve/${inc.incident_id}`, {
        method: 'POST',
        headers: authHeaders
      });
    }
  }

  // 2. Fetch target ONU
  console.log('\n2. Fetching ONUs list...');
  const onusRes = await fetch(`${BASE_URL}/onus`, { headers: authHeaders });
  const onus = await onusRes.json();
  if (!Array.isArray(onus) || onus.length === 0) {
    throw new Error('No ONUs found in database for testing');
  }

  const testOnu = onus[0];
  console.log(`   ✓ Selected test ONU: ID ${testOnu.onu_id}, SN: ${testOnu.serial_number}, OLT: ${testOnu.device_name} (${testOnu.device_vendor})`);

  // 3. Simulate Loopback Event & Auto-Isolation
  console.log('\n3. Simulating Loopback / Broadcast Storm (POST /api/loop-protection/simulate)...');
  const simPayload = {
    onu_id: testOnu.onu_id,
    lan_port: 1,
    auto_isolate: true
  };

  const simRes = await fetch(`${BASE_URL}/loop-protection/simulate`, {
    method: 'POST',
    headers: authHeaders,
    body: JSON.stringify(simPayload)
  });
  const simData = await simRes.json();

  if (!simRes.ok) {
    throw new Error('Simulation failed: ' + JSON.stringify(simData));
  }

  console.log('   ✓ Status Code:', simRes.status);
  console.log('   ✓ Incident ID:', simData.incident_id);
  console.log('   ✓ Auto-Isolated:', simData.auto_isolated);
  console.log('   ✓ Response Message:', simData.message);
  console.log('   ✓ CLI Log Executed:\n' + (simData.cli_executed || 'None').split('\n').map(l => '     | ' + l).join('\n'));

  // 4. Verify ONU Status updated to loop_detected = 1
  console.log('\n4. Verifying ONU state in database...');
  const verifyOnuRes = await fetch(`${BASE_URL}/onus`, { headers: authHeaders });
  const verifyOnus = await verifyOnuRes.json();
  const updatedOnu = verifyOnus.find(o => o.onu_id === testOnu.onu_id);

  if (!updatedOnu || updatedOnu.loop_detected !== 1) {
    throw new Error(`Expected ONU loop_detected = 1, got: ${updatedOnu?.loop_detected}`);
  }
  console.log(`   ✓ ONU ${updatedOnu.serial_number} flag loop_detected = ${updatedOnu.loop_detected}, isolated port = LAN ${updatedOnu.isolated_lan_port}`);

  // 5. Fetch Active Loop Incidents
  console.log('\n5. Fetching active incidents (GET /api/loop-protection/incidents?status=active)...');
  const incRes = await fetch(`${BASE_URL}/loop-protection/incidents?status=active`, { headers: authHeaders });
  const incidents = await incRes.json();

  if (!Array.isArray(incidents)) {
    throw new Error('Expected array of incidents, got: ' + JSON.stringify(incidents));
  }

  const foundIncident = incidents.find(i => i.incident_id === simData.incident_id);
  if (!foundIncident) {
    throw new Error(`Simulated incident ${simData.incident_id} not found in active incidents list`);
  }
  console.log(`   ✓ Found active incident #${foundIncident.incident_id}:`);
  console.log(`     - ONU SN: ${foundIncident.serial_number}`);
  console.log(`     - MAC Address: ${foundIncident.mac_address}`);
  console.log(`     - Status: ${foundIncident.status}`);
  console.log(`     - Isolated Port: LAN ${foundIncident.lan_port}`);
  console.log(`     - Broadcast Storm Rate: ${foundIncident.storm_rate_pps} pps`);

  // 6. Test Manual OLT Scan Endpoint
  console.log('\n6. Testing OLT Scanning (POST /api/loop-protection/scan)...');
  const scanRes = await fetch(`${BASE_URL}/loop-protection/scan`, {
    method: 'POST',
    headers: authHeaders
  });
  const scanData = await scanRes.json();
  console.log('   ✓ Scan executed successfully:');
  console.log(`     - OLTs Scanned: ${scanData.devicesScanned}`);
  console.log(`     - Active Incidents in System: ${scanData.activeIncidentsCount}`);
  console.log(`     - Message: ${scanData.message}`);

  // 7. Resolve Loop Incident (Un-isolate Port LAN via OMCI)
  console.log(`\n7. Resolving Incident #${simData.incident_id} (POST /api/loop-protection/resolve/${simData.incident_id})...`);
  const resolveRes = await fetch(`${BASE_URL}/loop-protection/resolve/${simData.incident_id}`, {
    method: 'POST',
    headers: authHeaders
  });
  const resolveData = await resolveRes.json();

  if (!resolveRes.ok) {
    throw new Error('Resolve failed: ' + JSON.stringify(resolveData));
  }

  console.log('   ✓ Resolution Status Code:', resolveRes.status);
  console.log('   ✓ Response Message:', resolveData.message);
  console.log('   ✓ CLI Executed:\n' + (resolveData.cli_executed || 'None').split('\n').map(l => '     | ' + l).join('\n'));

  // 8. Verify ONU state restored (loop_detected = 0)
  console.log('\n8. Verifying ONU state restored...');
  const verifyRestoredRes = await fetch(`${BASE_URL}/onus`, { headers: authHeaders });
  const verifyRestoredOnus = await verifyRestoredRes.json();
  const restoredOnu = verifyRestoredOnus.find(o => o.onu_id === testOnu.onu_id);

  if (restoredOnu.loop_detected !== 0) {
    throw new Error(`Expected ONU loop_detected = 0 after resolve, got: ${restoredOnu.loop_detected}`);
  }
  console.log(`   ✓ ONU ${restoredOnu.serial_number} loop_detected successfully reset to 0!`);

  console.log('\n============================================================');
  console.log('🎉 ALL TESTS PASSED: Loop Protection & Auto-Isolation Verified!');
  console.log('============================================================\n');
}

runTest().catch((err) => {
  console.error('\n❌ Test Error:', err.message);
  process.exit(1);
});
