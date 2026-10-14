<script lang="ts">
  import Modal from '../ui/Modal.svelte';
  import Button from '../ui/Button.svelte';
  import Rupiah from '../ui/Rupiah.svelte';
  import { cart, type CartItem } from '../../stores/cart.svelte';
  import { auth } from '../../stores/auth.svelte';
  import { sse } from '../../stores/sse.svelte';
  import { toast } from '../../stores/toast.svelte';
  import { formatRupiah, formatNumber, formatIDR, parseIDR } from '../../utils/format';
  import { CheckCircle2, AlertCircle, Banknote, HandCoins, User } from 'lucide-svelte';

  export interface ReceiptData {
    receiptNo: string;
    timestamp: string;
    cashierName: string;
    items: CartItem[];
    totalItems: number;
    totalAmount: number;
    cashPaid: number;
    changeAmount: number;
    paymentMethod: 'tunai' | 'kredit';
    customerName?: string;
    customerPhone?: string;
    amountPaid: number;
    remainingDebt: number;
  }

  interface Props {
    open?: boolean;
    onsuccess?: (receiptData: ReceiptData) => void;
    onclose?: () => void;
  }

  let { open = $bindable(false), onsuccess, onclose }: Props = $props();

  function handleModalClose() {
    open = false;
    onclose?.();
  }

  type Metode = 'tunai' | 'kredit';
  let metode = $state<Metode>('tunai');
  let tunaiRaw = $state('');
  let dpRaw = $state('');
  let namaPelanggan = $state('');
  let noTelepon = $state('');
  let isSubmitting = $state(false);
  let errorMsg = $state<string | null>(null);
  let inputElement = $state<HTMLInputElement | null>(null);

  function parseCashDigits(value: string): number {
    return parseIDR(value);
  }

  function formatCashDigits(value: string): string {
    const num = parseIDR(value);
    return num === 0 ? '' : formatIDR(num);
  }

  function formatCashAmount(amount: number): string {
    return formatIDR(amount);
  }

  const tunaiNum = $derived(parseCashDigits(tunaiRaw));
  const dpNum = $derived(parseCashDigits(dpRaw));

  const totalAmount = $derived(cart.totalAmount);
  const totalItems = $derived(cart.totalItems);
  const kembalian = $derived(tunaiNum - totalAmount);
  const isSufficient = $derived(tunaiNum >= totalAmount && totalAmount > 0);
  const kekurangan = $derived(Math.max(0, totalAmount - tunaiNum));

  const sisaPiutang = $derived(Math.max(0, totalAmount - dpNum));
  const isKreditValid = $derived(
    totalAmount > 0 &&
      namaPelanggan.trim().length > 0 &&
      dpNum >= 0 &&
      dpNum <= totalAmount
  );

  const canSubmit = $derived(metode === 'tunai' ? isSufficient : isKreditValid);

  const presets = [1000000, 2000000, 5000000, 10000000, 20000000, 50000000];

  function setPreset(amount: number) {
    tunaiRaw = formatCashAmount(amount);
    errorMsg = null;
    focusInput();
  }

  function setUangPas() {
    tunaiRaw = formatCashAmount(totalAmount);
    errorMsg = null;
    focusInput();
  }

  function setDpPas() {
    dpRaw = formatCashAmount(totalAmount);
    errorMsg = null;
  }

  function setDpKosong() {
    dpRaw = '';
    errorMsg = null;
  }

  function handleInput(e: Event) {
    const target = e.target as HTMLInputElement;
    const numeric = target.value.replace(/[^0-9]/g, '');
    tunaiRaw = formatCashDigits(numeric);
    errorMsg = null;
  }

  function handleDpInput(e: Event) {
    const target = e.target as HTMLInputElement;
    const numeric = target.value.replace(/[^0-9]/g, '');
    dpRaw = formatCashDigits(numeric);
    errorMsg = null;
  }

  function setMetode(next: Metode) {
    metode = next;
    errorMsg = null;
    if (next === 'tunai') {
      focusInput();
    }
  }

  function focusInput() {
    setTimeout(() => {
      inputElement?.focus();
      inputElement?.select();
    }, 50);
  }

  $effect(() => {
    if (open) {
      metode = 'tunai';
      tunaiRaw = '';
      dpRaw = '';
      namaPelanggan = '';
      noTelepon = '';
      errorMsg = null;
      isSubmitting = false;
      focusInput();
    }
  });

  async function handlePay() {
    if (cart.items.length === 0) {
      errorMsg = 'Keranjang belanja masih kosong.';
      return;
    }

    if (metode === 'tunai') {
      if (tunaiNum <= 0) {
        errorMsg = 'Nominal pembayaran tunai wajib diisi.';
        return;
      }
      if (!isSufficient) {
        errorMsg = `Uang tunai kurang ${formatRupiah(kekurangan)}.`;
        return;
      }
    } else {
      if (!namaPelanggan.trim()) {
        errorMsg = 'Nama pelanggan wajib diisi untuk transaksi kredit.';
        return;
      }
      if (dpNum > totalAmount) {
        errorMsg = 'Nominal uang muka (DP) tidak boleh melebihi total belanja.';
        return;
      }
    }

    if (sse.status !== 'online') {
      toast.warning('Server sedang terputus (SSE offline). Pembayaran tidak dapat diproses.');
      return;
    }

    isSubmitting = true;
    errorMsg = null;

    const isKredit = metode === 'kredit';
    const amountPaid = isKredit ? dpNum : totalAmount;

    try {
      const payload = {
        items: cart.items.map((item) => ({
          id: item.id,
          jumlah_barang: item.jumlah_barang,
          harga_modal: item.harga_modal,
          harga_jual: item.harga_jual,
          nama_barang: item.nama_barang,
        })),
        metode_bayar: isKredit ? 1 : 0,
        nama_pelanggan: isKredit ? namaPelanggan.trim() : null,
        no_telepon_pelanggan: isKredit && noTelepon.trim() ? noTelepon.trim() : null,
        jumlah_dibayar: amountPaid,
      };

      const res = await fetch('/masuk_ke_pembukuan', {
        method: 'POST',
        headers: {
          token: localStorage.getItem('token') || '',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      });

      if (res.status === 200) {
        const receiptData: ReceiptData = {
          receiptNo: `TRX-${Date.now()}`,
          timestamp: new Date().toISOString(),
          cashierName: auth.user?.full_name || auth.user?.username || 'Kasir',
          items: cart.items.map((i) => ({ ...i })),
          totalItems,
          totalAmount,
          cashPaid: isKredit ? dpNum : tunaiNum,
          changeAmount: isKredit ? 0 : kembalian,
          paymentMethod: metode,
          customerName: isKredit ? namaPelanggan.trim() : undefined,
          customerPhone: isKredit && noTelepon.trim() ? noTelepon.trim() : undefined,
          amountPaid,
          remainingDebt: isKredit ? sisaPiutang : 0,
        };

        cart.clear();
        open = false;
        toast.success(
          isKredit
            ? 'Transaksi kredit berhasil disimpan. Sisa piutang telah dicatat.'
            : 'Transaksi berhasil disimpan ke pembukuan.'
        );
        onsuccess?.(receiptData);
      } else {
        const errCode = await res.text();
        if (errCode === '1') {
          errorMsg = 'Stok barang tidak mencukupi untuk menyelesaikan transaksi ini.';
          toast.error(errorMsg);
        } else if (errCode === '2') {
          errorMsg = 'Nama pelanggan wajib diisi untuk transaksi kredit.';
          toast.error(errorMsg);
        } else if (errCode === '3') {
          errorMsg = 'Nominal uang muka (DP) tidak boleh melebihi total belanja.';
          toast.error(errorMsg);
        } else if (errCode === '0') {
          errorMsg = 'Anda tidak memiliki hak akses kasir untuk memproses transaksi.';
          toast.error(errorMsg);
        } else {
          errorMsg = `Gagal memproses transaksi (Status: ${res.status}).`;
          toast.error(errorMsg);
        }
      }
    } catch (err: any) {
      errorMsg = err?.message || 'Terjadi kesalahan jaringan saat memproses transaksi.';
      toast.error(errorMsg);
    } finally {
      isSubmitting = false;
    }
  }

  function handleKeydown(e: KeyboardEvent) {
    if (!open) return;
    if (sse.status !== 'online') return;

    if (e.key === 'Enter') {
      e.preventDefault();
      if (canSubmit && !isSubmitting) {
        handlePay();
      }
    }
  }
</script>

<svelte:window onkeydown={handleKeydown} />

<Modal
  bind:open
  title="Pembayaran Transaksi Kasir"
  size="lg"
  onclose={handleModalClose}
>
  <div class="space-y-4">
    <!-- Grand Total Highlight Card -->
    <div class="p-4 rounded-lg border border-neutral-200 dark:border-neutral-800 bg-neutral-50/70 dark:bg-neutral-900/40 text-center">
      <p class="text-[11px] font-semibold uppercase tracking-wider text-neutral-500 dark:text-neutral-400">Total Yang Harus Dibayar</p>
      <div class="mt-1 flex items-baseline justify-center gap-1 text-neutral-900 dark:text-neutral-100 flex-wrap">
        <Rupiah
          value={totalAmount}
          class="text-2xl sm:text-3xl font-bold tracking-tight text-neutral-900 dark:text-neutral-100 break-all"
          prefixClass="text-sm sm:text-base font-semibold text-neutral-400 dark:text-neutral-500 tracking-normal mr-1"
        />
      </div>
    </div>

    <!-- Payment Method Toggle -->
    <div class="grid grid-cols-2 gap-2 p-1 rounded-lg border border-neutral-200 dark:border-neutral-800 bg-[var(--bg-subtle)]">
      <button
        type="button"
        onclick={() => setMetode('tunai')}
        class="flex items-center justify-center gap-1.5 h-9 rounded-md text-xs font-semibold transition-colors cursor-pointer
          {metode === 'tunai'
            ? 'bg-[var(--brand)] text-[var(--accent-fg)] shadow-2xs'
            : 'text-neutral-600 dark:text-neutral-400 hover:bg-[var(--bg-hover)]'}"
      >
        <Banknote class="w-3.5 h-3.5" />
        <span>Tunai / Lunas</span>
      </button>
      <button
        type="button"
        onclick={() => setMetode('kredit')}
        class="flex items-center justify-center gap-1.5 h-9 rounded-md text-xs font-semibold transition-colors cursor-pointer
          {metode === 'kredit'
            ? 'bg-[var(--brand)] text-[var(--accent-fg)] shadow-2xs'
            : 'text-neutral-600 dark:text-neutral-400 hover:bg-[var(--bg-hover)]'}"
      >
        <HandCoins class="w-3.5 h-3.5" />
        <span>Kredit / Hutang</span>
      </button>
    </div>

    <!-- Error Alert -->
    {#if errorMsg}
      <div class="p-3 rounded-md border border-red-500/30 bg-red-50 dark:bg-red-950/40 text-red-700 dark:text-red-400 text-xs flex items-start gap-2 animate-in fade-in">
        <AlertCircle class="w-4 h-4 shrink-0 mt-0.5" />
        <span class="font-medium">{errorMsg}</span>
      </div>
    {/if}

    {#if metode === 'tunai'}
      <!-- Cash Input -->
      <div>
        <label for="tunai-input" class="block text-xs font-medium text-neutral-700 dark:text-neutral-300 mb-1.5">
          Nominal Tunai Diterima <span class="text-red-500 font-bold">*</span>
        </label>
        <p class="text-[11px] text-neutral-400 dark:text-neutral-500 mb-2">Dua digit terakhir dianggap sebagai sen.</p>
        <div class="relative flex items-center">
          <span class="absolute left-3.5 text-neutral-400 dark:text-neutral-500 font-semibold text-xs pointer-events-none">
            Rp
          </span>
          <input
            id="tunai-input"
            bind:this={inputElement}
            type="text"
            inputmode="numeric"
            placeholder="0,00"
            value={tunaiRaw}
            oninput={handleInput}
            onkeydown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                handlePay();
              } else if (e.key === 'Escape') {
                e.preventDefault();
                handleModalClose();
              }
            }}
            class="w-full h-12 pl-10 pr-4 rounded-md border text-lg font-bold tracking-normal tabular-nums transition-colors
              {errorMsg ? 'border-red-500 focus-visible:ring-red-500' : 'border-neutral-300 dark:border-neutral-800'}
              bg-[var(--bg-surface)] text-neutral-900 dark:text-neutral-100
              focus:border-neutral-900 dark:focus:border-white focus:outline-none focus:ring-1 focus:ring-[var(--brand)]/50"
          />
        </div>
      </div>

      <!-- Quick Preset Buttons -->
      <div>
        <p class="text-[11px] font-medium text-neutral-500 dark:text-neutral-400 mb-2">Pilihan Cepat Nominal:</p>
        <div class="grid grid-cols-3 sm:grid-cols-4 gap-1.5">
          <button
            type="button"
            class="px-2 py-1.5 rounded border text-xs font-medium tabular-nums transition-colors
              border-neutral-200 dark:border-neutral-800 bg-[var(--bg-subtle)] text-neutral-800 dark:text-neutral-200
              hover:border-neutral-900 dark:hover:border-white hover:bg-[var(--bg-hover)]"
            onclick={setUangPas}
          >
            Uang Pas
          </button>
          {#each presets as amount}
            <button
              type="button"
              class="px-2 py-1.5 rounded border text-xs font-medium tabular-nums transition-colors
                border-neutral-200 dark:border-neutral-800 bg-[var(--bg-subtle)] text-neutral-800 dark:text-neutral-200
                hover:border-neutral-900 dark:hover:border-white hover:bg-[var(--bg-hover)]"
              onclick={() => setPreset(amount)}
            >
              {formatCashAmount(amount)}
            </button>
          {/each}
        </div>
      </div>

      <!-- Change Calculation Result -->
      <div class="p-3.5 rounded-lg border border-neutral-200 dark:border-neutral-800 bg-[var(--bg-subtle)]/60 flex items-center justify-between">
        <div>
          <p class="text-[11px] font-semibold uppercase tracking-wider text-neutral-500">
            {#if isSufficient}
              KEMBALIAN
            {:else if tunaiNum > 0}
              KURANG BAYAR
            {:else}
              STATUS PEMBAYARAN
            {/if}
          </p>
          <p class="text-xs text-neutral-400 mt-0.5">
            {#if isSufficient}
              Uang kembalian yang harus diberikan ke pembeli
            {:else if tunaiNum > 0}
              Nominal tunai belum mencukupi total belanja
            {:else}
              Masukkan nominal uang tunai yang diterima
            {/if}
          </p>
        </div>

        <div class="text-right">
          {#if isSufficient}
            <Rupiah
              value={kembalian}
              class="text-xl font-bold text-emerald-600 dark:text-emerald-400 break-all"
              prefixClass="text-xs font-semibold text-emerald-600/70 dark:text-emerald-400/70 mr-0.5"
            />
          {:else if tunaiNum > 0}
            <Rupiah
              value={-kekurangan}
              class="text-lg font-semibold text-rose-600 dark:text-rose-400 break-all"
              prefixClass="text-xs font-semibold text-rose-600/70 dark:text-rose-400/70 mr-0.5"
            />
          {:else}
            <span class="text-sm font-medium text-neutral-400 tabular-nums">
              <span class="text-xs mr-0.5">Rp</span>0,00
            </span>
          {/if}
        </div>
      </div>
    {:else}
      <!-- Customer Name -->
      <div>
        <label for="pelanggan-nama" class="block text-xs font-medium text-neutral-700 dark:text-neutral-300 mb-1.5">
          Nama Pelanggan <span class="text-red-500 font-bold">*</span>
        </label>
        <div class="relative flex items-center">
          <span class="absolute left-3.5 text-neutral-400 dark:text-neutral-500 pointer-events-none">
            <User class="w-4 h-4" />
          </span>
          <input
            id="pelanggan-nama"
            type="text"
            placeholder="Contoh: Budi Santoso"
            bind:value={namaPelanggan}
            oninput={() => (errorMsg = null)}
            class="w-full h-11 pl-10 pr-4 rounded-md border text-sm font-medium transition-colors
              border-neutral-300 dark:border-neutral-800 bg-[var(--bg-surface)] text-neutral-900 dark:text-neutral-100
              focus:border-neutral-900 dark:focus:border-white focus:outline-none focus:ring-1 focus:ring-[var(--brand)]/50"
          />
        </div>
      </div>

      <!-- Customer Phone (optional) -->
      <div>
        <label for="pelanggan-telepon" class="block text-xs font-medium text-neutral-700 dark:text-neutral-300 mb-1.5">
          No. Telepon / WA <span class="text-neutral-400 font-normal">(opsional)</span>
        </label>
        <input
          id="pelanggan-telepon"
          type="text"
          inputmode="tel"
          placeholder="Contoh: 081234567890"
          bind:value={noTelepon}
          class="w-full h-11 px-4 rounded-md border text-sm font-medium transition-colors
            border-neutral-300 dark:border-neutral-800 bg-[var(--bg-surface)] text-neutral-900 dark:text-neutral-100
            focus:border-neutral-900 dark:focus:border-white focus:outline-none focus:ring-1 focus:ring-[var(--brand)]/50"
        />
      </div>

      <!-- Down Payment Input -->
      <div>
        <label for="dp-input" class="block text-xs font-medium text-neutral-700 dark:text-neutral-300 mb-1.5">
          Uang Muka / DP <span class="text-neutral-400 font-normal">(opsional, boleh kosong)</span>
        </label>
        <p class="text-[11px] text-neutral-400 dark:text-neutral-500 mb-2">Dua digit terakhir dianggap sebagai sen. Kosongkan jika tidak ada DP.</p>
        <div class="relative flex items-center">
          <span class="absolute left-3.5 text-neutral-400 dark:text-neutral-500 font-semibold text-xs pointer-events-none">
            Rp
          </span>
          <input
            id="dp-input"
            type="text"
            inputmode="numeric"
            placeholder="0,00"
            value={dpRaw}
            oninput={handleDpInput}
            onkeydown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                handlePay();
              } else if (e.key === 'Escape') {
                e.preventDefault();
                handleModalClose();
              }
            }}
            class="w-full h-12 pl-10 pr-4 rounded-md border text-lg font-bold tracking-normal tabular-nums transition-colors
              {errorMsg ? 'border-red-500 focus-visible:ring-red-500' : 'border-neutral-300 dark:border-neutral-800'}
              bg-[var(--bg-surface)] text-neutral-900 dark:text-neutral-100
              focus:border-neutral-900 dark:focus:border-white focus:outline-none focus:ring-1 focus:ring-[var(--brand)]/50"
          />
        </div>
        <div class="grid grid-cols-2 gap-1.5 mt-1.5">
          <button
            type="button"
            class="px-2 py-1.5 rounded border text-xs font-medium tabular-nums transition-colors
              border-neutral-200 dark:border-neutral-800 bg-[var(--bg-subtle)] text-neutral-800 dark:text-neutral-200
              hover:border-neutral-900 dark:hover:border-white hover:bg-[var(--bg-hover)]"
            onclick={setDpPas}
          >
            Bayar Lunas
          </button>
          <button
            type="button"
            class="px-2 py-1.5 rounded border text-xs font-medium tabular-nums transition-colors
              border-neutral-200 dark:border-neutral-800 bg-[var(--bg-subtle)] text-neutral-800 dark:text-neutral-200
              hover:border-neutral-900 dark:hover:border-white hover:bg-[var(--bg-hover)]"
            onclick={setDpKosong}
          >
            Tanpa DP
          </button>
        </div>
      </div>

      <!-- Remaining Debt Result -->
      <div class="p-3.5 rounded-lg border border-neutral-200 dark:border-neutral-800 bg-[var(--bg-subtle)]/60 flex items-center justify-between">
        <div>
          <p class="text-[11px] font-semibold uppercase tracking-wider text-neutral-500">SISA HUTANG (PIUTANG)</p>
          <p class="text-xs text-neutral-400 mt-0.5">
            {#if sisaPiutang <= 0}
              Transaksi ini akan langsung tercatat lunas
            {:else}
              Sisa yang harus dibayar pelanggan di kemudian hari
            {/if}
          </p>
        </div>
        <div class="text-right">
          {#if sisaPiutang <= 0}
            <span class="text-sm font-bold text-emerald-600 dark:text-emerald-400">Lunas</span>
          {:else}
            <Rupiah
              value={sisaPiutang}
              class="text-xl font-bold text-amber-600 dark:text-amber-400 break-all"
              prefixClass="text-xs font-semibold text-amber-600/70 dark:text-amber-400/70 mr-0.5"
            />
          {/if}
        </div>
      </div>
    {/if}
  </div>

  {#snippet footer()}
    <Button variant="secondary" size="sm" onclick={handleModalClose} disabled={isSubmitting}>
      Batal (Esc)
    </Button>
    <Button
      variant="primary"
      size="sm"
      loading={isSubmitting}
      disabled={!canSubmit || isSubmitting || totalAmount <= 0}
      onclick={handlePay}
    >
      <CheckCircle2 class="w-3.5 h-3.5" />
      <span>Selesaikan Transaksi (Enter)</span>
    </Button>
  {/snippet}
</Modal>
