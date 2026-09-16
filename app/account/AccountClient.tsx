"use client";
import { useState, useEffect, useRef } from "react";
import { Avatar } from "@/components/ui/Avatar";
import { ThemeToggle } from "@/components/ThemeToggle";
import {
  Upload,
  Check,
  AlertCircle,
  ArrowLeft,
  Shield,
  KeyRound,
  ChevronDown,
  Moon,
  Sun,
  X,
} from "lucide-react";
import Link from "next/link";
import { useColorScheme } from "@mui/material/styles";
import { cachePinHash, clearCachedPinHash } from "@/lib/offline-pin";

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

const inputCls =
  "w-full h-12 px-4 rounded-xl border border-[var(--outline-variant)] bg-[var(--surface-container-lowest)] text-sm text-[var(--on-surface)] focus:outline-none focus:ring-2 focus:ring-[var(--primary)] focus:border-transparent transition-shadow placeholder:text-[var(--on-surface-variant)]";
const fieldLabelCls = "text-sm font-medium text-[var(--on-surface)]";
const helperCls = "mt-1 text-xs text-[var(--on-surface-variant)]";
const errorCls = "mt-1 text-xs text-[var(--on-error-container)]";

function Field({
  id,
  label,
  required,
  hint,
  hintId,
  error,
  children,
}: {
  id: string;
  label: string;
  required?: boolean;
  hint?: string;
  hintId?: string;
  error?: string | null;
  children: React.ReactNode;
}) {
  return (
    <div className="min-w-0">
      <label htmlFor={id} className={fieldLabelCls}>
        {label}
        {required && (
          <span aria-hidden className="text-[var(--error)]">
            {" "}
            *
          </span>
        )}
      </label>
      <div className="mt-1.5">{children}</div>
      {error ? (
        <p id={`${id}-error`} role="alert" className={errorCls}>
          {error}
        </p>
      ) : hint ? (
        <p id={hintId} className={helperCls}>
          {hint}
        </p>
      ) : null}
    </div>
  );
}

function Section({
  title,
  desc,
  children,
}: {
  title: string;
  desc?: string;
  children: React.ReactNode;
}) {
  return (
    <section
      aria-label={title}
      className="bg-[var(--surface-container-lowest)] border border-[var(--outline-variant)] rounded-2xl p-5"
    >
      <h2 className="font-semibold text-[var(--on-surface)]">{title}</h2>
      {desc && (
        <p className="text-xs text-[var(--on-surface-variant)] mt-0.5">{desc}</p>
      )}
      <div className="mt-4">{children}</div>
    </section>
  );
}

export default function AccountClient({ initialUser }: { initialUser: UserData }) {
  const [user, setUser] = useState<UserData>(initialUser);
  const [name, setName] = useState(initialUser.name);
  const [username, setUsername] = useState(initialUser.username || "");
  const [email, setEmail] = useState(initialUser.email);
  const [profilePic, setProfilePic] = useState<string | null>(initialUser.profilePicture);
  const [uploading, setUploading] = useState(false);
  const [savingProfile, setSavingProfile] = useState(false);
  const [profileError, setProfileError] = useState<string | null>(null);
  const [usernameStatus, setUsernameStatus] = useState<"idle" | "checking" | "available" | "taken">("idle");

  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [savingPass, setSavingPass] = useState(false);
  const [passError, setPassError] = useState<string | null>(null);

  const [pin, setPin] = useState("");
  const [confirmPin, setConfirmPin] = useState("");
  const [pinError, setPinError] = useState<string | null>(null);
  const [hasPin, setHasPin] = useState<boolean | null>(null);
  const [savingPin, setSavingPin] = useState(false);
  const [pinOpen, setPinOpen] = useState(false);
  const [confirmDeletePin, setConfirmDeletePin] = useState(false);

  const [snack, setSnack] = useState<{ id: number; text: string } | null>(null);

  const { mode, systemMode, setMode } = useColorScheme();
  // Hydration-safe: sebelum mount, paksa render varian terang agar sama dengan SSR.
  // Setelah mount, ikuti tema asli (termasuk system/dark dari OS).
  const [mounted, setMounted] = useState(false);
  // eslint-disable-next-line react-hooks/set-state-in-effect -- pola mounted guard standar anti-hydration-mismatch
  useEffect(() => { setMounted(true); }, []);
  const themeResolved = mounted ? (mode === "system" ? systemMode : mode) : "light";
  const isDark = themeResolved === "dark";

  const deleteDialogRef = useRef<HTMLDivElement>(null);

  function notify(text: string) {
    setSnack({ id: Date.now(), text });
  }

  useEffect(() => {
    if (!snack) return;
    const t = setTimeout(() => setSnack(null), 4000);
    return () => clearTimeout(t);
  }, [snack]);

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

  // Dialog hapus PIN: fokus ke tombol Batal + tutup dengan Escape
  useEffect(() => {
    if (!confirmDeletePin) return;
    deleteDialogRef.current?.querySelector("button")?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setConfirmDeletePin(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [confirmDeletePin]);

  async function handleUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 20 * 1024 * 1024) { notify("Foto maksimal 20MB"); return; }
    setUploading(true);
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
      notify("Foto profil diperbarui");
    } catch (err: unknown) {
      notify(err instanceof Error ? err.message : "Gagal upload foto");
    } finally { setUploading(false); e.target.value = ""; }
  }

  async function handleRemovePic() {
    const res = await fetch("/api/users/me", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ profilePicture: null }) });
    const j = await res.json();
    if (!res.ok) { notify(j.message || j.error || "Gagal hapus foto"); return; }
    setProfilePic(null);
    setUser((u) => ({ ...u, profilePicture: null }));
    notify("Foto profil dihapus");
  }

  function needOnline(): boolean {
    if (typeof navigator !== "undefined" && !navigator.onLine) {
      notify("Kamu sedang offline — ganti profil/password butuh internet.");
      return false;
    }
    return true;
  }

  async function saveProfile(e: React.FormEvent) {
    e.preventDefault();
    if (usernameStatus === "taken") { setProfileError("Username sudah dipakai orang lain"); return; }
    if (!needOnline()) { setProfileError("Kamu sedang offline — simpan profil butuh internet."); return; }
    setSavingProfile(true);
    setProfileError(null);
    try {
      const body: Record<string, unknown> = { name, username: username || undefined, email };
      if (profilePic !== initialUser.profilePicture) body.profilePicture = profilePic;
      const res = await fetch("/api/users/me", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const j = await res.json();
      if (!res.ok) throw new Error(j.message || j.error || JSON.stringify(j.details) || "Gagal");
      setUser(j);
      notify("Profil berhasil diperbarui");
    } catch (err: unknown) {
      if (err instanceof TypeError) setProfileError("Kamu sedang offline — simpan profil butuh internet.");
      else setProfileError(err instanceof Error ? err.message : "Gagal menyimpan profil");
    } finally { setSavingProfile(false); }
  }

  async function savePassword(e: React.FormEvent) {
    e.preventDefault();
    if (newPassword !== confirmPassword) { setPassError("Konfirmasi password tidak cocok"); return; }
    if (!needOnline()) { setPassError("Kamu sedang offline — ganti password butuh internet."); return; }
    setSavingPass(true);
    setPassError(null);
    try {
      const res = await fetch("/api/users/me", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ currentPassword: currentPassword || undefined, newPassword }) });
      const j = await res.json();
      if (!res.ok) throw new Error(j.message || j.error || "Gagal");
      notify("Password berhasil diganti");
      setCurrentPassword(""); setNewPassword(""); setConfirmPassword("");
    } catch (err: unknown) {
      if (err instanceof TypeError) setPassError("Kamu sedang offline — ganti password butuh internet.");
      else setPassError(err instanceof Error ? err.message : "Gagal ganti password");
    } finally { setSavingPass(false); }
  }

  async function savePin(e: React.FormEvent) {
    e.preventDefault();
    if (!/^\d{6}$/.test(pin)) { setPinError("PIN harus 6 digit angka"); return; }
    if (pin !== confirmPin) { setPinError("Konfirmasi PIN tidak cocok"); return; }
    setSavingPin(true); setPinError(null);
    try {
      const res = await fetch("/api/users/pin", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ pin }) });
      const j = await res.json();
      if (!res.ok) throw new Error(j.message || j.error || "Gagal");
      notify("PIN offline berhasil disimpan");
      setHasPin(true); setPin(""); setConfirmPin("");
      // Fase 4: cache hash PIN di perangkat agar bisa diverifikasi saat offline.
      try { await cachePinHash(pin); } catch {}
      try { localStorage.setItem("appPinHashSet", "1"); } catch {}
    } catch (err: unknown) { setPinError(err instanceof Error ? err.message : "Gagal simpan PIN"); }
    finally { setSavingPin(false); }
  }

  async function doRemovePin() {
    const res = await fetch("/api/users/pin", { method: "DELETE" });
    if (res.ok) {
      setHasPin(false); setConfirmDeletePin(false);
      notify("PIN offline dihapus");
      // Fase 4: hapus juga hash cache agar kunci offline ikut nonaktif.
      try { await clearCachedPinHash(); } catch {}
      try { localStorage.removeItem("appPinHashSet"); } catch {}
    } else {
      setConfirmDeletePin(false);
      notify("Gagal hapus PIN");
    }
  }

  const avatarUser = { name: user.name, username: user.username, email: user.email, image: user.image, avatar: user.avatar, profilePicture: profilePic };

  return (
    <div className="min-h-dvh bg-[var(--background)]">
      {/* M3 Small Top App Bar: kembali + judul + 1 aksi */}
      <header className="w-full bg-[var(--surface-container-lowest)] border-b border-[var(--outline-variant)] sticky top-0 z-30">
        <div className="page-shell h-14 flex items-center gap-1">
          <Link
            href="/dashboard"
            aria-label="Kembali ke Dashboard"
            className="w-10 h-10 rounded-full flex items-center justify-center text-[var(--on-surface-variant)] hover:bg-[var(--surface-container)] transition-colors shrink-0"
          >
            <ArrowLeft size={18} />
          </Link>
          <h1 className="flex-1 min-w-0 text-base font-semibold text-[var(--on-surface)] truncate">
            Akun Saya
          </h1>
          <ThemeToggle />
        </div>
      </header>

      <main className="page-shell py-6">
        {/* Desktop ≥1024px: 2 kolom seimbang (kiri 7 : kanan 5).
            Mobile: 1 kolom, urutan DOM tetap header → Profil → Keamanan → PIN → Preferensi. */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 items-start">
          {/* Header profil ringkas — Filled card, full-width */}
          <div className="lg:col-span-12 bg-[var(--surface-container-highest)] rounded-2xl p-5">
            <div className="flex items-center gap-4 min-w-0">
              <Avatar user={avatarUser} size={64} />
              <div className="min-w-0 flex-1">
                <p className="font-semibold text-[var(--on-surface)] truncate">{user.name}</p>
                {user.username && (
                  <p className="text-sm text-[var(--on-surface-variant)] truncate">@{user.username}</p>
                )}
                <p className="text-xs text-[var(--on-surface-variant)] truncate">{user.email}</p>
              </div>
            </div>
            <div className="mt-3 flex items-center gap-1">
              <label
                className={`inline-flex items-center gap-1.5 h-10 px-4 rounded-full text-sm font-medium cursor-pointer transition-opacity ${
                  uploading
                    ? "opacity-50 bg-[var(--surface-container)] text-[var(--on-surface-variant)]"
                    : "bg-[var(--primary)] text-[var(--on-primary)] hover:opacity-90"
                }`}
              >
                <Upload size={16} /> {uploading ? "Mengupload..." : "Ganti foto"}
                <input type="file" accept="image/*" onChange={handleUpload} className="sr-only" disabled={uploading} />
              </label>
              {profilePic && (
                <button
                  onClick={handleRemovePic}
                  className="h-10 px-4 rounded-full text-sm font-medium text-[var(--error)] hover:bg-[var(--error-container)] transition-colors"
                >
                  Hapus
                </button>
              )}
            </div>
          </div>

          {/* Kolom kiri: Profil + Password */}
          <div className="lg:col-span-7 space-y-4 min-w-0">
          {/* Section 1 — Profil */}
          <Section title="Profil" desc="Nama, username, dan email yang tampil ke panitia.">
            <form onSubmit={saveProfile} className="space-y-4" noValidate={false}>
              <Field id="acc-name" label="Nama" required>
                <input
                  id="acc-name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  required
                  minLength={2}
                  autoComplete="name"
                  placeholder="Nama lengkap"
                  className={inputCls}
                />
              </Field>
              <Field
                id="acc-username"
                label="Username"
                required
                hint="3–20 karakter: huruf kecil, angka, titik, strip."
                hintId="acc-username-hint"
                error={usernameStatus === "taken" ? "Username sudah dipakai orang lain" : profileError}
              >
                <div className="relative">
                  <span aria-hidden className="absolute left-4 top-1/2 -translate-y-1/2 text-[var(--on-surface-variant)] text-sm">@</span>
                  <input
                    id="acc-username"
                    value={username}
                    onChange={(e) => setUsername(e.target.value.toLowerCase().replace(/[^a-z0-9._-]/g, ""))}
                    required
                    minLength={3}
                    maxLength={20}
                    autoComplete="username"
                    placeholder="username"
                    aria-describedby={`acc-username-hint acc-username-status`}
                    className={`${inputCls} pl-8 pr-24`}
                  />
                  <span id="acc-username-status" aria-live="polite" className="absolute right-3 top-1/2 -translate-y-1/2 text-xs">
                    {usernameStatus === "checking" && <span className="text-[var(--on-surface-variant)]">Cek...</span>}
                    {usernameStatus === "available" && <span className="text-[var(--primary)] flex items-center gap-1"><Check size={14} />Tersedia</span>}
                    {usernameStatus === "taken" && <span className="text-[var(--error)] flex items-center gap-1"><AlertCircle size={14} />Dipakai</span>}
                  </span>
                </div>
              </Field>
              <Field id="acc-email" label="Email" required>
                <input
                  id="acc-email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  autoComplete="email"
                  className={inputCls}
                />
              </Field>
              <div className="flex justify-end pt-1">
                <button
                  disabled={savingProfile || usernameStatus === "taken"}
                  type="submit"
                  className="h-12 px-6 rounded-full bg-[var(--primary)] text-[var(--on-primary)] font-medium text-sm hover:opacity-90 disabled:opacity-50 transition-opacity"
                >
                  {savingProfile ? "Menyimpan..." : "Simpan"}
                </button>
              </div>
            </form>
          </Section>

          {/* Section 2 — Keamanan (password saja; PIN pindah ke kolom kanan) */}
          <Section title="Keamanan" desc="Password untuk login ke akun.">
            <form onSubmit={savePassword} className="space-y-4">
              <Field id="acc-pass-old" label="Password lama" hint="Kosongkan jika akun dibuat via Google.">
                <input
                  id="acc-pass-old"
                  type="password"
                  value={currentPassword}
                  onChange={(e) => setCurrentPassword(e.target.value)}
                  autoComplete="current-password"
                  className={inputCls}
                />
              </Field>
              <div className="grid sm:grid-cols-2 gap-4">
                <Field id="acc-pass-new" label="Password baru" required>
                  <input
                    id="acc-pass-new"
                    type="password"
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    required
                    minLength={6}
                    autoComplete="new-password"
                    placeholder="Min 6 karakter"
                    className={inputCls}
                  />
                </Field>
                <Field id="acc-pass-confirm" label="Ulangi password baru" required error={passError}>
                  <input
                    id="acc-pass-confirm"
                    type="password"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    required
                    minLength={6}
                    autoComplete="new-password"
                    placeholder="Ulangi password baru"
                    className={inputCls}
                  />
                </Field>
              </div>
              <div className="flex justify-end pt-1">
                <button
                  disabled={savingPass}
                  type="submit"
                  className="h-12 px-6 rounded-full bg-[var(--primary)] text-[var(--on-primary)] font-medium text-sm hover:opacity-90 disabled:opacity-50 transition-opacity"
                >
                  {savingPass ? "Menyimpan..." : "Ganti password"}
                </button>
              </div>
            </form>
          </Section>
          </div>

          {/* Kolom kanan: PIN Offline standalone + Preferensi */}
          <div className="lg:col-span-5 space-y-4 min-w-0">
          <Section title="PIN Offline" desc="Untuk membuka aplikasi saat offline. Sync tetap berjalan tiap 30 menit saat online.">
            {/* Collapsed karena jarang dipakai */}
            <div className="rounded-xl border border-[var(--outline-variant)] overflow-hidden">
              <button
                onClick={() => setPinOpen((v) => !v)}
                aria-expanded={pinOpen}
                aria-controls="pin-panel"
                className="w-full min-h-12 px-4 py-3 flex items-center gap-3 text-left hover:bg-[var(--surface-container)] transition-colors"
              >
                <Shield size={18} className="text-[var(--on-surface-variant)] shrink-0" />
                <span className="flex-1 min-w-0">
                  <span className="block text-sm font-medium text-[var(--on-surface)]">PIN Offline</span>
                  <span className="block text-xs text-[var(--on-surface-variant)]">
                    {hasPin === null ? "Memuat..." : hasPin ? "Aktif — bisa buka aplikasi tanpa internet" : "Belum ada PIN"}
                  </span>
                </span>
                <span
                  className={`text-xs font-medium px-2.5 py-1 rounded-full border border-[var(--outline-variant)] shrink-0 ${
                    hasPin ? "bg-[var(--primary-container)] text-[var(--on-primary-container)]" : "bg-[var(--surface-container)] text-[var(--on-surface-variant)]"
                  }`}
                >
                  {hasPin ? "Aktif" : "Mati"}
                </span>
                <ChevronDown size={16} className={`text-[var(--on-surface-variant)] shrink-0 transition-transform ${pinOpen ? "rotate-180" : ""}`} />
              </button>
              {pinOpen && (
                <form id="pin-panel" onSubmit={savePin} className="px-4 pb-4 pt-1 space-y-4 border-t border-[var(--outline-variant)]">
                  {/* Kolom kanan sempit (~440px): PIN selalu 1 kolom agar digit lega */}
                  <div className="grid grid-cols-1 gap-4">
                    <Field id="acc-pin" label="PIN 6 digit" required error={pinError}>
                      <input
                        id="acc-pin"
                        type="password"
                        inputMode="numeric"
                        maxLength={6}
                        value={pin}
                        onChange={(e) => setPin(e.target.value.replace(/\D/g, "").slice(0, 6))}
                        autoComplete="new-password"
                        placeholder="••••••"
                        className={`${inputCls} tracking-[0.3em]`}
                      />
                    </Field>
                    <Field id="acc-pin-confirm" label="Ulangi PIN" required>
                      <input
                        id="acc-pin-confirm"
                        type="password"
                        inputMode="numeric"
                        maxLength={6}
                        value={confirmPin}
                        onChange={(e) => setConfirmPin(e.target.value.replace(/\D/g, "").slice(0, 6))}
                        autoComplete="new-password"
                        placeholder="••••••"
                        className={`${inputCls} tracking-[0.3em]`}
                      />
                    </Field>
                  </div>
                  <div className="flex items-center justify-between gap-2 pt-1">
                    {hasPin ? (
                      <button
                        type="button"
                        onClick={() => setConfirmDeletePin(true)}
                        className="h-12 px-4 rounded-full text-sm font-medium text-[var(--error)] hover:bg-[var(--error-container)] transition-colors"
                      >
                        Hapus PIN
                      </button>
                    ) : (
                      <span />
                    )}
                    <button
                      disabled={savingPin}
                      type="submit"
                      className="h-12 px-6 rounded-full bg-[var(--primary)] text-[var(--on-primary)] font-medium text-sm hover:opacity-90 disabled:opacity-50 transition-opacity"
                    >
                      {savingPin ? "Menyimpan..." : hasPin ? "Ganti PIN" : "Simpan PIN"}
                    </button>
                  </div>
                </form>
              )}
            </div>
          </Section>

          {/* Section 3 — Preferensi */}
          <Section title="Preferensi" desc="Tampilan aplikasi di perangkat ini.">
            <div className="flex items-center gap-3 min-h-12">
              {isDark ? (
                <Moon size={18} className="text-[var(--on-surface-variant)] shrink-0" />
              ) : (
                <Sun size={18} className="text-[var(--on-surface-variant)] shrink-0" />
              )}
              <span className="flex-1 min-w-0">
                <span className="block text-sm font-medium text-[var(--on-surface)]">Mode gelap</span>
                <span className="block text-xs text-[var(--on-surface-variant)]">
                  {isDark ? "Aktif" : "Mati — memakai mode terang"}
                </span>
              </span>
              <button
                role="switch"
                aria-checked={isDark}
                aria-label="Mode gelap"
                onClick={() => setMode(isDark ? "light" : "dark")}
                className={`relative w-[52px] h-8 rounded-full border border-[var(--outline-variant)] transition-colors shrink-0 ${
                  isDark ? "bg-[var(--primary)]" : "bg-[var(--surface-container)]"
                }`}
              >
                <span
                  aria-hidden
                  className={`absolute top-1/2 -translate-y-1/2 w-6 h-6 rounded-full transition-all ${
                    isDark ? "left-[24px] bg-[var(--on-primary)]" : "left-[3px] bg-[var(--on-surface-variant)]"
                  }`}
                />
              </button>
            </div>
            <div className="mt-3 flex items-center gap-3 min-h-12 opacity-70">
              <KeyRound size={18} className="text-[var(--on-surface-variant)] shrink-0" />
              <span className="flex-1 min-w-0">
                <span className="block text-sm font-medium text-[var(--on-surface)]">Sesi login</span>
                <span className="block text-xs text-[var(--on-surface-variant)]">Aktif di perangkat ini</span>
              </span>
              <Link
                href="/api/auth/signout"
                className="h-10 px-4 inline-flex items-center rounded-full text-sm font-medium text-[var(--error)] hover:bg-[var(--error-container)] transition-colors shrink-0"
              >
                Keluar
              </Link>
            </div>
          </Section>
          </div>
        </div>
      </main>

      {/* Dialog konfirmasi hapus PIN — M3 alert dialog */}
      {confirmDeletePin && (
        <div
          className="fixed inset-0 z-50 overflow-y-auto bg-[var(--scrim)]/50 p-4 flex justify-center items-center"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) setConfirmDeletePin(false);
          }}
        >
          <div
            ref={deleteDialogRef}
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="del-pin-title"
            aria-describedby="del-pin-desc"
            className="w-full max-w-sm bg-[var(--surface-container-lowest)] border border-[var(--outline-variant)] rounded-2xl p-6 shadow-[var(--shadow-elevation-3)]"
          >
            <h2 id="del-pin-title" className="font-semibold text-[var(--on-surface)]">
              Hapus PIN offline?
            </h2>
            <p id="del-pin-desc" className="text-sm text-[var(--on-surface-variant)] mt-2">
              Kamu tidak bisa lagi membuka aplikasi saat offline sampai membuat PIN baru.
            </p>
            <div className="mt-6 flex justify-end gap-1">
              <button
                onClick={() => setConfirmDeletePin(false)}
                className="h-12 px-5 rounded-full text-sm font-medium text-[var(--primary)] hover:bg-[var(--primary-container)] transition-colors"
              >
                Batal
              </button>
              <button
                onClick={doRemovePin}
                className="h-12 px-5 rounded-full text-sm font-medium text-[var(--error)] hover:bg-[var(--error-container)] transition-colors"
              >
                Hapus PIN
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Snackbar global — M3: inverse-surface, role=status */}
      {snack && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 w-[calc(100%-32px)] max-w-[560px]">
          <div
            role="status"
            aria-live="polite"
            className="flex items-center gap-2 min-h-12 px-4 py-3 rounded-lg bg-[var(--inverse-surface)] text-[var(--inverse-on-surface)] text-sm shadow-[var(--shadow-elevation-3)]"
          >
            <span className="flex-1">{snack.text}</span>
            <button
              onClick={() => setSnack(null)}
              aria-label="Tutup notifikasi"
              className="w-8 h-8 rounded-full flex items-center justify-center hover:bg-white/10 transition-colors shrink-0"
            >
              <X size={16} />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
