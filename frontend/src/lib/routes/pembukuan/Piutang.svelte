<svelte:head>
    <title>KasirKu | Piutang (Pembukuan)</title>
</svelte:head>

<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import { api } from '../../api/api';
  import { toast } from '../../stores/toast.svelte';
  import { confirmDialog } from '../../stores/dialog.svelte';
  import { sse } from '../../stores/sse.svelte';
  import Button from '../../components/ui/Button.svelte';
  import Input from '../../components/ui/Input.svelte';
  import Modal from '../../components/ui/Modal.svelte';
  import Badge from '../../components/ui/Badge.svelte';
  import Skeleton from '../../components/ui/Skeleton.svelte';
  import DatePicker from '../../components/ui/DatePicker.svelte';
  import TablePagination from '../../components/ui/TablePagination.svelte';
  import {
    formatRupiah,
    formatIDR,
    parseIDR,
    formatNumber,
    formatDate,
    formatDateTime,
    getTanggalKey
  } from '../../utils/format';
  import {
    HandCoins,
    Search,
    RefreshCw,
    Wallet,
    Users,
    ReceiptText,
    History,
    Trash2,
    CheckCircle2,
    AlertCircle,
    Phone,
    User,
    ArrowUpDown,
    ArrowUp,
    ArrowDown
  } from 'lucide-svelte';

  interface PiutangItem {
    id: number;
    kasir_id: number;
    no_struk: string;
    total_barang: number;
    total_harga_modal: number;
    total_harga_jual: number;
    metode_bayar: number;
    nama_pelanggan: string | null;
    no_telepon_pelanggan: string | null;
    jumlah_dibayar: number;
    sisa_piutang: number;
    tanggal_key: number;
    created_ms: number;
    modified_ms: number;
    nama_kasir: string | null;
  }

  interface PembayaranItem {
    id: number;
    penjualan_id: number;
    jumlah_bayar: number;
    catatan: string | null;
    tanggal_key: number;
    created_ms: number;
  }

  let piutangList = $state<PiutangItem[]>([]);
  let totalPiutang = $state(0);
  let loading = $state(true);
  let searchQuery = $state('');
  let statusFilter = $state<'belum' | 'lunas' | 'all'>('belum');

  // Date range filter
  const todayDateStr = formatDate(new Date());
  let filterPreset = $state<'all' | 'today' | 'week' | 'month' | 'custom'>('all');
  let startDate = $state(todayDateStr);
  let endDate = $state(todayDateStr);

  // Sorting
  let sortField = $state<'created_ms' | 'sisa_piutang' | 'nama_pelanggan' | 'total_harga_jual'>('created_ms');
  let sortAsc = $state(false);

  // Payment modal
  let payModalOpen = $state(false);
  let selectedSale = $state<PiutangItem | null>(null);
  let formNominal = $state('');
  let formCatatan = $state('');
  let nominalError = $state<string | null>(null);
  let formErrorMessage = $state<string | null>(null);
  let isSubmitting = $state(false);

  // History modal
  let historyModalOpen = $state(false);
  let historySale = $state<PiutangItem | null>(null);
  let historyList = $state<PembayaranItem[]>([]);
  let historyLoading = $state(false);

  function applyPreset(preset: 'all' | 'today' | 'week' | 'month') {
    filterPreset = preset;
    const now = new Date();
    endDate = formatDate(now);

    if (preset === 'all') {
      startDate = '2000-01-01';
      endDate = '2999-12-31';
    } else if (preset === 'today') {
      startDate = endDate;
    } else if (preset === 'week') {
      const d = new Date(now);
      d.setDate(d.getDate() - 6);
      startDate = formatDate(d);
    } else if (preset === 'month') {
      const d = new Date(now.getFullYear(), now.getMonth(), 1);
      startDate = formatDate(d);
    }
    fetchData();
  }

  function setStatus(status: 'belum' | 'lunas' | 'all') {
    statusFilter = status;
    fetchData();
  }

  async function fetchData() {
    loading = true;
    try {
      let url = `/api/piutang?status=${statusFilter}`;
      if (filterPreset !== 'all') {
        url += `&tanggal_start=${getTanggalKey(startDate)}&tanggal_end=${getTanggalKey(endDate)}`;
      }
      const res = await api.get<any>(url);
      const parsed = typeof res === 'string' ? JSON.parse(res) : res;
      piutangList = Array.isArray(parsed?.data) ? parsed.data : [];
      totalPiutang = Number(parsed?.total_piutang) || 0;
    } catch (err: any) {
      toast.error('Gagal memuat daftar piutang: ' + (err.message || ''));
      piutangList = [];
      totalPiutang = 0;
    } finally {
      loading = false;
    }
  }

  function toggleSort(field: typeof sortField) {
    if (sortField === field) {
      sortAsc = !sortAsc;
    } else {
      sortField = field;
      sortAsc = false;
    }
  }

  let filteredList = $derived.by(() => {
    let list = [...piutangList];
    const q = searchQuery.trim().toLowerCase();
    if (q) {
      list = list.filter(
        (item) =>
          (item.nama_pelanggan || '').toLowerCase().includes(q) ||
          (item.no_struk || '').toLowerCase().includes(q) ||
          (item.no_telepon_pelanggan || '').toLowerCase().includes(q)
      );
    }

    list.sort((a, b) => {
      let va: any = a[sortField] ?? '';
      let vb: any = b[sortField] ?? '';
      if (typeof va === 'string') va = va.toLowerCase();
      if (typeof vb === 'string') vb = vb.toLowerCase();
      if (va < vb) return sortAsc ? -1 : 1;
      if (va > vb) return sortAsc ? 1 : -1;
      return 0;
    });

    return list;
  });

  let totalTransaksiBelum = $derived(piutangList.filter((i) => Number(i.sisa_piutang) > 0).length);
  let totalPelanggan = $derived(new Set(piutangList.filter((i) => Number(i.sisa_piutang) > 0).map((i) => (i.nama_pelanggan || '').trim().toLowerCase())).size);
  let avgPiutang = $derived(totalTransaksiBelum > 0 ? Math.round(totalPiutang / totalTransaksiBelum) : 0);

  // Pagination
  let currentPage = $state(1);
  let pageSize = $state(10);
  const paginatedList = $derived(
    filteredList.slice((currentPage - 1) * pageSize, currentPage * pageSize)
  );
  const totalPages = $derived(Math.ceil(filteredList.length / pageSize) || 1);

  $effect(() => {
    void searchQuery;
    void statusFilter;
    void startDate;
    void endDate;
    currentPage = 1;
  });

  function openPayModal(item: PiutangItem) {
    selectedSale = item;
    formNominal = '';
    formCatatan = '';
    nominalError = null;
    formErrorMessage = null;
    payModalOpen = true;
  }

  function setNominalLunas() {
    if (!selectedSale) return;
    formNominal = formatIDR(Number(selectedSale.sisa_piutang) || 0);
    nominalError = null;
  }

  async function handlePay() {
    if (!selectedSale) return;
    formErrorMessage = null;
    nominalError = null;

    const nominalNum = parseIDR(formNominal);
    const sisa = Number(selectedSale.sisa_piutang) || 0;

    if (nominalNum <= 0) {
      nominalError = 'Nominal pembayaran harus lebih besar dari Rp0,00.';
      return;
    }
    if (nominalNum > sisa) {
      nominalError = `Nominal melebihi sisa piutang (${formatRupiah(sisa)}).`;
      return;
    }

    isSubmitting = true;
    try {
      await api.post('/bayar_piutang', {
        penjualan_id: selectedSale.id,
        jumlah_bayar: nominalNum,
        catatan: formCatatan.trim() || null,
      });
      toast.success(`Pembayaran piutang sebesar ${formatRupiah(nominalNum)} berhasil dicatat.`);
      payModalOpen = false;
      await fetchData();
    } catch (err: any) {
      if (err.status === 400 && err.message === '1') {
        formErrorMessage = 'Nominal melebihi sisa piutang.';
      } else if (err.status === 400 && err.message === '2') {
        formErrorMessage = 'Transaksi ini bukan transaksi kredit.';
      } else {
        formErrorMessage = err.message || 'Gagal menyimpan pembayaran piutang.';
      }
    } finally {
      isSubmitting = false;
    }
  }

  async function openHistory(item: PiutangItem) {
    historySale = item;
    historyModalOpen = true;
    historyLoading = true;
    historyList = [];
    try {
      const res = await api.get<any>(`/api/pembayaran_piutang?penjualan_id=${item.id}`);
      const parsed = typeof res === 'string' ? JSON.parse(res) : res;
      historyList = Array.isArray(parsed) ? parsed : [];
    } catch (err: any) {
      toast.error('Gagal memuat riwayat pembayaran: ' + (err.message || ''));
    } finally {
      historyLoading = false;
    }
  }

  async function handleDeletePayment(payment: PembayaranItem) {
    if (!historySale) return;
    const confirmed = await confirmDialog({
      title: 'Hapus Pembayaran Piutang?',
      message: `Apakah Anda yakin ingin menghapus pembayaran sebesar ${formatRupiah(payment.jumlah_bayar)}? Sisa piutang pelanggan akan bertambah kembali.`,
      confirmText: 'Ya, Hapus',
      cancelText: 'Batal',
      variant: 'danger',
    });

    if (!confirmed) return;

    try {
      await api.delete('/pembayaran_piutang', {
        id: payment.id,
        penjualan_id: historySale.id,
      });
      toast.success('Pembayaran piutang berhasil dihapus.');
      await openHistory(historySale);
      await fetchData();
    } catch (err: any) {
      toast.error('Gagal menghapus pembayaran: ' + (err.message || ''));
    }
  }

  let unsubscribeSSE: (() => void) | null = null;

  onMount(() => {
    filterPreset = 'all';
    startDate = '2000-01-01';
    endDate = '2999-12-31';
    fetchData();

    unsubscribeSSE = sse.subscribe((event) => {
      if (event.type === 6) {
        fetchData();
      }
    });
  });

  onDestroy(() => {
    unsubscribeSSE?.();
  });
</script>

<div class="space-y-6">
  <!-- Page Header -->
  <div class="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-neutral-200/80 dark:border-neutral-800 pb-4">
    <div class="flex items-center gap-2.5">
      <h1 class="text-xl font-bold tracking-tight text-neutral-900 dark:text-neutral-100 flex items-center gap-2">
        <HandCoins class="w-5 h-5 text-neutral-600 dark:text-neutral-400" />
        <span>Piutang Pelanggan</span>
      </h1>
    </div>

    <div class="flex items-center gap-2">
      <Button
        variant="secondary"
        size="sm"
        onclick={fetchData}
        loading={loading}
        title="Refresh Data"
      >
        <RefreshCw class="w-3.5 h-3.5" />
        <span class="hidden sm:inline">Refresh</span>
      </Button>
    </div>
  </div>

  <!-- Summary Cards -->
  <div class="grid grid-cols-1 sm:grid-cols-3 gap-3.5">
    <div class="p-4 rounded-md border border-[var(--border-subtle)] bg-[var(--bg-surface)] flex items-center justify-between gap-3">
      <div>
        <span class="text-xs font-medium text-[var(--text-muted)]">Total Piutang Belum Lunas</span>
        <div class="text-xl font-bold tabular-nums text-amber-600 dark:text-amber-400 mt-1">
          {formatRupiah(totalPiutang)}
        </div>
      </div>
      <div class="w-9 h-9 rounded-lg bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20 flex items-center justify-center shrink-0">
        <Wallet class="w-4.5 h-4.5" />
      </div>
    </div>

    <div class="p-4 rounded-md border border-[var(--border-subtle)] bg-[var(--bg-surface)] flex items-center justify-between gap-3">
      <div>
        <span class="text-xs font-medium text-[var(--text-muted)]">Transaksi Belum Lunas</span>
        <div class="text-xl font-bold tabular-nums text-[var(--text-primary)] mt-1">
          {formatNumber(totalTransaksiBelum)} <span class="text-xs font-normal text-[var(--text-muted)]">transaksi</span>
        </div>
      </div>
      <div class="w-9 h-9 rounded-lg bg-neutral-100 dark:bg-neutral-800 text-neutral-700 dark:text-neutral-300 border border-neutral-200 dark:border-neutral-700/80 flex items-center justify-center shrink-0">
        <ReceiptText class="w-4.5 h-4.5" />
      </div>
    </div>

    <div class="p-4 rounded-md border border-[var(--border-subtle)] bg-[var(--bg-surface)] flex items-center justify-between gap-3">
      <div>
        <span class="text-xs font-medium text-[var(--text-muted)]">Pelanggan Berhutang</span>
        <div class="text-xl font-bold tabular-nums text-[var(--text-primary)] mt-1">
          {formatNumber(totalPelanggan)} <span class="text-xs font-normal text-[var(--text-muted)]">pelanggan</span>
        </div>
      </div>
      <div class="w-9 h-9 rounded-lg bg-neutral-100 dark:bg-neutral-800 text-neutral-700 dark:text-neutral-300 border border-neutral-200 dark:border-neutral-700/80 flex items-center justify-center shrink-0">
        <Users class="w-4.5 h-4.5" />
      </div>
    </div>
  </div>

  <!-- Filter & Controls Toolbar -->
  <div class="space-y-3">
    <div class="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
      <!-- Quick Date Presets -->
      <div class="flex items-center gap-1.5 overflow-x-auto">
        <span class="text-xs font-medium text-neutral-500 mr-1 hidden sm:inline">Periode:</span>
        <button
          type="button"
          class="px-3 py-1.5 rounded-md text-xs font-medium transition-colors border {filterPreset === 'all' ? 'bg-[var(--brand)] text-[var(--accent-fg)] border-transparent' : 'border-neutral-200 dark:border-neutral-800 hover:bg-[var(--bg-hover)] text-neutral-700 dark:text-neutral-300'}"
          onclick={() => applyPreset('all')}
        >
          Semua Waktu
        </button>
        <button
          type="button"
          class="px-3 py-1.5 rounded-md text-xs font-medium transition-colors border {filterPreset === 'today' ? 'bg-[var(--brand)] text-[var(--accent-fg)] border-transparent' : 'border-neutral-200 dark:border-neutral-800 hover:bg-[var(--bg-hover)] text-neutral-700 dark:text-neutral-300'}"
          onclick={() => applyPreset('today')}
        >
          Hari Ini
        </button>
        <button
          type="button"
          class="px-3 py-1.5 rounded-md text-xs font-medium transition-colors border {filterPreset === 'week' ? 'bg-[var(--brand)] text-[var(--accent-fg)] border-transparent' : 'border-neutral-200 dark:border-neutral-800 hover:bg-[var(--bg-hover)] text-neutral-700 dark:text-neutral-300'}"
          onclick={() => applyPreset('week')}
        >
          7 Hari
        </button>
        <button
          type="button"
          class="px-3 py-1.5 rounded-md text-xs font-medium transition-colors border {filterPreset === 'month' ? 'bg-[var(--brand)] text-[var(--accent-fg)] border-transparent' : 'border-neutral-200 dark:border-neutral-800 hover:bg-[var(--bg-hover)] text-neutral-700 dark:text-neutral-300'}"
          onclick={() => applyPreset('month')}
        >
          Bulan Ini
        </button>
      </div>

      <!-- Custom Date Range -->
      <div class="flex items-center gap-2 text-xs">
        <div class="flex items-center gap-1.5">
          <DatePicker
            bind:value={startDate}
            placeholder="Mulai tanggal"
            align="left"
            onchange={() => { filterPreset = 'custom'; fetchData(); }}
          />
          <span class="text-neutral-400">s/d</span>
          <DatePicker
            bind:value={endDate}
            placeholder="Sampai tanggal"
            align="right"
            onchange={() => { filterPreset = 'custom'; fetchData(); }}
          />
        </div>
      </div>
    </div>

    <!-- Search + Status Filter -->
    <div class="flex flex-col sm:flex-row sm:items-center gap-2.5">
      <div class="relative flex-1">
        <Input
          bind:value={searchQuery}
          placeholder="Cari nama pelanggan, no. struk, atau no. telepon..."
          clearable
        >
          {#snippet prefix()}
            <Search class="w-4 h-4 text-neutral-400" />
          {/snippet}
        </Input>
      </div>

      <div class="flex items-center gap-1.5 shrink-0">
        <button
          type="button"
          class="px-3 py-2 rounded-md text-xs font-medium transition-colors border {statusFilter === 'belum' ? 'bg-[var(--brand)] text-[var(--accent-fg)] border-transparent' : 'border-neutral-200 dark:border-neutral-800 hover:bg-[var(--bg-hover)] text-neutral-700 dark:text-neutral-300'}"
          onclick={() => setStatus('belum')}
        >
          Belum Lunas
        </button>
        <button
          type="button"
          class="px-3 py-2 rounded-md text-xs font-medium transition-colors border {statusFilter === 'lunas' ? 'bg-[var(--brand)] text-[var(--accent-fg)] border-transparent' : 'border-neutral-200 dark:border-neutral-800 hover:bg-[var(--bg-hover)] text-neutral-700 dark:text-neutral-300'}"
          onclick={() => setStatus('lunas')}
        >
          Lunas
        </button>
        <button
          type="button"
          class="px-3 py-2 rounded-md text-xs font-medium transition-colors border {statusFilter === 'all' ? 'bg-[var(--brand)] text-[var(--accent-fg)] border-transparent' : 'border-neutral-200 dark:border-neutral-800 hover:bg-[var(--bg-hover)] text-neutral-700 dark:text-neutral-300'}"
          onclick={() => setStatus('all')}
        >
          Semua
        </button>
      </div>
    </div>
  </div>

  <!-- Piutang Table Card -->
  <div class="rounded-md border border-[var(--border-subtle)] bg-[var(--bg-surface)] overflow-hidden">
    <div class="overflow-x-auto">
      <table class="w-full text-left text-xs border-collapse min-w-[850px]">
        <thead>
          <tr class="border-b border-[var(--border-subtle)] bg-[var(--bg-subtle)] text-[var(--text-muted)] font-medium text-[11px]">
            <th class="px-4 py-2.5">
              <button
                type="button"
                class="flex items-center gap-1 hover:text-[var(--text-primary)] transition-colors cursor-pointer select-none text-[11px] font-medium"
                onclick={() => toggleSort('created_ms')}
              >
                <span>Waktu</span>
                {#if sortField === 'created_ms'}
                  {#if sortAsc}<ArrowUp class="w-3 h-3 text-[var(--brand)]" />{:else}<ArrowDown class="w-3 h-3 text-[var(--brand)]" />{/if}
                {:else}<ArrowUpDown class="w-3 h-3 opacity-40" />{/if}
              </button>
            </th>
            <th class="px-4 py-2.5">No. Struk</th>
            <th class="px-4 py-2.5">
              <button
                type="button"
                class="flex items-center gap-1 hover:text-[var(--text-primary)] transition-colors cursor-pointer select-none text-[11px] font-medium"
                onclick={() => toggleSort('nama_pelanggan')}
              >
                <span>Pelanggan</span>
                {#if sortField === 'nama_pelanggan'}
                  {#if sortAsc}<ArrowUp class="w-3 h-3 text-[var(--brand)]" />{:else}<ArrowDown class="w-3 h-3 text-[var(--brand)]" />{/if}
                {:else}<ArrowUpDown class="w-3 h-3 opacity-40" />{/if}
              </button>
            </th>
            <th class="px-4 py-2.5 text-right">
              <button
                type="button"
                class="inline-flex items-center gap-1 hover:text-[var(--text-primary)] transition-colors cursor-pointer select-none ml-auto text-[11px] font-medium"
                onclick={() => toggleSort('total_harga_jual')}
              >
                <span>Total Belanja</span>
                {#if sortField === 'total_harga_jual'}
                  {#if sortAsc}<ArrowUp class="w-3 h-3 text-[var(--brand)]" />{:else}<ArrowDown class="w-3 h-3 text-[var(--brand)]" />{/if}
                {:else}<ArrowUpDown class="w-3 h-3 opacity-40" />{/if}
              </button>
            </th>
            <th class="px-4 py-2.5 text-right">Dibayar</th>
            <th class="px-4 py-2.5 text-right">
              <button
                type="button"
                class="inline-flex items-center gap-1 hover:text-[var(--text-primary)] transition-colors cursor-pointer select-none ml-auto text-[11px] font-medium"
                onclick={() => toggleSort('sisa_piutang')}
              >
                <span>Sisa Piutang</span>
                {#if sortField === 'sisa_piutang'}
                  {#if sortAsc}<ArrowUp class="w-3 h-3 text-[var(--brand)]" />{:else}<ArrowDown class="w-3 h-3 text-[var(--brand)]" />{/if}
                {:else}<ArrowUpDown class="w-3 h-3 opacity-40" />{/if}
              </button>
            </th>
            <th class="px-4 py-2.5 text-center w-40">Action</th>
          </tr>
        </thead>
        <tbody class="divide-y divide-[var(--border-subtle)]">
          {#if loading}
            {#each Array(5) as _}
              <tr class="h-12">
                <td class="px-4 py-3"><Skeleton class="h-4 w-28" /></td>
                <td class="px-4 py-3"><Skeleton class="h-4 w-24" /></td>
                <td class="px-4 py-3"><Skeleton class="h-4 w-32" /></td>
                <td class="px-4 py-3"><Skeleton class="h-4 w-24 ml-auto" /></td>
                <td class="px-4 py-3"><Skeleton class="h-4 w-20 ml-auto" /></td>
                <td class="px-4 py-3"><Skeleton class="h-4 w-24 ml-auto" /></td>
                <td class="px-4 py-3"><Skeleton class="h-4 w-24 mx-auto" /></td>
              </tr>
            {/each}
          {:else if paginatedList.length === 0}
            <tr>
              <td colspan="7" class="px-4 py-12 text-center text-neutral-400">
                <HandCoins class="w-8 h-8 text-neutral-300 dark:text-neutral-700 mx-auto mb-2" />
                <p class="font-medium text-neutral-600 dark:text-neutral-400">Tidak ada data piutang</p>
                <p class="text-[11px] text-neutral-400 mt-0.5">
                  {searchQuery ? `Tidak ditemukan piutang dengan kata kunci "${searchQuery}"` : 'Belum ada transaksi kredit pada periode ini'}
                </p>
              </td>
            </tr>
          {:else}
            {#each paginatedList as item (item.id)}
              {@const sisa = Number(item.sisa_piutang) || 0}
              {@const lunas = sisa <= 0}
              <tr class="hover:bg-neutral-50/60 dark:hover:bg-neutral-900/40 transition-colors">
                <!-- Waktu -->
                <td class="px-4 py-3 text-neutral-500 text-xs whitespace-nowrap tabular-nums">
                  {formatDateTime(item.created_ms)}
                </td>

                <!-- No Struk -->
                <td class="px-4 py-3 font-semibold text-neutral-900 dark:text-neutral-100 text-xs whitespace-nowrap">
                  {item.no_struk}
                </td>

                <!-- Pelanggan -->
                <td class="px-4 py-3">
                  <div class="flex items-center gap-2">
                    <User class="w-3.5 h-3.5 text-neutral-400 shrink-0" />
                    <div class="min-w-0">
                      <div class="font-medium text-neutral-900 dark:text-neutral-100 text-xs truncate">
                        {item.nama_pelanggan || '-'}
                      </div>
                      {#if item.no_telepon_pelanggan}
                        <div class="text-[10px] text-[var(--text-muted)] flex items-center gap-1">
                          <Phone class="w-2.5 h-2.5" />
                          {item.no_telepon_pelanggan}
                        </div>
                      {/if}
                    </div>
                  </div>
                </td>

                <!-- Total Belanja -->
                <td class="px-4 py-3 text-right font-semibold text-neutral-900 dark:text-neutral-100 tabular-nums text-xs whitespace-nowrap">
                  {formatRupiah(item.total_harga_jual)}
                </td>

                <!-- Dibayar -->
                <td class="px-4 py-3 text-right text-neutral-500 tabular-nums text-xs whitespace-nowrap">
                  {formatRupiah(item.jumlah_dibayar)}
                </td>

                <!-- Sisa Piutang -->
                <td class="px-4 py-3 text-right tabular-nums text-xs whitespace-nowrap">
                  {#if lunas}
                    <Badge variant="success">Lunas</Badge>
                  {:else}
                    <span class="font-bold text-amber-600 dark:text-amber-400">{formatRupiah(sisa)}</span>
                  {/if}
                </td>

                <!-- Aksi -->
                <td class="px-4 py-3 text-center">
                  <div class="flex items-center justify-center gap-1.5">
                    <button
                      type="button"
                      onclick={() => openPayModal(item)}
                      disabled={lunas}
                      title={lunas ? 'Sudah lunas' : 'Catat Pembayaran'}
                      class="px-2.5 py-1.5 rounded-md text-[11px] font-semibold border transition-colors inline-flex items-center gap-1
                        {lunas
                          ? 'border-neutral-200 dark:border-neutral-800 text-neutral-400 cursor-not-allowed'
                          : 'border-emerald-500/40 bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-400 hover:bg-emerald-100 dark:hover:bg-emerald-950/70'}"
                    >
                      <HandCoins class="w-3.5 h-3.5" />
                      <span>Bayar</span>
                    </button>
                    <button
                      type="button"
                      onclick={() => openHistory(item)}
                      title="Riwayat Pembayaran"
                      class="p-1.5 rounded-md border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-800 text-neutral-600 dark:text-neutral-300 hover:text-neutral-900 dark:hover:text-white hover:bg-neutral-100 dark:hover:bg-neutral-700 shadow-2xs transition-all flex items-center justify-center"
                    >
                      <History class="w-3.5 h-3.5" />
                    </button>
                  </div>
                </td>
              </tr>
            {/each}
          {/if}
        </tbody>
      </table>
    </div>

    <!-- Pagination & Total Indicator with Limit -->
    <TablePagination
      bind:currentPage
      bind:pageSize
      totalItems={filteredList.length}
      currentItemsCount={paginatedList.length}
      itemLabel="piutang"
      storageKey="piutang_limit"
    />
  </div>
</div>

<!-- Modal Catat Pembayaran Piutang -->
<Modal
  open={payModalOpen}
  title="Catat Pembayaran Piutang"
  size="lg"
  onclose={() => (payModalOpen = false)}
>
  <form novalidate onsubmit={(e) => { e.preventDefault(); handlePay(); }} class="space-y-4">
    {#if formErrorMessage}
      <div class="p-3 rounded-md bg-red-50 dark:bg-red-950/40 border border-red-500/30 text-red-700 dark:text-red-400 text-xs flex items-center gap-2">
        <AlertCircle class="w-4 h-4 shrink-0" />
        <span>{formErrorMessage}</span>
      </div>
    {/if}

    {#if selectedSale}
      <!-- Ringkasan transaksi -->
      <div class="p-3.5 rounded-lg border border-neutral-200 dark:border-neutral-800 bg-[var(--bg-subtle)]/60 space-y-1.5 text-xs">
        <div class="flex items-center justify-between">
          <span class="text-[var(--text-muted)]">No. Struk</span>
          <span class="font-semibold text-[var(--text-primary)]">{selectedSale.no_struk}</span>
        </div>
        <div class="flex items-center justify-between">
          <span class="text-[var(--text-muted)]">Pelanggan</span>
          <span class="font-medium text-[var(--text-primary)]">{selectedSale.nama_pelanggan || '-'}</span>
        </div>
        <div class="flex items-center justify-between">
          <span class="text-[var(--text-muted)]">Total Belanja</span>
          <span class="font-medium text-[var(--text-primary)] tabular-nums">{formatRupiah(selectedSale.total_harga_jual)}</span>
        </div>
        <div class="flex items-center justify-between border-t border-[var(--border-subtle)] pt-1.5">
          <span class="text-[var(--text-muted)] font-semibold">Sisa Piutang</span>
          <span class="font-bold text-amber-600 dark:text-amber-400 tabular-nums">{formatRupiah(selectedSale.sisa_piutang)}</span>
        </div>
      </div>
    {/if}

    <!-- Nominal Pembayaran -->
    <div>
      <Input
        id="bayar-nominal"
        label="Nominal Pembayaran"
        type="currency"
        bind:value={formNominal}
        placeholder="0"
        required
        error={nominalError}
        oninput={() => {
          if (parseIDR(formNominal) > 0) nominalError = null;
        }}
        onblur={() => {
          if (parseIDR(formNominal) <= 0) nominalError = 'Nominal pembayaran harus lebih besar dari Rp0,00.';
        }}
      />
      <div class="flex justify-end mt-1.5">
        <button
          type="button"
          class="px-2.5 py-1 text-xs rounded border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 hover:bg-[var(--bg-hover)] text-neutral-800 dark:text-neutral-200 transition-colors"
          onclick={setNominalLunas}
        >
          Lunasi Sisa Piutang
        </button>
      </div>
    </div>

    <!-- Catatan -->
    <div>
      <label for="bayar-catatan" class="block text-xs font-medium text-neutral-700 dark:text-neutral-300 mb-1.5">
        Catatan <span class="text-neutral-400 font-normal">(opsional)</span>
      </label>
      <textarea
        id="bayar-catatan"
        bind:value={formCatatan}
        rows="2"
        placeholder="Contoh: Pembayaran via transfer BCA"
        class="w-full px-3 py-2 rounded-md border text-xs transition-colors
          border-neutral-300 dark:border-neutral-800 bg-[var(--bg-surface)] text-neutral-900 dark:text-neutral-100
          focus:border-neutral-900 dark:focus:border-white focus:outline-none focus:ring-1 focus:ring-[var(--brand)]/50"
      ></textarea>
    </div>

    <!-- Modal Footer Actions -->
    <div class="flex items-center justify-end gap-2 pt-2 border-t border-neutral-200 dark:border-neutral-800">
      <Button
        type="button"
        variant="secondary"
        onclick={() => (payModalOpen = false)}
      >
        Batal
      </Button>

      <Button
        type="submit"
        variant="primary"
        loading={isSubmitting}
      >
        <CheckCircle2 class="w-4 h-4" />
        <span>Simpan Pembayaran</span>
      </Button>
    </div>
  </form>
</Modal>

<!-- Modal Riwayat Pembayaran -->
<Modal
  open={historyModalOpen}
  title="Riwayat Pembayaran Piutang"
  size="lg"
  onclose={() => (historyModalOpen = false)}
>
  <div class="space-y-4">
    {#if historySale}
      <div class="p-3.5 rounded-lg border border-neutral-200 dark:border-neutral-800 bg-[var(--bg-subtle)]/60 flex items-center justify-between text-xs">
        <div>
          <div class="font-semibold text-[var(--text-primary)]">{historySale.no_struk}</div>
          <div class="text-[var(--text-muted)]">{historySale.nama_pelanggan || '-'}</div>
        </div>
        <div class="text-right">
          <div class="text-[var(--text-muted)]">Sisa Piutang</div>
          <div class="font-bold text-amber-600 dark:text-amber-400 tabular-nums">{formatRupiah(historySale.sisa_piutang)}</div>
        </div>
      </div>
    {/if}

    {#if historyLoading}
      <div class="space-y-2">
        <Skeleton class="h-10 w-full" />
        <Skeleton class="h-10 w-full" />
      </div>
    {:else if historyList.length === 0}
      <div class="py-8 text-center text-neutral-400 text-xs">
        <History class="w-7 h-7 mx-auto mb-2 opacity-40" />
        <p>Belum ada pembayaran yang tercatat untuk transaksi ini.</p>
      </div>
    {:else}
      <div class="rounded-md border border-[var(--border-subtle)] overflow-hidden">
        <table class="w-full text-left text-xs border-collapse">
          <thead class="bg-[var(--bg-subtle)] text-[var(--text-muted)] font-medium text-[11px] border-b border-[var(--border-subtle)]">
            <tr>
              <th class="px-4 py-2.5">Waktu</th>
              <th class="px-4 py-2.5">Catatan</th>
              <th class="px-4 py-2.5 text-right">Nominal</th>
              <th class="px-4 py-2.5 text-center w-16">Aksi</th>
            </tr>
          </thead>
          <tbody class="divide-y divide-[var(--border-subtle)]">
            {#each historyList as payment (payment.id)}
              <tr class="hover:bg-neutral-50/60 dark:hover:bg-neutral-900/40 transition-colors">
                <td class="px-4 py-2.5 text-neutral-500 whitespace-nowrap tabular-nums">{formatDateTime(payment.created_ms)}</td>
                <td class="px-4 py-2.5 text-neutral-700 dark:text-neutral-300">{payment.catatan || '-'}</td>
                <td class="px-4 py-2.5 text-right font-semibold text-emerald-600 dark:text-emerald-400 tabular-nums whitespace-nowrap">
                  +{formatRupiah(payment.jumlah_bayar)}
                </td>
                <td class="px-4 py-2.5 text-center">
                  <button
                    type="button"
                    onclick={() => handleDeletePayment(payment)}
                    title="Hapus Pembayaran"
                    class="p-1.5 rounded-md border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-800 text-neutral-500 dark:text-neutral-400 hover:text-red-600 dark:hover:text-red-400 hover:border-red-300 dark:hover:border-red-800 hover:bg-red-50 dark:hover:bg-red-950/40 shadow-2xs transition-all flex items-center justify-center mx-auto"
                  >
                    <Trash2 class="w-3.5 h-3.5" />
                  </button>
                </td>
              </tr>
            {/each}
          </tbody>
        </table>
      </div>
    {/if}

    <div class="flex items-center justify-end pt-2 border-t border-neutral-200 dark:border-neutral-800">
      <Button variant="secondary" onclick={() => (historyModalOpen = false)}>Tutup</Button>
    </div>
  </div>
</Modal>
