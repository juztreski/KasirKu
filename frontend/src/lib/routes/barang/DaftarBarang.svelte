<svelte:head>
    <title>KasirKu | Daftar Barang</title>
</svelte:head>

<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import { api } from '../../api/api';
  import { auth, Permissions } from '../../stores/auth.svelte';
  import { router } from '../../stores/router.svelte';
  import { toast } from '../../stores/toast.svelte';
  import { confirmDialog } from '../../stores/dialog.svelte';
  import { sse } from '../../stores/sse.svelte';
  import Button from '../../components/ui/Button.svelte';
  import Input from '../../components/ui/Input.svelte';
  import Select from '../../components/ui/Select.svelte';
  import Modal from '../../components/ui/Modal.svelte';
  import Badge from '../../components/ui/Badge.svelte';
  import Skeleton from '../../components/ui/Skeleton.svelte';
  import TablePagination from '../../components/ui/TablePagination.svelte';
  import ImagePreviewModal from '../../components/ui/ImagePreviewModal.svelte';
  import { buildCsv, parseCsv, downloadCsv } from '../../utils/csv';
  import {
    formatRupiah,
    formatRupiahInput,
    formatIDR,
    parseIDR,
    formatNumber,
    parseNumber,
    formatThousandSeparator,
    formatDateTime
  } from '../../utils/format';
  import {
    Package,
    Plus,
    Search,
    Filter,
    RefreshCw,
    Pencil,
    Trash2,
    Barcode,
    AlertTriangle,
    Tag,
    Boxes,
    DollarSign,
    TrendingUp,
    Sparkles,
    ArrowUpDown,
    ArrowUp,
    ArrowDown,
    CheckCircle2,
    Download,
    Upload,
    Image as ImageIcon,
    ZoomIn
  } from 'lucide-svelte';

  export interface BarangItem {
    id: number;
    nama_barang: string;
    stok_barang: number;
    kategori_barang_id: number;
    harga_modal: number;
    harga_jual: number;
    barcode_barang: string | null;
    gambar_barang?: string | null;
    created_ms: number;
    modified_ms: number;
    nama_kategori?: string;
  }

  export interface KategoriItem {
    id: number;
    nama_kategori: string;
  }

  // State
  let barangList = $state<BarangItem[]>([]);
  let kategoriList = $state<KategoriItem[]>([]);
  let loading = $state(true);
  let isSubmitting = $state(false);

  // Filters & Search
  let searchQuery = $state('');
  let selectedKategori = $state<number | 'all'>('all');
  let selectedStokStatus = $state<'all' | 'safe' | 'low' | 'out'>('all');
  let sortBy = $state<
    | 'nama_asc'
    | 'nama_desc'
    | 'stok_asc'
    | 'stok_desc'
    | 'margin_desc'
    | 'margin_asc'
    | 'recent'
    | 'harga_modal_asc'
    | 'harga_modal_desc'
    | 'harga_jual_asc'
    | 'harga_jual_desc'
    | 'barcode_asc'
    | 'barcode_desc'
    | 'kategori_asc'
    | 'kategori_desc'
  >('nama_asc');

  // Modal State
  let isModalOpen = $state(false);
  let isEditing = $state(false);
  let editingId = $state<number | null>(null);
  let previewItem = $state<BarangItem | null>(null);
  let previewOpen = $state(false);

  // Form Fields
  let formNama = $state('');
  let formBarcode = $state('');
  let formKategoriId = $state<number>(1);
  let formStok = $state<number | string>('');
  let formModal = $state<string>('');
  let formJual = $state<string>('');
  let formPersen = $state<string>('20,00');
  let formErrorMessage = $state<string | null>(null);
  let fieldErrors = $state<Record<string, string>>({});

  // Foto Produk
  let formGambarPreview = $state<string | null>(null); // data URL untuk preview
  let formGambarBase64 = $state<string | null>(null);  // base64 mentah untuk dikirim
  let formGambarRemoved = $state(false);               // tandai penghapusan saat edit
  let isProcessingGambar = $state(false);
  let gambarInput = $state<HTMLInputElement | undefined>(undefined);

  // parseIDR membaca nilai dalam sen (integer)
  const previewModal = $derived(parseIDR(formModal));
  const previewJual = $derived(parseIDR(formJual));
  const previewLaba = $derived(previewJual - previewModal);
  const previewPct = $derived(previewModal > 0 ? ((previewLaba / previewModal) * 100).toFixed(2).replace('.', ',') : '0,00');

  // Inline Category Creation
  let isCreatingKategori = $state(false);
  let newKategoriName = $state('');
  let newKategoriError = $state<string | null>(null);

  // Pagination
  let currentPage = $state(1);
  let pageSize = $state(10);

  // CSV Import / Export
  let importInput = $state<HTMLInputElement | undefined>(undefined);
  let isImporting = $state(false);

  async function loadData() {
    loading = true;
    try {
      const [barangData, kategoriData] = await Promise.all([
        api.get<BarangItem[]>('/api/barang'),
        api.get<KategoriItem[]>('/api/kategori_barang'),
      ]);
      barangList = Array.isArray(barangData) ? barangData : [];
      kategoriList = Array.isArray(kategoriData) ? kategoriData : [];
      if (kategoriList.length > 0 && !formKategoriId) {
        formKategoriId = kategoriList[0].id;
      }
    } catch (err: any) {
      toast.error('Gagal memuat inventaris barang: ' + (err.message || ''));
    } finally {
      loading = false;
    }
  }

  // Reactive price & margin calculations — logika identik dengan kasirku lama

  // Ketika harga modal diinput: set harga_jual = harga_modal, reset persen ke 0,00
  // (sama dengan harga_modal_event di kasirku lama)
  function handleModalInput() {
    clearFieldError('harga_modal');
    if (!formModal) {
      formJual = '';
      formPersen = '0,00';
      return;
    }
    formJual = formModal;
    formPersen = '0,00';
  }

  // Ketika harga jual diinput: hitung persen dari selisih
  // (sama dengan harga_jual_event di kasirku lama)
  function handleJualInput() {
    clearFieldError('harga_jual');
    if (!formModal) {
      formJual = '';
      toast.error('Harga modal harus dimasukkan terlebih dahulu.');
      return;
    }
    // parseIDR → nilai dalam sen
    const modalNum = parseIDR(formModal);
    const jualNum = parseIDR(formJual);
    if (modalNum > 0) {
      const persen = ((jualNum - modalNum) / modalNum) * 100;
      formPersen = formatPercentage(persen);
    }
  }

  function handlePersenKeydown(e: KeyboardEvent) {
    if (
      e.key === 'Tab' || e.key === 'Enter' || e.key === 'Escape' ||
      e.key === 'ArrowLeft' || e.key === 'ArrowRight' || e.key === 'ArrowUp' || e.key === 'ArrowDown' ||
      e.key === 'Home' || e.key === 'End' || e.key === 'Backspace' || e.key === 'Delete' ||
      e.ctrlKey || e.metaKey
    ) return;

    if (/^[0-9]$/.test(e.key)) return;

    if ((e.key === ',' || e.key === '.') && !formPersen.includes(',') && !formPersen.includes('.')) return;

    e.preventDefault();
  }

  function handlePersenBlur() {
    if (formPersen.trim()) {
      formPersen = formatPercentage(parsePercentage(formPersen));
    }
  }

  // Ketika persen diinput: filter karakter non-angka/desimal, lalu hitung harga_jual
  // (sama dengan persen_jual_event di kasirku lama)
  function handlePersenInput(val: string) {
    // Izinkan hanya digit dan satu tanda desimal (, atau .)
    let cleaned = val.replace(/[^\d.,]/g, '');

    // Normalisasi: ganti titik desimal jadi koma, cegah lebih dari satu tanda desimal
    const parts = cleaned.split(/[,.]/);
    if (parts.length > 2) {
      cleaned = parts[0] + ',' + parts.slice(1).join('');
    } else if (cleaned.includes('.')) {
      cleaned = cleaned.replace('.', ',');
    }

    formPersen = cleaned;

    // parseIDR → nilai dalam sen
    const modalNum = parseIDR(formModal);
    if (modalNum <= 0) {
      formPersen = '0,00';
      toast.error('Harga modal harus dimasukkan terlebih dahulu.');
      return;
    }

    const persenNum = parsePercentage(formPersen);
    if (isNaN(persenNum)) return;

    // Hitung harga jual dalam sen untuk formatIDR
    const calculatedJualSen = Math.round(modalNum + (modalNum * (persenNum / 100)));
    formJual = formatIDR(calculatedJualSen);
  }

  function calculateSellingPrice() {
    // Helper: hitung harga jual dari persen yang ada
    const modalNum = parseIDR(formModal);
    const persenNum = parsePercentage(formPersen);
    if (modalNum > 0) {
      const calculatedJualSen = Math.round(modalNum + (modalNum * (persenNum / 100)));
      formJual = formatIDR(calculatedJualSen);
    }
  }

  function parsePercentage(value: string): number {
    if (!value) return 0;
    const normalized = value.replace(',', '.');
    const parsed = Number(normalized);
    return Number.isFinite(parsed) ? parsed : 0;
  }

  function formatPercentage(value: number): string {
    if (!Number.isFinite(value)) return '0,00';
    return value.toFixed(2).replace('.', ',');
  }

  function clearFieldError(field: string) {
    if (fieldErrors[field]) {
      const next = { ...fieldErrors };
      delete next[field];
      fieldErrors = next;
    }
  }

  function setFieldError(field: string, message: string) {
    fieldErrors = { ...fieldErrors, [field]: message };
  }

  function generateRandomBarcode() {
    const timestamp = Date.now().toString().slice(-6);
    const random = Math.floor(1000 + Math.random() * 9000);
    formBarcode = `899${timestamp}${random}`;
  }

  function resetFormGambar(preview: string | null = null) {
    formGambarPreview = preview;
    formGambarBase64 = null;
    formGambarRemoved = false;
    isProcessingGambar = false;
  }

  function triggerGambarPick() {
    gambarInput?.click();
  }

  // Resize & kompres di sisi klien agar payload base64 tetap kecil
  function processImageFile(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onerror = () => reject(new Error('Gagal membaca file gambar.'));
      reader.onload = () => {
        const dataUrl = reader.result as string;
        const img = new Image();
        img.onerror = () => reject(new Error('File gambar tidak valid.'));
        img.onload = () => {
          const MAX = 800;
          let { width, height } = img;
          if (width > MAX || height > MAX) {
            const scale = Math.min(MAX / width, MAX / height);
            width = Math.round(width * scale);
            height = Math.round(height * scale);
          }
          const canvas = document.createElement('canvas');
          canvas.width = width;
          canvas.height = height;
          const ctx = canvas.getContext('2d');
          if (!ctx) return reject(new Error('Gagal memproses gambar.'));
          // Latar putih agar JPEG tidak menjadi hitam pada area transparan
          ctx.fillStyle = '#ffffff';
          ctx.fillRect(0, 0, width, height);
          ctx.drawImage(img, 0, 0, width, height);
          const isPng = file.type === 'image/png';
          const out = canvas.toDataURL(isPng ? 'image/png' : 'image/jpeg', 0.85);
          resolve(out.split(',')[1] || '');
        };
        img.src = dataUrl;
      };
      reader.readAsDataURL(file);
    });
  }

  async function handleGambarChange(event: Event) {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    if (!file) return;

    if (!['image/jpeg', 'image/png'].includes(file.type)) {
      toast.error('Hanya file gambar JPG atau PNG yang didukung.');
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      toast.error('Ukuran gambar maksimal 5 MB.');
      return;
    }

    isProcessingGambar = true;
    try {
      const base64 = await processImageFile(file);
      formGambarBase64 = base64;
      formGambarPreview = `data:${file.type};base64,${base64}`;
      formGambarRemoved = false;
    } catch (err: any) {
      toast.error(err.message || 'Gagal memproses gambar.');
    } finally {
      isProcessingGambar = false;
    }
  }

  function handleRemoveGambar() {
    formGambarPreview = null;
    formGambarBase64 = null;
    formGambarRemoved = true;
  }

  function openAddModal() {
    isEditing = false;
    editingId = null;
    formNama = '';
    formBarcode = '';
    formKategoriId = kategoriList.length > 0 ? kategoriList[0].id : 1;
    formStok = '';
    formModal = '';
    formJual = '';
    formPersen = '20,00';
    formErrorMessage = null;
    fieldErrors = {};
    isCreatingKategori = false;
    newKategoriName = '';
    newKategoriError = null;
    resetFormGambar();
    isModalOpen = true;
  }

  function openEditModal(item: BarangItem) {
    isEditing = true;
    editingId = item.id;
    formNama = item.nama_barang;
    formBarcode = item.barcode_barang || '';
    formKategoriId = item.kategori_barang_id;
    formStok = formatThousandSeparator(item.stok_barang);
    // harga_modal dan harga_jual dari server adalah integer dalam sen
    formModal = formatIDR(item.harga_modal);
    formJual = formatIDR(item.harga_jual);

    const modalSen = item.harga_modal;
    const jualSen = item.harga_jual;
    if (modalSen > 0) {
      formPersen = formatPercentage(((jualSen - modalSen) / modalSen) * 100);
    } else {
      formPersen = '0,00';
    }

    formErrorMessage = null;
    fieldErrors = {};
    isCreatingKategori = false;
    newKategoriName = '';
    newKategoriError = null;
    resetFormGambar(item.gambar_barang || null);
    isModalOpen = true;
  }

  async function handleQuickCreateKategori() {
    newKategoriError = null;
    if (!newKategoriName.trim()) {
      newKategoriError = 'Nama kategori baru wajib diisi.';
      return;
    }
    try {
      const params = new URLSearchParams({ nama_kategori: newKategoriName.trim() });
      const res = await api.post('/kategori_barang', params);
      const newKat = typeof res === 'string' ? JSON.parse(res) : res;
      if (newKat && newKat.id) {
        kategoriList = [...kategoriList, { id: newKat.id, nama_kategori: newKat.nama_kategori }];
        formKategoriId = newKat.id;
        newKategoriName = '';
        newKategoriError = null;
        isCreatingKategori = false;
        clearFieldError('kategori');
        toast.success(`Kategori "${newKat.nama_kategori}" berhasil ditambahkan!`);
      }
    } catch (err: any) {
      toast.error('Gagal membuat kategori: ' + (err.message || ''));
    }
  }

  async function handleSaveBarang() {
    formErrorMessage = null;
    fieldErrors = {};

    // parseIDR menghasilkan nilai dalam sen (integer), identik dengan kasirku lama
    const modalNum = parseIDR(formModal);
    const jualNum = parseIDR(formJual);
    let hasErrors = false;

    if (!formNama.trim()) {
      setFieldError('nama', 'Nama barang wajib diisi.');
      hasErrors = true;
    }

    if (!formKategoriId || formKategoriId <= 0) {
      setFieldError('kategori', 'Kategori produk wajib dipilih.');
      hasErrors = true;
    }

    const cleanStok = String(formStok).replace(/\./g, '').trim();
    if (cleanStok === '') {
      setFieldError('stok', 'Jumlah stok wajib diisi.');
      hasErrors = true;
    } else if (Number(cleanStok) < 0 || Number.isNaN(Number(cleanStok))) {
      setFieldError('stok', 'Jumlah stok tidak valid.');
      hasErrors = true;
    }

    if (formModal.trim() === '') {
      setFieldError('harga_modal', 'Harga modal wajib diisi.');
      hasErrors = true;
    } else if (modalNum <= 0) {
      setFieldError('harga_modal', 'Harga modal harus lebih besar dari Rp0.');
      hasErrors = true;
    }

    if (formJual.trim() === '') {
      setFieldError('harga_jual', 'Harga jual wajib diisi.');
      hasErrors = true;
    } else if (jualNum <= 0) {
      setFieldError('harga_jual', 'Harga jual harus lebih besar dari Rp0.');
      hasErrors = true;
    }

    if (hasErrors) return;

    isSubmitting = true;
    try {
      const body = new URLSearchParams({
        nama_barang: formNama.trim(),
        stok_barang: cleanStok,
        kategori_barang_id: String(formKategoriId),
        harga_modal: String(modalNum),   // nilai dalam sen, kirim ke server
        harga_jual: String(jualNum),     // nilai dalam sen, kirim ke server
        barcode_barang: formBarcode.trim() || '',
      });

      // gambar_barang: base64 baru = ganti foto, "null" = hapus foto, tidak dikirim = tanpa perubahan
      if (formGambarBase64) {
        body.set('gambar_barang', formGambarBase64);
      } else if (formGambarRemoved) {
        body.set('gambar_barang', 'null');
      }

      if (isEditing && editingId) {
        body.set('id', String(editingId));
        await api.patch('/barang', body);
        toast.success(`Produk "${formNama}" berhasil diperbarui!`);
      } else {
        await api.post('/barang', body);
        toast.success(`Produk "${formNama}" berhasil ditambahkan ke inventaris!`);
      }

      isModalOpen = false;
      await loadData();
    } catch (err: any) {
      if (err.status === 403 && err.message === '1') {
        formErrorMessage = 'Barcode atau nama barang sudah terdaftar untuk produk lain.';
      } else {
        formErrorMessage = err.message || 'Gagal menyimpan barang.';
      }
    } finally {
      isSubmitting = false;
    }
  }

  async function handleDeleteBarang(item: BarangItem) {
    let confirmed = await confirmDialog.show({
      title: 'Hapus Produk dari Daftar Barang?',
      message: `Apakah Anda yakin ingin menghapus "${item.nama_barang}"? Tindakan ini akan menghapus data produk dari katalog sistem.`,
      confirmLabel: 'Hapus Produk',
      cancelLabel: 'Batal',
      variant: 'danger',
    });

    if (!confirmed) return;

    try {
      let res = await api.delete('/barang', new URLSearchParams({ id: String(item.id), force: 0 }));
      if (res === "1") {
        confirmed = await confirmDialog.show({
          title: 'Konfirmasi Hapus Produk',
          message: `Barang "${item.nama_barang}" masih memiliki data Barang Masuk atau Retur Barang. Jika produk ini dihapus, seluruh data Barang Masuk dan Retur Barang yang terkait juga akan ikut terhapus. Apakah Anda yakin ingin melanjutkan?`,
          confirmLabel: 'Hapus Produk',
          cancelLabel: 'Batal',
          variant: 'danger',
        });

        if (!confirmed) return;

        res = await api.delete('/barang', new URLSearchParams({ id: String(item.id), force: 1 }));
      }
      toast.success(`Produk "${item.nama_barang}" berhasil dihapus.`);
      barangList = barangList.filter((b) => b.id !== item.id);
    } catch (err: any) {
      toast.error('Gagal menghapus produk: ' + (err.message || ''));
    }
  }

  function normalizeCsvNumber(raw: string | null | undefined): number {
    if (raw === null || raw === undefined) return 0;
    let s = String(raw).trim().replace(/rp/gi, '').replace(/\s/g, '');
    if (!s) return 0;
    const hasDot = s.includes('.');
    const hasComma = s.includes(',');
    if (hasDot && hasComma) {
      if (s.lastIndexOf(',') > s.lastIndexOf('.')) s = s.replace(/\./g, '').replace(',', '.');
      else s = s.replace(/,/g, '');
    } else if (hasComma) {
      const parts = s.split(',');
      if (parts.length === 2 && parts[1].length === 3) s = s.replace(/,/g, '');
      else s = s.replace(/,/g, '.');
    } else if (hasDot) {
      const parts = s.split('.');
      if (parts[parts.length - 1].length === 3) s = s.replace(/\./g, '');
    }
    const n = Number(s);
    return Number.isFinite(n) ? n : 0;
  }

  function exportCsv() {
    if (filteredBarang.length === 0) {
      toast.warning('Tidak ada data barang untuk diekspor.');
      return;
    }
    const headers = ['Nama Barang', 'Barcode', 'Kategori', 'Stok', 'Harga Modal', 'Harga Jual'];
    const rows = filteredBarang.map((b) => [
      b.nama_barang,
      b.barcode_barang || '',
      b.nama_kategori || kategoriList.find((k) => k.id === b.kategori_barang_id)?.nama_kategori || 'Tanpa Kategori',
      b.stok_barang,
      (Number(b.harga_modal) / 100).toFixed(2),
      (Number(b.harga_jual) / 100).toFixed(2),
    ]);
    const csv = buildCsv(headers, rows);
    const stamp = formatDateTime(Date.now()).replace(/[: ]/g, '-');
    downloadCsv(`daftar_barang_${stamp}.csv`, csv);
    toast.success(`Berhasil mengekspor ${rows.length} barang ke CSV.`);
  }

  function triggerImport() {
    importInput?.click();
  }

  async function handleImportFile(event: Event) {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    if (!file) return;

    isImporting = true;
    try {
      const text = await file.text();
      const parsed = parseCsv(text);
      if (parsed.length < 2) {
        toast.error('File CSV kosong atau tidak berisi baris data.');
        return;
      }

      const header = parsed[0].map((h) => h.trim().toLowerCase());
      const findCol = (...names: string[]) => header.findIndex((h) => names.includes(h));

      const iNama = findCol('nama barang', 'nama_barang', 'nama', 'product name', 'product');
      const iBarcode = findCol('barcode', 'barcode_barang', 'kode', 'kode barang', 'sku');
      const iKategori = findCol('kategori', 'kategori_barang', 'category');
      const iStok = findCol('stok', 'stok_barang', 'stock', 'qty', 'jumlah');
      const iModal = findCol('harga modal', 'harga_modal', 'modal', 'harga beli', 'cost');
      const iJual = findCol('harga jual', 'harga_jual', 'jual', 'harga', 'price', 'sell price');

      if (iNama < 0) {
        toast.error('Kolom "Nama Barang" tidak ditemukan pada file CSV.');
        return;
      }

      const rows: any[] = [];
      for (let r = 1; r < parsed.length; r++) {
        const cols = parsed[r];
        const nama = (cols[iNama] || '').trim();
        if (!nama) continue;
        rows.push({
          nama_barang: nama,
          barcode: iBarcode >= 0 ? (cols[iBarcode] || '').trim() : '',
          kategori: iKategori >= 0 ? (cols[iKategori] || '').trim() : '',
          stok: iStok >= 0 ? Math.max(0, Math.floor(normalizeCsvNumber(cols[iStok]))) : 0,
          harga_modal: iModal >= 0 ? normalizeCsvNumber(cols[iModal]) : 0,
          harga_jual: iJual >= 0 ? normalizeCsvNumber(cols[iJual]) : 0,
        });
      }

      if (rows.length === 0) {
        toast.error('Tidak ada baris data valid yang bisa diimpor.');
        return;
      }

      const res = await api.post('/import_barang', { rows });
      const result = typeof res === 'string' ? JSON.parse(res) : res;

      let msg = `${result.created || 0} ditambahkan, ${result.updated || 0} diperbarui`;
      if (result.skipped) msg += `, ${result.skipped} dilewati`;
      toast.success(`Impor selesai: ${msg}.`);

      if (Array.isArray(result.errors) && result.errors.length > 0) {
        const detail = result.errors
          .slice(0, 3)
          .map((e: any) => `Baris ${e.row}: ${e.message}`)
          .join('\n');
        toast.warning(`${result.errors.length} baris bermasalah.\n${detail}`, 'Detail Impor');
      }

      await loadData();
    } catch (err: any) {
      toast.error('Gagal mengimpor CSV: ' + (err.message || ''));
    } finally {
      isImporting = false;
    }
  }

  function checkUrlCategory() {
    if (typeof window === 'undefined') return;
    const params = new URLSearchParams(window.location.search);
    const katParam = params.get('kategori') || params.get('category');
    if (katParam) {
      const parsed = Number(katParam);
      if (!isNaN(parsed) && parsed > 0) {
        selectedKategori = parsed;
      }
    }
  }

  // SSE real-time sync
  let unsubscribeSse: (() => void) | null = null;
  onMount(() => {
    checkUrlCategory();
    loadData();

    unsubscribeSse = sse.subscribe((msg) => {
      if (!msg) return;
      if (msg.type === 2) {
        // Barang events
        if (msg.code === 'TAMBAH_BARANG' || msg.code === 'UPDATE_BARANG' || msg.code === 'DELETE_BARANG') {
          loadData();
        }
      } else if (msg.type === 3) {
        // Kategori events
        api.get<KategoriItem[]>('/api/kategori_barang').then((kat) => {
          kategoriList = Array.isArray(kat) ? kat : [];
        }).catch(() => {});
      }
    });
  });

  $effect(() => {
    if (router.search) {
      checkUrlCategory();
    }
  });

  onDestroy(() => {
    if (unsubscribeSse) unsubscribeSse();
  });

  // Derived filtered & sorted list
  const filteredBarang = $derived.by(() => {
    const q = searchQuery.toLowerCase().trim();
    let res = barangList.filter((b) => {
      const matchQuery =
        !q ||
        b.nama_barang.toLowerCase().includes(q) ||
        (b.barcode_barang && b.barcode_barang.toLowerCase().includes(q));

      const matchKategori =
        selectedKategori === 'all' || b.kategori_barang_id === Number(selectedKategori);

      const matchStok =
        selectedStokStatus === 'all' ||
        (selectedStokStatus === 'safe' && b.stok_barang > 10) ||
        (selectedStokStatus === 'low' && b.stok_barang > 0 && b.stok_barang <= 10) ||
        (selectedStokStatus === 'out' && b.stok_barang === 0);

      return matchQuery && matchKategori && matchStok;
    });

    // Sorting
    res.sort((a, b) => {
      switch (sortBy) {
        case 'id_asc':
          return a.id - b.id;
        case 'id_desc':
          return b.id - a.id;
        case 'nama_asc':
          return a.nama_barang.localeCompare(b.nama_barang, 'id', { sensitivity: 'base' });
        case 'nama_desc':
          return b.nama_barang.localeCompare(a.nama_barang, 'id', { sensitivity: 'base' });
        case 'stok_asc':
          return a.stok_barang - b.stok_barang;
        case 'stok_desc':
          return b.stok_barang - a.stok_barang;
        case 'margin_desc': {
          const marginA = a.harga_jual - a.harga_modal;
          const marginB = b.harga_jual - b.harga_modal;
          return marginB - marginA;
        }
        case 'margin_asc': {
          const marginA = a.harga_jual - a.harga_modal;
          const marginB = b.harga_jual - b.harga_modal;
          return marginA - marginB;
        }
        case 'harga_modal_asc':
          return a.harga_modal - b.harga_modal;
        case 'harga_modal_desc':
          return b.harga_modal - a.harga_modal;
        case 'harga_jual_asc':
          return a.harga_jual - b.harga_jual;
        case 'harga_jual_desc':
          return b.harga_jual - a.harga_jual;
        case 'barcode_asc':
          return (a.barcode_barang || '').localeCompare(b.barcode_barang || '', 'id');
        case 'barcode_desc':
          return (b.barcode_barang || '').localeCompare(a.barcode_barang || '', 'id');
        case 'kategori_asc': {
          const katA = kategoriList.find((k) => k.id === a.kategori_barang_id)?.nama_kategori || '';
          const katB = kategoriList.find((k) => k.id === b.kategori_barang_id)?.nama_kategori || '';
          return katA.localeCompare(katB, 'id', { sensitivity: 'base' });
        }
        case 'kategori_desc': {
          const katA = kategoriList.find((k) => k.id === a.kategori_barang_id)?.nama_kategori || '';
          const katB = kategoriList.find((k) => k.id === b.kategori_barang_id)?.nama_kategori || '';
          return katB.localeCompare(katA, 'id', { sensitivity: 'base' });
        }
        case 'recent':
          return (b.modified_ms || b.created_ms || 0) - (a.modified_ms || a.created_ms || 0);
        default:
          return 0;
      }
    });

    return res;
  });

  function handleHeaderSort(col: 'id' | 'nama' | 'barcode' | 'kategori' | 'stok' | 'harga_modal' | 'harga_jual' | 'margin') {
    if (col === 'id') {
      sortBy = sortBy === 'id_asc' ? 'id_desc' : 'id_asc';
    } else if (col === 'nama') {
      sortBy = sortBy === 'nama_asc' ? 'nama_desc' : 'nama_asc';
    } else if (col === 'barcode') {
      sortBy = sortBy === 'barcode_asc' ? 'barcode_desc' : 'barcode_asc';
    } else if (col === 'kategori') {
      sortBy = sortBy === 'kategori_asc' ? 'kategori_desc' : 'kategori_asc';
    } else if (col === 'stok') {
      sortBy = sortBy === 'stok_asc' ? 'stok_desc' : 'stok_asc';
    } else if (col === 'harga_modal') {
      sortBy = sortBy === 'harga_modal_asc' ? 'harga_modal_desc' : 'harga_modal_asc';
    } else if (col === 'harga_jual') {
      sortBy = sortBy === 'harga_jual_asc' ? 'harga_jual_desc' : 'harga_jual_asc';
    } else if (col === 'margin') {
      sortBy = sortBy === 'margin_desc' ? 'margin_asc' : 'margin_desc';
    }
  }

  // Summary Metrics
  const summaryMetrics = $derived.by(() => {
    const totalItems = barangList.length;
    const totalUnits = barangList.reduce((acc, b) => acc + (b.stok_barang || 0), 0);
    const totalModalValue = barangList.reduce(
      (acc, b) => acc + (b.stok_barang || 0) * (b.harga_modal || 0),
      0
    );
    const totalJualValue = barangList.reduce(
      (acc, b) => acc + (b.stok_barang || 0) * (b.harga_jual || 0),
      0
    );
    const lowStockCount = barangList.filter((b) => b.stok_barang <= 10).length;

    return {
      totalItems,
      totalUnits,
      totalModalValue,
      totalJualValue,
      lowStockCount,
    };
  });

  // Paginated View
  const paginatedBarang = $derived.by(() => {
    const start = (currentPage - 1) * pageSize;
    return filteredBarang.slice(start, start + pageSize);
  });

  const totalPages = $derived(Math.ceil(filteredBarang.length / pageSize) || 1);
</script>

<div class="space-y-6">
  <input
    type="file"
    accept=".csv,text/csv"
    bind:this={importInput}
    onchange={handleImportFile}
    class="hidden"
  />

  <!-- Page Header -->
  <div class="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 border-b border-[var(--border-subtle)] pb-3">
    <div class="flex items-center gap-2.5">
      <h1 class="text-xl font-bold tracking-tight text-neutral-900 dark:text-neutral-100 flex items-center gap-2">
        <Package class="w-5 h-5 text-neutral-600 dark:text-neutral-400" />
        <span>Daftar Barang</span>
      </h1>
    </div>

    <div class="flex items-center gap-2">
      <Button
        variant="secondary"
        size="sm"
        onclick={exportCsv}
        title="Ekspor daftar barang ke CSV"
      >
        <Download class="w-3.5 h-3.5" />
        <span class="hidden sm:inline">Export</span>
      </Button>

      <Button
        variant="secondary"
        size="sm"
        onclick={triggerImport}
        loading={isImporting}
        title="Impor daftar barang dari CSV"
      >
        <Upload class="w-3.5 h-3.5" />
        <span class="hidden sm:inline">Import</span>
      </Button>

      <Button
        variant="secondary"
        size="sm"
        onclick={loadData}
        loading={loading}
        title="Refresh data katalog"
      >
        <RefreshCw class="w-3.5 h-3.5" />
        <span class="hidden sm:inline">Refresh</span>
      </Button>

      <Button
        variant="primary"
        size="sm"
        onclick={openAddModal}
      >
        <Plus class="w-4 h-4" />
        <span>Tambah Barang</span>
      </Button>
    </div>
  </div>

  <!-- Filters Toolbar -->
  <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
    <!-- Search Bar (Compact width to avoid clashing with category select) -->
    <div class="w-full sm:w-64 md:w-72 lg:w-80 shrink-0 relative">
      <Input
        id="search-barang-input"
        bind:value={searchQuery}
        placeholder="Cari nama barang atau barcode (scan)…"
        clearable
        class="h-9 text-xs"
      >
        {#snippet prefix()}
          <Search class="w-3.5 h-3.5" />
        {/snippet}
      </Input>
    </div>

    <!-- Category & Status Filters -->
    <div class="grid grid-cols-1 sm:grid-cols-3 md:flex items-center gap-2 w-full sm:w-auto">
      <Select
        bind:value={selectedKategori}
        class="w-full sm:w-auto sm:min-w-[140px]"
        selectClass="h-9 text-xs"
      >
        <option value="all">Semua Kategori ({kategoriList.length})</option>
        {#each kategoriList as kat}
          <option value={kat.id}>{kat.nama_kategori}</option>
        {/each}
      </Select>

      <!-- Stock Status Filter -->
      <Select
        bind:value={selectedStokStatus}
        class="w-full sm:w-auto sm:min-w-[130px]"
        selectClass="h-9 text-xs"
      >
        <option value="all">Semua Stok</option>
        <option value="safe">Stok Aman (&gt;10)</option>
        <option value="low">Menipis (1-10)</option>
        <option value="out">Habis (0)</option>
      </Select>

      <!-- Sort Filter -->
      <Select
        bind:value={sortBy}
        class="w-full sm:w-auto sm:min-w-[140px]"
        selectClass="h-9 text-xs"
      >
        <option value="id_asc">ID (1-9)</option>
        <option value="id_desc">ID (9-1)</option>
        <option value="nama_asc">Nama (A-Z)</option>
        <option value="nama_desc">Nama (Z-A)</option>
        <option value="stok_asc">Stok Terendah</option>
        <option value="stok_desc">Stok Tertinggi</option>
        <option value="margin_desc">Margin Tertinggi</option>
        <option value="recent">Terakhir Diubah</option>
      </Select>
    </div>
  </div>

  <!-- Products Table / Mobile Card List -->
  <div class="rounded-md border border-[var(--border-subtle)] bg-[var(--bg-surface)] overflow-hidden">
    <div class="overflow-x-auto">
      <table class="w-full text-left text-xs border-collapse min-w-[850px]">
        <thead>
          <tr class="border-b border-[var(--border-subtle)] bg-[var(--bg-subtle)] text-[var(--text-muted)] font-medium text-[11px]">
            <th class="py-2.5 px-4 w-16">
              <button
                type="button"
                class="flex items-center gap-1 hover:text-[var(--text-primary)] transition-colors text-[11px] font-medium"
                onclick={() => handleHeaderSort('id')}
              >
                <span>ID</span>
                {#if sortBy === 'id_asc'}
                  <ArrowUp class="w-3 h-3 text-[var(--brand)]" />
                {:else if sortBy === 'id_desc'}
                  <ArrowDown class="w-3 h-3 text-[var(--brand)]" />
                {:else}
                  <ArrowUpDown class="w-3 h-3 opacity-40" />
                {/if}
              </button>
            </th>
            <th class="py-2.5 px-4">
              <button
                type="button"
                class="flex items-center gap-1 hover:text-[var(--text-primary)] transition-colors text-[11px] font-medium"
                onclick={() => handleHeaderSort('nama')}
              >
                <span>Produk</span>
                {#if sortBy === 'nama_asc'}
                  <ArrowUp class="w-3 h-3 text-[var(--brand)]" />
                {:else if sortBy === 'nama_desc'}
                  <ArrowDown class="w-3 h-3 text-[var(--brand)]" />
                {:else}
                  <ArrowUpDown class="w-3 h-3 opacity-40" />
                {/if}
              </button>
            </th>
            <th class="py-2.5 px-4">
              <button
                type="button"
                class="flex items-center gap-1 hover:text-[var(--text-primary)] transition-colors text-[11px] font-medium"
                onclick={() => handleHeaderSort('barcode')}
              >
                <span>Barcode</span>
                {#if sortBy === 'barcode_asc'}
                  <ArrowUp class="w-3 h-3 text-[var(--brand)]" />
                {:else if sortBy === 'barcode_desc'}
                  <ArrowDown class="w-3 h-3 text-[var(--brand)]" />
                {:else}
                  <ArrowUpDown class="w-3 h-3 opacity-40" />
                {/if}
              </button>
            </th>
            <th class="py-2.5 px-4 text-center">
              <button
                type="button"
                class="inline-flex items-center justify-center gap-1 hover:text-[var(--text-primary)] transition-colors text-[11px] font-medium mx-auto"
                onclick={() => handleHeaderSort('kategori')}
              >
                <span>Kategori</span>
                {#if sortBy === 'kategori_asc'}
                  <ArrowUp class="w-3 h-3 text-[var(--brand)]" />
                {:else if sortBy === 'kategori_desc'}
                  <ArrowDown class="w-3 h-3 text-[var(--brand)]" />
                {:else}
                  <ArrowUpDown class="w-3 h-3 opacity-40" />
                {/if}
              </button>
            </th>
            <th class="py-2.5 px-4 text-right">
              <button
                type="button"
                class="inline-flex items-center gap-1 hover:text-[var(--text-primary)] transition-colors text-[11px] font-medium ml-auto"
                onclick={() => handleHeaderSort('stok')}
              >
                <span>Stok</span>
                {#if sortBy === 'stok_asc'}
                  <ArrowUp class="w-3 h-3 text-[var(--brand)]" />
                {:else if sortBy === 'stok_desc'}
                  <ArrowDown class="w-3 h-3 text-[var(--brand)]" />
                {:else}
                  <ArrowUpDown class="w-3 h-3 opacity-40" />
                {/if}
              </button>
            </th>
            <th class="py-2.5 px-4 text-right">
              <button
                type="button"
                class="inline-flex items-center gap-1 hover:text-[var(--text-primary)] transition-colors text-[11px] font-medium ml-auto"
                onclick={() => handleHeaderSort('harga_modal')}
              >
                <span>Harga Modal</span>
                {#if sortBy === 'harga_modal_asc'}
                  <ArrowUp class="w-3 h-3 text-[var(--brand)]" />
                {:else if sortBy === 'harga_modal_desc'}
                  <ArrowDown class="w-3 h-3 text-[var(--brand)]" />
                {:else}
                  <ArrowUpDown class="w-3 h-3 opacity-40" />
                {/if}
              </button>
            </th>
            <th class="py-2.5 px-4 text-right">
              <button
                type="button"
                class="inline-flex items-center gap-1 hover:text-[var(--text-primary)] transition-colors text-[11px] font-medium ml-auto"
                onclick={() => handleHeaderSort('harga_jual')}
              >
                <span>Harga Jual</span>
                {#if sortBy === 'harga_jual_asc'}
                  <ArrowUp class="w-3 h-3 text-[var(--brand)]" />
                {:else if sortBy === 'harga_jual_desc'}
                  <ArrowDown class="w-3 h-3 text-[var(--brand)]" />
                {:else}
                  <ArrowUpDown class="w-3 h-3 opacity-40" />
                {/if}
              </button>
            </th>
            <th class="py-2.5 px-4 text-right">
              <button
                type="button"
                class="inline-flex items-center gap-1 hover:text-[var(--text-primary)] transition-colors text-[11px] font-medium ml-auto"
                onclick={() => handleHeaderSort('margin')}
              >
                <span>Margin / Unit</span>
                {#if sortBy === 'margin_asc'}
                  <ArrowUp class="w-3 h-3 text-[var(--brand)]" />
                {:else if sortBy === 'margin_desc'}
                  <ArrowDown class="w-3 h-3 text-[var(--brand)]" />
                {:else}
                  <ArrowUpDown class="w-3 h-3 opacity-40" />
                {/if}
              </button>
            </th>
            <th class="py-2.5 px-4 text-center w-24">Action</th>
          </tr>
        </thead>
        <tbody class="divide-y divide-[var(--border-subtle)]">
          {#if loading}
            {#each Array(5) as _}
              <tr>
                <td class="p-3"><Skeleton class="h-4 w-8" /></td>
                <td class="p-3"><Skeleton class="h-4 w-36" /></td>
                <td class="p-3"><Skeleton class="h-4 w-20" /></td>
                <td class="p-3"><Skeleton class="h-4 w-16" /></td>
                <td class="p-3 text-right"><Skeleton class="h-4 w-10 ml-auto" /></td>
                <td class="p-3 text-right"><Skeleton class="h-4 w-16 ml-auto" /></td>
                <td class="p-3 text-right"><Skeleton class="h-4 w-16 ml-auto" /></td>
                <td class="p-3 text-right"><Skeleton class="h-4 w-14 ml-auto" /></td>
                <td class="p-3 text-center"><Skeleton class="h-6 w-14 mx-auto" /></td>
              </tr>
            {/each}
          {:else if paginatedBarang.length === 0}
            <tr>
              <td colspan="9" class="py-12 text-center text-[var(--text-muted)]">
                <Package class="w-8 h-8 mx-auto mb-2 opacity-40" />
                <p class="font-medium text-xs">Tidak ada data barang yang sesuai.</p>
                <p class="text-[11px] mt-0.5 opacity-75">Coba ubah kata kunci pencarian atau bersihkan filter.</p>
              </td>
            </tr>
          {:else}
            {#each paginatedBarang as item (item.id)}
              {@const marginVal = item.harga_jual - item.harga_modal}
              {@const marginPercent = item.harga_modal > 0 ? ((marginVal / item.harga_modal) * 100).toFixed(0) : '0'}
              <tr class="hover:bg-[var(--bg-hover)] transition-colors">
                <!-- ID Produk -->
                <td class="py-2.5 px-4 tabular-nums text-[var(--text-muted)] text-xs font-medium">
                  {item.id}
                </td>

                <!-- Nama Produk -->
                <td class="py-2.5 px-4">
                  <div class="flex items-center gap-2.5">
                    <div class="w-8 h-8 shrink-0 rounded-md border border-[var(--border-subtle)] bg-[var(--bg-subtle)] overflow-hidden flex items-center justify-center">
                      {#if item.gambar_barang}
                        <button
                          type="button"
                          onclick={() => { previewItem = item; previewOpen = true; }}
                          title="Perbesar foto {item.nama_barang}"
                          aria-label="Perbesar foto {item.nama_barang}"
                          class="w-full h-full relative group/photo cursor-zoom-in"
                        >
                          <img src={item.gambar_barang} alt={item.nama_barang} class="w-full h-full object-cover group-hover/photo:scale-110 transition-transform duration-200" loading="lazy" />
                          <span class="absolute inset-0 flex items-center justify-center bg-black/40 text-white opacity-0 group-hover/photo:opacity-100 transition-opacity">
                            <ZoomIn class="w-3.5 h-3.5" />
                          </span>
                        </button>
                      {:else}
                        <ImageIcon class="w-4 h-4 text-neutral-300 dark:text-neutral-600" />
                      {/if}
                    </div>
                    <div class="font-medium text-[var(--text-primary)] text-xs sm:text-sm">
                      {item.nama_barang}
                    </div>
                  </div>
                </td>

                <!-- Barcode -->
                <td class="py-2.5 px-4 tabular-nums">
                  {#if item.barcode_barang}
                    <span class="inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded border border-[var(--border-subtle)] bg-[var(--bg-subtle)] text-[var(--text-secondary)] font-medium">
                      <Barcode class="w-3 h-3 opacity-60" />
                      {item.barcode_barang}
                    </span>
                  {:else}
                    <span class="text-[var(--text-muted)] text-[11px]">-</span>
                  {/if}
                </td>

                <!-- Kategori -->
                <td class="py-2.5 px-4 text-center">
                  <span class="inline-block text-[11px] px-2 py-0.5 rounded border border-[var(--border-subtle)] bg-[var(--bg-subtle)] text-[var(--text-secondary)] font-medium">
                    {item.nama_kategori || 'Tanpa Kategori'}
                  </span>
                </td>

                <!-- Stok -->
                <td class="py-2.5 px-4 text-right tabular-nums text-[var(--text-primary)] font-medium text-xs">
                  {formatNumber(item.stok_barang)}
                </td>

                <!-- Harga Modal -->
                <td class="py-2.5 px-4 text-right tabular-nums text-[var(--text-muted)] text-xs">
                  {formatRupiah(item.harga_modal)}
                </td>

                <!-- Harga Jual -->
                <td class="py-2.5 px-4 text-right tabular-nums font-semibold text-[var(--text-primary)] text-xs">
                  {formatRupiah(item.harga_jual)}
                </td>

                <!-- Margin -->
                <td class="py-2.5 px-4 text-right tabular-nums text-xs">
                  <div class="text-emerald-600 dark:text-emerald-400 font-medium">
                    +{formatRupiah(marginVal)}
                  </div>
                  <div class="text-[10px] text-[var(--text-muted)]">
                    +{marginPercent}%
                  </div>
                </td>

                <!-- Aksi -->
                <td class="py-2.5 px-4 text-center">
                  <div class="flex items-center justify-center gap-1.5">
                    <button
                      type="button"
                      onclick={() => openEditModal(item)}
                      title="Edit Produk"
                      class="p-1.5 rounded-md border border-[var(--border-subtle)] bg-[var(--bg-surface)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:border-[var(--border-contrast)] hover:bg-[var(--bg-hover)] transition-colors flex items-center justify-center"
                    >
                      <Pencil class="w-3.5 h-3.5" />
                    </button>
                    <button
                      type="button"
                      onclick={() => handleDeleteBarang(item)}
                      title="Hapus Produk"
                      class="p-1.5 rounded-md border border-[var(--border-subtle)] bg-[var(--bg-surface)] text-[var(--text-muted)] hover:text-red-600 dark:hover:text-red-400 hover:border-red-300 dark:hover:border-red-900/50 hover:bg-red-50 dark:hover:bg-red-950/30 transition-colors flex items-center justify-center"
                    >
                      <Trash2 class="w-3.5 h-3.5" />
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
      totalItems={filteredBarang.length}
      currentItemsCount={paginatedBarang.length}
      itemLabel="produk"
      storageKey="daftar_barang_limit"
    />
  </div>
</div>

<!-- Modal Tambah/Edit Produk -->
<Modal
  open={isModalOpen}
  title={isEditing ? 'Edit Barang' : 'Tambah Barang'}
  size="xl"
  onclose={() => (isModalOpen = false)}
>
  <form novalidate onsubmit={(e) => { e.preventDefault(); handleSaveBarang(); }} class="space-y-4">
    {#if formErrorMessage}
      <div class="p-3 rounded-md bg-red-50 dark:bg-red-950/40 border border-red-500/30 text-red-700 dark:text-red-400 text-xs flex items-center gap-2">
        <AlertTriangle class="w-4 h-4 shrink-0" />
        <span>{formErrorMessage}</span>
      </div>
    {/if}

    <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
      <!-- Nama Barang -->
      <div class="md:col-span-2">
        <Input
          id="barang-nama"
          label="Nama Barang / Produk"
          bind:value={formNama}
          placeholder="Contoh: Kopi Susu Gula Aren 250ml"
          required
          autofocus
          error={fieldErrors.nama}
          oninput={() => {
            if (formNama.trim()) clearFieldError('nama');
          }}
          onblur={() => {
            if (!formNama.trim()) setFieldError('nama', 'Nama barang wajib diisi.');
          }}
        />
      </div>

      <!-- Barcode Scanner Field -->
      <div>
        <Input
          id="barang-barcode"
          label="Barcode / Kode Produk"
          bind:value={formBarcode}
          placeholder="Scan barcode fisik atau kosongkan"
        >
          {#snippet prefix()}
            <Barcode class="w-4 h-4" />
          {/snippet}
          {#snippet suffix()}
            <button
              type="button"
              onclick={generateRandomBarcode}
              class="text-[10px] px-1.5 py-0.5 rounded border border-neutral-300 dark:border-neutral-700 text-neutral-600 dark:text-neutral-400 hover:text-neutral-900 dark:hover:text-white"
              title="Buat barcode acak"
            >
              Generate
            </button>
          {/snippet}
        </Input>
      </div>

      <!-- Kategori -->
      <div>
        <label for="barang-kategori" class="block text-xs font-medium text-neutral-700 dark:text-neutral-300 mb-1.5 select-none">
          Kategori Produk <span class="text-red-500 dark:text-red-400 font-semibold ml-1">*</span>
        </label>
        {#if isCreatingKategori}
          <div class="flex flex-col gap-1 w-full">
            <div class="flex items-center gap-1.5">
              <Input
                id="new-kategori"
                bind:value={newKategoriName}
                placeholder="Nama kategori baru…"
                class="h-9"
                error={newKategoriError}
                oninput={() => (newKategoriError = null)}
              />
              <Button
                type="button"
                variant="primary"
                size="sm"
                onclick={handleQuickCreateKategori}
              >
                Simpan
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onclick={() => { isCreatingKategori = false; newKategoriError = null; }}
              >
                Batal
              </Button>
            </div>
          </div>
        {:else}
          <div class="flex items-center gap-1.5">
            <Select
              id="barang-kategori"
              bind:value={formKategoriId}
              class="flex-1"
              selectClass="h-9 text-xs"
              error={fieldErrors.kategori}
              onchange={() => clearFieldError('kategori')}
            >
              {#each kategoriList as kat}
                <option value={kat.id}>{kat.nama_kategori}</option>
              {/each}
            </Select>
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onclick={() => (isCreatingKategori = true)}
              title="Tambah Kategori Baru"
            >
              <Plus class="w-3.5 h-3.5" />
            </Button>
          </div>
        {/if}
      </div>

      <!-- Stok Barang -->
      <div>
        <Input
          id="barang-stok"
          label="Jumlah Stok Fisik"
          type="text"
          thousandSeparator
          bind:value={formStok}
          placeholder="0"
          required
          error={fieldErrors.stok}
          oninput={() => {
            if (String(formStok).trim() !== '') clearFieldError('stok');
          }}
          onblur={() => {
            if (String(formStok).trim() === '') setFieldError('stok', 'Jumlah stok wajib diisi.');
          }}
        >
          {#snippet prefix()}
            <Boxes class="w-4 h-4" />
          {/snippet}
        </Input>
      </div>

      <!-- Harga Modal -->
      <div>
        <Input
          id="barang-modal"
          label="Harga Modal (Beli)"
          type="currency"
          bind:value={formModal}
          oninput={handleModalInput}
          onblur={() => {
            if (!formModal.trim() || parseIDR(formModal) <= 0) {
              setFieldError('harga_modal', 'Harga modal wajib diisi.');
            }
          }}
          placeholder="0"
          required
          error={fieldErrors.harga_modal}
        />
      </div>

      <!-- Markup Margin (%) -->
      <div>
        <Input
          id="barang-persen"
          label="Margin Keuntungan (%)"
          type="text"
          bind:value={formPersen}
          onkeydown={handlePersenKeydown}
          oninput={(e) => handlePersenInput((e.target as HTMLInputElement).value)}
          onblur={handlePersenBlur}
          placeholder="20,00"
        >
          {#snippet suffix()}
            <span class="text-xs font-medium">%</span>
          {/snippet}
        </Input>
      </div>

      <!-- Harga Jual -->
      <div>
        <Input
          id="barang-jual"
          label="Harga Jual Konsumen"
          type="currency"
          bind:value={formJual}
          oninput={handleJualInput}
          onblur={() => {
            if (!formJual.trim() || parseIDR(formJual) <= 0) {
              setFieldError('harga_jual', 'Harga jual wajib diisi.');
            }
          }}
          placeholder="0"
          required
          error={fieldErrors.harga_jual}
        />
      </div>
    </div>

    <!-- Foto Produk -->
    <div class="p-3 rounded-lg border border-neutral-200 dark:border-neutral-800 bg-neutral-50/70 dark:bg-neutral-900/50 flex items-center gap-4">
      <div class="w-20 h-20 shrink-0 rounded-md border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-800 overflow-hidden flex items-center justify-center">
        {#if formGambarPreview}
          <img src={formGambarPreview} alt="Foto produk" class="w-full h-full object-cover" />
        {:else}
          <ImageIcon class="w-7 h-7 text-neutral-300 dark:text-neutral-600" />
        {/if}
      </div>
      <div class="min-w-0 space-y-1.5">
        <div class="text-xs font-medium text-neutral-700 dark:text-neutral-300">Foto Produk</div>
        <p class="text-[11px] text-neutral-500 leading-relaxed">
          Format JPG/PNG, maksimal 5 MB. Gambar otomatis dikecilkan agar loading cepat.
        </p>
        <div class="flex items-center gap-1.5">
          <input
            bind:this={gambarInput}
            type="file"
            accept="image/jpeg,image/png"
            class="hidden"
            onchange={handleGambarChange}
          />
          <Button
            type="button"
            variant="secondary"
            size="sm"
            onclick={triggerGambarPick}
            loading={isProcessingGambar}
          >
            <Upload class="w-3.5 h-3.5" />
            <span>{formGambarPreview ? 'Ganti Foto' : 'Unggah Foto'}</span>
          </Button>
          {#if formGambarPreview}
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onclick={handleRemoveGambar}
              class="!text-red-500 dark:!text-red-400"
            >
              <Trash2 class="w-3.5 h-3.5" />
              <span>Hapus</span>
            </Button>
          {/if}
        </div>
      </div>
    </div>

    <!-- Live Margin Preview Card -->

    <div class="p-3 rounded-lg border border-neutral-200 dark:border-neutral-800 bg-neutral-50/70 dark:bg-neutral-900/50 flex items-center justify-between text-xs">
      <div>
        <span class="text-neutral-500">Estimasi Keuntungan Bersih:</span>
        <div class="text-sm font-bold text-emerald-600 dark:text-emerald-400 tabular-nums">
          +{formatRupiah(previewLaba)} <span class="text-xs font-normal text-neutral-500">per unit</span>
        </div>
      </div>

      <div class="text-right">
        <span class="text-neutral-500">Markup Margin:</span>
        <div class="text-sm font-bold text-neutral-900 dark:text-neutral-100">
          +{previewPct}%
        </div>
      </div>
    </div>

    <div class="flex items-center justify-end gap-2 pt-2 border-t border-neutral-200 dark:border-neutral-800">
      <Button
        type="button"
        variant="secondary"
        onclick={() => (isModalOpen = false)}
      >
        Batal
      </Button>

      <Button
        type="submit"
        variant="primary"
        loading={isSubmitting}
      >
        <CheckCircle2 class="w-4 h-4" />
        <span>{isEditing ? 'Simpan Perubahan' : 'Tambah ke Katalog'}</span>
      </Button>
    </div>
  </form>
</Modal>

<!-- Preview foto produk (zoom) -->
<ImagePreviewModal
  bind:open={previewOpen}
  src={previewItem?.gambar_barang ?? null}
  name={previewItem?.nama_barang ?? ''}
  price={previewItem ? formatRupiah(previewItem.harga_jual) : ''}
  onclose={() => (previewItem = null)}
/>
