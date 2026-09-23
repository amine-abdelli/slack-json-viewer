"use client";

import * as React from "react";
import { Check, CircleAlert, Search, X } from "lucide-react";

import { cn } from "@/lib/utils";

/*
 * Small building blocks from `Loquarium Components`: page titles, search
 * fields, segmented controls, checkboxes, switches, banners.
 */

export function PageTitle({
  title,
  subtitle,
  badge,
  children,
}: {
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  badge?: React.ReactNode;
  children?: React.ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-4">
      <div className="min-w-0">
        <div className="flex items-center gap-2">
          <h1 className="m-0 text-[22px] leading-tight font-semibold tracking-[-.01em]">{title}</h1>
          {badge}
        </div>
        {subtitle ? (
          <p className="mt-1.5 flex items-center gap-1.5 text-[13px] text-fg-2 [text-wrap:pretty]">
            {subtitle}
          </p>
        ) : null}
      </div>
      {children}
    </div>
  );
}

export function SectionTitle({ children, right }: { children: React.ReactNode; right?: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-2">
      <h2 className="m-0 text-[13px] font-semibold text-fg-2">{children}</h2>
      {right}
    </div>
  );
}

export function Tag({
  children,
  tone = "neutral",
  className,
  title,
}: {
  children: React.ReactNode;
  tone?: "neutral" | "brand" | "success" | "warning" | "danger" | "dashed";
  className?: string;
  title?: string;
}) {
  return (
    <span
      title={title}
      className={cn(
        "inline-flex items-center gap-1 rounded-[4px] px-1.5 py-px text-[11px] font-medium whitespace-nowrap",
        tone === "neutral" && "bg-surface-3 text-fg-2",
        tone === "brand" && "bg-brand-soft text-brand-text",
        tone === "success" && "bg-success-soft text-success",
        tone === "warning" && "bg-warning-soft text-warning",
        tone === "danger" && "bg-danger-soft text-danger",
        tone === "dashed" && "border border-dashed border-border-strong px-2 py-0.5 text-fg-3",
        className,
      )}
    >
      {children}
    </span>
  );
}

export function Kbd({ children }: { children: React.ReactNode }) {
  return (
    <kbd className="rounded-[4px] border border-border bg-surface px-1 font-mono text-[11px] text-fg-3">
      {children}
    </kbd>
  );
}

export const SearchField = React.forwardRef<
  HTMLInputElement,
  {
    value: string;
    onChange: (value: string) => void;
    placeholder: string;
    label?: string;
    shortcut?: string;
    size?: "sm" | "lg";
    className?: string;
    autoFocus?: boolean;
    describedBy?: string;
  }
>(function SearchField(
  { value, onChange, placeholder, label, shortcut, size = "sm", className, autoFocus, describedBy },
  ref,
) {
  const large = size === "lg";
  return (
    <div
      className={cn(
        "flex items-center gap-1.5 rounded-[6px] border px-2 focus-within:border-focus",
        large
          ? "h-10 gap-2 rounded-[8px] border-border-strong bg-surface px-2.5 focus-within:shadow-[0_0_0_3px_var(--accent-soft)]"
          : "h-8 border-border bg-surface-2 focus-within:bg-surface",
        className,
      )}
    >
      <Search className={cn("shrink-0 text-fg-3", large ? "size-4" : "size-3.5")} />
      <input
        ref={ref}
        value={value}
        autoFocus={autoFocus}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        aria-label={label ?? placeholder}
        aria-describedby={describedBy}
        className={cn(
          "min-w-0 flex-1 border-0 bg-transparent text-fg outline-none focus-visible:outline-none",
          large ? "text-[14px]" : "text-[13px]",
        )}
      />
      {value ? (
        <button
          type="button"
          onClick={() => onChange("")}
          aria-label={label ? `${label} — ×` : "×"}
          className="grid size-5 shrink-0 place-items-center rounded-[4px] bg-surface-3 text-fg-2"
        >
          <X className="size-3" />
        </button>
      ) : shortcut ? (
        <Kbd>{shortcut}</Kbd>
      ) : null}
    </div>
  );
});

export function Segmented<T extends string>({
  value,
  onChange,
  options,
  label,
  stretch,
  size = "md",
}: {
  value: T;
  onChange: (value: T) => void;
  options: { value: T; label: React.ReactNode; icon?: React.ReactNode; disabled?: boolean }[];
  label?: string;
  stretch?: boolean;
  size?: "sm" | "md";
}) {
  return (
    <div
      role="tablist"
      aria-label={label}
      className={cn(
        "gap-0.5 rounded-[8px] border border-border bg-surface-2 p-[3px]",
        stretch ? "grid" : "inline-flex self-start",
      )}
      style={stretch ? { gridTemplateColumns: `repeat(${options.length}, 1fr)` } : undefined}
    >
      {options.map((o) => {
        const selected = o.value === value;
        return (
          <button
            key={o.value}
            type="button"
            role="tab"
            aria-selected={selected}
            disabled={o.disabled}
            onClick={() => onChange(o.value)}
            className={cn(
              "flex items-center justify-center gap-1.5 rounded-[6px] px-3 font-medium text-fg disabled:opacity-50",
              size === "sm" ? "h-7 text-[12.5px]" : "h-[30px] text-[13px]",
              selected ? "bg-surface shadow-1" : "hover:text-fg-2",
            )}
          >
            {o.icon}
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

export function CheckboxRow({
  checked,
  onChange,
  label,
  hint,
  disabled,
}: {
  checked: boolean;
  onChange: (value: boolean) => void;
  label: React.ReactNode;
  hint?: React.ReactNode;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={checked}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className="flex max-w-[340px] items-start gap-2.5 border-0 bg-transparent p-0 text-left text-fg disabled:opacity-60"
    >
      <CheckBox checked={checked} className="mt-0.5" />
      <span>
        <span className="block text-[13px] font-medium">{label}</span>
        {hint ? <span className="text-[12px] text-fg-3">{hint}</span> : null}
      </span>
    </button>
  );
}

export function CheckBox({ checked, className }: { checked: boolean; className?: string }) {
  return (
    <span
      aria-hidden
      className={cn(
        "grid size-4 shrink-0 place-items-center rounded-[4px] border-[1.5px] text-brand-fg",
        checked ? "border-brand bg-brand" : "border-border-strong bg-surface",
        className,
      )}
    >
      {checked ? <Check className="size-[11px]" strokeWidth={3} /> : null}
    </span>
  );
}

export function Switch({
  checked,
  onChange,
  label,
}: {
  checked: boolean;
  onChange: (value: boolean) => void;
  label: React.ReactNode;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className="flex items-center gap-2.5 border-0 bg-transparent p-0 text-left text-[13px] text-fg"
    >
      <span
        className={cn(
          "relative h-[18px] w-[30px] shrink-0 rounded-[9px] transition-colors",
          checked ? "bg-brand" : "bg-border-strong",
        )}
      >
        <span
          className="absolute top-[2px] size-[14px] rounded-full bg-white shadow-[0_1px_2px_rgba(0,0,0,.25)] transition-[left]"
          style={{ left: checked ? 14 : 2 }}
        />
      </span>
      {label}
    </button>
  );
}

export function ErrorBanner({
  title,
  detail,
  onDismiss,
  dismissLabel,
  children,
}: {
  title: React.ReactNode;
  detail?: React.ReactNode;
  onDismiss?: () => void;
  dismissLabel?: string;
  children?: React.ReactNode;
}) {
  return (
    <div role="alert" className="flex gap-2.5 rounded-[8px] bg-danger-soft px-3.5 py-3 text-danger">
      <CircleAlert className="mt-px size-[17px] shrink-0" />
      <div className="min-w-0 flex-1">
        <div className="font-semibold">{title}</div>
        {detail ? (
          <div className="mt-1 max-h-40 overflow-auto font-mono text-[12px] leading-normal break-words whitespace-pre-wrap text-fg-2">
            {detail}
          </div>
        ) : null}
        {children}
      </div>
      {onDismiss ? (
        <button
          type="button"
          onClick={onDismiss}
          aria-label={dismissLabel}
          className="grid size-6 shrink-0 place-items-center rounded-[4px] hover:bg-surface/50"
        >
          <X className="size-[15px]" />
        </button>
      ) : null}
    </div>
  );
}

/** Buttons in the mock-up's sizes; `Button` from shadcn stays for menus and dialogs. */
export function LqButton({
  variant = "primary",
  size = "md",
  className,
  ...props
}: React.ComponentProps<"button"> & {
  variant?: "primary" | "secondary" | "ghost" | "dashed" | "danger";
  size?: "sm" | "md" | "lg";
}) {
  return (
    <button
      type="button"
      className={cn(
        "inline-flex shrink-0 items-center justify-center gap-2 rounded-[6px] font-medium whitespace-nowrap transition-colors disabled:cursor-not-allowed disabled:opacity-50 [&_svg]:shrink-0",
        size === "sm" && "h-8 px-3 text-[13px] [&_svg]:size-3.5",
        size === "md" && "h-9 px-4 text-[13px] [&_svg]:size-3.5",
        size === "lg" && "h-[38px] px-[18px] text-[14px] [&_svg]:size-[15px]",
        variant === "primary" && "border-0 bg-brand text-brand-fg hover:bg-brand-hover",
        variant === "secondary" && "border border-border-strong bg-surface text-fg hover:bg-surface-2",
        variant === "ghost" && "border-0 bg-transparent text-fg-2 hover:bg-surface-2 hover:text-fg",
        variant === "dashed" &&
          "border border-dashed border-border-strong bg-transparent text-fg-2 hover:bg-surface-2 hover:text-fg",
        variant === "danger" && "border border-border-strong bg-surface text-danger hover:bg-danger-soft",
        className,
      )}
      {...props}
    />
  );
}

export function IconButton({
  className,
  active,
  ...props
}: React.ComponentProps<"button"> & { active?: boolean }) {
  return (
    <button
      type="button"
      className={cn(
        "grid size-8 shrink-0 place-items-center rounded-[6px] border-0 text-fg-2 transition-colors hover:bg-surface-2 hover:text-fg [&_svg]:size-4",
        active && "bg-brand-soft text-brand-text hover:bg-brand-soft",
        className,
      )}
      {...props}
    />
  );
}

/** Tabular rows: the header row of the Library, People and Exports tables. */
export function TableHead({ columns, children }: { columns: string; children: React.ReactNode }) {
  return (
    <div
      className="hidden gap-4 border-b border-border bg-surface-2 px-4 py-[9px] text-[12px] text-fg-3 md:grid"
      style={{ gridTemplateColumns: columns }}
    >
      {children}
    </div>
  );
}
