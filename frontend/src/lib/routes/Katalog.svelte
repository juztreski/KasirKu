<svelte:head>
    <title>{auth.publicInfo.name || 'KasirKu'} | Katalog Produk</title>
    <meta name="description" content="Katalog produk {auth.publicInfo.name || 'KasirKu'} — lihat nama, foto, dan harga jual produk kami." />
</svelte:head>

<script lang="ts">
  import { onMount } from 'svelte';
  import { api } from '../api/api';
  import { auth } from '../stores/auth.svelte';
  import { router } from '../stores/router.svelte';
  import Input from '../components/ui/Input.svelte';
  import Skeleton from '../components/ui/Skeleton.svelte';
  import ImagePreviewModal from '../components/ui/ImagePreviewModal.svelte';
  import ThemeToggle from '../components/layout/ThemeToggle.svelte';
  import { formatRupiah } from '../utils/format';
  import {
    Store,
    Search,
    Image as ImageIcon,
    Tag,
    PackageOpen,
    LayoutGrid,
    LogIn,
    ZoomIn
  } from 'lucide-svelte';

  interface KatalogItem {
    id: number;
    nama_barang: string;
    harga_jual: number;
    gambar_barang: string | null;
    kategori_barang_id: number;
    nama_kategori: string;
  }

  let items = $state<KatalogItem[]>([]);
  let loading = $state(true);
  let searchQuery = $state('');
  let selectedKategori = $state<number | 'all'>('all');
  let loadError = $state<string | null>(null);
  let previewItem = $state<KatalogItem | null>(null);
  let previewOpen = $state(false);

  const kategoriList = $derived.by(() => {
    const map = new Map<number, string>();
    for (const item of items) {
      if (!map.has(item.kategori_barang_id)) {
        map.set(item.kategori_barang_id, item.nama_kategori);
      }
    }
    return [...map.entries()].map(([id, nama]) => ({ id, nama }));
  });

  const filteredItems = $derived.by(() => {
    let list = items;
    if (selectedKategori !== 'all') {
      list = list.filter((i) => i.kategori_barang_id === selectedKategori);
    }
    const q = searchQuery.trim().toLowerCase();
    if (q) {
      list = list.filter(
        (i) =>
          i.nama_barang.toLowerCase().includes(q) ||
          i.nama_kategori.toLowerCase().includes(q)
      );
    }
    return list;
  });

  async function loadKatalog() {
    loading = true;
    loadError = null;
    try {
      const res = await api.get<KatalogItem[]>('/api/katalog');
      items = Array.isArray(res) ? res : [];
    } catch (err: any) {
      loadError = err.message || 'Gagal memuat katalog produk.';
      items = [];
    } finally {
      loading = false;
    }
  }

  onMount(() => {
    loadKatalog();
    if (auth.isAuthenticated) auth.fetchPublicInfo();
  });
</script>

<div class="min-h-screen w-full bg-[var(--bg-canvas)]">
  <!-- Header -->
  <header class="border-b border-neutral-200/80 dark:border-neutral-800 bg-[var(--bg-surface)]">
    <div class="max-w-5xl mx-auto px-4 sm:px-6 py-4 flex items-center justify-between gap-3">
      <div class="flex items-center gap-3 min-w-0">
        <div class="w-9 h-9 shrink-0 rounded-lg bg-[var(--brand)] text-[var(--accent-fg)] flex items-center justify-center">
          <Store class="w-5 h-5" />
        </div>
        <div class="min-w-0">
          <h1 class="text-sm sm:text-base font-bold text-neutral-900 dark:text-neutral-100 truncate">
            {auth.publicInfo.name || 'KasirKu'}
          </h1>
          {#if auth.publicInfo.desc}
            <p class="text-[11px] text-neutral-500 truncate">{auth.publicInfo.desc}</p>
          {/if}
        </div>
      </div>

      <div class="flex items-center gap-1.5 shrink-0">
        <ThemeToggle />
        {#if !auth.isAuthenticated}
          <button
            type="button"
            onclick={() => router.navigate('/login')}
            class="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md border border-neutral-200 dark:border-neutral-700 text-xs font-medium text-neutral-600 dark:text-neutral-300 hover:bg-[var(--bg-hover)] transition-colors"
          >
            <LogIn class="w-3.5 h-3.5" />
            <span class="hidden sm:inline">Masuk</span>
          </button>
        {/if}
      </div>
    </div>
  </header>

  <main class="max-w-5xl mx-auto px-4 sm:px-6 py-6 space-y-5">
    <!-- Search & Filter -->
    <div class="space-y-3">
      <div class="relative">
        <Input
          bind:value={searchQuery}
          placeholder="Cari nama produk atau kategori..."
          clearable
        >
          {#snippet prefix()}
            <Search class="w-4 h-4" />
          {/snippet}
        </Input>
      </div>

      {#if kategoriList.length > 1}
        <div class="flex items-center gap-1.5 overflow-x-auto pb-1">
          <button
            type="button"
            class="px-3 py-1.5 rounded-full text-xs font-medium transition-colors border whitespace-nowrap {selectedKategori === 'all' ? 'bg-[var(--brand)] text-[var(--accent-fg)] border-transparent' : 'border-neutral-200 dark:border-neutral-800 hover:bg-[var(--bg-hover)] text-neutral-700 dark:text-neutral-300'}"
            onclick={() => (selectedKategori = 'all')}
          >
            <span class="inline-flex items-center gap-1">
              <LayoutGrid class="w-3 h-3" />
              Semua
            </span>
          </button>
          {#each kategoriList as kat (kat.id)}
            <button
              type="button"
              class="px-3 py-1.5 rounded-full text-xs font-medium transition-colors border whitespace-nowrap {selectedKategori === kat.id ? 'bg-[var(--brand)] text-[var(--accent-fg)] border-transparent' : 'border-neutral-200 dark:border-neutral-800 hover:bg-[var(--bg-hover)] text-neutral-700 dark:text-neutral-300'}"
              onclick={() => (selectedKategori = kat.id)}
            >
              {kat.nama}
            </button>
          {/each}
        </div>
      {/if}
    </div>

    <!-- Product Grid -->
    {#if loading}
      <div class="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3 sm:gap-4">
        {#each Array(8) as _}
          <div class="rounded-lg border border-neutral-200 dark:border-neutral-800 bg-[var(--bg-surface)] overflow-hidden">
            <Skeleton class="w-full aspect-square rounded-none" />
            <div class="p-3 space-y-2">
              <Skeleton class="h-3.5 w-3/4" />
              <Skeleton class="h-3 w-1/2" />
            </div>
          </div>
        {/each}
      </div>
    {:else if loadError}
      <div class="py-16 text-center">
        <div class="inline-flex p-3 rounded-full bg-red-100 dark:bg-red-950/40 text-red-500 mb-3">
          <PackageOpen class="w-8 h-8" />
        </div>
        <p class="text-sm font-medium text-neutral-700 dark:text-neutral-300">Gagal memuat katalog</p>
        <p class="text-xs text-neutral-500 mt-1">{loadError}</p>
        <button
          type="button"
          onclick={loadKatalog}
          class="mt-4 px-3.5 py-1.5 rounded-md border text-xs font-medium hover:bg-[var(--bg-hover)] text-neutral-700 dark:text-neutral-300 border-neutral-200 dark:border-neutral-700"
        >
          Coba Lagi
        </button>
      </div>
    {:else if filteredItems.length === 0}
      <div class="py-16 text-center">
        <div class="inline-flex p-3 rounded-full bg-neutral-100 dark:bg-neutral-800/60 text-neutral-400 mb-3">
          <Search class="w-8 h-8" />
        </div>
        <p class="text-sm font-medium text-neutral-600 dark:text-neutral-400">Produk tidak ditemukan</p>
        <p class="text-xs text-neutral-500 mt-1">
          {searchQuery ? `Tidak ada produk dengan kata kunci "${searchQuery}".` : 'Belum ada produk di katalog ini.'}
        </p>
      </div>
    {:else}
      <div class="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3 sm:gap-4">
        {#each filteredItems as item (item.id)}
          <div class="group rounded-lg border border-neutral-200 dark:border-neutral-800 bg-[var(--bg-surface)] overflow-hidden hover:shadow-md transition-shadow">
            <div class="aspect-square bg-neutral-100 dark:bg-neutral-900/60 flex items-center justify-center overflow-hidden">
              {#if item.gambar_barang}
                <button
                  type="button"
                  onclick={() => { previewItem = item; previewOpen = true; }}
                  title="Perbesar foto {item.nama_barang}"
                  aria-label="Perbesar foto {item.nama_barang}"
                  class="w-full h-full relative group/photo cursor-zoom-in"
                >
                  <img
                    src={item.gambar_barang}
                    alt={item.nama_barang}
                    loading="lazy"
                    class="w-full h-full object-cover group-hover/photo:scale-105 transition-transform duration-300"
                  />
                  <span class="absolute bottom-1.5 right-1.5 p-1 rounded-full bg-black/50 text-white/90 opacity-0 group-hover/photo:opacity-100 transition-opacity">
                    <ZoomIn class="w-3.5 h-3.5" />
                  </span>
                </button>
              {:else}
                <ImageIcon class="w-10 h-10 text-neutral-300 dark:text-neutral-600" />
              {/if}
            </div>
            <div class="p-3 space-y-1.5">
              <h2 class="text-xs sm:text-sm font-semibold text-neutral-900 dark:text-neutral-100 leading-snug line-clamp-2">
                {item.nama_barang}
              </h2>
              <span class="inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded border border-neutral-200 dark:border-neutral-700 bg-neutral-50 dark:bg-neutral-800/60 text-neutral-500 dark:text-neutral-400">
                <Tag class="w-2.5 h-2.5" />
                {item.nama_kategori}
              </span>
              <div class="text-sm font-bold text-neutral-900 dark:text-neutral-100 tabular-nums">
                {formatRupiah(item.harga_jual)}
              </div>
            </div>
          </div>
        {/each}
      </div>
    {/if}

    {#if !loading && !loadError && filteredItems.length > 0}
      <p class="text-center text-[11px] text-neutral-400 pt-2">
        {filteredItems.length} produk ditampilkan
      </p>
    {/if}
  </main>

  <footer class="border-t border-neutral-200/80 dark:border-neutral-800 py-4 mt-6">
    <p class="text-center text-[11px] text-neutral-400">
      {auth.publicInfo.name || 'KasirKu'} &middot; Katalog Produk
      {#if auth.publicInfo.address}
        &middot; {auth.publicInfo.address}
      {/if}
    </p>
  </footer>
</div>

<ImagePreviewModal
  bind:open={previewOpen}
  src={previewItem?.gambar_barang ?? null}
  name={previewItem?.nama_barang ?? ''}
  price={previewItem ? formatRupiah(previewItem.harga_jual) : ''}
  onclose={() => (previewItem = null)}
/>
