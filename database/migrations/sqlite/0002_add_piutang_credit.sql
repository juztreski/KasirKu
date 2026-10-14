CREATE TABLE `pembayaran_piutang` (
	`id` integer PRIMARY KEY NOT NULL,
	`penjualan_id` integer NOT NULL,
	`jumlah_bayar` integer NOT NULL,
	`catatan` text,
	`tanggal_key` integer NOT NULL,
	`created_ms` integer NOT NULL,
	`modified_ms` integer NOT NULL,
	FOREIGN KEY (`penjualan_id`) REFERENCES `penjualan`(`id`) ON UPDATE cascade ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `pembayaran_piutang_penjualan_id_idx` ON `pembayaran_piutang` (`penjualan_id`);--> statement-breakpoint
ALTER TABLE `penjualan` ADD `metode_bayar` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `penjualan` ADD `nama_pelanggan` text;--> statement-breakpoint
ALTER TABLE `penjualan` ADD `no_telepon_pelanggan` text;--> statement-breakpoint
ALTER TABLE `penjualan` ADD `jumlah_dibayar` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `penjualan` ADD `sisa_piutang` integer DEFAULT 0 NOT NULL;