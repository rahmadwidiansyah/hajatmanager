"use client";
import { useState, useEffect } from "react";
import { Avatar } from "@/components/ui/Avatar";
import { Upload, Trash2, Check, AlertCircle, ChevronLeft, Lock, Shield } from "lucide-react";
import Link from "next/link";

type UserData = {
  id: string;
  name: string;
  username: string | null;
  email: string;
  image: string | null;
  avatar: string | null;
  profilePicture: string | null;
  createdAt: string;
};

const inputCls = "w-full h-11 px-4 rounded-xl border border-[var(--outline-variant)] bg-[var(--surface-container-lowest)] text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent transition-shadow placeholder:text-[var(--on-surface-variant)]";
const labelCls = "text-xs font-medium text-[var(--on-surface-variant)] uppercase tracking-wide";

export default function AccountClient({ initialUser }: { initialUser: UserData }) {
  const [user, setUser] = useState<UserData>(initialUser);
  const [name, setName] = useState(initialUser.name);
  const [username, setUsername] = useState(initialUser.username || "");
  const [email, setEmail] = useState(initialUser.email);
  const [profilePic, setProfilePic] = useState<string | null>(initialUser.profilePicture);
  const [uploading, setUploading] = useState(false);
  const [savingProfile, setSavingProfile] = useState(false);
  const [msg, setMsg] = useState<{ type: "ok" | "err"; text: string } | null>(null);
  const [usernameStatus, setUsernameStatus] = useState<"idle" | "checking" | "available" | "taken">("idle");

  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [savingPass, setSavingPass] = useState(false);
  const [passMsg, setPassMsg] = useState<{ type: "ok" | "err"; text: string } | null>(null);

  const [pin, setPin] = useState("");
  const [confirmPin, setConfirmPin] = useState("");
  const [pinMsg, setPinMsg] = useState<{ type: "ok" | "err"; text: string } | null>(null);
  const [hasPin, setHasPin] = useState<boolean | null>(null);
  const [savingPin, setSavingPin] = useState(false);

  useEffect(() => {
    if (!username || username.toLowerCase() === (initialUser.username?.toLowerCase() || "")) {
      setUsernameStatus("idle");
      return;
    }
    if (username.length < 3) { setUsernameStatus("idle"); return; }
    const t = setTimeout(async () => {
      setUsernameStatus("checking");
      const res = await fetch(`/api/users/check?username=${encodeURIComponent(username)}`);
      if (res.ok) {
        const j = await res.json();
        setUsernameStatus(j.available ? "available" : "taken");
      }
    }, 400);
    return () => clearTimeout(t);
  }, [username, initialUser.username]);

  useEffect(() => {
    fetch("/api/users/pin").then((r) => r.json()).then((j) => setHasPin(!!j.hasPin)).catch(() => setHasPin(false));
  }, []);

  async function handleUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 20 * 1024 * 1024) { setMsg({ type: "err", text: "Maksimal 20MB" }); return; }
    setUploading(true);
    setMsg(null);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch("/api/upload", { method: "POST", body: fd });
      const j = await res.json();
      if (!res.ok) throw new Error(j.message || j.error || "Gagal upload");
      setProfilePic(j.url);
      const patch = await fetch("/api/users/me", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ profilePicture: j.url }) });
      const pj = await patch.json();
      if (!patch.ok) throw new Error(pj.message || pj.error || "Gagal simpan");
      setUser((u) => ({ ...u, profilePicture: j.url }));
      setMsg({ type: "ok", text: "Foto berhasil diupload" });
    } catch (err: unknown) {
      setMsg({ type: "err", text: err instanceof Error ? err.message : "Gagal" });
    } finally { setUploading(false); e.target.value = ""; }
  }

  async function handleRemovePic() {
    setMsg(null);
    const res = await fetch("/api/users/me", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ profilePicture: null }) });
    const j = await res.json();
    if (!res.ok) { setMsg({ type: "err", text: j.message || j.error || "Gagal" }); return; }
    setProfilePic(null);
    setUser((u) => ({ ...u, profilePicture: null }));
    setMsg({ type: "ok", text: "Foto dihapus" });
  }

  async function saveProfile(e: React.FormEvent) {
    e.preventDefault();
    if (usernameStatus === "taken") { setMsg({ type: "err", text: "Username sudah dipakai" }); return; }
    setSavingProfile(true);
    setMsg(null);
    try {
      const body: Record<string, unknown> = { name, username: username || undefined, email };
      if (profilePic !== initialUser.profilePicture) body.profilePicture = profilePic;
      const res = await fetch("/api/users/me", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const j = await res.json();
      if (!res.ok) throw new Error(j.message || j.error || JSON.stringify(j.details) || "Gagal");
      setUser(j);
      setMsg({ type: "ok", text: "Profil berhasil diperbarui" });
    } catch (err: unknown) {
      setMsg({ type: "err", text: err instanceof Error ? err.message : "Gagal" });
    } finally { setSavingProfile(false); }
  }

  async function savePassword(e: React.FormEvent) {
    e.preventDefault();
    if (newPassword !== confirmPassword) { setPassMsg({ type: "err", text: "Konfirmasi tidak cocok" }); return; }
    setSavingPass(true);
    setPassMsg(null);
    try {
      const res = await fetch("/api/users/me", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ currentPassword: currentPassword || undefined, newPassword }) });
      const j = await res.json();
      if (!res.ok) throw new Error(j.message || j.error || "Gagal");
      setPassMsg({ type: "ok", text: "Password berhasil diganti" });
      setCurrentPassword(""); setNewPassword(""); setConfirmPassword("");
    } catch (err: unknown) {
      setPassMsg({ type: "err", text: err instanceof Error ? err.message : "Gagal" });
    } finally { setSavingPass(false); }
  }

  async function savePin(e: React.FormEvent) {
    e.preventDefault();
    if (!/^\d{6}$/.test(pin)) { setPinMsg({ type: "err", text: "PIN harus 6 digit angka" }); return; }
    if (pin !== confirmPin) { setPinMsg({ type: "err", text: "Konfirmasi PIN tidak cocok" }); return; }
    setSavingPin(true); setPinMsg(null);
    try {
      const res = await fetch("/api/users/pin", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ pin }) });
      const j = await res.json();
      if (!res.ok) throw new Error(j.message || j.error || "Gagal");
      setPinMsg({ type: "ok", text: "PIN 6 digit berhasil disimpan. Bisa dipakai offline tanpa login internet lagi." });
      setHasPin(true); setPin(""); setConfirmPin("");
      try { localStorage.setItem("appPinHashSet", "1"); } catch {}
    } catch (err: unknown) { setPinMsg({ type: "err", text: err instanceof Error ? err.message : "Gagal" }); }
    finally { setSavingPin(false); }
  }

  async function removePin() {
    if (!confirm("Hapus PIN 6 digit?")) return;
    const res = await fetch("/api/users/pin", { method: "DELETE" });
    if (res.ok) { setHasPin(false); setPinMsg({ type: "ok", text: "PIN dihapus" }); try { localStorage.removeItem("appPinHashSet"); } catch {} }
  }

  const avatarUser = { name: user.name, username: user.username, email: user.email, image: user.image, avatar: user.avatar, profilePicture: profilePic };

  return (
    <div className="min-h-screen bg-[var(--background)]">
      {/* Header */}
      <header className="bg-[var(--surface-container-lowest)] border-b border-[var(--outline-variant)] sticky top-0 z-10">
        <div className="mx-auto max-w-3xl px-5 h-14 flex justify-between items-center">
          <span className="font-bold text-[15px] tracking-tight text-[var(--on-surface)]">Kondangan</span>
          <Link href="/dashboard" className="flex items-center gap-1.5 text-sm text-[var(--on-surface-variant)] hover:text-[var(--on-surface)] transition-colors">
            <ChevronLeft size={16} /> Dashboard
          </Link>
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-5 py-8">
        <h1 className="text-xl font-bold text-[var(--on-surface)] mb-6">Akun Saya</h1>

        <div className="grid md:grid-cols-[200px_1fr] gap-5">
          {/* Foto profil */}
          <div className="bg-[var(--surface-container-lowest)] border border-[var(--outline-variant)] rounded-2xl p-5 text-center h-fit">
            <div className="flex justify-center">
              <Avatar user={avatarUser} size={80} />
            </div>
            <p className="font-semibold text-sm mt-3 text-[var(--on-surface)] truncate">{user.name}</p>
            {user.username && <p className="text-xs text-[var(--on-surface-variant)]">@{user.username}</p>}
            <p className="text-xs text-[var(--on-surface-variant)] mt-0.5 truncate">{user.email}</p>

            <div className="mt-4 space-y-2">
              <label className={`w-full inline-flex items-center justify-center gap-1.5 h-9 px-3 rounded-xl bg-[var(--primary)] text-white text-xs font-medium cursor-pointer hover:opacity-90 transition-opacity ${uploading ? "opacity-50" : ""}`}>
                <Upload size={13} /> {uploading ? "Upload..." : "Ganti Foto"}
                <input type="file" accept="image/*" onChange={handleUpload} className="hidden" disabled={uploading} />
              </label>
              {profilePic && (
                <button onClick={handleRemovePic} className="w-full h-9 px-3 rounded-xl border border-[var(--outline-variant)] text-xs text-red-500 flex items-center justify-center gap-1.5 hover:bg-red-50 dark:hover:bg-red-900/10 transition-colors">
                  <Trash2 size={13} /> Hapus Foto
                </button>
              )}
            </div>

            {msg && (
              <p className={`mt-3 text-xs p-2 rounded-lg ${msg.type === "ok" ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-900/20 dark:text-emerald-400" : "bg-red-50 text-red-600 dark:bg-red-900/20"}`}>
                {msg.text}
              </p>
            )}
          </div>

          {/* Forms */}
          <div className="space-y-4">
            {/* Profil */}
            <form onSubmit={saveProfile} className="bg-[var(--surface-container-lowest)] border border-[var(--outline-variant)] rounded-2xl p-5">
              <h3 className="font-semibold text-[var(--on-surface)] mb-4">Profil</h3>
              <div className="space-y-3.5">
                <div>
                  <label className={labelCls}>Nama *</label>
                  <input value={name} onChange={(e) => setName(e.target.value)} required minLength={2} className={`mt-1.5 ${inputCls}`} placeholder="Nama lengkap" />
                </div>
                <div>
                  <label className={labelCls}>Username *</label>
                  <div className="relative mt-1.5">
                    <span className="absolute left-4 top-1/2 -translate-y-1/2 text-[var(--on-surface-variant)] text-sm">@</span>
                    <input
                      value={username}
                      onChange={(e) => setUsername(e.target.value.toLowerCase().replace(/[^a-z0-9._-]/g, ""))}
                      required minLength={3} maxLength={20}
                      placeholder="username"
                      className={`${inputCls} pl-8 pr-20`}
                    />
                    <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs">
                      {usernameStatus === "checking" && <span className="text-[var(--on-surface-variant)]">Cek...</span>}
                      {usernameStatus === "available" && <span className="text-emerald-600 flex items-center gap-1"><Check size={12} />Tersedia</span>}
                      {usernameStatus === "taken" && <span className="text-red-500 flex items-center gap-1"><AlertCircle size={12} />Dipakai</span>}
                    </span>
                  </div>
                </div>
                <div>
                  <label className={labelCls}>Email *</label>
                  <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required className={`mt-1.5 ${inputCls}`} />
                </div>
              </div>
              <button
                disabled={savingProfile || usernameStatus === "taken"}
                type="submit"
                className="mt-4 w-full h-11 rounded-xl bg-[var(--primary)] text-white font-medium text-sm hover:opacity-90 disabled:opacity-50 transition-opacity"
              >
                {savingProfile ? "Menyimpan..." : "Simpan Profil"}
              </button>
            </form>

            {/* PIN 6 digit untuk offline */}
            <form onSubmit={savePin} className="bg-[var(--surface-container-lowest)] border border-[var(--outline-variant)] rounded-2xl p-5">
              <h3 className="font-semibold text-[var(--on-surface)] mb-1 flex items-center gap-1.5"><Shield size={14} /> PIN Offline 6 Digit</h3>
              <p className="text-xs text-[var(--on-surface-variant)] mb-3">Login online sekali, lalu pakai PIN ini untuk buka app saat offline. Tidak perlu buat password, tidak perlu login Google tiap jam. Background sync 30 menit tetap jalan saat online.</p>
              <div className="text-xs mb-3 px-3 py-2 rounded-lg border flex items-center gap-1.5" style={{ background: hasPin ? "var(--surface-container)" : "#fef3c7", borderColor: hasPin ? "var(--outline-variant)" : "#fcd34d", color: hasPin ? "var(--on-surface-variant)" : "#92400e" }}>
                <Lock size={12} /> Status: {hasPin === null ? "memuat..." : hasPin ? "PIN aktif" : "Belum ada PIN"}
              </div>
              <div className="space-y-3.5">
                <div>
                  <label className={labelCls}>PIN 6 Digit *</label>
                  <input inputMode="numeric" maxLength={6} value={pin} onChange={(e) => setPin(e.target.value.replace(/\D/g, "").slice(0, 6))} placeholder="123456" className={`mt-1.5 ${inputCls} tracking-widest`} />
                </div>
                <div>
                  <label className={labelCls}>Konfirmasi PIN *</label>
                  <input inputMode="numeric" maxLength={6} value={confirmPin} onChange={(e) => setConfirmPin(e.target.value.replace(/\D/g, "").slice(0, 6))} placeholder="Ulangi 6 digit" className={`mt-1.5 ${inputCls} tracking-widest`} />
                </div>
              </div>
              {pinMsg && (
                <p className={`mt-3 text-sm p-3 rounded-xl border ${pinMsg.type === "ok" ? "bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-900/20 dark:text-emerald-400 dark:border-emerald-800" : "bg-red-50 text-red-600 border-red-200 dark:bg-red-900/20 dark:border-red-800"}`}>
                  {pinMsg.text}
                </p>
              )}
              <div className="flex gap-2 mt-4">
                <button disabled={savingPin} type="submit" className="flex-1 h-11 rounded-xl bg-[var(--primary)] text-white font-medium text-sm hover:opacity-90 disabled:opacity-50 transition-opacity">{savingPin ? "Menyimpan..." : hasPin ? "Ganti PIN" : "Simpan PIN"}</button>
                {hasPin && <button type="button" onClick={removePin} className="h-11 px-4 rounded-xl border border-red-200 text-red-500 text-sm hover:bg-red-50 transition-colors">Hapus</button>}
              </div>
            </form>

            {/* Password */}
            <form onSubmit={savePassword} className="bg-[var(--surface-container-lowest)] border border-[var(--outline-variant)] rounded-2xl p-5">
              <h3 className="font-semibold text-[var(--on-surface)] mb-4">Ganti Password</h3>
              <div className="space-y-3.5">
                <div>
                  <label className={labelCls}>Password Lama</label>
                  <input type="password" value={currentPassword} onChange={(e) => setCurrentPassword(e.target.value)} placeholder="Kosongkan jika akun Google" className={`mt-1.5 ${inputCls}`} />
                </div>
                <div>
                  <label className={labelCls}>Password Baru *</label>
                  <input type="password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} required minLength={6} placeholder="Min 6 karakter" className={`mt-1.5 ${inputCls}`} />
                </div>
                <div>
                  <label className={labelCls}>Konfirmasi *</label>
                  <input type="password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} required minLength={6} placeholder="Ulangi password baru" className={`mt-1.5 ${inputCls}`} />
                </div>
              </div>
              {passMsg && (
                <p className={`mt-3 text-sm p-3 rounded-xl border ${passMsg.type === "ok" ? "bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-900/20 dark:text-emerald-400 dark:border-emerald-800" : "bg-red-50 text-red-600 border-red-200 dark:bg-red-900/20 dark:border-red-800"}`}>
                  {passMsg.text}
                </p>
              )}
              <button
                disabled={savingPass}
                type="submit"
                className="mt-4 w-full h-11 rounded-xl border border-[var(--outline-variant)] text-[var(--on-surface)] font-medium text-sm hover:bg-[var(--surface-container)] disabled:opacity-50 transition-colors"
              >
                {savingPass ? "Menyimpan..." : "Ganti Password"}
              </button>
            </form>
          </div>
        </div>
      </main>
    </div>
  );
}
