<!-- /* nextfact-actions v4.2 */ -->
<template>
  <!-- CART / CHECKOUT MODE -->
  <div v-if="mode === 'cart'" class="inline-flex">
    <button
      type="button"
      @click="handleReportAndPrint"
      :disabled="disabled || isReporting"
      :class="[
        'font-bold rounded-lg flex items-center justify-center space-x-1.5 transition-colors px-4 py-2.5',
        'bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800 text-white shadow-sm',
        (disabled || isReporting) ? 'opacity-50 cursor-not-allowed' : ''
      ]"
      :title="t('Report to DRC DGI and print official VAT receipt')"
    >
      <svg v-if="isReporting" class="w-4 h-4 animate-spin mr-1" fill="none" viewBox="0 0 24 24">
        <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
        <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
      </svg>
      <svg v-else class="w-4 h-4 mr-1 text-emerald-100" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
      </svg>
      <span>{{ isReporting ? t('Normalizing...') : t('Report + VAT Receipt') }}</span>
    </button>
  </div>

  <!-- INVOICE HISTORY / ROW MODE -->
  <div v-else-if="mode === 'history'" class="inline-flex items-center gap-1.5">
    <!-- 1. VAT Receipt Button -->
    <button
      type="button"
      @click.stop="handleVatReceipt"
      :disabled="isReporting"
      class="px-2.5 py-1.5 text-xs font-semibold text-emerald-700 bg-emerald-50 hover:bg-emerald-100 active:bg-emerald-200 rounded-lg transition-colors flex items-center gap-1 border border-emerald-200"
      :title="t('Official DRC DGI VAT Receipt')"
    >
      <svg v-if="isReporting" class="w-3.5 h-3.5 animate-spin text-emerald-600" fill="none" viewBox="0 0 24 24">
        <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
        <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
      </svg>
      <svg v-else class="w-3.5 h-3.5 text-emerald-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
      </svg>
      <span>{{ isReporting ? t('Declaring...') : t('VAT Receipt') }}</span>
    </button>

    <!-- 2. Delivery Note Button -->
    <button
      type="button"
      @click.stop="printDeliveryNote"
      class="px-2.5 py-1.5 text-xs font-semibold text-gray-700 bg-gray-50 hover:bg-gray-100 active:bg-gray-200 rounded-lg transition-colors flex items-center gap-1 border border-gray-200"
      :title="t('Print Delivery Note (Non-fiscal)')"
    >
      <svg class="w-3.5 h-3.5 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 17a2 2 0 11-4 0 2 2 0 014 0zM19 17a2 2 0 11-4 0 2 2 0 014 0z" />
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 16V6a1 1 0 00-1-1H4a1 1 0 00-1 1v10a1 1 0 001 1h1m8-1a1 1 0 01-1 1H9m4-1V8a1 1 0 011-1h2.586a1 1 0 01.707.293l3.414 3.414a1 1 0 01.293.707V16a1 1 0 01-1 1h-1m-6-1a1 1 0 001 1h1M5 17a2 2 0 104 0m-4 0a2 2 0 114 0m6 0a2 2 0 104 0m-4 0a2 2 0 114 0" />
      </svg>
      <span>{{ t('Delivery Note') }}</span>
    </button>
  </div>
</template>

<script setup>
import { ref } from "vue";

const props = defineProps({
  mode: { type: String, default: "cart" },
  invoice: { type: Object, default: () => ({}) },
  submitInvoice: { type: Function, default: null },
  disabled: { type: Boolean, default: false }
});

const isReporting = ref(false);

function t(str) {
  const isFr = (navigator.language || "").startsWith("fr");
  const dict = {
    "Report + VAT Receipt": isFr ? "Déclarer + Reçu TVA" : "Report + VAT Receipt",
    "Normalizing...": isFr ? "Normalisation DGI..." : "Normalizing...",
    "VAT Receipt": isFr ? "Reçu TVA" : "VAT Receipt",
    "Declaring...": isFr ? "Déclaration..." : "Declaring...",
    "Delivery Note": isFr ? "Bon Livraison" : "Delivery Note",
    "Official DRC DGI VAT Receipt": isFr ? "Reçu officiel TVA DRC DGI" : "Official DRC DGI VAT Receipt",
    "Print Delivery Note (Non-fiscal)": isFr ? "Imprimer Bon de Livraison" : "Print Delivery Note (Non-fiscal)"
  };
  return dict[str] || str;
}

function getUuid() {
  if (typeof crypto !== "undefined" && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return Date.now().toString(36) + Math.random().toString(36).substring(2);
}

function getInvoiceName() {
  return props.invoice?.name || props.invoice?.invoice_name || "";
}

async function handleReportAndPrint() {
  if (isReporting.value || props.disabled) return;
  isReporting.value = true;

  try {
    let invoiceName = "";
    if (typeof props.submitInvoice === "function") {
      const res = await props.submitInvoice();
      invoiceName = res?.name || res?.message?.name || (typeof res === "string" ? res : "");
    }
    if (!invoiceName) {
      isReporting.value = false;
      return;
    }
    await callReport(invoiceName);
  } catch (err) {
    isReporting.value = false;
    console.error("NextFact report error:", err);
  }
}

async function handleVatReceipt() {
  const sinv = getInvoiceName();
  if (!sinv) return;
  await callReport(sinv);
}

async function callReport(sinvName) {
  isReporting.value = true;
  try {
    const url = `/api/method/nextfact.api.v1.fiscal.report`;
    const res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Accept": "application/json",
        "X-Frappe-CSRF-Token": (window.frappe && window.frappe.csrf_token) || ""
      },
      body: JSON.stringify({
        sales_invoice: sinvName,
        idempotency_key: getUuid()
      })
    });
    const json = await res.json();
    if (json.data && json.data.print_url) {
      window.open(json.data.print_url, "_blank");
    } else if (json.message && json.message.data && json.message.data.print_url) {
      window.open(json.message.data.print_url, "_blank");
    } else {
      // Fallback direct receipt print URL
      window.open(`/api/method/nextfact.api.v1.print.receipt?sales_invoice=${encodeURIComponent(sinvName)}`, "_blank");
    }
  } catch (err) {
    console.error("Failed to report fiscal invoice:", err);
    window.open(`/api/method/nextfact.api.v1.print.receipt?sales_invoice=${encodeURIComponent(sinvName)}`, "_blank");
  } finally {
    isReporting.value = false;
  }
}

function printDeliveryNote() {
  const sinv = getInvoiceName();
  if (!sinv) return;
  window.open(`/api/method/nextfact.api.v1.print.delivery_note?sales_invoice=${encodeURIComponent(sinv)}`, "_blank");
}
</script>
