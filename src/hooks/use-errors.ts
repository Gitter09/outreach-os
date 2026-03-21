import { toast } from "sonner";

export interface AppError {
    code: "DATABASE" | "NETWORK" | "IO" | "SERIALIZATION" | "VALIDATION" | "INTERNAL";
    message: string;
}

// Error codes shown for unexpected backend failures.
// These correspond to pages on the documentation website.
const ERROR_CODE_MAP: Partial<Record<AppError["code"], string>> = {
    DATABASE: "ERR-DB",
    INTERNAL: "ERR-INT",
    SERIALIZATION: "ERR-SER",
};

export const useErrors = () => {
    const handleError = (error: unknown, fallbackMessage?: string) => {
        console.error("App Error:", error);

        // Structured AppError from Rust
        if (typeof error === "object" && error !== null && "code" in error && "message" in error) {
            const appErr = error as AppError;
            const errorCode = ERROR_CODE_MAP[appErr.code];
            const title = fallbackMessage ?? appErr.message;

            if (errorCode) {
                // Unexpected backend error — show error code so the user can report it
                toast.error(title, {
                    description: `Error code: ${errorCode} · If this keeps happening, report it at github.com/harshitsinghcode/outreachos`,
                    duration: 6000,
                });
            } else {
                // Validation / Network / IO — message is already user-readable
                toast.error(title, { duration: 4000 });
            }
            return;
        }

        // Plain string error
        if (typeof error === "string") {
            toast.error(error, { duration: 4000 });
            return;
        }

        // Default fallback
        toast.error(fallbackMessage ?? "Something unexpected happened.", { duration: 4000 });
    };

    return { handleError };
};
