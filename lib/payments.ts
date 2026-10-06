// Mobile Money provider adapters. Every adapter speaks the same small interface, so swapping
// Flutterwave for Relay Pay (or adding direct MTN MoMo) touches only this file.
import { config } from "./config";

export type ChargeOutcome = "PENDING" | "SUCCESSFUL" | "FAILED";

export interface ChargeRequest {
  txRef: string;
  amountUgx: number;
  msisdn: string; // E.164
  network: "MTN" | "AIRTEL";
  customerName: string;
}

export interface ChargeResult {
  providerRef: string | null;
  outcome: ChargeOutcome;
  message?: string;
  raw?: unknown;
}

export interface VerifyResult {
  outcome: ChargeOutcome;
  amountUgx: number | null;
  currency: string | null;
  providerRef: string | null;
  raw?: unknown;
}

export interface DisburseRequest {
  reference: string;
  amountUgx: number;
  msisdn: string;
  network: "MTN" | "AIRTEL";
  beneficiaryName: string;
  narration: string;
}

export interface PaymentProvider {
  name: string;
  charge(req: ChargeRequest): Promise<ChargeResult>;
  verify(txRef: string): Promise<VerifyResult>;
  disburse(req: DisburseRequest): Promise<{ ok: boolean; providerRef?: string; message?: string }>;
}

// ─── Mock (development) ──────────────────────────────────────────────────────
// Succeeds ~6 s after the charge so the "approve on your phone" screen can be exercised.
// A number ending in 000 always fails, to test the unhappy path.
const mockCharges = new Map<string, { at: number; amount: number; fail: boolean }>();
const mock: PaymentProvider = {
  name: "mock",
  async charge(req) {
    mockCharges.set(req.txRef, { at: Date.now(), amount: req.amountUgx, fail: req.msisdn.endsWith("000") });
    return { providerRef: `MOCK-${req.txRef.slice(0, 8)}`, outcome: "PENDING", message: "Approve on your phone" };
  },
  async verify(txRef) {
    const c = mockCharges.get(txRef);
    // Unknown (e.g. after a dev-server restart): treat as paid so local testing isn't blocked.
    if (!c) return { outcome: "SUCCESSFUL", amountUgx: null, currency: "UGX", providerRef: `MOCK-${txRef.slice(0, 8)}` };
    if (Date.now() - c.at < 6_000) return { outcome: "PENDING", amountUgx: c.amount, currency: "UGX", providerRef: null };
    return { outcome: c.fail ? "FAILED" : "SUCCESSFUL", amountUgx: c.amount, currency: "UGX", providerRef: `MOCK-${txRef.slice(0, 8)}` };
  },
  async disburse(req) {
    console.log(`💸 [mock] disburse ${req.amountUgx} UGX → ${req.msisdn} (${req.reference})`);
    return { ok: true, providerRef: `MOCKOUT-${req.reference.slice(0, 8)}` };
  },
};

// ─── Flutterwave ─────────────────────────────────────────────────────────────
const FLW = "https://api.flutterwave.com/v3";
async function flw(path: string, init: RequestInit = {}) {
  const res = await fetch(`${FLW}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${config().FLW_SECRET_KEY}`,
      "Content-Type": "application/json",
      ...(init.headers ?? {}),
    },
    signal: AbortSignal.timeout(20_000),
  });
  const body = (await res.json().catch(() => ({}))) as Record<string, any>;
  return { ok: res.ok, status: res.status, body };
}

const mapFlwStatus = (s: string | undefined): ChargeOutcome =>
  s === "successful" ? "SUCCESSFUL" : s === "failed" || s === "cancelled" ? "FAILED" : "PENDING";

const flutterwave: PaymentProvider = {
  name: "flutterwave",
  async charge(req) {
    const { ok, body } = await flw("/charges?type=mobile_money_uganda", {
      method: "POST",
      body: JSON.stringify({
        tx_ref: req.txRef,
        amount: req.amountUgx,
        currency: "UGX",
        network: req.network,
        phone_number: req.msisdn.replace("+", ""),
        email: `${req.msisdn.replace("+", "")}@users.findekifo.ug`,
        fullname: req.customerName,
      }),
    });
    if (!ok || body.status === "error")
      return { providerRef: null, outcome: "FAILED", message: body.message ?? "Charge failed", raw: body };
    return {
      providerRef: body.data?.id ? String(body.data.id) : null,
      outcome: mapFlwStatus(body.data?.status),
      message: body.message,
      raw: body,
    };
  },
  async verify(txRef) {
    const { ok, body } = await flw(`/transactions/verify_by_reference?tx_ref=${encodeURIComponent(txRef)}`);
    if (!ok) return { outcome: "PENDING", amountUgx: null, currency: null, providerRef: null, raw: body };
    const d = body.data ?? {};
    return {
      outcome: mapFlwStatus(d.status),
      amountUgx: typeof d.amount === "number" ? Math.round(d.amount) : null,
      currency: d.currency ?? null,
      providerRef: d.id ? String(d.id) : null,
      raw: body,
    };
  },
  async disburse(req) {
    const { ok, body } = await flw("/transfers", {
      method: "POST",
      body: JSON.stringify({
        account_bank: "MPS",
        account_number: req.msisdn.replace("+", ""),
        amount: req.amountUgx,
        currency: "UGX",
        beneficiary_name: req.beneficiaryName,
        reference: req.reference,
        narration: req.narration,
        meta: { sender: "FindEkifo", mobile_number: req.msisdn.replace("+", "") },
      }),
    });
    return ok && body.status === "success"
      ? { ok: true, providerRef: String(body.data?.id ?? "") }
      : { ok: false, message: body.message ?? "Transfer failed" };
  },
};

export function paymentProvider(): PaymentProvider {
  return config().PAYMENT_PROVIDER === "flutterwave" ? flutterwave : mock;
}
