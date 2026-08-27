import { useState, useEffect, useCallback, useMemo } from "react";

const STORAGE_KEY = "arbolado-system-v2";

// ─── Conexión a Supabase (base de datos compartida del equipo) ───
const SUPABASE_URL = "https://lsbkfsdgvzemvjpfjgrq.supabase.co";
const SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImxzYmtmc2RndnplbXZqcGZqZ3JxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODU4NTA4NjcsImV4cCI6MjEwMTQyNjg2N30.tZ12YU-jlkfUQmRJ715v1y9bfcEmJnn7A_UmJ4U0jP8";
const sbHeaders = { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}`, "Content-Type": "application/json" };

// ─── Sesión de usuario (token dinámico para Supabase Auth) ───
let ACCESS_TOKEN = null;
function setAccessToken(t) { ACCESS_TOKEN = t; }
function authHeaders(extra) { return { apikey: SUPABASE_KEY, Authorization: `Bearer ${ACCESS_TOKEN || SUPABASE_KEY}`, "Content-Type": "application/json", ...extra }; }

const SESSION_KEY = "arbolado_session";
function saveSession(session, remember) {
  const raw = JSON.stringify(session);
  try {
    if (remember) { localStorage.setItem(SESSION_KEY, raw); sessionStorage.removeItem(SESSION_KEY); }
    else { sessionStorage.setItem(SESSION_KEY, raw); localStorage.removeItem(SESSION_KEY); }
  } catch {}
}
function loadStoredSession() {
  try {
    const raw = localStorage.getItem(SESSION_KEY) || sessionStorage.getItem(SESSION_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch { return null; }
}
function clearStoredSession() {
  try { localStorage.removeItem(SESSION_KEY); sessionStorage.removeItem(SESSION_KEY); } catch {}
}

async function sbAuthLogin(email, password) {
  const r = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
    method: "POST", headers: { apikey: SUPABASE_KEY, "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  const d = await r.json();
  if (!r.ok) throw new Error(d.error_description || d.msg || "Usuario o contraseña incorrectos");
  return d;
}
async function sbAuthRefresh(refresh_token) {
  try {
    const r = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=refresh_token`, {
      method: "POST", headers: { apikey: SUPABASE_KEY, "Content-Type": "application/json" },
      body: JSON.stringify({ refresh_token }),
    });
    if (!r.ok) return null;
    return await r.json();
  } catch { return null; }
}
async function sbGetProfile(userId, accessToken) {
  try {
    const r = await fetch(`${SUPABASE_URL}/rest/v1/profiles?id=eq.${userId}&select=*`, {
      headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${accessToken}` },
    });
    if (!r.ok) return null;
    const rows = await r.json();
    return rows[0] || null;
  } catch { return null; }
}
async function sbListProfiles() {
  try {
    const r = await fetch(`${SUPABASE_URL}/rest/v1/profiles?select=*&order=nombre.asc`, { headers: authHeaders() });
    if (!r.ok) return [];
    return await r.json();
  } catch { return []; }
}
async function sbUpdateProfile(id, patch) {
  try { await fetch(`${SUPABASE_URL}/rest/v1/profiles?id=eq.${id}`, { method: "PATCH", headers: { ...authHeaders(), Prefer: "return=minimal" }, body: JSON.stringify(patch) }); } catch (e) { console.error(e); }
}

async function sbRpc(fnName, params) {
  try {
    const r = await fetch(`${SUPABASE_URL}/rest/v1/rpc/${fnName}`, { method: "POST", headers: sbHeaders, body: JSON.stringify(params || {}) });
    const json = await r.json().catch(() => null);
    if (!r.ok) return { error: json?.message || "Error de conexión" };
    return { data: json };
  } catch (e) { return { error: "Error de conexión" }; }
}

// ─── Usuario autenticado (usado para auditoría automática) ───
let CURRENT_USER = null;
function setCurrentUserRef(u) { CURRENT_USER = u; }

async function sbList(table) {
  try {
    const r = await fetch(`${SUPABASE_URL}/rest/v1/${table}?select=*&order=created_at.asc`, { headers: authHeaders() });
    if (!r.ok) return [];
    const rows = await r.json();
    return rows.map(row => ({ ...row.data, id: row.id }));
  } catch { return []; }
}
async function sbInsert(table, id, itemData) {
  const withAudit = { ...itemData, _creadoPor: CURRENT_USER?.nombre || null, _creadoPorId: CURRENT_USER?.id || null, _creadoEn: new Date().toISOString() };
  try { await fetch(`${SUPABASE_URL}/rest/v1/${table}`, { method: "POST", headers: { ...authHeaders(), Prefer: "return=minimal" }, body: JSON.stringify({ id, data: withAudit }) }); } catch (e) { console.error(e); }
}
async function sbUpdate(table, id, itemData) {
  const withAudit = { ...itemData, _actualizadoPor: CURRENT_USER?.nombre || null, _actualizadoPorId: CURRENT_USER?.id || null, _actualizadoEn: new Date().toISOString() };
  try { await fetch(`${SUPABASE_URL}/rest/v1/${table}?id=eq.${id}`, { method: "PATCH", headers: { ...authHeaders(), Prefer: "return=minimal" }, body: JSON.stringify({ data: withAudit }) }); } catch (e) { console.error(e); }
}
async function sbDelete(table, id) {
  try { await fetch(`${SUPABASE_URL}/rest/v1/${table}?id=eq.${id}`, { method: "DELETE", headers: authHeaders() }); } catch (e) { console.error(e); }
}
async function sbGetPresupuesto() {
  try {
    const r = await fetch(`${SUPABASE_URL}/rest/v1/caja_chica_config?id=eq.main&select=presupuesto`, { headers: authHeaders() });
    if (!r.ok) return 0;
    const rows = await r.json();
    return rows[0]?.presupuesto || 0;
  } catch { return 0; }
}
async function sbSetPresupuesto(presupuesto) {
  try { await fetch(`${SUPABASE_URL}/rest/v1/caja_chica_config?id=eq.main`, { method: "PATCH", headers: { ...authHeaders(), Prefer: "return=minimal" }, body: JSON.stringify({ presupuesto }) }); } catch (e) { console.error(e); }
}

// ─── Icons ───
const I = {
  dashboard: <svg width="19" height="19" fill="none" stroke="currentColor" strokeWidth="1.8" viewBox="0 0 24 24"><rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/></svg>,
  expedientes: <svg width="19" height="19" fill="none" stroke="currentColor" strokeWidth="1.8" viewBox="0 0 24 24"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg>,
  compras: <svg width="19" height="19" fill="none" stroke="currentColor" strokeWidth="1.8" viewBox="0 0 24 24"><circle cx="9" cy="21" r="1"/><circle cx="20" cy="21" r="1"/><path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6"/></svg>,
  caja: <svg width="19" height="19" fill="none" stroke="currentColor" strokeWidth="1.8" viewBox="0 0 24 24"><rect x="1" y="4" width="22" height="16" rx="2"/><line x1="1" y1="10" x2="23" y2="10"/></svg>,
  tareas: <svg width="19" height="19" fill="none" stroke="currentColor" strokeWidth="1.8" viewBox="0 0 24 24"><path d="M9 11l3 3L22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/></svg>,
  descanso: <svg width="19" height="19" fill="none" stroke="currentColor" strokeWidth="1.8" viewBox="0 0 24 24"><path d="M17 18a5 5 0 0 0-10 0"/><line x1="12" y1="9" x2="12" y2="2"/><line x1="4.22" y1="10.22" x2="5.64" y2="11.64"/><line x1="1" y1="18" x2="3" y2="18"/><line x1="21" y1="18" x2="23" y2="18"/><line x1="18.36" y1="11.64" x2="19.78" y2="10.22"/><line x1="23" y1="22" x2="1" y2="22"/><polyline points="16 5 12 9 8 5"/></svg>,
  licencia: <svg width="19" height="19" fill="none" stroke="currentColor" strokeWidth="1.8" viewBox="0 0 24 24"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/><path d="M8 14h.01"/><path d="M12 14h.01"/><path d="M16 14h.01"/><path d="M8 18h.01"/><path d="M12 18h.01"/></svg>,
  resolucion: <svg width="19" height="19" fill="none" stroke="currentColor" strokeWidth="1.8" viewBox="0 0 24 24"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><path d="M9 15l2 2 4-4"/></svg>,
  proveedores: <svg width="19" height="19" fill="none" stroke="currentColor" strokeWidth="1.8" viewBox="0 0 24 24"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>,
  plus: <svg width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2.2" viewBox="0 0 24 24"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>,
  search: <svg width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>,
  edit: <svg width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>,
  trash: <svg width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>,
  close: <svg width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>,
  menu: <svg width="22" height="22" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="18" x2="21" y2="18"/></svg>,
  tree: <svg width="26" height="26" fill="none" stroke="currentColor" strokeWidth="1.5" viewBox="0 0 24 24"><path d="M12 22V12"/><path d="M8 18l4-4 4 4"/><path d="M6 14l6-6 6 6"/><path d="M9 10l3-3 3 3"/></svg>,
  eye: <svg width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>,
  link: <svg width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></svg>,
  entregas: <svg width="19" height="19" fill="none" stroke="currentColor" strokeWidth="1.8" viewBox="0 0 24 24"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/><polyline points="3.27 6.96 12 12.01 20.73 6.96"/><line x1="12" y1="22.08" x2="12" y2="12"/></svg>,
  nota: <svg width="19" height="19" fill="none" stroke="currentColor" strokeWidth="1.8" viewBox="0 0 24 24"><path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/></svg>,
  print: <svg width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><polyline points="6 9 6 2 18 2 18 9"/><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><rect x="6" y="14" width="12" height="8"/></svg>,
  patrimonio: <svg width="19" height="19" fill="none" stroke="currentColor" strokeWidth="1.8" viewBox="0 0 24 24"><path d="M12 22c4-4 8-8.5 8-13a8 8 0 1 0-16 0c0 4.5 4 9 8 13z"/><circle cx="12" cy="9" r="3"/></svg>,
  personal: <svg width="19" height="19" fill="none" stroke="currentColor" strokeWidth="1.8" viewBox="0 0 24 24"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>,
  poda: <svg width="19" height="19" fill="none" stroke="currentColor" strokeWidth="1.8" viewBox="0 0 24 24"><circle cx="6" cy="6" r="3"/><circle cx="6" cy="18" r="3"/><path d="M20 4L8.12 15.88"/><path d="M14.47 14.48L20 20"/><path d="M8.12 8.12L12 12"/></svg>,
  extraccion: <svg width="19" height="19" fill="none" stroke="currentColor" strokeWidth="1.8" viewBox="0 0 24 24"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>,
  plantacion: <svg width="19" height="19" fill="none" stroke="currentColor" strokeWidth="1.8" viewBox="0 0 24 24"><path d="M12 22V12"/><path d="M8 18l4-4 4 4"/><path d="M6 14l6-6 6 6"/><circle cx="12" cy="6" r="2"/></svg>,
  tocon: <svg width="19" height="19" fill="none" stroke="currentColor" strokeWidth="1.8" viewBox="0 0 24 24"><rect x="7" y="10" width="10" height="9" rx="1"/><ellipse cx="12" cy="10" rx="5" ry="2"/><line x1="12" y1="19" x2="12" y2="22"/></svg>,
};

// ─── Helpers ───
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
const hoy = () => new Date().toISOString().split("T")[0];
const fmtDate = (d) => { if (!d) return "—"; const p = d.split("-"); return `${p[2]}/${p[1]}/${p[0]}`; };
const fmtMoney = (n) => "$" + (parseFloat(n) || 0).toLocaleString("es-AR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const MESES = ["Enero","Febrero","Marzo","Abril","Mayo","Junio","Julio","Agosto","Septiembre","Octubre","Noviembre","Diciembre"];

// ─── Integración Expedientes ↔ Patrimonio Vegetal ───
const PV_ESTADOS = {
  para_inspeccion: { l:"Para inspección", c:"blue" },
  con_observacion: { l:"Con observación", c:"yellow" },
  para_notificar: { l:"Para notificar", c:"orange" },
  remitido_catastro: { l:"Remitido a Catastro", c:"green" },
};
const esAsuntoPatrimonioVegetal = (asunto) => (asunto||"").toLowerCase().includes("patrimonio vegetal");

const defaultState = {
  expedientes: [], compras: [], cajaChica: { presupuesto: 0, registros: [] },
  tareas: [], descansos: [], licencias: [], resoluciones: [], proveedores: [], entregas: [], notas: [], patrimonioVegetal: [], personal: [], gestionArbolado: [],
};

async function loadData() {
  try {
    const [expedientes, patrimonioVegetal, compras, registros, presupuesto, tareas, descansos, licencias, resoluciones, proveedores, entregas, notas, personal, gestionArbolado] = await Promise.all([
      sbList("expedientes"), sbList("patrimonio_vegetal"), sbList("compras"), sbList("caja_chica_registros"),
      sbGetPresupuesto(), sbList("tareas"), sbList("descansos"), sbList("licencias"), sbList("resoluciones"),
      sbList("proveedores"), sbList("entregas"), sbList("notas"), sbList("personal"), sbList("gestion_arbolado"),
    ]);
    return { expedientes, patrimonioVegetal, compras, cajaChica: { presupuesto, registros }, tareas, descansos, licencias, resoluciones, proveedores, entregas, notas, personal, gestionArbolado };
  } catch (e) { console.error(e); return defaultState; }
}

// ─── Shared UI ───
function Badge({ label, color }) {
  const c = { green:"bg-emerald-100 text-emerald-800", yellow:"bg-amber-100 text-amber-800", red:"bg-rose-100 text-rose-800", blue:"bg-sky-100 text-sky-800", gray:"bg-gray-100 text-gray-600", purple:"bg-purple-100 text-purple-800", orange:"bg-orange-100 text-orange-800" };
  return <span className={`inline-block px-2.5 py-0.5 rounded-full text-[11px] font-semibold tracking-wide uppercase ${c[color]||c.gray}`}>{label}</span>;
}

function Modal({ open, onClose, title, children, wide }) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-[6vh] px-4" onClick={onClose}>
      <div className="fixed inset-0 bg-black/40 backdrop-blur-sm"/>
      <div className={`relative bg-white rounded-2xl shadow-2xl w-full ${wide?"max-w-2xl":"max-w-lg"} max-h-[82vh] overflow-y-auto`} onClick={e=>e.stopPropagation()}>
        <div className="sticky top-0 bg-white rounded-t-2xl border-b border-gray-100 px-6 py-4 flex items-center justify-between z-10">
          <h3 className="text-base font-bold text-gray-900">{title}</h3>
          <button onClick={onClose} className="p-1 rounded-lg hover:bg-gray-100 text-gray-400 hover:text-gray-600 transition-colors">{I.close}</button>
        </div>
        <div className="px-6 py-5">{children}</div>
      </div>
    </div>
  );
}

function Field({ label, children, span2 }) {
  return <label className={`block ${span2?"col-span-2":""}`}><span className="block text-[11px] font-semibold text-gray-500 uppercase tracking-wider mb-1.5">{label}</span>{children}</label>;
}
const inp = "w-full px-3 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-emerald-500/30 focus:border-emerald-500 transition-all placeholder:text-gray-400";
const sel = inp + " appearance-none";

function SearchBar({ value, onChange, placeholder }) {
  return <div className="relative"><span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400">{I.search}</span><input className={inp+" pl-9"} placeholder={placeholder||"Buscar..."} value={value} onChange={e=>onChange(e.target.value)}/></div>;
}

function ConfirmDelete({ open, onClose, onConfirm, itemName }) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center px-4" onClick={onClose}>
      <div className="fixed inset-0 bg-black/50"/>
      <div className="relative bg-white rounded-2xl shadow-2xl max-w-sm w-full p-6" onClick={e=>e.stopPropagation()}>
        <p className="text-gray-900 font-semibold mb-2">¿Eliminar {itemName}?</p>
        <p className="text-gray-500 text-sm mb-5">Esta acción no se puede deshacer.</p>
        <div className="flex gap-3 justify-end">
          <button onClick={onClose} className="px-4 py-2 text-sm font-medium text-gray-600 bg-gray-100 rounded-xl hover:bg-gray-200">Cancelar</button>
          <button onClick={onConfirm} className="px-4 py-2 text-sm font-medium text-white bg-rose-500 rounded-xl hover:bg-rose-600">Eliminar</button>
        </div>
      </div>
    </div>
  );
}

function StatCard({ label, value, sub, color }) {
  const a = { green:"border-l-emerald-500", blue:"border-l-sky-500", yellow:"border-l-amber-500", red:"border-l-rose-500", purple:"border-l-purple-500", orange:"border-l-orange-500" };
  return (
    <div className={`bg-white rounded-xl border border-gray-100 border-l-4 ${a[color]||a.green} p-4 shadow-sm`}>
      <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider mb-1">{label}</p>
      <p className="text-2xl font-bold text-gray-900">{value}</p>
      {sub && <p className="text-xs text-gray-500 mt-1">{sub}</p>}
    </div>
  );
}

// ═══════════════════════════════
// PANTALLA DE LOGIN
// ═══════════════════════════════
function LoginScreen({ onLogin }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [remember, setRemember] = useState(true);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const submit = async (ev) => {
    ev.preventDefault();
    setError(""); setLoading(true);
    try {
      await onLogin(email.trim(), password, remember);
    } catch (e) {
      setError(e.message || "No se pudo iniciar sesión");
    } finally { setLoading(false); }
  };

  return (
    <div className="flex items-center justify-center h-screen bg-gray-50 px-4">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <div className="w-14 h-14 bg-emerald-600 rounded-2xl flex items-center justify-center text-white mx-auto mb-4">{I.tree}</div>
          <h1 className="text-lg font-bold text-gray-900">Dirección de Arbolado</h1>
          <p className="text-xs text-gray-400 uppercase tracking-[0.15em] font-semibold mt-1">Municipalidad de San Miguel de Tucumán</p>
        </div>
        <form onSubmit={submit} className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6 space-y-4">
          <Field label="Usuario (email)"><input type="email" required className={inp} value={email} onChange={e=>setEmail(e.target.value)} placeholder="usuario@arbolado.gob.ar" autoFocus/></Field>
          <Field label="Contraseña"><input type="password" required className={inp} value={password} onChange={e=>setPassword(e.target.value)} placeholder="••••••••"/></Field>
          <label className="flex items-center gap-2 cursor-pointer select-none">
            <input type="checkbox" checked={remember} onChange={e=>setRemember(e.target.checked)} className="w-4 h-4 rounded border-gray-300 text-emerald-600 focus:ring-emerald-500"/>
            <span className="text-sm text-gray-600">Recordarme en este dispositivo</span>
          </label>
          {error && <p className="text-sm text-rose-600 bg-rose-50 rounded-lg px-3 py-2">{error}</p>}
          <button type="submit" disabled={loading} className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-emerald-600 text-white text-sm font-semibold rounded-xl hover:bg-emerald-700 transition-colors shadow-sm disabled:opacity-60">
            {loading ? "Ingresando..." : "Iniciar sesión"}
          </button>
        </form>
        <p className="text-center text-xs text-gray-400 mt-5">¿No tenés cuenta? Pedile a un administrador que te la cree.</p>
      </div>
    </div>
  );
}

function PageHeader({ title, sub, children }) {
  return (
    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
      <div><h2 className="text-2xl font-bold text-gray-900 mb-0.5">{title}</h2><p className="text-sm text-gray-500">{sub}</p></div>
      <div className="flex gap-2 flex-shrink-0">{children}</div>
    </div>
  );
}

function BtnNew({ onClick, label }) {
  return <button onClick={onClick} className="flex items-center gap-2 px-4 py-2.5 bg-emerald-600 text-white text-sm font-semibold rounded-xl hover:bg-emerald-700 transition-colors shadow-sm">{I.plus} {label}</button>;
}

function EmptyRow({ cols, text }) {
  return <tr><td colSpan={cols} className="px-4 py-10 text-center text-gray-400 text-sm">{text}</td></tr>;
}

function ActionBtns({ onEdit, onDelete }) {
  return (
    <div className="flex items-center justify-end gap-0.5">
      <button onClick={onEdit} className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400 hover:text-gray-600 transition-colors">{I.edit}</button>
      <button onClick={onDelete} className="p-1.5 rounded-lg hover:bg-rose-50 text-gray-400 hover:text-rose-500 transition-colors">{I.trash}</button>
    </div>
  );
}

const TH = ({ children, className="" }) => <th className={`text-left px-4 py-3 font-semibold text-gray-500 text-[11px] uppercase tracking-wider ${className}`}>{children}</th>;

function SaveCancel({ onCancel, onSave }) {
  return (
    <div className="flex justify-end gap-3 mt-6">
      <button onClick={onCancel} className="px-4 py-2.5 text-sm font-medium text-gray-600 bg-gray-100 rounded-xl hover:bg-gray-200 transition-colors">Cancelar</button>
      <button onClick={onSave} className="px-5 py-2.5 text-sm font-semibold text-white bg-emerald-600 rounded-xl hover:bg-emerald-700 transition-colors">Guardar</button>
    </div>
  );
}

// ═══════════════════════════════
// MAIN APP
// ═══════════════════════════════
// ─── Alerta de cumpleaños ───
function BirthdayAlert({ personas, onClose }) {
  if (!personas || personas.length === 0) return null;
  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center px-4">
      <div className="fixed inset-0 bg-black/40 backdrop-blur-sm"/>
      <div className="relative bg-white rounded-2xl shadow-2xl max-w-md w-full overflow-hidden">
        <div className="bg-gradient-to-br from-amber-50 via-orange-50 to-yellow-50 px-6 pt-8 pb-6 text-center">
          <div className="text-5xl mb-3">🎂</div>
          <h2 className="text-xl font-bold text-gray-900 mb-1">{personas.length === 1 ? "¡Hoy hay un cumpleaños!" : `¡Hoy hay ${personas.length} cumpleaños!`}</h2>
          <p className="text-sm text-gray-500">Dirección de Arbolado — {new Date().toLocaleDateString("es-AR",{day:"numeric",month:"long"})}</p>
        </div>
        <div className="px-6 py-5">
          <div className="space-y-3">
            {personas.map((p,i) => (
              <div key={i} className="flex items-center gap-3 bg-amber-50/60 rounded-xl p-3.5">
                <div className="w-10 h-10 rounded-full bg-amber-100 text-amber-700 flex items-center justify-center text-lg font-bold shrink-0">
                  {(p.nombre||"?")[0].toUpperCase()}
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-gray-900 truncate">{p.nombre}</p>
                  <p className="text-xs text-gray-500">{p.funcion || "Dirección de Arbolado"}</p>
                </div>
                <span className="ml-auto text-xl shrink-0">🎉</span>
              </div>
            ))}
          </div>
        </div>
        <div className="px-6 pb-6">
          <button onClick={onClose} className="w-full px-4 py-3 bg-emerald-600 text-white text-sm font-semibold rounded-xl hover:bg-emerald-700 transition-colors shadow-sm">
            Continuar
          </button>
        </div>
      </div>
    </div>
  );
}

export default function App() {
  const [data, setData] = useState(defaultState);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState("dashboard");
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [session, setSession] = useState(null); // { access_token, refresh_token, user }
  const [profile, setProfile] = useState(null); // { id, email, nombre, rol }
  const [authLoading, setAuthLoading] = useState(true);
  const [birthdayPeople, setBirthdayPeople] = useState(null); // null = no revisado, [] = sin cumpleaños
  const [showBirthday, setShowBirthday] = useState(false);

  // Al cargar la app: revisar si hay una sesión guardada y validarla
  useEffect(() => {
    (async () => {
      const stored = loadStoredSession();
      if (!stored) { setAuthLoading(false); return; }
      const refreshed = await sbAuthRefresh(stored.refresh_token);
      if (!refreshed) { clearStoredSession(); setAuthLoading(false); return; }
      const remembered = !!localStorage.getItem(SESSION_KEY);
      saveSession(refreshed, remembered);
      setAccessToken(refreshed.access_token);
      const prof = await sbGetProfile(refreshed.user.id, refreshed.access_token);
      const fullProfile = prof || { id: refreshed.user.id, email: refreshed.user.email, nombre: refreshed.user.email, rol: "administrativo" };
      setCurrentUserRef(fullProfile);
      setSession(refreshed);
      setProfile(fullProfile);
      setAuthLoading(false);
    })();
  }, []);

  const handleLogin = async (email, password, remember) => {
    const s = await sbAuthLogin(email, password);
    setAccessToken(s.access_token);
    const prof = await sbGetProfile(s.user.id, s.access_token);
    const fullProfile = prof || { id: s.user.id, email: s.user.email, nombre: s.user.email, rol: "administrativo" };
    saveSession(s, remember);
    setCurrentUserRef(fullProfile);
    setSession(s);
    setProfile(fullProfile);
  };
  const handleLogout = () => {
    clearStoredSession();
    setAccessToken(null);
    setCurrentUserRef(null);
    setSession(null);
    setProfile(null);
  };

  useEffect(() => { if (session) loadData().then(d => { setData(d); setLoading(false); }); }, [session]);

  // Detección de cumpleaños al cargar los datos por primera vez
  useEffect(() => {
    if (loading || birthdayPeople !== null) return; // solo revisar una vez
    const hoyDate = new Date();
    const diaHoy = hoyDate.getDate();
    const mesHoy = hoyDate.getMonth() + 1;
    const cumpleaneros = (data.personal || []).filter(p => {
      if (!p.fechaNacimiento) return false;
      const partes = p.fechaNacimiento.split("-");
      if (partes.length < 3) return false;
      const mes = parseInt(partes[1], 10);
      const dia = parseInt(partes[2], 10);
      return dia === diaHoy && mes === mesHoy;
    });
    setBirthdayPeople(cumpleaneros);
    if (cumpleaneros.length > 0) setShowBirthday(true);
  }, [loading, data.personal, birthdayPeople]);
  // Sincroniza con el equipo cada 12 segundos para ver cambios de otros usuarios
  useEffect(() => {
    if (!session) return;
    const interval = setInterval(() => { loadData().then(setData); }, 12000);
    return () => clearInterval(interval);
  }, [session]);
  const up = useCallback((fn) => { setData(prev => fn(prev)); }, []);

  const ROLES = { administrador:"Administrador", director:"Director", administrativo:"Administrativo", inspector:"Inspector" };

  const sections = [
    { heading: "General", items: [
      { id:"dashboard", label:"Inicio", icon: I.dashboard },
      { id:"expedientes", label:"Expedientes", icon: I.expedientes },
      { id:"patrimonioVegetal", label:"Patrimonio Vegetal", icon: I.patrimonio },
      { id:"resoluciones", label:"Resoluciones", icon: I.resolucion },
      { id:"notas", label:"Notas", icon: I.nota },
    ]},
    { heading: "Compras y Finanzas", items: [
      { id:"compras", label:"Compras", icon: I.compras },
      { id:"cajaChica", label:"Caja Chica", icon: I.caja },
      { id:"proveedores", label:"Proveedores", icon: I.proveedores },
    ]},
    { heading: "Gestión del Arbolado", items: [
      { id:"podas", label:"Podas", icon: I.poda },
      { id:"extracciones", label:"Extracciones", icon: I.extraccion },
      { id:"plantaciones", label:"Plantaciones", icon: I.plantacion },
      { id:"tocones", label:"Tocones", icon: I.tocon },
    ]},
    { heading: "Recursos Humanos", items: [
      { id:"personal", label:"Personal", icon: I.personal },
      { id:"descansos", label:"Descansos Comp.", icon: I.descanso },
      { id:"licencias", label:"Licencias", icon: I.licencia },
    ]},
    { heading: "Operaciones", items: [
      { id:"tareas", label:"Tareas", icon: I.tareas },
      { id:"entregas", label:"Entrega de Materiales", icon: I.entregas },
    ]},
  ];
  if (profile?.rol === "administrador") {
    sections.push({ heading: "Administración", items: [ { id:"usuarios", label:"Usuarios", icon: I.personal } ] });
  }
  const allItems = sections.flatMap(s => s.items);

  if (authLoading) return <div className="flex items-center justify-center h-screen bg-gray-50"><div className="w-10 h-10 border-4 border-emerald-500 border-t-transparent rounded-full animate-spin"/></div>;
  if (!session) return <LoginScreen onLogin={handleLogin}/>;
  if (loading) return <div className="flex items-center justify-center h-screen bg-gray-50"><div className="w-10 h-10 border-4 border-emerald-500 border-t-transparent rounded-full animate-spin"/></div>;

  return (
    <div className="flex h-screen bg-gray-50 font-sans overflow-hidden">
      {/* Alerta de cumpleaños */}
      {showBirthday && <BirthdayAlert personas={birthdayPeople} onClose={()=>setShowBirthday(false)}/>}
      {sidebarOpen && <div className="fixed inset-0 bg-black/30 z-30 lg:hidden" onClick={()=>setSidebarOpen(false)}/>}

      {/* Sidebar */}
      <aside className={`fixed lg:static inset-y-0 left-0 z-40 w-60 bg-white border-r border-gray-100 flex flex-col transform transition-transform duration-200 ${sidebarOpen?"translate-x-0":"-translate-x-full lg:translate-x-0"}`}>
        <div className="px-4 py-4 border-b border-gray-100">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 bg-emerald-600 rounded-xl flex items-center justify-center text-white">{I.tree}</div>
            <div>
              <h1 className="text-sm font-bold text-gray-900 leading-tight">Dir. de Arbolado</h1>
              <p className="text-[9px] text-gray-400 uppercase tracking-[0.15em] font-semibold">Municipalidad SMT</p>
            </div>
          </div>
        </div>
        <nav className="flex-1 overflow-y-auto px-3 py-3">
          {sections.map(sec => (
            <div key={sec.heading} className="mb-3">
              <p className="px-3 mb-1 text-[10px] font-bold text-gray-300 uppercase tracking-[0.15em]">{sec.heading}</p>
              {sec.items.map(n => (
                <button key={n.id} onClick={()=>{setPage(n.id);setSidebarOpen(false);}}
                  className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-[13px] font-medium transition-all ${page===n.id?"bg-emerald-50 text-emerald-700":"text-gray-500 hover:bg-gray-50 hover:text-gray-700"}`}>
                  <span className={page===n.id?"text-emerald-600":"text-gray-400"}>{n.icon}</span>{n.label}
                </button>
              ))}
            </div>
          ))}
        </nav>
        <div className="px-4 py-3 border-t border-gray-100">
          <div className="flex items-center justify-between mb-2">
            <div className="min-w-0">
              <p className="text-xs font-semibold text-gray-800 truncate">{profile?.nombre || profile?.email}</p>
              <p className="text-[10px] text-emerald-600 font-medium">{ROLES[profile?.rol] || "Administrativo"}</p>
            </div>
            <button onClick={handleLogout} title="Cerrar sesión" className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400 hover:text-rose-500 transition-colors">
              <svg width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>
            </button>
          </div>
          <p className="text-[9px] text-gray-300 uppercase tracking-[0.15em]">Sistema Administrativo v2</p>
        </div>
      </aside>

      {/* Main */}
      <main className="flex-1 overflow-y-auto">
        <div className="lg:hidden sticky top-0 bg-white/80 backdrop-blur-md border-b border-gray-100 px-4 py-3 flex items-center gap-3 z-20">
          <button onClick={()=>setSidebarOpen(true)} className="p-1 text-gray-500">{I.menu}</button>
          <span className="text-sm font-bold text-gray-900">{allItems.find(n=>n.id===page)?.label}</span>
        </div>
        <div className="p-4 sm:p-6 lg:p-8 max-w-6xl mx-auto">
          {page==="dashboard" && <Dashboard data={data} setPage={setPage}/>}
          {page==="expedientes" && <Expedientes data={data} up={up}/>}
          {page==="patrimonioVegetal" && <PatrimonioVegetal data={data} up={up}/>}
          {page==="compras" && <Compras data={data} up={up}/>}
          {page==="cajaChica" && <CajaChicaPage data={data} up={up}/>}
          {page==="tareas" && <TareasPage data={data} up={up}/>}
          {page==="descansos" && <DescansosPage data={data} up={up}/>}
          {page==="personal" && <PersonalPage data={data} up={up}/>}
          {page==="podas" && <GestionArboladoPage data={data} up={up} tipo="podas" tipoLabel="Podas"/>}
          {page==="extracciones" && <GestionArboladoPage data={data} up={up} tipo="extracciones" tipoLabel="Extracciones"/>}
          {page==="plantaciones" && <GestionArboladoPage data={data} up={up} tipo="plantaciones" tipoLabel="Plantaciones"/>}
          {page==="tocones" && <GestionArboladoPage data={data} up={up} tipo="tocones" tipoLabel="Tocones"/>}
          {page==="usuarios" && <UsuariosPage/>}
          {page==="licencias" && <LicenciasPage data={data} up={up}/>}
          {page==="resoluciones" && <ResolucionesPage data={data} up={up}/>}
          {page==="proveedores" && <ProveedoresPage data={data} up={up} setPage={setPage}/>}
          {page==="entregas" && <EntregasPage data={data} up={up}/>}
          {page==="notas" && <NotasPage data={data} up={up}/>}
        </div>
      </main>
    </div>
  );
}

// ═══════════════════════════════
// DASHBOARD
// ═══════════════════════════════
function Dashboard({ data, setPage }) {
  const pendC = data.compras.filter(c=>c.estado==="pendiente").length;
  const mes = new Date().getMonth();
  const regs = data.cajaChica.registros.filter(r=>r.mes===mes);
  const gasto = regs.reduce((s,r)=>s+(parseFloat(r.montoTotal)||0),0);
  const saldo = (parseFloat(data.cajaChica.presupuesto)||0) - gasto;
  const tActivas = data.tareas.filter(t=>t.estado!=="realizada").length;
  const descMes = data.descansos.filter(d => { const f = d.fecha; if(!f) return false; return parseInt(f.split("-")[1])===mes+1; }).length;

  return (
    <div>
      <PageHeader title="Panel de Control" sub="Resumen general — Dirección de Arbolado"/>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-8">
        <StatCard label="Expedientes" value={data.expedientes.length} sub="Registrados" color="blue"/>
        <StatCard label="Patrimonio Vegetal" value={data.patrimonioVegetal.length} sub="Expedientes" color="green"/>
        <StatCard label="Compras pend." value={pendC} sub={`${data.compras.length} totales`} color="yellow"/>
        <StatCard label="Saldo Caja Chica" value={fmtMoney(saldo)} sub={`Presup: ${fmtMoney(data.cajaChica.presupuesto)}`} color={saldo<0?"red":"green"}/>
        <StatCard label="Tareas activas" value={tActivas} sub={`${data.tareas.filter(t=>t.estado==="en_proceso").length} en proceso`} color="purple"/>
      </div>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-8">
        <StatCard label="Proveedores" value={data.proveedores.length} sub="Registrados" color="orange"/>
        <StatCard label="Personal" value={(data.personal||[]).length} sub="Agentes registrados" color="purple"/>
        <StatCard label="Gestión Arbolado" value={(data.gestionArbolado||[]).length} sub="Intervenciones totales" color="green"/>
        <StatCard label="Resoluciones" value={data.resoluciones.length} sub="En archivo" color="blue"/>
        <StatCard label="Descansos (mes)" value={descMes} sub={MESES[mes]} color="green"/>
        <StatCard label="Entregas" value={data.entregas.length} sub="Materiales entregados" color="orange"/>
      </div>

      <div className="grid lg:grid-cols-2 gap-6">
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm">
          <div className="px-5 py-3.5 border-b border-gray-50 flex items-center justify-between">
            <h3 className="font-semibold text-gray-900 text-sm">Últimos expedientes</h3>
            <button onClick={()=>setPage("expedientes")} className="text-xs font-medium text-emerald-600 hover:text-emerald-700">Ver todos →</button>
          </div>
          <div className="divide-y divide-gray-50">
            {data.expedientes.length===0 ? <p className="px-5 py-6 text-sm text-gray-400 text-center">Sin expedientes</p>
            : data.expedientes.slice(-5).reverse().map(e => (
              <div key={e.id} className="px-5 py-3 flex items-center justify-between">
                <div><p className="text-sm font-medium text-gray-900">{e.numero}</p><p className="text-xs text-gray-500">{e.causante}</p></div>
                <span className="text-xs text-gray-400">{fmtDate(e.fechaIngreso)}</span>
              </div>
            ))}
          </div>
        </div>
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm">
          <div className="px-5 py-3.5 border-b border-gray-50 flex items-center justify-between">
            <h3 className="font-semibold text-gray-900 text-sm">Tareas pendientes</h3>
            <button onClick={()=>setPage("tareas")} className="text-xs font-medium text-emerald-600 hover:text-emerald-700">Ver todas →</button>
          </div>
          <div className="divide-y divide-gray-50">
            {data.tareas.filter(t=>t.estado!=="realizada").length===0 ? <p className="px-5 py-6 text-sm text-gray-400 text-center">Sin tareas pendientes</p>
            : data.tareas.filter(t=>t.estado!=="realizada").slice(0,5).map(t => (
              <div key={t.id} className="px-5 py-3 flex items-center justify-between">
                <div><p className="text-sm font-medium text-gray-900">{t.descripcion}</p><p className="text-xs text-gray-500">{t.encargado}</p></div>
                <Badge label={t.estado==="por_hacer"?"Pendiente":"En proceso"} color={t.estado==="por_hacer"?"yellow":"blue"}/>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

// ═══════════════════════════════
// EXPEDIENTES
// ═══════════════════════════════
function Expedientes({ data, up }) {
  const [search, setSearch] = useState("");
  const [modal, setModal] = useState(false);
  const [editing, setEditing] = useState(null);
  const [del, setDel] = useState(null);
  const empty = { numero:"", causante:"", asunto:"", fechaIngreso:hoy(), recibidoPor:"", area:"", domicilio:"", estado:"para_inspeccion", observaciones:"" };
  const [form, setForm] = useState(empty);

  const list = useMemo(() => {
    const q = search.toLowerCase();
    return [...data.expedientes].reverse().filter(e => e.numero.toLowerCase().includes(q)||e.causante.toLowerCase().includes(q)||e.asunto.toLowerCase().includes(q));
  }, [data.expedientes, search]);

  const esPV = esAsuntoPatrimonioVegetal(form.asunto);

  const openNew = () => { setForm(empty); setEditing(null); setModal(true); };
  const openEdit = (e) => { setForm({estado:"para_inspeccion", domicilio:"", ...e}); setEditing(e.id); setModal(true); };
  const save = () => { if(!form.numero.trim()) return; const id = editing || uid(); up(p => editing ? {...p,expedientes:p.expedientes.map(e=>e.id===editing?{...form,id}:e)} : {...p,expedientes:[...p.expedientes,{...form,id}]}); (editing ? sbUpdate("expedientes", id, form) : sbInsert("expedientes", id, form)); setModal(false); };
  const remove = () => { up(p=>({...p,expedientes:p.expedientes.filter(e=>e.id!==del)})); sbDelete("expedientes", del); setDel(null); };
  const f = (k,v) => setForm(p=>({...p,[k]:v}));

  return (
    <div>
      <PageHeader title="Expedientes" sub="Registro de ingreso de expedientes"><BtnNew onClick={openNew} label="Nuevo expediente"/></PageHeader>
      <div className="mb-4 max-w-sm"><SearchBar value={search} onChange={setSearch} placeholder="Buscar por número, causante o asunto..."/></div>
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden"><div className="overflow-x-auto">
        <table className="w-full text-sm"><thead><tr className="border-b border-gray-100 bg-gray-50/50">
          <TH>N° Expediente</TH><TH>Causante</TH><TH>Asunto</TH><TH className="hidden md:table-cell">Fecha</TH><TH className="hidden lg:table-cell">Recibido por</TH><TH className="text-right">Acciones</TH>
        </tr></thead><tbody className="divide-y divide-gray-50">
          {list.length===0 ? <EmptyRow cols={6} text={search?"Sin resultados":"Sin expedientes registrados"}/> : list.map(e => (
            <tr key={e.id} className={`hover:bg-gray-50/50 ${esAsuntoPatrimonioVegetal(e.asunto)?"border-l-4 border-l-emerald-400":""}`}>
              <td className="px-4 py-3 font-medium text-gray-900">{e.numero}</td>
              <td className="px-4 py-3 text-gray-700">{e.causante}</td>
              <td className="px-4 py-3 text-gray-600">
                <div className="flex items-center gap-2">
                  <span className="max-w-[180px] truncate">{e.asunto}</span>
                  {esAsuntoPatrimonioVegetal(e.asunto) && <span className="shrink-0"><Badge label="Patrimonio Vegetal" color="green"/></span>}
                </div>
              </td>
              <td className="px-4 py-3 text-gray-500 hidden md:table-cell">{fmtDate(e.fechaIngreso)}</td>
              <td className="px-4 py-3 text-gray-500 hidden lg:table-cell">{e.recibidoPor||"—"}</td>
              <td className="px-4 py-3 text-right"><ActionBtns onEdit={()=>openEdit(e)} onDelete={()=>setDel(e.id)}/></td>
            </tr>
          ))}
        </tbody></table>
      </div></div>
      <Modal open={modal} onClose={()=>setModal(false)} title={editing?"Editar expediente":"Nuevo expediente"}>
        <div className="grid grid-cols-2 gap-4">
          <Field label="N° Expediente"><input className={inp} value={form.numero} onChange={e=>f("numero",e.target.value)} placeholder="Ej: 1234/2026"/></Field>
          <Field label="Fecha de ingreso"><input type="date" className={inp} value={form.fechaIngreso} onChange={e=>f("fechaIngreso",e.target.value)}/></Field>
          <Field label="Causante" span2><input className={inp} value={form.causante} onChange={e=>f("causante",e.target.value)} placeholder="Nombre del causante"/></Field>
          <Field label="Asunto" span2>
            <input className={inp} value={form.asunto} onChange={e=>f("asunto",e.target.value)} placeholder="Descripción del asunto"/>
            {esPV && <p className="text-[11px] text-emerald-600 font-medium mt-1.5">✓ Este expediente se vinculará automáticamente al módulo Patrimonio Vegetal</p>}
          </Field>
          <Field label="Recibido por"><input className={inp} value={form.recibidoPor} onChange={e=>f("recibidoPor",e.target.value)} placeholder="Quién lo recibió"/></Field>
          <Field label="Área / Destino"><input className={inp} value={form.area} onChange={e=>f("area",e.target.value)} placeholder="Área de destino"/></Field>
          {esPV && (
            <>
              <Field label="Domicilio" span2><input className={inp} value={form.domicilio} onChange={e=>f("domicilio",e.target.value)} placeholder="Domicilio del inmueble o solicitante"/></Field>
              <Field label="Estado del trámite (Patrimonio Vegetal)" span2>
                <select className={sel} value={form.estado} onChange={e=>f("estado",e.target.value)}>
                  {Object.entries(PV_ESTADOS).map(([k,v])=><option key={k} value={k}>{v.l}</option>)}
                </select>
              </Field>
            </>
          )}
          <Field label="Observaciones" span2><textarea className={inp+" resize-none"} rows={2} value={form.observaciones} onChange={e=>f("observaciones",e.target.value)} placeholder="Notas..."/></Field>
        </div>
        <SaveCancel onCancel={()=>setModal(false)} onSave={save}/>
      </Modal>
      <ConfirmDelete open={!!del} onClose={()=>setDel(null)} onConfirm={remove} itemName="este expediente"/>
    </div>
  );
}

// ═══════════════════════════════
// COMPRAS
// ═══════════════════════════════
function Compras({ data, up }) {
  const [search, setSearch] = useState("");
  const [filtro, setFiltro] = useState("todos");
  const [modal, setModal] = useState(false);
  const [editing, setEditing] = useState(null);
  const [del, setDel] = useState(null);
  const empty = { numeroExpediente:"", proveedor:"", contactoProveedor:"", monto:"", fechaInicio:hoy(), fechaEstimada:"", estado:"pendiente", observaciones:"" };
  const [form, setForm] = useState(empty);

  const list = useMemo(() => {
    const q = search.toLowerCase();
    return [...data.compras].reverse().filter(c => {
      const m = c.numeroExpediente.toLowerCase().includes(q)||c.proveedor.toLowerCase().includes(q);
      return m && (filtro==="todos"||c.estado===filtro);
    });
  }, [data.compras, search, filtro]);

  const est = { pendiente:{l:"Pendiente",c:"yellow"}, pagado:{l:"Pagado",c:"green"}, retirado:{l:"Retirado",c:"blue"} };
  const openNew = () => { setForm(empty); setEditing(null); setModal(true); };
  const openEdit = (c) => { setForm({...c}); setEditing(c.id); setModal(true); };
  const save = () => { if(!form.numeroExpediente.trim()) return; const id = editing || uid(); up(p=> editing ? {...p,compras:p.compras.map(c=>c.id===editing?{...form,id}:c)} : {...p,compras:[...p.compras,{...form,id}]}); (editing ? sbUpdate("compras", id, form) : sbInsert("compras", id, form)); setModal(false); };
  const remove = () => { up(p=>({...p,compras:p.compras.filter(c=>c.id!==del)})); sbDelete("compras", del); setDel(null); };
  const f = (k,v) => setForm(p=>({...p,[k]:v}));

  // Get proveedor names for autocomplete
  const provNombres = data.proveedores.map(p=>p.nombre);

  return (
    <div>
      <PageHeader title="Seguimiento de Compras" sub="Control de expedientes de provisiones"><BtnNew onClick={openNew} label="Nueva compra"/></PageHeader>
      <div className="flex flex-col sm:flex-row gap-3 mb-4">
        <div className="max-w-sm flex-1"><SearchBar value={search} onChange={setSearch} placeholder="Buscar por expediente o proveedor..."/></div>
        <div className="flex gap-1.5">
          {["todos","pendiente","pagado","retirado"].map(e=>(
            <button key={e} onClick={()=>setFiltro(e)} className={`px-3 py-2 text-xs font-semibold rounded-lg transition-colors ${filtro===e?"bg-emerald-100 text-emerald-700":"bg-gray-100 text-gray-500 hover:bg-gray-200"}`}>
              {e==="todos"?"Todos":est[e]?.l}
            </button>
          ))}
        </div>
      </div>
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden"><div className="overflow-x-auto">
        <table className="w-full text-sm"><thead><tr className="border-b border-gray-100 bg-gray-50/50">
          <TH>N° Expediente</TH><TH>Proveedor</TH><TH className="hidden sm:table-cell">Contacto</TH><TH className="text-right hidden md:table-cell">Monto</TH><TH className="hidden lg:table-cell">Inicio</TH><TH className="text-center">Estado</TH><TH className="text-right">Acciones</TH>
        </tr></thead><tbody className="divide-y divide-gray-50">
          {list.length===0 ? <EmptyRow cols={7} text="Sin resultados"/> : list.map(c => (
            <tr key={c.id} className="hover:bg-gray-50/50">
              <td className="px-4 py-3 font-medium text-gray-900">{c.numeroExpediente}</td>
              <td className="px-4 py-3 text-gray-700">{c.proveedor}</td>
              <td className="px-4 py-3 text-gray-500 hidden sm:table-cell">{c.contactoProveedor||"—"}</td>
              <td className="px-4 py-3 text-right font-medium text-gray-900 hidden md:table-cell">{fmtMoney(c.monto)}</td>
              <td className="px-4 py-3 text-gray-500 hidden lg:table-cell">{fmtDate(c.fechaInicio)}</td>
              <td className="px-4 py-3 text-center"><Badge label={est[c.estado]?.l||c.estado} color={est[c.estado]?.c||"gray"}/></td>
              <td className="px-4 py-3 text-right"><ActionBtns onEdit={()=>openEdit(c)} onDelete={()=>setDel(c.id)}/></td>
            </tr>
          ))}
        </tbody></table>
      </div></div>
      <Modal open={modal} onClose={()=>setModal(false)} title={editing?"Editar compra":"Nueva compra"}>
        <div className="grid grid-cols-2 gap-4">
          <Field label="N° Expediente"><input className={inp} value={form.numeroExpediente} onChange={e=>f("numeroExpediente",e.target.value)} placeholder="Ej: 5678/2026"/></Field>
          <Field label="Estado"><select className={sel} value={form.estado} onChange={e=>f("estado",e.target.value)}><option value="pendiente">Pendiente</option><option value="pagado">Pagado</option><option value="retirado">Retirado</option></select></Field>
          <Field label="Proveedor" span2>
            <input className={inp} list="prov-list" value={form.proveedor} onChange={e=>f("proveedor",e.target.value)} placeholder="Nombre del proveedor"/>
            <datalist id="prov-list">{provNombres.map((n,i)=><option key={i} value={n}/>)}</datalist>
          </Field>
          <Field label="Contacto del proveedor" span2><input className={inp} value={form.contactoProveedor} onChange={e=>f("contactoProveedor",e.target.value)} placeholder="Teléfono, email, etc."/></Field>
          <Field label="Monto"><input type="number" step="0.01" className={inp} value={form.monto} onChange={e=>f("monto",e.target.value)} placeholder="0.00"/></Field>
          <Field label="Fecha de inicio"><input type="date" className={inp} value={form.fechaInicio} onChange={e=>f("fechaInicio",e.target.value)}/></Field>
          <Field label="Fecha estimada entrega" span2><input type="date" className={inp} value={form.fechaEstimada} onChange={e=>f("fechaEstimada",e.target.value)}/></Field>
          <Field label="Observaciones" span2><textarea className={inp+" resize-none"} rows={2} value={form.observaciones} onChange={e=>f("observaciones",e.target.value)} placeholder="Notas, demoras..."/></Field>
        </div>
        <SaveCancel onCancel={()=>setModal(false)} onSave={save}/>
      </Modal>
      <ConfirmDelete open={!!del} onClose={()=>setDel(null)} onConfirm={remove} itemName="esta compra"/>
    </div>
  );
}

// ═══════════════════════════════
// CAJA CHICA
// ═══════════════════════════════
function CajaChicaPage({ data, up }) {
  const h = new Date();
  const [mesS, setMesS] = useState(h.getMonth());
  const [anioS, setAnioS] = useState(h.getFullYear());
  const [modal, setModal] = useState(false);
  const [modalP, setModalP] = useState(false);
  const [editing, setEditing] = useState(null);
  const [del, setDel] = useState(null);
  const [pInput, setPInput] = useState("");
  const empty = { numeroFactura:"", proveedor:"", detalle:"", destino:"", cantidad:1, montoPorUnidad:"", montoTotal:"", fecha:hoy() };
  const [form, setForm] = useState(empty);

  const regs = useMemo(() => data.cajaChica.registros.filter(r=>r.mes===mesS&&r.anio===anioS), [data.cajaChica.registros, mesS, anioS]);
  const totalG = regs.reduce((s,r)=>s+(parseFloat(r.montoTotal)||0),0);
  const pres = parseFloat(data.cajaChica.presupuesto)||0;
  const saldo = pres - totalG;
  const pct = pres>0?Math.min((totalG/pres)*100,100):0;

  const openNew = () => { setForm(empty); setEditing(null); setModal(true); };
  const openEdit = (r) => { setForm({...r}); setEditing(r.id); setModal(true); };
  const save = () => {
    if(!form.numeroFactura.trim()) return;
    const reg = {...form, mes:mesS, anio:anioS};
    const id = editing || uid();
    up(p => {
      const rs = [...p.cajaChica.registros];
      if(editing){ const i=rs.findIndex(r=>r.id===editing); if(i>=0)rs[i]={...reg,id}; }
      else rs.push({...reg,id});
      return {...p, cajaChica:{...p.cajaChica, registros:rs}};
    });
    (editing ? sbUpdate("caja_chica_registros", id, reg) : sbInsert("caja_chica_registros", id, reg));
    setModal(false);
  };
  const remove = () => { up(p=>({...p,cajaChica:{...p.cajaChica,registros:p.cajaChica.registros.filter(r=>r.id!==del)}})); sbDelete("caja_chica_registros", del); setDel(null); };
  const saveP = () => { const v = parseFloat(pInput)||0; up(p=>({...p,cajaChica:{...p.cajaChica,presupuesto:v}})); sbSetPresupuesto(v); setModalP(false); };
  const f = (k,v) => { setForm(p => { const n={...p,[k]:v}; if(k==="montoPorUnidad"||k==="cantidad"){ const c=k==="cantidad"?parseFloat(v)||0:parseFloat(n.cantidad)||0; const u=k==="montoPorUnidad"?parseFloat(v)||0:parseFloat(n.montoPorUnidad)||0; n.montoTotal=(c*u).toFixed(2); } return n; }); };

  return (
    <div>
      <PageHeader title="Caja Chica" sub="Rendición mensual de gastos">
        <button onClick={()=>{setPInput(data.cajaChica.presupuesto.toString());setModalP(true);}} className="px-4 py-2.5 text-sm font-medium text-gray-700 bg-white border border-gray-200 rounded-xl hover:bg-gray-50">Presupuesto</button>
        <BtnNew onClick={openNew} label="Nuevo gasto"/>
      </PageHeader>
      <div className="grid sm:grid-cols-3 gap-3 mb-6">
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4">
          <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider mb-2">Período</p>
          <div className="flex gap-2">
            <select className={sel+" text-sm"} value={mesS} onChange={e=>setMesS(Number(e.target.value))}>{MESES.map((m,i)=><option key={i} value={i}>{m}</option>)}</select>
            <input type="number" className={inp+" w-24 text-sm"} value={anioS} onChange={e=>setAnioS(Number(e.target.value))}/>
          </div>
        </div>
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4">
          <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider mb-1">Gastado</p>
          <p className="text-xl font-bold text-gray-900">{fmtMoney(totalG)}</p>
          <div className="mt-2 h-2 bg-gray-100 rounded-full overflow-hidden"><div className={`h-full rounded-full transition-all ${pct>90?"bg-rose-500":pct>70?"bg-amber-500":"bg-emerald-500"}`} style={{width:`${pct}%`}}/></div>
        </div>
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4">
          <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider mb-1">Saldo</p>
          <p className={`text-xl font-bold ${saldo<0?"text-rose-600":"text-emerald-600"}`}>{fmtMoney(saldo)}</p>
          <p className="text-xs text-gray-400 mt-1">de {fmtMoney(pres)}</p>
        </div>
      </div>
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden"><div className="overflow-x-auto">
        <table className="w-full text-sm"><thead><tr className="border-b border-gray-100 bg-gray-50/50">
          <TH>Factura</TH><TH>Proveedor</TH><TH className="hidden sm:table-cell">Detalle</TH><TH className="hidden md:table-cell">Destino</TH><TH className="hidden lg:table-cell">Fecha</TH><TH className="text-right">Total</TH><TH className="text-right">Acciones</TH>
        </tr></thead><tbody className="divide-y divide-gray-50">
          {regs.length===0 ? <EmptyRow cols={7} text={`Sin gastos para ${MESES[mesS]} ${anioS}`}/> : regs.map(r => (
            <tr key={r.id} className="hover:bg-gray-50/50">
              <td className="px-4 py-3 font-medium text-gray-900">{r.numeroFactura}</td>
              <td className="px-4 py-3 text-gray-700">{r.proveedor}</td>
              <td className="px-4 py-3 text-gray-600 hidden sm:table-cell max-w-[160px] truncate">{r.detalle}</td>
              <td className="px-4 py-3 text-gray-500 hidden md:table-cell">{r.destino}</td>
              <td className="px-4 py-3 text-gray-500 hidden lg:table-cell">{fmtDate(r.fecha)}</td>
              <td className="px-4 py-3 text-right font-medium text-gray-900">{fmtMoney(r.montoTotal)}</td>
              <td className="px-4 py-3 text-right"><ActionBtns onEdit={()=>openEdit(r)} onDelete={()=>setDel(r.id)}/></td>
            </tr>
          ))}
        </tbody></table>
      </div></div>
      <Modal open={modal} onClose={()=>setModal(false)} title={editing?"Editar gasto":"Nuevo gasto"}>
        <div className="grid grid-cols-2 gap-4">
          <Field label="N° Factura"><input className={inp} value={form.numeroFactura} onChange={e=>f("numeroFactura",e.target.value)}/></Field>
          <Field label="Fecha"><input type="date" className={inp} value={form.fecha} onChange={e=>f("fecha",e.target.value)}/></Field>
          <Field label="Proveedor" span2><input className={inp} value={form.proveedor} onChange={e=>f("proveedor",e.target.value)}/></Field>
          <Field label="Detalle" span2><input className={inp} value={form.detalle} onChange={e=>f("detalle",e.target.value)} placeholder="Qué se compró"/></Field>
          <Field label="Destino" span2><input className={inp} value={form.destino} onChange={e=>f("destino",e.target.value)} placeholder="Para qué área o uso"/></Field>
          <Field label="Cantidad"><input type="number" min="1" className={inp} value={form.cantidad} onChange={e=>f("cantidad",e.target.value)}/></Field>
          <Field label="Monto por unidad"><input type="number" step="0.01" className={inp} value={form.montoPorUnidad} onChange={e=>f("montoPorUnidad",e.target.value)} placeholder="0.00"/></Field>
          <Field label="Monto total" span2><input type="number" step="0.01" className={inp+" bg-gray-100 font-semibold"} value={form.montoTotal} onChange={e=>f("montoTotal",e.target.value)}/><p className="text-[11px] text-gray-400 mt-1">Cantidad × Monto unitario. Editable manualmente.</p></Field>
        </div>
        <SaveCancel onCancel={()=>setModal(false)} onSave={save}/>
      </Modal>
      <Modal open={modalP} onClose={()=>setModalP(false)} title="Presupuesto mensual">
        <Field label="Monto del presupuesto"><input type="number" step="0.01" className={inp} value={pInput} onChange={e=>setPInput(e.target.value)} placeholder="0.00"/></Field>
        <p className="text-xs text-gray-400 mt-2">Se aplica a todos los meses.</p>
        <SaveCancel onCancel={()=>setModalP(false)} onSave={saveP}/>
      </Modal>
      <ConfirmDelete open={!!del} onClose={()=>setDel(null)} onConfirm={remove} itemName="este gasto"/>
    </div>
  );
}

// ═══════════════════════════════
// TAREAS (Kanban)
// ═══════════════════════════════
function TareasPage({ data, up }) {
  const [modal, setModal] = useState(false);
  const [editing, setEditing] = useState(null);
  const [del, setDel] = useState(null);
  const [vista, setVista] = useState("kanban");
  const empty = { encargado:"", descripcion:"", estado:"por_hacer", fechaCreacion:hoy(), fechaLimite:"", prioridad:"media" };
  const [form, setForm] = useState(empty);

  const cols = [
    { id:"por_hacer", label:"Por hacer", border:"border-amber-400", bg:"bg-amber-50", text:"text-amber-700" },
    { id:"en_proceso", label:"En proceso", border:"border-sky-400", bg:"bg-sky-50", text:"text-sky-700" },
    { id:"realizada", label:"Realizada", border:"border-emerald-400", bg:"bg-emerald-50", text:"text-emerald-700" },
  ];
  const prio = { alta:{l:"Alta",c:"red"}, media:{l:"Media",c:"yellow"}, baja:{l:"Baja",c:"gray"} };

  const openNew = (est) => { setForm({...empty,estado:est||"por_hacer"}); setEditing(null); setModal(true); };
  const openEdit = (t) => { setForm({...t}); setEditing(t.id); setModal(true); };
  const save = () => { if(!form.descripcion.trim()) return; const id = editing || uid(); up(p=> editing ? {...p,tareas:p.tareas.map(t=>t.id===editing?{...form,id}:t)} : {...p,tareas:[...p.tareas,{...form,id}]}); (editing ? sbUpdate("tareas", id, form) : sbInsert("tareas", id, form)); setModal(false); };
  const remove = () => { up(p=>({...p,tareas:p.tareas.filter(t=>t.id!==del)})); sbDelete("tareas", del); setDel(null); };
  const move = (id,ne) => { let updated; up(p=>{ updated = p.tareas.map(t=>t.id===id?{...t,estado:ne}:t); return {...p,tareas:updated}; }); const t = updated.find(x=>x.id===id); if(t) sbUpdate("tareas", id, t); };
  const f = (k,v) => setForm(p=>({...p,[k]:v}));

  return (
    <div>
      <PageHeader title="Tareas" sub="Registro y seguimiento de tareas">
        <div className="flex bg-gray-100 rounded-lg p-0.5">
          <button onClick={()=>setVista("kanban")} className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-colors ${vista==="kanban"?"bg-white text-gray-900 shadow-sm":"text-gray-500"}`}>Kanban</button>
          <button onClick={()=>setVista("lista")} className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-colors ${vista==="lista"?"bg-white text-gray-900 shadow-sm":"text-gray-500"}`}>Lista</button>
        </div>
        <BtnNew onClick={()=>openNew()} label="Nueva tarea"/>
      </PageHeader>

      {vista==="kanban" ? (
        <div className="grid lg:grid-cols-3 gap-4">
          {cols.map(col => {
            const items = data.tareas.filter(t=>t.estado===col.id);
            const ci = cols.findIndex(c=>c.id===col.id);
            return (
              <div key={col.id}>
                <div className={`flex items-center justify-between mb-3 pb-2 border-b-2 ${col.border}`}>
                  <div className="flex items-center gap-2"><span className={`text-sm font-bold ${col.text}`}>{col.label}</span><span className={`${col.bg} ${col.text} text-xs font-bold w-6 h-6 rounded-full flex items-center justify-center`}>{items.length}</span></div>
                  <button onClick={()=>openNew(col.id)} className="p-1 rounded-lg hover:bg-gray-100 text-gray-400">{I.plus}</button>
                </div>
                <div className="space-y-2.5">
                  {items.length===0 && <div className="border-2 border-dashed border-gray-200 rounded-xl p-6 text-center"><p className="text-xs text-gray-400">Sin tareas</p></div>}
                  {items.map(t => (
                    <div key={t.id} className="bg-white rounded-xl border border-gray-100 shadow-sm p-4 group">
                      <div className="flex items-start justify-between gap-2 mb-2">
                        <p className="text-sm font-medium text-gray-900 leading-snug">{t.descripcion}</p>
                        <div className="flex gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                          <button onClick={()=>openEdit(t)} className="p-1 rounded hover:bg-gray-100 text-gray-400">{I.edit}</button>
                          <button onClick={()=>setDel(t.id)} className="p-1 rounded hover:bg-rose-50 text-gray-400 hover:text-rose-500">{I.trash}</button>
                        </div>
                      </div>
                      <div className="flex items-center justify-between mt-2">
                        <div className="flex items-center gap-2"><Badge label={prio[t.prioridad]?.l} color={prio[t.prioridad]?.c}/>{t.encargado&&<span className="text-xs text-gray-500">{t.encargado}</span>}</div>
                        {t.fechaLimite&&<span className="text-xs text-gray-400">{fmtDate(t.fechaLimite)}</span>}
                      </div>
                      <div className="flex gap-1.5 mt-3 pt-2.5 border-t border-gray-50">
                        {ci>0 && <button onClick={()=>move(t.id,cols[ci-1].id)} className="text-xs text-gray-400 hover:text-gray-600 font-medium">← {cols[ci-1].label}</button>}
                        {ci<2 && <button onClick={()=>move(t.id,cols[ci+1].id)} className="text-xs text-gray-400 hover:text-gray-600 font-medium ml-auto">{cols[ci+1].label} →</button>}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden"><div className="overflow-x-auto">
          <table className="w-full text-sm"><thead><tr className="border-b border-gray-100 bg-gray-50/50">
            <TH>Tarea</TH><TH>Encargado</TH><TH className="text-center hidden sm:table-cell">Prioridad</TH><TH className="text-center">Estado</TH><TH className="hidden md:table-cell">Límite</TH><TH className="text-right">Acciones</TH>
          </tr></thead><tbody className="divide-y divide-gray-50">
            {data.tareas.length===0 ? <EmptyRow cols={6} text="Sin tareas"/> : data.tareas.map(t => (
              <tr key={t.id} className="hover:bg-gray-50/50">
                <td className="px-4 py-3 font-medium text-gray-900">{t.descripcion}</td>
                <td className="px-4 py-3 text-gray-700">{t.encargado}</td>
                <td className="px-4 py-3 text-center hidden sm:table-cell"><Badge label={prio[t.prioridad]?.l} color={prio[t.prioridad]?.c}/></td>
                <td className="px-4 py-3 text-center"><Badge label={cols.find(c=>c.id===t.estado)?.label} color={t.estado==="por_hacer"?"yellow":t.estado==="en_proceso"?"blue":"green"}/></td>
                <td className="px-4 py-3 text-gray-500 hidden md:table-cell">{fmtDate(t.fechaLimite)}</td>
                <td className="px-4 py-3 text-right"><ActionBtns onEdit={()=>openEdit(t)} onDelete={()=>setDel(t.id)}/></td>
              </tr>
            ))}
          </tbody></table>
        </div></div>
      )}
      <Modal open={modal} onClose={()=>setModal(false)} title={editing?"Editar tarea":"Nueva tarea"}>
        <div className="grid grid-cols-2 gap-4">
          <Field label="Descripción" span2><input className={inp} value={form.descripcion} onChange={e=>f("descripcion",e.target.value)} placeholder="¿Qué hay que hacer?"/></Field>
          <Field label="Encargado"><input className={inp} value={form.encargado} onChange={e=>f("encargado",e.target.value)} placeholder="Responsable"/></Field>
          <Field label="Estado"><select className={sel} value={form.estado} onChange={e=>f("estado",e.target.value)}><option value="por_hacer">Por hacer</option><option value="en_proceso">En proceso</option><option value="realizada">Realizada</option></select></Field>
          <Field label="Prioridad"><select className={sel} value={form.prioridad} onChange={e=>f("prioridad",e.target.value)}><option value="alta">Alta</option><option value="media">Media</option><option value="baja">Baja</option></select></Field>
          <Field label="Fecha límite"><input type="date" className={inp} value={form.fechaLimite} onChange={e=>f("fechaLimite",e.target.value)}/></Field>
        </div>
        <SaveCancel onCancel={()=>setModal(false)} onSave={save}/>
      </Modal>
      <ConfirmDelete open={!!del} onClose={()=>setDel(null)} onConfirm={remove} itemName="esta tarea"/>
    </div>
  );
}

// ═══════════════════════════════
// DESCANSOS COMPENSATORIOS
// ═══════════════════════════════
function DescansosPage({ data, up }) {
  const [search, setSearch] = useState("");
  const [modal, setModal] = useState(false);
  const [editing, setEditing] = useState(null);
  const [del, setDel] = useState(null);
  const empty = { agente:"", afiliado:"", fecha:"", observaciones:"" };
  const [form, setForm] = useState(empty);

  const list = useMemo(() => {
    const q = search.toLowerCase();
    return [...data.descansos].reverse().filter(d => d.agente.toLowerCase().includes(q)||d.afiliado.toLowerCase().includes(q));
  }, [data.descansos, search]);

  const openNew = () => { setForm({...empty,fecha:hoy()}); setEditing(null); setModal(true); };
  const openEdit = (d) => { setForm({...d}); setEditing(d.id); setModal(true); };
  const save = () => { if(!form.agente.trim()) return; const id = editing || uid(); up(p=> editing ? {...p,descansos:p.descansos.map(d=>d.id===editing?{...form,id}:d)} : {...p,descansos:[...p.descansos,{...form,id}]}); (editing ? sbUpdate("descansos", id, form) : sbInsert("descansos", id, form)); setModal(false); };
  const remove = () => { up(p=>({...p,descansos:p.descansos.filter(d=>d.id!==del)})); sbDelete("descansos", del); setDel(null); };
  const f = (k,v) => setForm(p=>({...p,[k]:v}));

  return (
    <div>
      <PageHeader title="Descansos Compensatorios" sub="Registro de días de descanso compensatorio"><BtnNew onClick={openNew} label="Nuevo registro"/></PageHeader>
      <div className="mb-4 max-w-sm"><SearchBar value={search} onChange={setSearch} placeholder="Buscar por agente o N° afiliado..."/></div>
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden"><div className="overflow-x-auto">
        <table className="w-full text-sm"><thead><tr className="border-b border-gray-100 bg-gray-50/50">
          <TH>Agente</TH><TH>N° Afiliado</TH><TH>Fecha descanso</TH><TH className="hidden sm:table-cell">Observaciones</TH><TH className="text-right">Acciones</TH>
        </tr></thead><tbody className="divide-y divide-gray-50">
          {list.length===0 ? <EmptyRow cols={5} text={search?"Sin resultados":"Sin descansos registrados"}/> : list.map(d => (
            <tr key={d.id} className="hover:bg-gray-50/50">
              <td className="px-4 py-3 font-medium text-gray-900">{d.agente}</td>
              <td className="px-4 py-3 text-gray-700">{d.afiliado}</td>
              <td className="px-4 py-3 text-gray-700">{fmtDate(d.fecha)}</td>
              <td className="px-4 py-3 text-gray-500 hidden sm:table-cell max-w-[200px] truncate">{d.observaciones||"—"}</td>
              <td className="px-4 py-3 text-right"><ActionBtns onEdit={()=>openEdit(d)} onDelete={()=>setDel(d.id)}/></td>
            </tr>
          ))}
        </tbody></table>
      </div></div>
      <Modal open={modal} onClose={()=>setModal(false)} title={editing?"Editar descanso":"Nuevo descanso compensatorio"}>
        <div className="grid grid-cols-2 gap-4">
          <Field label="Nombre del agente" span2><input className={inp} value={form.agente} onChange={e=>f("agente",e.target.value)} placeholder="Nombre completo"/></Field>
          <Field label="N° de afiliado"><input className={inp} value={form.afiliado} onChange={e=>f("afiliado",e.target.value)} placeholder="N° afiliado"/></Field>
          <Field label="Fecha del descanso"><input type="date" className={inp} value={form.fecha} onChange={e=>f("fecha",e.target.value)}/></Field>
          <Field label="Observaciones" span2><textarea className={inp+" resize-none"} rows={2} value={form.observaciones} onChange={e=>f("observaciones",e.target.value)} placeholder="Motivo, autorización, etc."/></Field>
        </div>
        <SaveCancel onCancel={()=>setModal(false)} onSave={save}/>
      </Modal>
      <ConfirmDelete open={!!del} onClose={()=>setDel(null)} onConfirm={remove} itemName="este registro"/>
    </div>
  );
}

// ═══════════════════════════════
// LICENCIAS (VACACIONES)
// ═══════════════════════════════
function LicenciasPage({ data, up }) {
  const [search, setSearch] = useState("");
  const [modal, setModal] = useState(false);
  const [editing, setEditing] = useState(null);
  const [del, setDel] = useState(null);
  const empty = { agente:"", afiliado:"", fechaDesde:"", fechaHasta:"", diasTotales:"", tipoLicencia:"vacaciones", observaciones:"" };
  const [form, setForm] = useState(empty);

  const list = useMemo(() => {
    const q = search.toLowerCase();
    return [...data.licencias].reverse().filter(l => l.agente.toLowerCase().includes(q)||l.afiliado.toLowerCase().includes(q));
  }, [data.licencias, search]);

  const tipos = { vacaciones:"Vacaciones", enfermedad:"Enfermedad", familiar:"Asuntos familiares", otro:"Otro" };

  const openNew = () => { setForm({...empty,fechaDesde:hoy()}); setEditing(null); setModal(true); };
  const openEdit = (l) => { setForm({...l}); setEditing(l.id); setModal(true); };
  const save = () => { if(!form.agente.trim()) return; const id = editing || uid(); up(p=> editing ? {...p,licencias:p.licencias.map(l=>l.id===editing?{...form,id}:l)} : {...p,licencias:[...p.licencias,{...form,id}]}); (editing ? sbUpdate("licencias", id, form) : sbInsert("licencias", id, form)); setModal(false); };
  const remove = () => { up(p=>({...p,licencias:p.licencias.filter(l=>l.id!==del)})); sbDelete("licencias", del); setDel(null); };
  const f = (k,v) => setForm(p=>({...p,[k]:v}));

  return (
    <div>
      <PageHeader title="Licencias" sub="Registro de días a cargo de licencia (vacaciones y otros)"><BtnNew onClick={openNew} label="Nueva licencia"/></PageHeader>
      <div className="mb-4 max-w-sm"><SearchBar value={search} onChange={setSearch} placeholder="Buscar por agente o N° afiliado..."/></div>
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden"><div className="overflow-x-auto">
        <table className="w-full text-sm"><thead><tr className="border-b border-gray-100 bg-gray-50/50">
          <TH>Agente</TH><TH>N° Afiliado</TH><TH className="hidden sm:table-cell">Tipo</TH><TH>Desde</TH><TH className="hidden md:table-cell">Hasta</TH><TH className="hidden lg:table-cell">Días</TH><TH className="text-right">Acciones</TH>
        </tr></thead><tbody className="divide-y divide-gray-50">
          {list.length===0 ? <EmptyRow cols={7} text={search?"Sin resultados":"Sin licencias registradas"}/> : list.map(l => (
            <tr key={l.id} className="hover:bg-gray-50/50">
              <td className="px-4 py-3 font-medium text-gray-900">{l.agente}</td>
              <td className="px-4 py-3 text-gray-700">{l.afiliado}</td>
              <td className="px-4 py-3 text-gray-600 hidden sm:table-cell"><Badge label={tipos[l.tipoLicencia]||l.tipoLicencia} color={l.tipoLicencia==="vacaciones"?"blue":l.tipoLicencia==="enfermedad"?"red":"gray"}/></td>
              <td className="px-4 py-3 text-gray-700">{fmtDate(l.fechaDesde)}</td>
              <td className="px-4 py-3 text-gray-500 hidden md:table-cell">{fmtDate(l.fechaHasta)}</td>
              <td className="px-4 py-3 text-gray-500 hidden lg:table-cell">{l.diasTotales||"—"}</td>
              <td className="px-4 py-3 text-right"><ActionBtns onEdit={()=>openEdit(l)} onDelete={()=>setDel(l.id)}/></td>
            </tr>
          ))}
        </tbody></table>
      </div></div>
      <Modal open={modal} onClose={()=>setModal(false)} title={editing?"Editar licencia":"Nueva licencia"}>
        <div className="grid grid-cols-2 gap-4">
          <Field label="Nombre del agente" span2><input className={inp} value={form.agente} onChange={e=>f("agente",e.target.value)} placeholder="Nombre completo"/></Field>
          <Field label="N° de afiliado"><input className={inp} value={form.afiliado} onChange={e=>f("afiliado",e.target.value)} placeholder="N° afiliado"/></Field>
          <Field label="Tipo de licencia"><select className={sel} value={form.tipoLicencia} onChange={e=>f("tipoLicencia",e.target.value)}>{Object.entries(tipos).map(([k,v])=><option key={k} value={k}>{v}</option>)}</select></Field>
          <Field label="Desde"><input type="date" className={inp} value={form.fechaDesde} onChange={e=>f("fechaDesde",e.target.value)}/></Field>
          <Field label="Hasta"><input type="date" className={inp} value={form.fechaHasta} onChange={e=>f("fechaHasta",e.target.value)}/></Field>
          <Field label="Días totales"><input type="number" min="1" className={inp} value={form.diasTotales} onChange={e=>f("diasTotales",e.target.value)} placeholder="Cantidad de días"/></Field>
          <Field label="Observaciones"><textarea className={inp+" resize-none"} rows={2} value={form.observaciones} onChange={e=>f("observaciones",e.target.value)} placeholder="Notas..."/></Field>
        </div>
        <SaveCancel onCancel={()=>setModal(false)} onSave={save}/>
      </Modal>
      <ConfirmDelete open={!!del} onClose={()=>setDel(null)} onConfirm={remove} itemName="esta licencia"/>
    </div>
  );
}

// ═══════════════════════════════
// RESOLUCIONES
// ═══════════════════════════════
function ResolucionesPage({ data, up }) {
  const [search, setSearch] = useState("");
  const [modal, setModal] = useState(false);
  const [editing, setEditing] = useState(null);
  const [del, setDel] = useState(null);
  const empty = { numero:"", asunto:"", fecha:"", observaciones:"" };
  const [form, setForm] = useState(empty);

  const list = useMemo(() => {
    const q = search.toLowerCase();
    return [...data.resoluciones].reverse().filter(r => r.numero.toLowerCase().includes(q)||r.asunto.toLowerCase().includes(q));
  }, [data.resoluciones, search]);

  const openNew = () => { setForm({...empty,fecha:hoy()}); setEditing(null); setModal(true); };
  const openEdit = (r) => { setForm({...r}); setEditing(r.id); setModal(true); };
  const save = () => { if(!form.numero.trim()) return; const id = editing || uid(); up(p=> editing ? {...p,resoluciones:p.resoluciones.map(r=>r.id===editing?{...form,id}:r)} : {...p,resoluciones:[...p.resoluciones,{...form,id}]}); (editing ? sbUpdate("resoluciones", id, form) : sbInsert("resoluciones", id, form)); setModal(false); };
  const remove = () => { up(p=>({...p,resoluciones:p.resoluciones.filter(r=>r.id!==del)})); sbDelete("resoluciones", del); setDel(null); };
  const f = (k,v) => setForm(p=>({...p,[k]:v}));

  return (
    <div>
      <PageHeader title="Resoluciones" sub="Registro de resoluciones"><BtnNew onClick={openNew} label="Nueva resolución"/></PageHeader>
      <div className="mb-4 max-w-sm"><SearchBar value={search} onChange={setSearch} placeholder="Buscar por número o asunto..."/></div>
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden"><div className="overflow-x-auto">
        <table className="w-full text-sm"><thead><tr className="border-b border-gray-100 bg-gray-50/50">
          <TH>N° Resolución</TH><TH>Asunto</TH><TH className="hidden sm:table-cell">Fecha</TH><TH className="hidden md:table-cell">Observaciones</TH><TH className="text-right">Acciones</TH>
        </tr></thead><tbody className="divide-y divide-gray-50">
          {list.length===0 ? <EmptyRow cols={5} text={search?"Sin resultados":"Sin resoluciones registradas"}/> : list.map(r => (
            <tr key={r.id} className="hover:bg-gray-50/50">
              <td className="px-4 py-3 font-medium text-gray-900">{r.numero}</td>
              <td className="px-4 py-3 text-gray-700">{r.asunto}</td>
              <td className="px-4 py-3 text-gray-500 hidden sm:table-cell">{fmtDate(r.fecha)}</td>
              <td className="px-4 py-3 text-gray-500 hidden md:table-cell max-w-[200px] truncate">{r.observaciones||"—"}</td>
              <td className="px-4 py-3 text-right"><ActionBtns onEdit={()=>openEdit(r)} onDelete={()=>setDel(r.id)}/></td>
            </tr>
          ))}
        </tbody></table>
      </div></div>
      <Modal open={modal} onClose={()=>setModal(false)} title={editing?"Editar resolución":"Nueva resolución"}>
        <div className="grid grid-cols-2 gap-4">
          <Field label="N° de Resolución"><input className={inp} value={form.numero} onChange={e=>f("numero",e.target.value)} placeholder="Ej: 0123/2026"/></Field>
          <Field label="Fecha"><input type="date" className={inp} value={form.fecha} onChange={e=>f("fecha",e.target.value)}/></Field>
          <Field label="Asunto" span2><textarea className={inp+" resize-none"} rows={2} value={form.asunto} onChange={e=>f("asunto",e.target.value)} placeholder="Asunto de la resolución"/></Field>
          <Field label="Observaciones" span2><textarea className={inp+" resize-none"} rows={2} value={form.observaciones} onChange={e=>f("observaciones",e.target.value)} placeholder="Notas adicionales..."/></Field>
        </div>
        <SaveCancel onCancel={()=>setModal(false)} onSave={save}/>
      </Modal>
      <ConfirmDelete open={!!del} onClose={()=>setDel(null)} onConfirm={remove} itemName="esta resolución"/>
    </div>
  );
}

// ═══════════════════════════════
// PROVEEDORES
// ═══════════════════════════════
function ProveedoresPage({ data, up, setPage }) {
  const [search, setSearch] = useState("");
  const [modal, setModal] = useState(false);
  const [editing, setEditing] = useState(null);
  const [del, setDel] = useState(null);
  const [detalle, setDetalle] = useState(null);
  const empty = { nombre:"", encargado:"", contacto:"", rubro:"", expedientes:"", observaciones:"" };
  const [form, setForm] = useState(empty);

  const list = useMemo(() => {
    const q = search.toLowerCase();
    return [...data.proveedores].reverse().filter(p => p.nombre.toLowerCase().includes(q)||p.rubro.toLowerCase().includes(q)||(p.encargado||"").toLowerCase().includes(q));
  }, [data.proveedores, search]);

  const openNew = () => { setForm(empty); setEditing(null); setModal(true); };
  const openEdit = (p) => { setForm({...p}); setEditing(p.id); setModal(true); };
  const save = () => { if(!form.nombre.trim()) return; const id = editing || uid(); up(p=> editing ? {...p,proveedores:p.proveedores.map(pr=>pr.id===editing?{...form,id}:pr)} : {...p,proveedores:[...p.proveedores,{...form,id}]}); (editing ? sbUpdate("proveedores", id, form) : sbInsert("proveedores", id, form)); setModal(false); };
  const remove = () => { up(p=>({...p,proveedores:p.proveedores.filter(pr=>pr.id!==del)})); sbDelete("proveedores", del); setDel(null); };
  const f = (k,v) => setForm(p=>({...p,[k]:v}));

  // Find compras linked to this proveedor
  const comprasDeProveedor = (nombre) => data.compras.filter(c => c.proveedor.toLowerCase() === nombre.toLowerCase());

  return (
    <div>
      <PageHeader title="Proveedores" sub="Registro de proveedores de la Dirección"><BtnNew onClick={openNew} label="Nuevo proveedor"/></PageHeader>
      <div className="mb-4 max-w-sm"><SearchBar value={search} onChange={setSearch} placeholder="Buscar por nombre, rubro o encargado..."/></div>

      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {list.length===0 && (
          <div className="col-span-full bg-white rounded-xl border border-gray-100 shadow-sm p-10 text-center">
            <p className="text-sm text-gray-400">{search?"Sin resultados":"Sin proveedores registrados"}</p>
          </div>
        )}
        {list.map(p => {
          const compras = comprasDeProveedor(p.nombre);
          return (
            <div key={p.id} className="bg-white rounded-xl border border-gray-100 shadow-sm p-5 group hover:border-emerald-200 transition-colors">
              <div className="flex items-start justify-between mb-3">
                <div>
                  <h4 className="font-bold text-gray-900 text-sm">{p.nombre}</h4>
                  {p.rubro && <Badge label={p.rubro} color="blue"/>}
                </div>
                <div className="flex gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                  <button onClick={()=>openEdit(p)} className="p-1 rounded hover:bg-gray-100 text-gray-400">{I.edit}</button>
                  <button onClick={()=>setDel(p.id)} className="p-1 rounded hover:bg-rose-50 text-gray-400 hover:text-rose-500">{I.trash}</button>
                </div>
              </div>
              {p.encargado && <p className="text-xs text-gray-600 mb-1"><span className="text-gray-400">Encargado:</span> {p.encargado}</p>}
              {p.contacto && <p className="text-xs text-gray-600 mb-1"><span className="text-gray-400">Contacto:</span> {p.contacto}</p>}
              {p.expedientes && <p className="text-xs text-gray-600 mb-1"><span className="text-gray-400">Expedientes:</span> {p.expedientes}</p>}

              {compras.length > 0 && (
                <div className="mt-3 pt-3 border-t border-gray-50">
                  <button onClick={()=>setDetalle(detalle===p.id?null:p.id)} className="flex items-center gap-1.5 text-xs font-medium text-emerald-600 hover:text-emerald-700">
                    {I.link} {compras.length} compra{compras.length>1?"s":""} vinculada{compras.length>1?"s":""}
                  </button>
                  {detalle===p.id && (
                    <div className="mt-2 space-y-1.5">
                      {compras.map(c => (
                        <div key={c.id} className="flex items-center justify-between bg-gray-50 rounded-lg px-3 py-2">
                          <span className="text-xs font-medium text-gray-700">{c.numeroExpediente}</span>
                          <div className="flex items-center gap-2">
                            <span className="text-xs text-gray-500">{fmtMoney(c.monto)}</span>
                            <Badge label={c.estado==="pendiente"?"Pend.":c.estado==="pagado"?"Pagado":"Ret."} color={c.estado==="pendiente"?"yellow":c.estado==="pagado"?"green":"blue"}/>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      <Modal open={modal} onClose={()=>setModal(false)} title={editing?"Editar proveedor":"Nuevo proveedor"} wide>
        <div className="grid grid-cols-2 gap-4">
          <Field label="Nombre de la firma" span2><input className={inp} value={form.nombre} onChange={e=>f("nombre",e.target.value)} placeholder="Razón social o nombre comercial"/></Field>
          <Field label="Encargado de la firma"><input className={inp} value={form.encargado} onChange={e=>f("encargado",e.target.value)} placeholder="Persona de contacto"/></Field>
          <Field label="N° de contacto"><input className={inp} value={form.contacto} onChange={e=>f("contacto",e.target.value)} placeholder="Teléfono, WhatsApp, email"/></Field>
          <Field label="Rubro"><input className={inp} value={form.rubro} onChange={e=>f("rubro",e.target.value)} placeholder="Ej: Herramientas, Ferretería, Vivero..."/></Field>
          <Field label="Expedientes que le pertenecen"><input className={inp} value={form.expedientes} onChange={e=>f("expedientes",e.target.value)} placeholder="Ej: 1234/2026, 5678/2026"/></Field>
          <Field label="Observaciones" span2><textarea className={inp+" resize-none"} rows={2} value={form.observaciones} onChange={e=>f("observaciones",e.target.value)} placeholder="Notas sobre el proveedor..."/></Field>
        </div>
        <SaveCancel onCancel={()=>setModal(false)} onSave={save}/>
      </Modal>
      <ConfirmDelete open={!!del} onClose={()=>setDel(null)} onConfirm={remove} itemName="este proveedor"/>
    </div>
  );
}

// ═══════════════════════════════
// ENTREGA DE MATERIALES
// ═══════════════════════════════
function EntregasPage({ data, up }) {
  const [search, setSearch] = useState("");
  const [filtroCat, setFiltroCat] = useState("todos");
  const [modal, setModal] = useState(false);
  const [editing, setEditing] = useState(null);
  const [del, setDel] = useState(null);
  const empty = { articulo:"", categoria:"herramientas", cantidad:1, entregadoPor:"", recibidoPor:"", fecha:hoy(), observaciones:"" };
  const [form, setForm] = useState(empty);

  const categorias = {
    herramientas: { l:"Herramientas", c:"blue" },
    libreria: { l:"Librería", c:"purple" },
    limpieza: { l:"Limpieza", c:"green" },
    epp: { l:"EPP", c:"orange" },
    otro: { l:"Otro", c:"gray" },
  };

  const list = useMemo(() => {
    const q = search.toLowerCase();
    return [...(data.entregas||[])].reverse().filter(e => {
      const matchSearch = e.articulo.toLowerCase().includes(q) || e.recibidoPor.toLowerCase().includes(q) || e.entregadoPor.toLowerCase().includes(q);
      const matchCat = filtroCat === "todos" || e.categoria === filtroCat;
      return matchSearch && matchCat;
    });
  }, [data.entregas, search, filtroCat]);

  const openNew = () => { setForm({...empty,fecha:hoy()}); setEditing(null); setModal(true); };
  const openEdit = (e) => { setForm({...e}); setEditing(e.id); setModal(true); };
  const save = () => {
    if(!form.articulo.trim()||!form.recibidoPor.trim()) return;
    const id = editing || uid();
    up(p => editing
      ? {...p, entregas:(p.entregas||[]).map(e=>e.id===editing?{...form,id}:e)}
      : {...p, entregas:[...(p.entregas||[]),{...form,id}]}
    );
    (editing ? sbUpdate("entregas", id, form) : sbInsert("entregas", id, form));
    setModal(false);
  };
  const remove = () => { up(p=>({...p, entregas:(p.entregas||[]).filter(e=>e.id!==del)})); sbDelete("entregas", del); setDel(null); };
  const f = (k,v) => setForm(p=>({...p,[k]:v}));

  // Stats
  const totalEntregas = (data.entregas||[]).length;
  const totalItems = (data.entregas||[]).reduce((s,e)=>s+(parseInt(e.cantidad)||0),0);
  const catCount = Object.entries(categorias).map(([k,v]) => ({ ...v, k, count:(data.entregas||[]).filter(e=>e.categoria===k).length }));

  return (
    <div>
      <PageHeader title="Entrega de Materiales" sub="Registro de elementos entregados a agentes">
        <BtnNew onClick={openNew} label="Nueva entrega"/>
      </PageHeader>

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
        <StatCard label="Total entregas" value={totalEntregas} sub={`${totalItems} unidades`} color="blue"/>
        {catCount.filter(c=>c.count>0).slice(0,3).map(c => (
          <StatCard key={c.k} label={c.l} value={c.count} sub="entregas" color={c.c}/>
        ))}
      </div>

      <div className="flex flex-col sm:flex-row gap-3 mb-4">
        <div className="max-w-sm flex-1"><SearchBar value={search} onChange={setSearch} placeholder="Buscar por artículo, entregó o recibió..."/></div>
        <div className="flex gap-1.5 flex-wrap">
          <button onClick={()=>setFiltroCat("todos")} className={`px-3 py-2 text-xs font-semibold rounded-lg transition-colors ${filtroCat==="todos"?"bg-emerald-100 text-emerald-700":"bg-gray-100 text-gray-500 hover:bg-gray-200"}`}>Todos</button>
          {Object.entries(categorias).map(([k,v])=>(
            <button key={k} onClick={()=>setFiltroCat(k)} className={`px-3 py-2 text-xs font-semibold rounded-lg transition-colors ${filtroCat===k?"bg-emerald-100 text-emerald-700":"bg-gray-100 text-gray-500 hover:bg-gray-200"}`}>{v.l}</button>
          ))}
        </div>
      </div>

      <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden"><div className="overflow-x-auto">
        <table className="w-full text-sm"><thead><tr className="border-b border-gray-100 bg-gray-50/50">
          <TH>Artículo</TH><TH>Categoría</TH><TH className="text-center">Cant.</TH><TH>Entregado por</TH><TH>Recibido por</TH><TH className="hidden sm:table-cell">Fecha</TH><TH className="text-right">Acciones</TH>
        </tr></thead><tbody className="divide-y divide-gray-50">
          {list.length===0 ? <EmptyRow cols={7} text={search||filtroCat!=="todos"?"Sin resultados":"Sin entregas registradas. Hacé clic en \"Nueva entrega\" para agregar una."}/> : list.map(e => (
            <tr key={e.id} className="hover:bg-gray-50/50">
              <td className="px-4 py-3 font-medium text-gray-900">{e.articulo}</td>
              <td className="px-4 py-3"><Badge label={categorias[e.categoria]?.l||e.categoria} color={categorias[e.categoria]?.c||"gray"}/></td>
              <td className="px-4 py-3 text-center font-semibold text-gray-900">{e.cantidad}</td>
              <td className="px-4 py-3 text-gray-700">{e.entregadoPor}</td>
              <td className="px-4 py-3 text-gray-700">{e.recibidoPor}</td>
              <td className="px-4 py-3 text-gray-500 hidden sm:table-cell">{fmtDate(e.fecha)}</td>
              <td className="px-4 py-3 text-right"><ActionBtns onEdit={()=>openEdit(e)} onDelete={()=>setDel(e.id)}/></td>
            </tr>
          ))}
        </tbody></table>
      </div></div>

      <Modal open={modal} onClose={()=>setModal(false)} title={editing?"Editar entrega":"Nueva entrega de material"}>
        <div className="grid grid-cols-2 gap-4">
          <Field label="Artículo / Material" span2><input className={inp} value={form.articulo} onChange={e=>f("articulo",e.target.value)} placeholder="Ej: Guantes de trabajo, Resma A4, Lavandina..."/></Field>
          <Field label="Categoría">
            <select className={sel} value={form.categoria} onChange={e=>f("categoria",e.target.value)}>
              {Object.entries(categorias).map(([k,v])=><option key={k} value={k}>{v.l}</option>)}
            </select>
          </Field>
          <Field label="Cantidad"><input type="number" min="1" className={inp} value={form.cantidad} onChange={e=>f("cantidad",e.target.value)}/></Field>
          <Field label="Entregado por"><input className={inp} value={form.entregadoPor} onChange={e=>f("entregadoPor",e.target.value)} placeholder="Quién entrega"/></Field>
          <Field label="Recibido por"><input className={inp} value={form.recibidoPor} onChange={e=>f("recibidoPor",e.target.value)} placeholder="Agente que recibe"/></Field>
          <Field label="Fecha de entrega" span2><input type="date" className={inp} value={form.fecha} onChange={e=>f("fecha",e.target.value)}/></Field>
          <Field label="Observaciones" span2><textarea className={inp+" resize-none"} rows={2} value={form.observaciones} onChange={e=>f("observaciones",e.target.value)} placeholder="Notas adicionales, talle, color, etc."/></Field>
        </div>
        <SaveCancel onCancel={()=>setModal(false)} onSave={save}/>
      </Modal>
      <ConfirmDelete open={!!del} onClose={()=>setDel(null)} onConfirm={remove} itemName="esta entrega"/>
    </div>
  );
}

// ═══════════════════════════════
// NOTAS
// ═══════════════════════════════
const notaDocHtml = (nota) => `
<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:w="urn:schemas-microsoft-com:office:word" xmlns="http://www.w3.org/TR/REC-html40">
<head><meta charset="utf-8">
<style>
@page { size: A4; margin: 2.5cm 2.5cm 3cm 2.5cm; }
body { font-family: 'Times New Roman', Times, serif; font-size: 12pt; color: #111; line-height: 1.7; }
.header { text-align: center; border-bottom: 2pt solid #222; padding-bottom: 12pt; margin-bottom: 24pt; }
.header h1 { font-size: 14pt; font-weight: bold; margin: 0 0 2pt 0; letter-spacing: 2pt; text-transform: uppercase; }
.header p { font-size: 10pt; color: #444; margin: 2pt 0; letter-spacing: 1pt; }
.lugar-fecha { text-align: right; margin-bottom: 18pt; font-size: 11pt; }
table.meta { border-collapse: collapse; margin-bottom: 18pt; width: 100%; }
table.meta td { padding: 3pt 6pt; font-size: 11pt; vertical-align: top; }
table.meta td.label { font-weight: bold; width: 130pt; }
hr.sep { border: none; border-top: 1pt solid #ccc; margin: 14pt 0; }
.cuerpo { text-align: justify; white-space: pre-wrap; font-size: 12pt; min-height: 300pt; }
.firma { margin-top: 80pt; text-align: center; }
.firma-linea { border-top: 1pt solid #333; display: inline-block; width: 200pt; padding-top: 6pt; font-size: 10pt; }
</style></head><body>
<div class="header">
<h1>Municipalidad de San Miguel de Tucumán</h1>
<p>Dirección de Arbolado</p>
</div>
<p class="lugar-fecha">San Miguel de Tucumán, ${fmtDate(nota.fecha)}</p>
<table class="meta">
${nota.numeroNota ? `<tr><td class="label">NOTA N°:</td><td>${nota.numeroNota}</td></tr>` : ''}
<tr><td class="label">A:</td><td><b>${nota.destinatario}</b>${nota.cargoDestinatario ? '<br/>'+nota.cargoDestinatario : ''}</td></tr>
<tr><td class="label">DE:</td><td>${nota.remitente || 'Dirección de Arbolado'}</td></tr>
<tr><td class="label">ASUNTO:</td><td><b>${nota.asunto}</b></td></tr>
${nota.expedienteRef ? `<tr><td class="label">REF. EXPTE.:</td><td>${nota.expedienteRef}</td></tr>` : ''}
</table>
<hr class="sep"/>
<div class="cuerpo">${(nota.cuerpo||'').replace(/\n/g,'<br/>')}</div>
<div class="firma">
<div class="firma-linea">Firma y sello</div>
</div>
</body></html>`;

function NotasPage({ data, up }) {
  const [search, setSearch] = useState("");
  const [filtroTipo, setFiltroTipo] = useState("todos");
  const [modal, setModal] = useState(false);
  const [editing, setEditing] = useState(null);
  const [del, setDel] = useState(null);

  const tipos = {
    inicio_expediente: { l:"Inicio de expediente", c:"blue" },
    informe: { l:"Informe", c:"purple" },
    respuesta: { l:"Respuesta", c:"green" },
    solicitud: { l:"Solicitud", c:"yellow" },
    comunicacion: { l:"Comunicación interna", c:"orange" },
    otro: { l:"Otro", c:"gray" },
  };

  const empty = { numeroNota:"", tipo:"inicio_expediente", destinatario:"", cargoDestinatario:"", fecha:hoy(), asunto:"", expedienteRef:"", cuerpo:"", remitente:"Dirección de Arbolado", observaciones:"" };
  const [form, setForm] = useState(empty);

  const list = useMemo(() => {
    const q = search.toLowerCase();
    return [...(data.notas||[])].reverse().filter(n => {
      const matchSearch = n.destinatario.toLowerCase().includes(q) || n.asunto.toLowerCase().includes(q) || (n.numeroNota||"").toLowerCase().includes(q);
      const matchTipo = filtroTipo === "todos" || n.tipo === filtroTipo;
      return matchSearch && matchTipo;
    });
  }, [data.notas, search, filtroTipo]);

  const openNew = () => { setForm({...empty, fecha:hoy()}); setEditing(null); setModal(true); };
  const openEdit = (n) => { setForm({...n}); setEditing(n.id); setModal(true); };
  const save = () => {
    if(!form.destinatario.trim()||!form.asunto.trim()) return;
    const id = editing || uid();
    up(p => editing
      ? {...p, notas:(p.notas||[]).map(n=>n.id===editing?{...form,id}:n)}
      : {...p, notas:[...(p.notas||[]),{...form,id}]}
    );
    (editing ? sbUpdate("notas", id, form) : sbInsert("notas", id, form));
    setModal(false);
  };
  const remove = () => { up(p=>({...p, notas:(p.notas||[]).filter(n=>n.id!==del)})); sbDelete("notas", del); setDel(null); };
  const f = (k,v) => setForm(p=>({...p,[k]:v}));

  const downloadWord = (nota) => {
    const html = notaDocHtml(nota);
    const blob = new Blob(['\ufeff'+html], { type:'application/msword' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    const filename = `Nota${nota.numeroNota ? '_'+nota.numeroNota.replace(/\//g,'-') : ''}_${nota.asunto.slice(0,30).replace(/[^a-zA-Z0-9áéíóúñÁÉÍÓÚÑ ]/g,'').replace(/ /g,'_')}.doc`;
    a.href = url; a.download = filename; document.body.appendChild(a); a.click();
    document.body.removeChild(a); URL.revokeObjectURL(url);
  };

  const handlePrint = (nota) => {
    const w = window.open('','_blank','width=800,height=600');
    if(!w) return;
    const html = notaDocHtml(nota);
    w.document.write(`<!DOCTYPE html><html><head><title>Nota - ${nota.asunto}</title>
<style>@media print { .no-print { display: none !important; } } .btn-bar { display:flex; gap:10px; justify-content:center; margin:20px auto; } .btn { padding:10px 24px; border:none; border-radius:8px; font-size:14px; cursor:pointer; font-weight:600; } .btn-print { background:#16a34a; color:white; } .btn-print:hover { background:#15803d; }</style>
</head><body>
<div class="btn-bar no-print"><button class="btn btn-print" onclick="window.print()">Imprimir</button></div>
${html.replace(/<html[^>]*>|<\/html>|<head>[\s\S]*?<\/head>/gi,'')}
</body></html>`);
    w.document.close();
  };

  const downloadIcon = <svg width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>;

  return (
    <div>
      <PageHeader title="Notas" sub="Generación de notas e informes oficiales">
        <BtnNew onClick={openNew} label="Nueva nota"/>
      </PageHeader>

      <div className="flex flex-col sm:flex-row gap-3 mb-4">
        <div className="max-w-sm flex-1"><SearchBar value={search} onChange={setSearch} placeholder="Buscar por destinatario, asunto o N° nota..."/></div>
        <div className="flex gap-1.5 flex-wrap">
          <button onClick={()=>setFiltroTipo("todos")} className={`px-3 py-2 text-xs font-semibold rounded-lg transition-colors ${filtroTipo==="todos"?"bg-emerald-100 text-emerald-700":"bg-gray-100 text-gray-500 hover:bg-gray-200"}`}>Todas</button>
          {Object.entries(tipos).map(([k,v])=>(
            <button key={k} onClick={()=>setFiltroTipo(k)} className={`px-3 py-2 text-xs font-semibold rounded-lg transition-colors ${filtroTipo===k?"bg-emerald-100 text-emerald-700":"bg-gray-100 text-gray-500 hover:bg-gray-200"}`}>{v.l}</button>
          ))}
        </div>
      </div>

      <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden"><div className="overflow-x-auto">
        <table className="w-full text-sm"><thead><tr className="border-b border-gray-100 bg-gray-50/50">
          <TH>N° Nota</TH><TH>Tipo</TH><TH>Destinatario</TH><TH>Asunto</TH><TH className="hidden sm:table-cell">Fecha</TH><TH className="hidden md:table-cell">Ref. Exp.</TH><TH className="text-right">Acciones</TH>
        </tr></thead><tbody className="divide-y divide-gray-50">
          {list.length===0 ? <EmptyRow cols={7} text={search||filtroTipo!=="todos"?"Sin resultados":"Sin notas registradas. Hacé clic en \"Nueva nota\" para crear una."}/> : list.map(n => (
            <tr key={n.id} className="hover:bg-gray-50/50">
              <td className="px-4 py-3 font-medium text-gray-900">{n.numeroNota||"—"}</td>
              <td className="px-4 py-3"><Badge label={tipos[n.tipo]?.l||n.tipo} color={tipos[n.tipo]?.c||"gray"}/></td>
              <td className="px-4 py-3 text-gray-700">{n.destinatario}</td>
              <td className="px-4 py-3 text-gray-600 max-w-[200px] truncate">{n.asunto}</td>
              <td className="px-4 py-3 text-gray-500 hidden sm:table-cell">{fmtDate(n.fecha)}</td>
              <td className="px-4 py-3 text-gray-500 hidden md:table-cell">{n.expedienteRef||"—"}</td>
              <td className="px-4 py-3 text-right">
                <div className="flex items-center justify-end gap-0.5">
                  <button onClick={()=>downloadWord(n)} className="p-1.5 rounded-lg hover:bg-blue-50 text-gray-400 hover:text-blue-600 transition-colors" title="Descargar Word">{downloadIcon}</button>
                  <button onClick={()=>handlePrint(n)} className="p-1.5 rounded-lg hover:bg-emerald-50 text-gray-400 hover:text-emerald-600 transition-colors" title="Imprimir">{I.print}</button>
                  <button onClick={()=>openEdit(n)} className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400 hover:text-gray-600 transition-colors" title="Editar">{I.edit}</button>
                  <button onClick={()=>setDel(n.id)} className="p-1.5 rounded-lg hover:bg-rose-50 text-gray-400 hover:text-rose-500 transition-colors" title="Eliminar">{I.trash}</button>
                </div>
              </td>
            </tr>
          ))}
        </tbody></table>
      </div></div>

      <Modal open={modal} onClose={()=>setModal(false)} title={editing?"Editar nota":"Nueva nota"} wide>
        <div className="grid grid-cols-2 gap-4">
          <Field label="N° de Nota"><input className={inp} value={form.numeroNota} onChange={e=>f("numeroNota",e.target.value)} placeholder="Ej: 001/2026 (opcional)"/></Field>
          <Field label="Tipo de nota">
            <select className={sel} value={form.tipo} onChange={e=>f("tipo",e.target.value)}>
              {Object.entries(tipos).map(([k,v])=><option key={k} value={k}>{v.l}</option>)}
            </select>
          </Field>
          <Field label="Dirigida a (destinatario)" span2><input className={inp} value={form.destinatario} onChange={e=>f("destinatario",e.target.value)} placeholder="Nombre del destinatario"/></Field>
          <Field label="Cargo del destinatario" span2><input className={inp} value={form.cargoDestinatario} onChange={e=>f("cargoDestinatario",e.target.value)} placeholder="Ej: Director de Espacios Verdes, Secretario de Servicios Públicos..."/></Field>
          <Field label="Fecha"><input type="date" className={inp} value={form.fecha} onChange={e=>f("fecha",e.target.value)}/></Field>
          <Field label="Expediente de referencia"><input className={inp} value={form.expedienteRef} onChange={e=>f("expedienteRef",e.target.value)} placeholder="N° de expediente (si aplica)"/></Field>
          <Field label="Asunto" span2><input className={inp} value={form.asunto} onChange={e=>f("asunto",e.target.value)} placeholder="Asunto de la nota"/></Field>
          <Field label="Remitente" span2><input className={inp} value={form.remitente} onChange={e=>f("remitente",e.target.value)} placeholder="Dirección de Arbolado"/></Field>
          <Field label="Cuerpo de la nota" span2><textarea className={inp+" resize-none"} rows={8} value={form.cuerpo} onChange={e=>f("cuerpo",e.target.value)} placeholder="Redactar el contenido de la nota..."/></Field>
          <Field label="Observaciones internas" span2><textarea className={inp+" resize-none"} rows={2} value={form.observaciones} onChange={e=>f("observaciones",e.target.value)} placeholder="Notas internas (no se imprimen ni descargan)"/></Field>
        </div>
        <div className="flex justify-between mt-6">
          <div className="flex gap-2">
            <button onClick={()=>{ if(form.destinatario&&form.asunto) downloadWord(form); }} className="flex items-center gap-2 px-4 py-2.5 text-sm font-medium text-blue-700 bg-blue-50 rounded-xl hover:bg-blue-100 transition-colors">
              {downloadIcon} Word
            </button>
            <button onClick={()=>{ if(form.destinatario&&form.asunto) handlePrint(form); }} className="flex items-center gap-2 px-4 py-2.5 text-sm font-medium text-emerald-700 bg-emerald-50 rounded-xl hover:bg-emerald-100 transition-colors">
              {I.print} Imprimir
            </button>
          </div>
          <div className="flex gap-3">
            <button onClick={()=>setModal(false)} className="px-4 py-2.5 text-sm font-medium text-gray-600 bg-gray-100 rounded-xl hover:bg-gray-200 transition-colors">Cancelar</button>
            <button onClick={save} className="px-5 py-2.5 text-sm font-semibold text-white bg-emerald-600 rounded-xl hover:bg-emerald-700 transition-colors">Guardar</button>
          </div>
        </div>
      </Modal>
      <ConfirmDelete open={!!del} onClose={()=>setDel(null)} onConfirm={remove} itemName="esta nota"/>
    </div>
  );
}

// ═══════════════════════════════
// PATRIMONIO VEGETAL
// ═══════════════════════════════
function PatrimonioVegetal({ data, up }) {
  const [search, setSearch] = useState("");
  const [filtroEstado, setFiltroEstado] = useState("todos");
  const [modal, setModal] = useState(false);
  const [editing, setEditing] = useState(null);
  const [del, setDel] = useState(null);
  const empty = { numero:"", causante:"", asunto:"Patrimonio Vegetal", domicilio:"", fechaIngreso:hoy(), recibidoPor:"", area:"", estado:"para_inspeccion", observaciones:"" };
  const [form, setForm] = useState(empty);

  // Vinculados automáticamente: expedientes cuyo asunto es "Patrimonio Vegetal" (misma fuente de datos, sin duplicar)
  const vinculados = useMemo(() =>
    data.expedientes.filter(e => esAsuntoPatrimonioVegetal(e.asunto)).map(e => ({ ...e, source:"expediente" })),
  [data.expedientes]);
  // Registros anteriores creados directamente en este módulo, antes de la integración
  const legacy = useMemo(() => (data.patrimonioVegetal||[]).map(p => ({ ...p, source:"legacy" })), [data.patrimonioVegetal]);

  const combined = useMemo(() => {
    const vistos = new Set();
    const resultado = [];
    // Prioridad: primero los vinculados a Expedientes (fuente única de verdad)
    for (const e of vinculados) {
      const key = (e.numero||"").trim().toLowerCase();
      if (!vistos.has(key)) { vistos.add(key); resultado.push(e); }
    }
    // Los "legacy" solo se muestran si su número NO coincide con un expediente ya vinculado (evita duplicados)
    for (const e of legacy) {
      const key = (e.numero||"").trim().toLowerCase();
      if (!vistos.has(key)) { vistos.add(key); resultado.push(e); }
    }
    return resultado.reverse();
  }, [vinculados, legacy]);

  const list = useMemo(() => {
    const q = search.toLowerCase();
    return combined.filter(e => {
      const matchSearch = e.numero.toLowerCase().includes(q) || e.causante.toLowerCase().includes(q) || (e.domicilio||"").toLowerCase().includes(q);
      const matchEstado = filtroEstado === "todos" || (e.estado||"para_inspeccion") === filtroEstado;
      return matchSearch && matchEstado;
    });
  }, [combined, search, filtroEstado]);

  const openNew = () => { setForm(empty); setEditing(null); setModal(true); };
  const openEdit = (e) => { setForm({estado:"para_inspeccion", domicilio:"", ...e}); setEditing(e); setModal(true); };

  const save = () => {
    if(!form.numero.trim()) return;
    if (editing) {
      const id = editing.id;
      if (editing.source === "expediente") {
        const item = {...form, asunto: form.asunto || "Patrimonio Vegetal"};
        up(p => ({...p, expedientes:p.expedientes.map(e=>e.id===id?{...item,id}:e)}));
        sbUpdate("expedientes", id, item);
      } else {
        up(p => ({...p, patrimonioVegetal:(p.patrimonioVegetal||[]).map(e=>e.id===id?{...form,id}:e)}));
        sbUpdate("patrimonio_vegetal", id, form);
      }
    } else {
      // Nuevo registro: se crea directamente como Expediente con Asunto "Patrimonio Vegetal" para quedar vinculado automáticamente
      const id = uid();
      const item = {...form, asunto: "Patrimonio Vegetal"};
      up(p => ({...p, expedientes:[...p.expedientes,{...item,id}]}));
      sbInsert("expedientes", id, item);
    }
    setModal(false);
  };

  const remove = () => {
    if (del.source === "expediente") {
      up(p=>({...p, expedientes:p.expedientes.filter(e=>e.id!==del.id)}));
      sbDelete("expedientes", del.id);
    } else {
      up(p=>({...p, patrimonioVegetal:(p.patrimonioVegetal||[]).filter(e=>e.id!==del.id)}));
      sbDelete("patrimonio_vegetal", del.id);
    }
    setDel(null);
  };
  const f = (k,v) => setForm(p=>({...p,[k]:v}));

  return (
    <div>
      <div className="flex items-center gap-2.5 mb-1">
        <span className="w-8 h-8 rounded-lg bg-emerald-100 text-emerald-700 flex items-center justify-center">{I.patrimonio}</span>
        <h2 className="text-2xl font-bold text-gray-900">Patrimonio Vegetal</h2>
      </div>
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
        <p className="text-sm text-gray-500">Vinculado automáticamente con Expedientes cuyo Asunto sea "Patrimonio Vegetal"</p>
        <div className="flex-shrink-0"><BtnNew onClick={openNew} label="Nuevo expediente"/></div>
      </div>
      <div className="flex flex-col sm:flex-row gap-3 mb-4">
        <div className="max-w-sm flex-1"><SearchBar value={search} onChange={setSearch} placeholder="Buscar por número, causante o domicilio..."/></div>
        <div className="flex gap-1.5 flex-wrap">
          <button onClick={()=>setFiltroEstado("todos")} className={`px-3 py-2 text-xs font-semibold rounded-lg transition-colors ${filtroEstado==="todos"?"bg-emerald-100 text-emerald-700":"bg-gray-100 text-gray-500 hover:bg-gray-200"}`}>Todos</button>
          {Object.entries(PV_ESTADOS).map(([k,v])=>(
            <button key={k} onClick={()=>setFiltroEstado(k)} className={`px-3 py-2 text-xs font-semibold rounded-lg transition-colors ${filtroEstado===k?"bg-emerald-100 text-emerald-700":"bg-gray-100 text-gray-500 hover:bg-gray-200"}`}>{v.l}</button>
          ))}
        </div>
      </div>
      <div className="bg-white rounded-xl border-2 border-emerald-100 shadow-sm overflow-hidden"><div className="overflow-x-auto">
        <table className="w-full text-sm"><thead><tr className="border-b border-emerald-100 bg-emerald-50/50">
          <TH>N° Expediente</TH><TH>Causante</TH><TH className="hidden sm:table-cell">Domicilio</TH><TH className="hidden md:table-cell">Fecha</TH><TH className="hidden lg:table-cell">Recibido por</TH><TH className="text-center">Estado</TH><TH className="text-right">Acciones</TH>
        </tr></thead><tbody className="divide-y divide-gray-50">
          {list.length===0 ? <EmptyRow cols={7} text={search||filtroEstado!=="todos"?"Sin resultados":"Sin expedientes de Patrimonio Vegetal registrados"}/> : list.map(e => (
            <tr key={e.id} className="hover:bg-emerald-50/30 border-l-4 border-l-emerald-400">
              <td className="px-4 py-3 font-medium text-gray-900">{e.numero}</td>
              <td className="px-4 py-3 text-gray-700">{e.causante}</td>
              <td className="px-4 py-3 text-gray-600 hidden sm:table-cell max-w-[200px] truncate">{e.domicilio||"—"}</td>
              <td className="px-4 py-3 text-gray-500 hidden md:table-cell">{fmtDate(e.fechaIngreso)}</td>
              <td className="px-4 py-3 text-gray-500 hidden lg:table-cell">{e.recibidoPor||"—"}</td>
              <td className="px-4 py-3 text-center"><Badge label={PV_ESTADOS[e.estado]?.l||"Para inspección"} color={PV_ESTADOS[e.estado]?.c||"blue"}/></td>
              <td className="px-4 py-3 text-right"><ActionBtns onEdit={()=>openEdit(e)} onDelete={()=>setDel(e)}/></td>
            </tr>
          ))}
        </tbody></table>
      </div></div>
      <p className="text-xs text-gray-400 mt-3 flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-emerald-400 inline-block"/> Cada fila es el mismo registro que en Expedientes — se edita o elimina desde cualquiera de los dos módulos y el cambio se refleja en ambos.</p>
      <Modal open={modal} onClose={()=>setModal(false)} title={editing?"Editar expediente":"Nuevo expediente de Patrimonio Vegetal"}>
        <div className="grid grid-cols-2 gap-4">
          <Field label="N° Expediente"><input className={inp} value={form.numero} onChange={e=>f("numero",e.target.value)} placeholder="Ej: 1234/2026"/></Field>
          <Field label="Fecha de ingreso"><input type="date" className={inp} value={form.fechaIngreso} onChange={e=>f("fechaIngreso",e.target.value)}/></Field>
          <Field label="Causante" span2><input className={inp} value={form.causante} onChange={e=>f("causante",e.target.value)} placeholder="Nombre del causante"/></Field>
          <Field label="Domicilio" span2><input className={inp} value={form.domicilio} onChange={e=>f("domicilio",e.target.value)} placeholder="Domicilio del inmueble o solicitante"/></Field>
          <Field label="Recibido por"><input className={inp} value={form.recibidoPor} onChange={e=>f("recibidoPor",e.target.value)} placeholder="Quién lo recibió"/></Field>
          <Field label="Área / Destino"><input className={inp} value={form.area} onChange={e=>f("area",e.target.value)} placeholder="Área de destino"/></Field>
          <Field label="Estado del trámite" span2>
            <select className={sel} value={form.estado} onChange={e=>f("estado",e.target.value)}>
              {Object.entries(PV_ESTADOS).map(([k,v])=><option key={k} value={k}>{v.l}</option>)}
            </select>
          </Field>
          <Field label="Observaciones" span2><textarea className={inp+" resize-none"} rows={2} value={form.observaciones} onChange={e=>f("observaciones",e.target.value)} placeholder="Notas..."/></Field>
        </div>
        <SaveCancel onCancel={()=>setModal(false)} onSave={save}/>
      </Modal>
      <ConfirmDelete open={!!del} onClose={()=>setDel(null)} onConfirm={remove} itemName="este expediente"/>
    </div>
  );
}

// ═══════════════════════════════
// PERSONAL
// ═══════════════════════════════
function PersonalPage({ data, up }) {
  const [search, setSearch] = useState("");
  const [modal, setModal] = useState(false);
  const [editing, setEditing] = useState(null);
  const [del, setDel] = useState(null);
  const [verFicha, setVerFicha] = useState(null);
  const empty = {
    nombre:"", afiliado:"", fechaNacimiento:"", dni:"", telefono:"", domicilio:"", funcion:"",
    talleCamisa:"", tallePantalon:"", talleCalzado:"", talleLluvia:"", talleFaja:"", observaciones:""
  };
  const [form, setForm] = useState(empty);

  const list = useMemo(() => {
    const q = search.toLowerCase();
    return [...(data.personal||[])].reverse().filter(p =>
      p.nombre.toLowerCase().includes(q) || (p.dni||"").toLowerCase().includes(q) || (p.afiliado||"").toLowerCase().includes(q) || (p.funcion||"").toLowerCase().includes(q)
    );
  }, [data.personal, search]);

  const openNew = () => { setForm(empty); setEditing(null); setModal(true); };
  const openEdit = (p) => { setForm({...p}); setEditing(p.id); setModal(true); };
  const save = () => {
    if(!form.nombre.trim()) return;
    const id = editing || uid();
    up(prev => editing
      ? {...prev, personal:(prev.personal||[]).map(p=>p.id===editing?{...form,id}:p)}
      : {...prev, personal:[...(prev.personal||[]),{...form,id}]}
    );
    (editing ? sbUpdate("personal", id, form) : sbInsert("personal", id, form));
    setModal(false);
  };
  const remove = () => { up(prev=>({...prev, personal:(prev.personal||[]).filter(p=>p.id!==del)})); sbDelete("personal", del); setDel(null); };
  const f = (k,v) => setForm(p=>({...p,[k]:v}));

  return (
    <div>
      <PageHeader title="Personal" sub="Legajo y datos del personal de la Dirección"><BtnNew onClick={openNew} label="Nuevo agente"/></PageHeader>
      <div className="mb-4 max-w-sm"><SearchBar value={search} onChange={setSearch} placeholder="Buscar por nombre, DNI, afiliado o función..."/></div>

      <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden"><div className="overflow-x-auto">
        <table className="w-full text-sm"><thead><tr className="border-b border-gray-100 bg-gray-50/50">
          <TH>Nombre y Apellido</TH><TH>DNI</TH><TH className="hidden sm:table-cell">N° Afiliado</TH><TH className="hidden md:table-cell">Función</TH><TH className="hidden lg:table-cell">Teléfono</TH><TH className="text-right">Acciones</TH>
        </tr></thead><tbody className="divide-y divide-gray-50">
          {list.length===0 ? <EmptyRow cols={6} text={search?"Sin resultados":"Sin personal registrado. Hacé clic en \"Nuevo agente\" para agregar uno."}/> : list.map(p => (
            <tr key={p.id} className="hover:bg-gray-50/50 cursor-pointer" onClick={()=>setVerFicha(p)}>
              <td className="px-4 py-3 font-medium text-gray-900">{p.nombre}</td>
              <td className="px-4 py-3 text-gray-700">{p.dni||"—"}</td>
              <td className="px-4 py-3 text-gray-700 hidden sm:table-cell">{p.afiliado||"—"}</td>
              <td className="px-4 py-3 text-gray-600 hidden md:table-cell">{p.funcion||"—"}</td>
              <td className="px-4 py-3 text-gray-500 hidden lg:table-cell">{p.telefono||"—"}</td>
              <td className="px-4 py-3 text-right" onClick={e=>e.stopPropagation()}><ActionBtns onEdit={()=>openEdit(p)} onDelete={()=>setDel(p.id)}/></td>
            </tr>
          ))}
        </tbody></table>
      </div></div>

      {/* Ficha de detalle (talles y datos completos) */}
      <Modal open={!!verFicha} onClose={()=>setVerFicha(null)} title={verFicha?.nombre || "Ficha del agente"} wide>
        {verFicha && (
          <div>
            <div className="grid grid-cols-2 gap-x-6 gap-y-3 mb-6">
              <div><p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider">DNI</p><p className="text-sm text-gray-900">{verFicha.dni||"—"}</p></div>
              <div><p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider">N° Afiliado</p><p className="text-sm text-gray-900">{verFicha.afiliado||"—"}</p></div>
              <div><p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider">Fecha de nacimiento</p><p className="text-sm text-gray-900">{fmtDate(verFicha.fechaNacimiento)}</p></div>
              <div><p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider">Función</p><p className="text-sm text-gray-900">{verFicha.funcion||"—"}</p></div>
              <div><p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider">Teléfono</p><p className="text-sm text-gray-900">{verFicha.telefono||"—"}</p></div>
              <div className="col-span-2"><p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider">Domicilio</p><p className="text-sm text-gray-900">{verFicha.domicilio||"—"}</p></div>
            </div>
            <p className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-2 pb-1 border-b border-gray-100">Talles</p>
            <div className="grid grid-cols-3 sm:grid-cols-5 gap-3 mb-4">
              <div className="bg-gray-50 rounded-xl p-3 text-center"><p className="text-[10px] font-semibold text-gray-400 uppercase mb-1">Camisa</p><p className="text-sm font-bold text-gray-900">{verFicha.talleCamisa||"—"}</p></div>
              <div className="bg-gray-50 rounded-xl p-3 text-center"><p className="text-[10px] font-semibold text-gray-400 uppercase mb-1">Pantalón</p><p className="text-sm font-bold text-gray-900">{verFicha.tallePantalon||"—"}</p></div>
              <div className="bg-gray-50 rounded-xl p-3 text-center"><p className="text-[10px] font-semibold text-gray-400 uppercase mb-1">Calzado</p><p className="text-sm font-bold text-gray-900">{verFicha.talleCalzado||"—"}</p></div>
              <div className="bg-gray-50 rounded-xl p-3 text-center"><p className="text-[10px] font-semibold text-gray-400 uppercase mb-1">Eq. lluvia</p><p className="text-sm font-bold text-gray-900">{verFicha.talleLluvia||"—"}</p></div>
              <div className="bg-gray-50 rounded-xl p-3 text-center"><p className="text-[10px] font-semibold text-gray-400 uppercase mb-1">Faja lumbar</p><p className="text-sm font-bold text-gray-900">{verFicha.talleFaja||"—"}</p></div>
            </div>
            {verFicha.observaciones && (<div><p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider mb-1">Observaciones</p><p className="text-sm text-gray-700">{verFicha.observaciones}</p></div>)}
            <div className="flex justify-end gap-3 mt-6">
              <button onClick={()=>{ openEdit(verFicha); setVerFicha(null); }} className="px-4 py-2.5 text-sm font-medium text-gray-700 bg-gray-100 rounded-xl hover:bg-gray-200 transition-colors">Editar</button>
              <button onClick={()=>setVerFicha(null)} className="px-5 py-2.5 text-sm font-semibold text-white bg-emerald-600 rounded-xl hover:bg-emerald-700 transition-colors">Cerrar</button>
            </div>
          </div>
        )}
      </Modal>

      {/* Formulario alta / edición */}
      <Modal open={modal} onClose={()=>setModal(false)} title={editing?"Editar agente":"Nuevo agente"} wide>
        <div className="grid grid-cols-2 gap-4">
          <Field label="Nombre y Apellido" span2><input className={inp} value={form.nombre} onChange={e=>f("nombre",e.target.value)} placeholder="Nombre completo"/></Field>
          <Field label="N° de Afiliado"><input className={inp} value={form.afiliado} onChange={e=>f("afiliado",e.target.value)} placeholder="N° afiliado"/></Field>
          <Field label="DNI"><input className={inp} value={form.dni} onChange={e=>f("dni",e.target.value)} placeholder="DNI"/></Field>
          <Field label="Fecha de nacimiento"><input type="date" className={inp} value={form.fechaNacimiento} onChange={e=>f("fechaNacimiento",e.target.value)}/></Field>
          <Field label="Teléfono"><input className={inp} value={form.telefono} onChange={e=>f("telefono",e.target.value)} placeholder="N° de teléfono"/></Field>
          <Field label="Domicilio" span2><input className={inp} value={form.domicilio} onChange={e=>f("domicilio",e.target.value)} placeholder="Domicilio del agente"/></Field>
          <Field label="Función" span2><input className={inp} value={form.funcion} onChange={e=>f("funcion",e.target.value)} placeholder="Ej: Podador, Chofer, Administrativo..."/></Field>

          <div className="col-span-2 pt-2 pb-1"><p className="text-xs font-bold text-gray-400 uppercase tracking-wider border-b border-gray-100 pb-1.5">Talles de indumentaria</p></div>
          <Field label="Talle de camisa"><input className={inp} value={form.talleCamisa} onChange={e=>f("talleCamisa",e.target.value)} placeholder="Ej: M, 42..."/></Field>
          <Field label="Talle de pantalón"><input className={inp} value={form.tallePantalon} onChange={e=>f("tallePantalon",e.target.value)} placeholder="Ej: 44..."/></Field>
          <Field label="Talle de calzado"><input className={inp} value={form.talleCalzado} onChange={e=>f("talleCalzado",e.target.value)} placeholder="Ej: 42..."/></Field>
          <Field label="Talle equipo de lluvia"><input className={inp} value={form.talleLluvia} onChange={e=>f("talleLluvia",e.target.value)} placeholder="Ej: L..."/></Field>
          <Field label="Talle faja lumbar"><input className={inp} value={form.talleFaja} onChange={e=>f("talleFaja",e.target.value)} placeholder="Ej: M..."/></Field>

          <Field label="Observaciones" span2><textarea className={inp+" resize-none"} rows={2} value={form.observaciones} onChange={e=>f("observaciones",e.target.value)} placeholder="Notas adicionales..."/></Field>
        </div>
        <SaveCancel onCancel={()=>setModal(false)} onSave={save}/>
      </Modal>
      <ConfirmDelete open={!!del} onClose={()=>setDel(null)} onConfirm={remove} itemName="este agente"/>
    </div>
  );
}

// ═══════════════════════════════
// GESTIÓN DEL ARBOLADO (Podas / Extracciones / Plantaciones / Tocones)
// ═══════════════════════════════
function GestionArboladoPage({ data, up, tipo, tipoLabel }) {
  const [search, setSearch] = useState("");
  const [filtroEstado, setFiltroEstado] = useState("todos");
  const [modal, setModal] = useState(false);
  const [editing, setEditing] = useState(null);
  const [del, setDel] = useState(null);

  const responsables = {
    direccion_arbolado: { l:"Dirección de Arbolado", c:"green" },
    eco_poda: { l:"Eco Poda", c:"blue" },
    tucu_poda: { l:"TucuPoda", c:"purple" },
  };
  const estados = {
    iniciado: { l:"Iniciado", c:"gray" },
    inspeccionado: { l:"Inspeccionado", c:"yellow" },
    en_proceso: { l:"En proceso", c:"blue" },
    derivado: { l:"Derivado", c:"orange" },
    finalizado: { l:"Finalizado", c:"green" },
  };

  const empty = {
    tipo, numeroReclamo:"", domicilio:"", fechaTrabajo:hoy(),
    responsable:"direccion_arbolado", cuadrilla:"",
    estado:"iniciado", inspector:"", destinoDerivado:"",
    observaciones:""
  };
  const [form, setForm] = useState(empty);

  const itemsDelTipo = useMemo(() => (data.gestionArbolado||[]).filter(g => g.tipo === tipo), [data.gestionArbolado, tipo]);

  const list = useMemo(() => {
    const q = search.toLowerCase();
    return [...itemsDelTipo].reverse().filter(g => {
      const matchSearch = (g.numeroReclamo||"").toLowerCase().includes(q) || (g.domicilio||"").toLowerCase().includes(q);
      const matchEstado = filtroEstado === "todos" || g.estado === filtroEstado;
      return matchSearch && matchEstado;
    });
  }, [itemsDelTipo, search, filtroEstado]);

  const openNew = () => { setForm({...empty, tipo, fechaTrabajo:hoy()}); setEditing(null); setModal(true); };
  const openEdit = (g) => { setForm({...g}); setEditing(g.id); setModal(true); };
  const save = () => {
    if(!form.numeroReclamo.trim()) return;
    const id = editing || uid();
    const item = {...form, tipo};
    up(prev => editing
      ? {...prev, gestionArbolado:(prev.gestionArbolado||[]).map(g=>g.id===editing?{...item,id}:g)}
      : {...prev, gestionArbolado:[...(prev.gestionArbolado||[]),{...item,id}]}
    );
    (editing ? sbUpdate("gestion_arbolado", id, item) : sbInsert("gestion_arbolado", id, item));
    setModal(false);
  };
  const remove = () => { up(prev=>({...prev, gestionArbolado:(prev.gestionArbolado||[]).filter(g=>g.id!==del)})); sbDelete("gestion_arbolado", del); setDel(null); };
  const f = (k,v) => setForm(p=>({...p,[k]:v}));

  const countPorEstado = Object.keys(estados).map(k => ({ key:k, ...estados[k], count: itemsDelTipo.filter(g=>g.estado===k).length }));

  return (
    <div>
      <PageHeader title={tipoLabel} sub={`Seguimiento administrativo y operativo — ${tipoLabel.toLowerCase()}`}>
        <BtnNew onClick={openNew} label={`Nuevo registro`}/>
      </PageHeader>

      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 mb-6">
        {countPorEstado.map(c => (
          <StatCard key={c.key} label={c.l} value={c.count} color={c.c}/>
        ))}
      </div>

      <div className="flex flex-col sm:flex-row gap-3 mb-4">
        <div className="max-w-sm flex-1"><SearchBar value={search} onChange={setSearch} placeholder="Buscar por N° de reclamo o domicilio..."/></div>
        <div className="flex gap-1.5 flex-wrap">
          <button onClick={()=>setFiltroEstado("todos")} className={`px-3 py-2 text-xs font-semibold rounded-lg transition-colors ${filtroEstado==="todos"?"bg-emerald-100 text-emerald-700":"bg-gray-100 text-gray-500 hover:bg-gray-200"}`}>Todos</button>
          {Object.entries(estados).map(([k,v])=>(
            <button key={k} onClick={()=>setFiltroEstado(k)} className={`px-3 py-2 text-xs font-semibold rounded-lg transition-colors ${filtroEstado===k?"bg-emerald-100 text-emerald-700":"bg-gray-100 text-gray-500 hover:bg-gray-200"}`}>{v.l}</button>
          ))}
        </div>
      </div>

      <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden"><div className="overflow-x-auto">
        <table className="w-full text-sm"><thead><tr className="border-b border-gray-100 bg-gray-50/50">
          <TH>N° Reclamo / Causante</TH><TH>Domicilio</TH><TH className="hidden sm:table-cell">Fecha</TH><TH className="hidden md:table-cell">Responsable</TH><TH className="text-center">Estado</TH><TH className="text-right">Acciones</TH>
        </tr></thead><tbody className="divide-y divide-gray-50">
          {list.length===0 ? <EmptyRow cols={6} text={search||filtroEstado!=="todos"?"Sin resultados":`Sin registros de ${tipoLabel.toLowerCase()}. Hacé clic en "Nuevo registro" para agregar uno.`}/> : list.map(g => (
            <tr key={g.id} className="hover:bg-gray-50/50">
              <td className="px-4 py-3 font-medium text-gray-900">{g.numeroReclamo}</td>
              <td className="px-4 py-3 text-gray-700">{g.domicilio}</td>
              <td className="px-4 py-3 text-gray-500 hidden sm:table-cell">{fmtDate(g.fechaTrabajo)}</td>
              <td className="px-4 py-3 hidden md:table-cell">
                <Badge label={responsables[g.responsable]?.l||g.responsable} color={responsables[g.responsable]?.c||"gray"}/>
                {g.responsable==="direccion_arbolado" && g.cuadrilla && <span className="text-xs text-gray-400 ml-1.5">({g.cuadrilla})</span>}
              </td>
              <td className="px-4 py-3 text-center">
                <Badge label={estados[g.estado]?.l||g.estado} color={estados[g.estado]?.c||"gray"}/>
                {g.estado==="inspeccionado" && g.inspector && <p className="text-[10px] text-gray-400 mt-0.5">{g.inspector}</p>}
                {g.estado==="derivado" && g.destinoDerivado && <p className="text-[10px] text-gray-400 mt-0.5">→ {g.destinoDerivado}</p>}
              </td>
              <td className="px-4 py-3 text-right"><ActionBtns onEdit={()=>openEdit(g)} onDelete={()=>setDel(g.id)}/></td>
            </tr>
          ))}
        </tbody></table>
      </div></div>

      <Modal open={modal} onClose={()=>setModal(false)} title={editing?`Editar ${tipoLabel.slice(0,-1).toLowerCase()}`:`Nuevo registro de ${tipoLabel.toLowerCase()}`} wide>
        <div className="grid grid-cols-2 gap-4">
          <Field label="N° de Reclamo o Causante" span2><input className={inp} value={form.numeroReclamo} onChange={e=>f("numeroReclamo",e.target.value)} placeholder="Ej: 4521 o nombre del causante"/></Field>
          <Field label="Domicilio" span2><input className={inp} value={form.domicilio} onChange={e=>f("domicilio",e.target.value)} placeholder="Domicilio de la intervención"/></Field>
          <Field label="Fecha del trabajo"><input type="date" className={inp} value={form.fechaTrabajo} onChange={e=>f("fechaTrabajo",e.target.value)}/></Field>
          <Field label="Responsable de la ejecución">
            <select className={sel} value={form.responsable} onChange={e=>f("responsable",e.target.value)}>
              {Object.entries(responsables).map(([k,v])=><option key={k} value={k}>{v.l}</option>)}
            </select>
          </Field>
          {form.responsable==="direccion_arbolado" && (
            <Field label="Cuadrilla" span2><input className={inp} value={form.cuadrilla} onChange={e=>f("cuadrilla",e.target.value)} placeholder="Ej: Cuadrilla N°1"/></Field>
          )}
          <Field label="Estado del trámite">
            <select className={sel} value={form.estado} onChange={e=>f("estado",e.target.value)}>
              {Object.entries(estados).map(([k,v])=><option key={k} value={k}>{v.l}</option>)}
            </select>
          </Field>
          {form.estado==="inspeccionado" && (
            <Field label="Inspector"><input className={inp} value={form.inspector} onChange={e=>f("inspector",e.target.value)} placeholder="Nombre del inspector"/></Field>
          )}
          {form.estado==="derivado" && (
            <Field label="Destino de la derivación"><input className={inp} value={form.destinoDerivado} onChange={e=>f("destinoDerivado",e.target.value)} placeholder="Ej: Eco Poda, TucuPoda..."/></Field>
          )}
          <Field label="Observaciones" span2><textarea className={inp+" resize-none"} rows={2} value={form.observaciones} onChange={e=>f("observaciones",e.target.value)} placeholder="Notas adicionales..."/></Field>
        </div>
        <SaveCancel onCancel={()=>setModal(false)} onSave={save}/>
      </Modal>
      <ConfirmDelete open={!!del} onClose={()=>setDel(null)} onConfirm={remove} itemName="este registro"/>
    </div>
  );
}

// ═══════════════════════════════
// USUARIOS (solo Administrador)
// ═══════════════════════════════
function UsuariosPage() {
  const [usuarios, setUsuarios] = useState([]);
  const [loading, setLoading] = useState(true);
  const ROLES = { administrador:"Administrador", director:"Director", administrativo:"Administrativo", inspector:"Inspector" };

  const cargar = () => { setLoading(true); sbListProfiles().then(u => { setUsuarios(u); setLoading(false); }); };
  useEffect(() => { cargar(); }, []);

  const cambiarRol = async (id, rol) => {
    setUsuarios(prev => prev.map(u => u.id===id ? {...u, rol} : u));
    await sbUpdateProfile(id, { rol });
  };

  return (
    <div>
      <PageHeader title="Usuarios" sub="Gestión de usuarios y roles del sistema"/>
      <div className="bg-blue-50 border border-blue-100 rounded-xl p-4 mb-6">
        <p className="text-sm text-blue-800 font-medium mb-1">Para crear un usuario nuevo:</p>
        <p className="text-sm text-blue-700">Andá a Supabase → Authentication → Users → "Add user", cargá su email y una contraseña provisoria. En cuanto inicie sesión por primera vez va a aparecer automáticamente en esta lista, y desde acá le podés asignar su rol.</p>
      </div>
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden"><div className="overflow-x-auto">
        <table className="w-full text-sm"><thead><tr className="border-b border-gray-100 bg-gray-50/50">
          <TH>Nombre</TH><TH>Email</TH><TH>Rol</TH>
        </tr></thead><tbody className="divide-y divide-gray-50">
          {loading ? <EmptyRow cols={3} text="Cargando..."/> : usuarios.length===0 ? <EmptyRow cols={3} text="Sin usuarios registrados todavía"/> : usuarios.map(u => (
            <tr key={u.id} className="hover:bg-gray-50/50">
              <td className="px-4 py-3 font-medium text-gray-900">{u.nombre || "—"}</td>
              <td className="px-4 py-3 text-gray-600">{u.email}</td>
              <td className="px-4 py-3">
                <select className={sel + " max-w-[180px]"} value={u.rol||"administrativo"} onChange={e=>cambiarRol(u.id, e.target.value)}>
                  {Object.entries(ROLES).map(([k,v])=><option key={k} value={k}>{v}</option>)}
                </select>
              </td>
            </tr>
          ))}
        </tbody></table>
      </div></div>
    </div>
  );
}
