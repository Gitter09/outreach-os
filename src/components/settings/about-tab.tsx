import { useState, useEffect } from "react";
import { getVersion } from "@tauri-apps/api/app";
import { invoke } from "@tauri-apps/api/core";
import { Separator } from "@/components/ui/separator";
import { Github, Linkedin, ExternalLink } from "lucide-react";
import { LATEST_RELEASE } from "@/changelog";

export function AboutTab() {
    const [version, setVersion] = useState<string>("...");

    useEffect(() => {
        getVersion().then(setVersion).catch(() => setVersion("0.1.3"));
    }, []);

    return (
        <div className="space-y-8 max-w-xl">
            {/* Header */}
            <div>
                <h3 className="text-lg font-medium">About</h3>
                <p className="text-sm text-muted-foreground">Who built this and why.</p>
            </div>

            <Separator />

            {/* App identity */}
            <div className="space-y-3">
                <div className="flex items-baseline gap-3">
                    <span className="text-2xl font-bold tracking-tight">OutreachOS</span>
                    <span className="text-sm text-muted-foreground font-mono">v{version}</span>
                </div>
                <p className="text-sm text-foreground/80 leading-relaxed">
                    I built this for myself while doing cold email outreach as a student — tracking contacts in a spreadsheet was getting out of hand, and everything with a CRM label was either enterprise software or a SaaS I didn't want to pay for.
                </p>
                <p className="text-sm text-foreground/80 leading-relaxed">
                    It's free, offline-first, and your data never leaves your machine. I'm sharing it in case it's useful to anyone else doing the same thing.
                </p>
                <p className="text-sm text-muted-foreground">
                    — Harshit Singh
                </p>
            </div>

            {/* Links */}
            <div className="flex items-center gap-4">
                <button
                    onClick={() => invoke("open_external_url", { url: "https://github.com/Gitter09/outreach-os" })}
                    className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
                >
                    <Github className="h-4 w-4" />
                    GitHub
                    <ExternalLink className="h-3 w-3 opacity-50" />
                </button>
                <button
                    onClick={() => invoke("open_external_url", { url: "https://linkedin.com/in/harshit-singh-bits" })}
                    className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
                >
                    <Linkedin className="h-4 w-4" />
                    LinkedIn
                    <ExternalLink className="h-3 w-3 opacity-50" />
                </button>
            </div>

            <Separator />

            {/* What's New */}
            <div className="space-y-4">
                <div>
                    <h4 className="text-sm font-semibold">What's new in v{LATEST_RELEASE.version}</h4>
                    <p className="text-xs text-muted-foreground mt-0.5">The things that got built before the announcement.</p>
                </div>
                <ul className="space-y-3">
                    {LATEST_RELEASE.entries.map((item) => (
                        <li key={item.label} className="flex gap-3 text-sm">
                            <span className="font-medium shrink-0 w-48">{item.label}</span>
                            <span className="text-muted-foreground leading-relaxed">{item.detail}</span>
                        </li>
                    ))}
                </ul>
                <p className="text-xs text-muted-foreground pt-1">
                    Tasks, email inbox, pipeline config, onboarding, and a few other things are still in progress.
                </p>
            </div>

            <Separator />

            {/* Built with */}
            <p className="text-xs text-muted-foreground">
                Built with Tauri · Rust · React
            </p>
        </div>
    );
}
