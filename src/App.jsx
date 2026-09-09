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
const esResolucionCompensatorio = (r) => (r.tipoResolucion || "") === "compensatorio";

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

  // ─── Cumpleaños próximos (7 días, con manejo de cambio de año) ───
  const cumples = useMemo(() => {
    const hoyDate = new Date();
    hoyDate.setHours(0,0,0,0);
    const personal = data.personal || [];
    const DIAS_RANGO = 7;
    const resultados = [];

    personal.forEach(p => {
      if (!p.fechaNacimiento) return;
      const partes = p.fechaNacimiento.split("-");
      if (partes.length < 3) return;
      const mesNac = parseInt(partes[1], 10);
      const diaNac = parseInt(partes[2], 10);

      // Probar este año y el siguiente (para el cruce dic→ene)
      for (let offset = 0; offset <= 1; offset++) {
        const cumple = new Date(hoyDate.getFullYear() + offset, mesNac - 1, diaNac);
        cumple.setHours(0,0,0,0);
        const diffMs = cumple.getTime() - hoyDate.getTime();
        const diffDias = Math.round(diffMs / (1000 * 60 * 60 * 24));
        if (diffDias >= 0 && diffDias <= DIAS_RANGO) {
          resultados.push({ ...p, cumpleFecha: cumple, diffDias });
          break;
        }
      }
    });

    resultados.sort((a, b) => a.diffDias - b.diffDias);
    return resultados;
  }, [data.personal]);

  const DIAS_SEMANA = ["Domingo","Lunes","Martes","Miércoles","Jueves","Viernes","Sábado"];
  const MESES_CORTO = ["ENE","FEB","MAR","ABR","MAY","JUN","JUL","AGO","SEP","OCT","NOV","DIC"];

  const cumpleLabel = (diff, fecha) => {
    if (diff === 0) return { text: "HOY", emoji: "🎂", highlight: true };
    if (diff === 1) return { text: "MAÑANA", emoji: "🎉", highlight: false };
    return { text: `${fecha.getDate()} ${MESES_CORTO[fecha.getMonth()]}`, emoji: "🎈", highlight: false };
  };

  const cumpleHoy = cumples.filter(c => c.diffDias === 0);
  const cumpleProximos = cumples.filter(c => c.diffDias > 0);

  return (
    <div>
      <PageHeader title="Panel de Control" sub="Resumen general — Dirección de Arbolado"/>

      {/* ═══ AVISOS Y NOVEDADES ═══ */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm mb-8 overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-100 flex items-center gap-2.5">
          <span className="w-7 h-7 rounded-lg bg-amber-100 text-amber-600 flex items-center justify-center text-sm">🔔</span>
          <h3 className="font-bold text-gray-900 text-sm">Avisos y Novedades</h3>
        </div>

        {cumples.length === 0 ? (
          <div className="px-5 py-8 text-center">
            <p className="text-sm text-gray-400">No hay cumpleaños próximos en los próximos 7 días.</p>
          </div>
        ) : (
          <div className="p-5">
            {/* Cumpleaños HOY */}
            {cumpleHoy.length > 0 && (
              <div className="mb-5">
                <div className="bg-gradient-to-r from-amber-50 to-orange-50 rounded-xl border border-amber-200/60 p-4">
                  <p className="text-xs font-bold text-amber-700 uppercase tracking-wider mb-3 flex items-center gap-1.5">🎂 Hoy cumple{cumpleHoy.length > 1 ? "n" : ""} años</p>
                  <div className="space-y-2.5">
                    {cumpleHoy.map((p, i) => (
                      <div key={i} className="flex items-center gap-3">
                        <div className="w-9 h-9 rounded-full bg-amber-200 text-amber-800 flex items-center justify-center text-sm font-bold shrink-0">
                          {(p.nombre || "?")[0].toUpperCase()}
                        </div>
                        <div className="min-w-0">
                          <p className="text-sm font-semibold text-gray-900">{p.nombre}</p>
                          <p className="text-xs text-amber-700">{p.funcion || "Dirección de Arbolado"}</p>
                        </div>
                        <span className="ml-auto text-lg">🎉</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {/* Próximos cumpleaños */}
            {cumpleProximos.length > 0 && (
              <div>
                <p className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-3 flex items-center gap-1.5">🎉 Próximos cumpleaños</p>
                <div className="space-y-2">
                  {cumpleProximos.map((p, i) => {
                    const info = cumpleLabel(p.diffDias, p.cumpleFecha);
                    const diaSemana = DIAS_SEMANA[p.cumpleFecha.getDay()];
                    return (
                      <div key={i} className="flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-gray-50 transition-colors">
                        <div className="w-8 h-8 rounded-full bg-emerald-100 text-emerald-700 flex items-center justify-center text-xs font-bold shrink-0">
                          {(p.nombre || "?")[0].toUpperCase()}
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-medium text-gray-900">{p.nombre}</p>
                          <p className="text-xs text-gray-500">{p.funcion || "Dirección de Arbolado"}</p>
                        </div>
                        <div className="text-right shrink-0">
                          <p className={`text-xs font-bold ${info.highlight ? "text-amber-700" : "text-emerald-700"}`}>{info.emoji} {info.text}</p>
                          <p className="text-[10px] text-gray-400">{diaSemana}</p>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* ═══ STATS ═══ */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-8">
        <StatCard label="Expedientes" value={data.expedientes.length} sub="Registrados" color="blue"/>
        <StatCard label="Patrimonio Vegetal" value={data.expedientes.filter(e=>esAsuntoPatrimonioVegetal(e.asunto)).length} sub="Expedientes vinculados" color="green"/>
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

      {/* ═══ ACTIVIDAD RECIENTE ═══ */}
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

  // Calcula el siguiente número de expediente correlativo
  const siguienteNumero = useCallback(() => {
    const todos = data.expedientes;
    if (!todos || todos.length === 0) return "";
    // Extraer solo la parte numérica de cada número (ignora puntos, barras, espacios)
    const nums = todos.map(e => {
      const limpio = (e.numero || "").replace(/[\s.,]/g, "");
      const n = parseInt(limpio, 10);
      return isNaN(n) ? 0 : n;
    });
    const maximo = Math.max(...nums);
    if (maximo <= 0) return "";
    // Detectar formato original: con punto cada 3 dígitos (ej: "45.000") o sin separador (ej: "45000")
    const referencia = todos.find(e => {
      const limpio = (e.numero || "").replace(/[\s,]/g, "");
      return parseInt(limpio.replace(/\./g, ""), 10) === maximo;
    });
    const siguiente = maximo + 1;
    if (referencia && referencia.numero.includes(".")) {
      // Reproducir formato con punto: 45000 → "45.000"
      return siguiente.toLocaleString("es-AR").replace(/,/g, ".");
    }
    return String(siguiente);
  }, [data.expedientes]);

  const list = useMemo(() => {
    const q = search.toLowerCase();
    return [...data.expedientes].reverse().filter(e => e.numero.toLowerCase().includes(q)||e.causante.toLowerCase().includes(q)||e.asunto.toLowerCase().includes(q));
  }, [data.expedientes, search]);

  const esPV = esAsuntoPatrimonioVegetal(form.asunto);

  const openNew = () => { setForm({...empty, numero: siguienteNumero()}); setEditing(null); setModal(true); };
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
          <Field label="N° Expediente">
            <div className="relative">
              <input className={inp} value={form.numero} onChange={e=>f("numero",e.target.value)} placeholder="Ej: 45001"/>
              {!editing && form.numero && <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[10px] font-semibold text-emerald-600 bg-emerald-50 px-1.5 py-0.5 rounded-md">AUTO</span>}
            </div>
            {!editing && <p className="text-[11px] text-gray-400 mt-1">Calculado automáticamente. Podés editarlo si es necesario.</p>}
          </Field>
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
  const [modalRendicion, setModalRendicion] = useState(false);
  const [editing, setEditing] = useState(null);
  const [del, setDel] = useState(null);
  const [pInput, setPInput] = useState("");

  // Una factura tiene: proveedor, N° factura, fecha, destino, y múltiples artículos
  const emptyArticulo = { detalle:"", cantidad:1, importeUnitario:"" };
  const emptyForm = { numeroFactura:"", proveedor:"", fecha:hoy(), destino:"", articulos:[{...emptyArticulo}] };
  const [form, setForm] = useState(emptyForm);

  // Registros del mes activo
  const regs = useMemo(() =>
    data.cajaChica.registros.filter(r => r.mes===mesS && r.anio===anioS),
    [data.cajaChica.registros, mesS, anioS]
  );

  // Total gastado: suma de (cantidad × importeUnitario) de todos los artículos de todas las facturas
  const totalG = useMemo(() => regs.reduce((sum, r) => {
    const arts = r.articulos || [{ detalle:r.detalle, cantidad:r.cantidad||1, importeUnitario:r.montoPorUnidad||r.montoTotal||0 }];
    return sum + arts.reduce((s, a) => s + (parseFloat(a.cantidad)||1) * (parseFloat(a.importeUnitario)||0), 0);
  }, 0), [regs]);

  const pres = parseFloat(data.cajaChica.presupuesto) || 0;
  const saldo = pres - totalG;
  const pct = pres > 0 ? Math.min((totalG / pres) * 100, 100) : 0;

  // ─── Artículos del formulario ───
  const setArticulo = (i, k, v) => setForm(p => {
    const arts = p.articulos.map((a, idx) => idx===i ? {...a,[k]:v} : a);
    return {...p, articulos:arts};
  });
  const addArticulo = () => setForm(p => ({...p, articulos:[...p.articulos, {...emptyArticulo}]}));
  const removeArticulo = (i) => setForm(p => ({...p, articulos:p.articulos.filter((_,idx)=>idx!==i)}));

  const openNew = () => { setForm(emptyForm); setEditing(null); setModal(true); };
  const openEdit = (r) => {
    const arts = r.articulos || [{ detalle:r.detalle||"", cantidad:r.cantidad||1, importeUnitario:r.montoPorUnidad||r.montoTotal||"" }];
    setForm({ numeroFactura:r.numeroFactura||"", proveedor:r.proveedor||"", fecha:r.fecha||hoy(), destino:r.destino||"", articulos:arts });
    setEditing(r.id);
    setModal(true);
  };

  const save = () => {
    if (!form.numeroFactura.trim() || !form.proveedor.trim()) return;
    const artsValidas = form.articulos.filter(a => a.detalle.trim());
    if (artsValidas.length === 0) return;
    const reg = { ...form, articulos:artsValidas, mes:mesS, anio:anioS };
    const id = editing || uid();
    up(p => {
      const rs = [...p.cajaChica.registros];
      if (editing) { const i = rs.findIndex(r=>r.id===editing); if(i>=0) rs[i]={...reg,id}; }
      else rs.push({...reg, id});
      return {...p, cajaChica:{...p.cajaChica, registros:rs}};
    });
    (editing ? sbUpdate("caja_chica_registros", id, reg) : sbInsert("caja_chica_registros", id, reg));
    setModal(false);
  };

  const remove = () => { up(p=>({...p,cajaChica:{...p.cajaChica,registros:p.cajaChica.registros.filter(r=>r.id!==del)}})); sbDelete("caja_chica_registros", del); setDel(null); };
  const saveP = () => { const v = parseFloat(pInput)||0; up(p=>({...p,cajaChica:{...p.cajaChica,presupuesto:v}})); sbSetPresupuesto(v); setModalP(false); };

  // ─── Generar e imprimir la rendición ───
  const imprimirRendicion = () => {
    const filas = [];
    regs.forEach(r => {
      const arts = r.articulos || [{ detalle:r.detalle, cantidad:r.cantidad||1, importeUnitario:r.montoPorUnidad||r.montoTotal||0 }];
      arts.forEach((a, i) => {
        filas.push({
          proveedor: i===0 ? (r.proveedor||"") : "",
          factura: i===0 ? (r.numeroFactura||"") : "",
          detalle: a.detalle || "",
          destino: i===0 ? (r.destino||"") : "",
          cantidad: parseFloat(a.cantidad)||1,
          importeUnitario: parseFloat(a.importeUnitario)||0,
        });
      });
    });
    const totalRendicion = filas.reduce((s,f) => s + f.cantidad * f.importeUnitario, 0);
    const fmtARS = (n) => "$" + n.toLocaleString("es-AR", {minimumFractionDigits:2, maximumFractionDigits:2});
    const filasHTML = filas.map(f => `
      <tr>
        <td>${f.proveedor}</td>
        <td style="text-align:center">${f.factura}</td>
        <td>${f.detalle}${f.cantidad > 1 ? ` <span style="color:#888;font-size:11px">(x${f.cantidad})</span>` : ""}</td>
        <td>${f.destino}</td>
        <td style="text-align:right">${f.importeUnitario > 0 ? fmtARS(f.importeUnitario) : ""}</td>
      </tr>`).join("");

    const w = window.open("","_blank","width=900,height=700");
    if (!w) return;
    w.document.write(`<!DOCTYPE html><html><head><title>Rendición Caja Chica — ${MESES[mesS]} ${anioS}</title>
<style>
@media print { .no-print { display:none !important; } @page { size:A4; margin:2cm; } }
body { font-family:'Times New Roman',Times,serif; font-size:12pt; color:#111; margin:0; }
.page { max-width:780px; margin:0 auto; padding:20px; }
.header { text-align:center; margin-bottom:24px; border-bottom:2px solid #222; padding-bottom:14px; }
.header h1 { font-size:14pt; font-weight:bold; margin:0 0 4px; text-transform:uppercase; letter-spacing:1px; }
.header p { font-size:10pt; color:#444; margin:2px 0; }
.titulo-tabla { font-size:12pt; font-weight:bold; text-align:center; margin:16px 0 10px; text-transform:uppercase; letter-spacing:1px; }
table { width:100%; border-collapse:collapse; font-size:10.5pt; }
thead tr { background:#f0f0f0; }
th { border:1px solid #999; padding:6px 8px; font-weight:bold; font-size:10pt; text-align:left; text-transform:uppercase; }
td { border:1px solid #bbb; padding:5px 8px; vertical-align:top; }
tr:nth-child(even) td { background:#fafafa; }
.totales { margin-top:16px; border-top:2px solid #222; }
.totales table { width:100%; border-collapse:collapse; }
.totales td { padding:5px 8px; border:none; font-size:11pt; }
.totales .label { font-weight:bold; text-align:right; width:60%; }
.totales .valor { text-align:right; min-width:140px; }
.saldo-pos { color:#15803d; font-weight:bold; }
.saldo-neg { color:#dc2626; font-weight:bold; }
.btn-bar { display:flex; gap:10px; justify-content:center; margin:16px 0; }
.btn { padding:10px 28px; border:none; border-radius:8px; font-size:13px; cursor:pointer; font-weight:600; }
.btn-print { background:#16a34a; color:white; }
.btn-word { background:#1d4ed8; color:white; }
</style></head><body>
<div class="page">
<div class="btn-bar no-print">
  <button class="btn btn-print" onclick="window.print()">Imprimir</button>
  <button class="btn btn-word" onclick="descargarWord()">Descargar Word</button>
</div>
<div class="header">
  <h1>Municipalidad de San Miguel de Tucumán</h1>
  <p>Dirección de Arbolado</p>
  <p style="font-size:11pt;font-weight:bold;margin-top:6px;">RENDICIÓN DE CAJA CHICA — ${MESES[mesS].toUpperCase()} ${anioS}</p>
</div>
<div class="titulo-tabla">Cuadro de Rendición Mensual</div>
<table>
  <thead><tr>
    <th style="width:22%">Proveedor</th>
    <th style="width:12%;text-align:center">N° Factura</th>
    <th style="width:30%">Detalle</th>
    <th style="width:20%">Destino</th>
    <th style="width:16%;text-align:right">Importe Unitario</th>
  </tr></thead>
  <tbody>${filasHTML}</tbody>
</table>
<div class="totales">
  <table>
    <tr><td class="label">IMPORTE ASIGNADO:</td><td class="valor">${fmtARS(pres)}</td></tr>
    <tr><td class="label">IMPORTE TOTAL GASTADO:</td><td class="valor">${fmtARS(totalRendicion)}</td></tr>
    <tr><td class="label">SALDO:</td><td class="valor ${totalRendicion<=pres?"saldo-pos":"saldo-neg"}">${fmtARS(pres - totalRendicion)}</td></tr>
  </table>
</div>
<div style="margin-top:60px;display:grid;grid-template-columns:1fr 1fr;gap:40px;text-align:center">
  <div><div style="border-top:1px solid #333;padding-top:6px;font-size:10pt">Firma responsable</div></div>
  <div><div style="border-top:1px solid #333;padding-top:6px;font-size:10pt">Autorización</div></div>
</div>
</div>
<script>
function descargarWord(){
  const html=document.querySelector('.page').innerHTML;
  const full='<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:w="urn:schemas-microsoft-com:office:word" xmlns="http://www.w3.org/TR/REC-html40"><head><meta charset="utf-8"><style>body{font-family:Times New Roman;font-size:12pt;}table{border-collapse:collapse;width:100%;}th,td{border:1px solid #999;padding:5px 8px;}</style></head><body>'+html+'</body></html>';
  const blob=new Blob(['\ufeff'+full],{type:'application/msword'});
  const url=URL.createObjectURL(blob);
  const a=document.createElement('a');
  a.href=url;a.download='Rendicion_CajaChica_${MESES[mesS]}_${anioS}.doc';
  document.body.appendChild(a);a.click();document.body.removeChild(a);URL.revokeObjectURL(url);
}
</script>
</body></html>`);
    w.document.close();
  };

  return (
    <div>
      <PageHeader title="Caja Chica" sub="Rendición mensual de gastos">
        <button onClick={()=>{setPInput(data.cajaChica.presupuesto.toString());setModalP(true);}} className="px-4 py-2.5 text-sm font-medium text-gray-700 bg-white border border-gray-200 rounded-xl hover:bg-gray-50 transition-colors">Presupuesto</button>
        <button onClick={imprimirRendicion} disabled={regs.length===0} className="flex items-center gap-2 px-4 py-2.5 text-sm font-medium text-blue-700 bg-blue-50 rounded-xl hover:bg-blue-100 transition-colors disabled:opacity-40 disabled:cursor-not-allowed">{I.print} Generar rendición</button>
        <BtnNew onClick={openNew} label="Nueva factura"/>
      </PageHeader>

      {/* Período + resumen */}
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

      {/* Tabla de facturas del mes */}
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden"><div className="overflow-x-auto">
        <table className="w-full text-sm"><thead><tr className="border-b border-gray-100 bg-gray-50/50">
          <TH>N° Factura</TH><TH>Proveedor</TH><TH>Artículos</TH><TH className="hidden md:table-cell">Destino</TH><TH className="hidden lg:table-cell">Fecha</TH><TH className="text-right">Total factura</TH><TH className="text-right">Acciones</TH>
        </tr></thead><tbody className="divide-y divide-gray-50">
          {regs.length===0 ? <EmptyRow cols={7} text={`Sin gastos para ${MESES[mesS]} ${anioS}`}/> : regs.map(r => {
            const arts = r.articulos || [{ detalle:r.detalle, cantidad:r.cantidad||1, importeUnitario:r.montoPorUnidad||r.montoTotal||0 }];
            const totalFact = arts.reduce((s,a)=>s+(parseFloat(a.cantidad)||1)*(parseFloat(a.importeUnitario)||0),0);
            return (
              <tr key={r.id} className="hover:bg-gray-50/50 align-top">
                <td className="px-4 py-3 font-medium text-gray-900">{r.numeroFactura}</td>
                <td className="px-4 py-3 text-gray-700">{r.proveedor}</td>
                <td className="px-4 py-2">
                  {arts.map((a,i)=>(
                    <div key={i} className="py-1 text-gray-700 text-xs flex items-start gap-1.5">
                      <span className="shrink-0 text-gray-400">·</span>
                      <span>{a.detalle}{parseFloat(a.cantidad)>1?<span className="text-gray-400 ml-1">×{a.cantidad}</span>:null} — <span className="text-gray-500">{fmtMoney(a.importeUnitario)}</span></span>
                    </div>
                  ))}
                </td>
                <td className="px-4 py-3 text-gray-500 hidden md:table-cell">{r.destino}</td>
                <td className="px-4 py-3 text-gray-500 hidden lg:table-cell">{fmtDate(r.fecha)}</td>
                <td className="px-4 py-3 text-right font-semibold text-gray-900">{fmtMoney(totalFact)}</td>
                <td className="px-4 py-3 text-right"><ActionBtns onEdit={()=>openEdit(r)} onDelete={()=>setDel(r.id)}/></td>
              </tr>
            );
          })}
        </tbody></table>
      </div></div>

      {/* Modal: Nueva factura con múltiples artículos */}
      <Modal open={modal} onClose={()=>setModal(false)} title={editing?"Editar factura":"Nueva factura"} wide>
        <div className="grid grid-cols-2 gap-4 mb-4">
          <Field label="N° Factura"><input className={inp} value={form.numeroFactura} onChange={e=>setForm(p=>({...p,numeroFactura:e.target.value}))} placeholder="N° factura"/></Field>
          <Field label="Fecha"><input type="date" className={inp} value={form.fecha} onChange={e=>setForm(p=>({...p,fecha:e.target.value}))}/></Field>
          <Field label="Proveedor" span2><input className={inp} value={form.proveedor} onChange={e=>setForm(p=>({...p,proveedor:e.target.value}))} placeholder="Nombre del proveedor"/></Field>
          <Field label="Destino" span2><input className={inp} value={form.destino} onChange={e=>setForm(p=>({...p,destino:e.target.value}))} placeholder="Para qué área o uso (aplica a todos los artículos)"/></Field>
        </div>

        {/* Artículos de la factura */}
        <div className="border border-gray-200 rounded-xl overflow-hidden mb-4">
          <div className="bg-gray-50 px-4 py-2.5 flex items-center justify-between border-b border-gray-200">
            <p className="text-xs font-bold text-gray-600 uppercase tracking-wider">Artículos de la factura</p>
            <button onClick={addArticulo} className="flex items-center gap-1.5 text-xs font-semibold text-emerald-600 hover:text-emerald-700 transition-colors">{I.plus} Agregar artículo</button>
          </div>
          <div className="divide-y divide-gray-100">
            {form.articulos.map((a, i) => (
              <div key={i} className="px-4 py-3 grid grid-cols-12 gap-2 items-end">
                <div className="col-span-5">
                  <label className="block text-[11px] font-semibold text-gray-400 uppercase tracking-wider mb-1">Detalle</label>
                  <input className={inp} value={a.detalle} onChange={e=>setArticulo(i,"detalle",e.target.value)} placeholder="Qué es el artículo"/>
                </div>
                <div className="col-span-2">
                  <label className="block text-[11px] font-semibold text-gray-400 uppercase tracking-wider mb-1">Cantidad</label>
                  <input type="number" min="1" className={inp} value={a.cantidad} onChange={e=>setArticulo(i,"cantidad",e.target.value)}/>
                </div>
                <div className="col-span-3">
                  <label className="block text-[11px] font-semibold text-gray-400 uppercase tracking-wider mb-1">Importe unit.</label>
                  <input type="number" step="0.01" className={inp} value={a.importeUnitario} onChange={e=>setArticulo(i,"importeUnitario",e.target.value)} placeholder="0.00"/>
                </div>
                <div className="col-span-1 text-right text-xs font-semibold text-gray-700 pb-2.5">
                  {parseFloat(a.cantidad)>0&&parseFloat(a.importeUnitario)>0 ? fmtMoney((parseFloat(a.cantidad)||0)*(parseFloat(a.importeUnitario)||0)) : ""}
                </div>
                <div className="col-span-1 flex justify-end pb-1">
                  {form.articulos.length > 1 && <button onClick={()=>removeArticulo(i)} className="p-1.5 rounded-lg hover:bg-rose-50 text-gray-300 hover:text-rose-400 transition-colors">{I.trash}</button>}
                </div>
              </div>
            ))}
          </div>
          <div className="bg-gray-50 px-4 py-2.5 border-t border-gray-200 flex justify-end">
            <span className="text-xs font-bold text-gray-600">
              TOTAL FACTURA: {fmtMoney(form.articulos.reduce((s,a)=>(parseFloat(a.cantidad)||0)*(parseFloat(a.importeUnitario)||0)+s,0))}
            </span>
          </div>
        </div>
        <SaveCancel onCancel={()=>setModal(false)} onSave={save}/>
      </Modal>

      <Modal open={modalP} onClose={()=>setModalP(false)} title="Presupuesto mensual">
        <Field label="Monto del presupuesto"><input type="number" step="0.01" className={inp} value={pInput} onChange={e=>setPInput(e.target.value)} placeholder="0.00"/></Field>
        <p className="text-xs text-gray-400 mt-2">Se aplica a todos los meses.</p>
        <SaveCancel onCancel={()=>setModalP(false)} onSave={saveP}/>
      </Modal>
      <ConfirmDelete open={!!del} onClose={()=>setDel(null)} onConfirm={remove} itemName="esta factura"/>
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
// ─── Helpers de documento compartidos ───
const LOGO_MEMBRETE_URI = "data:image/jpeg;base64,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";

const membrete = () => `
<div class="membrete">
  <img src="${LOGO_MEMBRETE_URI}" class="membrete-img" alt="Membrete Municipalidad de San Miguel de Tucumán — Dirección de Arbolado"/>
</div>`;

const estiloBase = () => `
<style>
@media print { .no-print { display:none !important; } @page { size:A4; margin:2.2cm 2.5cm 3cm 2.5cm; } }
* { box-sizing:border-box; margin:0; padding:0; }
body { font-family:'Times New Roman',Times,serif; font-size:11.5pt; color:#111; }
.page { max-width:720px; margin:0 auto; padding:24px; }
.membrete { margin-bottom:24px; padding-bottom:12px; border-bottom:2px solid #1e3a8a; }
.membrete-img { max-height:72px; width:auto; display:block; object-fit:contain; }
.lugar-fecha { text-align:right; margin-bottom:28px; font-size:11pt; }
.destinatario { margin-bottom:22px; font-size:11pt; line-height:1.7; }
.destinatario .cargo { font-weight:normal; }
.destinatario .nombre { font-weight:normal; }
.destinatario .despacho { font-weight:bold; text-decoration:underline; }
.cuerpo { text-align:justify; line-height:1.8; font-size:11.5pt; margin-bottom:28px; text-indent:3em; }
.cierre { margin-top:18px; font-size:11pt; }
.firmas { margin-top:70px; display:grid; grid-template-columns:1fr 1fr; gap:40px; text-align:center; }
.firma-linea { border-top:1px solid #333; padding-top:8px; font-size:10pt; }
.btn-bar { display:flex; gap:10px; justify-content:center; margin:18px 0; }
.btn { padding:10px 28px; border:none; border-radius:8px; font-size:13px; cursor:pointer; font-weight:600; }
.btn-print { background:#16a34a; color:white; }
.btn-word { background:#1d4ed8; color:white; }
/* Estilos extra para Resolución */
.resolucion-titulo { text-align:right; font-size:12pt; font-weight:bold; margin:18px 0 4px; text-transform:uppercase; letter-spacing:0.5px; }
.resolucion-numero { text-align:center; font-size:11.5pt; margin-bottom:20px; }
.seccion { font-weight:bold; font-size:11.5pt; margin:16px 0 4px; text-transform:uppercase; text-align:left; }
.seccion-centro { font-weight:bold; font-size:11.5pt; margin:14px 0 4px; text-transform:uppercase; text-align:center; }
.cuerpo-resolucion { text-align:justify; line-height:1.8; font-size:11.5pt; margin-bottom:12px; }
.articulo { margin-bottom:14px; text-align:justify; line-height:1.8; font-size:11.5pt; }
.articulo strong { font-weight:bold; }
table.agentes { width:100%; border-collapse:collapse; margin:14px 0; font-size:10.5pt; }
table.agentes th, table.agentes td { border:1px solid #888; padding:5px 10px; }
table.agentes th { background:#f0f0f0; font-weight:bold; text-align:left; text-transform:uppercase; font-size:10pt; }
</style>`;

const fnDescargarWord = (nombreArchivo) => `
function descargarWord(){
  const c=document.querySelector('.page').innerHTML;
  const full='<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:w="urn:schemas-microsoft-com:office:word" xmlns="http://www.w3.org/TR/REC-html40"><head><meta charset="utf-8">${estiloBase().replace(/<\/?style>/g,'').replace(/\n/g,' ')}</head><body><div class="page">'+c+'</div></body></html>';
  const blob=new Blob(['\ufeff'+full],{type:'application/msword'});
  const url=URL.createObjectURL(blob);const a=document.createElement('a');
  a.href=url;a.download='${nombreArchivo}.doc';document.body.appendChild(a);a.click();document.body.removeChild(a);URL.revokeObjectURL(url);
}`;

const abrirVentanaDoc = (titulo, htmlBody, nombreArchivo) => {
  const w = window.open("","_blank","width=860,height=720");
  if (!w) return;
  w.document.write(`<!DOCTYPE html><html><head><meta charset="utf-8"><title>${titulo}</title>${estiloBase()}</head><body>
<div class="btn-bar no-print">
  <button class="btn btn-print" onclick="window.print()">Imprimir</button>
  <button class="btn btn-word" onclick="descargarWord()">Descargar Word</button>
</div>
<div class="page">${htmlBody}</div>
<script>${fnDescargarWord(nombreArchivo)}<\/script>
</body></html>`);
  w.document.close();
};

const fmtFechaLarga = (iso) => {
  if (!iso) return "";
  const [y,m,d] = iso.split("-");
  const meses = ["enero","febrero","marzo","abril","mayo","junio","julio","agosto","septiembre","octubre","noviembre","diciembre"];
  return `${parseInt(d,10)} de ${meses[parseInt(m,10)-1]} de ${y}`;
};
const fmtDiaSemana = (iso) => {
  if (!iso) return "";
  const dias = ["domingo","lunes","martes","miércoles","jueves","viernes","sábado"];
  const [y,m,d] = iso.split("-").map(Number);
  return dias[new Date(y, m-1, d).getDay()];
};
const numLetras = (n) => {
  const letras = ["cero","un","dos","tres","cuatro","cinco","seis","siete","ocho","nueve","diez"];
  const ni = parseInt(n, 10);
  return letras[ni] !== undefined ? letras[ni] : String(n);
};
const numLetrasConParentesis = (n) => {
  const ni = parseInt(n, 10);
  return `${String(ni).padStart(2,"0")} (${numLetras(n)})`;
};

// ─── Generación de documentos compartidos entre Descansos y Resoluciones ───
const generarResolucionComp = (d) => {
  const fechas = d.fechas || (d.fecha ? [d.fecha] : []);
  const fechasValidas = fechas.filter(f=>f);
  const cantDias = fechasValidas.length;
  const listFechas = fechasValidas.map(f=>`${fmtDiaSemana(f)} ${fmtFechaLarga(f)}`).join(", ");
  const numRes = d.numeroResolucion || d.numero || "____";
  const fechaDoc = fmtFechaLarga(hoy());
  const html = `
${membrete()}
<p class="resolucion-titulo">RESOLUCIÓN N° ${numRes}</p>
<p class="lugar-fecha">San Miguel de Tucumán, ${fechaDoc}</p>
<p class="seccion">VISTO:</p>
<p class="cuerpo-resolucion">La necesidad de contar con personal que cumpla tareas específicas, relacionadas a trabajos operativos en la Dirección de Arbolado; y</p>
<p class="seccion">CONSIDERANDO:</p>
<p class="cuerpo-resolucion">Que atento a lo precedentemente expuesto resulta necesario emitir el pertinente acto administrativo, disponiendo los descansos compensatorios, para los agentes que prestan servicios en la Dirección de Arbolado, que trabajaron en la Dirección de Arbolado fuera de su horario habitual.</p>
<p class="seccion">POR ELLO,</p>
<p class="seccion-centro">EL DIRECTOR DE ARBOLADO</p>
<p class="seccion-centro">RESUELVE</p>
<p class="articulo"><strong>Artículo 1°.-</strong> Disponer los días de descansos compensatorios correspondientes por trabajar en exceso de horas, para el personal que prestó servicios en la Dirección de Arbolado, realizando trabajos operativos fuera de su horario habitual, a fin de que por su desempeño en tareas operativas se le otorguen los descansos compensatorios correspondientes a los agentes que se detallan a continuación:</p>
<p style="font-weight:bold;text-align:center;margin:14px 0 8px;font-size:10.5pt;text-transform:uppercase;letter-spacing:0.5px">Listado de Agentes</p>
<table class="agentes">
  <thead><tr><th>N°</th><th>Afiliado</th><th>Apellido y Nombre</th><th>Días</th><th>Compensatorio Fecha</th></tr></thead>
  <tbody><tr><td style="text-align:center">01</td><td>${d.afiliado||""}</td><td>${d.agente}</td><td style="text-align:center">${cantDias}</td><td>${listFechas}</td></tr></tbody>
</table>
<p class="articulo"><strong>Artículo 2°.-</strong> Notificar al agente y al encargado de personal para su conocimiento y archivo.</p>
<p class="articulo"><strong>Artículo 3°.-</strong> Regístrese, comuníquese y archívese.-</p>
<div class="firmas">
  <div><div class="firma-linea">Firma y aclaración</div></div>
  <div><div class="firma-linea">Director de Arbolado</div></div>
</div>`;
  abrirVentanaDoc(`Resolución Descanso — ${d.agente}`, html, `Resolucion_Descanso_${(d.agente||"").replace(/ /g,"_")}`);
};

const generarResolucionGeneral = (r) => {
  const fechaDoc = fmtFechaLarga(r.fecha || hoy());
  const cuerpo = (r.cuerpo || "").split("\n").filter(l=>l.trim()).map(l=>`<p class="cuerpo-resolucion">${l}</p>`).join("") || `<p class="cuerpo-resolucion">[Texto de la resolución]</p>`;
  const html = `
${membrete()}
<p class="resolucion-titulo">RESOLUCIÓN N° ${r.numero}</p>
<p class="lugar-fecha">San Miguel de Tucumán, ${fechaDoc}</p>
<p class="seccion">VISTO:</p>
<p class="cuerpo-resolucion">${r.asunto}; y</p>
<p class="seccion">CONSIDERANDO:</p>
${cuerpo}
<p class="seccion">POR ELLO,</p>
<p class="seccion-centro">EL DIRECTOR DE ARBOLADO</p>
<p class="seccion-centro">RESUELVE</p>
<p class="articulo"><strong>Artículo 1°.-</strong> [Texto del artículo resolutivo]</p>
<p class="articulo"><strong>Artículo 2°.-</strong> Regístrese, comuníquese y archívese.-</p>
<div class="firmas">
  <div><div class="firma-linea">Firma y aclaración</div></div>
  <div><div class="firma-linea">Director de Arbolado</div></div>
</div>`;
  abrirVentanaDoc(`Resolución N° ${r.numero}`, html, `Resolucion_${r.numero.replace(/\//g,"-")}`);
};

// ═══════════════════════════════
// DESCANSOS COMPENSATORIOS
// ═══════════════════════════════
function DescansosPage({ data, up }) {
  const [search, setSearch] = useState("");
  const [modal, setModal] = useState(false);
  const [editing, setEditing] = useState(null);
  const [del, setDel] = useState(null);
  // Soporte multi-fecha: fechas es un array de strings ISO
  const empty = { agente:"", afiliado:"", fechas:[""], numeroResolucion:"", observaciones:"" };
  const [form, setForm] = useState(empty);

  // Resoluciones de tipo compensatorio vinculadas automáticamente (fuente única)
  const vinculados = useMemo(() =>
    (data.resoluciones||[]).filter(r => esResolucionCompensatorio(r)).map(r => ({
      ...r,
      agente: r.agente || "",
      afiliado: r.afiliado || "",
      fechas: r.fechas || (r.fechaDescanso ? [r.fechaDescanso] : []),
      // Normalizar: numero es el campo canónico; numeroResolucion es alias para compatibilidad
      numero: r.numero || r.numeroResolucion || "",
      numeroResolucion: r.numero || r.numeroResolucion || "",
      source: "resolucion",
    })),
  [data.resoluciones]);

  // Registros nativos de Descansos (sin resolución vinculada, o anteriores a la integración)
  const legacy = useMemo(() =>
    (data.descansos||[]).map(d => ({...d, source:"descanso"})),
  [data.descansos]);

  // Combined: deduplicar por N° de resolución (prioridad: vinculado desde Resoluciones)
  const combined = useMemo(() => {
    const vistos = new Set();
    const resultado = [];
    for (const r of vinculados) {
      const key = (r.numeroResolucion||"").trim().toLowerCase();
      if (key) vistos.add(key);
      resultado.push(r);
    }
    for (const d of legacy) {
      const key = (d.numeroResolucion||"").trim().toLowerCase();
      if (key && vistos.has(key)) continue; // ya está representado por el lado de Resoluciones
      resultado.push(d);
    }
    return resultado.reverse();
  }, [vinculados, legacy]);

  const list = useMemo(() => {
    const q = search.toLowerCase();
    return combined.filter(d => (d.agente||"").toLowerCase().includes(q)||(d.afiliado||"").toLowerCase().includes(q)||(d.numeroResolucion||"").toLowerCase().includes(q));
  }, [combined, search]);

  const openNew = () => { setForm({...empty, fechas:[hoy()]}); setEditing(null); setModal(true); };
  const openEdit = (d) => {
    const fechas = d.fechas || (d.fecha ? [d.fecha] : [hoy()]);
    setForm({...d, fechas});
    setEditing(d);
    setModal(true);
  };

  // FUENTE ÚNICA: todo se guarda en `resoluciones` con tipoResolucion:"compensatorio"
  // Los registros legacy en `descansos` se muestran pero al editarlos se migran automáticamente
  const save = () => {
    if (!form.agente.trim()) return;
    const fechasFiltradas = (form.fechas||[]).filter(f=>f);
    const reg = {
      ...form,
      fechas: fechasFiltradas,
      tipoResolucion: "compensatorio",
      // Normalizar: el número de resolución vive en `numero` (campo de Resoluciones)
      numero: form.numero || form.numeroResolucion || "",
      numeroResolucion: form.numero || form.numeroResolucion || "",
    };

    if (editing && editing.source === "resolucion") {
      // Editar resolución existente
      const id = editing.id;
      const updated = { ...reg, id };
      up(p => ({ ...p, resoluciones: p.resoluciones.map(r => r.id===id ? updated : r) }));
      sbUpdate("resoluciones", id, updated);
    } else if (editing && editing.source === "descanso") {
      // Migrar legacy descanso → resolución (lo sacamos de descansos y lo ponemos en resoluciones)
      const oldId = editing.id;
      const newId = uid();
      const nuevo = { ...reg, id: newId };
      up(p => ({
        ...p,
        descansos: p.descansos.filter(d => d.id !== oldId),
        resoluciones: [...p.resoluciones, nuevo],
      }));
      sbDelete("descansos", oldId);
      sbInsert("resoluciones", newId, nuevo);
    } else {
      // Nuevo desde Descansos → va directo a resoluciones
      const id = uid();
      const nuevo = { ...reg, id };
      up(p => ({ ...p, resoluciones: [...p.resoluciones, nuevo] }));
      sbInsert("resoluciones", id, nuevo);
    }
    setModal(false);
  };

  const remove = () => {
    if (del.source === "resolucion") {
      up(p => ({ ...p, resoluciones: p.resoluciones.filter(r => r.id !== del.id) }));
      sbDelete("resoluciones", del.id);
    } else {
      // Legacy descanso
      up(p => ({ ...p, descansos: p.descansos.filter(d => d.id !== del.id) }));
      sbDelete("descansos", del.id);
    }
    setDel(null);
  };
  const f = (k,v) => setForm(p=>({...p,[k]:v}));
  const setFecha = (i, v) => setForm(p => { const fs=[...p.fechas]; fs[i]=v; return {...p,fechas:fs}; });
  const addFecha = () => setForm(p=>({...p,fechas:[...p.fechas,""]}));
  const removeFecha = (i) => setForm(p=>({...p,fechas:p.fechas.filter((_,idx)=>idx!==i)}));

  // Generar documento Resolución de Descanso — referencia a función de módulo
  const generarResolucion = generarResolucionComp;

  const printIcon = I.print;

  return (
    <div>
      <PageHeader title="Descansos Compensatorios" sub="Vinculado automáticamente con Resoluciones de tipo compensatorio"><BtnNew onClick={openNew} label="Nuevo registro"/></PageHeader>
      <div className="mb-4 max-w-sm"><SearchBar value={search} onChange={setSearch} placeholder="Buscar por agente, afiliado o N° resolución..."/></div>
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden"><div className="overflow-x-auto">
        <table className="w-full text-sm"><thead><tr className="border-b border-gray-100 bg-gray-50/50">
          <TH>Agente</TH><TH>N° Afiliado</TH><TH>Fecha(s) descanso</TH><TH className="hidden sm:table-cell">N° Resolución</TH><TH className="hidden md:table-cell">Origen</TH><TH className="text-right">Acciones</TH>
        </tr></thead><tbody className="divide-y divide-gray-50">
          {list.length===0 ? <EmptyRow cols={6} text={search?"Sin resultados":"Sin descansos registrados"}/> : list.map(d => {
            const fechas = d.fechas || (d.fecha ? [d.fecha] : []);
            return (
              <tr key={d.id} className={`hover:bg-gray-50/50 ${d.source==="resolucion"?"border-l-4 border-l-blue-400":""}`}>
                <td className="px-4 py-3 font-medium text-gray-900">{d.agente}</td>
                <td className="px-4 py-3 text-gray-700">{d.afiliado}</td>
                <td className="px-4 py-3 text-gray-700 text-xs">{fechas.map(f=>fmtDate(f)).join(", ")||"—"}</td>
                <td className="px-4 py-3 text-gray-500 hidden sm:table-cell">{d.numeroResolucion||"—"}</td>
                <td className="px-4 py-3 hidden md:table-cell">
                  {d.source==="resolucion" ? <Badge label="Vinculado a Resolución" color="blue"/> : <Badge label="Registro propio" color="gray"/>}
                </td>
                <td className="px-4 py-3 text-right">
                  <div className="flex items-center justify-end gap-0.5">
                    <button onClick={()=>generarResolucion(d)} className="p-1.5 rounded-lg hover:bg-emerald-50 text-gray-400 hover:text-emerald-600 transition-colors" title="Generar resolución">{printIcon}</button>
                    <button onClick={()=>openEdit(d)} className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400 hover:text-gray-600 transition-colors">{I.edit}</button>
                    <button onClick={()=>setDel(d)} className="p-1.5 rounded-lg hover:bg-rose-50 text-gray-400 hover:text-rose-500 transition-colors">{I.trash}</button>
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody></table>
      </div></div>
      <p className="text-xs text-gray-400 mt-3 flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-blue-400 inline-block"/> Las resoluciones de tipo "Descanso compensatorio" aparecen automáticamente aquí — un único registro, editable desde ambos módulos.</p>
      <Modal open={modal} onClose={()=>setModal(false)} title={editing?"Editar descanso compensatorio":"Nuevo descanso compensatorio"} wide>
        <div className="grid grid-cols-2 gap-4">
          <Field label="Nombre del agente" span2><input className={inp} value={form.agente} onChange={e=>f("agente",e.target.value)} placeholder="Nombre completo"/></Field>
          <Field label="N° de afiliado"><input className={inp} value={form.afiliado} onChange={e=>f("afiliado",e.target.value)} placeholder="N° afiliado"/></Field>
          <Field label="N° de Resolución"><input className={inp} value={form.numero||form.numeroResolucion||""} onChange={e=>{f("numero",e.target.value);f("numeroResolucion",e.target.value);}} placeholder="Ej: 3560/SSP/25"/></Field>
          <div className="col-span-2">
            <div className="flex items-center justify-between mb-1.5">
              <span className="text-[11px] font-semibold text-gray-500 uppercase tracking-wider">Fecha(s) del descanso</span>
              <button onClick={addFecha} className="flex items-center gap-1 text-xs font-semibold text-emerald-600 hover:text-emerald-700">{I.plus} Agregar fecha</button>
            </div>
            <div className="space-y-2">
              {form.fechas.map((f2, i) => (
                <div key={i} className="flex gap-2 items-center">
                  <input type="date" className={inp+" flex-1"} value={f2} onChange={e=>setFecha(i,e.target.value)}/>
                  {form.fechas.length > 1 && <button onClick={()=>removeFecha(i)} className="p-1.5 rounded-lg hover:bg-rose-50 text-gray-300 hover:text-rose-400">{I.trash}</button>}
                </div>
              ))}
            </div>
          </div>
          <Field label="Observaciones" span2><textarea className={inp+" resize-none"} rows={2} value={form.observaciones} onChange={e=>f("observaciones",e.target.value)} placeholder="Motivo, notas..."/></Field>
          <div className="col-span-2 p-3 bg-blue-50 rounded-xl border border-blue-100">
            <p className="text-xs text-blue-700 font-semibold">Este registro se guarda en Resoluciones y aparece automáticamente en ambos módulos.</p>
          </div>
        </div>
        <div className="flex justify-between mt-6">
          <button onClick={()=>{ if(form.agente.trim()) generarResolucion(form); }} className="flex items-center gap-2 px-4 py-2.5 text-sm font-medium text-emerald-700 bg-emerald-50 rounded-xl hover:bg-emerald-100 transition-colors">{printIcon} Vista previa</button>
          <div className="flex gap-3">
            <button onClick={()=>setModal(false)} className="px-4 py-2.5 text-sm font-medium text-gray-600 bg-gray-100 rounded-xl hover:bg-gray-200 transition-colors">Cancelar</button>
            <button onClick={save} className="px-5 py-2.5 text-sm font-semibold text-white bg-emerald-600 rounded-xl hover:bg-emerald-700 transition-colors">Guardar</button>
          </div>
        </div>
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
  const empty = { agente:"", afiliado:"", fechaDesde:"", fechaHasta:"", diasTotales:"", tipoLicencia:"vacaciones", resolucion:"", diasRestantes:"", observaciones:"" };
  const [form, setForm] = useState(empty);

  const list = useMemo(() => {
    const q = search.toLowerCase();
    return [...data.licencias].reverse().filter(l => l.agente.toLowerCase().includes(q)||l.afiliado.toLowerCase().includes(q));
  }, [data.licencias, search]);

  const tipos = { vacaciones:"Vacaciones", enfermedad:"Enfermedad", familiar:"Asuntos familiares", otro:"Otro" };

  const openNew = () => { setForm({...empty,fechaDesde:hoy()}); setEditing(null); setModal(true); };
  const openEdit = (l) => { setForm({resolucion:"", diasRestantes:"", ...l}); setEditing(l.id); setModal(true); };
  const save = () => {
    if (!form.agente.trim()) return;
    const id = editing || uid();
    up(p => editing ? {...p,licencias:p.licencias.map(l=>l.id===editing?{...form,id}:l)} : {...p,licencias:[...p.licencias,{...form,id}]});
    (editing ? sbUpdate("licencias", id, form) : sbInsert("licencias", id, form));
    setModal(false);
  };
  const remove = () => { up(p=>({...p,licencias:p.licencias.filter(l=>l.id!==del)})); sbDelete("licencias", del); setDel(null); };
  const f = (k,v) => setForm(p=>({...p,[k]:v}));

  // Generar Nota de Licencia (modelo Imagen 1)
  const generarNota = (l) => {
    const fechaDoc = fmtFechaLarga(hoy());
    const desde = fmtFechaLarga(l.fechaDesde);
    const hasta = fmtFechaLarga(l.fechaHasta);
    const cant = parseInt(l.diasTotales, 10) || 0;
    const cantStr = numLetrasConParentesis(cant);
    const resol = l.resolucion || "____";
    const diasRest = l.diasRestantes || "____";
    const tipo = tipos[l.tipoLicencia] || l.tipoLicencia;

    // Construir descripción de fechas
    let descFechas = "";
    if (l.fechaDesde && l.fechaHasta && l.fechaDesde !== l.fechaHasta) {
      descFechas = `los días ${fmtDiaSemana(l.fechaDesde)} ${fmtFechaLarga(l.fechaDesde)} y ${fmtDiaSemana(l.fechaHasta)} ${fmtFechaLarga(l.fechaHasta)}`;
    } else if (l.fechaDesde) {
      descFechas = `el día ${fmtDiaSemana(l.fechaDesde)} ${fmtFechaLarga(l.fechaDesde)}`;
    }

    const html = `
${membrete()}
<p class="lugar-fecha">San Miguel de Tucumán, ${fechaDoc}</p>
<div class="destinatario">
  <span class="cargo">A la Jefa de Personal de la<br/>Dirección de Arbolado<br/>Mariel Molina</span><br/>
  <span class="despacho">SU DESPACHO</span>
</div>
<p class="cuerpo">Por la presente cumplo en informar que la agente <strong>${l.agente}</strong>, Afiliada N° <strong>${l.afiliado}</strong>, hará uso de <strong>${cantStr}</strong> días de la Prórroga de su ${tipo} Anual Reglamentaria, Resolución N° <strong>${resol}</strong>, ${descFechas}, quedando <strong>${diasRest}</strong> días de la misma.-</p>
<p class="cierre">Sin otro particular la saludo atte.-</p>
<div class="firmas">
  <div><div class="firma-linea">Firma y aclaración</div></div>
  <div><div class="firma-linea">Director de Arbolado</div></div>
</div>`;
    abrirVentanaDoc(`Nota Licencia — ${l.agente}`, html, `Nota_Licencia_${(l.agente||"").replace(/ /g,"_")}`);
  };

  const printIcon = I.print;

  return (
    <div>
      <PageHeader title="Licencias" sub="Registro y generación de notas de licencia"><BtnNew onClick={openNew} label="Nueva licencia"/></PageHeader>
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
              <td className="px-4 py-3 text-right">
                <div className="flex items-center justify-end gap-0.5">
                  <button onClick={()=>generarNota(l)} className="p-1.5 rounded-lg hover:bg-emerald-50 text-gray-400 hover:text-emerald-600 transition-colors" title="Generar nota">{printIcon}</button>
                  <button onClick={()=>openEdit(l)} className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400 hover:text-gray-600 transition-colors">{I.edit}</button>
                  <button onClick={()=>setDel(l.id)} className="p-1.5 rounded-lg hover:bg-rose-50 text-gray-400 hover:text-rose-500 transition-colors">{I.trash}</button>
                </div>
              </td>
            </tr>
          ))}
        </tbody></table>
      </div></div>
      <Modal open={modal} onClose={()=>setModal(false)} title={editing?"Editar licencia":"Nueva licencia"} wide>
        <div className="grid grid-cols-2 gap-4">
          <Field label="Nombre del agente" span2><input className={inp} value={form.agente} onChange={e=>f("agente",e.target.value)} placeholder="Nombre completo"/></Field>
          <Field label="N° de afiliado"><input className={inp} value={form.afiliado} onChange={e=>f("afiliado",e.target.value)} placeholder="N° afiliado"/></Field>
          <Field label="Tipo de licencia"><select className={sel} value={form.tipoLicencia} onChange={e=>f("tipoLicencia",e.target.value)}>{Object.entries(tipos).map(([k,v])=><option key={k} value={k}>{v}</option>)}</select></Field>
          <Field label="Desde"><input type="date" className={inp} value={form.fechaDesde} onChange={e=>f("fechaDesde",e.target.value)}/></Field>
          <Field label="Hasta"><input type="date" className={inp} value={form.fechaHasta} onChange={e=>f("fechaHasta",e.target.value)}/></Field>
          <Field label="Días que toma"><input type="number" min="1" className={inp} value={form.diasTotales} onChange={e=>f("diasTotales",e.target.value)} placeholder="Cantidad de días"/></Field>
          <Field label="N° Resolución de licencia"><input className={inp} value={form.resolucion||""} onChange={e=>f("resolucion",e.target.value)} placeholder="Ej: 3560/SSP/25"/></Field>
          <Field label="Días restantes de la licencia"><input type="number" min="0" className={inp} value={form.diasRestantes||""} onChange={e=>f("diasRestantes",e.target.value)} placeholder="Días que quedan"/></Field>
          <Field label="Observaciones" span2><textarea className={inp+" resize-none"} rows={2} value={form.observaciones} onChange={e=>f("observaciones",e.target.value)} placeholder="Notas..."/></Field>
        </div>
        <div className="flex justify-between mt-6">
          <button onClick={()=>{ if(form.agente.trim()) generarNota(form); }} className="flex items-center gap-2 px-4 py-2.5 text-sm font-medium text-emerald-700 bg-emerald-50 rounded-xl hover:bg-emerald-100 transition-colors">{printIcon} Vista previa</button>
          <div className="flex gap-3">
            <button onClick={()=>setModal(false)} className="px-4 py-2.5 text-sm font-medium text-gray-600 bg-gray-100 rounded-xl hover:bg-gray-200 transition-colors">Cancelar</button>
            <button onClick={save} className="px-5 py-2.5 text-sm font-semibold text-white bg-emerald-600 rounded-xl hover:bg-emerald-700 transition-colors">Guardar</button>
          </div>
        </div>
      </Modal>
      <ConfirmDelete open={!!del} onClose={()=>setDel(null)} onConfirm={remove} itemName="esta licencia"/>
    </div>
  );
}

// ═══════════════════════════════
// RESOLUCIONES (generales)
// ═══════════════════════════════
function ResolucionesPage({ data, up }) {
  const [search, setSearch] = useState("");
  const [modal, setModal] = useState(false);
  const [editing, setEditing] = useState(null);
  const [del, setDel] = useState(null);
  const empty = { numero:"", asunto:"", fecha:"", cuerpo:"", tipoResolucion:"general", agente:"", afiliado:"", fechas:[""], observaciones:"" };
  const [form, setForm] = useState(empty);

  const esComp = esResolucionCompensatorio(form);

  const list = useMemo(() => {
    const q = search.toLowerCase();
    return [...data.resoluciones].reverse().filter(r => r.numero.toLowerCase().includes(q)||r.asunto.toLowerCase().includes(q)||(r.agente||"").toLowerCase().includes(q));
  }, [data.resoluciones, search]);

  const openNew = () => { setForm({...empty,fecha:hoy(),fechas:[hoy()]}); setEditing(null); setModal(true); };
  const openEdit = (r) => { setForm({...empty, fechas:[hoy()], ...r}); setEditing(r.id); setModal(true); };
  const save = () => {
    if (!form.numero.trim()) return;
    const id = editing || uid();
    const reg = {
      ...form,
      fechas: (form.fechas||[]).filter(f=>f),
      // Para compensatorios, mantener ambos campos sincronizados
      ...(form.tipoResolucion === "compensatorio" ? { numeroResolucion: form.numero } : {}),
    };
    up(p => editing ? {...p,resoluciones:p.resoluciones.map(r=>r.id===editing?{...reg,id}:r)} : {...p,resoluciones:[...p.resoluciones,{...reg,id}]});
    (editing ? sbUpdate("resoluciones", id, reg) : sbInsert("resoluciones", id, reg));
    setModal(false);
  };
  const remove = () => { up(p=>({...p,resoluciones:p.resoluciones.filter(r=>r.id!==del)})); sbDelete("resoluciones", del); setDel(null); };
  const f = (k,v) => setForm(p=>({...p,[k]:v}));
  const setFechaR = (i, v) => setForm(p => { const fs=[...(p.fechas||[])]; fs[i]=v; return {...p,fechas:fs}; });
  const addFechaR = () => setForm(p=>({...p,fechas:[...(p.fechas||[]),""] }));
  const removeFechaR = (i) => setForm(p=>({...p,fechas:(p.fechas||[]).filter((_,idx)=>idx!==i)}));

  // Reutiliza la función de generación de compensatorio si es de ese tipo
  const handleGenerar = (r) => {
    if (esResolucionCompensatorio(r)) {
      // Construir objeto compatible con generarResolucion de Descansos
      const dComp = {
        ...r,
        agente: r.agente||"",
        afiliado: r.afiliado||"",
        fechas: r.fechas||(r.fechaDescanso?[r.fechaDescanso]:[]),
        numeroResolucion: r.numero||"",
      };
      generarResolucionComp(dComp);
    } else {
      generarResolucionGeneral(r);
    }
  };

  const printIcon = I.print;

  return (
    <div>
      <PageHeader title="Resoluciones" sub="Registro y generación de resoluciones"><BtnNew onClick={openNew} label="Nueva resolución"/></PageHeader>
      <div className="mb-4 max-w-sm"><SearchBar value={search} onChange={setSearch} placeholder="Buscar por número, asunto o agente..."/></div>
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden"><div className="overflow-x-auto">
        <table className="w-full text-sm"><thead><tr className="border-b border-gray-100 bg-gray-50/50">
          <TH>N° Resolución</TH><TH>Tipo</TH><TH>Asunto / Agente</TH><TH className="hidden sm:table-cell">Fecha</TH><TH className="text-right">Acciones</TH>
        </tr></thead><tbody className="divide-y divide-gray-50">
          {list.length===0 ? <EmptyRow cols={5} text={search?"Sin resultados":"Sin resoluciones registradas"}/> : list.map(r => (
            <tr key={r.id} className={`hover:bg-gray-50/50 ${esResolucionCompensatorio(r)?"border-l-4 border-l-blue-400":""}`}>
              <td className="px-4 py-3 font-medium text-gray-900">{r.numero}</td>
              <td className="px-4 py-3">
                {esResolucionCompensatorio(r)
                  ? <Badge label="Compensatorio" color="blue"/>
                  : <Badge label="General" color="gray"/>}
              </td>
              <td className="px-4 py-3 text-gray-700">
                {esResolucionCompensatorio(r)
                  ? <span>{r.agente||"—"}</span>
                  : <span className="max-w-[200px] truncate block">{r.asunto}</span>}
              </td>
              <td className="px-4 py-3 text-gray-500 hidden sm:table-cell">{fmtDate(r.fecha)}</td>
              <td className="px-4 py-3 text-right">
                <div className="flex items-center justify-end gap-0.5">
                  <button onClick={()=>handleGenerar(r)} className="p-1.5 rounded-lg hover:bg-emerald-50 text-gray-400 hover:text-emerald-600 transition-colors" title="Generar documento">{printIcon}</button>
                  <button onClick={()=>openEdit(r)} className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400 hover:text-gray-600 transition-colors">{I.edit}</button>
                  <button onClick={()=>setDel(r.id)} className="p-1.5 rounded-lg hover:bg-rose-50 text-gray-400 hover:text-rose-500 transition-colors">{I.trash}</button>
                </div>
              </td>
            </tr>
          ))}
        </tbody></table>
      </div></div>
      <Modal open={modal} onClose={()=>setModal(false)} title={editing?"Editar resolución":"Nueva resolución"} wide>
        <div className="grid grid-cols-2 gap-4">
          <Field label="N° de Resolución"><input className={inp} value={form.numero} onChange={e=>f("numero",e.target.value)} placeholder="Ej: 0123/2026"/></Field>
          <Field label="Fecha"><input type="date" className={inp} value={form.fecha} onChange={e=>f("fecha",e.target.value)}/></Field>
          <Field label="Tipo de resolución" span2>
            <select className={sel} value={form.tipoResolucion} onChange={e=>f("tipoResolucion",e.target.value)}>
              <option value="general">General</option>
              <option value="compensatorio">Descanso compensatorio — se vincula automáticamente con Descansos Compensatorios</option>
            </select>
          </Field>

          {esComp ? (
            <>
              {/* Campos específicos de compensatorio */}
              <Field label="Nombre del agente" span2><input className={inp} value={form.agente||""} onChange={e=>f("agente",e.target.value)} placeholder="Nombre completo del agente"/></Field>
              <Field label="N° de afiliado"><input className={inp} value={form.afiliado||""} onChange={e=>f("afiliado",e.target.value)} placeholder="N° afiliado"/></Field>
              <div className="col-span-2">
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-[11px] font-semibold text-gray-500 uppercase tracking-wider">Fecha(s) del descanso</span>
                  <button onClick={addFechaR} className="flex items-center gap-1 text-xs font-semibold text-emerald-600 hover:text-emerald-700">{I.plus} Agregar fecha</button>
                </div>
                <div className="space-y-2">
                  {(form.fechas||[""]).map((f2, i) => (
                    <div key={i} className="flex gap-2 items-center">
                      <input type="date" className={inp+" flex-1"} value={f2} onChange={e=>setFechaR(i,e.target.value)}/>
                      {(form.fechas||[]).length > 1 && <button onClick={()=>removeFechaR(i)} className="p-1.5 rounded-lg hover:bg-rose-50 text-gray-300 hover:text-rose-400">{I.trash}</button>}
                    </div>
                  ))}
                </div>
              </div>
              <div className="col-span-2 p-3 bg-blue-50 rounded-xl border border-blue-100">
                <p className="text-xs text-blue-700 font-semibold">Este registro aparecerá automáticamente en Descansos Compensatorios — es el mismo registro, sin duplicados.</p>
              </div>
            </>
          ) : (
            <>
              <Field label="Asunto (Visto)" span2><textarea className={inp+" resize-none"} rows={2} value={form.asunto} onChange={e=>f("asunto",e.target.value)} placeholder="Asunto de la resolución"/></Field>
              <Field label="Considerando (texto del cuerpo)" span2><textarea className={inp+" resize-none"} rows={4} value={form.cuerpo||""} onChange={e=>f("cuerpo",e.target.value)} placeholder="Desarrollo de la resolución. Cada párrafo en una línea."/></Field>
            </>
          )}
          <Field label="Observaciones internas" span2><textarea className={inp+" resize-none"} rows={2} value={form.observaciones} onChange={e=>f("observaciones",e.target.value)} placeholder="Notas internas (no se imprimen)"/></Field>
        </div>
        <div className="flex justify-between mt-6">
          <button onClick={()=>{ if(form.numero.trim()) handleGenerar(form); }} className="flex items-center gap-2 px-4 py-2.5 text-sm font-medium text-emerald-700 bg-emerald-50 rounded-xl hover:bg-emerald-100 transition-colors">{printIcon} Vista previa</button>
          <div className="flex gap-3">
            <button onClick={()=>setModal(false)} className="px-4 py-2.5 text-sm font-medium text-gray-600 bg-gray-100 rounded-xl hover:bg-gray-200 transition-colors">Cancelar</button>
            <button onClick={save} className="px-5 py-2.5 text-sm font-semibold text-white bg-emerald-600 rounded-xl hover:bg-emerald-700 transition-colors">Guardar</button>
          </div>
        </div>
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
