import { cn } from "@/lib/utils";

export type RequestStatus =
  | "submitted"
  | "ea_triage"
  | "ea_approved"
  | "ea_rejected"
  | "modification_requested"
  | "tdd_in_progress"
  | "tdd_completed"
  | "devsecops_approved"
  | "devsecops_rejected"
  | "observability_approved"
  | "finops_active"
  | "cancelled";

const STATUS_CONFIG: Record<RequestStatus, { label: string; className: string }> = {
  submitted:              { label: "Submitted",               className: "bg-yellow-100 text-yellow-700 border-yellow-200" },
  ea_triage:              { label: "Under Review",            className: "bg-orange-100 text-orange-700 border-orange-200" },
  ea_approved:            { label: "Approved",                className: "bg-green-100 text-green-700 border-green-200" },
  ea_rejected:            { label: "Not Approved",            className: "bg-red-100 text-red-700 border-red-200" },
  modification_requested: { label: "Changes Requested",       className: "bg-amber-100 text-amber-700 border-amber-200" },
  tdd_in_progress:        { label: "Design In Progress",      className: "bg-blue-100 text-blue-700 border-blue-200" },
  tdd_completed:          { label: "Design Complete",         className: "bg-purple-100 text-purple-700 border-purple-200" },
  devsecops_approved:     { label: "Infrastructure Approved", className: "bg-indigo-100 text-indigo-700 border-indigo-200" },
  devsecops_rejected:     { label: "Infrastructure Rejected", className: "bg-red-100 text-red-700 border-red-200" },
  observability_approved: { label: "Observability Approved",  className: "bg-cyan-100 text-cyan-700 border-cyan-200" },
  finops_active:          { label: "Live — Cost Managed",     className: "bg-emerald-100 text-emerald-700 border-emerald-200" },
  cancelled:              { label: "Cancelled",               className: "bg-slate-100 text-slate-500 border-slate-200" },
};

export function StatusBadge({ status }: { status: RequestStatus }) {
  const cfg = STATUS_CONFIG[status] ?? { label: status, className: "bg-slate-100 text-slate-600 border-slate-200" };
  return (
    <span className={cn("text-xs font-medium px-2 py-0.5 rounded-full border shrink-0 whitespace-nowrap", cfg.className)}>
      {cfg.label}
    </span>
  );
}
