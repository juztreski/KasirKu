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

import { sql, eq } from "drizzle-orm";
import { global } from "../../global";
import { user_session_interface } from "../../user_session/user_session";

export default async function(req: Request, url: URL, user_info: user_session_interface) {
    const db = global.database;
    const { roles } = global.schema;
    const [res_role] = await db.select({ permission_level: roles.permission_level }).from(roles).where(eq(roles.id, user_info.role_id)).limit(1);

    if (!res_role) return new Response("Internal Server Error", {status: 500});
    if (!(
        res_role.permission_level & (
            global.permissions.ADMINISTRATOR |
            global.permissions.MANAGE_PEMBUKUAN
        )
    )) return new Response("0", {status: 403});

    const user_input = url.searchParams;
    const tanggal_start = Number(user_input.get("tanggal_start"));
    const tanggal_end = Number(user_input.get("tanggal_end"));

    let range = sql``;
    if (!Number.isNaN(tanggal_start) && tanggal_start) range = sql`${range} AND tanggal_key >= ${tanggal_start}`;
    if (!Number.isNaN(tanggal_end) && tanggal_end) range = sql`${range} AND tanggal_key <= ${tanggal_end}`;

    const [res] = await db
        .select({
            total_piutang: sql<number>`(SELECT COALESCE(SUM(sisa_piutang), 0) FROM penjualan WHERE metode_bayar = 1 AND sisa_piutang > 0${range})`.as('total_piutang'),
            jumlah_transaksi: sql<number>`(SELECT COUNT(*) FROM penjualan WHERE metode_bayar = 1 AND sisa_piutang > 0${range})`.as('jumlah_transaksi'),
            jumlah_pelanggan: sql<number>`(SELECT COUNT(DISTINCT nama_pelanggan) FROM penjualan WHERE metode_bayar = 1 AND sisa_piutang > 0${range})`.as('jumlah_pelanggan')
        })
    .from(sql`(SELECT 1) AS dummy`);

    return new Response(JSON.stringify(res), {status: 200});
}
