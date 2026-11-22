import frappe
import json
import functools
import uuid

class ProblemError(Exception):
    """RFC 7807-style structured application exception."""
    def __init__(self, type_suffix, status_code=400, detail="", errors=None, retryable=False, ui_action=None):
        super().__init__(detail)
        self.type_suffix = type_suffix
        self.status_code = status_code
        self.detail = detail
        self.errors = errors or []
        self.retryable = retryable
        self.ui_action = ui_action

    def to_dict(self, request_id=None):
        return {
            "ok": False,
            "request_id": request_id or uuid.uuid4().hex[:12],
            "error": {
                "type": f"https://nextfact.local/problems/{self.type_suffix}",
                "title": self.type_suffix.replace("-", " ").title(),
                "status": self.status_code,
                "detail": self.detail,
                "errors": self.errors,
                "retryable": self.retryable,
                "ui_action": self.ui_action,
            }
        }

def api_endpoint(handler):
    """Decorator for nextfact.api.v1 endpoints returning structured responses."""
    @functools.wraps(handler)
    def wrapper(*args, **kwargs):
        request_id = uuid.uuid4().hex[:12]
        try:
            res = handler(*args, **kwargs)
            if isinstance(res, dict) and "ok" in res:
                res["request_id"] = request_id
                return res
            return {
                "ok": True,
                "request_id": request_id,
                "data": res
            }
        except ProblemError as pe:
            frappe.local.response.http_status_code = pe.status_code
            return pe.to_dict(request_id)
        except Exception as e:
            frappe.log_error(f"NextFact API Error ({request_id}): {str(e)}")
            frappe.local.response.http_status_code = 500
            return {
                "ok": False,
                "request_id": request_id,
                "error": {
                    "type": "https://nextfact.local/problems/internal",
                    "title": "Internal Server Error",
                    "status": 500,
                    "detail": str(e),
                    "errors": [],
                    "retryable": False,
                    "ui_action": None
                }
            }
    return wrapper
