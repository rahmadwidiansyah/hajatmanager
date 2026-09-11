"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { formatRupiah } from "@/lib/utils";

type Member = { id: string; role: string; user: { id: string; name: string; email: string; image?: string } };
type GuestBook = { id: string; nama: string; alamat: string };
type Guest = { id: string; nama: string; alamat: string; nominal: number; metode: string; catatan?: string; createdAt: string };
type Rekap = { totalTamu: number; totalNominal: number; perAlamat: { alamat: string; jumlah: number; total: number }[]; perMetode: { metode: string; jumlah: number; total: number }[] };

export default function EventClient({ eventId, userEmail, userName }: { eventId: string; userEmail: string; userName: string }) {
  const [event, setEvent] = useState<{ namaAcara: string; tanggal: string; lokasi?: string; myRole: string } | null>(null);
  const [tab, setTab] = useState<"pemberian" | "buku" | "rekap" | "setting">("pemberian");
  const [loading, setLoading] = useState(true);

  // pemberian state
  const [nama, setNama] = useState("");
  const [alamat, setAlamat] = useState("");
  const [nominalStr, setNominalStr] = useState("");
  const [metode, setMetode] = useState("AMPLOP");
  const [catatan, setCatatan] = useState("");
  const [suggest, setSuggest] = useState<{ nama: string; alamat: string; source: string }[]>([]);
  const [shortcuts, setShortcuts] = useState<{ alamatTop: { alamat: string; jumlah: number }[]; nominalTop: { nominal: number; jumlah: number }[] }>({ alamatTop: [], nominalTop: [] });
  const [guests, setGuests] = useState<Guest[]>([]);
  const [guestTotal, setGuestTotal] = useState(0);
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState("createdAt");
  const [order, setOrder] = useState("desc");

  // buku tamu
  const [books, setBooks] = useState<GuestBook[]>([]);
  const [bookNama, setBookNama] = useState("");
  const [bookAlamat, setBookAlamat] = useState("");
  const [bookSearch, setBookSearch] = useState("");

  // members
  const [members, setMembers] = useState<Member[]>([]);
  const [searchUser, setSearchUser] = useState("");
  const [searchResults, setSearchResults] = useState<{ id: string; name: string; email: string }[]>([]);
  const [addRole, setAddRole] = useState("VIEWER");

  const [rekap, setRekap] = useState<Rekap | null>(null);
  const [exportOrder, setExportOrder] = useState("nama_az");
  const [groupBy, setGroupBy] = useState(false);

  // duplicate handling
  const [liveDup, setLiveDup] = useState<null | { nama: string; alamat: string; nominalFormatted: string; nominal: number; metode: string }>(null);
  const [dupModal, setDupModal] = useState<null | { existing: { nama: string; alamat: string; nominalFormatted: string; nominal: number; metode: string; createdAt: string }; message: string }>(null);
  const [dupNote, setDupNote] = useState("");

  async function loadEvent() {
    const res = await fetch(`/api/events/${eventId}`);
    if (res.ok) setEvent(await res.json());
  }
  async function loadGuests() {
    const qs = new URLSearchParams({ q: search, sort, order, page: "1", limit: "50" });
    const res = await fetch(`/api/events/${eventId}/guests?${qs}`);
    if (res.ok) {
      const j = await res.json();
      setGuests(j.data);
      setGuestTotal(j.total);
    }
  }
  async function loadShortcuts() {
    const res = await fetch(`/api/events/${eventId}/guests/shortcuts`);
    if (res.ok) setShortcuts(await res.json());
  }
  async function loadBooks() {
    const res = await fetch(`/api/events/${eventId}/guestbooks?q=${encodeURIComponent(bookSearch)}`);
    if (res.ok) setBooks(await res.json());
  }
  async function loadMembers() {
    const res = await fetch(`/api/events/${eventId}/members`);
    if (res.ok) setMembers(await res.json());
  }
  async function loadRekap() {
    const res = await fetch(`/api/events/${eventId}/rekap`);
    if (res.ok) setRekap(await res.json());
  }

  useEffect(() => {
    loadEvent().then(() => setLoading(false));
    loadGuests();
    loadShortcuts();
    loadBooks();
    loadMembers();
    loadRekap();
  }, []);

  useEffect(() => { loadGuests(); }, [search, sort, order]);
  useEffect(() => { loadBooks(); }, [bookSearch]);
  useEffect(() => {
    if (tab === "rekap") loadRekap();
  }, [tab]);

  // suggest debounce
  useEffect(() => {
    if (nama.length < 2) { setSuggest([]); return; }
    const t = setTimeout(async () => {
      const res = await fetch(`/api/events/${eventId}/guests/suggest?q=${encodeURIComponent(nama)}`);
      if (res.ok) setSuggest(await res.json());
    }, 250);
    return () => clearTimeout(t);
  }, [nama]);

  // search user debounce
  useEffect(() => {
    if (searchUser.length < 2) { setSearchResults([]); return; }
    const t = setTimeout(async () => {
      const res = await fetch(`/api/users/search?q=${encodeURIComponent(searchUser)}`);
      if (res.ok) setSearchResults(await res.json());
    }, 300);
    return () => clearTimeout(t);
  }, [searchUser]);

  // live duplicate check (nama+alamat)
  useEffect(() => {
    if (nama.trim().length < 2 || alamat.trim().length < 2) { setLiveDup(null); return; }
    const t = setTimeout(async () => {
      const qs = new URLSearchParams({ nama: nama.trim(), alamat: alamat.trim() });
      const res = await fetch(`/api/events/${eventId}/guests/check?${qs}`);
      if (res.ok) {
        const j = await res.json();
        if (j.exists) setLiveDup(j.existing);
        else setLiveDup(null);
      }
    }, 400);
    return () => clearTimeout(t);
  }, [nama, alamat]);

  async function handleSubmitPemberian(e: React.FormEvent) {
    e.preventDefault();
    const nominal = parseInt(nominalStr.replace(/\D/g, ""), 10);
    if (!nominal || nominal <= 0) { alert("Nominal harus >0"); return; }
    const res = await fetch(`/api/events/${eventId}/guests`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ nama, alamat, nominal, metode, catatan }),
    });
    const data = await res.json();
    if (res.status === 409 && data.error === "DUPLICATE_NEED_NOTE") {
      setDupNote(catatan);
      setDupModal({ existing: data.existing, message: data.message });
      return;
    }
    if (!res.ok) { alert(data.error || data.message || "Gagal"); return; }
    setNama(""); setAlamat(""); setNominalStr(""); setCatatan(""); setSuggest([]); setLiveDup(null);
    loadGuests(); loadShortcuts(); loadRekap();
  }

  async function handleSubmitDuplicate() {
    if (!dupModal) return;
    if (!dupNote.trim()) { alert("Catatan wajib diisi untuk bedakan duplikat"); return; }
    const nominal = parseInt(nominalStr.replace(/\D/g, ""), 10);
    const res = await fetch(`/api/events/${eventId}/guests`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ nama, alamat, nominal, metode, catatan: dupNote }),
    });
    const data = await res.json();
    if (!res.ok) { alert(data.error || "Gagal"); return; }
    setDupModal(null); setDupNote("");
    setNama(""); setAlamat(""); setNominalStr(""); setCatatan(""); setSuggest([]); setLiveDup(null);
    loadGuests(); loadShortcuts(); loadRekap();
  }

  async function handleAddBook(e: React.FormEvent) {
    e.preventDefault();
    const res = await fetch(`/api/events/${eventId}/guestbooks`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ nama: bookNama, alamat: bookAlamat }) });
    if (res.ok) { setBookNama(""); setBookAlamat(""); loadBooks(); }
  }

  async function handleAddMember(userId: string) {
    const res = await fetch(`/api/events/${eventId}/members`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ userId, role: addRole }) });
    const data = await res.json();
    if (!res.ok) { alert(data.error); return; }
    setSearchUser(""); setSearchResults([]); loadMembers();
  }

  async function handleDeleteGuest(id: string) {
    if (!confirm("Hapus data ini?")) return;
    await fetch(`/api/guests/${id}`, { method: "DELETE" });
    loadGuests(); loadShortcuts(); loadRekap();
  }

  async function handleExport(type: "excel" | "pdf") {
    // Export SELALU semua data di DB untuk event ini (abaikan filter/search), total di footer selalu total semua
    const res = await fetch(`/api/events/${eventId}/guests?limit=1000`);
    if (!res.ok) return;
    const j = await res.json();
    const data: Guest[] = j.data;
    // sort by exportOrder
    let sorted = [...data];
    if (exportOrder === "nama_az") sorted.sort((a,b)=>a.nama.localeCompare(b.nama));
    if (exportOrder === "nama_za") sorted.sort((a,b)=>b.nama.localeCompare(a.nama));
    if (exportOrder === "alamat_az") sorted.sort((a,b)=>a.alamat.localeCompare(b.alamat) || a.nama.localeCompare(b.nama));
    if (exportOrder === "nominal_desc") sorted.sort((a,b)=>b.nominal-a.nominal);
    if (exportOrder === "waktu_desc") sorted.sort((a,b)=>new Date(b.createdAt).getTime()-new Date(a.createdAt).getTime());

    const totalNominal = sorted.reduce((s,g)=>s+g.nominal,0);
    const totalTamu = sorted.length;

    if (type === "excel") {
      // CSV yang bisa dibuka Excel — selalu semua data + footer TOTAL
      let csv = `Laporan Pemberian: ${event?.namaAcara || "Acara"}\n`;
      csv += `Tanggal Export: ${new Date().toLocaleString("id-ID")}\n`;
      csv += `Total: ${totalTamu} tamu, ${totalNominal} (${formatRupiah(totalNominal)})\n\n`;
      csv += "No,Nama,Alamat,Nominal,Metode,Catatan,Waktu\n";
      sorted.forEach((g,i)=> {
        csv += `${i+1},"${g.nama}","${g.alamat}",${g.nominal},${g.metode},"${(g.catatan||"").replace(/"/g,'""')}",${g.createdAt}\n`;
      });
      // footer TOTAL selalu ada (sesuai request)
      csv += `\nTOTAL,,,${totalNominal},,,${totalTamu} tamu\n`;
      csv += `TOTAL_RUPIAH,,,${formatRupiah(totalNominal)}\n`;
      if (groupBy) {
        csv += "\nRekap Per Alamat\n";
        const map = new Map<string,{jumlah:number,total:number}>();
        sorted.forEach(g=>{
          const cur = map.get(g.alamat) || {jumlah:0,total:0};
          cur.jumlah++; cur.total+=g.nominal; map.set(g.alamat,cur);
        });
        csv += "Alamat,Jumlah,Total,Total Rupiah\n";
        map.forEach((v,k)=> csv += `"${k}",${v.jumlah},${v.total},${formatRupiah(v.total)}\n`);
        csv += `TOTAL,${totalTamu},${totalNominal},${formatRupiah(totalNominal)}\n`;
      }
      const blob = new Blob([csv], {type:"text/csv;charset=utf-8;"});
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a"); a.href=url; a.download=`${event?.namaAcara||"acara"}-export-${new Date().toISOString().slice(0,10)}.csv`; a.click(); URL.revokeObjectURL(url);
    } else {
      // PDF via window.print — selalu semua data + TOTAL di footer
      const w = window.open("", "_blank");
      if (!w) return;
      let html = `<html><head><title>${event?.namaAcara} - Laporan</title><style>body{font-family: sans-serif; font-size: 12px} table{width:100%;border-collapse:collapse} th,td{border:1px solid #ccc; padding:6px; text-align:left} tfoot td{font-weight:bold; background:#f5f5f5} h2{margin-bottom:4px} .total{margin-top:12px; font-size:14px; font-weight:bold; text-align:right; border-top:2px solid #000; padding-top:8px}</style></head><body>`;
      html += `<h2>${event?.namaAcara} — Laporan Pemberian</h2><p>Tanggal: ${new Date().toLocaleString("id-ID")} | Dicetak oleh ${userName} (${userEmail})</p>`;
      html += `<p>Total: <strong>${totalTamu} tamu</strong> — <strong>${formatRupiah(totalNominal)}</strong> (${totalNominal})</p>`;
      html += `<table><thead><tr><th>No</th><th>Nama</th><th>Alamat</th><th>Nominal</th><th>Metode</th><th>Catatan</th><th>Waktu</th></tr></thead><tbody>`;
      sorted.forEach((g,i)=> html += `<tr><td>${i+1}</td><td>${g.nama}</td><td>${g.alamat}</td><td>${formatRupiah(g.nominal)}</td><td>${g.metode}</td><td>${g.catatan||""}</td><td>${new Date(g.createdAt).toLocaleString("id-ID")}</td></tr>`);
      html += `</tbody><tfoot><tr><td colspan="3" style="text-align:right">TOTAL</td><td>${formatRupiah(totalNominal)}</td><td colspan="2">${totalTamu} tamu</td><td>${totalNominal}</td></tr></tfoot></table>`;
      html += `<div class="total">TOTAL KESELURUHAN: ${formatRupiah(totalNominal)} — ${totalTamu} tamu</div>`;
      if (groupBy && rekap) {
        html += `<h3 style="margin-top:20px">Rekap Per Alamat</h3><table><thead><tr><th>Alamat</th><th>Jumlah</th><th>Total</th></tr></thead><tbody>`;
        rekap.perAlamat.forEach(r=> html += `<tr><td>${r.alamat}</td><td>${r.jumlah}</td><td>${formatRupiah(r.total)}</td></tr>`);
        html += `</tbody><tfoot><tr><td>TOTAL</td><td>${totalTamu}</td><td>${formatRupiah(totalNominal)}</td></tr></tfoot></table>`;
      }
      html += `<p style="margin-top:20px; font-size:10px; color:#666">Laporan ini mencakup SEMUA data di database untuk event ini (bukan filter tabel). Diekspor pada ${new Date().toLocaleString("id-ID")}</p>`;
      html += `</body></html>`;
      w.document.write(html); w.document.close(); setTimeout(()=>w.print(), 300);
    }
  }

  if (loading) return <div className="p-8 text-center">Memuat...</div>;
  if (!event) return <div className="p-8">Acara tidak ditemukan atau tidak punya akses</div>;

  const isEditor = event.myRole === "OWNER" || event.myRole === "ADMIN";
  const totalNominal = rekap?.totalNominal ?? 0;

  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-black">
      <header className="bg-white dark:bg-zinc-900 border-b">
        <div className="mx-auto max-w-6xl px-4 py-4 flex flex-wrap gap-3 justify-between items-center">
          <div>
            <Link href="/dashboard" className="text-xs text-zinc-500 underline">← Dashboard</Link>
            <h1 className="font-bold text-lg">{event.namaAcara}</h1>
            <p className="text-xs text-zinc-500">{new Date(event.tanggal).toLocaleDateString("id-ID")} • {event.lokasi || "-"} • Peran: {event.myRole}</p>
          </div>
          <div className="flex gap-2 text-xs">
            <span className="px-3 py-1 rounded-full bg-zinc-100 border">{rekap?.totalTamu ?? 0} tamu</span>
            <span className="px-3 py-1 rounded-full bg-emerald-50 border border-emerald-200 text-emerald-700">{formatRupiah(totalNominal)}</span>
          </div>
        </div>
        <div className="mx-auto max-w-6xl px-4 flex gap-2 border-t">
          {(["pemberian","buku","rekap","setting"] as const).map(t=> (
            <button key={t} onClick={()=>setTab(t)} className={`px-4 py-3 text-sm border-b-2 ${tab===t ? "border-black font-semibold" : "border-transparent text-zinc-500"}`}>
              {t==="pemberian"?"Pemberian":t==="buku"?"Buku Tamu":t==="rekap"?"Rekap":"Setting"}
            </button>
          ))}
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-4 py-6">
        {tab==="pemberian" && (
          <div className="grid lg:grid-cols-3 gap-6">
            <div className="lg:col-span-1">
              <div className="bg-white dark:bg-zinc-900 border rounded-2xl p-5">
                <h3 className="font-semibold">Input Pemberian</h3>
                {!isEditor && <p className="text-xs text-amber-700 bg-amber-50 p-2 rounded mt-2">Kamu VIEWER — tidak bisa input, hanya lihat</p>}
                <form onSubmit={handleSubmitPemberian} className="mt-4 space-y-3">
                  <div className="relative">
                    <label className="text-sm font-medium">Nama Lengkap *</label>
                    <input value={nama} onChange={e=>setNama(e.target.value)} required disabled={!isEditor} placeholder="Ketik min 2 huruf" className="mt-1 w-full px-3 py-2.5 rounded-xl border disabled:bg-zinc-100" />
                    {suggest.length>0 && (
                      <div className="absolute z-10 w-full bg-white border rounded-xl shadow mt-1 max-h-40 overflow-auto">
                        {suggest.map((s,i)=> (
                          <button key={i} type="button" onClick={()=>{setNama(s.nama); setAlamat(s.alamat); setSuggest([])}} className="w-full text-left px-3 py-2 hover:bg-zinc-50 text-sm">
                            <span className="font-medium">{s.nama}</span> <span className="text-zinc-500">— {s.alamat}</span> <span className="text-xs ml-1 px-1 rounded bg-zinc-100">{s.source}</span>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                  <div>
                    <label className="text-sm font-medium">Alamat *</label>
                    <input value={alamat} onChange={e=>setAlamat(e.target.value)} required disabled={!isEditor} placeholder="Krajan" className="mt-1 w-full px-3 py-2.5 rounded-xl border disabled:bg-zinc-100" />
                    {shortcuts.alamatTop.length>0 && (
                      <div className="mt-2 flex flex-wrap gap-1">
                        {shortcuts.alamatTop.map(a=> (
                          <button key={a.alamat} type="button" onClick={()=>setAlamat(a.alamat)} className="px-2.5 py-1 rounded-full bg-zinc-100 border text-xs hover:bg-zinc-200">{a.alamat} ({a.jumlah})</button>
                        ))}
                      </div>
                    )}
                  </div>
                  {liveDup && (
                    <div className="p-2 rounded-xl bg-amber-50 border border-amber-200 text-xs text-amber-800">
                      ⚠️ Sudah tercatat: <strong>{liveDup.nama} — {liveDup.alamat}</strong> dengan {liveDup.nominalFormatted} ({liveDup.metode}). Wajib isi <strong>catatan</strong> agar tidak sama (contoh: Krajan Lor, anak Pak RT).
                    </div>
                  )}
                  <div>
                    <label className="text-sm font-medium">Nominal (Rp) *</label>
                    <input value={nominalStr} onChange={e=>setNominalStr(e.target.value.replace(/\D/g,""))} required disabled={!isEditor} placeholder="100000" className="mt-1 w-full px-3 py-2.5 rounded-xl border disabled:bg-zinc-100" />
                    {nominalStr && <p className="text-xs text-zinc-500 mt-1">{formatRupiah(parseInt(nominalStr||"0",10))}</p>}
                    {shortcuts.nominalTop.length>0 && (
                      <div className="mt-2 flex flex-wrap gap-1">
                        {shortcuts.nominalTop.map(n=> (
                          <button key={n.nominal} type="button" onClick={()=>setNominalStr(String(n.nominal))} className="px-2.5 py-1 rounded-full bg-emerald-50 border border-emerald-200 text-emerald-700 text-xs hover:bg-emerald-100">{formatRupiah(n.nominal)} ({n.jumlah})</button>
                        ))}
                      </div>
                    )}
                    <div className="mt-2 flex flex-wrap gap-1">
                      {[20000,50000,100000,200000].map(v=> (
                        <button key={v} type="button" onClick={()=>setNominalStr(String(v))} className="px-2 py-1 rounded-full bg-white border text-xs">{formatRupiah(v)}</button>
                      ))}
                    </div>
                  </div>
                  <div>
                    <label className="text-sm font-medium">Metode</label>
                    <select value={metode} onChange={e=>setMetode(e.target.value)} disabled={!isEditor} className="mt-1 w-full px-3 py-2.5 rounded-xl border disabled:bg-zinc-100">
                      <option value="AMPLOP">AMPLOP (default)</option>
                      <option value="CASH">CASH</option>
                      <option value="QRIS">QRIS</option>
                      <option value="TRANSFER">TRANSFER</option>
                      <option value="BARANG">BARANG</option>
                    </select>
                  </div>
                  <div>
                    <label className="text-sm font-medium">Catatan {liveDup && <span className="text-amber-700">* wajib (duplikat)</span>}</label>
                    <input value={catatan} onChange={e=>setCatatan(e.target.value)} disabled={!isEditor} placeholder={liveDup ? "Wajib: Krajan Lor / titip salam keluarga" : "Titip salam"} className={`mt-1 w-full px-3 py-2.5 rounded-xl border disabled:bg-zinc-100 ${liveDup ? "border-amber-300 focus:ring-amber-500" : ""}`} maxLength={200} />
                    {liveDup && <p className="text-xs text-amber-700 mt-1">Isi catatan untuk bedakan dengan yang sudah tercatat</p>}
                  </div>
                  <button disabled={!isEditor} type="submit" className="w-full py-3 rounded-xl bg-black text-white hover:bg-zinc-800 disabled:opacity-50">Simpan</button>
                </form>
              </div>

              <div className="mt-4 bg-white dark:bg-zinc-900 border rounded-2xl p-5">
                <h4 className="font-semibold text-sm">Export</h4>
                <div className="mt-3 space-y-2">
                  <label className="text-xs">Urutkan</label>
                  <select value={exportOrder} onChange={e=>setExportOrder(e.target.value)} className="w-full px-3 py-2 rounded-xl border text-sm">
                    <option value="nama_az">Nama A-Z</option>
                    <option value="nama_za">Nama Z-A</option>
                    <option value="alamat_az">Alamat A-Z (lalu Nama)</option>
                    <option value="nominal_desc">Nominal terbesar</option>
                    <option value="waktu_desc">Waktu input terbaru</option>
                  </select>
                  <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={groupBy} onChange={e=>setGroupBy(e.target.checked)} /> Group by alamat (subtotal per desa)</label>
                  <div className="flex gap-2">
                    <button onClick={()=>handleExport("excel")} className="flex-1 py-2 rounded-xl bg-emerald-600 text-white text-sm">Excel/CSV</button>
                    <button onClick={()=>handleExport("pdf")} className="flex-1 py-2 rounded-xl border text-sm">PDF</button>
                  </div>
                </div>
              </div>
            </div>

            <div className="lg:col-span-2">
              <div className="bg-white dark:bg-zinc-900 border rounded-2xl p-4">
                <div className="flex flex-wrap gap-2 items-center">
                  <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Cari nama/alamat" className="flex-1 min-w-[180px] px-3 py-2 rounded-xl border text-sm" />
                  <select value={sort} onChange={e=>setSort(e.target.value)} className="px-3 py-2 rounded-xl border text-sm">
                    <option value="createdAt">Waktu</option>
                    <option value="nama">Nama</option>
                    <option value="alamat">Alamat</option>
                    <option value="nominal">Nominal</option>
                  </select>
                  <select value={order} onChange={e=>setOrder(e.target.value)} className="px-3 py-2 rounded-xl border text-sm">
                    <option value="desc">Desc</option>
                    <option value="asc">Asc</option>
                  </select>
                </div>
                <p className="text-xs text-zinc-500 mt-2">{guestTotal} data • tampil {guests.length}</p>
                <div className="mt-3 overflow-auto">
                  <table className="w-full text-sm">
                    <thead className="text-xs text-zinc-500 border-b">
                      <tr><th className="text-left py-2">No</th><th className="text-left">Nama</th><th className="text-left">Alamat</th><th className="text-right">Nominal</th><th className="text-left">Metode</th><th></th></tr>
                    </thead>
                    <tbody>
                      {guests.map((g,i)=> (
                        <tr key={g.id} className="border-b last:border-0">
                          <td className="py-2">{i+1}</td>
                          <td className="font-medium">{g.nama}</td>
                          <td>{g.alamat}</td>
                          <td className="text-right">{formatRupiah(g.nominal)}</td>
                          <td><span className="px-2 py-1 rounded-full bg-zinc-100 border text-xs">{g.metode}</span></td>
                          <td className="text-right">
                            {isEditor && <button onClick={()=>handleDeleteGuest(g.id)} className="text-xs px-2 py-1 rounded border hover:bg-red-50 text-red-600">Hapus</button>}
                          </td>
                        </tr>
                      ))}
                      {guests.length===0 && <tr><td colSpan={6} className="py-8 text-center text-zinc-500">Belum ada data</td></tr>}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          </div>
        )}

        {tab==="buku" && (
          <div className="grid md:grid-cols-2 gap-6">
            <div className="bg-white dark:bg-zinc-900 border rounded-2xl p-5">
              <h3 className="font-semibold">Tambah Buku Tamu</h3>
              <form onSubmit={handleAddBook} className="mt-4 space-y-3">
                <input value={bookNama} onChange={e=>setBookNama(e.target.value)} required disabled={!isEditor} placeholder="Nama" className="w-full px-3 py-2.5 rounded-xl border disabled:bg-zinc-100" />
                <input value={bookAlamat} onChange={e=>setBookAlamat(e.target.value)} required disabled={!isEditor} placeholder="Alamat" className="w-full px-3 py-2.5 rounded-xl border disabled:bg-zinc-100" />
                <button disabled={!isEditor} type="submit" className="w-full py-2.5 rounded-xl bg-black text-white disabled:opacity-50">Tambah</button>
              </form>
              <p className="text-xs text-zinc-500 mt-3">Buku tamu jadi master suggest saat input pemberian. Interval input bulk via API: POST /api/events/{`{id}`}/guestbooks dengan body {`{bulk: [{nama, alamat}]}`}</p>
            </div>
            <div className="bg-white dark:bg-zinc-900 border rounded-2xl p-5">
              <div className="flex items-center justify-between">
                <h3 className="font-semibold">Daftar Buku Tamu ({books.length})</h3>
                <input value={bookSearch} onChange={e=>setBookSearch(e.target.value)} placeholder="Cari" className="px-3 py-1.5 rounded-xl border text-sm" />
              </div>
              <div className="mt-3 max-h-[400px] overflow-auto divide-y">
                {books.map(b=> (
                  <div key={b.id} className="py-2 flex justify-between items-center">
                    <div><p className="font-medium text-sm">{b.nama}</p><p className="text-xs text-zinc-500">{b.alamat}</p></div>
                    {isEditor && <button onClick={async()=>{ await fetch(`/api/guestbooks/${b.id}`,{method:"DELETE"}); loadBooks(); }} className="text-xs px-2 py-1 border rounded">Hapus</button>}
                  </div>
                ))}
                {books.length===0 && <p className="py-8 text-center text-zinc-500 text-sm">Kosong</p>}
              </div>
            </div>
          </div>
        )}

        {tab==="rekap" && rekap && (
          <div className="grid md:grid-cols-2 gap-6">
            <div className="bg-white dark:bg-zinc-900 border rounded-2xl p-6">
              <h3 className="font-semibold">Ringkasan</h3>
              <div className="mt-4 grid grid-cols-2 gap-3">
                <div className="p-4 rounded-xl bg-zinc-50 border"><p className="text-xs text-zinc-500">Total Tamu</p><p className="text-2xl font-bold">{rekap.totalTamu}</p></div>
                <div className="p-4 rounded-xl bg-emerald-50 border border-emerald-200"><p className="text-xs text-emerald-700">Total Nominal</p><p className="text-xl font-bold text-emerald-700">{formatRupiah(rekap.totalNominal)}</p></div>
              </div>
              <h4 className="font-semibold mt-6 text-sm">Per Metode</h4>
              <table className="w-full text-sm mt-2">
                <thead className="text-xs text-zinc-500"><tr><th className="text-left">Metode</th><th className="text-right">Jumlah</th><th className="text-right">Total</th></tr></thead>
                <tbody>
                  {rekap.perMetode.map(m=> <tr key={m.metode} className="border-t"><td>{m.metode}</td><td className="text-right">{m.jumlah}</td><td className="text-right">{formatRupiah(m.total)}</td></tr>)}
                </tbody>
              </table>
            </div>
            <div className="bg-white dark:bg-zinc-900 border rounded-2xl p-6">
              <h3 className="font-semibold">Per Alamat (Desa)</h3>
              <p className="text-xs text-zinc-500">Top desa paling banyak pemberian</p>
              <table className="w-full text-sm mt-3">
                <thead className="text-xs text-zinc-500"><tr><th className="text-left">Alamat</th><th className="text-right">Jumlah</th><th className="text-right">Total</th></tr></thead>
                <tbody>
                  {rekap.perAlamat.map(a=> <tr key={a.alamat} className="border-t"><td>{a.alamat}</td><td className="text-right">{a.jumlah}</td><td className="text-right">{formatRupiah(a.total)}</td></tr>)}
                  {rekap.perAlamat.length===0 && <tr><td colSpan={3} className="py-8 text-center text-zinc-500">Belum ada data</td></tr>}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {tab==="setting" && (
          <div className="grid md:grid-cols-2 gap-6">
            <div className="bg-white dark:bg-zinc-900 border rounded-2xl p-6">
              <h3 className="font-semibold">Kelola Anggota (Unlimited)</h3>
              <p className="text-xs text-zinc-500 mt-1">OWNER bisa add anggota tak terbatas via search user</p>
              {event.myRole!=="OWNER" && <p className="text-xs text-amber-700 bg-amber-50 p-2 rounded mt-3">Hanya OWNER bisa kelola anggota</p>}
              <div className="mt-4">
                <label className="text-sm font-medium">Cari User (nama/email)</label>
                <input value={searchUser} onChange={e=>setSearchUser(e.target.value)} placeholder="Ketik min 2 huruf" className="mt-1 w-full px-3 py-2.5 rounded-xl border" disabled={event.myRole!=="OWNER"} />
                <div className="mt-2 flex gap-2 items-center">
                  <select value={addRole} onChange={e=>setAddRole(e.target.value)} className="px-3 py-2 rounded-xl border text-sm" disabled={event.myRole!=="OWNER"}>
                    <option value="VIEWER">VIEWER (lihat saja)</option>
                    <option value="ADMIN">ADMIN (bisa input)</option>
                    <option value="OWNER">OWNER (kelola anggota)</option>
                  </select>
                </div>
                {searchResults.length>0 && (
                  <div className="mt-2 border rounded-xl divide-y">
                    {searchResults.map(u=> (
                      <div key={u.id} className="p-3 flex justify-between items-center">
                        <div><p className="font-medium text-sm">{u.name}</p><p className="text-xs text-zinc-500">{u.email}</p></div>
                        <button onClick={()=>handleAddMember(u.id)} className="px-3 py-1.5 rounded-xl bg-black text-white text-xs">Tambah sebagai {addRole}</button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
              <div className="mt-6">
                <h4 className="font-semibold text-sm">Anggota Saat Ini ({members.length})</h4>
                <div className="mt-2 divide-y border rounded-xl">
                  {members.map(m=> (
                    <div key={m.id} className="p-3 flex justify-between items-center">
                      <div><p className="font-medium text-sm">{m.user.name} <span className="text-xs px-2 py-0.5 rounded-full bg-zinc-100 border">{m.role}</span></p><p className="text-xs text-zinc-500">{m.user.email}</p></div>
                      {event.myRole==="OWNER" && <button onClick={async()=>{ if(!confirm("Hapus anggota?")) return; await fetch(`/api/events/${eventId}/members?userId=${m.user.id}`,{method:"DELETE"}); loadMembers(); }} className="text-xs px-2 py-1 border rounded">Hapus</button>}
                    </div>
                  ))}
                </div>
              </div>
            </div>
            <div className="bg-white dark:bg-zinc-900 border rounded-2xl p-6">
              <h3 className="font-semibold">Info Acara</h3>
              <p className="text-sm mt-2"><span className="text-zinc-500">Nama:</span> {event.namaAcara}</p>
              <p className="text-sm"><span className="text-zinc-500">Tanggal:</span> {new Date(event.tanggal).toLocaleDateString("id-ID")}</p>
              <p className="text-sm"><span className="text-zinc-500">Lokasi:</span> {event.lokasi || "-"}</p>
              <p className="text-xs text-zinc-500 mt-6">Hapus acara (hanya OWNER, akan hapus semua data buku tamu & pemberian)</p>
              <button disabled={event.myRole!=="OWNER"} onClick={async()=>{ if(!confirm("Hapus acara ini permanen?")) return; const res=await fetch(`/api/events/${eventId}`,{method:"DELETE"}); if(res.ok) window.location.href="/dashboard"; }} className="mt-2 px-4 py-2 rounded-xl bg-red-600 text-white text-sm disabled:opacity-50">Hapus Acara</button>
            </div>
          </div>
        )}
      </main>

      {/* Modal duplicate wajib catatan */}
      {dupModal && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center p-4 z-50">
          <div className="bg-white dark:bg-zinc-900 rounded-2xl p-6 w-full max-w-md border">
            <h3 className="font-bold text-lg">Tamu Sudah Tercatat</h3>
            <p className="text-sm text-zinc-600 mt-2">
              <strong>{dupModal.existing.nama} — {dupModal.existing.alamat}</strong> sudah tercatat dengan <strong>{dupModal.existing.nominalFormatted}</strong> ({dupModal.existing.metode}) pada {new Date(dupModal.existing.createdAt).toLocaleString("id-ID")}.
            </p>
            <p className="text-sm mt-3 p-3 rounded-xl bg-amber-50 border border-amber-200 text-amber-800">
              {dupModal.message} — wajib isi <strong>catatan</strong> untuk bedakan, contoh: Krajan Lor, anak Pak RT, titip salam keluarga.
            </p>
            <div className="mt-4">
              <label className="text-sm font-medium">Catatan / Penanda *</label>
              <input value={dupNote} onChange={e=>setDupNote(e.target.value)} autoFocus placeholder="Krajan Lor / titip salam" className="mt-1 w-full px-3 py-2.5 rounded-xl border border-amber-300 focus:ring-amber-500" />
            </div>
            <div className="mt-6 flex gap-2 justify-end">
              <button onClick={()=>{setDupModal(null); setDupNote("");}} className="px-4 py-2 rounded-xl border">Batal</button>
              <button onClick={handleSubmitDuplicate} disabled={!dupNote.trim()} className="px-6 py-2 rounded-xl bg-black text-white disabled:opacity-50">Simpan dengan Catatan</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
