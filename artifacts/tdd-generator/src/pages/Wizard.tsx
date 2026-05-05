import { useState, useEffect, useRef, useCallback } from "react";
import { useForm, FormProvider } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useLocation, useParams } from "wouter";
import { useAppContext } from "@/store/app-context";
import { getApiBase } from "@/lib/api-base";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Switch } from "@/components/ui/switch";
import { FormField, FormItem, FormLabel, FormControl, FormMessage, FormDescription } from "@/components/ui/form";
import {
  useAnalyzeCidr,
  type CidrAnalysisResponse,
  type NamingPreviewResponse,
  type NamingConvention,
  type SubnetInfo,
  type TddFormData,
} from "@workspace/api-client-react";
import { ChevronRight, ChevronLeft, Check, FileText, Server, Users, Layers, ShieldCheck, UploadCloud, X, ImageIcon } from "lucide-react";

const formSchema = z.object({
  // Step 1
  applicationName: z.string().min(1, "Application Name is required"),
  applicationType: z.enum(["Migration", "Greenfield"]),
  applicationOverview: z.string().min(1, "Required"),
  organization: z.string().min(1, "Required"),
  lineOfBusiness: z.string().min(1, "Required"),
  solution: z.string().optional(),
  environmentsRequired: z.array(z.string()).min(1, "Select at least one environment"),
  azureRegions: z.array(z.string()).min(1, "Select at least one region"),
  workloadTier: z.enum(["Tier 0", "Tier 1", "Tier 2", "Tier 3"]),
  haEnabled: z.boolean().default(false),
  drEnabled: z.boolean().default(false),

  // Step 2
  infrastructureSupportManager: z.string().min(1, "Required"),
  applicationSupportManager: z.string().min(1, "Required"),
  itOwner: z.string().min(1, "Required"),
  businessOwner: z.string().min(1, "Required"),
  requestorEmail: z.string().email("Invalid email"),
  glAccountOwnerEmail: z.string().email("Invalid email"),
  technologyOwnerEmail: z.string().email("Invalid email"),
  businessOwnerEmail: z.string().email("Invalid email"),
  billingCompanyCode: z.string().min(1, "Required"),
  billingPlant: z.string().min(1, "Required"),
  billingCostObject: z.string().min(1, "Required"),
  billingGlAccount: z.string().min(1, "Required"),
  budgetTrackerReference: z.string().min(1, "Required"),
  categoryOwner: z.string().min(1, "Required"),
  networkPosture: z.enum(["Internet-Facing", "Internal-Only", "Hybrid"]),

  // Step 3 - per-environment CIDRs instead of single networkCidr
  environmentCidrs: z.record(
    z.string(),
    z.string().regex(/^([0-9]{1,3}\.){3}[0-9]{1,3}\/[0-9]{1,2}$/, "Must be a valid CIDR (e.g. 10.0.0.0/16)")
  ).refine((val) => Object.keys(val).length > 0, { message: "At least one environment CIDR is required" }),
  keyStakeholders: z.string().optional(),

  // Step 4
  frontendStack: z.string().optional(),
  backendStack: z.string().optional(),
  databaseStack: z.string().optional(),
  applicationArchitecture: z.string().min(1, "Required"),
  applicationFlow: z.string().min(1, "Required"),
  scalabilityRequirements: z.string().optional(),
  availabilityTarget: z.string().optional(),
  rto: z.string().optional(),
  rpo: z.string().optional(),
  monitoringRequiredFor: z.array(z.string()).default(["Prod"]),
});

type FormValues = z.infer<typeof formSchema>;

function filterEnvironmentCidrsToSelected(
  cidrs: Record<string, string>,
  selectedEnvironments: string[]
): Record<string, string> {
  const allowed = new Set(selectedEnvironments);
  const filtered: Record<string, string> = {};
  for (const [env, cidr] of Object.entries(cidrs)) {
    if (allowed.has(env)) {
      filtered[env] = cidr;
    }
  }
  return filtered;
}

const STEPS = [
  { id: 1, title: "Application Basics", icon: FileText, fields: ["applicationName", "applicationType", "applicationOverview", "organization", "lineOfBusiness", "environmentsRequired", "azureRegions", "workloadTier", "haEnabled", "drEnabled"] },
  { id: 2, title: "Stakeholders & Billing", icon: Users, fields: ["infrastructureSupportManager", "applicationSupportManager", "itOwner", "businessOwner", "requestorEmail", "glAccountOwnerEmail", "technologyOwnerEmail", "businessOwnerEmail", "billingCompanyCode", "billingPlant", "billingCostObject", "billingGlAccount", "budgetTrackerReference", "categoryOwner", "networkPosture"] },
  { id: 3, title: "Network & Architecture", icon: Server, fields: ["environmentCidrs", "keyStakeholders"] },
  { id: 4, title: "Technical Stack", icon: Layers, fields: ["frontendStack", "backendStack", "databaseStack", "applicationArchitecture", "applicationFlow", "scalabilityRequirements", "availabilityTarget", "rto", "rpo", "monitoringRequiredFor"] },
  { id: 5, title: "Review & Generate", icon: ShieldCheck, fields: [] },
];

export default function Wizard() {
  const [currentStep, setCurrentStep] = useState(1);
  const { formData, updateFormData } = useAppContext();
  const [, setLocation] = useLocation();
  const params = useParams<{ requestId?: string }>();
  const requestId = params?.requestId ? parseInt(params.requestId, 10) : null;

  const [diagramBase64, setDiagramBase64] = useState<string | null>(
    formData.architectureDiagramBase64 ?? null,
  );
  const [diagramName, setDiagramName] = useState<string | null>(
    formData.architectureDiagramName ?? null,
  );
  const [isDragOver, setIsDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleDiagramFile = useCallback((file: File) => {
    const allowed = ["image/png", "image/jpeg", "image/jpg", "image/gif", "image/webp"];
    if (!allowed.includes(file.type)) return;
    const reader = new FileReader();
    reader.onload = (e) => {
      const result = e.target?.result as string;
      setDiagramBase64(result);
      setDiagramName(file.name);
    };
    reader.readAsDataURL(file);
  }, []);

  const handleFileInputChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (file) handleDiagramFile(file);
    },
    [handleDiagramFile],
  );

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setIsDragOver(false);
      const file = e.dataTransfer.files?.[0];
      if (file) handleDiagramFile(file);
    },
    [handleDiagramFile],
  );

  const removeDiagram = useCallback(() => {
    setDiagramBase64(null);
    setDiagramName(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }, []);

  const form = useForm<FormValues>({
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    resolver: zodResolver(formSchema as any),
    defaultValues: {
      ...formData,
      applicationName: formData.applicationName ?? "",
      applicationType: formData.applicationType ?? "Greenfield",
      applicationOverview: formData.applicationOverview ?? "",
      organization: formData.organization ?? "",
      lineOfBusiness: formData.lineOfBusiness ?? "",
      solution: formData.solution ?? "",
      environmentsRequired: formData.environmentsRequired ?? ["Dev", "QA", "Prod"],
      azureRegions: formData.azureRegions ?? ["canadacentral"],
      workloadTier: formData.workloadTier ?? "Tier 2",
      haEnabled: formData.haEnabled ?? false,
      drEnabled: formData.drEnabled ?? false,

      infrastructureSupportManager: formData.infrastructureSupportManager ?? "",
      applicationSupportManager: formData.applicationSupportManager ?? "",
      itOwner: formData.itOwner ?? "",
      businessOwner: formData.businessOwner ?? "",
      requestorEmail: formData.requestorEmail ?? "",
      glAccountOwnerEmail: formData.glAccountOwnerEmail ?? "",
      technologyOwnerEmail: formData.technologyOwnerEmail ?? "",
      businessOwnerEmail: formData.businessOwnerEmail ?? "",
      billingCompanyCode: formData.billingCompanyCode ?? "",
      billingPlant: formData.billingPlant ?? "",
      billingCostObject: formData.billingCostObject ?? "",
      billingGlAccount: formData.billingGlAccount ?? "",
      budgetTrackerReference: formData.budgetTrackerReference ?? "",
      categoryOwner: formData.categoryOwner ?? "",
      networkPosture: formData.networkPosture ?? "Internal-Only",

      environmentCidrs: (formData.environmentCidrs as Record<string, string>) ?? {},
      keyStakeholders: formData.keyStakeholders ?? "",

      frontendStack: formData.frontendStack ?? "",
      backendStack: formData.backendStack ?? "",
      databaseStack: formData.databaseStack ?? "",
      applicationArchitecture: formData.applicationArchitecture ?? "",
      applicationFlow: formData.applicationFlow ?? "",
      scalabilityRequirements: formData.scalabilityRequirements ?? "",
      availabilityTarget: formData.availabilityTarget ?? "99.9%",
      rto: formData.rto ?? "",
      rpo: formData.rpo ?? "",
      monitoringRequiredFor: formData.monitoringRequiredFor ?? ["Prod"],
    },
    mode: "onChange"
  });

  const selectedEnvironments = form.watch("environmentsRequired");

  useEffect(() => {
    const cidrs = form.getValues("environmentCidrs") ?? {};
    const filteredCidrs = filterEnvironmentCidrsToSelected(
      cidrs,
      selectedEnvironments ?? []
    );

    if (Object.keys(filteredCidrs).length !== Object.keys(cidrs).length) {
      form.setValue("environmentCidrs", filteredCidrs, { shouldValidate: false });
    }
  }, [form, selectedEnvironments]);

  // Pre-fill wizard from approved architecture request
  useEffect(() => {
    if (!requestId) return;
    fetch(`${getApiBase()}/api/requests/${requestId}`, { credentials: "include" })
      .then((r) => r.json())
      .then(({ request }) => {
        if (!request) return;
        // Map request fields → wizard form fields
        form.setValue("applicationName", request.applicationName ?? "");
        if (request.applicationType === "Migration" || request.applicationType === "Greenfield") {
          form.setValue("applicationType", request.applicationType);
        }
        if (request.description) {
          form.setValue("applicationOverview", request.description);
        }
        if (request.businessUnit) {
          form.setValue("organization", request.businessUnit);
        }
        if (request.lineOfBusiness) {
          form.setValue("lineOfBusiness", request.lineOfBusiness);
        }
        // Normalize environment names from the submit-request form values to wizard schema values
        const envNameMap: Record<string, string> = {
          Development: "Dev",
          development: "Dev",
          dev: "Dev",
          QA: "QA",
          qa: "QA",
          UAT: "UAT",
          uat: "UAT",
          Production: "Prod",
          production: "Prod",
          prod: "Prod",
          Prod: "Prod",
        };
        if (request.targetEnvironments?.length) {
          const normalized = (request.targetEnvironments as string[])
            .map((e) => envNameMap[e] ?? e)
            .filter((e): e is "Dev" | "QA" | "UAT" | "Prod" =>
              ["Dev", "QA", "UAT", "Prod"].includes(e)
            );
          form.setValue("environmentsRequired", normalized.length ? normalized : ["Dev", "QA", "Prod"]);
        }

        // Normalize region labels to Azure region IDs
        const regionNameMap: Record<string, string> = {
          "Canada Central": "canadacentral",
          "canada central": "canadacentral",
          canadacentral: "canadacentral",
          "Canada East": "canadaeast",
          "canada east": "canadaeast",
          canadaeast: "canadaeast",
        };
        if (request.azureRegions?.length) {
          const normalized = (request.azureRegions as string[])
            .map((r) => regionNameMap[r] ?? r)
            .filter((r) => ["canadacentral", "canadaeast"].includes(r));
          form.setValue("azureRegions", normalized.length ? normalized : ["canadacentral"]);
        }
        // Pre-fill workloadTier / HA / DR from tddFormData saved at request submission
        const tdd = request.tddFormData as { workloadTier?: string; haEnabled?: boolean; drEnabled?: boolean } | null;
        if (tdd?.workloadTier && ["Tier 0","Tier 1","Tier 2","Tier 3"].includes(tdd.workloadTier)) {
          form.setValue("workloadTier", tdd.workloadTier as "Tier 0"|"Tier 1"|"Tier 2"|"Tier 3");
        }
        if (typeof tdd?.haEnabled === "boolean") form.setValue("haEnabled", tdd.haEnabled);
        if (typeof tdd?.drEnabled === "boolean") form.setValue("drEnabled", tdd.drEnabled);

        // Store requestId for Preview to use when marking complete
        localStorage.setItem("activeRequestId", String(requestId));

        // All of Step 1 is now pre-filled from the request — skip straight to Step 2
        setCurrentStep(2);
      })
      .catch(() => {/* silently fail — wizard works standalone */});
  }, [requestId, form]);

  // Clear stored requestId when wizard is used standalone
  useEffect(() => {
    if (!requestId) {
      localStorage.removeItem("activeRequestId");
    }
  }, [requestId]);

  const nextStep = async () => {
    const fieldsToValidate = STEPS[currentStep - 1].fields as Array<keyof FormValues>;
    const isValid = await form.trigger(fieldsToValidate);
    
    if (isValid) {
      updateFormData(form.getValues());
      setCurrentStep((prev) => Math.min(prev + 1, 5));
      window.scrollTo(0, 0);
    }
  };

  const prevStep = () => {
    setCurrentStep((prev) => Math.max(prev - 1, 1));
    window.scrollTo(0, 0);
  };

  const onSubmit = (data: FormValues) => {
    const firstEnvCidr = Object.values(data.environmentCidrs)[0];
    updateFormData({
      ...data,
      networkCidr: firstEnvCidr,
      architectureDiagramBase64: diagramBase64 ?? undefined,
      architectureDiagramName: diagramName ?? undefined,
    });
    setLocation("/preview");
  };

  return (
    <div className="max-w-4xl mx-auto space-y-8 animate-in fade-in duration-500">
      <div className="mb-8">
        <h2 className="text-2xl font-bold text-slate-900 tracking-tight">Generate Technical Design Document</h2>
        <p className="text-slate-500 mt-1">Complete the intake form to generate a structured Azure TDD.</p>
      </div>

      {/* Progress Stepper */}
      <div className="flex items-center justify-between relative mb-12">
        <div className="absolute left-0 top-1/2 -translate-y-1/2 w-full h-1 bg-slate-200 rounded-full z-0"></div>
        <div 
          className="absolute left-0 top-1/2 -translate-y-1/2 h-1 bg-primary transition-all duration-300 rounded-full z-0"
          style={{ width: `${((currentStep - 1) / (STEPS.length - 1)) * 100}%` }}
        ></div>
        
        {STEPS.map((step) => {
          const StepIcon = step.icon;
          const isActive = currentStep === step.id;
          const isCompleted = currentStep > step.id;
          
          return (
            <div key={step.id} className="relative z-10 flex flex-col items-center gap-2 bg-slate-50 px-2">
              <div className={`w-10 h-10 rounded-full flex items-center justify-center border-2 transition-colors duration-300 ${isActive ? 'bg-primary border-primary text-white shadow-md' : isCompleted ? 'bg-primary border-primary text-white' : 'bg-white border-slate-300 text-slate-400'}`}>
                {isCompleted ? <Check className="w-5 h-5" /> : <StepIcon className="w-5 h-5" />}
              </div>
              <span className={`text-xs font-medium ${isActive ? 'text-primary' : isCompleted ? 'text-slate-700' : 'text-slate-400'}`}>
                {step.title}
              </span>
            </div>
          );
        })}
      </div>

      <Card className="border-slate-200 shadow-sm overflow-visible relative bg-white">
        <CardHeader className="bg-slate-50/50 border-b border-slate-100 rounded-t-lg pb-6">
          <CardTitle className="text-xl text-slate-800">{STEPS[currentStep - 1].title}</CardTitle>
          <CardDescription>Step {currentStep} of {STEPS.length}</CardDescription>
        </CardHeader>
        <CardContent className="p-8">
          <FormProvider {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
              
              {/* STEP 1: Basics */}
              <div className={currentStep === 1 ? "space-y-8 block" : "hidden"}>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <FormField control={form.control} name="applicationName" render={({ field }) => (
                    <FormItem>
                      <FormLabel>Application Name<span className="text-destructive ml-0.5">*</span></FormLabel>
                      <FormControl><Input placeholder="e.g. Supplier Portal" {...field} /></FormControl>
                      <FormMessage />
                    </FormItem>
                  )} />
                  <FormField control={form.control} name="applicationType" render={({ field }) => (
                    <FormItem>
                      <FormLabel>Application Type<span className="text-destructive ml-0.5">*</span></FormLabel>
                      <Select onValueChange={field.onChange} defaultValue={field.value}>
                        <FormControl><SelectTrigger><SelectValue placeholder="Select type" /></SelectTrigger></FormControl>
                        <SelectContent>
                          <SelectItem value="Greenfield">Greenfield</SelectItem>
                          <SelectItem value="Migration">Migration</SelectItem>
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )} />
                </div>

                <FormField control={form.control} name="applicationOverview" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Application Overview<span className="text-destructive ml-0.5">*</span></FormLabel>
                    <FormControl><Textarea className="h-24" placeholder="Brief description of the application's purpose..." {...field} /></FormControl>
                    <FormMessage />
                  </FormItem>
                )} />

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <FormField control={form.control} name="organization" render={({ field }) => (
                    <FormItem>
                      <FormLabel>Organization<span className="text-destructive ml-0.5">*</span></FormLabel>
                      <FormControl><Input {...field} /></FormControl>
                      <FormMessage />
                    </FormItem>
                  )} />
                  <FormField control={form.control} name="lineOfBusiness" render={({ field }) => (
                    <FormItem>
                      <FormLabel>Line of Business<span className="text-destructive ml-0.5">*</span></FormLabel>
                      <FormControl><Input placeholder="e.g. Supply Chain" {...field} /></FormControl>
                      <FormMessage />
                    </FormItem>
                  )} />
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-8 pt-4 border-t border-slate-100">
                  <FormField control={form.control} name="environmentsRequired" render={() => (
                    <FormItem>
                      <div className="mb-4"><FormLabel className="text-base">Environments Required<span className="text-destructive ml-0.5">*</span></FormLabel><p className="text-xs text-slate-500 mt-1">Pre-filled from architecture review request</p></div>
                      <div className="grid grid-cols-2 gap-4">
                        {["Dev", "QA", "UAT", "Prod"].map((env) => (
                          <FormField key={env} control={form.control} name="environmentsRequired" render={({ field }) => {
                            return (
                              <FormItem key={env} className="flex flex-row items-start space-x-3 space-y-0 rounded-md border border-slate-200 p-4 shadow-sm hover:bg-slate-50 transition-colors">
                                <FormControl>
                                  <Checkbox checked={field.value?.includes(env)} onCheckedChange={(checked) => {
                                      return checked
                                        ? field.onChange([...field.value, env])
                                        : field.onChange(field.value?.filter((value) => value !== env));
                                    }} />
                                </FormControl>
                                <FormLabel className="font-normal cursor-pointer">{env}</FormLabel>
                              </FormItem>
                            );
                          }} />
                        ))}
                      </div>
                      <FormMessage />
                    </FormItem>
                  )} />

                  <FormField control={form.control} name="azureRegions" render={() => (
                    <FormItem>
                      <div className="mb-4"><FormLabel className="text-base">Azure Regions<span className="text-destructive ml-0.5">*</span></FormLabel><p className="text-xs text-slate-500 mt-1">Pre-filled from architecture review request</p></div>
                      <div className="grid grid-cols-1 gap-4">
                        {[
                          { id: "canadacentral", label: "Canada Central (Toronto)" },
                          { id: "canadaeast", label: "Canada East (Quebec City)" }
                        ].map((region) => (
                          <FormField key={region.id} control={form.control} name="azureRegions" render={({ field }) => {
                            return (
                              <FormItem key={region.id} className="flex flex-row items-start space-x-3 space-y-0 rounded-md border border-slate-200 p-4 shadow-sm hover:bg-slate-50 transition-colors">
                                <FormControl>
                                  <Checkbox checked={field.value?.includes(region.id)} onCheckedChange={(checked) => {
                                      return checked
                                        ? field.onChange([...field.value, region.id])
                                        : field.onChange(field.value?.filter((value) => value !== region.id));
                                    }} />
                                </FormControl>
                                <FormLabel className="font-normal cursor-pointer">{region.label}</FormLabel>
                              </FormItem>
                            );
                          }} />
                        ))}
                      </div>
                      <FormMessage />
                    </FormItem>
                  )} />
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-6 pt-4 border-t border-slate-100">
                  <FormField control={form.control} name="workloadTier" render={({ field }) => (
                    <FormItem>
                      <FormLabel>Workload Tier<span className="text-destructive ml-0.5">*</span></FormLabel>
                      <Select onValueChange={field.onChange} defaultValue={field.value}>
                        <FormControl><SelectTrigger><SelectValue placeholder="Select tier" /></SelectTrigger></FormControl>
                        <SelectContent>
                          <SelectItem value="Tier 0">Tier 0 (Mission Critical)</SelectItem>
                          <SelectItem value="Tier 1">Tier 1 (Business Critical)</SelectItem>
                          <SelectItem value="Tier 2">Tier 2 (Important)</SelectItem>
                          <SelectItem value="Tier 3">Tier 3 (Standard)</SelectItem>
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )} />
                  <FormField control={form.control} name="haEnabled" render={({ field }) => (
                    <FormItem className="flex flex-row items-center justify-between rounded-lg border border-slate-200 p-4 shadow-sm">
                      <div className="space-y-0.5">
                        <FormLabel>High Availability</FormLabel>
                        <FormDescription>Zone redundancy</FormDescription>
                      </div>
                      <FormControl><Switch checked={field.value} onCheckedChange={field.onChange} /></FormControl>
                    </FormItem>
                  )} />
                  <FormField control={form.control} name="drEnabled" render={({ field }) => (
                    <FormItem className="flex flex-row items-center justify-between rounded-lg border border-slate-200 p-4 shadow-sm">
                      <div className="space-y-0.5">
                        <FormLabel>DR Plan Required</FormLabel>
                        <FormDescription>
                          Cross-region failover (Canada East)
                          {form.watch("environmentsRequired")?.includes("Prod") ? " — recommended for Prod" : ""}
                        </FormDescription>
                      </div>
                      <FormControl><Switch checked={field.value} onCheckedChange={field.onChange} /></FormControl>
                    </FormItem>
                  )} />
                </div>
              </div>

              {/* STEP 2: Stakeholders & Billing */}
              <div className={currentStep === 2 ? "space-y-8 block" : "hidden"}>
                <div className="mb-4"><h3 className="text-lg font-medium text-slate-800 border-b pb-2">Key Personnel</h3></div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <FormField control={form.control} name="businessOwner" render={({ field }) => (
                    <FormItem><FormLabel>Business Owner<span className="text-destructive ml-0.5">*</span></FormLabel><FormControl><Input placeholder="Name" {...field} /></FormControl><FormMessage /></FormItem>
                  )} />
                  <FormField control={form.control} name="businessOwnerEmail" render={({ field }) => (
                    <FormItem><FormLabel>Business Owner Email<span className="text-destructive ml-0.5">*</span></FormLabel><FormControl><Input placeholder="email@mccain.com" type="email" {...field} /></FormControl><FormMessage /></FormItem>
                  )} />
                  <FormField control={form.control} name="itOwner" render={({ field }) => (
                    <FormItem><FormLabel>IT Owner<span className="text-destructive ml-0.5">*</span></FormLabel><FormControl><Input placeholder="Name" {...field} /></FormControl><FormMessage /></FormItem>
                  )} />
                  <FormField control={form.control} name="technologyOwnerEmail" render={({ field }) => (
                    <FormItem><FormLabel>Technology Owner Email<span className="text-destructive ml-0.5">*</span></FormLabel><FormControl><Input placeholder="email@mccain.com" type="email" {...field} /></FormControl><FormMessage /></FormItem>
                  )} />
                  <FormField control={form.control} name="applicationSupportManager" render={({ field }) => (
                    <FormItem><FormLabel>Application Support Manager<span className="text-destructive ml-0.5">*</span></FormLabel><FormControl><Input placeholder="Name" {...field} /></FormControl><FormMessage /></FormItem>
                  )} />
                  <FormField control={form.control} name="infrastructureSupportManager" render={({ field }) => (
                    <FormItem><FormLabel>Infrastructure Support Manager<span className="text-destructive ml-0.5">*</span></FormLabel><FormControl><Input placeholder="Name" {...field} /></FormControl><FormMessage /></FormItem>
                  )} />
                  <FormField control={form.control} name="requestorEmail" render={({ field }) => (
                    <FormItem><FormLabel>Requestor Email<span className="text-destructive ml-0.5">*</span></FormLabel><FormControl><Input placeholder="email@mccain.com" type="email" {...field} /></FormControl><FormMessage /></FormItem>
                  )} />
                  <FormField control={form.control} name="glAccountOwnerEmail" render={({ field }) => (
                    <FormItem><FormLabel>GL Account Owner Email<span className="text-destructive ml-0.5">*</span></FormLabel><FormControl><Input placeholder="email@mccain.com" type="email" {...field} /></FormControl><FormMessage /></FormItem>
                  )} />
                </div>

                <div className="mb-4 mt-8"><h3 className="text-lg font-medium text-slate-800 border-b pb-2">Billing Details</h3></div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <FormField control={form.control} name="billingCompanyCode" render={({ field }) => (
                    <FormItem><FormLabel>Company Code<span className="text-destructive ml-0.5">*</span></FormLabel><FormControl><Input placeholder="e.g. 1000" {...field} /></FormControl><FormMessage /></FormItem>
                  )} />
                  <FormField control={form.control} name="billingPlant" render={({ field }) => (
                    <FormItem><FormLabel>Plant<span className="text-destructive ml-0.5">*</span></FormLabel><FormControl><Input placeholder="e.g. P100" {...field} /></FormControl><FormMessage /></FormItem>
                  )} />
                  <FormField control={form.control} name="billingCostObject" render={({ field }) => (
                    <FormItem><FormLabel>Cost Center / WBS<span className="text-destructive ml-0.5">*</span></FormLabel><FormControl><Input placeholder="e.g. CC12345" {...field} /></FormControl><FormMessage /></FormItem>
                  )} />
                  <FormField control={form.control} name="billingGlAccount" render={({ field }) => (
                    <FormItem><FormLabel>GL Account<span className="text-destructive ml-0.5">*</span></FormLabel><FormControl><Input placeholder="e.g. 600000" {...field} /></FormControl><FormMessage /></FormItem>
                  )} />
                  <FormField control={form.control} name="budgetTrackerReference" render={({ field }) => (
                    <FormItem><FormLabel>Budget Tracker Ref<span className="text-destructive ml-0.5">*</span></FormLabel><FormControl><Input placeholder="e.g. BTR-2023-01" {...field} /></FormControl><FormMessage /></FormItem>
                  )} />
                  <FormField control={form.control} name="categoryOwner" render={({ field }) => (
                    <FormItem><FormLabel>Category Owner<span className="text-destructive ml-0.5">*</span></FormLabel><FormControl><Input placeholder="Name" {...field} /></FormControl><FormMessage /></FormItem>
                  )} />
                </div>

                <div className="mb-4 mt-8"><h3 className="text-lg font-medium text-slate-800 border-b pb-2">Network Profile</h3></div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <FormField control={form.control} name="networkPosture" render={({ field }) => (
                    <FormItem>
                      <FormLabel>Network Posture<span className="text-destructive ml-0.5">*</span></FormLabel>
                      <Select onValueChange={field.onChange} defaultValue={field.value}>
                        <FormControl><SelectTrigger><SelectValue placeholder="Select posture" /></SelectTrigger></FormControl>
                        <SelectContent>
                          <SelectItem value="Internal-Only">Internal Only (VNet Integrated)</SelectItem>
                          <SelectItem value="Internet-Facing">Internet Facing (WAF/FrontDoor)</SelectItem>
                          <SelectItem value="Hybrid">Hybrid (On-Prem + Internet)</SelectItem>
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )} />
                </div>
              </div>

              {/* STEP 3: Network & Architecture */}
              <div className={currentStep === 3 ? "space-y-8 block" : "hidden"}>
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                  <div className="space-y-6">
                    {/* Per-environment CIDR inputs */}
                    <div className="space-y-2">
                      <div className="mb-2">
                        <FormLabel className="text-base">Virtual Network CIDR per Environment</FormLabel>
                        <p className="text-xs text-slate-500 mt-1">
                          Enter a separate CIDR block for each selected environment. Each environment gets its own isolated VNet.
                        </p>
                      </div>
                      <div className="space-y-3">
                        {form.watch("environmentsRequired")?.map((env, idx) => (
                          <FormField
                            key={env}
                            control={form.control}
                            name={`environmentCidrs.${env}` as `environmentCidrs.${string}`}
                            render={({ field }) => (
                              <FormItem>
                                <div className="flex items-center gap-3">
                                  <span className="w-16 text-sm font-medium text-slate-700 shrink-0">{env}</span>
                                  <FormControl>
                                    <Input
                                      placeholder={`e.g. 10.${idx + 1}.0.0/24`}
                                      {...field}
                                      value={field.value ?? ""}
                                    />
                                  </FormControl>
                                </div>
                                <FormMessage />
                              </FormItem>
                            )}
                          />
                        ))}
                      </div>
                    </div>
                    
                    <FormField control={form.control} name="keyStakeholders" render={({ field }) => (
                      <FormItem>
                        <FormLabel>Additional Key Stakeholders</FormLabel>
                        <FormControl><Textarea className="h-32" placeholder="List any other key stakeholders..." {...field} /></FormControl>
                        <FormMessage />
                      </FormItem>
                    )} />
                  </div>
                  
                  <div className="space-y-6">
                    <MultiEnvCidrAnalysisPanel
                      environmentCidrs={form.watch("environmentCidrs") ?? {}}
                      appName={form.watch("applicationName")}
                      org={form.watch("organization")}
                      envs={form.watch("environmentsRequired")}
                    />
                    <NamingPreviewPanel 
                      appName={form.watch("applicationName")} 
                      org={form.watch("organization")}
                      lob={form.watch("lineOfBusiness")}
                      envs={form.watch("environmentsRequired")}
                      region={form.watch("azureRegions")?.[0]}
                    />
                  </div>
                </div>
              </div>

              {/* STEP 4: Technical Stack */}
              <div className={currentStep === 4 ? "space-y-8 block" : "hidden"}>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                  <FormField control={form.control} name="frontendStack" render={({ field }) => (
                    <FormItem><FormLabel>Frontend Stack</FormLabel><FormControl><Input placeholder="e.g. React, Angular" {...field} /></FormControl><FormMessage /></FormItem>
                  )} />
                  <FormField control={form.control} name="backendStack" render={({ field }) => (
                    <FormItem><FormLabel>Backend Stack</FormLabel><FormControl><Input placeholder="e.g. .NET Core, Node.js" {...field} /></FormControl><FormMessage /></FormItem>
                  )} />
                  <FormField control={form.control} name="databaseStack" render={({ field }) => (
                    <FormItem><FormLabel>Database Stack</FormLabel><FormControl><Input placeholder="e.g. Azure SQL, Cosmos DB" {...field} /></FormControl><FormMessage /></FormItem>
                  )} />
                </div>
                
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <FormField control={form.control} name="applicationArchitecture" render={({ field }) => (
                    <FormItem>
                      <FormLabel>Architecture Description<span className="text-destructive ml-0.5">*</span></FormLabel>
                      <FormControl><Textarea className="h-32" placeholder="Describe the components and how they interact..." {...field} /></FormControl>
                      <FormMessage />
                    </FormItem>
                  )} />
                  <FormField control={form.control} name="applicationFlow" render={({ field }) => (
                    <FormItem>
                      <FormLabel>Data / Application Flow<span className="text-destructive ml-0.5">*</span></FormLabel>
                      <FormControl><Textarea className="h-32" placeholder="Step-by-step flow of data through the system..." {...field} /></FormControl>
                      <FormMessage />
                    </FormItem>
                  )} />
                </div>

                {/* Architecture Diagram Upload */}
                <div className="mt-2">
                  <label className="block text-sm font-medium text-slate-700 mb-1">
                    Architecture Diagram / Flow Diagram
                    <span className="ml-2 text-xs font-normal text-slate-400">(optional)</span>
                  </label>
                  <p className="text-xs text-slate-500 mb-3">
                    Upload an existing diagram (PNG, JPG, GIF, WebP). The AI will analyze it to produce a more accurate architecture section. The image will also be embedded in section 6.2 of the TDD.
                  </p>

                  {diagramBase64 ? (
                    <div className="relative flex items-start gap-4 rounded-lg border border-slate-200 bg-slate-50 p-4">
                      <div className="flex-shrink-0 w-24 h-24 rounded-md overflow-hidden border border-slate-200 bg-white flex items-center justify-center">
                        <img src={diagramBase64} alt="Architecture diagram preview" className="w-full h-full object-contain" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <ImageIcon className="w-4 h-4 text-primary flex-shrink-0" />
                          <p className="text-sm font-medium text-slate-800 truncate">{diagramName}</p>
                        </div>
                        <p className="text-xs text-slate-500">Diagram attached — AI will analyze this image during generation.</p>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          className="mt-3 text-xs text-red-600 border-red-200 hover:bg-red-50"
                          onClick={removeDiagram}
                        >
                          <X className="w-3 h-3 mr-1" />
                          Remove
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <div
                      className={`relative flex flex-col items-center justify-center rounded-lg border-2 border-dashed p-8 text-center transition-colors cursor-pointer ${
                        isDragOver
                          ? "border-primary bg-primary/5"
                          : "border-slate-300 bg-slate-50 hover:border-slate-400 hover:bg-slate-100"
                      }`}
                      onDragOver={(e) => { e.preventDefault(); setIsDragOver(true); }}
                      onDragLeave={() => setIsDragOver(false)}
                      onDrop={handleDrop}
                      onClick={() => fileInputRef.current?.click()}
                    >
                      <UploadCloud className={`w-8 h-8 mb-3 ${isDragOver ? "text-primary" : "text-slate-400"}`} />
                      <p className="text-sm font-medium text-slate-700">
                        {isDragOver ? "Drop to upload" : "Click or drag & drop to upload"}
                      </p>
                      <p className="text-xs text-slate-400 mt-1">PNG, JPG, GIF, WebP supported</p>
                    </div>
                  )}

                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/png,image/jpeg,image/gif,image/webp"
                    className="hidden"
                    onChange={handleFileInputChange}
                  />
                </div>

                <div className="mb-4 mt-8"><h3 className="text-lg font-medium text-slate-800 border-b pb-2">Non-Functional Requirements</h3></div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <FormField control={form.control} name="scalabilityRequirements" render={({ field }) => (
                    <FormItem><FormLabel>Scalability</FormLabel><FormControl><Input placeholder="e.g. Auto-scale to 10 instances" {...field} /></FormControl><FormMessage /></FormItem>
                  )} />
                  <FormField control={form.control} name="availabilityTarget" render={({ field }) => (
                    <FormItem><FormLabel>Availability Target</FormLabel><FormControl><Input placeholder="99.9%" {...field} /></FormControl><FormMessage /></FormItem>
                  )} />
                </div>

                {/* Monitoring per environment */}
                <div className="mb-2 mt-6"><h3 className="text-lg font-medium text-slate-800 border-b pb-2">Monitoring & Observability</h3></div>
                <FormField control={form.control} name="monitoringRequiredFor" render={() => (
                  <FormItem>
                    <div className="mb-3">
                      <FormLabel className="text-base">Environments requiring monitoring</FormLabel>
                      <FormDescription className="text-xs mt-1">Select which environments need full observability (Application Insights, alerts, dashboards). Dev and QA are often excluded.</FormDescription>
                    </div>
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                      {(form.watch("environmentsRequired") ?? []).map((env) => (
                        <FormField key={env} control={form.control} name="monitoringRequiredFor" render={({ field }) => (
                          <FormItem className="flex flex-row items-center space-x-3 space-y-0 rounded-md border border-slate-200 p-3 shadow-sm">
                            <FormControl>
                              <Checkbox
                                checked={field.value?.includes(env)}
                                onCheckedChange={(checked) => {
                                  return checked
                                    ? field.onChange([...(field.value ?? []), env])
                                    : field.onChange((field.value ?? []).filter((v) => v !== env));
                                }}
                              />
                            </FormControl>
                            <FormLabel className="font-normal cursor-pointer">{env}</FormLabel>
                          </FormItem>
                        )} />
                      ))}
                    </div>
                    <FormMessage />
                  </FormItem>
                )} />

                {/* DR Plan — RTO/RPO only shown when DR is enabled */}
                {form.watch("drEnabled") && (
                  <>
                    <div className="mb-2 mt-6"><h3 className="text-lg font-medium text-slate-800 border-b pb-2">Disaster Recovery Targets</h3></div>
                    <p className="text-sm text-slate-500 mb-4">These targets apply to the DR plan enabled in Step 1.</p>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6 border border-blue-100 bg-blue-50/40 rounded-lg p-4">
                      <FormField control={form.control} name="rto" render={({ field }) => (
                        <FormItem>
                          <FormLabel>RTO — Recovery Time Objective</FormLabel>
                          <FormControl><Input placeholder="e.g. 4 hours" {...field} /></FormControl>
                          <FormDescription>Maximum acceptable downtime after a disaster</FormDescription>
                          <FormMessage />
                        </FormItem>
                      )} />
                      <FormField control={form.control} name="rpo" render={({ field }) => (
                        <FormItem>
                          <FormLabel>RPO — Recovery Point Objective</FormLabel>
                          <FormControl><Input placeholder="e.g. 1 hour" {...field} /></FormControl>
                          <FormDescription>Maximum acceptable data loss window</FormDescription>
                          <FormMessage />
                        </FormItem>
                      )} />
                    </div>
                  </>
                )}
              </div>

              {/* STEP 5: Review & Generate */}
              <div className={currentStep === 5 ? "space-y-8 block" : "hidden"}>
                <div className="bg-slate-50 border border-slate-200 rounded-lg p-6">
                  <h3 className="text-lg font-semibold text-slate-800 mb-4">Summary</h3>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-y-6 gap-x-4 text-sm">
                    <div><span className="block text-slate-500 mb-1">Application Name</span><span className="font-medium">{form.watch("applicationName")}</span></div>
                    <div><span className="block text-slate-500 mb-1">Type</span><span className="font-medium">{form.watch("applicationType")}</span></div>
                    <div><span className="block text-slate-500 mb-1">Organization</span><span className="font-medium">{form.watch("organization")}</span></div>
                    <div><span className="block text-slate-500 mb-1">Tier</span><span className="font-medium">{form.watch("workloadTier")}</span></div>
                    
                    <div className="col-span-2"><span className="block text-slate-500 mb-1">Environments</span><span className="font-medium">{form.watch("environmentsRequired")?.join(", ")}</span></div>
                    <div className="col-span-2"><span className="block text-slate-500 mb-1">Regions</span><span className="font-medium">{form.watch("azureRegions")?.join(", ")}</span></div>
                    <div className="col-span-4">
                      <span className="block text-slate-500 mb-1">Network CIDRs</span>
                      <div className="flex flex-wrap gap-2">
                        {Object.entries(form.watch("environmentCidrs") ?? {}).map(([env, cidr]) => (
                          <span key={env} className="font-mono text-xs bg-blue-50 border border-blue-100 rounded px-2 py-1">
                            {env}: {cidr}
                          </span>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>

                <div className="flex flex-col items-center justify-center p-8 text-center space-y-4">
                  <div className="bg-primary/10 p-4 rounded-full">
                    <FileText className="w-12 h-12 text-primary" />
                  </div>
                  <h3 className="text-2xl font-bold text-slate-900">Ready to Generate</h3>
                  <p className="text-slate-500 max-w-md">Your configuration has been validated. Generating the document will stream the results live so you can see the architecture take shape.</p>
                  
                  <Button type="submit" size="lg" className="mt-4 w-full md:w-auto px-12 h-14 text-lg">
                    Generate TDD Document
                  </Button>
                </div>
              </div>

              {/* Navigation Controls */}
              <div className="flex justify-between pt-8 border-t border-slate-100 mt-8">
                <Button 
                  type="button" 
                  variant="outline" 
                  onClick={prevStep} 
                  disabled={currentStep === 1}
                  className="w-32"
                >
                  <ChevronLeft className="w-4 h-4 mr-2" /> Back
                </Button>
                
                {currentStep < STEPS.length && (
                  <Button 
                    type="button" 
                    onClick={nextStep}
                    className="w-32"
                  >
                    Next <ChevronRight className="w-4 h-4 ml-2" />
                  </Button>
                )}
              </div>
            </form>
          </FormProvider>
        </CardContent>
      </Card>
    </div>
  );
}

// Sub-components for Step 3 panels

/**
 * Shows per-environment CIDR subnet analysis.
 * Calls the API for each environment that has a valid CIDR entered.
 */
function MultiEnvCidrAnalysisPanel({ environmentCidrs, appName, org, envs }: { environmentCidrs: Record<string, string>, appName: string, org: string, envs: string[] }) {
  const [debouncedCidrs, setDebouncedCidrs] = useState(environmentCidrs);
  const analyzeMutation = useAnalyzeCidr();
  const [analysisMap, setAnalysisMap] = useState<Record<string, CidrAnalysisResponse>>({});

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedCidrs({ ...environmentCidrs }), 500);
    return () => clearTimeout(timer);
  }, [environmentCidrs]);

  useEffect(() => {
    const validEntries = Object.entries(debouncedCidrs).filter(
      ([, cidr]) => cidr && /^([0-9]{1,3}\.){3}[0-9]{1,3}\/[0-9]{1,2}$/.test(cidr)
    );
    for (const [env, cidr] of validEntries) {
      analyzeMutation.mutate({
        data: {
          cidr,
          applicationName: appName || "App",
          environments: [env],
          organization: org || "Org",
          lineOfBusiness: "IT"
        }
      }, {
        onSuccess: (res: CidrAnalysisResponse) => setAnalysisMap((prev) => ({ ...prev, [env]: res })),
      });
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [appName, debouncedCidrs]);

  const hasAnyData = Object.keys(analysisMap).length > 0;

  return (
    <div className="border border-slate-200 rounded-lg overflow-hidden flex flex-col bg-slate-50">
      <div className="bg-slate-100 px-4 py-3 border-b border-slate-200 flex justify-between items-center">
        <h4 className="font-semibold text-sm text-slate-800">Subnet Analysis (per Environment)</h4>
        {analyzeMutation.isPending && <span className="text-xs text-slate-500 animate-pulse">Analyzing...</span>}
      </div>
      <div className="p-4 flex-1 max-h-72 overflow-y-auto">
        {hasAnyData ? (
          <div className="space-y-4">
            {envs.map((env) => {
              const cidr = debouncedCidrs[env];
              const data = analysisMap[env];
              if (!cidr) return null;
              return (
                <div key={env}>
                  <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">{env} — {cidr}</span>
                  {data ? (
                    <div className="mt-1 space-y-1">
                      <div className="text-xs text-slate-500">Hosts: {data.totalHosts}</div>
                      {data.subnets?.slice(0, 4).map((s: SubnetInfo) => (
                        <div key={s.cidr} className="flex justify-between items-center bg-white p-2 rounded border border-slate-200 text-xs">
                          <span className="font-mono text-primary">{s.cidr}</span>
                          <span className="text-slate-600 truncate ml-2 max-w-[120px]">{s.name}</span>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="text-xs text-slate-400 mt-1">Analyzing…</div>
                  )}
                </div>
              );
            })}
          </div>
        ) : (
          <div className="h-full flex items-center justify-center text-sm text-slate-400 p-8 text-center">
            Enter a valid CIDR for each environment to see subnet recommendations.
          </div>
        )}
      </div>
    </div>
  );
}

function NamingPreviewPanel({ appName, org, lob, envs, region }: { appName: string, org: string, lob: string, envs: string[], region: string }) {
  const [previewData, setPreviewData] = useState<NamingPreviewResponse | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [fetchError, setFetchError] = useState<string | null>(null);

  // Stable primitive keys to avoid infinite loops from array reference changes
  const envsKey = envs.join(",");

  useEffect(() => {
    if (!appName || !org || !lob) return;

    const controller = new AbortController();

    const timer = setTimeout(async () => {
      setIsLoading(true);
      setFetchError(null);
      try {
        const res = await fetch(`${getApiBase()}/api/tdd/naming-preview`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            applicationName: appName,
            organization: org,
            lineOfBusiness: lob,
            environments: envsKey ? envsKey.split(",") : ["Dev"],
            region: region || "canadacentral",
          }),
          signal: controller.signal,
        });
        if (!res.ok) throw new Error(`Server error ${res.status}`);
        const data: NamingPreviewResponse = await res.json();
        setPreviewData(data);
      } catch (err) {
        if (err instanceof Error && err.name === "AbortError") return;
        setFetchError(err instanceof Error ? err.message : "Failed to load preview");
      } finally {
        setIsLoading(false);
      }
    }, 600);

    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [appName, org, lob, envsKey, region]);

  return (
    <div className="border border-slate-200 rounded-lg overflow-hidden flex flex-col h-full bg-slate-50">
      <div className="bg-slate-100 px-4 py-3 border-b border-slate-200 flex justify-between items-center">
        <h4 className="font-semibold text-sm text-slate-800">Resource Naming Convention</h4>
        {isLoading && <span className="text-xs text-slate-500 animate-pulse">Updating...</span>}
      </div>
      <div className="p-4 flex-1 max-h-64 overflow-y-auto">
        {fetchError ? (
          <div className="h-full flex items-center justify-center text-sm text-red-400 p-4 text-center">
            Could not load naming preview: {fetchError}
          </div>
        ) : previewData?.environments ? (
          <div className="space-y-4">
            {Object.entries(previewData.environments).map(([env, data]) => {
              const nc = data as NamingConvention;
              return (
              <div key={env} className="space-y-2">
                <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">{env} Environment</span>
                <div className="bg-white p-3 rounded border border-slate-200 text-xs space-y-2 font-mono">
                  <div className="flex justify-between gap-2"><span className="text-slate-400 shrink-0">Subscription:</span> <span className="text-slate-800 text-right break-all">{nc.subscriptionName}</span></div>
                  <div className="flex justify-between gap-2"><span className="text-slate-400 shrink-0">Found. RG:</span> <span className="text-slate-800 text-right break-all">{nc.resourceGroupFoundation}</span></div>
                  <div className="flex justify-between gap-2"><span className="text-slate-400 shrink-0">VNet:</span> <span className="text-slate-800 text-right break-all">{nc.vnetName}</span></div>
                  <div className="flex justify-between gap-2"><span className="text-slate-400 shrink-0">Subnet template:</span> <span className="text-slate-800 text-right break-all">{nc.subnetName}</span></div>
                  <div className="flex justify-between gap-2"><span className="text-slate-400 shrink-0">Service template:</span> <span className="text-slate-800 text-right break-all">{nc.serviceNameExample}</span></div>
                </div>
              </div>
              );
            })}
          </div>
        ) : (
          <div className="h-full flex items-center justify-center text-sm text-slate-400 p-8 text-center">
            {appName && org && lob
              ? "Loading naming preview..."
              : "Enter Application Name, Organization, and Line of Business in Step 1 to preview resource names."}
          </div>
        )}
      </div>
    </div>
  );
}
