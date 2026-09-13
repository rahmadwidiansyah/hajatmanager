"use client";

import type { ReactNode } from "react";

// M3: label uppercase hanya untuk section/group, bukan tiap input.
// FormField menyatukan label + input + supporting text agar konsisten.
export function FormField({
  label,
  required,
  hint,
  error,
  children,
}: {
  label: string;
  required?: boolean;
  hint?: string;
  error?: string;
  children: ReactNode;
}) {
  return (
    <div className="min-w-0">
      <label className="m3-section-title">
        {label}
        {required && <span aria-hidden> *</span>}
      </label>
      <div className="mt-1.5">{children}</div>
      {error ? (
        <p role="alert" className="mt-1 text-xs text-[var(--on-error-container)]">
          {error}
        </p>
      ) : hint ? (
        <p className="mt-1 text-xs text-[var(--on-surface-variant)]">{hint}</p>
      ) : null}
    </div>
  );
}

export function SectionCard({
  title,
  desc,
  action,
  children,
  className = "",
}: {
  title: string;
  desc?: string;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section
      className={`m3-card p-4 sm:p-5 ${className}`}
      aria-label={title}
    >
      <div className="flex items-start justify-between gap-2 mb-3">
        <div className="min-w-0">
          <h3 className="font-semibold text-[var(--on-surface)] text-sm sm:text-base truncate">
            {title}
          </h3>
          {desc && (
            <p className="text-xs text-[var(--on-surface-variant)] mt-0.5 line-clamp-2">
              {desc}
            </p>
          )}
        </div>
        {action}
      </div>
      {children}
    </section>
  );
}
