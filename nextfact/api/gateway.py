import frappe
import requests
import json
import time
import io
import base64
from frappe.utils import now_datetime

try:
    import qrcode
    from PIL import Image
    HAS_QRCODE = True
except ImportError:
    HAS_QRCODE = False

class DRCFactGateway:
    def __init__(self, mapping=None):
        if mapping:
            if isinstance(mapping, str):
                self.mapping = frappe.get_doc("DRC POS Mapping", mapping)
            else:
                self.mapping = mapping
        else:
            self.mapping = None

        settings = frappe.get_single("DRC Fact Settings")
        self.base_url = (settings.api_base_url or "https://app.drcfactplus.com").rstrip("/")
        
        if self.mapping:
            self.api_key = self.mapping.get_password("api_key")
            self.environment = self.mapping.environment
            self.company_nif = self.mapping.company_nif
        else:
            self.api_key = None
            self.environment = "test"
            self.company_nif = None

    def _headers(self):
        h = {
            "Content-Type": "application/json",
            "Accept": "application/json",
        }
        if self.api_key:
            h["X-DRCFACT-API-Key"] = self.api_key
        return h

    def _masked_headers(self):
        h = self._headers().copy()
        if "X-DRCFACT-API-Key" in h and h["X-DRCFACT-API-Key"]:
            k = h["X-DRCFACT-API-Key"]
            h["X-DRCFACT-API-Key"] = k[:6] + "***" + k[-4:] if len(k) > 10 else "***"
        return h

    def _call(self, method, endpoint, payload=None, drc_fiscal_invoice=None, timeout=30, auth=True):
        url = f"{self.base_url}{endpoint}"
        headers = self._headers() if auth else {"Content-Type": "application/json", "Accept": "application/json"}
        
        start = time.time()
        response = None
        error_trace = None
        status_code = None

        try:
            if method == "GET":
                response = requests.get(url, headers=headers, timeout=timeout)
            elif method == "POST":
                response = requests.post(url, headers=headers, json=payload, timeout=timeout)
            status_code = response.status_code
            response.raise_for_status()
            return response
        except requests.exceptions.Timeout:
            error_trace = "Request timed out"
            raise
        except requests.exceptions.ConnectionError:
            error_trace = "Connection error"
            raise
        except requests.exceptions.HTTPError:
            error_trace = f"HTTP {response.status_code}: {response.text[:1000]}"
            raise
        finally:
            duration = int((time.time() - start) * 1000)
            try:
                log = frappe.new_doc("DRC Fact Log")
                log.timestamp = now_datetime()
                log.drc_fiscal_invoice = drc_fiscal_invoice
                log.pos_mapping = self.mapping.name if self.mapping else None
                log.endpoint = endpoint
                log.http_method = method
                log.http_status = status_code or 0
                log.request_headers = json.dumps(self._masked_headers(), indent=2)
                log.request_body = json.dumps(payload, indent=2) if payload else ""
                log.response_body = response.text[:10000] if response is not None else ""
                log.duration_ms = duration
                log.error_trace = error_trace or ""
                log.direction = "Outbound"
                log.flags.ignore_permissions = True
                log.insert()
            except Exception:
                frappe.log_error("DRC Fact Log insertion failed")

    def health(self):
        r = self._call("GET", "/integrations/v1/health", auth=False)
        return r.json()

    def reference(self, drc_fiscal_invoice=None):
        r = self._call("GET", "/integrations/v1/reference", drc_fiscal_invoice=drc_fiscal_invoice)
        return r.json()

    def rate(self, drc_fiscal_invoice=None):
        r = self._call("GET", "/integrations/v1/rate", drc_fiscal_invoice=drc_fiscal_invoice)
        return r.json()

    def catalog(self, drc_fiscal_invoice=None):
        r = self._call("GET", "/integrations/v1/catalog", drc_fiscal_invoice=drc_fiscal_invoice)
        return r.json()

    def create_draft(self, payload, drc_fiscal_invoice=None):
        r = self._call("POST", "/integrations/v1/invoices", payload=payload, drc_fiscal_invoice=drc_fiscal_invoice)
        return r.json()

    def normalize(self, invoice_id, drc_fiscal_invoice=None):
        r = self._call("POST", f"/integrations/v1/invoices/{invoice_id}/normalize", drc_fiscal_invoice=drc_fiscal_invoice)
        return r.json()

    def get_invoice(self, invoice_id, drc_fiscal_invoice=None):
        r = self._call("GET", f"/integrations/v1/invoices/{invoice_id}", drc_fiscal_invoice=drc_fiscal_invoice)
        return r.json()

    def get_pdf(self, invoice_id, drc_fiscal_invoice=None):
        url = f"{self.base_url}/integrations/v1/invoices/{invoice_id}/pdf"
        r = requests.get(url, headers=self._headers(), timeout=60)
        r.raise_for_status()
        return r.content

def get_qr_base64(qr_string):
    """Generate QR code as base64 PNG from raw string."""
    if not qr_string or not HAS_QRCODE:
        return ""
    try:
        qr = qrcode.QRCode(
            version=None,
            error_correction=qrcode.constants.ERROR_CORRECT_M,
            box_size=4,
            border=2,
        )
        qr.add_data(qr_string)
        qr.make(fit=True)
        img = qr.make_image(fill_color="black", back_color="white")
        buffer = io.BytesIO()
        img.save(buffer, format="PNG")
        return base64.b64encode(buffer.getvalue()).decode()
    except Exception as e:
        frappe.log_error(f"Failed to generate QR base64: {str(e)}")
        return ""
