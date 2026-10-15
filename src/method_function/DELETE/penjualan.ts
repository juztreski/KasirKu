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

import { and, eq, sql } from "drizzle-orm";
import { global } from "../../global";

export default async function(req: Request, token: string) {
    const user_info = await global.user_sessions.get(token);
    if (!token || !user_info) return new Response("Unauthorized", {status: 401});

    const db = global.database;
    const schema = global.schema;
    const [res_role] = await db.select({permission_level: schema.roles.permission_level}).from(schema.roles).where(eq(schema.roles.id, user_info.role_id)).limit(1);
    if (!res_role) return new Response("Internal Server Error", {status: 500});

    if (!(
        res_role.permission_level & (
            global.permissions.ADMINISTRATOR
        )
    )) return new Response("0", {status: 403});

    const user_input = new URLSearchParams(await req.text());

    const id = Number(user_input.get("id"));

    if (
        Number.isNaN(id) || !id
    ) return new Response("Bad Request", {status: 400});

    const [res_penjualan] = await db
        .select({id: schema.penjualan.id, tanggal_key: schema.penjualan.tanggal_key})
        .from(schema.penjualan)
        .where(eq(schema.penjualan.id, id))
    .limit(1);

    if (!res_penjualan) return new Response("Not Found", {status: 404});

    // Transaksi kredit yang sudah memiliki riwayat pembayaran piutang tidak boleh dihapus
    const [res_pembayaran] = await db
        .select({id: schema.pembayaran_piutang.id})
        .from(schema.pembayaran_piutang)
        .where(eq(schema.pembayaran_piutang.penjualan_id, id))
    .limit(1);

    if (res_pembayaran) return new Response("1", {status: 403});

    try {
        const items = await db
            .select({barang_id: schema.penjualan_item.barang_id, jumlah: schema.penjualan_item.jumlah})
            .from(schema.penjualan_item)
            .where(eq(schema.penjualan_item.penjualan_id, id));

        await db.transaction(async (trx: any) => {
            // Kembalikan stok barang untuk setiap item pada transaksi
            for (const item of items) {
                await trx.update(schema.barang)
                    .set({
                        stok_barang: sql`stok_barang + ${item.jumlah}`,
                        modified_ms: Date.now()
                    })
                    .where(eq(schema.barang.id, item.barang_id))
                .execute();
            }

            // Hapus catatan omzet pada pembukuan (tipe 0 = penjualan)
            await trx.delete(schema.pembukuan)
                .where(and(
                    eq(schema.pembukuan.tipe, 0),
                    eq(schema.pembukuan.referensi_id, id)
                ))
            .execute();

            // Hapus item transaksi lebih dulu.
            // Pragma foreign_keys tidak aktif pada koneksi runtime, jadi
            // ON DELETE cascade tidak dijalankan oleh database.
            await trx.delete(schema.penjualan_item)
                .where(eq(schema.penjualan_item.penjualan_id, id))
            .execute();

            await trx.delete(schema.penjualan)
                .where(eq(schema.penjualan.id, id))
            .execute();
        });
    } catch(e) {
        console.log("An error occured in DELETE Method at /penjualan:", e);
        return new Response("Internal Server Error", {status: 500});
    }

    global.sse_clients.broadcast(JSON.stringify({
        type: 4,
        code: "DELETE_PENJUALAN",
        data: {
            id,
            tanggal_key: res_penjualan.tanggal_key
        }
    }));
    global.sse_clients.broadcast(JSON.stringify({
        type: 2,
        code: "UPDATE_BARANG",
        data: {
            penjualan_id: id
        }
    }));

    return new Response("", {status: 200});
}
