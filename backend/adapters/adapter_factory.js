import { ZTEAdapter } from './zte_adapter.js';
import { HuaweiAdapter } from './huawei_adapter.js';
import { FiberhomeAdapter } from './fiberhome_adapter.js';

export class AdapterFactory {
  static getAdapter(device) {
    if (!device || !device.vendor) {
      throw new Error('Device configuration with vendor is required to initialize OLT Adapter.');
    }

    const vendorNormalized = device.vendor.trim().toUpperCase();

    switch (vendorNormalized) {
      case 'ZTE':
        return new ZTEAdapter(device);
      case 'HUAWEI':
        return new HuaweiAdapter(device);
      case 'FIBERHOME':
        return new FiberhomeAdapter(device);
      default:
        throw new Error(`Unsupported OLT Vendor adapter: ${device.vendor}`);
    }
  }
}
