<script lang="ts">
  import { X, ZoomIn } from 'lucide-svelte';

  interface Props {
    open?: boolean;
    src?: string | null;
    name?: string;
    price?: string;
    onclose?: () => void;
  }

  let { open = $bindable(false), src = null, name = '', price = '', onclose }: Props = $props();

  function handleClose() {
    open = false;
    onclose?.();
  }

  function handleKeydown(e: KeyboardEvent) {
    if (e.key === 'Escape' && open) handleClose();
  }
</script>

<svelte:window onkeydown={handleKeydown} />

{#if open && src}
  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <div
    class="fixed inset-0 z-[100] flex items-center justify-center p-4 sm:p-8 bg-black/80 backdrop-blur-sm"
    role="dialog"
    aria-modal="true"
    aria-label={name || 'Pratinjau Foto Produk'}
    onclick={(e) => { if (e.target === e.currentTarget) handleClose(); }}
  >
    <button
      type="button"
      onclick={handleClose}
      title="Tutup"
      aria-label="Tutup"
      class="absolute top-3 right-3 sm:top-4 sm:right-4 p-2 rounded-full bg-white/10 text-white/80 hover:bg-white/20 hover:text-white transition-colors"
    >
      <X class="w-5 h-5" />
    </button>

    <!-- svelte-ignore a11y_no_static_element_interactions -->
    <div
      class="flex flex-col items-center gap-4 max-h-full"
      role="presentation"
      onclick={(e) => e.stopPropagation()}
    >
      <div class="relative rounded-xl overflow-hidden bg-white dark:bg-neutral-900 shadow-2xl max-h-[75vh]">
        <img
          {src}
          alt={name || 'Foto Produk'}
          class="block max-h-[75vh] max-w-full object-contain select-none"
        />
        <div class="absolute top-2 left-2 p-1.5 rounded-full bg-black/50 text-white/80">
          <ZoomIn class="w-4 h-4" />
        </div>
      </div>

      <div class="text-center px-4">
        <h3 class="text-sm sm:text-base font-semibold text-white leading-snug">
          {name}
        </h3>
        {#if price}
          <p class="mt-1 text-lg sm:text-xl font-bold text-emerald-400 tabular-nums">
            {price}
          </p>
        {/if}
      </div>
    </div>
  </div>
{/if}
