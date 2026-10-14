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

interface ImportRow {
    nama_barang?: string;
    kategori?: string;
    stok?: number | string;
    harga_modal?: number | string;
    harga_jual?: number | string;
    barcode?: string;
}

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
            global.permissions.MANAGE_BARANG
        )
    )) return new Response("0", {status: 403});

    const raw = await req.text();
    let body: any;
    try { body = JSON.parse(raw); } catch { body = {}; }

    const rows = body?.rows;
    if (!Array.isArray(rows) || rows.length === 0) return new Response("Bad Request", {status: 400});

    const to_cents = (v: any): number => {
        if (v === null || v === undefined || v === "") return 0;
        if (typeof v === "number") return Number.isFinite(v) ? Math.round(v * 100) : 0;
        let s = String(v).trim().replace(/\s/g, "");
        if (s.includes(".") && s.includes(",")) s = s.replace(/\./g, "").replace(",", ".");
        else if (s.includes(",")) s = s.replace(",", ".");
        const n = Number(s);
        return Number.isFinite(n) ? Math.round(n * 100) : 0;
    };

    const now = Date.now();

    const kategori_rows = await db.select({ id: schema.kategori_barang.id, nama_kategori: schema.kategori_barang.nama_kategori }).from(schema.kategori_barang);
    const kat_map = new Map<string, number>();
    for (const k of kategori_rows) kat_map.set(String(k.nama_kategori).toLowerCase(), Number(k.id));

    const barang_rows = await db.select({ id: schema.barang.id, nama_barang: schema.barang.nama_barang, barcode_barang: schema.barang.barcode_barang }).from(schema.barang);
    const by_barcode = new Map<string, number>();
    const by_nama = new Map<string, number>();
    for (const b of barang_rows) {
        if (b.barcode_barang) by_barcode.set(String(b.barcode_barang), Number(b.id));
        by_nama.set(String(b.nama_barang).toLowerCase(), Number(b.id));
    }

    let created = 0;
    let updated = 0;
    let skipped = 0;
    const errors: { row: number; message: string }[] = [];

    for (let i = 0; i < rows.length; i++) {
        const row = rows[i] as ImportRow;

        try {
            const nama_barang = (row.nama_barang || "").toString().trim();
            if (!nama_barang) { skipped++; errors.push({ row: i + 1, message: "Nama barang kosong." }); continue; }

            let barcode_barang: string | null = row.barcode ? String(row.barcode).trim() : null;
            if (!barcode_barang || !barcode_barang.length) barcode_barang = null;

            const stok_barang = Math.max(0, Math.floor(Number(row.stok) || 0));
            const harga_modal = to_cents(row.harga_modal);
            const harga_jual = to_cents(row.harga_jual);

            if (harga_modal <= 0) { skipped++; errors.push({ row: i + 1, message: "Harga modal tidak valid." }); continue; }
            if (harga_jual <= 0) { skipped++; errors.push({ row: i + 1, message: "Harga jual tidak valid." }); continue; }

            const kategori_name = (row.kategori || "").toString().trim() || "Umum";
            let kategori_barang_id = kat_map.get(kategori_name.toLowerCase());
            if (!kategori_barang_id) {
                const [new_kat] = await db.insert(schema.kategori_barang).values({
                    nama_kategori: kategori_name,
                    created_ms: now,
                    modified_ms: now
                }).returning();
                kategori_barang_id = Number(new_kat.id);
                kat_map.set(kategori_name.toLowerCase(), kategori_barang_id);
            }

            let existing_id: number | undefined;
            if (barcode_barang && by_barcode.has(barcode_barang)) existing_id = by_barcode.get(barcode_barang);
            else existing_id = by_nama.get(nama_barang.toLowerCase());

            if (existing_id) {
                await db.update(schema.barang).set({
                    nama_barang,
                    stok_barang,
                    kategori_barang_id,
                    harga_modal,
                    harga_jual,
                    barcode_barang,
                    modified_ms: now
                }).where(eq(schema.barang.id, existing_id));

                updated++;
                by_nama.set(nama_barang.toLowerCase(), existing_id);
                if (barcode_barang) by_barcode.set(barcode_barang, existing_id);
            } else {
                const [result] = await db.insert(schema.barang).values({
                    nama_barang,
                    stok_barang,
                    kategori_barang_id,
                    harga_modal,
                    harga_jual,
                    barcode_barang,
                    created_ms: now,
                    modified_ms: now
                }).returning();

                const new_id = Number(result.id);
                created++;
                by_nama.set(nama_barang.toLowerCase(), new_id);
                if (barcode_barang) by_barcode.set(barcode_barang, new_id);
            }
        } catch (e: any) {
            skipped++;
            if (e && (e.message || "").toLowerCase().includes("unique")) {
                errors.push({ row: i + 1, message: "Barcode sudah dipakai barang lain." });
            } else {
                errors.push({ row: i + 1, message: "Gagal menyimpan baris." });
            }
        }
    }

    global.sse_clients.broadcast(JSON.stringify({
        type: 2,
        code: "UPDATE_BARANG",
        data: { created, updated, skipped }
    }));

    return new Response(JSON.stringify({ created, updated, skipped, errors }), {status: 200});
}
