/*
──────────────────────────────────────────────────────────────
                           KasirKu
        Simple & Efficient Point of Sale (PoS) System

            Author      : Kevin Adhaikal
            Copyright   : (C) 2026 Kevin Adhaikal
            License     : AplikasiKasir License

    Permission is granted to modify and distribute this
    software, but the author's name must not be removed
                     or altered.
──────────────────────────────────────────────────────────────
*/

import { sql } from "drizzle-orm";
import type { DatabaseType, MigrationDb, MigrationSchema } from "../../../src/database/migrate";

export default async function(db: MigrationDb, dbType: DatabaseType) {
    const schema = (await import(`../../../src/database/schema/${dbType}`)) as MigrationSchema;

    // Transaksi lama dianggap lunas tunai: jumlah_dibayar = total_harga_jual, tanpa sisa piutang.
    await db
        .update(schema.penjualan)
        .set({
            jumlah_dibayar: sql`${schema.penjualan.total_harga_jual}`,
            sisa_piutang: 0,
            metode_bayar: 0,
        });
}
