import { useState, useCallback, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import { Tag } from "@/types/crm";
import { useErrors } from "@/hooks/use-errors";

export function useTags() {
    const [tags, setTags] = useState<Tag[]>([]);
    const [loading, setLoading] = useState(true);
    const { handleError } = useErrors();

    const fetchTags = useCallback(async () => {
        setLoading(true);
        try {
            const data = await invoke<Tag[]>("get_tags");
            setTags(data);
        } catch (error) {
            handleError(error, "Failed to load tags");
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        fetchTags();
    }, [fetchTags]);

    const createTag = async (name: string, color: string): Promise<string> => {
        try {
            const id = await invoke<string>("create_tag", { name, color });
            await fetchTags();
            return id;
        } catch (error) {
            handleError(error, "Failed to create tag");
            throw error;
        }
    };

    const updateTag = async (id: string, name: string, color: string): Promise<void> => {
        try {
            await invoke("update_tag", { id, name, color });
            await fetchTags();
        } catch (error) {
            handleError(error, "Failed to update tag");
            throw error;
        }
    };

    const deleteTag = async (id: string): Promise<void> => {
        try {
            await invoke("delete_tag", { id });
            await fetchTags();
        } catch (error) {
            handleError(error, "Failed to delete tag");
            throw error;
        }
    };

    const assignTag = async (contactId: string, tagId: string): Promise<void> => {
        try {
            await invoke("assign_tag", { contactId, tagId });
        } catch (error) {
            handleError(error, "Failed to add tag");
            throw error;
        }
    };

    const unassignTag = async (contactId: string, tagId: string): Promise<void> => {
        try {
            await invoke("unassign_tag", { contactId, tagId });
        } catch (error) {
            handleError(error, "Failed to remove tag");
            throw error;
        }
    };

    return {
        tags,
        loading,
        fetchTags,
        createTag,
        updateTag,
        deleteTag,
        assignTag,
        unassignTag,
    };
}
