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

import { eq } from "drizzle-orm";
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
            global.permissions.ADMINISTRATOR |
            global.permissions.MANAGE_PEMBUKUAN
        )
    )) return new Response("0", {status: 403});

    const raw = await req.text();
    let body: any;
    try { body = JSON.parse(raw); } catch { body = Object.fromEntries(new URLSearchParams(raw)); }

    const penjualan_id = Number(body.penjualan_id);
    const jumlah_bayar = Number(body.jumlah_bayar);
    const catatan = body.catatan ? String(body.catatan).trim() : null;

    if (
        Number.isNaN(penjualan_id) || !penjualan_id ||
        Number.isNaN(jumlah_bayar) || jumlah_bayar <= 0
    ) return new Response("Bad Request", {status: 400});

    const [sale] = await db
        .select({
            id: schema.penjualan.id,
            no_struk: schema.penjualan.no_struk,
            metode_bayar: schema.penjualan.metode_bayar,
            nama_pelanggan: schema.penjualan.nama_pelanggan,
            total_harga_jual: schema.penjualan.total_harga_jual,
            sisa_piutang: schema.penjualan.sisa_piutang
        })
        .from(schema.penjualan)
        .where(eq(schema.penjualan.id, penjualan_id))
    .limit(1);

    if (!sale) return new Response("Not Found", {status: 404});
    if (Number(sale.metode_bayar) !== 1) return new Response("2", {status: 400});
    if (jumlah_bayar > Number(sale.sisa_piutang)) return new Response("1", {status: 400});

    const now = global.date.getTime();
    const date = global.date;
    const date_now = date.getFullYear() * 10000 + (date.getMonth() + 1) * 100 + date.getDate();
    const new_sisa = Number(sale.sisa_piutang) - jumlah_bayar;

    try {
        await db.transaction(async (trx: any) => {
            await trx.insert(schema.pembayaran_piutang).values({
                penjualan_id,
                jumlah_bayar,
                catatan,
                tanggal_key: date_now,
                created_ms: now,
                modified_ms: now
            });

            await trx
                .update(schema.penjualan)
                .set({ sisa_piutang: new_sisa, modified_ms: now })
                .where(eq(schema.penjualan.id, penjualan_id));

            await trx.insert(schema.pembukuan).values({
                tipe: 2,
                deskripsi: `Penerimaan piutang ${sale.nama_pelanggan || ""} (${sale.no_struk})`.trim(),
                jumlah_uang: jumlah_bayar,
                referensi_id: penjualan_id,
                tanggal_key: date_now,
                created_ms: now,
                modified_ms: now
            });
        });
    } catch (e) {
        console.log("An error occured in POST Method at /bayar_piutang:", e);
        return new Response("Internal Server Error", { status: 500 });
    }

    global.sse_clients.broadcast(JSON.stringify({
        type: 6,
        code: "TAMBAH_PEMBAYARAN_PIUTANG",
        data: {
            penjualan_id,
            jumlah_bayar,
            sisa_piutang: new_sisa,
            tanggal_key: date_now
        }
    }));

    return new Response(JSON.stringify({ sisa_piutang: new_sisa }), {status: 200});
}
