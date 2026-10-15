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

import { global } from "../../global";
import { eq } from "drizzle-orm";

// Endpoint publik untuk katalog barang (tanpa login) — hanya menampilkan
// data aman untuk customer: nama, harga jual, gambar, dan kategori.
export default async function(req: Request, url: URL, user_info: any) {
    const db = global.database;
    const { barang, kategori_barang } = global.schema;

    const user_input = url.searchParams;

    const kategori_id = Number(user_input.get("kategori_id"));
    const q = (user_input.get("q") || "").trim();

    let baseQuery = db
        .select({
            id: barang.id,
            nama_barang: barang.nama_barang,
            harga_jual: barang.harga_jual,
            gambar_barang: barang.gambar_barang,
            kategori_barang_id: barang.kategori_barang_id,
            nama_kategori: kategori_barang.nama_kategori
        })
        .from(barang)
        .innerJoin(kategori_barang, eq(barang.kategori_barang_id, kategori_barang.id));

    let res;
    if (!Number.isNaN(kategori_id) && kategori_id) {
        res = await baseQuery.where(eq(barang.kategori_barang_id, kategori_id));
    } else {
        res = await baseQuery;
    }

    if (q) {
        const ql = q.toLowerCase();
        res = res.filter((r: any) =>
            r.nama_barang.toLowerCase().includes(ql) ||
            r.nama_kategori.toLowerCase().includes(ql)
        );
    }

    return new Response(JSON.stringify(res), {
        status: 200,
        headers: {
            "Content-Type": "application/json"
        }
    });
}
