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

import { eq, sql } from "drizzle-orm";
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
            global.permissions.KASIR
        )
    )) return new Response("0", {status: 403});
    
    const user_data = await req.json();
    const items = user_data.items as [{
        id: number,
        jumlah_barang: number,
        harga_modal: number,
        harga_jual: number,
        nama_barang: string
    }];

    if (!Array.isArray(items)) return new Response("Bad Request", {status: 400});

    const metode_bayar = Number(user_data.metode_bayar) === 1 ? 1 : 0;
    let nama_pelanggan = user_data.nama_pelanggan ? String(user_data.nama_pelanggan).trim() : null;
    let no_telepon_pelanggan = user_data.no_telepon_pelanggan ? String(user_data.no_telepon_pelanggan).trim() : null;
    let jumlah_dibayar = Number(user_data.jumlah_dibayar);

    if (metode_bayar === 1 && !nama_pelanggan) return new Response("2", { status: 400 });
    if (nama_pelanggan === "") nama_pelanggan = null;
    if (no_telepon_pelanggan === "") no_telepon_pelanggan = null;

    const date = global.date;
    const now = global.date.getTime();
    const date_now = date.getFullYear() * 10000 + (date.getMonth() + 1) * 100 + date.getDate();
    
    let total_barang = 0;
    let total_harga_modal = 0;
    let total_harga_jual = 0;

    for (const data of items) {
        total_barang += data.jumlah_barang;
        
        const [barang] = await db
            .select({nama_barang: schema.barang.nama_barang, stok_barang: schema.barang.stok_barang, harga_modal: schema.barang.harga_modal, harga_jual: schema.barang.harga_jual})
            .from(schema.barang)
            .where(eq(schema.barang.id, data.id))
        .limit(1);
        
        if (!barang) return new Response("Not Found", { status: 404 });
        if ((barang.stok_barang - data.jumlah_barang) < 0) return new Response("1", { status: 403 });
        
        data.harga_modal = barang.harga_modal;
        data.nama_barang = barang.nama_barang;

        // Harga jual yang disepakati dapat disesuaikan oleh kasir saat penjualan.
        // Fallback ke harga daftar dari database bila nilai tidak valid.
        const client_harga_jual = Number(data.harga_jual);
        data.harga_jual = (Number.isFinite(client_harga_jual) && client_harga_jual >= 0)
            ? Math.round(client_harga_jual)
            : barang.harga_jual;
        
        total_harga_modal += data.harga_modal * data.jumlah_barang;
        total_harga_jual += data.harga_jual * data.jumlah_barang;
    }

    let sisa_piutang = 0;
    if (metode_bayar === 1) {
        if (!Number.isFinite(jumlah_dibayar) || jumlah_dibayar < 0) jumlah_dibayar = 0;
        if (jumlah_dibayar > total_harga_jual) return new Response("3", { status: 400 });
        sisa_piutang = total_harga_jual - jumlah_dibayar;
    } else {
        jumlah_dibayar = total_harga_jual;
        sisa_piutang = 0;
        nama_pelanggan = null;
        no_telepon_pelanggan = null;
    }
    
    try {
        await db.transaction(async (trx: any) => {
            const [res_user] = await trx.select({full_name: schema.users.full_name}).from(schema.users).where(eq(schema.users.id, user_info.user_id)).limit(1);
            if (!res_user) return new Response("Not Found", {status: 404});

            const [penjualanResult] = await trx.insert(schema.penjualan).values({
                no_struk: `TRX-${now}`,
                kasir_id: user_info.user_id,
                total_barang,
                total_harga_modal,
                total_harga_jual,
                metode_bayar,
                nama_pelanggan,
                no_telepon_pelanggan,
                jumlah_dibayar,
                sisa_piutang,
                tanggal_key: date_now,
                created_ms: now,
                modified_ms: now
            }).returning();
            const last_row = Number(penjualanResult.id);

            await trx.insert(schema.pembukuan).values({
                tipe: 0,
                jumlah_uang: total_harga_jual,
                referensi_id: last_row,
                tanggal_key: date_now,
                created_ms: now,
                modified_ms: now
            });
            
            for (const e of items) {
                await trx.insert(schema.penjualan_item).values({
                    penjualan_id: last_row,
                    barang_id: e.id,
                    nama_barang: e.nama_barang,
                    jumlah: e.jumlah_barang,
                    harga_modal: e.harga_modal,
                    total_harga_modal: e.harga_modal * e.jumlah_barang,
                    harga_jual: e.harga_jual,
                    total_harga_jual: e.harga_jual * e.jumlah_barang,
                    tanggal_key: date_now,
                    created_ms: now,
                    modified_ms: now
                });
                
                // Update stok barang pake logic CASE WHEN
                await trx
                .update(schema.barang)
                .set({
                    stok_barang: sql`CASE 
                        WHEN stok_barang - ${e.jumlah_barang} < 0 THEN 0 
                        ELSE stok_barang - ${e.jumlah_barang} 
                    END`
                })
                .where(eq(schema.barang.id, e.id));
            }
        });
    } catch (e) {
        console.log("An error occured in POST Method at /masuk_ke_pembukuan:", e);
        return new Response("Internal Server Error", { status: 500 });
    }
                
    global.sse_clients.broadcast(JSON.stringify({
        type: 4,
        code: "TAMBAH_PENJUALAN",
        data: {
            items,
            metode_bayar,
            nama_pelanggan,
            no_telepon_pelanggan,
            jumlah_dibayar,
            sisa_piutang,
            tanggal_key: date_now
        }
    }));

    return new Response("", {status: 200});
}