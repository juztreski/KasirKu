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

import { user_session_interface } from "../../user_session/user_session";
import { global } from "../../global";
import { and, eq, gt, gte, lte } from "drizzle-orm";

export default async function(req: Request, url: URL, user_info: user_session_interface) {
    const db = global.database;
    const { roles, penjualan, users } = global.schema;
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
    const id = Number(user_input.get("id"));
    const status = user_input.get("status");
    const search = (user_input.get("search") || "").trim().toLowerCase();

    const conditions: any[] = [eq(penjualan.metode_bayar, 1)];
    if (!Number.isNaN(id) && id) conditions.push(eq(penjualan.id, id));
    if (!Number.isNaN(tanggal_start) && tanggal_start) conditions.push(gte(penjualan.tanggal_key, tanggal_start));
    if (!Number.isNaN(tanggal_end) && tanggal_end) conditions.push(lte(penjualan.tanggal_key, tanggal_end));
    if (status === "belum") conditions.push(gt(penjualan.sisa_piutang, 0));
    else if (status === "lunas") conditions.push(lte(penjualan.sisa_piutang, 0));

    let res: any[] = await db
        .select({
            id: penjualan.id,
            kasir_id: penjualan.kasir_id,
            no_struk: penjualan.no_struk,
            total_barang: penjualan.total_barang,
            total_harga_modal: penjualan.total_harga_modal,
            total_harga_jual: penjualan.total_harga_jual,
            metode_bayar: penjualan.metode_bayar,
            nama_pelanggan: penjualan.nama_pelanggan,
            no_telepon_pelanggan: penjualan.no_telepon_pelanggan,
            jumlah_dibayar: penjualan.jumlah_dibayar,
            sisa_piutang: penjualan.sisa_piutang,
            tanggal_key: penjualan.tanggal_key,
            created_ms: penjualan.created_ms,
            modified_ms: penjualan.modified_ms,
            nama_kasir: users.full_name
        })
        .from(penjualan)
    .leftJoin(users, eq(users.id, penjualan.kasir_id))
    .where(and(...conditions));

    if (search) {
        res = res.filter((r) =>
            (r.nama_pelanggan || "").toLowerCase().includes(search) ||
            (r.no_struk || "").toLowerCase().includes(search)
        );
    }

    const total_piutang = res.reduce((acc, r) => acc + (Number(r.sisa_piutang) || 0), 0);

    return new Response(JSON.stringify({ data: res, total_piutang }), {status: 200});
}
