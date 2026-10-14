CREATE TABLE "pembayaran_piutang" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "pembayaran_piutang_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"penjualan_id" integer NOT NULL,
	"jumlah_bayar" integer NOT NULL,
	"catatan" text,
	"tanggal_key" integer NOT NULL,
	"created_ms" bigint NOT NULL,
	"modified_ms" bigint NOT NULL
);
--> statement-breakpoint
ALTER TABLE "penjualan" ADD COLUMN "metode_bayar" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "penjualan" ADD COLUMN "nama_pelanggan" text;--> statement-breakpoint
ALTER TABLE "penjualan" ADD COLUMN "no_telepon_pelanggan" text;--> statement-breakpoint
ALTER TABLE "penjualan" ADD COLUMN "jumlah_dibayar" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "penjualan" ADD COLUMN "sisa_piutang" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "pembayaran_piutang" ADD CONSTRAINT "pembayaran_piutang_penjualan_id_penjualan_id_fk" FOREIGN KEY ("penjualan_id") REFERENCES "public"."penjualan"("id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
CREATE INDEX "pembayaran_piutang_penjualan_id_idx" ON "pembayaran_piutang" USING btree ("penjualan_id");