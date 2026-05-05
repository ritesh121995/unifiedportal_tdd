import { useEffect, useState } from "react";
import { Loader2, Plus, Pencil, Trash2, Check, X, UserPlus, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { getApiBase } from "@/lib/api-base";

interface User {
  id: number;
  name: string;
  email: string;
  role: string;
  createdAt: string;
}

const ROLES = [
  { value: "requestor", label: "Requestor" },
  { value: "enterprise_architect", label: "Enterprise Architect" },
  { value: "cloud_architect", label: "Cloud Architect" },
  { value: "admin", label: "Administrator" },
];

const ROLE_BADGE: Record<string, string> = {
  requestor: "bg-violet-100 text-violet-700",
  enterprise_architect: "bg-amber-100 text-amber-700",
  cloud_architect: "bg-blue-100 text-blue-700",
  admin: "bg-red-100 text-red-700",
};

const ROLE_LABEL: Record<string, string> = {
  requestor: "Requestor",
  enterprise_architect: "Enterprise Architect",
  cloud_architect: "Cloud Architect",
  admin: "Administrator",
};

const EMPTY_NEW = { name: "", email: "", password: "", role: "requestor" };

export default function AdminUsers() {
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [editId, setEditId] = useState<number | null>(null);
  const [editRole, setEditRole] = useState("");
  const [editName, setEditName] = useState("");
  const [saving, setSaving] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [newForm, setNewForm] = useState({ ...EMPTY_NEW });
  const [creating, setCreating] = useState(false);
  const [deleteId, setDeleteId] = useState<number | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [formError, setFormError] = useState("");

  const load = async () => {
    setLoading(true);
    try {
      const res = await fetch(`${getApiBase()}/api/users`, { credentials: "include" });
      const data = await res.json();
      setUsers(data.users ?? []);
    } catch {
      setError("Failed to load users");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const startEdit = (u: User) => {
    setEditId(u.id);
    setEditRole(u.role);
    setEditName(u.name);
    setFormError("");
  };

  const cancelEdit = () => { setEditId(null); setFormError(""); };

  const saveEdit = async (id: number) => {
    setSaving(true);
    setFormError("");
    try {
      const res = await fetch(`${getApiBase()}/api/users/${id}`, {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ role: editRole, name: editName }),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error ?? "Failed to save");
      setUsers((prev) => prev.map((u) => (u.id === id ? { ...u, role: d.user.role, name: d.user.name } : u)));
      setEditId(null);
    } catch (e: unknown) {
      setFormError(e instanceof Error ? e.message : "Save failed");
    } finally {
      setSaving(false);
    }
  };

  const createUser = async () => {
    setCreating(true);
    setFormError("");
    try {
      const res = await fetch(`${getApiBase()}/api/users`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(newForm),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error ?? "Failed to create user");
      setUsers((prev) => [d.user, ...prev]);
      setShowNew(false);
      setNewForm({ ...EMPTY_NEW });
    } catch (e: unknown) {
      setFormError(e instanceof Error ? e.message : "Create failed");
    } finally {
      setCreating(false);
    }
  };

  const deleteUser = async (id: number) => {
    setDeleting(true);
    try {
      const res = await fetch(`${getApiBase()}/api/users/${id}`, {
        method: "DELETE",
        credentials: "include",
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error ?? "Failed to delete");
      setUsers((prev) => prev.filter((u) => u.id !== id));
      setDeleteId(null);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Delete failed");
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900" style={{ fontFamily: "Outfit, sans-serif" }}>User Management</h1>
          <p className="text-slate-500 text-sm mt-1">Manage portal users, roles, and access permissions</p>
        </div>
        <Button
          onClick={() => { setShowNew(true); setFormError(""); }}
          className="gap-2"
          style={{ background: "#FFCD00", color: "#1a1a2e" }}
        >
          <UserPlus className="w-4 h-4" /> Add User
        </Button>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 text-sm px-4 py-3 rounded-lg">{error}</div>
      )}

      {showNew && (
        <Card className="border-2 border-yellow-300">
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Plus className="w-4 h-4" /> New User
            </CardTitle>
            <CardDescription>Create a new portal account</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {formError && (
              <div className="bg-red-50 border border-red-200 text-red-700 text-sm px-3 py-2 rounded">{formError}</div>
            )}
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label>Full Name</Label>
                <Input placeholder="Jane Smith" value={newForm.name} onChange={(e) => setNewForm((p) => ({ ...p, name: e.target.value }))} />
              </div>
              <div className="space-y-1.5">
                <Label>Email Address</Label>
                <Input type="email" placeholder="jane@mccain.com" value={newForm.email} onChange={(e) => setNewForm((p) => ({ ...p, email: e.target.value }))} />
              </div>
              <div className="space-y-1.5">
                <Label>Temporary Password</Label>
                <Input type="password" placeholder="Minimum 8 characters" value={newForm.password} onChange={(e) => setNewForm((p) => ({ ...p, password: e.target.value }))} />
              </div>
              <div className="space-y-1.5">
                <Label>Role</Label>
                <Select value={newForm.role} onValueChange={(v) => setNewForm((p) => ({ ...p, role: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {ROLES.map((r) => <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="flex gap-2 pt-1">
              <Button onClick={createUser} disabled={creating} style={{ background: "#FFCD00", color: "#1a1a2e" }}>
                {creating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                {creating ? "Creating…" : "Create User"}
              </Button>
              <Button variant="outline" onClick={() => { setShowNew(false); setFormError(""); }}>
                <X className="w-4 h-4 mr-1" /> Cancel
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Users className="w-4 h-4" /> Portal Users ({users.length})
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {loading ? (
            <div className="flex items-center justify-center py-12 text-slate-400">
              <Loader2 className="w-5 h-5 animate-spin mr-2" /> Loading users…
            </div>
          ) : users.length === 0 ? (
            <p className="text-center py-12 text-slate-400 text-sm">No users found</p>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-100 text-left">
                  <th className="px-4 py-3 font-medium text-slate-500 text-xs uppercase tracking-wide">Name / Email</th>
                  <th className="px-4 py-3 font-medium text-slate-500 text-xs uppercase tracking-wide">Role</th>
                  <th className="px-4 py-3 font-medium text-slate-500 text-xs uppercase tracking-wide">Joined</th>
                  <th className="px-4 py-3 font-medium text-slate-500 text-xs uppercase tracking-wide w-28">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {users.map((u) => (
                  <tr key={u.id} className="hover:bg-slate-50 transition-colors">
                    <td className="px-4 py-3">
                      {editId === u.id ? (
                        <Input
                          className="h-8 text-sm w-48"
                          value={editName}
                          onChange={(e) => setEditName(e.target.value)}
                        />
                      ) : (
                        <div>
                          <p className="font-medium text-slate-800">{u.name}</p>
                          <p className="text-slate-400 text-xs">{u.email}</p>
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      {editId === u.id ? (
                        <Select value={editRole} onValueChange={setEditRole}>
                          <SelectTrigger className="h-8 w-48 text-xs">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {ROLES.map((r) => <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>)}
                          </SelectContent>
                        </Select>
                      ) : (
                        <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${ROLE_BADGE[u.role] ?? "bg-slate-100 text-slate-600"}`}>
                          {ROLE_LABEL[u.role] ?? u.role}
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-slate-400 text-xs">
                      {new Date(u.createdAt).toLocaleDateString("en-CA")}
                    </td>
                    <td className="px-4 py-3">
                      {editId === u.id ? (
                        <div className="flex gap-1">
                          <Button size="sm" className="h-7 px-2" style={{ background: "#FFCD00", color: "#1a1a2e" }} onClick={() => saveEdit(u.id)} disabled={saving}>
                            {saving ? <Loader2 className="w-3 h-3 animate-spin" /> : <Check className="w-3 h-3" />}
                          </Button>
                          <Button size="sm" variant="outline" className="h-7 px-2" onClick={cancelEdit}>
                            <X className="w-3 h-3" />
                          </Button>
                        </div>
                      ) : deleteId === u.id ? (
                        <div className="flex gap-1">
                          <Button size="sm" variant="destructive" className="h-7 px-2 text-xs" onClick={() => deleteUser(u.id)} disabled={deleting}>
                            {deleting ? <Loader2 className="w-3 h-3 animate-spin" /> : "Delete"}
                          </Button>
                          <Button size="sm" variant="outline" className="h-7 px-2" onClick={() => setDeleteId(null)}>
                            <X className="w-3 h-3" />
                          </Button>
                        </div>
                      ) : (
                        <div className="flex gap-1">
                          <Button size="sm" variant="ghost" className="h-7 px-2 text-slate-500 hover:text-slate-800" onClick={() => startEdit(u)}>
                            <Pencil className="w-3.5 h-3.5" />
                          </Button>
                          <Button size="sm" variant="ghost" className="h-7 px-2 text-red-400 hover:text-red-600" onClick={() => setDeleteId(u.id)}>
                            <Trash2 className="w-3.5 h-3.5" />
                          </Button>
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          {formError && editId !== null && (
            <div className="px-4 py-2 text-sm text-red-600">{formError}</div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
