"use client";
import { useEffect, useState, useRef } from "react";
import Link from "next/link";
import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { formatRupiah } from "@/lib/utils";
import { TopBar } from "@/components/stitch/TopBar";
import { Avatar } from "@/components/ui/Avatar";
import { AlertTriangle, CheckCircle, Trash2, Pencil, Search, FileSpreadsheet, RectangleVertical, RectangleHorizontal, X, WifiOff, CloudUpload } from "lucide-react";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { enqueueGuest, flushOfflineQueue, getPendingCount, startBackgroundSync, QUEUE_KEY, LAST_SYNC_KEY } from "@/lib/offline-sync";

type Member = { id: string; role: string; user: { id: string; name: string; username?: string | null; email: string; image?: string | null; avatar?: string | null; profilePicture?: string | null } };
type GuestBook = { id: string; nama: string; alamat: string };
type Guest = { id: string; nama: string; alamat: string; nominal: number; metode: string; catatan?: string; createdAt: string; petugasId: string; mejaLabel?: string | null; kodeInput?: string | null };
type Rekap = { totalTamu: number; totalNominal: number; perAlamat: { alamat: string; jumlah: number; total: number }[]; perMetode: { metode: string; jumlah: number; total: number }[]; perMeja: { mejaLabel: string; jumlah: number; total: number }[]; perKasir: { petugasId: string; name: string; email: string; jumlah: number; total: number }[] };
type Audit = { id: string; aksi: string; targetId?: string | null; detail?: Record<string, unknown> | null; createdAt: string; user: { id: string; name: string; email: string } };

function toTitleCasePerKata(s: string) {
  return s.trim().toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase());
}

// Reusable class strings — mobile lebih ramping (h-10), desktop h-11
const inputCls = "w-full h-10 sm:h-11 px-3 sm:px-4 rounded-xl border border-[var(--outline-variant)] bg-[var(--surface-container-lowest)] text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent transition-shadow placeholder:text-[var(--on-surface-variant)]";
const labelCls = "text-[11px] sm:text-xs font-medium text-[var(--on-surface-variant)] uppercase tracking-wide";
const DEFAULT_NOMINALS = [50000, 100000, 200000] as const;

function Chip({ children, active, highlighted, onClick, onMouseEnter, onMouseLeave, id }: { children: React.ReactNode; active?: boolean; highlighted?: boolean; onClick?: () => void; onMouseEnter?: () => void; onMouseLeave?: () => void; id?: string }) {
  return (
    <button
      id={id}
      type="button"
      tabIndex={-1}
      onClick={onClick}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
      className={`h-8 px-3 rounded-xl text-xs font-medium border transition-colors ${
        active
          ? "bg-emerald-600 text-white border-emerald-600"
          : highlighted
            ? "bg-emerald-50 dark:bg-emerald-900/20 border-emerald-400 dark:border-emerald-600 text-emerald-700 dark:text-emerald-300 ring-1 ring-emerald-300"
            : "bg-[var(--surface-container)] text-[var(--on-surface)] border-[var(--outline-variant)] hover:border-emerald-300 hover:text-emerald-700 hover:bg-emerald-50 dark:hover:bg-emerald-900/10 dark:hover:border-emerald-700 dark:hover:text-emerald-400"
      }`}
    >
      {children}
    </button>
  );
}

function Modal({ children, onClose }: { children: React.ReactNode; onClose: () => void }) {
  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4 z-50">
      <div className="relative w-full max-w-md">
        <button
          onClick={onClose}
          className="absolute -top-10 right-0 w-8 h-8 rounded-full bg-white/10 text-white flex items-center justify-center hover:bg-white/20 transition-colors"
        >
          <X size={16} />
        </button>
        {children}
      </div>
    </div>
  );
}

function Pagination({ page, totalPages, total, limit, onPage }: { page: number; totalPages: number; total: number; limit: number; onPage: (n: number) => void }) {
  if (totalPages <= 1) return null;
  return (
    <div className="flex flex-wrap justify-between items-center gap-2 text-xs text-[var(--on-surface-variant)]">
      <span>{(page - 1) * limit + 1}–{Math.min(page * limit, total)} dari {total}</span>
      <div className="flex items-center gap-1">
        <button disabled={page === 1} onClick={() => onPage(Math.max(1, page - 1))} className="h-7 px-2.5 rounded-lg border border-[var(--outline-variant)] bg-[var(--surface-container-lowest)] disabled:opacity-40 text-xs hover:bg-[var(--surface-container)] transition-colors">← Prev</button>
        {Array.from({ length: Math.min(totalPages, 5) }, (_, i) => {
          let n: number;
          if (totalPages <= 5) n = i + 1;
          else if (page <= 3) n = i + 1;
          else if (page >= totalPages - 2) n = totalPages - 4 + i;
          else n = page - 2 + i;
          return (
            <button key={n} onClick={() => onPage(n)} className={`w-7 h-7 rounded-lg border text-xs font-medium transition-colors ${page === n ? "bg-emerald-600 text-white border-emerald-600" : "bg-[var(--surface-container-lowest)] border-[var(--outline-variant)] text-[var(--on-surface)] hover:bg-[var(--surface-container)]"}`}>{n}</button>
          );
        })}
        <button disabled={page === totalPages} onClick={() => onPage(Math.min(totalPages, page + 1))} className="h-7 px-2.5 rounded-lg border border-[var(--outline-variant)] bg-[var(--surface-container-lowest)] disabled:opacity-40 text-xs hover:bg-[var(--surface-container)] transition-colors">Next →</button>
      </div>
    </div>
  );
}

type Tab = "pemberian" | "buku" | "rekap" | "setting";
const VALID_TABS: readonly Tab[] = ["pemberian", "buku", "rekap", "setting"] as const;

export default function EventClient({ eventId, userEmail, userName, initialTab = "pemberian" }: { eventId: string; userEmail: string; userName: string; initialTab?: Tab }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const LIMIT = 50;
  const [event, setEvent] = useState<{ id: string; namaAcara: string; namaTuanRumah?: string | null; tanggal: string; lokasi?: string | null; catatan?: string | null; mejaList?: string[]; myRole: string; mode?: string; isOffline?: boolean; localOnly?: boolean; lastSyncAt?: string | null } | null>(null);
  const [tab, setTab] = useState<Tab>(initialTab);
  const [loading, setLoading] = useState(true);
  const [mejaLabel, setMejaLabel] = useState<string | null>(null);
  const [autoSync, setAutoSync] = useState(true);
  const [isSyncing, setIsSyncing] = useState(false);
  const [lastSyncAt, setLastSyncAt] = useState<string | null>(null);
  const [pendingCount, setPendingCount] = useState(0);
  const [isOfflineMode, setIsOfflineMode] = useState(false);
  const [hideNominal, setHideNominal] = useState(() => {
    if (typeof window !== "undefined") {
      try {
        return localStorage.getItem(`hideNominal:${eventId}`) === "true";
      } catch { return false; }
    }
    return false;
  });

  const [nama, setNama] = useState("");
  const [alamat, setAlamat] = useState("");
  const [nominalStr, setNominalStr] = useState("");
  const [metode, setMetode] = useState("AMPLOP");
  const [catatan, setCatatan] = useState("");
  const [suggest, setSuggest] = useState<{ nama: string; alamat: string; source: string }[]>([]);
  const [suggestHighlighted, setSuggestHighlighted] = useState(-1);
  const [suggestOpen, setSuggestOpen] = useState(true);
  const justSelectedRef = useRef(false);
  const namaInputRef = useRef<HTMLInputElement>(null);
  const suggestWrapRef = useRef<HTMLDivElement>(null);
  const bookNamaInputRef = useRef<HTMLInputElement>(null);
  const nominalInputRef = useRef<HTMLInputElement>(null);
  const [nominalHighlighted, setNominalHighlighted] = useState(-1);
  const [shortcuts, setShortcuts] = useState<{ alamatTop: { alamat: string; jumlah: number }[]; nominalTop: { nominal: number; jumlah: number }[] }>({ alamatTop: [], nominalTop: [] });
  const [guests, setGuests] = useState<Guest[]>([]);
  const [guestTotal, setGuestTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState("createdAt");
  const [order, setOrder] = useState("desc");

  const [books, setBooks] = useState<GuestBook[]>([]);
  const [bookTotal, setBookTotal] = useState(0);
  const [bookTotalPages, setBookTotalPages] = useState(1);
  const [bookPage, setBookPage] = useState(1);
  const [bookNama, setBookNama] = useState("");
  const [bookAlamat, setBookAlamat] = useState("");
  const [bookSearch, setBookSearch] = useState("");
  const [editBook, setEditBook] = useState<GuestBook | null>(null);
  const [editBookData, setEditBookData] = useState({ nama: "", alamat: "" });

  const [members, setMembers] = useState<Member[]>([]);
  const [searchUser, setSearchUser] = useState("");
  const [searchResults, setSearchResults] = useState<{ id: string; name: string; username?: string | null; email: string; image?: string | null; avatar?: string | null; profilePicture?: string | null }[]>([]);
  const [addRole, setAddRole] = useState("VIEWER");

  const [rekap, setRekap] = useState<Rekap | null>(null);
  const [exportOrder, setExportOrder] = useState("nama_az");
  const [exportModal, setExportModal] = useState(false);
  const [exportType, setExportType] = useState<"tamu" | "pemberian">("pemberian");
  const [exportOrientation, setExportOrientation] = useState<"portrait" | "landscape">("landscape");

  const [liveDup, setLiveDup] = useState<null | { nama: string; alamat: string; nominalFormatted: string; nominal: number; metode: string }>(null);
  const [dupModal, setDupModal] = useState<null | { existing: { nama: string; alamat: string; nominalFormatted: string; nominal: number; metode: string; createdAt: string }; message: string }>(null);
  const [dupNote, setDupNote] = useState("");

  const [editMode, setEditMode] = useState(false);
  const [editNama, setEditNama] = useState("");
  const [editNamaTuanRumah, setEditNamaTuanRumah] = useState("");
  const [editTanggal, setEditTanggal] = useState("");
  const [editLokasi, setEditLokasi] = useState("");
  const [editCatatan, setEditCatatan] = useState("");
  const [auditLogs, setAuditLogs] = useState<Audit[]>([]);
  const [logSearch, setLogSearch] = useState("");
  const [selectedLog, setSelectedLog] = useState<Audit | null>(null);
  const [newMeja, setNewMeja] = useState("");
  const [mejaFilter, setMejaFilter] = useState<string | null>(null);
  const [kasirFilter, setKasirFilter] = useState<string | null>(null);

  const [editGuest, setEditGuest] = useState<Guest | null>(null);
  const [editGuestData, setEditGuestData] = useState({ nama: "", alamat: "", nominal: "", metode: "AMPLOP", catatan: "" });

  useEffect(() => {
    if (!event) return;
    const key = `mejaLabel:${eventId}:${userEmail}`;
    const saved = localStorage.getItem(key);
    if (saved && event.mejaList?.includes(saved)) { setMejaLabel(saved); return; }
    if (rekap?.perMeja) {
      const unused = event.mejaList?.find((m) => !rekap.perMeja.some((p) => p.mejaLabel === m));
      if (unused) { setMejaLabel(unused); return; }
      const sorted = [...rekap.perMeja].sort((a, b) => a.jumlah - b.jumlah);
      if (sorted[0]) { setMejaLabel(sorted[0].mejaLabel); return; }
    }
    if (event.mejaList?.[0] && !saved) setMejaLabel(event.mejaList[0]);
  }, [event, rekap, userEmail, eventId]);

  useEffect(() => {
    if (!mejaLabel) return;
    localStorage.setItem(`mejaLabel:${eventId}:${userEmail}`, mejaLabel);
  }, [mejaLabel, eventId, userEmail]);

  useEffect(() => {
    const saved = localStorage.getItem(`autoSync:${eventId}`);
    if (saved !== null) setAutoSync(JSON.parse(saved));
  }, [eventId]);
  useEffect(() => { localStorage.setItem(`autoSync:${eventId}`, JSON.stringify(autoSync)); }, [autoSync, eventId]);

  useEffect(() => { try { localStorage.setItem(`hideNominal:${eventId}`, String(hideNominal)); } catch {} }, [hideNominal, eventId]);
  // sync when switching events (lazy init covers first mount, this covers eventId change)
  useEffect(() => {
    try {
      const s = localStorage.getItem(`hideNominal:${eventId}`);
      if (s !== null) setHideNominal(s === "true");
    } catch {}
  }, [eventId]);

  async function loadEvent() {
    const res = await fetch(`/api/events/${eventId}`);
    if (res.ok) {
      const j = await res.json();
      setEvent(j);
      setIsOfflineMode(!!j.isOffline || j.mode === "OFFLINE");
      setEditNama(j.namaAcara);
      setEditNamaTuanRumah(j.namaTuanRumah || "");
      setEditTanggal(new Date(j.tanggal).toISOString().slice(0, 10));
      setEditLokasi(j.lokasi || "");
      setEditCatatan(j.catatan || "");
    }
  }
  async function loadGuests() {
    const qs = new URLSearchParams({ q: search, sort, order, page: String(page), limit: "50" });
    if (mejaFilter) qs.set("meja", mejaFilter);
    if (kasirFilter) qs.set("kasir", kasirFilter);
    const res = await fetch(`/api/events/${eventId}/guests?${qs}`);
    if (res.ok) { const j = await res.json(); setGuests(j.data); setGuestTotal(j.total); setTotalPages(j.totalPages || 1); }
  }
  async function loadShortcuts() { const res = await fetch(`/api/events/${eventId}/guests/shortcuts`); if (res.ok) setShortcuts(await res.json()); }
  async function loadBooks() {
    const qs = new URLSearchParams({ q: bookSearch, page: String(bookPage), limit: String(LIMIT) });
    const res = await fetch(`/api/events/${eventId}/guestbooks?${qs}`);
    if (res.ok) {
      const j = await res.json();
      if (Array.isArray(j)) { setBooks(j); setBookTotal(j.length); setBookTotalPages(1); }
      else { setBooks(j.data); setBookTotal(j.total); setBookTotalPages(j.totalPages); }
    }
  }
  async function loadMembers() { const res = await fetch(`/api/events/${eventId}/members`); if (res.ok) setMembers(await res.json()); }
  async function loadRekap() { const res = await fetch(`/api/events/${eventId}/rekap`); if (res.ok) setRekap(await res.json()); }
  function updateTab(next: Tab) {
    setTab(next);
    const params = new URLSearchParams(searchParams.toString());
    params.set("tab", next);
    router.replace(`${pathname}?${params.toString()}`, { scroll: false });
  }

  async function loadAudit(q?: string) { const qs = q !== undefined ? `?limit=30&q=${encodeURIComponent(q)}` : `?limit=30${logSearch ? `&q=${encodeURIComponent(logSearch)}` : ""}`; const res = await fetch(`/api/events/${eventId}/audit-logs${qs}`); if (res.ok) { const j = await res.json(); setAuditLogs(j.logs); } }

  const handleRefresh = async () => {
    setIsSyncing(true);
    // flush offline queue in background without blocking refresh
    if (pendingCount > 0 && navigator.onLine) {
      flushOfflineQueue(eventId).then((r) => {
        if (r.flushed) {
          setPendingCount(getPendingCount(eventId));
          loadGuests(); loadRekap();
        }
      });
    }
    await Promise.all([loadGuests(), loadRekap(), loadBooks(), loadShortcuts()]);
    try { localStorage.setItem(LAST_SYNC_KEY(eventId), new Date().toISOString()); } catch {}
    setLastSyncAt(new Date().toLocaleTimeString("id-ID"));
    setIsSyncing(false);
  };

  const handleSyncToServer = async () => {
    if (isSyncing) return;
    setIsSyncing(true);
    try {
      // flush queued guests
      const qRes = await flushOfflineQueue(eventId);
      if (qRes.error && qRes.error !== "offline") alert(qRes.error);
      setPendingCount(getPendingCount(eventId));
      // if event is offline, try to push event itself to server to unlock members
      if (isOfflineMode && event) {
        const evRes = await fetch(`/api/sync/push`, {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ events: [{ id: event.id, namaAcara: event.namaAcara, namaTuanRumah: event.namaTuanRumah, tanggal: event.tanggal, lokasi: event.lokasi, catatan: event.catatan, mejaList: event.mejaList, mode: "ONLINE" }] }),
        });
        if (evRes.ok) {
          await fetch(`/api/events/${eventId}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ mode: "ONLINE" }) }).catch(() => {});
          setIsOfflineMode(false);
          loadEvent();
        }
      }
      await Promise.all([loadGuests(), loadRekap(), loadBooks(), loadShortcuts()]);
      setLastSyncAt(new Date().toLocaleTimeString("id-ID"));
      try { localStorage.setItem(LAST_SYNC_KEY(eventId), new Date().toISOString()); } catch {}
    } finally { setIsSyncing(false); }
  };

  useEffect(() => {
    loadEvent().then(() => setLoading(false));
    loadGuests(); loadShortcuts(); loadBooks(); loadMembers(); loadRekap();
    try { setPendingCount(getPendingCount(eventId)); const ls = localStorage.getItem(LAST_SYNC_KEY(eventId)); if (ls) setLastSyncAt(new Date(ls).toLocaleTimeString("id-ID")); } catch {}
  }, []);
  useEffect(() => {
    const off = startBackgroundSync(eventId, (r) => {
      if (r.flushed) {
        setPendingCount(getPendingCount(eventId));
        setLastSyncAt(new Date().toLocaleTimeString("id-ID"));
        loadGuests(); loadRekap();
      }
    });
    const handler = (e: Event) => {
      const ce = e as CustomEvent;
      if (ce.detail?.eventId === eventId) setPendingCount(ce.detail.count);
    };
    window.addEventListener("offline-queue-changed", handler as EventListener);
    return () => { off(); window.removeEventListener("offline-queue-changed", handler as EventListener); };
  }, [eventId]);
  useEffect(() => { loadGuests(); }, [search, sort, order, mejaFilter, kasirFilter, page]);
  useEffect(() => { setPage(1); }, [search, mejaFilter, kasirFilter]);
  useEffect(() => { loadBooks(); }, [bookSearch, bookPage]);
  useEffect(() => { setBookPage(1); }, [bookSearch]);
  useEffect(() => { if (tab === "rekap") loadRekap(); if (tab === "setting") loadAudit(); }, [tab]);
  useEffect(() => {
    if (tab !== "setting") return;
    const t = setTimeout(() => loadAudit(logSearch), 300);
    return () => clearTimeout(t);
  }, [logSearch]);
  useEffect(() => {
    const q = searchParams.get("tab") as Tab | null;
    if (q && VALID_TABS.includes(q) && q !== tab) setTab(q);
  }, [searchParams]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey) {
        if (e.key === "1") { e.preventDefault(); updateTab("pemberian"); }
        if (e.key === "2") { e.preventDefault(); updateTab("buku"); }
        if (e.key === "3") { e.preventDefault(); updateTab("rekap"); }
        if (e.key === "4") { e.preventDefault(); updateTab("setting"); }
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [searchParams, pathname]);

  useEffect(() => {
    if (justSelectedRef.current) { justSelectedRef.current = false; return; }
    if (!suggestOpen) return;
    if (nama.length < 2) { setSuggest([]); setSuggestHighlighted(-1); return; }
    const controller = new AbortController();
    const t = setTimeout(async () => {
      try {
        const res = await fetch(`/api/events/${eventId}/guests/suggest?q=${encodeURIComponent(nama)}`, { signal: controller.signal });
        if (res.ok) {
          const data = await res.json();
          if (!controller.signal.aborted) {
            setSuggest(data);
            setSuggestHighlighted(data.length > 0 ? 0 : -1);
          }
        }
      } catch { /* aborted */ }
    }, 250);
    return () => { clearTimeout(t); controller.abort(); };
  }, [nama, suggestOpen, eventId]);

  // tutup dropdown saat klik di luar
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (suggestWrapRef.current && !suggestWrapRef.current.contains(target)) {
        setSuggest([]); setSuggestOpen(false); setSuggestHighlighted(-1);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const nominalOptions = (() => {
    const merged = [...shortcuts.nominalTop.map((n) => n.nominal), ...DEFAULT_NOMINALS];
    return Array.from(new Set(merged)).sort((a, b) => a - b).slice(0, 6);
  })();

  function selectSuggest(s: { nama: string; alamat: string }) {
    justSelectedRef.current = true;
    setNama(s.nama);
    setAlamat(s.alamat);
    setSuggest([]);
    setSuggestHighlighted(-1);
    setSuggestOpen(false);
    requestAnimationFrame(() => nominalInputRef.current?.focus());
  }

  useEffect(() => { setNominalHighlighted(-1); }, [nominalStr]);

  useEffect(() => {
    if (searchUser.length < 2) { setSearchResults([]); return; }
    const t = setTimeout(async () => { const res = await fetch(`/api/users/search?q=${encodeURIComponent(searchUser)}`); if (res.ok) setSearchResults(await res.json()); }, 300);
    return () => clearTimeout(t);
  }, [searchUser]);

  useEffect(() => {
    if (nama.trim().length < 2 || alamat.trim().length < 2) { setLiveDup(null); return; }
    const t = setTimeout(async () => {
      const qs = new URLSearchParams({ nama: nama.trim(), alamat: alamat.trim() });
      const res = await fetch(`/api/events/${eventId}/guests/check?${qs}`);
      if (res.ok) { const j = await res.json(); if (j.exists) setLiveDup(j.existing); else setLiveDup(null); }
    }, 400);
    return () => clearTimeout(t);
  }, [nama, alamat]);

  async function handleSubmitPemberian(e: React.FormEvent) {
    e.preventDefault();
    const nominal = parseInt(nominalStr.replace(/\D/g, ""), 10);
    if (!nominal || nominal <= 0) { alert("Nominal harus >0"); return; }
    const effectiveMeja = mejaLabel || event?.mejaList?.[0] || "MEJA-1";
    const deviceId = localStorage.getItem("deviceId") || (localStorage.setItem("deviceId", Math.random().toString(36).slice(2)), localStorage.getItem("deviceId")!);
    const kodeInput = `${effectiveMeja}-${Date.now().toString().slice(-6)}`;
    // Offline queue: if navigator offline, enqueue locally and optimistically update
    if (!navigator.onLine) {
      const localId = `local-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
      enqueueGuest(eventId, { id: localId, eventId, nama: toTitleCasePerKata(nama), alamat: toTitleCasePerKata(alamat), nominal, metode, catatan: catatan || null, mejaLabel: effectiveMeja, kodeInput, deviceId, createdAt: new Date().toISOString() });
      setPendingCount(getPendingCount(eventId));
      setNama(""); setAlamat(""); setNominalStr(""); setCatatan(""); setSuggest([]); setLiveDup(null);
      // optimistic local list
      setGuests((prev) => [{ id: localId, nama: toTitleCasePerKata(nama), alamat: toTitleCasePerKata(alamat), nominal, metode, catatan, createdAt: new Date().toISOString(), petugasId: "local", mejaLabel: effectiveMeja, kodeInput }, ...prev]);
      return;
    }
    const res = await fetch(`/api/events/${eventId}/guests`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ nama: toTitleCasePerKata(nama), alamat: toTitleCasePerKata(alamat), nominal, metode, catatan, mejaLabel: effectiveMeja, kodeInput, deviceId }),
    });
    let data: Record<string, unknown> = {};
    try { data = await res.json(); } catch { data = {}; }
    if (res.status === 409 && (data as { error?: string }).error === "DUPLICATE_NEED_NOTE") { setDupNote(catatan); setDupModal({ existing: (data as { existing: { nama: string; alamat: string; nominalFormatted: string; nominal: number; metode: string; createdAt: string } }).existing, message: (data as { message: string }).message }); return; }
    if (!res.ok) {
      // network/server error -> fallback to queue if offline-like
      if (!navigator.onLine || res.status >= 500) {
        const localId = `local-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
        enqueueGuest(eventId, { id: localId, eventId, nama: toTitleCasePerKata(nama), alamat: toTitleCasePerKata(alamat), nominal, metode, catatan: catatan || null, mejaLabel: effectiveMeja, kodeInput, deviceId, createdAt: new Date().toISOString() });
        setPendingCount(getPendingCount(eventId));
        setNama(""); setAlamat(""); setNominalStr(""); setCatatan(""); setSuggest([]); setLiveDup(null);
        return;
      }
      alert((data as { error?: string; message?: string }).error || (data as { message?: string }).message || `Gagal (${res.status})`); return;
    }
    setNama(""); setAlamat(""); setNominalStr(""); setCatatan(""); setSuggest([]); setLiveDup(null);
    loadGuests(); loadShortcuts(); loadRekap();
    if (autoSync) setLastSyncAt(new Date().toLocaleTimeString("id-ID"));
    try { localStorage.setItem(LAST_SYNC_KEY(eventId), new Date().toISOString()); } catch {}
  }

  async function handleSubmitDuplicate() {
    if (!dupModal) return;
    if (!dupNote.trim()) { alert("Catatan wajib untuk bedakan duplikat"); return; }
    const nominal = parseInt(nominalStr.replace(/\D/g, ""), 10);
    const effectiveMeja = mejaLabel || event?.mejaList?.[0] || "MEJA-1";
    const deviceId = localStorage.getItem("deviceId")!;
    const kodeInput = `${effectiveMeja}-${Date.now().toString().slice(-6)}`;
    const res = await fetch(`/api/events/${eventId}/guests`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ nama: toTitleCasePerKata(nama), alamat: toTitleCasePerKata(alamat), nominal, metode, catatan: dupNote, mejaLabel: effectiveMeja, kodeInput, deviceId }),
    });
    let data: Record<string, unknown> = {};
    try { data = await res.json(); } catch { data = {}; }
    if (!res.ok) { alert((data as { error?: string }).error || "Gagal"); return; }
    setDupModal(null); setDupNote("");
    setNama(""); setAlamat(""); setNominalStr(""); setCatatan(""); setSuggest([]); setLiveDup(null);
    loadGuests(); loadShortcuts(); loadRekap();
    if (autoSync) setLastSyncAt(new Date().toLocaleTimeString("id-ID"));
  }

  async function handleAddBook(e: React.FormEvent) { e.preventDefault(); const res = await fetch(`/api/events/${eventId}/guestbooks`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ nama: toTitleCasePerKata(bookNama), alamat: toTitleCasePerKata(bookAlamat) }) }); if (res.ok) { setBookNama(""); setBookAlamat(""); loadBooks(); } }
  function openEditBook(b: GuestBook) { setEditBook(b); setEditBookData({ nama: b.nama, alamat: b.alamat }); }
  async function handleUpdateBook(e: React.FormEvent) {
    e.preventDefault();
    if (!editBook) return;
    const res = await fetch(`/api/guestbooks/${editBook.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ nama: toTitleCasePerKata(editBookData.nama), alamat: toTitleCasePerKata(editBookData.alamat) }) });
    let data: Record<string, unknown> = {};
    try { data = await res.json(); } catch { data = {}; }
    if (!res.ok) { alert((data as { error?: string }).error || "Gagal update"); return; }
    setEditBook(null); loadBooks();
  }
  async function handleAddMember(userId: string) { const res = await fetch(`/api/events/${eventId}/members`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ userId, role: addRole }) }); let data: Record<string, unknown> = {}; try { data = await res.json(); } catch { data = {}; } if (!res.ok) { alert((data as { error?: string }).error || "Gagal"); return; } setSearchUser(""); setSearchResults([]); loadMembers(); }
  async function handleDeleteGuest(id: string) { if (!confirm("Hapus data ini?")) return; await fetch(`/api/guests/${id}`, { method: "DELETE" }); loadGuests(); loadShortcuts(); loadRekap(); }
  function openEditGuest(g: Guest) { setEditGuest(g); setEditGuestData({ nama: g.nama, alamat: g.alamat, nominal: String(g.nominal), metode: g.metode, catatan: g.catatan || "" }); }
  async function handleUpdateGuest(e: React.FormEvent) {
    e.preventDefault();
    if (!editGuest) return;
    const nominal = parseInt(editGuestData.nominal.replace(/\D/g, ""), 10);
    if (!nominal || nominal <= 0) { alert("Nominal harus >0"); return; }
    const res = await fetch(`/api/guests/${editGuest.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ nama: toTitleCasePerKata(editGuestData.nama), alamat: toTitleCasePerKata(editGuestData.alamat), nominal, metode: editGuestData.metode, catatan: editGuestData.catatan }) });
    let data: Record<string, unknown> = {};
    try { data = await res.json(); } catch { data = {}; }
    if (!res.ok) { alert((data as { error?: string }).error || "Gagal update"); return; }
    setEditGuest(null); loadGuests(); loadShortcuts(); loadRekap(); loadAudit();
  }
  async function handleUpdateEvent(e: React.FormEvent) {
    e.preventDefault();
    if (!editNamaTuanRumah.trim() || editNamaTuanRumah.trim().length < 2) { alert("Nama tuan rumah wajib minimal 2 huruf"); return; }
    const res = await fetch(`/api/events/${eventId}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ namaAcara: editNama, namaTuanRumah: toTitleCasePerKata(editNamaTuanRumah), tanggal: editTanggal, lokasi: editLokasi, catatan: editCatatan }) });
    if (!res.ok) { const j = await res.json(); alert(j.error || "Gagal update"); return; }
    setEditMode(false); loadEvent(); loadAudit();
  }

  async function handleExport(type: "excel" | "pdf") {
    const orientation = exportOrientation;
    if (exportType === "tamu") {
      const res = await fetch(`/api/events/${eventId}/guestbooks?limit=1000&export=true`);
      if (!res.ok) return;
      const data: GuestBook[] = await res.json();
      const list = Array.isArray(data) ? data : (data as unknown as { data: GuestBook[] }).data || [];
      let sorted = [...list];
      if (exportOrder === "nama_az") sorted.sort((a, b) => a.nama.localeCompare(b.nama));
      if (exportOrder === "nama_za") sorted.sort((a, b) => b.nama.localeCompare(a.nama));
      if (exportOrder === "alamat_az") sorted.sort((a, b) => a.alamat.localeCompare(b.alamat) || a.nama.localeCompare(b.nama));
      const totalTamu = sorted.length;
      if (type === "excel") {
        let csv = `Laporan Buku Tamu: ${event?.namaAcara || "Acara"}\nTanggal Export: ${new Date().toLocaleString("id-ID")}\nTotal: ${totalTamu} tamu\n\nNo,Nama,Alamat\n`;
        sorted.forEach((g, i) => { csv += `${i + 1},"${g.nama}","${g.alamat}"\n`; });
        csv += `\nTOTAL,${totalTamu} tamu\n`;
        const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" }); const url = URL.createObjectURL(blob); const a = document.createElement("a"); a.href = url; a.download = `${event?.namaAcara || "acara"}-buku-tamu-${new Date().toISOString().slice(0, 10)}.csv`; a.click(); URL.revokeObjectURL(url);
        setExportModal(false); return;
      }
      const perPage = orientation === "landscape" ? 30 : 42;
      const totalPagesNeeded = Math.max(1, Math.ceil(sorted.length / perPage));
      const totalRows = totalPagesNeeded * perPage;
      const padded: (GuestBook | null)[] = [...sorted];
      while (padded.length < totalRows) padded.push(null);
      const body = padded.map((g, idx) => { if (!g) return ["", "", ""]; return [String(idx + 1), g.nama, g.alamat]; });
      const doc = new jsPDF({ orientation, unit: "mm", format: "a4" });
      const pageW = doc.internal.pageSize.getWidth();
      const pageH = doc.internal.pageSize.getHeight();
      const margin = { top: 8, bottom: 12, left: 8, right: 8 };
      autoTable(doc, {
        startY: 18, head: [["No", "Nama", "Alamat"]], body, foot: [["", "TOTAL", `${totalTamu} tamu`]], showFoot: "lastPage", theme: "grid",
        headStyles: { fillColor: [16, 185, 129], textColor: 255, fontStyle: "bold", halign: "center", fontSize: 8, lineColor: [16, 185, 129] },
        bodyStyles: { fontSize: 8, cellPadding: 2.2, valign: "middle", lineColor: [210, 210, 210], lineWidth: 0.2 },
        footStyles: { fillColor: [236, 253, 245], textColor: [6, 95, 70], fontStyle: "bold", fontSize: 8, halign: "left" },
        alternateRowStyles: { fillColor: [249, 250, 251] },
        columnStyles: { 0: { halign: "center", cellWidth: 12 }, 1: { cellWidth: pageW - margin.left - margin.right - 12 - (pageW * 0.35) }, 2: { cellWidth: pageW * 0.35 } },
        margin,
        didDrawPage: (data) => {
          if (data.pageNumber === 1) { doc.setFontSize(11); doc.setFont("helvetica", "bold"); doc.setTextColor(17, 24, 39); doc.text(`${event?.namaAcara || "Acara"} Buku Tamu`, margin.left, 10); doc.setFontSize(6.5); doc.setFont("helvetica", "normal"); doc.setTextColor(100); doc.text(`${new Date().toLocaleString("id-ID")} | ${userName} | ${totalTamu} tamu`, margin.left, 14, { maxWidth: pageW - margin.left - margin.right }); }
          doc.setFontSize(6.5); doc.setTextColor(120); doc.text(`Halaman ${data.pageNumber} / ${totalPagesNeeded}`, pageW - margin.right, pageH - 6, { align: "right" });
        },
        willDrawCell: (data) => { if (data.section === "body" && data.row.index >= sorted.length) { data.cell.styles.textColor = [255, 255, 255]; data.cell.styles.fillColor = [255, 255, 255]; data.cell.styles.lineColor = [230, 230, 230]; } },
      });
      doc.save(`${event?.namaAcara || "acara"}-buku-tamu-${orientation}-${new Date().toISOString().slice(0, 10)}.pdf`);
      setExportModal(false); return;
    }
    const res = await fetch(`/api/events/${eventId}/guests?limit=1000&export=true`);
    if (!res.ok) return;
    const j = await res.json();
    const data: Guest[] = j.data;
    let sorted = [...data];
    if (exportOrder === "nama_az") sorted.sort((a, b) => a.nama.localeCompare(b.nama));
    if (exportOrder === "nama_za") sorted.sort((a, b) => b.nama.localeCompare(a.nama));
    if (exportOrder === "alamat_az") sorted.sort((a, b) => a.alamat.localeCompare(b.alamat) || a.nama.localeCompare(b.nama));
    if (exportOrder === "nominal_desc") sorted.sort((a, b) => b.nominal - a.nominal);
    if (exportOrder === "waktu_desc") sorted.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    const totalNominalExport = sorted.reduce((s, g) => s + g.nominal, 0);
    const totalTamuExport = sorted.length;
    if (type === "excel") {
      let csv = `Laporan Pemberian: ${event?.namaAcara || "Acara"}\nTanggal Export: ${new Date().toLocaleString("id-ID")}\nTotal: ${totalTamuExport} tamu, ${formatRupiah(totalNominalExport)}\n\nNo,Nama,Alamat,Nominal,Metode,Meja,Catatan,Waktu\n`;
      sorted.forEach((g, i) => { csv += `${i + 1},"${g.nama}","${g.alamat}",${g.nominal},${g.metode},${g.mejaLabel || ""},"${(g.catatan || "").replace(/"/g, '""')}",${g.createdAt}\n`; });
      csv += `\nTOTAL,,,${totalNominalExport},,,${totalTamuExport} tamu\n`;
      const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" }); const url = URL.createObjectURL(blob); const a = document.createElement("a"); a.href = url; a.download = `${event?.namaAcara || "acara"}-pemberian-${new Date().toISOString().slice(0, 10)}.csv`; a.click(); URL.revokeObjectURL(url);
      setExportModal(false); return;
    }
    const perPage = orientation === "landscape" ? 24 : 32;
    const totalPagesNeeded = Math.max(1, Math.ceil(sorted.length / perPage));
    const totalRows = totalPagesNeeded * perPage;
    const padded: (Guest | null)[] = [...sorted];
    while (padded.length < totalRows) padded.push(null);
    const body = padded.map((g, idx) => { if (!g) return ["", "", "", "", "", "", ""]; return [String(idx + 1), g.nama, g.alamat, formatRupiah(g.nominal), g.metode, g.mejaLabel || "-", g.catatan || "-"]; });
    const doc = new jsPDF({ orientation, unit: "mm", format: "a4" });
    const pageW = doc.internal.pageSize.getWidth();
    const pageH = doc.internal.pageSize.getHeight();
    const margin = { top: 8, bottom: 12, left: 6, right: 6 };
    const isLand = orientation === "landscape";
    autoTable(doc, {
      startY: 18, head: [["No", "Nama", "Alamat", "Nominal", "Metode", "Meja", "Catatan"]], body,
      foot: [["", "", "TOTAL", formatRupiah(totalNominalExport), "", `${totalTamuExport} tamu`, ""]], showFoot: "lastPage", theme: "grid",
      headStyles: { fillColor: [16, 185, 129], textColor: 255, fontStyle: "bold", halign: "center", fontSize: isLand ? 7 : 7.5, cellPadding: 2, lineColor: [16, 185, 129] },
      bodyStyles: { fontSize: isLand ? 6.5 : 7, cellPadding: 1.8, valign: "middle", lineColor: [210, 210, 210], lineWidth: 0.2, overflow: "linebreak" },
      footStyles: { fillColor: [236, 253, 245], textColor: [6, 95, 70], fontStyle: "bold", fontSize: 7, halign: "center" },
      alternateRowStyles: { fillColor: [249, 250, 251] },
      columnStyles: { 0: { halign: "center", cellWidth: 9 }, 1: { cellWidth: isLand ? 38 : 32 }, 2: { cellWidth: isLand ? 38 : 28 }, 3: { halign: "right", cellWidth: isLand ? 28 : 26 }, 4: { halign: "center", cellWidth: 20 }, 5: { halign: "center", cellWidth: 18 }, 6: { cellWidth: "auto" } },
      margin,
      didDrawPage: (data) => {
        if (data.pageNumber === 1) { doc.setFontSize(11); doc.setFont("helvetica", "bold"); doc.setTextColor(17, 24, 39); doc.text(`${event?.namaAcara || "Acara"} Laporan Pemberian`, margin.left, 10); doc.setFontSize(6.5); doc.setFont("helvetica", "normal"); doc.setTextColor(100); doc.text(`${new Date().toLocaleString("id-ID")} | ${userName} | ${mejaLabel || "-"} | ${totalTamuExport} tamu ${formatRupiah(totalNominalExport)}`, margin.left, 14, { maxWidth: pageW - margin.left - margin.right }); }
        doc.setFontSize(6.5); doc.setTextColor(120); doc.text(`Halaman ${data.pageNumber} / ${totalPagesNeeded}`, pageW - margin.right, pageH - 6, { align: "right" });
      },
      willDrawCell: (data) => { if (data.section === "body" && data.row.index >= sorted.length) { data.cell.styles.textColor = [255, 255, 255]; data.cell.styles.fillColor = [255, 255, 255]; data.cell.styles.lineColor = [235, 235, 235]; } },
    });
    const perMetodeMap = sorted.reduce((acc: Record<string, { jumlah: number; total: number }>, g) => { if (!acc[g.metode]) acc[g.metode] = { jumlah: 0, total: 0 }; acc[g.metode].jumlah += 1; acc[g.metode].total += g.nominal; return acc; }, {});
    const perMetodeEntries = Object.entries(perMetodeMap).sort((a, b) => b[1].total - a[1].total);

    // === Halaman Ringkasan: Tabel Metode + Tanda Tangan ===
    // Estimasi tinggi: header metode ~12, tabel per baris ~9, tanda tangan ~45
    const signBlockH = 48; // estimasi tinggi blok tanda tangan
    const metodeTableH = perMetodeEntries.length > 0 ? 16 + perMetodeEntries.length * 9 + 10 : 0; // title+head+rows+footer

    // Selalu addPage untuk ringkasan agar rapi dan terpisah dari data utama
    doc.addPage();
    const summaryPageH = doc.internal.pageSize.getHeight();
    let curY = margin.top;

    if (perMetodeEntries.length > 0) {
      doc.setFontSize(8); doc.setFont("helvetica", "bold"); doc.setTextColor(17, 24, 39);
      doc.text("Rincian per Metode", margin.left, curY);
      doc.setFontSize(6); doc.setFont("helvetica", "normal"); doc.setTextColor(100);
      doc.text(`Total ${totalTamuExport} catatan · ${formatRupiah(totalNominalExport)}`, margin.left, curY + 4);
      autoTable(doc, {
        startY: curY + 7,
        head: [["Metode", "Jumlah", "Total", "Porsi"]],
        body: perMetodeEntries.map(([metode, v]) => [metode, `${v.jumlah}`, formatRupiah(v.total), `${totalNominalExport ? Math.round((v.total / totalNominalExport) * 100) : 0}%`]),
        foot: [["TOTAL", `${totalTamuExport}`, formatRupiah(totalNominalExport), "100%"]],
        showFoot: "lastPage", theme: "grid",
        headStyles: { fillColor: [16, 185, 129], textColor: 255, fontStyle: "bold", halign: "center", fontSize: 7, cellPadding: 2, lineColor: [16, 185, 129] },
        bodyStyles: { fontSize: 7, cellPadding: 2.5, valign: "middle", lineColor: [210, 210, 210], lineWidth: 0.2, halign: "center" },
        footStyles: { fillColor: [236, 253, 245], textColor: [6, 95, 70], fontStyle: "bold", fontSize: 7, halign: "center" },
        columnStyles: { 0: { halign: "left", cellWidth: 32 }, 1: { halign: "center", cellWidth: 28 }, 2: { halign: "right", cellWidth: 42 }, 3: { halign: "center", cellWidth: 20 } },
        margin,
      });
      curY = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable?.finalY ?? curY + metodeTableH;
    }

    // === Tanda Tangan ===
    // Jika sisa ruang kurang dari signBlockH, pindah halaman baru
    const signGap = 14;
    let signY = curY + signGap;
    if (signY + signBlockH > summaryPageH - margin.bottom) {
      doc.addPage();
      signY = margin.top + 4;
    }

    const colW = (pageW - margin.left - margin.right) / 3;
    const col1 = margin.left;
    const col2 = margin.left + colW;
    const col3 = margin.left + colW * 2;
    const lineLen = colW - 10;

    // Garis pemisah tipis sebelum tanda tangan
    doc.setDrawColor(210, 210, 210);
    doc.setLineWidth(0.3);
    doc.line(margin.left, signY - 6, pageW - margin.right, signY - 6);

    const drawSignBlock = (x: number, title: string, subtitle: string, optional = false) => {
      doc.setFontSize(7.5);
      doc.setFont("helvetica", "bold");
      doc.setTextColor(17, 24, 39);
      doc.text(title, x, signY);
      doc.setFontSize(6.5);
      doc.setFont("helvetica", optional ? "italic" : "normal");
      doc.setTextColor(100);
      doc.text(optional ? `${subtitle} (opsional)` : subtitle, x, signY + 4.5);

      let rowY = signY + 13;
      const rows = ["Nama", "Tanggal", "Tanda tangan"];
      rows.forEach((label, idx) => {
        doc.setFontSize(6.5);
        doc.setFont("helvetica", "normal");
        doc.setTextColor(60);
        doc.text(`${label}:`, x, rowY);
        doc.setDrawColor(160);
        doc.setLineWidth(0.3);
        // baris tanda tangan lebih panjang untuk ruang tanda tangan
        const lineEndX = x + lineLen;
        doc.line(x + 19, rowY, lineEndX, rowY);
        rowY += idx === 2 ? 14 : 8; // tanda tangan dapat ruang lebih
      });
    };

    drawSignBlock(col1, "Diserahkan oleh,", "Petugas / Admin");
    drawSignBlock(col2, "Diterima oleh,", "Owner / Tuan Rumah");
    drawSignBlock(col3, "Saksi,", "Nama", true);

    doc.save(`${event?.namaAcara || "acara"}-pemberian-${orientation}-${new Date().toISOString().slice(0, 10)}.pdf`);
    setExportModal(false);
  }

  const isEditor = !loading && !!event && (event.myRole === "OWNER" || event.myRole === "ADMIN");
  const totalNominal = rekap?.totalNominal ?? 0;

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (loading || !event || !isEditor) return;
      if (tab !== "pemberian" && tab !== "buku") return;
      if (dupModal || exportModal || editBook || editGuest || selectedLog) return;
      const active = document.activeElement as HTMLElement | null;
      if (active && (active.tagName === "INPUT" || active.tagName === "TEXTAREA" || active.tagName === "SELECT" || active.isContentEditable)) return;
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      if (e.key.length !== 1) return;
      if (e.key === " ") return;
      if (tab === "pemberian" && namaInputRef.current) {
        e.preventDefault();
        namaInputRef.current.focus();
        setNama((prev) => prev + e.key);
        setSuggestOpen(true);
      } else if (tab === "buku" && bookNamaInputRef.current) {
        e.preventDefault();
        bookNamaInputRef.current.focus();
        setBookNama((prev) => prev + e.key);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [tab, isEditor, loading, event, dupModal, exportModal, editBook, editGuest, selectedLog]);

  if (loading) return (
    <div className="min-h-screen bg-[var(--background)] flex items-center justify-center">
      <div className="w-6 h-6 rounded-full border-2 border-emerald-600 border-t-transparent animate-spin" />
    </div>
  );
  if (!event) return (
    <div className="min-h-screen bg-[var(--background)] flex items-center justify-center">
      <div className="text-center">
        <p className="text-[var(--on-surface-variant)]">Acara tidak ditemukan atau tidak punya akses</p>
        <Link href="/dashboard" className="mt-4 inline-block text-sm text-[var(--primary)] hover:underline">← Dashboard</Link>
      </div>
    </div>
  );

  const tabList = [
    { key: "pemberian", label: "Pemberian" },
    { key: "buku", label: "Buku Tamu" },
    { key: "rekap", label: "Rekap" },
    { key: "setting", label: "Setting" },
  ] as const;

  const isInputTab = tab === "pemberian";

  return (
    <div className="min-h-screen bg-[var(--background)]">
      <div className={`mx-auto max-w-7xl ${isInputTab ? "px-2 py-1 sm:px-4 sm:py-4" : "px-4 py-4"}`}>
        <TopBar
          namaAcara={event.namaAcara}
          tanggal={event.tanggal}
          lokasi={event.lokasi || undefined}
          myRole={event.myRole}
          totalTamu={rekap?.totalTamu ?? 0}
          totalNominal={totalNominal}
          kasirName={userName}
          mejaLabel={mejaLabel}
          mejaList={event.mejaList}
          onMejaChange={(v) => {
            if (v === "Custom") {
              const nv = prompt("Nama meja custom (ex: MEJA-4):");
              if (nv) {
                const next = [...(event.mejaList || []), nv.toUpperCase()];
                fetch(`/api/events/${eventId}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ mejaList: next }) }).then(() => loadEvent());
                setMejaLabel(nv.toUpperCase());
              }
            } else setMejaLabel(v);
          }}
          onSearch={setSearch}
          onExportClick={() => setExportModal(true)}
          autoSync={autoSync}
          isSyncing={isSyncing}
          lastSyncAt={lastSyncAt}
          pendingCount={pendingCount}
          onToggleAutoSync={() => setAutoSync((v) => !v)}
          onRefresh={handleRefresh}
          hideNominal={hideNominal}
          onToggleHideNominal={() => setHideNominal((v) => !v)}
          compact={isInputTab}
        />

        {isOfflineMode && (
          <div className={`${isInputTab ? "mb-2 p-2 rounded-lg text-xs" : "mb-3 p-2.5 rounded-xl text-sm"} bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 flex items-center justify-between gap-2`}>
            <div className="flex items-center gap-1.5 text-amber-800 dark:text-amber-300 truncate">
              <WifiOff size={12} className="shrink-0" /> <span className="truncate">{isInputTab ? "Offline" : "Mode Offline — data lokal."}</span>
              {pendingCount > 0 && <span className="px-1.5 py-0.5 rounded-full bg-amber-500 text-white text-[10px] shrink-0">{pendingCount}</span>}
            </div>
            <button onClick={handleSyncToServer} disabled={isSyncing} className={`${isInputTab ? "h-7 px-2.5 text-xs" : "h-7 px-3 text-xs"} rounded-full bg-amber-600 text-white font-medium flex items-center gap-1 shrink-0 disabled:opacity-50`}>
              <CloudUpload size={11} /> {isSyncing ? "…" : "Sync"}
            </button>
          </div>
        )}
        {!isOfflineMode && pendingCount > 0 && (
          <div className={`${isInputTab ? "mb-2 p-1.5 rounded-lg" : "mb-3 p-2.5 rounded-xl"} bg-emerald-50 dark:bg-emerald-900/10 border border-emerald-200 dark:border-emerald-800 flex items-center justify-between gap-2`}>
            <span className={`${isInputTab ? "text-[11px]" : "text-xs"} text-emerald-700 dark:text-emerald-300 truncate`}>{isInputTab ? `${pendingCount} pending` : `${pendingCount} data menunggu sync · 30m`}</span>
            <button onClick={handleSyncToServer} disabled={isSyncing} className="h-6 px-2.5 rounded-full bg-emerald-600 text-white text-[11px] font-medium shrink-0 disabled:opacity-50">{isSyncing ? "…" : "Sync"}</button>
          </div>
        )}
        {/* Tabs — sticky di mobile saat input biar tidak ke-scroll */}
        <div className={`overflow-x-auto -mx-2 px-2 sm:mx-0 sm:px-0 mb-2 sm:mb-4 sticky z-20 backdrop-blur supports-[backdrop-filter]:bg-[var(--background)]/80 ${isInputTab ? "top-[40px] sm:top-0 py-1" : "top-[56px] sm:top-0 py-1"}`}>
          <div className={`flex gap-0.5 bg-[var(--surface-container)] p-1 rounded-xl w-fit min-w-full sm:min-w-0 ${isInputTab ? "p-0.5 sm:p-1" : ""}`}>
            {tabList.map((t) => {
              const disabled = false;
              return (
                <button
                  key={t.key}
                  onClick={() => updateTab(t.key)}
                  disabled={disabled}
                  className={`flex-1 sm:flex-none rounded-lg font-medium transition-colors whitespace-nowrap ${isInputTab ? "px-3 py-1.5 text-xs sm:px-4 sm:py-2 sm:text-sm" : "px-4 py-2 text-sm"} ${tab === t.key ? "bg-[var(--surface-container-lowest)] text-[var(--on-surface)] shadow-sm" : "text-[var(--on-surface-variant)] hover:text-[var(--on-surface)]"}`}
                >
                  {t.label}
                </button>
              );
            })}
          </div>
        </div>

        {/* ═══════════════════════ PEMBERIAN TAB ═══════════════════════ */}
        {tab === "pemberian" && (
          <div className="flex flex-col gap-2 sm:gap-4">
            {/* Form input — ultra ramping di mobile */}
            <div className="bg-[var(--surface-container-lowest)] rounded-xl sm:rounded-2xl border border-[var(--outline-variant)] p-2.5 sm:p-5">
              <div className="flex items-center justify-between mb-2 sm:mb-4">
                <div>
                  <h2 className="text-[13px] sm:text-base font-semibold leading-none text-[var(--on-surface)]">Input Pemberian</h2>
                  <p className="text-[11px] sm:text-xs leading-none mt-0.5 text-[var(--on-surface-variant)]">Meja {mejaLabel} · {userName}</p>
                </div>
                <span className="text-xs text-[var(--on-surface-variant)] hidden sm:inline">Tab: Nama→Alamat→Nominal→Enter</span>
              </div>

              <form onSubmit={handleSubmitPemberian} className="flex flex-col gap-3 sm:gap-4">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3 sm:gap-4">
                  {/* Nama */}
                  <div className="relative" ref={suggestWrapRef}>
                    <label className={labelCls}>Nama *</label>
                    <input
                      ref={namaInputRef}
                      id="nama-input"
                      value={nama}
                      onChange={e => { setNama(e.target.value); setSuggestOpen(true); }}
                      onFocus={() => setSuggestOpen(true)}
                      onKeyDown={e => {
                        if (!suggest.length) return;
                        if (e.key === "ArrowDown") { e.preventDefault(); setSuggestHighlighted(h => Math.min(h + 1, suggest.length - 1)); }
                        else if (e.key === "ArrowUp") { e.preventDefault(); setSuggestHighlighted(h => Math.max(h - 1, 0)); }
                        else if (e.key === "Enter" && suggestHighlighted >= 0) {
                          e.preventDefault();
                          selectSuggest(suggest[suggestHighlighted]);
                        } else if (e.key === "Escape") {
                          setSuggest([]); setSuggestHighlighted(-1); setSuggestOpen(false);
                        }
                      }}
                      required disabled={!isEditor} placeholder="Ketik min 2 huruf..." autoComplete="off" role="combobox" aria-expanded={suggestOpen && suggest.length > 0} aria-autocomplete="list" aria-controls={suggest.length ? "nama-suggest-list" : undefined} aria-activedescendant={suggestHighlighted >= 0 ? `suggest-opt-${suggestHighlighted}` : undefined}
                      className={`mt-1.5 ${inputCls}`} />
                    {suggestOpen && suggest.length > 0 && (
                      <div id="nama-suggest-list" role="listbox" className="absolute z-20 w-full bg-[var(--surface-container-lowest)] border border-[var(--outline-variant)] rounded-xl shadow-lg mt-1 max-h-44 overflow-auto">
                        <div className="px-3 py-2 text-xs text-[var(--on-surface-variant)] border-b border-[var(--outline-variant)] flex justify-between">
                          <span>Buku Tamu ({suggest.length})</span><span>klik untuk pilih</span>
                        </div>
                        {suggest.map((s, i) => (
                          <button key={i} id={`suggest-opt-${i}`} role="option" aria-selected={suggestHighlighted === i} type="button" tabIndex={-1} onMouseDown={(e) => e.preventDefault()} onClick={() => selectSuggest(s)}
                            onMouseEnter={() => setSuggestHighlighted(i)}
                            className={`w-full text-left px-3 py-2.5 text-sm transition-colors border-b border-[var(--outline-variant)] last:border-0 ${suggestHighlighted === i ? "bg-[var(--surface-container)]" : "hover:bg-[var(--surface-container)]"}`}>
                            <span className="font-medium text-[var(--on-surface)]">{s.nama}</span>
                            <span className="text-[var(--on-surface-variant)] ml-2 text-xs">{s.alamat}</span>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Alamat */}
                  <div>
                    <label className={labelCls}>Alamat *</label>
                    <input value={alamat} onChange={e => setAlamat(e.target.value)} required disabled={!isEditor} placeholder="Nama desa/kampung" className={`mt-1.5 ${inputCls}`} />
                    {shortcuts.alamatTop.length > 0 && (
                      <div className="mt-2 flex flex-wrap gap-1.5">
                        {shortcuts.alamatTop.map(a => (
                          <Chip key={a.alamat} active={alamat === a.alamat} onClick={() => setAlamat(a.alamat)}>
                            {a.alamat} <span className="opacity-60 ml-1">{a.jumlah}</span>
                          </Chip>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Nominal */}
                  <div>
                    <div className="flex justify-between">
                      <label className={labelCls}>Nominal *</label>
                      {nominalStr && <span className="text-xs font-semibold text-emerald-600">{formatRupiah(parseInt(nominalStr, 10))}</span>}
                    </div>
                    <div className="relative mt-1.5">
                      <span className="absolute left-4 top-1/2 -translate-y-1/2 text-xs font-bold text-[var(--on-surface-variant)]">Rp</span>
                      <input ref={nominalInputRef} id="nominal-input" value={nominalStr} onChange={e => setNominalStr(e.target.value.replace(/\D/g, ""))} onFocus={() => setNominalHighlighted(-1)}
                        onKeyDown={e => {
                          if (!nominalOptions.length) return;
                          if (e.key === "ArrowRight" || e.key === "ArrowDown") { e.preventDefault(); setNominalHighlighted(h => h < 0 ? 0 : Math.min(h + 1, nominalOptions.length - 1)); }
                          else if (e.key === "ArrowLeft" || e.key === "ArrowUp") { e.preventDefault(); setNominalHighlighted(h => h < 0 ? nominalOptions.length - 1 : Math.max(h - 1, 0)); }
                          else if (e.key === "Enter" && nominalHighlighted >= 0) { e.preventDefault(); setNominalStr(String(nominalOptions[nominalHighlighted])); }
                          else if (e.key === "Escape") { setNominalHighlighted(-1); }
                        }}
                        aria-activedescendant={nominalHighlighted >= 0 ? `nominal-opt-${nominalHighlighted}` : undefined}
                        required disabled={!isEditor} placeholder="100000" autoComplete="off" inputMode="numeric"
                        className={`${inputCls} pl-9 font-semibold`} />
                    </div>
                    <div role="group" aria-label="Pilihan nominal" className="mt-2 flex flex-wrap gap-1.5">
                      {nominalOptions.map((v, i) => (
                        <Chip key={v} id={`nominal-opt-${i}`} active={nominalStr === String(v)} highlighted={nominalHighlighted === i} onClick={() => setNominalStr(String(v))} onMouseEnter={() => setNominalHighlighted(i)} onMouseLeave={() => setNominalHighlighted(-1)}>
                          {formatRupiah(v)}
                        </Chip>
                      ))}
                    </div>
                  </div>
                </div>

                {/* Row 2: Metode + Catatan + Submit */}
                <div className="grid grid-cols-1 md:grid-cols-12 gap-4">
                  <div className="md:col-span-4">
                    <label className={labelCls}>Metode</label>
                    <div className="mt-1.5 flex gap-1.5">
                      {["AMPLOP", "QRIS", "TRANSFER"].map(m => (
                        <button key={m} type="button" onClick={() => setMetode(m)}
                          className={`flex-1 h-11 rounded-xl text-xs font-medium border transition-colors ${metode === m ? "bg-emerald-600 text-white border-emerald-600 shadow-sm" : "bg-[var(--surface-container)] text-[var(--on-surface)] border-[var(--outline-variant)] hover:border-emerald-300"}`}>
                          {m}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div className="md:col-span-5">
                    <label className={labelCls}>
                      Catatan{liveDup && <span className="ml-1 text-amber-600 normal-case font-normal">(wajib isi, duplikat)</span>}
                    </label>
                    <input value={catatan} onChange={e => setCatatan(e.target.value)} disabled={!isEditor}
                      placeholder={liveDup ? "Wajib: bedakan dari data sebelumnya" : "Opsional"}
                      className={`mt-1.5 ${inputCls} ${liveDup ? "border-amber-400 focus:ring-amber-500" : ""}`}
                      maxLength={200} />
                  </div>
                  <div className="md:col-span-3 flex items-end">
                    {liveDup && (
                      <div className="w-full mb-1 p-2.5 rounded-xl bg-amber-50 dark:bg-amber-900/10 border border-amber-200 dark:border-amber-800 text-xs text-amber-700 dark:text-amber-400 flex gap-2">
                        <AlertTriangle size={14} className="shrink-0 mt-0.5" />
                        <span><strong>{liveDup.nama}</strong> sudah {liveDup.nominalFormatted}</span>
                      </div>
                    )}
                    {!liveDup && (
                      <button disabled={!isEditor} type="submit"
                        className="w-full h-11 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-semibold text-sm flex items-center justify-center gap-2 transition-colors disabled:opacity-50">
                        <CheckCircle size={16} /> Simpan
                      </button>
                    )}
                  </div>
                </div>
                {liveDup && (
                  <button disabled={!isEditor} type="submit"
                    className="w-full h-11 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-semibold text-sm flex items-center justify-center gap-2 transition-colors disabled:opacity-50">
                    <CheckCircle size={16} /> Simpan dengan Catatan
                  </button>
                )}
              </form>
            </div>

            {/* Tabel pemberian */}
            <div className="bg-[var(--surface-container-lowest)] rounded-2xl p-4 border border-[var(--outline-variant)]">
              {/* Toolbar */}
              <div className="flex flex-wrap gap-2 items-center mb-3">
                <div className="relative flex-1 min-w-[180px]">
                  <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--on-surface-variant)]" />
                  <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Cari nama/alamat/kode..." className="w-full h-9 pl-8 pr-3 rounded-xl bg-[var(--surface-container)] border border-[var(--outline-variant)] text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 transition-shadow" />
                </div>
                <select value={sort} onChange={e => setSort(e.target.value)} className="h-9 px-3 rounded-xl bg-[var(--surface-container)] border border-[var(--outline-variant)] text-sm text-[var(--on-surface)] focus:outline-none">
                  <option value="createdAt">Waktu</option><option value="nama">Nama</option><option value="alamat">Alamat</option><option value="nominal">Nominal</option>
                </select>
                <select value={order} onChange={e => setOrder(e.target.value)} className="h-9 px-3 rounded-xl bg-[var(--surface-container)] border border-[var(--outline-variant)] text-sm text-[var(--on-surface)] focus:outline-none">
                  <option value="desc">↓ Desc</option><option value="asc">↑ Asc</option>
                </select>
              </div>

              {/* Filter meja & kasir */}
              <div className="flex flex-wrap gap-1.5 items-center mb-3 text-xs">
                <span className="text-[var(--on-surface-variant)] font-medium">Meja:</span>
                <Chip active={!mejaFilter} onClick={() => setMejaFilter(null)}>Semua</Chip>
                {(event.mejaList || ["MEJA-1", "MEJA-2"]).map((m: string) => (
                  <Chip key={m} active={mejaFilter === m} onClick={() => setMejaFilter(mejaFilter === m ? null : m)}>{m}</Chip>
                ))}
                <span className="text-[var(--on-surface-variant)] font-medium ml-1">Kasir:</span>
                <Chip active={!kasirFilter} onClick={() => setKasirFilter(null)}>Semua</Chip>
                {members.map(mem => (
                  <Chip key={mem.user.id} active={kasirFilter === mem.user.id} onClick={() => setKasirFilter(kasirFilter === mem.user.id ? null : mem.user.id)}>
                    {mem.user.name}
                  </Chip>
                ))}
                {(mejaFilter || kasirFilter) && (
                  <button onClick={() => { setMejaFilter(null); setKasirFilter(null); }} className="text-xs text-[var(--primary)] hover:underline ml-1">Reset</button>
                )}
              </div>

              <Pagination page={page} totalPages={totalPages} total={guestTotal} limit={LIMIT} onPage={setPage} />

              {/* Desktop: tabel */}
              <div className="mt-3 hidden sm:block overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-[var(--outline-variant)] text-xs text-[var(--on-surface-variant)]">
                      <th className="text-left p-2 font-medium w-10">#</th>
                      <th className="text-left p-2 font-medium">Nama</th>
                      <th className="text-left p-2 font-medium">Alamat</th>
                      <th className="text-right p-2 font-medium">Nominal</th>
                      <th className="text-center p-2 font-medium">Meja</th>
                      <th className="text-left p-2 font-medium">Kasir</th>
                      {isEditor && <th className="text-center p-2 font-medium w-16">Aksi</th>}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[var(--outline-variant)]">
                    {guests.map((g, i) => {
                      const kasir = members.find(m => m.user.id === g.petugasId);
                      return (
                        <tr key={g.id} className="hover:bg-[var(--surface-container)] transition-colors">
                          <td className="p-2 text-center text-xs text-[var(--on-surface-variant)]">{(page - 1) * LIMIT + i + 1}</td>
                          <td className="p-2">
                            <div className="font-medium text-[var(--on-surface)]">{g.nama}</div>
                            {g.catatan && <div className="text-xs text-amber-600 dark:text-amber-400">↳ {g.catatan}</div>}
                          </td>
                          <td className="p-2 text-[var(--on-surface-variant)] text-sm">{g.alamat}</td>
                          <td className="p-2 text-right font-bold text-emerald-600 dark:text-emerald-400 tabular-nums">{hideNominal ? "••••••" : formatRupiah(g.nominal)}</td>
                          <td className="p-2 text-center">
                            <span className="inline-block px-2 py-0.5 rounded-full bg-[var(--surface-container)] text-xs text-[var(--on-surface-variant)] border border-[var(--outline-variant)]">{g.mejaLabel || "—"}</span>
                          </td>
                          <td className="p-2">
                            <div className="text-xs font-medium text-[var(--on-surface)] truncate max-w-[100px]">{kasir ? kasir.user.name : g.petugasId.slice(0, 6)}</div>
                          </td>
                          {isEditor && (
                            <td className="p-2">
                              <div className="flex items-center justify-center gap-1">
                                <button onClick={() => openEditGuest(g)} className="w-7 h-7 rounded-lg border border-[var(--outline-variant)] bg-[var(--surface-container-lowest)] hover:bg-[var(--surface-container)] flex items-center justify-center transition-colors">
                                  <Pencil size={12} className="text-[var(--on-surface-variant)]" />
                                </button>
                                <button onClick={() => handleDeleteGuest(g.id)} className="w-7 h-7 rounded-lg border border-[var(--outline-variant)] bg-[var(--surface-container-lowest)] hover:bg-red-50 dark:hover:bg-red-900/10 hover:border-red-300 flex items-center justify-center transition-colors">
                                  <Trash2 size={12} className="text-red-500" />
                                </button>
                              </div>
                            </td>
                          )}
                        </tr>
                      );
                    })}
                    {guests.length === 0 && (
                      <tr><td colSpan={7} className="py-10 text-center text-sm text-[var(--on-surface-variant)]">Belum ada data</td></tr>
                    )}
                  </tbody>
                  <tfoot>
                    <tr className="border-t-2 border-[var(--outline-variant)] bg-[var(--surface-container)]">
                      <td colSpan={3} className="p-2 text-right text-xs font-semibold text-[var(--on-surface-variant)]">Total tampil</td>
                      <td className="p-2 text-right font-bold text-[var(--on-surface)] tabular-nums">{hideNominal ? "••••••" : formatRupiah(guests.reduce((s, g) => s + g.nominal, 0))}</td>
                      <td colSpan={3} className="p-2 text-center text-xs text-[var(--on-surface-variant)]">{guestTotal} total · {hideNominal ? "••••••" : rekap ? formatRupiah(rekap.totalNominal) : "..."}</td>
                    </tr>
                  </tfoot>
                </table>
              </div>

              {/* Mobile: card list */}
              <div className="mt-3 sm:hidden divide-y divide-[var(--outline-variant)]">
                {guests.map((g, i) => {
                  const kasir = members.find(m => m.user.id === g.petugasId);
                  return (
                    <div key={g.id} className="py-3 flex items-start justify-between gap-2">
                      <div className="flex items-start gap-2.5 min-w-0 flex-1">
                        <span className="text-xs text-[var(--on-surface-variant)] w-5 text-center pt-0.5 shrink-0">{(page - 1) * LIMIT + i + 1}</span>
                        <div className="min-w-0 flex-1">
                          <div className="font-medium text-[var(--on-surface)] text-sm truncate">{g.nama}</div>
                          <div className="text-xs text-[var(--on-surface-variant)] truncate">{g.alamat}</div>
                          {g.catatan && <div className="text-xs text-amber-600 dark:text-amber-400 mt-0.5">↳ {g.catatan}</div>}
                          <div className="flex items-center gap-1.5 mt-1 flex-wrap">
                            <span className="inline-block px-1.5 py-0.5 rounded-full bg-[var(--surface-container)] text-[10px] text-[var(--on-surface-variant)] border border-[var(--outline-variant)]">{g.metode}</span>
                            {g.mejaLabel && <span className="inline-block px-1.5 py-0.5 rounded-full bg-[var(--surface-container)] text-[10px] text-[var(--on-surface-variant)] border border-[var(--outline-variant)]">{g.mejaLabel}</span>}
                            <span className="text-[10px] text-[var(--on-surface-variant)]">{kasir ? kasir.user.name : g.petugasId.slice(0, 6)}</span>
                          </div>
                        </div>
                      </div>
                      <div className="flex flex-col items-end gap-1.5 shrink-0">
                        <span className="font-bold text-emerald-600 dark:text-emerald-400 tabular-nums text-sm">{hideNominal ? "••••••" : formatRupiah(g.nominal)}</span>
                        {isEditor && (
                          <div className="flex gap-1">
                            <button onClick={() => openEditGuest(g)} className="w-7 h-7 rounded-lg border border-[var(--outline-variant)] bg-[var(--surface-container-lowest)] hover:bg-[var(--surface-container)] flex items-center justify-center transition-colors">
                              <Pencil size={12} className="text-[var(--on-surface-variant)]" />
                            </button>
                            <button onClick={() => handleDeleteGuest(g.id)} className="w-7 h-7 rounded-lg border border-[var(--outline-variant)] bg-[var(--surface-container-lowest)] hover:bg-red-50 dark:hover:bg-red-900/10 hover:border-red-300 flex items-center justify-center transition-colors">
                              <Trash2 size={12} className="text-red-500" />
                            </button>
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
                {guests.length === 0 && (
                  <div className="py-10 text-center text-sm text-[var(--on-surface-variant)]">Belum ada data</div>
                )}
                {guests.length > 0 && (
                  <div className="pt-3 flex justify-between text-xs text-[var(--on-surface-variant)]">
                    <span>Total tampil: <strong className="text-[var(--on-surface)]">{hideNominal ? "••••••" : formatRupiah(guests.reduce((s, g) => s + g.nominal, 0))}</strong></span>
                    <span>{guestTotal} total</span>
                  </div>
                )}
              </div>

              <div className="mt-3">
                <Pagination page={page} totalPages={totalPages} total={guestTotal} limit={LIMIT} onPage={setPage} />
              </div>
            </div>
          </div>
        )}

        {/* ═══════════════════════ BUKU TAMU TAB ═══════════════════════ */}
        {tab === "buku" && (
          <div className="flex flex-col gap-4">
            <div className="bg-[var(--surface-container-lowest)] rounded-2xl p-5 border border-[var(--outline-variant)]">
              <h3 className="font-semibold text-[var(--on-surface)] mb-4">Tambah Tamu</h3>
              <form onSubmit={handleAddBook} className="grid grid-cols-1 md:grid-cols-12 gap-3">
                <div className="md:col-span-5">
                  <input ref={bookNamaInputRef} id="book-nama-input" value={bookNama} onChange={e => setBookNama(e.target.value)} required disabled={!isEditor} placeholder="Nama tamu" className={inputCls} />
                </div>
                <div className="md:col-span-5">
                  <input value={bookAlamat} onChange={e => setBookAlamat(e.target.value)} required disabled={!isEditor} placeholder="Alamat / desa" className={inputCls} />
                </div>
                <div className="md:col-span-2">
                  <button disabled={!isEditor} type="submit" className="w-full h-11 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-medium text-sm transition-colors disabled:opacity-50">
                    Tambah
                  </button>
                </div>
              </form>
            </div>

            <div className="bg-[var(--surface-container-lowest)] rounded-2xl p-5 border border-[var(--outline-variant)]">
              <div className="flex items-center justify-between mb-3">
                <h3 className="font-semibold text-[var(--on-surface)]">Buku Tamu</h3>
                <span className="text-xs text-[var(--on-surface-variant)]">{bookTotal} tamu</span>
              </div>
              <input value={bookSearch} onChange={e => setBookSearch(e.target.value)} placeholder="Cari nama..." className={`${inputCls} h-9 mb-3`} />

              <Pagination page={bookPage} totalPages={bookTotalPages} total={bookTotal} limit={LIMIT} onPage={setBookPage} />

              <div className="mt-3 overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-[var(--outline-variant)] text-xs text-[var(--on-surface-variant)]">
                      <th className="text-left p-2 font-medium w-10">#</th>
                      <th className="text-left p-2 font-medium">Nama</th>
                      <th className="text-left p-2 font-medium">Alamat</th>
                      {isEditor && <th className="text-center p-2 font-medium w-16">Aksi</th>}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[var(--outline-variant)]">
                    {books.map((b, i) => (
                      <tr key={b.id} className="hover:bg-[var(--surface-container)] transition-colors">
                        <td className="p-2 text-center text-xs text-[var(--on-surface-variant)]">{(bookPage - 1) * LIMIT + i + 1}</td>
                        <td className="p-2 font-medium text-[var(--on-surface)]">{b.nama}</td>
                        <td className="p-2 text-[var(--on-surface-variant)]">{b.alamat}</td>
                        {isEditor && (
                          <td className="p-2">
                            <div className="flex items-center justify-center gap-1">
                              <button onClick={() => openEditBook(b)} className="w-7 h-7 rounded-lg border border-[var(--outline-variant)] bg-[var(--surface-container-lowest)] hover:bg-[var(--surface-container)] flex items-center justify-center transition-colors">
                                <Pencil size={12} className="text-[var(--on-surface-variant)]" />
                              </button>
                              <button onClick={async () => { if (!confirm("Hapus buku tamu ini?")) return; await fetch(`/api/guestbooks/${b.id}`, { method: "DELETE" }); loadBooks(); }} className="w-7 h-7 rounded-lg border border-[var(--outline-variant)] bg-[var(--surface-container-lowest)] hover:bg-red-50 dark:hover:bg-red-900/10 hover:border-red-300 flex items-center justify-center transition-colors">
                                <Trash2 size={12} className="text-red-500" />
                              </button>
                            </div>
                          </td>
                        )}
                      </tr>
                    ))}
                    {books.length === 0 && <tr><td colSpan={4} className="py-10 text-center text-sm text-[var(--on-surface-variant)]">Belum ada tamu</td></tr>}
                  </tbody>
                  <tfoot>
                    <tr className="border-t-2 border-[var(--outline-variant)] bg-[var(--surface-container)]">
                      <td colSpan={2} className="p-2 text-right text-xs font-semibold text-[var(--on-surface-variant)]">Total</td>
                      <td className="p-2 text-center font-bold text-[var(--on-surface)]">{bookTotal}</td>
                      {isEditor && <td />}
                    </tr>
                  </tfoot>
                </table>
              </div>

              <div className="mt-3">
                <Pagination page={bookPage} totalPages={bookTotalPages} total={bookTotal} limit={LIMIT} onPage={setBookPage} />
              </div>
            </div>
          </div>
        )}

        {/* ═══════════════════════ REKAP TAB ═══════════════════════ */}
        {tab === "rekap" && rekap && (
          <div className="flex flex-col gap-4">
            {/* Stat cards */}
            <div className="grid grid-cols-2 gap-4">
              <div className="bg-[var(--surface-container-lowest)] border border-[var(--outline-variant)] rounded-2xl p-6 text-center">
                <p className="text-xs uppercase tracking-widest font-semibold text-[var(--on-surface-variant)]">Total Tamu</p>
                <p className="mt-2 text-5xl font-bold text-[var(--on-surface)] tracking-tight tabular-nums">{rekap.totalTamu}</p>
              </div>
              <div className="bg-emerald-50 dark:bg-emerald-900/10 border border-emerald-200 dark:border-emerald-800 rounded-2xl p-6 text-center">
                <p className="text-xs uppercase tracking-widest font-semibold text-emerald-700 dark:text-emerald-400">Total Pemberian</p>
                <p className="mt-2 text-3xl sm:text-4xl font-bold text-emerald-700 dark:text-emerald-400 tracking-tight tabular-nums">{formatRupiah(rekap.totalNominal)}</p>
              </div>
            </div>

            <div className="grid md:grid-cols-2 gap-4">
              {/* Per Meja */}
              <div className="bg-[var(--surface-container-lowest)] rounded-2xl p-5 border border-[var(--outline-variant)]">
                <h4 className="font-semibold text-[var(--on-surface)] mb-4">Per Meja</h4>
                <div className="space-y-3">
                  {rekap.perMeja.map(m => {
                    const max = Math.max(...rekap.perMeja.map(x => x.total), 1);
                    const pct = Math.round((m.total / max) * 100);
                    return (
                      <div key={m.mejaLabel}>
                        <div className="flex justify-between text-sm mb-1">
                          <span className="font-medium text-[var(--on-surface)]">{m.mejaLabel}</span>
                          <span className="font-bold text-emerald-600 dark:text-emerald-400 tabular-nums">{formatRupiah(m.total)}</span>
                        </div>
                        <div className="w-full h-1.5 rounded-full bg-[var(--surface-container)] overflow-hidden">
                          <div className="h-full rounded-full bg-emerald-500" style={{ width: `${pct}%` }} />
                        </div>
                        <div className="flex justify-between text-xs text-[var(--on-surface-variant)] mt-0.5">
                          <span>{m.jumlah} tamu</span><span>{pct}%</span>
                        </div>
                      </div>
                    );
                  })}
                  {rekap.perMeja.length === 0 && <p className="text-sm text-[var(--on-surface-variant)]">Belum ada data</p>}
                </div>
              </div>

              {/* Per Kasir */}
              <div className="bg-[var(--surface-container-lowest)] rounded-2xl p-5 border border-[var(--outline-variant)]">
                <h4 className="font-semibold text-[var(--on-surface)] mb-4">Per Kasir</h4>
                <div className="space-y-3">
                  {rekap.perKasir.map(k => {
                    const max = Math.max(...rekap.perKasir.map(x => x.total), 1);
                    const pct = Math.round((k.total / max) * 100);
                    return (
                      <div key={k.petugasId}>
                        <div className="flex justify-between text-sm mb-1">
                          <span className="font-medium text-[var(--on-surface)] truncate">{k.name}</span>
                          <span className="font-bold text-emerald-600 dark:text-emerald-400 tabular-nums">{formatRupiah(k.total)}</span>
                        </div>
                        <div className="w-full h-1.5 rounded-full bg-[var(--surface-container)] overflow-hidden">
                          <div className="h-full rounded-full bg-emerald-500" style={{ width: `${pct}%` }} />
                        </div>
                        <div className="text-xs text-[var(--on-surface-variant)] mt-0.5">{k.jumlah} tamu</div>
                      </div>
                    );
                  })}
                  {rekap.perKasir.length === 0 && <p className="text-sm text-[var(--on-surface-variant)]">Belum ada data</p>}
                </div>
              </div>

              {/* Per Metode */}
              <div className="bg-[var(--surface-container-lowest)] rounded-2xl p-5 border border-[var(--outline-variant)]">
                <h4 className="font-semibold text-[var(--on-surface)] mb-3">Per Metode</h4>
                <table className="w-full text-sm">
                  <thead><tr className="text-xs text-[var(--on-surface-variant)] border-b border-[var(--outline-variant)]"><th className="text-left pb-2">Metode</th><th className="text-right pb-2">Tamu</th><th className="text-right pb-2">Total</th></tr></thead>
                  <tbody className="divide-y divide-[var(--outline-variant)]">
                    {rekap.perMetode.map(m => (
                      <tr key={m.metode}>
                        <td className="py-2">
                          <span className={`px-2 py-0.5 rounded-full text-xs border font-medium ${m.metode === "AMPLOP" ? "bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-900/20 dark:text-emerald-400 dark:border-emerald-800" : m.metode === "QRIS" ? "bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-900/20 dark:text-blue-400 dark:border-blue-800" : "bg-[var(--surface-container)] text-[var(--on-surface-variant)] border-[var(--outline-variant)]"}`}>
                            {m.metode}
                          </span>
                        </td>
                        <td className="py-2 text-right text-[var(--on-surface-variant)]">{m.jumlah}</td>
                        <td className="py-2 text-right font-semibold text-[var(--on-surface)] tabular-nums">{formatRupiah(m.total)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Per Alamat */}
              <div className="bg-[var(--surface-container-lowest)] rounded-2xl p-5 border border-[var(--outline-variant)]">
                <h4 className="font-semibold text-[var(--on-surface)] mb-3">Per Alamat</h4>
                <table className="w-full text-sm">
                  <thead><tr className="text-xs text-[var(--on-surface-variant)] border-b border-[var(--outline-variant)]"><th className="text-left pb-2">Alamat</th><th className="text-right pb-2">Tamu</th><th className="text-right pb-2">Total</th></tr></thead>
                  <tbody className="divide-y divide-[var(--outline-variant)]">
                    {rekap.perAlamat.map(a => (
                      <tr key={a.alamat}>
                        <td className="py-2 text-[var(--on-surface)]">{a.alamat}</td>
                        <td className="py-2 text-right text-[var(--on-surface-variant)]">{a.jumlah}</td>
                        <td className="py-2 text-right font-semibold text-[var(--on-surface)] tabular-nums">{formatRupiah(a.total)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* ═══════════════════════ SETTING TAB ═══════════════════════ */}
        {tab === "setting" && (
          <div className="flex flex-col gap-4">
            <div className="grid md:grid-cols-2 gap-4">
              {/* Kelola anggota */}
              <div className="bg-[var(--surface-container-lowest)] rounded-2xl p-5 border border-[var(--outline-variant)]">
                <h3 className="font-semibold text-[var(--on-surface)] mb-1">Anggota</h3>
                {isOfflineMode ? (
                  <div className="text-xs text-amber-700 bg-amber-50 dark:bg-amber-900/10 px-3 py-2 rounded-lg border border-amber-200 dark:border-amber-800 mb-3 flex items-center gap-2"><WifiOff size={13} /> Mode Offline — fitur anggota nonaktif. Klik Sync ke Server di atas untuk aktifkan multi-admin (auto-sync 30 menit di background).</div>
                ) : event.myRole !== "OWNER" ? (
                  <p className="text-xs text-amber-600 bg-amber-50 dark:bg-amber-900/10 px-3 py-1.5 rounded-lg border border-amber-200 dark:border-amber-800 mb-3">Hanya OWNER bisa kelola</p>
                ) : null}
                <div className="space-y-2 mt-3">
                  <input value={searchUser} onChange={e => setSearchUser(e.target.value)} placeholder="Cari user (nama/email)" disabled={event.myRole !== "OWNER" || isOfflineMode}
                    className={`${inputCls} disabled:opacity-50`} />
                  <select value={addRole} onChange={e => setAddRole(e.target.value)} disabled={event.myRole !== "OWNER" || isOfflineMode}
                    className="w-full h-11 px-4 rounded-xl border border-[var(--outline-variant)] bg-[var(--surface-container-lowest)] text-sm focus:outline-none disabled:opacity-50">
                    <option value="VIEWER">VIEWER</option><option value="ADMIN">ADMIN</option><option value="OWNER">OWNER</option>
                  </select>
                  {searchResults.length > 0 && (
                    <div className="border border-[var(--outline-variant)] rounded-xl divide-y divide-[var(--outline-variant)] overflow-hidden">
                      {searchResults.map(u => (
                        <div key={u.id} className="p-3 flex items-center justify-between gap-3 hover:bg-[var(--surface-container)] transition-colors">
                          <div className="flex items-center gap-3 min-w-0 flex-1">
                            <Avatar user={u} size={32} />
                            <div className="min-w-0">
                              <p className="text-sm font-medium text-[var(--on-surface)] truncate">{u.name}</p>
                              <p className="text-xs text-[var(--on-surface-variant)] truncate">{u.email}{u.username ? ` · @${u.username}` : ""}</p>
                            </div>
                          </div>
                          <button onClick={() => handleAddMember(u.id)} className="h-8 px-3 rounded-lg bg-emerald-600 text-white text-xs font-medium hover:bg-emerald-700 transition-colors shrink-0">
                            Tambah
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                <div className="mt-5">
                  <p className="text-xs font-semibold text-[var(--on-surface-variant)] uppercase tracking-wide mb-2">{members.length} Anggota</p>
                  <div className="border border-[var(--outline-variant)] rounded-xl divide-y divide-[var(--outline-variant)] overflow-hidden">
                    {members.map(m => (
                      <div key={m.id} className="p-3 flex items-center justify-between gap-3 hover:bg-[var(--surface-container)] transition-colors">
                        <div className="flex items-center gap-3 min-w-0 flex-1">
                          <Avatar user={m.user} size={36} />
                          <div className="min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="text-sm font-medium text-[var(--on-surface)] truncate">{m.user.name}</span>
                              <span className={`text-xs px-2 py-0.5 rounded-full border font-medium shrink-0 ${m.role === "OWNER" ? "bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-900/20 dark:text-emerald-400 dark:border-emerald-800" : m.role === "ADMIN" ? "bg-[var(--surface-container)] text-[var(--on-surface-variant)] border-[var(--outline-variant)]" : "bg-[var(--surface-container)] text-[var(--on-surface-variant)] border-[var(--outline-variant)]"}`}>
                                {m.role}
                              </span>
                            </div>
                            <p className="text-xs text-[var(--on-surface-variant)] truncate">{m.user.email}{m.user.username ? ` · @${m.user.username}` : ""}</p>
                          </div>
                        </div>
                        {event.myRole === "OWNER" && (
                          <button onClick={async () => { if (!confirm("Hapus anggota?")) return; await fetch(`/api/events/${eventId}/members?userId=${m.user.id}`, { method: "DELETE" }); loadMembers(); }}
                            className="w-7 h-7 rounded-lg border border-[var(--outline-variant)] hover:bg-red-50 dark:hover:bg-red-900/10 hover:border-red-300 flex items-center justify-center transition-colors">
                            <X size={13} className="text-red-500" />
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              {/* Info acara */}
              <div className="bg-[var(--surface-container-lowest)] rounded-2xl p-5 border border-[var(--outline-variant)]">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="font-semibold text-[var(--on-surface)]">Info Acara</h3>
                  {!editMode && isEditor && (
                    <button onClick={() => setEditMode(true)} className="flex items-center gap-1.5 h-8 px-3 rounded-lg border border-[var(--outline-variant)] text-xs text-[var(--on-surface)] hover:bg-[var(--surface-container)] transition-colors">
                      <Pencil size={12} /> Edit
                    </button>
                  )}
                </div>
                {!editMode ? (
                  <div className="space-y-2.5 text-sm">
                    {[["Nama Acara", event.namaAcara], ["Tuan Rumah", event.namaTuanRumah || "-"], ["Tanggal", new Date(event.tanggal).toLocaleDateString("id-ID", { day: "numeric", month: "long", year: "numeric" })], ["Lokasi", event.lokasi || "-"], ["Catatan", event.catatan || "-"]].map(([k, v]) => (
                      <div key={k} className="flex gap-3">
                        <span className="text-[var(--on-surface-variant)] w-24 shrink-0">{k}</span>
                        <span className="text-[var(--on-surface)] font-medium">{v}</span>
                      </div>
                    ))}
                    <div className="pt-3 mt-3 border-t border-[var(--outline-variant)]">
                      <button
                        disabled={event.myRole === "VIEWER"}
                        onClick={async () => { if (!confirm("Hapus acara ini secara permanen?")) return; const res = await fetch(`/api/events/${eventId}`, { method: "DELETE" }); if (res.ok) window.location.href = "/dashboard"; }}
                        className="w-full h-10 rounded-xl border border-red-200 dark:border-red-800 text-red-500 text-sm hover:bg-red-50 dark:hover:bg-red-900/10 transition-colors disabled:opacity-50"
                      >
                        Hapus Acara
                      </button>
                    </div>
                  </div>
                ) : (
                  <form onSubmit={handleUpdateEvent} className="space-y-3">
                    {[
                      { v: editNama, fn: setEditNama, ph: "Nama Acara", req: true },
                      { v: editNamaTuanRumah, fn: setEditNamaTuanRumah, ph: "Tuan Rumah", req: true },
                    ].map(f => (
                      <input key={f.ph} value={f.v} onChange={e => f.fn(e.target.value)} placeholder={f.ph} required={f.req} className={inputCls} />
                    ))}
                    <input type="date" value={editTanggal} onChange={e => setEditTanggal(e.target.value)} required className={inputCls} />
                    <input value={editLokasi} onChange={e => setEditLokasi(e.target.value)} placeholder="Lokasi" className={inputCls} />
                    <textarea value={editCatatan} onChange={e => setEditCatatan(e.target.value)} placeholder="Catatan" rows={2}
                      className="w-full px-4 py-3 rounded-xl border border-[var(--outline-variant)] bg-[var(--surface-container-lowest)] text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 resize-none" />
                    <div className="flex gap-2">
                      <button type="button" onClick={() => setEditMode(false)} className="flex-1 h-11 rounded-xl border border-[var(--outline-variant)] text-sm text-[var(--on-surface)] hover:bg-[var(--surface-container)] transition-colors">Batal</button>
                      <button type="submit" className="flex-1 h-11 rounded-xl bg-emerald-600 text-white font-medium text-sm hover:bg-emerald-700 transition-colors">Simpan</button>
                    </div>
                  </form>
                )}
              </div>
            </div>

            {/* Kelola Meja */}
            <div className="bg-[var(--surface-container-lowest)] rounded-2xl p-5 border border-[var(--outline-variant)]">
              <h3 className="font-semibold text-[var(--on-surface)] mb-1">Meja</h3>
              <p className="text-xs text-[var(--on-surface-variant)] mb-4">Sinkron antar device, tampil di TopBar & filter</p>
              <div className="flex flex-wrap gap-2 mb-3">
                {(event.mejaList || []).map((m: string) => (
                  <span key={m} className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-emerald-50 dark:bg-emerald-900/10 text-emerald-700 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800 text-xs font-medium">
                    {m}
                    <button onClick={async () => {
                      const nv = prompt(`Rename ${m}:`, m);
                      if (!nv || nv.trim().toUpperCase() === m) return;
                      const trimmed = nv.trim().toUpperCase();
                      if ((event.mejaList || []).includes(trimmed)) { alert("Meja sudah ada"); return; }
                      const next = (event.mejaList || []).map((x: string) => x === m ? trimmed : x);
                      const res = await fetch(`/api/events/${eventId}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ mejaList: next }) });
                      if (res.ok) { loadEvent(); if (mejaLabel === m) setMejaLabel(trimmed); }
                    }} className="hover:text-emerald-900 dark:hover:text-emerald-200 transition-colors">
                      <Pencil size={11} />
                    </button>
                    <button onClick={async () => {
                      if (!confirm(`Hapus ${m}?`)) return;
                      const next = (event.mejaList || []).filter((x: string) => x !== m);
                      await fetch(`/api/events/${eventId}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ mejaList: next }) });
                      loadEvent();
                    }} className="hover:text-red-500 transition-colors">
                      <X size={11} />
                    </button>
                  </span>
                ))}
                {(event.mejaList || []).length === 0 && <p className="text-xs text-[var(--on-surface-variant)]">Belum ada meja</p>}
              </div>
              <div className="flex gap-2">
                <input value={newMeja} onChange={e => setNewMeja(e.target.value.toUpperCase())} placeholder="MEJA-3" maxLength={20}
                  className={`flex-1 ${inputCls} h-9`} />
                <button onClick={async () => {
                  if (!newMeja.trim()) return;
                  const next = [...(event.mejaList || []), newMeja.trim().toUpperCase()];
                  const res = await fetch(`/api/events/${eventId}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ mejaList: next }) });
                  if (res.ok) { setNewMeja(""); loadEvent(); }
                }} disabled={!newMeja.trim() || !isEditor}
                  className="h-9 px-4 rounded-xl bg-emerald-600 text-white text-sm font-medium hover:bg-emerald-700 transition-colors disabled:opacity-50">
                  Tambah
                </button>
              </div>
            </div>

            {/* Log Aktivitas */}
            <div className="bg-[var(--surface-container-lowest)] rounded-2xl p-5 border border-[var(--outline-variant)]">
              <div className="flex items-center justify-between mb-4">
                <h3 className="font-semibold text-[var(--on-surface)]">Log Aktivitas</h3>
                <div className="relative">
                  <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--on-surface-variant)]" />
                  <input value={logSearch} onChange={e => setLogSearch(e.target.value)} placeholder="Cari nama tamu / aksi..." className="h-8 pl-8 pr-3 rounded-xl bg-[var(--surface-container)] border border-[var(--outline-variant)] text-xs w-44 focus:outline-none" />
                </div>
              </div>
              <div className="max-h-72 overflow-auto divide-y divide-[var(--outline-variant)]">
                {auditLogs.map(log => {
                  const d = log.detail as Record<string, unknown> | null;
                  const guestName =
                    (d?.nama as string | undefined) ||
                    ((d?.before as Record<string, unknown> | undefined)?.nama as string | undefined) ||
                    ((d?.after as Record<string, unknown> | undefined)?.nama as string | undefined) ||
                    "";
                  return (
                    <button key={log.id} onClick={() => setSelectedLog(log)}
                      className="w-full py-2.5 px-2 flex flex-col sm:flex-row sm:justify-between gap-1 text-left hover:bg-[var(--surface-container)] rounded-lg transition-colors">
                      <div className="text-sm min-w-0 flex-1">
                        <span className="font-medium text-[var(--on-surface)]">{log.user.name}</span>
                        <span className="text-[var(--on-surface-variant)] ml-1.5">{log.aksi}</span>
                        {guestName && <span className="ml-1.5 text-emerald-600 dark:text-emerald-400 font-medium truncate">· {guestName}</span>}
                      </div>
                      <span className="text-xs text-[var(--on-surface-variant)] shrink-0">{new Date(log.createdAt).toLocaleString("id-ID")}</span>
                    </button>
                  );
                })}
                {auditLogs.length === 0 && <p className="py-8 text-center text-sm text-[var(--on-surface-variant)]">Belum ada log</p>}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* ═══════════════════════ MODALS ═══════════════════════ */}

      {/* Duplikat */}
      {dupModal && (
        <Modal onClose={() => { setDupModal(null); setDupNote(""); }}>
          <div className="bg-[var(--surface-container-lowest)] rounded-2xl p-6 border border-[var(--outline-variant)] shadow-xl">
            <h3 className="font-semibold text-[var(--on-surface)]">Tamu Duplikat</h3>
            <p className="text-sm text-[var(--on-surface-variant)] mt-1">
              <strong className="text-[var(--on-surface)]">{dupModal.existing.nama} — {dupModal.existing.alamat}</strong> sudah tercatat <strong>{dupModal.existing.nominalFormatted}</strong>
            </p>
            <div className="mt-3 p-3 rounded-xl bg-amber-50 dark:bg-amber-900/10 border border-amber-200 dark:border-amber-800 text-sm text-amber-700 dark:text-amber-400">
              {dupModal.message} Isi catatan untuk membedakan dari data sebelumnya.
            </div>
            <input value={dupNote} onChange={e => setDupNote(e.target.value)} autoFocus placeholder="Bedakan: Krajan Lor, anak Pak RT..."
              className={`mt-3 ${inputCls} border-amber-300 focus:ring-amber-500`} />
            <div className="mt-4 flex gap-2">
              <button onClick={() => { setDupModal(null); setDupNote(""); }} className="flex-1 h-11 rounded-xl border border-[var(--outline-variant)] text-sm text-[var(--on-surface)] hover:bg-[var(--surface-container)] transition-colors">Batal</button>
              <button onClick={handleSubmitDuplicate} disabled={!dupNote.trim()} className="flex-1 h-11 rounded-xl bg-emerald-600 text-white font-medium text-sm hover:bg-emerald-700 disabled:opacity-50 transition-colors">Simpan</button>
            </div>
          </div>
        </Modal>
      )}

      {/* Detail Log */}
      {selectedLog && (
        <Modal onClose={() => setSelectedLog(null)}>
          <div className="bg-[var(--surface-container-lowest)] rounded-2xl p-6 border border-[var(--outline-variant)] shadow-xl max-h-[80vh] overflow-auto">
            <h3 className="font-semibold text-[var(--on-surface)]">Detail Log</h3>
            <p className="text-xs text-[var(--on-surface-variant)] mt-1">{selectedLog.user.name} · {new Date(selectedLog.createdAt).toLocaleString("id-ID")}</p>
            <div className="mt-3 px-2 py-1 rounded-lg bg-[var(--surface-container)] text-sm font-mono text-[var(--on-surface)]">{selectedLog.aksi}</div>
            <pre className="mt-3 p-3 rounded-xl bg-[var(--surface-container)] text-xs overflow-auto max-h-60 border border-[var(--outline-variant)]">{JSON.stringify(selectedLog.detail, null, 2) || "Tidak ada detail"}</pre>
            <button onClick={() => setSelectedLog(null)} className="mt-4 w-full h-10 rounded-xl border border-[var(--outline-variant)] text-sm text-[var(--on-surface)] hover:bg-[var(--surface-container)] transition-colors">Tutup</button>
          </div>
        </Modal>
      )}

      {/* Export */}
      {exportModal && (
        <Modal onClose={() => setExportModal(false)}>
          <div className="bg-[var(--surface-container-lowest)] rounded-2xl border border-[var(--outline-variant)] shadow-xl max-h-[90vh] overflow-auto">
            <div className="flex items-center justify-between px-6 py-5 border-b border-[var(--outline-variant)]">
              <h3 className="font-semibold text-[var(--on-surface)]">Export Data</h3>
              <button onClick={() => setExportModal(false)} className="w-8 h-8 rounded-lg hover:bg-[var(--surface-container)] flex items-center justify-center text-[var(--on-surface-variant)] transition-colors"><X size={16} /></button>
            </div>

            <div className="px-6 py-5 space-y-5">
              {/* Tipe */}
              <div className="flex flex-col gap-2">
                {[{ val: "tamu", label: "Buku Tamu", desc: "3 kolom: No, Nama, Alamat" }, { val: "pemberian", label: "Pemberian", desc: "7 kolom: Nama, Alamat, Nominal, Metode, Meja, Catatan" }].map(opt => (
                  <label key={opt.val} className={`flex items-center gap-3 p-3 rounded-xl border-2 cursor-pointer transition-colors ${exportType === opt.val ? "bg-emerald-50 dark:bg-emerald-900/10 border-emerald-500 dark:border-emerald-700" : "border-[var(--outline-variant)] hover:border-[var(--outline)]"}`}>
                    <input type="radio" checked={exportType === opt.val as "tamu" | "pemberian"} onChange={() => setExportType(opt.val as "tamu" | "pemberian")} className="accent-emerald-600" />
                    <div>
                      <p className="font-semibold text-sm text-[var(--on-surface)]">{opt.label}</p>
                      <p className="text-xs text-[var(--on-surface-variant)]">{opt.desc}</p>
                    </div>
                  </label>
                ))}
              </div>

              {/* Orientasi */}
              <div>
                <p className={`${inputCls.replace("w-full h-11 px-4", "")} text-xs font-medium text-[var(--on-surface-variant)] uppercase tracking-wide mb-2`}>Orientasi</p>
                <div className="grid grid-cols-2 gap-2">
                  {[
                    { val: "portrait", label: "Vertikal", Icon: RectangleVertical, rows: exportType === "tamu" ? "42" : "32" },
                    { val: "landscape", label: "Horizontal", Icon: RectangleHorizontal, rows: exportType === "tamu" ? "30" : "24" },
                  ].map(opt => (
                    <button key={opt.val} onClick={() => setExportOrientation(opt.val as "portrait" | "landscape")}
                      className={`p-3 rounded-xl border-2 flex flex-col items-center gap-1.5 transition-colors ${exportOrientation === opt.val ? "bg-emerald-50 dark:bg-emerald-900/10 border-emerald-500 dark:border-emerald-700 text-emerald-700 dark:text-emerald-400" : "border-[var(--outline-variant)] text-[var(--on-surface-variant)] hover:border-[var(--outline)]"}`}>
                      <opt.Icon size={22} />
                      <span className="text-xs font-semibold">{opt.label}</span>
                      <span className="text-[10px] opacity-70">{opt.rows} baris/hal</span>
                    </button>
                  ))}
                </div>
              </div>

              {/* Urutan */}
              <div>
                <label className="text-xs font-medium text-[var(--on-surface-variant)] uppercase tracking-wide mb-1.5 block">Urutan</label>
                <select value={exportOrder} onChange={e => setExportOrder(e.target.value)}
                  className="w-full h-11 px-4 rounded-xl border border-[var(--outline-variant)] bg-[var(--surface-container-lowest)] text-sm text-[var(--on-surface)] focus:outline-none focus:ring-2 focus:ring-emerald-500">
                  <option value="nama_az">Nama A–Z</option>
                  <option value="nama_za">Nama Z–A</option>
                  <option value="alamat_az">Alamat A–Z</option>
                  {exportType === "pemberian" && <option value="nominal_desc">Nominal terbesar</option>}
                  {exportType === "pemberian" && <option value="waktu_desc">Waktu terbaru</option>}
                </select>
              </div>
            </div>

            <div className="flex gap-2 px-6 pb-5">
              <button onClick={() => setExportModal(false)} className="flex-1 h-11 rounded-xl border border-[var(--outline-variant)] text-sm text-[var(--on-surface)] hover:bg-[var(--surface-container)] transition-colors">Batal</button>
              <button onClick={() => handleExport("excel")} className="h-11 px-4 rounded-xl border border-[var(--outline-variant)] text-sm text-[var(--on-surface)] hover:bg-[var(--surface-container)] transition-colors flex items-center gap-1.5">
                <FileSpreadsheet size={15} /> CSV
              </button>
              <button onClick={() => handleExport("pdf")} className="flex-1 h-11 rounded-xl bg-emerald-600 text-white font-semibold text-sm hover:bg-emerald-700 transition-colors">PDF</button>
            </div>
          </div>
        </Modal>
      )}

      {/* Edit Buku Tamu */}
      {editBook && (
        <Modal onClose={() => setEditBook(null)}>
          <form onSubmit={handleUpdateBook} className="bg-[var(--surface-container-lowest)] rounded-2xl p-6 border border-[var(--outline-variant)] shadow-xl space-y-3.5">
            <h3 className="font-semibold text-[var(--on-surface)]">Edit Buku Tamu</h3>
            <input value={editBookData.nama} onChange={e => setEditBookData({ ...editBookData, nama: e.target.value })} required placeholder="Nama" className={inputCls} />
            <input value={editBookData.alamat} onChange={e => setEditBookData({ ...editBookData, alamat: e.target.value })} required placeholder="Alamat" className={inputCls} />
            <div className="flex gap-2 pt-1">
              <button type="button" onClick={() => setEditBook(null)} className="flex-1 h-11 rounded-xl border border-[var(--outline-variant)] text-sm text-[var(--on-surface)] hover:bg-[var(--surface-container)] transition-colors">Batal</button>
              <button type="submit" className="flex-1 h-11 rounded-xl bg-emerald-600 text-white font-medium text-sm hover:bg-emerald-700 transition-colors">Simpan</button>
            </div>
          </form>
        </Modal>
      )}

      {/* Edit Pemberian */}
      {editGuest && (
        <Modal onClose={() => setEditGuest(null)}>
          <form onSubmit={handleUpdateGuest} className="bg-[var(--surface-container-lowest)] rounded-2xl p-6 border border-[var(--outline-variant)] shadow-xl space-y-3.5">
            <h3 className="font-semibold text-[var(--on-surface)]">Edit Pemberian</h3>
            <input value={editGuestData.nama} onChange={e => setEditGuestData({ ...editGuestData, nama: e.target.value })} required placeholder="Nama" className={inputCls} />
            <input value={editGuestData.alamat} onChange={e => setEditGuestData({ ...editGuestData, alamat: e.target.value })} required placeholder="Alamat" className={inputCls} />
            <div className="relative">
              <span className="absolute left-4 top-1/2 -translate-y-1/2 text-xs font-bold text-[var(--on-surface-variant)]">Rp</span>
              <input value={editGuestData.nominal} onChange={e => setEditGuestData({ ...editGuestData, nominal: e.target.value.replace(/\D/g, "") })} required className={`${inputCls} pl-9 font-semibold`} placeholder="Nominal" />
            </div>
            <select value={editGuestData.metode} onChange={e => setEditGuestData({ ...editGuestData, metode: e.target.value })}
              className="w-full h-11 px-4 rounded-xl border border-[var(--outline-variant)] bg-[var(--surface-container-lowest)] text-sm focus:outline-none">
              <option>AMPLOP</option><option>CASH</option><option>QRIS</option><option>TRANSFER</option><option>BARANG</option>
            </select>
            <input value={editGuestData.catatan} onChange={e => setEditGuestData({ ...editGuestData, catatan: e.target.value })} placeholder="Catatan (opsional)" className={inputCls} maxLength={200} />
            <div className="flex gap-2 pt-1">
              <button type="button" onClick={() => setEditGuest(null)} className="flex-1 h-11 rounded-xl border border-[var(--outline-variant)] text-sm text-[var(--on-surface)] hover:bg-[var(--surface-container)] transition-colors">Batal</button>
              <button type="submit" className="flex-1 h-11 rounded-xl bg-emerald-600 text-white font-medium text-sm hover:bg-emerald-700 transition-colors">Simpan</button>
            </div>
          </form>
        </Modal>
      )}

      {/* Mobile bottom padding */}
      <div className="lg:hidden h-16" />
    </div>
  );
}
