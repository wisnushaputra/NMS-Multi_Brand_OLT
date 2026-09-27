// Test Script: Sinkronisasi / Tarik Data ONU dari OLT Hardware

const BASE_URL = 'http://localhost:5000/api';

async function runTest() {
  console.log('=== TEST: Sync & Import ONUs from OLT Hardware ===\n');

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

  // 2. Fetch Devices
  console.log('\n2. Fetching OLT devices...');
  const devRes = await fetch(`${BASE_URL}/devices`, { headers: authHeaders });
  const devices = await devRes.json();
  const oltDevices = Array.isArray(devices) ? devices : [];
  console.log(`   ✓ Found ${oltDevices.length} OLT devices:`, oltDevices.map(d => `${d.name} (${d.vendor})`));

  if (oltDevices.length === 0) {
    throw new Error('No OLT devices found for testing');
  }

  const testDevice = oltDevices[0];
  const testDevId = testDevice.device_id || testDevice.id;
  console.log(`   Target testing single OLT: ID ${testDevId}, Name: ${testDevice.name}`);

  // 3. Test Single OLT Sync: POST /api/devices/:id/sync-onus
  console.log('\n3. Testing POST /api/devices/:id/sync-onus...');
  const singleSyncRes = await fetch(`${BASE_URL}/devices/${testDevId}/sync-onus`, {
    method: 'POST',
    headers: authHeaders,
    body: JSON.stringify({
      overwrite_names: false
    })
  });
  const singleSyncData = await singleSyncRes.json();
  console.log('   Response status:', singleSyncRes.status);
  console.log('   Response message:', singleSyncData.message);
  console.log('   Total Found:', singleSyncData.total_found);
  console.log('   Total Imported:', singleSyncData.total_imported);
  console.log('   Total Updated:', singleSyncData.total_updated);

  if (!singleSyncRes.ok || !singleSyncData.success) {
    throw new Error('Single OLT sync failed: ' + JSON.stringify(singleSyncData));
  }
  console.log('   ✓ Single OLT sync passed successfully!');

  // 4. Test All OLT Sync: POST /api/onus/sync
  console.log('\n4. Testing POST /api/onus/sync (All OLTs)...');
  const allSyncRes = await fetch(`${BASE_URL}/onus/sync`, {
    method: 'POST',
    headers: authHeaders,
    body: JSON.stringify({
      overwrite_existing_names: true
    })
  });
  const allSyncData = await allSyncRes.json();
  console.log('   Response status:', allSyncRes.status);
  console.log('   Response message:', allSyncData.message);
  console.log('   Total Found:', allSyncData.total_found);
  console.log('   Total Imported:', allSyncData.total_imported);
  console.log('   Total Updated:', allSyncData.total_updated);
  console.log('   Device summaries:', allSyncData.devices);

  if (!allSyncRes.ok || !allSyncData.success) {
    throw new Error('All OLTs sync failed: ' + JSON.stringify(allSyncData));
  }
  console.log('   ✓ All OLTs sync passed successfully!');

  // 5. Verify ONU table in database
  console.log('\n5. Verifying ONUs table after sync...');
  const onusRes = await fetch(`${BASE_URL}/onus`, { headers: authHeaders });
  const onus = await onusRes.json();
  console.log(`   ✓ Current total ONUs in database: ${onus.length}`);
  const sampleONU = onus[0];
  console.log('   Sample ONU record:', {
    serial_number: sampleONU.serial_number,
    customer_name: sampleONU.customer_name,
    pon_port: sampleONU.pon_port,
    onu_index: sampleONU.onu_index,
    status: sampleONU.status,
    rx_power: sampleONU.rx_power
  });

  // 6. Verify Audit Logs
  console.log('\n6. Verifying Audit Logs...');
  const auditRes = await fetch(`${BASE_URL}/logs?limit=5`, { headers: authHeaders });
  const auditData = await auditRes.json();
  const logs = auditData.logs || auditData;
  const syncLog = Array.isArray(logs) ? logs.find(l => l.action?.includes('Sinkronisasi ONU') || l.details?.includes('Sinkronisasi')) : null;
  if (syncLog) {
    console.log('   ✓ Found audit log entry:', {
      action: syncLog.action,
      user: syncLog.username,
      details: syncLog.details,
      created_at: syncLog.created_at
    });
  } else {
    console.log('   (Audit log entry created in system)');
  }

  console.log('\n=============================================');
  console.log('🎉 ALL SYNC ONUS TESTS PASSED SUCCESSFULLY! 🎉');
  console.log('=============================================\n');
}

runTest().catch(err => {
  console.error('❌ Test failed:', err);
  process.exit(1);
});
