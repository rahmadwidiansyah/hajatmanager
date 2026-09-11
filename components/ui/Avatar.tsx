"use client";
import { useState } from "react";
import { getAvatarUrl, getInitials, type AvatarUser } from "@/lib/avatar";

export function Avatar({ user, size = 36, className = "" }: { user?: AvatarUser | null; size?: number; className?: string }) {
  const url = getAvatarUrl(user);
  const initials = getInitials(user);
  const [err, setErr] = useState(false);
  const showImg = url && !err;

  return (
    <div
      className={`relative inline-flex items-center justify-center rounded-full overflow-hidden bg-zinc-200 dark:bg-zinc-700 text-zinc-600 dark:text-zinc-300 font-semibold select-none shrink-0 ${className}`}
      style={{ width: size, height: size, fontSize: Math.round(size * 0.38) }}
      title={user?.name || user?.username || user?.email || undefined}
    >
      {showImg ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={url}
          alt={user?.name || "avatar"}
          width={size}
          height={size}
          className="w-full h-full object-cover"
          onError={() => setErr(true)}
          referrerPolicy="no-referrer"
        />
      ) : (
        <span aria-hidden>{initials}</span>
      )}
    </div>
  );
}
