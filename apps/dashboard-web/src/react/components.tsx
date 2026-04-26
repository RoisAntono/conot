import * as Dialog from "@radix-ui/react-dialog";
import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import * as RadixSwitch from "@radix-ui/react-switch";
import * as Tooltip from "@radix-ui/react-tooltip";
import {
  flexRender,
  getCoreRowModel,
  getSortedRowModel,
  type ColumnDef,
  type SortingState,
  useReactTable
} from "@tanstack/react-table";
import {
  CheckCircle2,
  ChevronDown,
  Download,
  Loader2,
  MoreHorizontal,
  SlidersHorizontal,
  X,
  XCircle
} from "lucide-react";
import { type FormEvent, type ReactNode, useEffect, useMemo, useState } from "react";
import type * as React from "react";
import { cn } from "./utils";

export type Toast = {
  id: number;
  tone: "success" | "error" | "info";
  message: string;
};

type ButtonVariant = "primary" | "secondary" | "danger" | "ghost" | "quiet";
type ButtonSize = "sm" | "md" | "icon";

export function Button({
  children,
  className,
  tone,
  variant,
  size = "md",
  icon,
  loading,
  tooltip,
  ...props
}: {
  children?: ReactNode;
  className?: string;
  tone?: ButtonVariant;
  variant?: ButtonVariant;
  size?: ButtonSize;
  icon?: ReactNode;
  loading?: boolean;
  tooltip?: string;
} & React.ButtonHTMLAttributes<HTMLButtonElement>) {
  const resolvedVariant = variant || tone || "primary";
  const isIconOnly = size === "icon" && !children;
  const label = props["aria-label"] || tooltip;

  if (isIconOnly && !label) {
    console.warn("Icon-only Button membutuhkan aria-label atau tooltip.");
  }

  const button = (
    <button
      {...props}
      className={cn("btn", `btn-${resolvedVariant}`, `btn-${size}`, className)}
      disabled={props.disabled || loading}
      aria-label={label}
    >
      {loading ? <Loader2 className="btn-icon spin-icon" aria-hidden="true" /> : icon ? <span className="btn-icon">{icon}</span> : null}
      {children ? <span className="btn-label">{children}</span> : null}
    </button>
  );

  return tooltip ? (
    <Tooltip.Provider delayDuration={250}>
      <Tooltip.Root>
        <Tooltip.Trigger asChild>{button}</Tooltip.Trigger>
        <Tooltip.Portal>
          <Tooltip.Content className="tooltip" sideOffset={6}>
            {tooltip}
            <Tooltip.Arrow className="tooltip-arrow" />
          </Tooltip.Content>
        </Tooltip.Portal>
      </Tooltip.Root>
    </Tooltip.Provider>
  ) : (
    button
  );
}

export function IconButton({
  label,
  icon,
  ...props
}: {
  label: string;
  icon: ReactNode;
} & Omit<React.ComponentProps<typeof Button>, "children" | "size" | "icon" | "aria-label">) {
  return <Button size="icon" icon={icon} tooltip={label} aria-label={label} {...props} />;
}

export function Card({
  children,
  className
}: {
  children: ReactNode;
  className?: string;
}) {
  return <section className={cn("card", className)}>{children}</section>;
}

export function Badge({
  children,
  tone = "neutral",
  icon
}: {
  children: ReactNode;
  tone?: "neutral" | "success" | "warning" | "danger" | "info";
  icon?: ReactNode;
}) {
  return (
    <span className={cn("badge", `badge-${tone}`)}>
      {icon ? <span className="badge-icon">{icon}</span> : null}
      {children}
    </span>
  );
}

export function StatusPill({
  children,
  tone = "neutral",
  dot = true
}: {
  children: ReactNode;
  tone?: "neutral" | "success" | "warning" | "danger" | "info";
  dot?: boolean;
}) {
  return (
    <span className={cn("status-pill", `status-pill-${tone}`)}>
      {dot ? <span className="status-dot" aria-hidden="true" /> : null}
      {children}
    </span>
  );
}

export function RefreshMeta({
  updatedAt,
  refreshing,
  label = "Updated"
}: {
  updatedAt?: Date | null;
  refreshing?: boolean;
  label?: string;
}) {
  const text = refreshing
    ? "Updating..."
    : updatedAt
      ? `${label} ${formatRefreshTime(updatedAt)}`
      : "Waiting for data";

  return (
    <span className={cn("refresh-meta", refreshing && "refresh-meta-active")} aria-live="polite">
      {refreshing ? <Loader2 size={13} className="spin-icon" aria-hidden="true" /> : <span className="refresh-dot" aria-hidden="true" />}
      {text}
    </span>
  );
}

function formatRefreshTime(value: Date) {
  const seconds = Math.max(0, Math.round((Date.now() - value.getTime()) / 1000));
  if (seconds < 5) return "just now";
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  return value.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

export function TextField({
  id,
  label,
  error,
  help,
  className,
  ...props
}: {
  id: string;
  label: string;
  error?: string;
  help?: string;
  className?: string;
} & React.InputHTMLAttributes<HTMLInputElement>) {
  const describedBy = [help ? `${id}-help` : "", error ? `${id}-error` : ""].filter(Boolean).join(" ");
  return (
    <div className={cn("field", className)}>
      <label htmlFor={id}>{label}</label>
      <input id={id} aria-invalid={Boolean(error)} aria-describedby={describedBy || undefined} {...props} />
      {help ? (
        <p id={`${id}-help`} className="field-help">
          {help}
        </p>
      ) : null}
      <p id={`${id}-error`} className="field-error">
        {error || ""}
      </p>
    </div>
  );
}

export function TextAreaField({
  id,
  label,
  error,
  help,
  className,
  ...props
}: {
  id: string;
  label: string;
  error?: string;
  help?: string;
  className?: string;
} & React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  const describedBy = [help ? `${id}-help` : "", error ? `${id}-error` : ""].filter(Boolean).join(" ");
  return (
    <div className={cn("field", className)}>
      <label htmlFor={id}>{label}</label>
      <textarea id={id} aria-invalid={Boolean(error)} aria-describedby={describedBy || undefined} {...props} />
      {help ? (
        <p id={`${id}-help`} className="field-help">
          {help}
        </p>
      ) : null}
      <p id={`${id}-error`} className="field-error">
        {error || ""}
      </p>
    </div>
  );
}

export function SelectField({
  id,
  label,
  error,
  help,
  children,
  className,
  ...props
}: {
  id: string;
  label: string;
  error?: string;
  help?: string;
  children: ReactNode;
  className?: string;
} & React.SelectHTMLAttributes<HTMLSelectElement>) {
  const describedBy = [help ? `${id}-help` : "", error ? `${id}-error` : ""].filter(Boolean).join(" ");
  return (
    <div className={cn("field", className)}>
      <label htmlFor={id}>{label}</label>
      <select id={id} aria-invalid={Boolean(error)} aria-describedby={describedBy || undefined} {...props}>
        {children}
      </select>
      {help ? (
        <p id={`${id}-help`} className="field-help">
          {help}
        </p>
      ) : null}
      <p id={`${id}-error`} className="field-error">
        {error || ""}
      </p>
    </div>
  );
}

export function ToggleField({
  id,
  label,
  checked,
  onChange,
  help
}: {
  id: string;
  label: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
  help?: string;
}) {
  return (
    <div className="toggle-row">
      <div>
        <label htmlFor={id}>{label}</label>
        {help ? <p className="field-help">{help}</p> : null}
      </div>
      <RadixSwitch.Root id={id} checked={checked} onCheckedChange={onChange} className="switch">
        <RadixSwitch.Thumb className="switch-thumb" />
      </RadixSwitch.Root>
    </div>
  );
}

export function Drawer({
  title,
  description,
  open,
  onClose,
  children,
  footer,
  dirty
}: {
  title: string;
  description?: string;
  open: boolean;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
  dirty?: boolean;
}) {
  function requestClose() {
    if (dirty && !window.confirm("Perubahan belum disimpan. Tutup panel?")) return;
    onClose();
  }

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        requestClose();
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [dirty, open, onClose]);

  return (
    <Dialog.Root
      open={open}
      onOpenChange={(nextOpen) => {
        if (!nextOpen) requestClose();
      }}
    >
      <Dialog.Portal>
        <Dialog.Overlay className="overlay" />
        <Dialog.Content
          className="drawer"
          onEscapeKeyDown={(event) => {
            event.preventDefault();
            requestClose();
          }}
        >
          <header className="drawer-head">
            <div>
              <Dialog.Title className="drawer-title">{title}</Dialog.Title>
              {description ? <Dialog.Description>{description}</Dialog.Description> : null}
            </div>
            <IconButton label="Tutup panel" variant="ghost" icon={<X size={18} />} onClick={requestClose} />
          </header>
          <div className="drawer-body">{children}</div>
          {footer ? <footer className="drawer-footer">{footer}</footer> : null}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

export const FormDrawer = Drawer;

export function ConfirmDialog({
  open,
  title,
  description,
  confirmLabel = "Hapus",
  busy,
  onCancel,
  onConfirm
}: {
  open: boolean;
  title: string;
  description: string;
  confirmLabel?: string;
  busy?: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  return (
    <Dialog.Root open={open} onOpenChange={(nextOpen) => (!nextOpen ? onCancel() : undefined)}>
      <Dialog.Portal>
        <Dialog.Overlay className="overlay overlay-center" />
        <Dialog.Content className="modal" role="alertdialog">
          <Dialog.Title>{title}</Dialog.Title>
          <Dialog.Description>{description}</Dialog.Description>
          <div className="modal-actions">
            <Button variant="secondary" type="button" onClick={onCancel}>
              Batal
            </Button>
            <Button variant="danger" type="button" loading={busy} onClick={onConfirm}>
              {confirmLabel}
            </Button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

export function ToastStack({ toasts }: { toasts: Toast[] }) {
  return (
    <div className="toast-stack" aria-live="polite" aria-atomic="true">
      {toasts.map((toast) => (
        <article key={toast.id} className={cn("toast", `toast-${toast.tone}`)}>
          {toast.tone === "success" ? <CheckCircle2 size={17} /> : null}
          {toast.tone === "error" ? <XCircle size={17} /> : null}
          <span>{toast.message}</span>
        </article>
      ))}
    </div>
  );
}

export function EmptyState({
  title,
  body,
  action
}: {
  title: string;
  body: string;
  action?: ReactNode;
}) {
  return (
    <div className="empty-state">
      <h3>{title}</h3>
      <p>{body}</p>
      {action ? <div>{action}</div> : null}
    </div>
  );
}

export function Skeleton({ rows = 3 }: { rows?: number }) {
  return (
    <div className="skeleton-wrap" aria-label="Memuat">
      {Array.from({ length: rows }).map((_, index) => (
        <span key={index} className="skeleton-line" />
      ))}
    </div>
  );
}

export function FormActions({
  children,
  onSubmit
}: {
  children: ReactNode;
  onSubmit?: (event: FormEvent<HTMLFormElement>) => void;
}) {
  return (
    <form className="stack" onSubmit={onSubmit}>
      {children}
    </form>
  );
}

export type DataTableColumn<T> = {
  id: string;
  header: ReactNode;
  cell: (row: T) => ReactNode;
  sortingValue?: (row: T) => string | number;
  enableSorting?: boolean;
  className?: string;
  mobileLabel?: string;
};

export function DataTable<T>({
  data,
  columns,
  getRowId,
  loading,
  empty,
  onRowClick
}: {
  data: T[];
  columns: Array<DataTableColumn<T>>;
  getRowId: (row: T, index: number) => string;
  loading?: boolean;
  empty?: ReactNode;
  onRowClick?: (row: T) => void;
}) {
  const [sorting, setSorting] = useState<SortingState>([]);
  const columnDefs = useMemo<Array<ColumnDef<T>>>(
    () =>
      columns.map((column) => ({
        id: column.id,
        header: () => column.header,
        accessorFn: column.sortingValue || (() => ""),
        enableSorting: column.enableSorting ?? Boolean(column.sortingValue),
        cell: ({ row }) => column.cell(row.original),
        meta: {
          className: column.className,
          mobileLabel: column.mobileLabel
        }
      })),
    [columns]
  );
  const table = useReactTable({
    data,
    columns: columnDefs,
    state: { sorting },
    onSortingChange: setSorting,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getRowId: (row, index) => getRowId(row, index)
  });

  if (loading) return <Skeleton rows={8} />;
  if (!data.length) return <>{empty || <EmptyState title="Tidak ada data" body="Belum ada data untuk ditampilkan." />}</>;

  return (
    <div className="data-table-shell">
      <div className="table-wrap data-table-desktop">
        <table>
          <thead>
            {table.getHeaderGroups().map((headerGroup) => (
              <tr key={headerGroup.id}>
                {headerGroup.headers.map((header) => {
                  const sortable = header.column.getCanSort();
                  return (
                    <th key={header.id} scope="col">
                      {sortable ? (
                        <button className="th-button" type="button" onClick={header.column.getToggleSortingHandler()}>
                          {flexRender(header.column.columnDef.header, header.getContext())}
                          <ChevronDown
                            size={14}
                            aria-hidden="true"
                            className={cn("sort-icon", header.column.getIsSorted() === "desc" && "sort-icon-desc")}
                          />
                        </button>
                      ) : (
                        flexRender(header.column.columnDef.header, header.getContext())
                      )}
                    </th>
                  );
                })}
              </tr>
            ))}
          </thead>
          <tbody>
            {table.getRowModel().rows.map((row) => (
              <tr
                key={row.id}
                className={onRowClick ? "clickable-row" : undefined}
                onClick={onRowClick ? () => onRowClick(row.original) : undefined}
              >
                {row.getVisibleCells().map((cell) => {
                  const meta = cell.column.columnDef.meta as { className?: string } | undefined;
                  return (
                    <td key={cell.id} className={meta?.className}>
                      {flexRender(cell.column.columnDef.cell, cell.getContext())}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="data-card-list">
        {table.getRowModel().rows.map((row) => (
          <article
            key={row.id}
            className={cn("data-card-row", onRowClick && "clickable-row")}
            onClick={onRowClick ? () => onRowClick(row.original) : undefined}
          >
            {row.getVisibleCells().map((cell) => {
              const meta = cell.column.columnDef.meta as { mobileLabel?: string; className?: string } | undefined;
              return (
                <div key={cell.id} className={cn("data-card-cell", meta?.className)}>
                  <span>{meta?.mobileLabel || String(cell.column.columnDef.header || "")}</span>
                  <div>{flexRender(cell.column.columnDef.cell, cell.getContext())}</div>
                </div>
              );
            })}
          </article>
        ))}
      </div>
    </div>
  );
}

export function ActionMenu({
  label = "Aksi",
  children
}: {
  label?: string;
  children: ReactNode;
}) {
  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger asChild>
        <IconButton label={label} variant="secondary" icon={<MoreHorizontal size={18} />} onClick={(event) => event.stopPropagation()} />
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content className="dropdown-menu" align="end" sideOffset={6}>
          {children}
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}

export function ActionMenuItem({
  children,
  tone = "neutral",
  disabled,
  onSelect
}: {
  children: ReactNode;
  tone?: "neutral" | "danger";
  disabled?: boolean;
  onSelect: () => void;
}) {
  return (
    <DropdownMenu.Item
      className={cn("dropdown-item", tone === "danger" && "dropdown-item-danger")}
      disabled={disabled}
      onSelect={() => {
        onSelect();
      }}
    >
      {children}
    </DropdownMenu.Item>
  );
}

export function ExportMenu({
  onExport
}: {
  onExport: (format: "csv" | "json") => void;
}) {
  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger asChild>
        <Button variant="secondary" type="button" icon={<Download size={16} />}>
          Export
        </Button>
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content className="dropdown-menu" align="end" sideOffset={6}>
          <DropdownMenu.Item className="dropdown-item" onSelect={() => onExport("csv")}>
            CSV
          </DropdownMenu.Item>
          <DropdownMenu.Item className="dropdown-item" onSelect={() => onExport("json")}>
            JSON
          </DropdownMenu.Item>
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}

export function FilterToggle({
  open,
  onClick
}: {
  open: boolean;
  onClick: () => void;
}) {
  return (
    <Button variant="secondary" type="button" icon={<SlidersHorizontal size={16} />} onClick={onClick}>
      {open ? "Tutup Filter" : "Filter"}
    </Button>
  );
}
