<!-- /* nextfact-actions v4.1 */ -->
<template>
  <!-- CART / CHECKOUT MODE -->
  <div v-if="mode === 'cart'" class="inline-flex">
    <button
      type="button"
      @click="handleReportAndPrint"
      :disabled="disabled || isReporting"
      :class="[
        'font-bold rounded-lg flex items-center justify-center space-x-1.5 transition-colors px-4',
        'bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800 text-white',
        (disabled || isReporting) ? 'opacity-50 cursor-not-allowed' : ''
      ]"
      :title="t('Report to DGI and print official VAT receipt')"
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

    <!-- Modal for mapping selection if Ask Cashier is triggered -->
    <div v-if="showChoiceModal" class="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50">
      <div class="bg-white rounded-lg shadow-xl p-5 max-w-sm w-full mx-4">
        <h3 class="text-base font-bold text-gray-900 mb-3">{{ t('Select Point of Sale') }}</h3>
        <div class="space-y-2 mb-4">
          <button
            v-for="c in choices"
            :key="c.mapping"
            @click="selectMappingAndReport(c.mapping)"
            class="w-full text-left px-3 py-2 border rounded-md hover:bg-emerald-50 hover:border-emerald-500 font-medium text-sm text-gray-800 transition-colors"
          >
            {{ c.title }} <span class="text-xs text-gray-500">({{ c.emcf_nid || c.mapping }})</span>
          </button>
        </div>
        <button
          @click="showChoiceModal = false; isReporting = false;"
          class="w-full py-1.5 text-xs text-gray-600 hover:text-gray-800 border rounded"
        >
          {{ t('Cancel') }}
        </button>
      </div>
    </div>
  </div>

  <!-- INVOICE HISTORY / ROW MODE -->
  <div v-else-if="mode === 'history'" class="inline-flex items-center space-x-1">
    <!-- 1. Report & Print VAT Receipt (if not reported or failed) -->
    <button
      v-if="!fiscalStatus || fiscalStatus === 'none' || fiscalStatus === 'failed'"
      @click="reportFromHistory"
      :disabled="isReporting"
      class="p-1.5 hover:bg-emerald-50 rounded transition-colors text-emerald-600"
      :title="t('Report to DRC FACT+ / DGI')"
    >
      <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
      </svg>
    </button>

    <!-- 2. Reprint VAT Receipt (if already normalized) -->
    <button
      v-else-if="fiscalStatus.includes('normalized')"
      @click="reprintVatReceipt"
      class="p-1.5 hover:bg-emerald-50 rounded transition-colors text-emerald-700"
      :title="t('Reprint VAT Receipt (DUPLICATA)')"
    >
      <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" />
      </svg>
    </button>

    <!-- 3. Check status (if pending verification) -->
    <button
      v-else-if="fiscalStatus.includes('pending')"
      @click="checkStatus"
      :disabled="isReporting"
      class="p-1.5 hover:bg-amber-50 rounded transition-colors text-amber-600"
      :title="t('Check DGI Verification Status')"
    >
      <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
      </svg>
    </button>

    <!-- 4. Print Delivery Note (always allowed for submitted invoices) -->
    <button
      @click="printDeliveryNote"
      class="p-1.5 hover:bg-gray-100 rounded transition-colors text-gray-600"
      :title="t('Print Delivery Note (Non-fiscal)')"
    >
      <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 17a2 2 0 11-4 0 2 2 0 014 0zM19 17a2 2 0 11-4 0 2 2 0 014 0z" />
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 16V6a1 1 0 00-1-1H4a1 1 0 00-1 1v10a1 1 0 001 1h1m8-1a1 1 0 01-1 1H9m4-1V8a1 1 0 011-1h2.586a1 1 0 01.707.293l3.414 3.414a1 1 0 01.293.707V16a1 1 0 01-1 1h-1m-6-1a1 1 0 001 1h1M5 17a2 2 0 104 0m-4 0a2 2 0 114 0m6 0a2 2 0 104 0m-4 0a2 2 0 114 0" />
      </svg>
    </button>
  </div>
</template>

<script setup>
import { ref, onMounted } from "vue";

const props = defineProps({
  mode: { type: String, default: "cart" },
  invoice: { type: Object, default: () => ({}) },
  submitInvoice: { type: Function, default: null },
  disabled: { type: Boolean, default: false }
});

const isReporting = ref(false);
const fiscalStatus = ref(props.invoice?.custom_drc_fiscal_status || "");
const showChoiceModal = ref(false);
const choices = ref([]);
const lastSubmittedInvoice = ref("");

function t(str) {
  const isFr = (navigator.language || "").startsWith("fr");
  const dict = {
    "Report + VAT Receipt": isFr ? "Déclarer + Reçu TVA" : "Report + VAT Receipt",
    "Normalizing...": isFr ? "Normalisation DGI..." : "Normalizing...",
    "Select Point of Sale": isFr ? "Choisir le point de vente" : "Select Point of Sale",
    "Cancel": isFr ? "Annuler" : "Cancel",
    "Report to DRC FACT+ / DGI": isFr ? "Déclarer à la DGI" : "Report to DRC FACT+ / DGI",
    "Reprint VAT Receipt (DUPLICATA)": isFr ? "Réimprimer reçu TVA (DUPLICATA)" : "Reprint VAT Receipt (DUPLICATA)",
    "Check DGI Verification Status": isFr ? "Vérifier statut DGI" : "Check DGI Verification Status",
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
    lastSubmittedInvoice.value = invoiceName;
    await sendReportCall(invoiceName);
  } catch (err) {
    isReporting.value = false;
    if (typeof frappe !== "undefined" && frappe.show_alert) {
      frappe.show_alert({ message: err.message || t("Reporting failed"), indicator: "red" });
    }
  }
}

async function selectMappingAndReport(mappingName) {
  showChoiceModal.value = false;
  if (!lastSubmittedInvoice.value) return;
  await sendReportCall(lastSubmittedInvoice.value, mappingName);
}

async function sendReportCall(sinvName, mappingName = null) {
  isReporting.value = true;
  try {
    const args = {
      sales_invoice: sinvName,
      idempotency_key: getUuid()
    };
    if (mappingName) args.pos_mapping = mappingName;

    const res = await frappe.call({
      method: "nextfact.api.v1.fiscal.report",
      args: args
    });

    if (res.message && res.message.status === "needs_choice") {
      choices.value = res.message.choices || [];
      showChoiceModal.value = true;
      return;
    }

    if (res.message && res.message.ok) {
      const data = res.message.data;
      if (data && data.print_url) {
        window.open(data.print_url, "_blank");
      }
    }
  } finally {
    isReporting.value = false;
  }
}

async function reportFromHistory() {
  if (!props.invoice?.name) return;
  await sendReportCall(props.invoice.name);
  fiscalStatus.value = "normalized";
}

function reprintVatReceipt() {
  if (!props.invoice?.name) return;
  window.open(`/api/method/nextfact.api.v1.print.receipt?sales_invoice=${encodeURIComponent(props.invoice.name)}`, "_blank");
}

async function checkStatus() {
  if (!props.invoice?.name) return;
  isReporting.value = true;
  try {
    const res = await frappe.call({
      method: "nextfact.api.v1.fiscal.verify",
      args: { sales_invoice: props.invoice.name }
    });
    if (res.message && res.message.ok) {
      fiscalStatus.value = res.message.data.status;
    }
  } finally {
    isReporting.value = false;
  }
}

function printDeliveryNote() {
  if (!props.invoice?.name) return;
  window.open(`/api/method/nextfact.api.v1.print.delivery_note?sales_invoice=${encodeURIComponent(props.invoice.name)}`, "_blank");
}
</script>
