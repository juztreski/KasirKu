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
import { unlink } from "node:fs/promises";
import { global } from "../../global";
import { check_image_type, check_sql_is_duplicate_error } from "../../utils/utils";

export default async function(req: Request, token: string) {
    const user_info = await global.user_sessions.get(token);
    if (!token || !user_info) return new Response("Unauthorized", {status: 401});

    const db = global.database;
    const { roles, barang } = global.schema;
    const res_role = await db.select({ permission_level: roles.permission_level }).from(roles).where(eq(roles.id, user_info.role_id)).limit(1).then((r: any) => r[0]);
    if (!res_role) return new Response("Internal Server Error", {status: 500});

    if (!(
        res_role.permission_level & (
            global.permissions.ADMINISTRATOR |
            global.permissions.MANAGE_BARANG
        )
    )) return new Response("0", {status: 403});

    const user_input = new URLSearchParams(await req.text());

    const id = Number(user_input.get("id"));
    const nama_barang = <string>user_input.get("nama_barang");
    const stok_barang = Number(user_input.get("stok_barang"));
    const kategori_barang_id = Number(user_input.get("kategori_barang_id"));
    const harga_modal = Number(user_input.get("harga_modal"));
    const harga_jual = Number(user_input.get("harga_jual"));
    let barcode_barang = <string | null>user_input.get("barcode_barang");

    if (
        Number.isNaN(id) || !id ||
        !nama_barang ||
        Number.isNaN(stok_barang) ||
        Number.isNaN(kategori_barang_id) || !kategori_barang_id ||
        Number.isNaN(harga_modal) || !harga_modal ||
        Number.isNaN(harga_jual) || !harga_jual
    ) return new Response("Bad Request", {status: 400});

    if (!barcode_barang || !barcode_barang.length) barcode_barang = null;

    // gambar_barang: tidak dikirim = tanpa perubahan, "null" = hapus gambar, base64 = ganti gambar
    const gambar_input = user_input.get("gambar_barang");

    let gambar_buffer: Buffer | null = null;
    let gambar_type: "jpg" | "png" | false = false;
    if (gambar_input && gambar_input !== "null" && gambar_input.length) {
        gambar_buffer = Buffer.from(gambar_input, "base64");
        gambar_type = check_image_type(gambar_buffer);
        if (!gambar_type) return new Response("Gambar tidak valid. Hanya format JPG atau PNG yang didukung.", {status: 400});
    }

    const [existing_barang] = await db
        .select({gambar_barang: barang.gambar_barang})
        .from(barang)
        .where(eq(barang.id, id))
    .limit(1);

    if (!existing_barang) return new Response("Not Found", {status: 404});

    const now = Date.now();
    try {
        const update_data: any = {
            nama_barang,
            stok_barang,
            kategori_barang_id,
            harga_modal,
            harga_jual,
            barcode_barang,
            modified_ms: now
        };

        let gambar_path: string | null = null;
        let remove_gambar_file: string | null = null;

        if (gambar_input === "null") {
            update_data.gambar_barang = null;
            remove_gambar_file = existing_barang.gambar_barang;
        } else if (gambar_buffer && gambar_type) {
            gambar_path = `/barang_img/${id}.${gambar_type}`;
            update_data.gambar_barang = gambar_path;
            remove_gambar_file = existing_barang.gambar_barang;
        }

        await db
        .update(barang)
        .set(update_data)
        .where(eq(barang.id, id))
        .execute();

        if (gambar_buffer && gambar_type) {
            await Bun.write(`barang_img/${id}.${gambar_type}`, gambar_buffer);
        }

        // Bersihkan file gambar lama (path lama ≠ path baru)
        if (remove_gambar_file && remove_gambar_file !== gambar_path) {
            try { await unlink(remove_gambar_file.slice(1)); } catch {}
        }
    } catch(e) {
        if (check_sql_is_duplicate_error(e)) return new Response("1", {status: 403});
        console.log("An error occured in PATCH Method at /barang:", e)
        return new Response("Internal Server Error", {status: 500});
    }
    
    global.sse_clients.broadcast(JSON.stringify({
        type: 2,
        code: "UPDATE_BARANG",
        data: {
            id,
            nama_barang,
            stok_barang,
            kategori_barang_id,
            harga_modal,
            harga_jual,
            barcode_barang,
            modified_ms: now
        }
    }));

    return new Response("", {status: 200});
}