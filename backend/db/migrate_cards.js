import { dbQuery } from './index.js';

export async function runCardsMigration() {
  try {
    // 1. Cek dan tambahkan kolom 'cards' di tabel devices
    const deviceTableInfo = await dbQuery.all("PRAGMA table_info(devices)");
    const hasCardsCol = deviceTableInfo.some((col) => col.name === 'cards');

    if (!hasCardsCol) {
      console.log('Menambahkan kolom cards ke tabel devices...');
      await dbQuery.exec("ALTER TABLE devices ADD COLUMN cards TEXT DEFAULT '[]'");
    }

    // 2. Cek dan tambahkan kolom 'card_slot' di tabel onus
    const onusTableInfo = await dbQuery.all("PRAGMA table_info(onus)");
    const hasCardSlotCol = onusTableInfo.some((col) => col.name === 'card_slot');

    if (!hasCardSlotCol) {
      console.log('Menambahkan kolom card_slot ke tabel onus...');
      await dbQuery.exec("ALTER TABLE onus ADD COLUMN card_slot INTEGER DEFAULT 1");
    }

    // 3. Update default cards untuk devices yang belum memiliki cards
    const devices = await dbQuery.all("SELECT device_id, name, vendor, pon_ports_count, cards FROM devices");
    for (const dev of devices) {
      let cardsArr = [];
      try {
        cardsArr = dev.cards ? JSON.parse(dev.cards) : [];
      } catch {
        cardsArr = [];
      }

      if (!cardsArr || cardsArr.length === 0) {
        // Konfigurasi default berdasarkan vendor atau spesifik OLT
        if (dev.name.toLowerCase().includes('office') || dev.ip_address === '10.255.100.2') {
          // Khusus ZTE C320 Office OLT user yang memiliki Slot 1 dan Slot 2
          cardsArr = [
            { slot: 1, type: 'GTGH', ports: 16, status: 'OFFLINE' },
            { slot: 2, type: 'GTGHG', ports: 16, status: 'INSERVICE' }
          ];
        } else {
          cardsArr = [
            { slot: 1, type: dev.vendor === 'ZTE' ? 'GTGO' : 'GPFD', ports: dev.pon_ports_count || 8, status: 'INSERVICE' }
          ];
        }

        await dbQuery.run(
          "UPDATE devices SET cards = ? WHERE device_id = ?",
          [JSON.stringify(cardsArr), dev.device_id]
        );
        console.log(`Cards diinisialisasi untuk device: ${dev.name}`);
      }
    }

    console.log('Migrasi cards dan card_slot berhasil diselesaikan.');
  } catch (err) {
    console.error('Error saat menjalankan migrasi cards:', err);
  }
}
