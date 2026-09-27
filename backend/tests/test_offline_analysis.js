// Test Script: Analisis Penyebab Offline (Dying Gasp vs Fiber Cut)

const BASE_URL = 'http://localhost:5000/api';

async function runTest() {
  console.log('=== TEST: Offline Root Cause Analysis (Dying Gasp vs Fiber Cut) ===\n');

  // 1. Login
  console.log('1. Logging in as tech_budi...');
  const loginRes = await fetch(`${BASE_URL}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: 'tech_budi', password: 'tech123' })
  });
  const loginData = await loginRes.json();
  if (!loginRes.ok) throw new Error('Login failed: ' + JSON.stringify(loginData));
  const token = loginData.token;
  console.log('   ✓ Login success as:', loginData.user.username);

  const authHeaders = {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${token}`
  };

  // 2. Fetch ONUs
  console.log('\n2. Fetching ONUs list...');
  const onusRes = await fetch(`${BASE_URL}/onus`, { headers: authHeaders });
  const onus = await onusRes.json();
  const testOnu = onus[0];
  console.log(`   ✓ Selected test ONU: ID ${testOnu.onu_id}, SN: ${testOnu.serial_number}, Current Status: ${testOnu.status}`);

  // 3. Test Simulation 1: Simulate Dying Gasp (Mati Listrik)
  console.log('\n3. Testing Simulation 1: Power Outage (Dying Gasp)...');
  const simDyingRes = await fetch(`${BASE_URL}/onu/${testOnu.onu_id}/simulate-state`, {
    method: 'POST',
    headers: authHeaders,
    body: JSON.stringify({ state: 'offline', reason: 'dying-gasp' })
  });
  const simDyingData = await simDyingRes.json();
  console.log('   Status Code:', simDyingRes.status);
  console.log('   Response Data:', simDyingData);

  if (!simDyingRes.ok || simDyingData.data?.last_offline_reason !== 'dying-gasp') {
    throw new Error('Dying gasp simulation failed: ' + JSON.stringify(simDyingData));
  }
  console.log('   ✓ Verified Dying Gasp state stored in DB.');

  // Check OMCI Status endpoint
  const statusRes1 = await fetch(`${BASE_URL}/onu/${testOnu.onu_id}/status`, { headers: authHeaders });
  const statusData1 = await statusRes1.json();
  const vs1 = statusData1.vendor_status;
  console.log('   ✓ OMCI Diagnostics for Dying Gasp:');
  console.log('     Status:', vs1.status);
  console.log('     OMCI State:', vs1.omciState);
  console.log('     Offline Reason:', vs1.offlineReason);
  console.log('     Recommendation:', vs1.offlineDetail?.recommendation);

  if (vs1.offlineReason !== 'dying-gasp') {
    throw new Error('Expected vendor_status.offlineReason to be dying-gasp, got ' + vs1.offlineReason);
  }

  // 4. Test Simulation 2: Simulate Fiber Cut (Loss of Signal / LOS)
  console.log('\n4. Testing Simulation 2: Fiber Cut (Loss of Signal)...');
  const simLOSRes = await fetch(`${BASE_URL}/onu/${testOnu.onu_id}/simulate-state`, {
    method: 'POST',
    headers: authHeaders,
    body: JSON.stringify({ state: 'los', reason: 'los' })
  });
  const simLOSData = await simLOSRes.json();
  console.log('   Status Code:', simLOSRes.status);
  console.log('   Response Data:', simLOSData);

  if (!simLOSRes.ok || simLOSData.data?.last_offline_reason !== 'los') {
    throw new Error('LOS simulation failed: ' + JSON.stringify(simLOSData));
  }
  console.log('   ✓ Verified LOS state stored in DB.');

  // Check OMCI Status endpoint for LOS
  const statusRes2 = await fetch(`${BASE_URL}/onu/${testOnu.onu_id}/status`, { headers: authHeaders });
  const statusData2 = await statusRes2.json();
  const vs2 = statusData2.vendor_status;
  console.log('   ✓ OMCI Diagnostics for Fiber Cut:');
  console.log('     Status:', vs2.status);
  console.log('     OMCI State:', vs2.omciState);
  console.log('     Offline Reason:', vs2.offlineReason);
  console.log('     Recommendation:', vs2.offlineDetail?.recommendation);

  if (vs2.offlineReason !== 'los') {
    throw new Error('Expected vendor_status.offlineReason to be los, got ' + vs2.offlineReason);
  }

  // 5. Test Simulation 3: Restore to Online
  console.log('\n5. Testing Simulation 3: Restore to Online...');
  const simOnlineRes = await fetch(`${BASE_URL}/onu/${testOnu.onu_id}/simulate-state`, {
    method: 'POST',
    headers: authHeaders,
    body: JSON.stringify({ state: 'online' })
  });
  const simOnlineData = await simOnlineRes.json();
  console.log('   Status Code:', simOnlineRes.status);
  console.log('   Response Data:', simOnlineData);

  if (!simOnlineRes.ok || simOnlineData.data?.status !== 'Online' || simOnlineData.data?.last_offline_reason !== null) {
    throw new Error('Restore to online failed: ' + JSON.stringify(simOnlineData));
  }
  console.log('   ✓ Verified Online recovery in DB.');

  console.log('\n🎉 ALL OFFLINE ROOT CAUSE TESTS PASSED SUCCESSFULLY!');
}

runTest().catch(err => {
  console.error('❌ Test failed:', err.message);
  process.exit(1);
});
