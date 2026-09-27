import assert from 'assert';
import { parseZTEUnconfiguredOutput } from '../services/olt_ssh_service.js';

console.log('=== TEST: Parsing ZTE Unconfigured ONUs Output ===\n');

// Test case 1: Standard ZTE C300/C320 output with 'gpon-onu_' and state 'unknown'
const sampleOutput1 = `
zte#show gpon onu uncfg
OnuIndex                 Sn                  State
---------------------------------------------------------------------
gpon-onu_1/2/1:1         ZTEGC9988776        unknown
gpon-onu_1/2/1:2         HWTC11223344        unknown
zte#
`;

// Test case 2: Output with 'gpon-olt_' prefix
const sampleOutput2 = `
zte#show gpon onu uncfg
OnuIndex                 Sn                  State
---------------------------------------------------------------------
gpon-olt_1/2/1:1         VSOL9988AABB        unknown
zte#
`;

// Test case 3: Output with short slot/port notation e.g. 1/2/3:1
const sampleOutput3 = `
OnuIndex                 Sn                  State
---------------------------------------------------------------------
1/2/3:1                  FHTT12345678        initial
`;

// Test case 4: No related information
const sampleOutput4 = `
zte#show gpon onu uncfg
%Code 62310-GPONSRV : No related information to show.
zte#
`;

try {
  const result1 = parseZTEUnconfiguredOutput(sampleOutput1);
  console.log('Result 1:', result1);
  assert.strictEqual(result1.length, 2, 'Should parse 2 ONUs from sample 1');
  assert.strictEqual(result1[0].serial_number, 'ZTEGC9988776');
  assert.strictEqual(result1[0].card_slot, 2);
  assert.strictEqual(result1[0].pon_port_id, 1);
  assert.strictEqual(result1[1].serial_number, 'HWTC11223344');

  const result2 = parseZTEUnconfiguredOutput(sampleOutput2);
  console.log('Result 2:', result2);
  assert.strictEqual(result2.length, 1, 'Should parse 1 ONU from sample 2');
  assert.strictEqual(result2[0].serial_number, 'VSOL9988AABB');
  assert.strictEqual(result2[0].card_slot, 2);
  assert.strictEqual(result2[0].pon_port_id, 1);

  const result3 = parseZTEUnconfiguredOutput(sampleOutput3);
  console.log('Result 3:', result3);
  assert.strictEqual(result3.length, 1, 'Should parse 1 ONU from sample 3');
  assert.strictEqual(result3[0].serial_number, 'FHTT12345678');
  assert.strictEqual(result3[0].card_slot, 2);
  assert.strictEqual(result3[0].pon_port_id, 3);

  const result4 = parseZTEUnconfiguredOutput(sampleOutput4);
  console.log('Result 4:', result4);
  assert.strictEqual(result4.length, 0, 'Should return empty array for no related info');

  console.log('\n✓ ALL PARSER TESTS PASSED!');
} catch (e) {
  console.error('\n❌ TEST FAILED:', e.message);
  process.exit(1);
}
