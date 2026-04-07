import { useState, useEffect, useCallback, useRef } from "react";
import { Shield, Upload, UserPlus, Compass, ArrowRight, Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";

// ── Types ────────────────────────────────────────────────────────────
type Screen = 1 | 2 | 3 | 4;
type OnboardingAction = "import" | "add_contact" | "explore";

interface OnboardingFlowProps {
    onComplete: (action: OnboardingAction) => void;
}

// ── Typewriter text data ─────────────────────────────────────────────
// Each segment is a line. The typewriter types through them sequentially.
// A "\n" between segments creates a visible line break with a brief typing pause.
const TYPEWRITER_LINES = [
    { text: "i'm harshit.", style: "bold" as const },
    { text: "i built this for people like us —", style: "normal" as const },
    { text: "the ones cold-emailing their way to a career.", style: "normal" as const },
    { text: "", style: "break" as const }, // blank line pause
    { text: "(spreadsheets weren't cutting it.)", style: "dim" as const },
];

// Flatten into a single string with \n markers for the typewriter engine
const FULL_TEXT = TYPEWRITER_LINES.map((l) => l.text).join("\n");

// ── Kanban demo data ─────────────────────────────────────────────────
const KANBAN_COLUMNS = [
    { label: "New", color: "#3b82f6" },
    { label: "Contacted", color: "#eab308" },
    { label: "Replied", color: "#a855f7" },
    { label: "Interested", color: "#22c55e" },
    { label: "", color: "#f59e0b", icon: true },
];

const DEMO_CARDS: {
    name: string;
    initials: string;
    role: string;
    column: number;
    animClass: string;
    delay: number;
    shimmer?: boolean;
    isStatic?: boolean;
}[] = [
    // Static cards — appear with column fade-in, board feels "lived-in"
    { name: "Alex Rivera", initials: "AR", role: "Product Designer", column: 0, animClass: "ob-column-fade", delay: 0, isStatic: true },
    { name: "Maya Lin", initials: "ML", role: "Data Analyst", column: 0, animClass: "ob-column-fade", delay: 0, isStatic: true },
    { name: "David Kim", initials: "DK", role: "VP Eng", column: 1, animClass: "ob-column-fade", delay: 150, isStatic: true },
    { name: "Lena Müller", initials: "LM", role: "CTO", column: 3, animClass: "ob-column-fade", delay: 450, isStatic: true },
    { name: "Tom Nguyen", initials: "TN", role: "Founder", column: 4, animClass: "ob-column-fade", delay: 600, isStatic: true },
    // Animated cards — choreographed pipeline story
    {
        name: "Sarah Chen",
        initials: "SC",
        role: "Recruiter",
        column: 1, // Contacted — slides from New
        animClass: "ob-card-slide",
        delay: 1000,
    },
    {
        name: "James Park",
        initials: "JP",
        role: "Eng Manager",
        column: 2, // Replied
        animClass: "ob-card-appear",
        delay: 1400,
    },
    {
        name: "Priya Sharma",
        initials: "PS",
        role: "Hiring Lead",
        column: 3, // Interested
        animClass: "ob-card-appear",
        delay: 1900,
        shimmer: true,
    },
];

// ── Component ────────────────────────────────────────────────────────
export function OnboardingFlow({ onComplete }: OnboardingFlowProps) {
    const [screen, setScreen] = useState<Screen>(1);
    const [exiting, setExiting] = useState(false);

    // Screen 1 — SVG + Typewriter state
    const [svgDone, setSvgDone] = useState(false);
    const [typedIndex, setTypedIndex] = useState(0);
    const [typewriterDone, setTypewriterDone] = useState(false);
    const svgPathRef = useRef<SVGPathElement>(null);
    const [pathLength, setPathLength] = useState(0);

    // Reduced motion detection
    const prefersReducedMotion = useRef(
        typeof window !== "undefined" &&
            window.matchMedia("(prefers-reduced-motion: reduce)").matches
    );

    // ── SVG path length measurement ──────────────────────────────────
    useEffect(() => {
        if (svgPathRef.current) {
            const len = svgPathRef.current.getTotalLength();
            setPathLength(len);
        }
    }, []);

    // ── SVG draw completion → start typewriter ───────────────────────
    useEffect(() => {
        if (screen !== 1) return;
        if (prefersReducedMotion.current) {
            setSvgDone(true);
            return;
        }
        const timer = setTimeout(() => setSvgDone(true), 2550); // 250ms delay + 2.0s draw + 0.3s fill
        return () => clearTimeout(timer);
    }, [screen]);

    // ── Typewriter engine ────────────────────────────────────────────
    useEffect(() => {
        if (screen !== 1 || !svgDone) return;
        if (prefersReducedMotion.current) {
            setTypedIndex(FULL_TEXT.length);
            setTypewriterDone(true);
            return;
        }
        if (typedIndex >= FULL_TEXT.length) {
            setTypewriterDone(true);
            return;
        }

        const currentChar = FULL_TEXT[typedIndex];
        const nextChar = FULL_TEXT[typedIndex + 1];
        // Slower for the dim parenthetical line, pause at line breaks
        const isInParenthetical = typedIndex > FULL_TEXT.lastIndexOf("(");
        let delay = isInParenthetical ? 45 : 35;
        if (currentChar === "\n" && nextChar === "\n") delay = 400; // blank line pause
        else if (currentChar === "\n") delay = 150; // line break pause

        const timer = setTimeout(() => setTypedIndex((i) => i + 1), delay);
        return () => clearTimeout(timer);
    }, [screen, svgDone, typedIndex]);

    // ── Navigation ───────────────────────────────────────────────────
    const goNext = useCallback(() => {
        if (screen < 4) setScreen((s) => (s + 1) as Screen);
    }, [screen]);

    const goBack = useCallback(() => {
        if (screen > 1) setScreen((s) => (s - 1) as Screen);
    }, [screen]);

    const handleFinish = useCallback(
        (action: OnboardingAction) => {
            if (prefersReducedMotion.current) {
                onComplete(action);
                return;
            }
            setExiting(true);
            setTimeout(() => onComplete(action), 600);
        },
        [onComplete]
    );

    const skip = useCallback(() => handleFinish("explore"), [handleFinish]);

    // ── Keyboard ─────────────────────────────────────────────────────
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            // Don't capture when typing in inputs
            if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;

            if (e.key === "ArrowRight" || e.key === "Enter") {
                if (screen < 4) {
                    e.preventDefault();
                    goNext();
                }
            } else if (e.key === "ArrowLeft" || e.key === "Backspace") {
                e.preventDefault();
                goBack();
            } else if (e.key === "Escape") {
                e.preventDefault();
                skip();
            }
        };
        window.addEventListener("keydown", handleKeyDown);
        return () => window.removeEventListener("keydown", handleKeyDown);
    }, [screen, goNext, goBack, skip]);

    // ── Render helpers ───────────────────────────────────────────────
    const renderTypedText = () => {
        const visible = FULL_TEXT.slice(0, typedIndex);
        const lines = visible.split("\n");

        return (
            <div className="space-y-1">
                {lines.map((line, i) => {
                    const meta = TYPEWRITER_LINES[i];
                    if (!meta) return null;
                    if (meta.style === "break") return <div key={i} className="h-3" />;

                    return (
                        <p
                            key={i}
                            className={cn(
                                meta.style === "bold" && "text-2xl sm:text-3xl font-bold text-[#fafafa]",
                                meta.style === "normal" && "text-lg sm:text-xl text-[#a3a3a3]",
                                meta.style === "dim" && "text-sm italic text-[#737373]"
                            )}
                        >
                            {line}
                            {/* Show cursor at the end of the last visible line */}
                            {i === lines.length - 1 && !typewriterDone && (
                                <span className="ob-cursor text-[#fafafa] ml-0.5 font-light">|</span>
                            )}
                        </p>
                    );
                })}
            </div>
        );
    };

    // ── Screens ──────────────────────────────────────────────────────
    const renderScreen1 = () => (
        <div className="flex flex-col items-center justify-center h-full px-6">
            <div className="max-w-lg w-full space-y-1">
                {/* SVG "hey" — handwritten path draw */}
                <div className="mb-2">
                    <svg
                        viewBox="0 0 865 782"
                        className="h-[100px] sm:h-[120px] w-auto"
                        fill="none"
                        xmlns="http://www.w3.org/2000/svg"
                    >
                        <path
                            ref={svgPathRef}
                            d="M12.3105 403.708C82.9673 348.518 109.311 317.708 146.811 263.708C178.061 218.708 199.573 172.854 191.311 105.207C175.311 -25.7925 65.3105 0.707504 65.3105 140.707V386.708M65.3105 511.208V386.708M65.3105 386.708C94.8105 317.208 133.294 290.012 158.811 288.208C208.311 284.708 234.311 322.708 234.311 350.208L232.811 409.208C229.811 473.708 229.778 506.265 333.311 481.708C402.492 465.298 459.069 401.572 471.311 373.208C506.42 291.86 424.729 239.286 377.311 294.708C367.817 305.804 347.641 345.635 356.811 398.208C364.311 441.208 377.311 465.708 407.811 479.208C460.811 502.667 527.8 491.742 561.311 457.708C593.311 425.208 615.811 389.708 615.811 344.208V270.208C613.272 344.145 615.811 405.708 624.311 437.208C673.811 563.207 772.311 502.208 795.811 391.208V285.208V653.208C792.811 802.708 647.311 789.208 667.311 660.708C693.946 584.344 799.803 503.081 856.311 479.208"
                            stroke="#fafafa"
                            strokeWidth="40"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            fillOpacity="0"
                            style={
                                pathLength > 0
                                    ? {
                                          strokeDasharray: pathLength,
                                          strokeDashoffset: pathLength,
                                          animation: prefersReducedMotion.current
                                              ? "none"
                                              : `ob-svg-draw 2.0s ease-in-out 250ms forwards`,
                                      }
                                    : undefined
                            }
                        />
                    </svg>
                </div>

                {/* Typewriter text — starts after SVG draw completes */}
                <div
                    className={cn(
                        "transition-opacity duration-300",
                        svgDone ? "opacity-100" : "opacity-0"
                    )}
                >
                    {renderTypedText()}
                </div>
            </div>
        </div>
    );

    const renderScreen2 = () => (
        <div className="flex flex-col items-center justify-center h-full px-6">
            <div className="max-w-lg w-full flex flex-col items-center text-center space-y-8">
                {/* Shield icon */}
                <div className="ob-shield-pop">
                    <div className="w-16 h-16 rounded-2xl bg-[#1a1a1a] border border-[#333] flex items-center justify-center">
                        <Shield className="h-8 w-8 text-[#fafafa]" />
                    </div>
                </div>

                {/* Main heading */}
                <h2
                    className="ob-stagger text-2xl sm:text-3xl font-bold text-[#fafafa]"
                    style={{ animationDelay: "300ms" }}
                >
                    everything stays here.
                </h2>

                {/* Privacy lines */}
                <div className="space-y-3 w-full max-w-sm">
                    {[
                        { left: "your contacts", right: "on this machine" },
                        { left: "your emails", right: "on this machine" },
                        { left: "your data", right: "never leaves" },
                    ].map((line, i) => (
                        <div
                            key={i}
                            className="ob-slide-left flex items-center justify-center gap-3 text-base"
                            style={{ animationDelay: `${500 + i * 150}ms` }}
                        >
                            <span className="text-[#fafafa] font-medium">{line.left}</span>
                            <ArrowRight className="h-4 w-4 text-[#555] flex-shrink-0" />
                            <span className="text-[#a3a3a3]">{line.right}</span>
                        </div>
                    ))}
                </div>

                {/* Nerd badge */}
                <p
                    className="ob-stagger text-[10px] text-[#555] uppercase tracking-[0.15em] font-mono"
                    style={{ animationDelay: "1100ms" }}
                >
                    AES-256-GCM &middot; SQLCipher &middot; OS Keychain
                </p>
            </div>
        </div>
    );

    const renderScreen3 = () => (
        <div className="flex flex-col items-center justify-center h-full px-6">
            <div className="w-full max-w-2xl">
                {/* Mini Kanban board */}
                <div className="flex gap-3 justify-center mb-8">
                    {KANBAN_COLUMNS.map((col, colIdx) => (
                        <div
                            key={colIdx}
                            className="ob-column-fade w-[120px] sm:w-[130px] flex-shrink-0"
                            style={{ animationDelay: `${colIdx * 150}ms` }}
                        >
                            {/* Column header */}
                            <div className="flex items-center gap-1.5 mb-3 px-1">
                                {col.icon ? (
                                    <Sparkles className="h-3 w-3 text-[#f59e0b]" />
                                ) : (
                                    <div
                                        className="w-2 h-2 rounded-full flex-shrink-0"
                                        style={{ backgroundColor: col.color }}
                                    />
                                )}
                                <span className="text-[11px] font-medium text-[#a3a3a3] truncate">
                                    {col.icon ? "Won" : col.label}
                                </span>
                            </div>

                            {/* Column body */}
                            <div className="min-h-[100px] rounded-lg bg-[#111] border border-[#222] p-1.5 space-y-1.5">
                                {DEMO_CARDS.filter((c) => c.column === colIdx).map((card) => (
                                    <div
                                        key={card.name}
                                        className={cn(
                                            card.animClass,
                                            "rounded-md bg-[#1a1a1a] border border-[#2a2a2a] p-2 border-l-[3px]",
                                            card.shimmer && "ob-shimmer"
                                        )}
                                        style={{
                                            borderLeftColor: KANBAN_COLUMNS[card.column].color,
                                            animationDelay: `${card.delay}ms`,
                                            ...(card.animClass === "ob-card-slide"
                                                ? { ["--slide-from" as string]: "-140px" }
                                                : {}),
                                        }}
                                    >
                                        <div className="flex items-center gap-2">
                                            <div className="w-5 h-5 rounded-full bg-[#262626] flex items-center justify-center flex-shrink-0">
                                                <span className="text-[8px] font-bold text-[#a3a3a3]">
                                                    {card.initials}
                                                </span>
                                            </div>
                                            <div className="overflow-hidden">
                                                <p className="text-[10px] font-medium text-[#e5e5e5] truncate leading-tight">
                                                    {card.name}
                                                </p>
                                                <p className="text-[8px] text-[#777] truncate leading-tight">
                                                    {card.role}
                                                </p>
                                            </div>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    ))}
                </div>

                {/* Description text */}
                <div className="text-center space-y-1">
                    <p
                        className="ob-stagger text-base font-medium text-[#fafafa]"
                        style={{ animationDelay: "2400ms" }}
                    >
                        this is what it looks like when it&apos;s working.
                    </p>
                    <p
                        className="ob-stagger text-sm text-[#a3a3a3]"
                        style={{ animationDelay: "2550ms" }}
                    >
                        add contacts. track conversations. send emails.
                    </p>
                    <p
                        className="ob-stagger text-sm text-[#a3a3a3]"
                        style={{ animationDelay: "2700ms" }}
                    >
                        drag a card when something changes.
                    </p>
                </div>
            </div>
        </div>
    );

    const renderScreen4 = () => (
        <div className="flex flex-col items-center justify-center h-full px-6">
            <div className="max-w-2xl w-full text-center">
                <h2
                    className="ob-stagger text-2xl sm:text-3xl font-bold text-[#fafafa] mb-10"
                    style={{ animationDelay: "0ms" }}
                >
                    ready? pick your first move.
                </h2>

                <div className="flex flex-col sm:flex-row gap-4 justify-center">
                    {[
                        {
                            action: "import" as OnboardingAction,
                            icon: Upload,
                            title: "Import a LinkedIn CSV",
                            subtitle: "A career fair's worth of contacts in two clicks.",
                            delay: 150,
                        },
                        {
                            action: "add_contact" as OnboardingAction,
                            icon: UserPlus,
                            title: "Add your first contact",
                            subtitle: "Start with the person you've been meaning to email.",
                            delay: 300,
                        },
                        {
                            action: "explore" as OnboardingAction,
                            icon: Compass,
                            title: "Just explore",
                            subtitle: "No pressure. Look around first.",
                            delay: 450,
                        },
                    ].map((card) => (
                        <button
                            key={card.action}
                            onClick={() => handleFinish(card.action)}
                            className={cn(
                                "ob-stagger ob-action-card",
                                "w-full sm:w-[200px] p-6 rounded-xl text-left",
                                "bg-[#141414] border border-[#2a2a2a]",
                                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#555] focus-visible:ring-offset-2 focus-visible:ring-offset-[#0a0a0a]"
                            )}
                            style={{ animationDelay: `${card.delay}ms` }}
                            aria-label={`${card.title}: ${card.subtitle}`}
                        >
                            <card.icon className="h-7 w-7 text-[#fafafa] mb-4" />
                            <h3 className="text-sm font-semibold text-[#fafafa] mb-1.5">
                                {card.title}
                            </h3>
                            <p className="text-xs text-[#888] leading-relaxed">{card.subtitle}</p>
                        </button>
                    ))}
                </div>
            </div>
        </div>
    );

    // ── Main render ──────────────────────────────────────────────────
    const isMac =
        typeof navigator !== "undefined" && navigator.platform.toUpperCase().includes("MAC");

    return (
        <div
            className={cn(
                "fixed inset-0 z-[60] flex flex-col select-none",
                exiting && "ob-dissolve-out"
            )}
            style={{
                background:
                    screen === 4 ? "rgba(10, 10, 10, 0.88)" : "#0a0a0a",
                backdropFilter: screen === 4 ? "blur(8px)" : undefined,
                color: "#fafafa",
            }}
            role="dialog"
            aria-modal="true"
            aria-label="Welcome to JobDex"
        >
            {/* Skip button — screens 1-3 */}
            {screen < 4 && (
                <button
                    onClick={skip}
                    className="absolute top-6 right-6 text-sm text-[#555] hover:text-[#999] transition-colors z-10"
                >
                    skip
                </button>
            )}

            {/* Screen content */}
            <div className="flex-1 relative" aria-live="polite">
                {screen === 1 && renderScreen1()}
                {screen === 2 && renderScreen2()}
                {screen === 3 && renderScreen3()}
                {screen === 4 && renderScreen4()}
            </div>

            {/* Bottom bar — dots + keyboard hint */}
            <div className="pb-8 flex flex-col items-center gap-4">
                {/* Progress dots */}
                <div className="flex items-center gap-2">
                    {([1, 2, 3, 4] as Screen[]).map((s) => (
                        <div
                            key={s}
                            className={cn(
                                "rounded-full transition-all duration-300",
                                s === screen
                                    ? "w-6 h-2 bg-[#fafafa]"
                                    : "w-2 h-2 bg-[#333]"
                            )}
                        />
                    ))}
                </div>

                {/* Keyboard hint — screens 1-3 */}
                {screen < 4 && (
                    <p className="text-[10px] text-[#444] uppercase tracking-widest">
                        press{" "}
                        <kbd className="font-mono text-[#666]">enter</kbd> or{" "}
                        <kbd className="font-mono text-[#666]">{isMac ? "→" : "→"}</kbd>
                    </p>
                )}
            </div>
        </div>
    );
}
