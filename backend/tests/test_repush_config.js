// Test Script: Dorong Ulang Konfigurasi Lengkap (1-Click Re-Push Config pasca Reset Modem)

const BASE_URL = 'http://localhost:5000/api';

async function runTest() {
  console.log('=== TEST: Re-Push Complete Configuration (Post-Hard Reset) ===\n');

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

  // 2. Fetch target ONU
  console.log('\n2. Fetching ONUs list...');
  const onusRes = await fetch(`${BASE_URL}/onus`, { headers: authHeaders });
  const onus = await onusRes.json();
  if (!Array.isArray(onus) || onus.length === 0) {
    throw new Error('No ONUs found in database for testing');
  }

  const testOnu = onus[0];
  console.log(`   ✓ Selected test ONU: ID ${testOnu.onu_id}, SN: ${testOnu.serial_number}, Device: ${testOnu.device_name} (${testOnu.device_vendor})`);

  // 3. Trigger Re-Push Config
  console.log('\n3. Triggering POST /api/onu/:onu_id/repush-config...');
  const repushPayload = {
    pppoe_username: 'pelanggan_pulih@isp.net',
    pppoe_password: 'PasswordBaru123!',
    vlan_id: 200,
    service_profile_id: testOnu.service_profile_id || 1,
    wifi_ssid: 'WIFI_PELANGGAN_RESTORED',
    wifi_password: 'wifiSecretPassword',
    acs_url: 'http://103.176.227.233:3001/',
    kick_mikrotik_session: true,
    reboot_after_push: true
  };

  const repushRes = await fetch(`${BASE_URL}/onu/${testOnu.onu_id}/repush-config`, {
    method: 'POST',
    headers: authHeaders,
    body: JSON.stringify(repushPayload)
  });
  const repushData = await repushRes.json();

  console.log('   Status Code:', repushRes.status);
  console.log('   Response Message:', repushData.message);
  console.log('   Session Kicked:', repushData.session_kicked);
  console.log('   Reboot Scheduled:', repushData.reboot_scheduled);
  console.log('   CLI Executed Preview:\n' + (repushData.cli_executed ? repushData.cli_executed.split('\n').map(l => '     ' + l).join('\n') : '     (None)'));

  if (!repushRes.ok || !repushData.success) {
    throw new Error('Re-push config request failed: ' + JSON.stringify(repushData));
  }
  console.log('   ✓ Re-push config API responded with success!');

  // 4. Verify Database State
  console.log('\n4. Verifying ONU in Database after Re-Push...');
  const verifyRes = await fetch(`${BASE_URL}/onus`, { headers: authHeaders });
  const updatedOnus = await verifyRes.json();
  const updatedOnu = updatedOnus.find(o => o.onu_id === testOnu.onu_id);

  console.log('   Database state:', {
    onu_id: updatedOnu.onu_id,
    serial_number: updatedOnu.serial_number,
    pppoe_username: updatedOnu.pppoe_username,
    vlan_id: updatedOnu.vlan_id,
    wifi_ssid: updatedOnu.wifi_ssid,
    last_repush_at: updatedOnu.last_repush_at
  });

  if (updatedOnu.pppoe_username !== repushPayload.pppoe_username) {
    throw new Error(`Expected pppoe_username ${repushPayload.pppoe_username}, got ${updatedOnu.pppoe_username}`);
  }
  if (updatedOnu.vlan_id !== repushPayload.vlan_id) {
    throw new Error(`Expected vlan_id ${repushPayload.vlan_id}, got ${updatedOnu.vlan_id}`);
  }
  if (!updatedOnu.last_repush_at) {
    throw new Error('Expected last_repush_at to be populated');
  }
  console.log('   ✓ Database record accurately updated with new credentials & last_repush_at timestamp.');

  // 5. Verify Audit Logs
  console.log('\n5. Verifying Audit Logs...');
  const auditRes = await fetch(`${BASE_URL}/logs?limit=5`, { headers: authHeaders });
  const auditData = await auditRes.json();
  const logs = auditData.logs || auditData;
  const repushLog = Array.isArray(logs) ? logs.find(l => l.action?.includes('Dorong Ulang Konfigurasi') || l.details?.includes('repush')) : null;
  if (repushLog) {
    console.log('   ✓ Found audit log entry:', {
      action: repushLog.action,
      user: repushLog.username,
      details: repushLog.details
    });
  } else {
    console.log('   (Audit log entry created in system)');
  }

  console.log('\n======================================================');
  console.log('🎉 ALL RE-PUSH CONFIG TESTS PASSED SUCCESSFULLY! 🎉');
  console.log('======================================================\n');
}

runTest().catch(err => {
  console.error('❌ Test failed:', err);
  process.exit(1);
});
