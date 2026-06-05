import { Switch, Route, Router as WouterRouter, useLocation } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/not-found";
import { AppProvider } from "@/store/app-context";
import { AuthProvider, useAuth } from "@/store/auth-context";
import { PortalLayout } from "@/components/layout/PortalLayout";
import Wizard from "@/pages/Wizard";
import Preview from "@/pages/Preview";
import History from "@/pages/History";
import Login from "@/pages/Login";
import Dashboard from "@/pages/Dashboard";
import RequestList from "@/pages/RequestList";
import RequestDetail from "@/pages/RequestDetail";
import SubmitRequest from "@/pages/SubmitRequest";
import Phase1EAReview from "@/pages/Phase1EAReview";
import Phase4CABGeneration from "@/pages/Phase4CABGeneration";
import Phase5DevSecOps from "@/pages/Phase5DevSecOps";
import Phase5Observability from "@/pages/Phase5Observability";
import Phase6FinOps from "@/pages/Phase6FinOps";
import AdminUsers from "@/pages/AdminUsers";
import Integrations from "@/pages/Integrations";
import CabViewer from "@/pages/CabViewer";
import DelegationManager from "@/pages/DelegationManager";
import LeanIXInitiatives from "@/pages/LeanIXInitiatives";
import "@/lib/api-base";
import { useEffect } from "react";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false,
      retry: 1,
    },
  },
});

function ProtectedRoute({ component: Component }: { component: React.ComponentType }) {
  const { user, loading } = useAuth();
  const [, setLocation] = useLocation();

  useEffect(() => {
    if (!loading && !user) {
      setLocation("/login");
    }
  }, [user, loading, setLocation]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <div className="flex flex-col items-center gap-3 text-slate-500">
          <div className="w-8 h-8 border-2 border-yellow-400 border-t-transparent rounded-full animate-spin" />
          <span className="text-sm">Loading portal…</span>
        </div>
      </div>
    );
  }

  if (!user) return null;

  return (
    <PortalLayout>
      <Component />
    </PortalLayout>
  );
}

function LoginRoute() {
  const { user, loading } = useAuth();
  const [, setLocation] = useLocation();

  useEffect(() => {
    if (!loading && user) {
      setLocation("/dashboard");
    }
  }, [user, loading, setLocation]);

  if (loading) return null;
  if (user) return null;
  return <Login />;
}

function Router() {
  return (
    <Switch>
      {/* Public */}
      <Route path="/login" component={LoginRoute} />

      {/* Protected portal routes */}
      <Route path="/dashboard">
        <ProtectedRoute component={Dashboard} />
      </Route>
      <Route path="/requests/new">
        <ProtectedRoute component={SubmitRequest} />
      </Route>
      <Route path="/requests/:id">
        <ProtectedRoute component={RequestDetail} />
      </Route>
      <Route path="/requests">
        <ProtectedRoute component={RequestList} />
      </Route>
      <Route path="/ea-queue">
        <ProtectedRoute component={() => <RequestList fixedStatuses={["submitted", "ea_triage"]} pageTitle="Architecture Review Queue" />} />
      </Route>
      <Route path="/cab-queue">
        <ProtectedRoute component={() => <RequestList fixedStatuses={["ea_approved", "cab_in_progress"]} pageTitle="Blueprint Queue" />} />
      </Route>
      <Route path="/infra-queue">
        <ProtectedRoute component={() => <RequestList fixedStatuses={["cab_completed"]} pageTitle="Infrastructure Deployment Queue" />} />
      </Route>
      <Route path="/observability-queue">
        <ProtectedRoute component={() => <RequestList fixedStatuses={["devsecops_approved"]} pageTitle="Observability Setup Queue" />} />
      </Route>
      <Route path="/finops-queue">
        <ProtectedRoute component={() => <RequestList fixedStatuses={["observability_approved"]} pageTitle="FinOps Activation Queue" />} />
      </Route>

      {/* Admin routes */}
      <Route path="/admin/users">
        <ProtectedRoute component={AdminUsers} />
      </Route>
      <Route path="/admin/delegations">
        <ProtectedRoute component={DelegationManager} />
      </Route>
      <Route path="/integrations">
        <ProtectedRoute component={Integrations} />
      </Route>

      {/* Phase routes */}
      <Route path="/phase/1">
        <ProtectedRoute component={Phase1EAReview} />
      </Route>
      <Route path="/phase/3">
        <ProtectedRoute component={Phase4CABGeneration} />
      </Route>
      <Route path="/phase/4">
        <ProtectedRoute component={Phase5DevSecOps} />
      </Route>
      <Route path="/phase/observability">
        <ProtectedRoute component={Phase5Observability} />
      </Route>
      <Route path="/phase/5">
        <ProtectedRoute component={Phase6FinOps} />
      </Route>

      {/* CAB Wizard routes */}
      <Route path="/wizard/:requestId">
        <ProtectedRoute component={Wizard} />
      </Route>
      <Route path="/preview">
        <ProtectedRoute component={Preview} />
      </Route>
      <Route path="/cab-view/:requestId">
        <ProtectedRoute component={CabViewer} />
      </Route>
      <Route path="/history">
        <ProtectedRoute component={History} />
      </Route>
      <Route path="/leanix-initiatives">
        <ProtectedRoute component={LeanIXInitiatives} />
      </Route>

      {/* Root redirect */}
      <Route path="/">
        <RootRedirect />
      </Route>

      <Route component={NotFound} />
    </Switch>
  );
}

function RootRedirect() {
  const { user, loading } = useAuth();
  const [, setLocation] = useLocation();

  useEffect(() => {
    if (!loading) {
      setLocation(user ? "/dashboard" : "/login");
    }
  }, [user, loading, setLocation]);

  return null;
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <AuthProvider>
          <AppProvider>
            <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
              <Router />
            </WouterRouter>
            <Toaster />
          </AppProvider>
        </AuthProvider>
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;

