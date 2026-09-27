/**
 * Base Abstract OLT Adapter
 * Enforces unified interface for ZTE, Huawei, and Fiberhome devices.
 */
export class BaseOLTAdapter {
  constructor(device) {
    if (new.target === BaseOLTAdapter) {
      throw new Error('BaseOLTAdapter is an abstract class and cannot be instantiated directly.');
    }
    this.device = device;
  }

  /**
   * Test SSH/Telnet connection to OLT
   */
  async testConnection() {
    throw new Error('Method testConnection() must be implemented.');
  }

  /**
   * Execute raw CLI commands on OLT
   */
  async executeCommand(command) {
    throw new Error('Method executeCommand() must be implemented.');
  }

  /**
   * Register and provision a new ONU
   */
  async provisionONU(params) {
    throw new Error('Method provisionONU() must be implemented.');
  }

  /**
   * Push PPPoE WAN credentials to ONU
   */
  async configurePPPoE(params) {
    throw new Error('Method configurePPPoE() must be implemented.');
  }

  /**
   * Scan / get list of unconfigured / unassigned ONUs on PON ports
   */
  async getUnconfiguredONUs() {
    throw new Error('Method getUnconfiguredONUs() must be implemented.');
  }

  /**
   * Replace an existing ONU with a new Serial Number (Swap Hardware)
   */
  async replaceONU(params) {
    throw new Error('Method replaceONU() must be implemented.');
  }

  /**
   * Pre-activation diagnostic check on unconfigured or target ONU
   */
  async checkPreOpticalPower(params) {
    throw new Error('Method checkPreOpticalPower() must be implemented.');
  }

  /**
   * Delete / Unregister ONU from OLT hardware
   */
  async deleteONU(params) {
    throw new Error('Method deleteONU() must be implemented.');
  }

  /**
   * Remote reboot / reset customer ONU via OMCI / OLT CLI
   */
  async rebootONU(params) {
    throw new Error('Method rebootONU() must be implemented.');
  }

  /**
   * Get ONU physical details (RX power, status, optical power, root cause analysis)
   */
  async getONUStatus(serialNumber, params = {}) {
    throw new Error('Method getONUStatus() must be implemented.');
  }

  /**
   * Modify / override service profile (speed / VLAN) without unregistering ONU
   */
  async modifyServiceProfile(params) {
    throw new Error('Method modifyServiceProfile() must be implemented.');
  }

  /**
   * Scan / get list of all existing registered ONUs on the OLT hardware
   */
  async getRegisteredONUs() {
    throw new Error('Method getRegisteredONUs() must be implemented.');
  }

  /**
   * Re-push complete configuration (WAN, VLAN, PPPoE, TR-069, WiFi) after customer modem reset
   */
  async repushConfig(params) {
    throw new Error('Method repushConfig() must be implemented.');
  }

  /**
   * Detect active loopback incidents or MAC flapping on OLT hardware
   */
  async detectLoopbackEvents() {
    throw new Error('Method detectLoopbackEvents() must be implemented.');
  }

  /**
   * Enable/Disable (shutdown/no-shutdown) a specific LAN port on customer ONU via OMCI
   */
  async setLanPortState(params) {
    throw new Error('Method setLanPortState() must be implemented.');
  }

  /**
   * Get supported ONU types from OLT hardware
   */
  async getONUTypes() {
    return [];
  }
}
