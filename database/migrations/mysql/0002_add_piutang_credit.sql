CREATE TABLE `pembayaran_piutang` (
	`id` int AUTO_INCREMENT NOT NULL,
	`penjualan_id` int NOT NULL,
	`jumlah_bayar` int NOT NULL,
	`catatan` text,
	`tanggal_key` int NOT NULL,
	`created_ms` bigint NOT NULL,
	`modified_ms` bigint NOT NULL,
	CONSTRAINT `pembayaran_piutang_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
ALTER TABLE `penjualan` ADD `metode_bayar` int DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `penjualan` ADD `nama_pelanggan` text;--> statement-breakpoint
ALTER TABLE `penjualan` ADD `no_telepon_pelanggan` text;--> statement-breakpoint
ALTER TABLE `penjualan` ADD `jumlah_dibayar` int DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `penjualan` ADD `sisa_piutang` int DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `pembayaran_piutang` ADD CONSTRAINT `pembayaran_piutang_penjualan_id_penjualan_id_fk` FOREIGN KEY (`penjualan_id`) REFERENCES `penjualan`(`id`) ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
CREATE INDEX `pembayaran_piutang_penjualan_id_idx` ON `pembayaran_piutang` (`penjualan_id`);