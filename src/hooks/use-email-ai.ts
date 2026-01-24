import { invoke } from "@tauri-apps/api/core";
import { useState } from "react";
import { toast } from "sonner";

export function useEmailAI() {
    const [drafting, setDrafting] = useState(false);
    const [generatingSubjects, setGeneratingSubjects] = useState(false);

    const draftEmail = async (contactId: string): Promise<string> => {
        setDrafting(true);
        try {
            return await invoke<string>("draft_email_ai", { contactId });
        } catch (err: any) {
            console.error("Failed to draft email:", err);
            toast.error(err.toString());
            return "";
        } finally {
            setDrafting(false);
        }
    };

    const generateSubjectLines = async (contactId: string): Promise<string[]> => {
        setGeneratingSubjects(true);
        try {
            return await invoke<string[]>("generate_subject_lines_ai", { contactId });
        } catch (err: any) {
            console.error("Failed to generate subject lines:", err);
            toast.error(err.toString());
            return [];
        } finally {
            setGeneratingSubjects(false);
        }
    };

    return {
        draftEmail,
        generateSubjectLines,
        drafting,
        generatingSubjects,
    };
}
