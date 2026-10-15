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
import { check_image_type, check_sql_is_duplicate_error } from "../../utils/utils";

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

    const user_input = new URLSearchParams(await req.text());

    const nama_barang = <string>user_input.get("nama_barang");
    const stok_barang = Number(user_input.get("stok_barang"));
    const kategori_barang_id = Number(user_input.get("kategori_barang_id"));
    const harga_modal = Number(user_input.get("harga_modal"));
    const harga_jual = Number(user_input.get("harga_jual"));
    let barcode_barang = <string | null>user_input.get("barcode_barang");
    const gambar_barang = <string | null>user_input.get("gambar_barang");

    if (
        !nama_barang ||
        Number.isNaN(kategori_barang_id) || !kategori_barang_id ||
        Number.isNaN(stok_barang) ||
        Number.isNaN(harga_modal) || !harga_modal ||
        Number.isNaN(harga_jual) || !harga_jual
    ) return new Response("Bad Request", {status: 400});

    if (!barcode_barang || !barcode_barang.length) barcode_barang = null;

    // Validasi gambar (base64) sebelum insert agar tidak menyisakan data parsial
    let gambar_buffer: Buffer | null = null;
    let gambar_type: "jpg" | "png" | false = false;
    if (gambar_barang && gambar_barang !== "null" && gambar_barang.length) {
        gambar_buffer = Buffer.from(gambar_barang, "base64");
        gambar_type = check_image_type(gambar_buffer);
        if (!gambar_type) return new Response("Gambar tidak valid. Hanya format JPG atau PNG yang didukung.", {status: 400});
    }

    const now = Date.now();
    let last_row;
    try {
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
        last_row = Number(result.id);
    } catch (e) {
        if (check_sql_is_duplicate_error(e)) return new Response("1", {status: 403});
        console.log("An error occured in POST Method at /barang:", e);
        return new Response("Internal Server Error", { status: 500 });
    }

    if (!last_row) return new Response("Internal Server Error", { status: 500 });

    let gambar_path: string | null = null;
    if (gambar_buffer && gambar_type) {
        gambar_path = `/barang_img/${last_row}.${gambar_type}`;
        await Bun.write(`barang_img/${last_row}.${gambar_type}`, gambar_buffer);
        await db.update(schema.barang)
            .set({ gambar_barang: gambar_path })
            .where(eq(schema.barang.id, last_row))
        .execute();
    }

    global.sse_clients.broadcast(JSON.stringify({
        type: 2,
        code: "TAMBAH_BARANG",
        data: {
            id: last_row,
            nama_barang,
            stok_barang,
            kategori_barang_id,
            harga_modal,
            harga_jual,
            barcode_barang,
            gambar_barang: gambar_path,
            created_ms: now,
            modified_ms: now
        }
    }));

    return new Response("", {status: 200});
}