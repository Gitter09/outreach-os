import { useState, useEffect } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { cn } from "@/lib/utils";
import {
    LayoutDashboard,
    Users,
    Mail,
    StickyNote,
    CheckSquare,
    FileText,
    Settings,
    Shield,
    PanelLeftClose,
    PanelLeft,
    ArrowLeft,
    Palette,
    Database,
    LayoutTemplate,
} from "lucide-react";
import {
    Tooltip,
    TooltipContent,
    TooltipProvider,
    TooltipTrigger,
} from "@/components/ui/tooltip";

const SIDEBAR_COLLAPSED_KEY = "outreachos_sidebar_collapsed";

interface NavItem {
    label: string;
    icon: React.ElementType;
    path: string;
}

const mainNavItems: NavItem[] = [
    { label: "Dashboard", icon: LayoutDashboard, path: "/" },
    { label: "Contacts", icon: Users, path: "/contacts" },
    { label: "Emails", icon: Mail, path: "/emails" },
    { label: "Notes", icon: StickyNote, path: "/notes" },
    { label: "Tasks", icon: CheckSquare, path: "/tasks" },
    { label: "Templates", icon: FileText, path: "/templates" },
    { label: "Settings", icon: Settings, path: "/settings" },
];

const settingsSubItems: NavItem[] = [
    { label: "Email Integration", icon: Mail, path: "/settings/email" },
    { label: "Appearance", icon: Palette, path: "/settings/appearance" },
    { label: "Pipeline", icon: LayoutTemplate, path: "/settings/pipeline" },
    { label: "Data", icon: Database, path: "/settings/data" },
    { label: "Security", icon: Shield, path: "/settings/security" },
];

export function AppSidebar() {
    const navigate = useNavigate();
    const location = useLocation();
    const [collapsed, setCollapsed] = useState(() => {
        const saved = localStorage.getItem(SIDEBAR_COLLAPSED_KEY);
        return saved === "true";
    });

    const isSettingsRoute = location.pathname.startsWith("/settings");

    useEffect(() => {
        localStorage.setItem(SIDEBAR_COLLAPSED_KEY, String(collapsed));
    }, [collapsed]);

    const isActive = (path: string) => {
        if (path === "/") return location.pathname === "/";
        if (path === "/contacts") return location.pathname === "/contacts" || location.pathname.startsWith("/contact/");
        return location.pathname.startsWith(path);
    };

    const navItems = isSettingsRoute ? settingsSubItems : mainNavItems;

    return (
        <TooltipProvider delayDuration={0}>
            <aside
                className={cn(
                    "h-screen flex flex-col border-r bg-card/50 backdrop-blur-sm transition-all duration-200 shrink-0",
                    collapsed ? "w-[60px]" : "w-[220px]"
                )}
            >
                {/* Top: Branding + Collapse Toggle */}
                <div className="flex items-center justify-between h-[60px] px-4 border-b shrink-0">
                    {!collapsed && (
                        <h1 className="text-sm font-bold tracking-tight truncate">
                            OutreachOS
                        </h1>
                    )}
                    <button
                        onClick={() => setCollapsed(!collapsed)}
                        className={cn(
                            "p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted transition-colors",
                            collapsed && "mx-auto"
                        )}
                        title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
                    >
                        {collapsed ? (
                            <PanelLeft className="h-4 w-4" />
                        ) : (
                            <PanelLeftClose className="h-4 w-4" />
                        )}
                    </button>
                </div>

                {/* Settings Back Button */}
                {isSettingsRoute && (
                    <div className="p-2 border-b">
                        <Tooltip>
                            <TooltipTrigger asChild>
                                <button
                                    onClick={() => navigate("/contacts")}
                                    className={cn(
                                        "w-full flex items-center gap-2 px-2 py-1.5 text-sm font-medium rounded-md transition-colors",
                                        "text-muted-foreground hover:text-foreground hover:bg-muted",
                                        collapsed && "justify-center"
                                    )}
                                >
                                    <ArrowLeft className="h-4 w-4 shrink-0" />
                                    {!collapsed && <span>Back</span>}
                                </button>
                            </TooltipTrigger>
                            {collapsed && (
                                <TooltipContent side="right">Back</TooltipContent>
                            )}
                        </Tooltip>
                        {!collapsed && (
                            <p className="px-2 pt-2 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                                Settings
                            </p>
                        )}
                    </div>
                )}

                {/* Navigation Items */}
                <nav className="flex-1 p-2 space-y-1 overflow-y-auto">
                    {navItems.map((item) => {
                        const active = isActive(item.path);
                        const Icon = item.icon;

                        const button = (
                            <button
                                key={item.path}
                                onClick={() => navigate(item.path)}
                                className={cn(
                                    "w-full flex items-center gap-2.5 px-2.5 py-2 text-sm font-medium rounded-md transition-all border",
                                    active
                                        ? "bg-primary/10 text-primary border-primary/20"
                                        : "text-muted-foreground border-transparent hover:text-foreground hover:bg-muted",
                                    collapsed && "justify-center px-0"
                                )}
                            >
                                <Icon className="h-4 w-4 shrink-0" />
                                {!collapsed && <span>{item.label}</span>}
                            </button>
                        );

                        if (collapsed) {
                            return (
                                <Tooltip key={item.path}>
                                    <TooltipTrigger asChild>{button}</TooltipTrigger>
                                    <TooltipContent side="right">
                                        {item.label}
                                    </TooltipContent>
                                </Tooltip>
                            );
                        }

                        return <div key={item.path}>{button}</div>;
                    })}
                </nav>
            </aside>
        </TooltipProvider>
    );
}
