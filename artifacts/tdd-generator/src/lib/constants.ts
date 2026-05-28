export const CLOUD_TENANT_VALUE = "Azure Cloud (McCain Tenant)";

export const THIRD_PARTY_MODELS = [
  "SaaS Solution",
  "Vendor Cloud Tenant (Azure/AWS/GCP/Others)",
  "On-Premises (McCain Data Center)",
  "Hybrid Solution (McCain Data Center & McCain Cloud)",
  "Any other 3rd party Solution",
] as const;

export const TERMINAL_STATUSES = [
  "finops_active",
  "cancelled",
  "ea_rejected",
  "devsecops_rejected",
] as const;

export const PRIORITY_COLORS: Record<string, string> = {
  Critical: "text-red-600",
  High:     "text-orange-600",
  Medium:   "text-yellow-600",
  Low:      "text-slate-500",
};
