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

import { and, eq } from "drizzle-orm";
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

    const id = Number(body.id);
    const penjualan_id = Number(body.penjualan_id);

    if (Number.isNaN(id) || !id || Number.isNaN(penjualan_id) || !penjualan_id) {
        return new Response("Bad Request", {status: 400});
    }

    const [payment] = await db
        .select()
        .from(schema.pembayaran_piutang)
        .where(and(
            eq(schema.pembayaran_piutang.id, id),
            eq(schema.pembayaran_piutang.penjualan_id, penjualan_id)
        ))
    .limit(1);

    if (!payment) return new Response("Not Found", {status: 404});

    const [sale] = await db
        .select({ total_harga_jual: schema.penjualan.total_harga_jual, sisa_piutang: schema.penjualan.sisa_piutang })
        .from(schema.penjualan)
        .where(eq(schema.penjualan.id, penjualan_id))
    .limit(1);

    if (!sale) return new Response("Not Found", {status: 404});

    const now = global.date.getTime();
    const restored = Math.min(Number(sale.total_harga_jual), Number(sale.sisa_piutang) + Number(payment.jumlah_bayar));

    try {
        await db.transaction(async (trx: any) => {
            await trx
                .delete(schema.pembayaran_piutang)
                .where(eq(schema.pembayaran_piutang.id, id));

            await trx
                .update(schema.penjualan)
                .set({ sisa_piutang: restored, modified_ms: now })
                .where(eq(schema.penjualan.id, penjualan_id));

            await trx
                .delete(schema.pembukuan)
                .where(and(
                    eq(schema.pembukuan.tipe, 2),
                    eq(schema.pembukuan.referensi_id, penjualan_id),
                    eq(schema.pembukuan.created_ms, Number(payment.created_ms))
                ));
        });
    } catch (e) {
        console.log("An error occured in DELETE Method at /pembayaran_piutang:", e);
        return new Response("Internal Server Error", { status: 500 });
    }

    global.sse_clients.broadcast(JSON.stringify({
        type: 6,
        code: "DELETE_PEMBAYARAN_PIUTANG",
        data: { penjualan_id, sisa_piutang: restored }
    }));

    return new Response(JSON.stringify({ sisa_piutang: restored }), {status: 200});
}
