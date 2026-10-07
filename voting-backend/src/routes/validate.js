// Small input-checking helpers. Each throws a 400 with a clear message.
const { badRequest } = require("../errors");

// Largest valid Semaphore identity commitment (the BN254 scalar field size).
const SNARK_FIELD = 21888242871839275222246405745257275088548364400416034343698204186575808495617n;

function text(body, field, { required = true, max = 255 } = {}) {
  const v = body?.[field];
  if (v === undefined || v === null || String(v).trim() === "") {
    if (required) throw badRequest(`"${field}" is required`, "VALIDATION");
    return null;
  }
  if (typeof v !== "string") throw badRequest(`"${field}" must be text`, "VALIDATION");
  const s = v.trim();
  if (s.length > max) throw badRequest(`"${field}" must be at most ${max} characters`, "VALIDATION");
  return s;
}

function email(body, field = "email") {
  const s = text(body, field, { max: 255 }).toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s)) throw badRequest("Enter a valid email address", "VALIDATION");
  return s;
}

function date(body, field, { required = true } = {}) {
  const v = body?.[field];
  if (v === undefined || v === null || v === "") {
    if (required) throw badRequest(`"${field}" is required`, "VALIDATION");
    return undefined;
  }
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) throw badRequest(`"${field}" must be a date/time (e.g. 2026-11-20T08:00:00Z)`, "VALIDATION");
  return d;
}

function id(value, what = "id") {
  const n = Number(value);
  if (!Number.isInteger(n) || n < 1) throw badRequest(`Invalid ${what}`, "VALIDATION");
  return n;
}

function commitment(body) {
  const v = String(body?.commitment ?? "");
  if (!/^[0-9]{1,78}$/.test(v)) throw badRequest('"commitment" must be a number in decimal form', "VALIDATION");
  const n = BigInt(v);
  if (n === 0n || n >= SNARK_FIELD) throw badRequest('"commitment" is out of range', "VALIDATION");
  return n.toString();
}

module.exports = { text, email, date, id, commitment };
