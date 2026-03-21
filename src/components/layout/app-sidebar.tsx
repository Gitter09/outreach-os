import { useState, useEffect } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { cn } from "@/lib/utils";
import {
    LayoutDashboard,
    Users,
    Mail,
    FileText,
    Settings,
    Shield,
    PanelLeftClose,
    PanelLeft,
    ArrowLeft,
    Palette,
    Database,
    LayoutTemplate,
    CheckSquare,
    Info,
    Keyboard,
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
    soon?: boolean;
}

const mainNavItems: NavItem[] = [
    { label: "Dashboard", icon: LayoutDashboard, path: "/" },
    { label: "People", icon: Users, path: "/people" },
    { label: "Emails", icon: Mail, path: "/emails", soon: true },
    { label: "Tasks", icon: CheckSquare, path: "/tasks", soon: true },
    { label: "Templates", icon: FileText, path: "/templates" },
];

const settingsSubItems: NavItem[] = [
    { label: "Appearance", icon: Palette, path: "/settings/appearance" },
    { label: "Keyboard", icon: Keyboard, path: "/settings/keyboard" },
    { label: "Email Integration", icon: Mail, path: "/settings/email" },
    { label: "Pipeline", icon: LayoutTemplate, path: "/settings/pipeline" },
    { label: "Security", icon: Shield, path: "/settings/security" },
    { label: "Data", icon: Database, path: "/settings/data" },
    { label: "About", icon: Info, path: "/settings/about" },
];

function OutreachMark({ className }: { className?: string }) {
    return (
        <svg viewBox="0 0 600 600" fill="none" className={className} aria-hidden="true">
            <path d="M300 120C344.057 120 384.415 135.83 415.702 162.11L353.568 236.159C339.829 219.991 320.9 210 300 210C258.026 210 224 250.294 224 300C224 349.706 258.026 390 300 390C341.974 390 376 349.706 376 300C376 283.896 372.427 268.78 366.17 255.702L449.59 199.857C468.794 228.488 480 262.935 480 300C480 399.411 399.411 480 300 480C200.589 480 120 399.411 120 300C120 200.589 200.589 120 300 120Z" fill="currentColor" />
            <path d="M456.124 46.0815C483.732 58.1553 507.867 76.9668 526.317 100.791C544.766 124.615 556.939 152.69 561.72 182.441L530.264 187.496C526.329 163.011 516.31 139.905 501.127 120.298C485.943 100.691 466.08 85.2088 443.358 75.2721L456.124 46.0815Z" fill="currentColor" />
            <path d="M430.086 102.473C449.258 110.858 466.019 123.921 478.831 140.466C491.643 157.011 500.097 176.507 503.417 197.167L476.36 201.515C473.768 185.384 467.168 170.162 457.164 157.244C447.161 144.327 434.075 134.127 419.106 127.581L430.086 102.473Z" fill="currentColor" />
        </svg>
    );
}

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
        if (path === "/people") return location.pathname === "/people" || location.pathname.startsWith("/people/");
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
                        <div className="flex items-center gap-2 min-w-0">
                            <OutreachMark className="h-5 w-5 shrink-0 text-foreground" />
                            <h1 className="text-sm font-bold tracking-tight truncate">
                                OutreachOS
                            </h1>
                        </div>
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
                                    onClick={() => navigate("/people")}
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
                                        : item.soon
                                        ? "text-muted-foreground/60 border-transparent hover:text-muted-foreground hover:bg-muted"
                                        : "text-muted-foreground border-transparent hover:text-foreground hover:bg-muted",
                                    collapsed && "justify-center px-0"
                                )}
                            >
                                <Icon className="h-4 w-4 shrink-0" />
                                {!collapsed && (
                                    <>
                                        <span className="flex-1">{item.label}</span>
                                        {item.soon && (
                                            <span className="text-[10px] text-muted-foreground/50 font-medium">Soon</span>
                                        )}
                                    </>
                                )}
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

                {/* Footer: Settings */}
                <div className="p-2 border-t mt-auto">
                    <Tooltip>
                        <TooltipTrigger asChild>
                            <button
                                onClick={() => navigate("/settings")}
                                className={cn(
                                    "w-full flex items-center gap-2.5 px-2.5 py-2 text-sm font-medium rounded-md transition-all border",
                                    isSettingsRoute
                                        ? "bg-primary/10 text-primary border-primary/20"
                                        : "text-muted-foreground border-transparent hover:text-foreground hover:bg-muted",
                                    collapsed && "justify-center px-0"
                                )}
                            >
                                <Settings className="h-4 w-4 shrink-0" />
                                {!collapsed && <span>Settings</span>}
                            </button>
                        </TooltipTrigger>
                        {collapsed && (
                            <TooltipContent side="right">Settings</TooltipContent>
                        )}
                    </Tooltip>
                </div>
            </aside>
        </TooltipProvider>
    );
}
