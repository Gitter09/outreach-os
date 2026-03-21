import { useState, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { LayoutDashboard, Users, Mail, CheckSquare } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { useOutletContext } from "react-router-dom";
import { useStatuses } from "@/hooks/use-statuses";
import { useErrors } from "@/hooks/use-errors";
import { Contact } from "@/types/crm";
import { getColorHex } from "@/lib/utils";

export function DashboardPage() {
    const { setCommandOpen } = useOutletContext<{ setCommandOpen: (open: boolean) => void }>();
    const { handleError } = useErrors();
    const { statuses } = useStatuses();
    const [contacts, setContacts] = useState<Contact[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        (async () => {
            try {
                const data = await invoke<Contact[]>("get_contacts");
                setContacts(data);
            } catch (err) {
                handleError(err, "Failed to load dashboard data");
            } finally {
                setLoading(false);
            }
        })();
    }, []);

    const totalContacts = contacts.length;
    const contactsByStatus = statuses.map((s) => ({
        ...s,
        count: contacts.filter((c) => (c.status_id ?? "stat-new") === s.id).length,
    }));

    return (
        <div className="flex flex-col h-full relative">
            <PageHeader title="Dashboard" onSearchClick={() => setCommandOpen(true)} />

            <div className="flex-1 overflow-auto p-6 space-y-6">
                <div>
                    <h2 className="text-2xl font-bold tracking-tight">Overview</h2>
                    <p className="text-muted-foreground mt-1">A snapshot of where things stand.</p>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                    <Card>
                        <CardHeader className="flex flex-row items-center justify-between pb-2">
                            <CardTitle className="text-sm font-medium">Total People</CardTitle>
                            <Users className="h-4 w-4 text-muted-foreground" />
                        </CardHeader>
                        <CardContent>
                            <div className="text-2xl font-bold">
                                {loading ? <span className="text-muted-foreground">—</span> : totalContacts}
                            </div>
                            <p className="text-xs text-muted-foreground">contacts tracked</p>
                        </CardContent>
                    </Card>
                    <Card>
                        <CardHeader className="flex flex-row items-center justify-between pb-2">
                            <CardTitle className="text-sm font-medium">Emails Sent</CardTitle>
                            <Mail className="h-4 w-4 text-muted-foreground" />
                        </CardHeader>
                        <CardContent>
                            <div className="text-2xl font-bold text-muted-foreground">—</div>
                            <p className="text-xs text-muted-foreground">coming soon</p>
                        </CardContent>
                    </Card>
                    <Card>
                        <CardHeader className="flex flex-row items-center justify-between pb-2">
                            <CardTitle className="text-sm font-medium">Open Tasks</CardTitle>
                            <CheckSquare className="h-4 w-4 text-muted-foreground" />
                        </CardHeader>
                        <CardContent>
                            <div className="text-2xl font-bold text-muted-foreground">—</div>
                            <p className="text-xs text-muted-foreground">coming soon</p>
                        </CardContent>
                    </Card>
                    <Card>
                        <CardHeader className="flex flex-row items-center justify-between pb-2">
                            <CardTitle className="text-sm font-medium">Reply Rate</CardTitle>
                            <LayoutDashboard className="h-4 w-4 text-muted-foreground" />
                        </CardHeader>
                        <CardContent>
                            <div className="text-2xl font-bold text-muted-foreground">—</div>
                            <p className="text-xs text-muted-foreground">coming soon</p>
                        </CardContent>
                    </Card>
                </div>

                {/* Pipeline Breakdown */}
                <Card>
                    <CardHeader className="pb-3">
                        <CardTitle className="text-sm font-medium">Pipeline Breakdown</CardTitle>
                    </CardHeader>
                    <CardContent>
                        {loading ? (
                            <div className="space-y-3">
                                {[1, 2, 3].map((i) => (
                                    <div key={i} className="h-8 rounded bg-muted animate-pulse" />
                                ))}
                            </div>
                        ) : statuses.length === 0 ? (
                            <p className="text-sm text-muted-foreground">No pipeline stages yet.</p>
                        ) : (
                            <div className="space-y-2">
                                {contactsByStatus.map((s) => {
                                    const hex = getColorHex(s.color);
                                    const pct = totalContacts > 0 ? (s.count / totalContacts) * 100 : 0;
                                    return (
                                        <div key={s.id} className="flex items-center gap-3">
                                            <div
                                                className="h-2.5 w-2.5 rounded-full shrink-0"
                                                style={{ backgroundColor: hex }}
                                            />
                                            <span className="text-sm flex-1 truncate">{s.label}</span>
                                            <div className="flex items-center gap-2 shrink-0">
                                                <div className="w-24 h-1.5 bg-muted rounded-full overflow-hidden">
                                                    <div
                                                        className="h-full rounded-full transition-all"
                                                        style={{ width: `${pct}%`, backgroundColor: hex }}
                                                    />
                                                </div>
                                                <span className="text-sm font-medium tabular-nums w-6 text-right">{s.count}</span>
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        )}
                    </CardContent>
                </Card>
            </div>
        </div>
    );
}
