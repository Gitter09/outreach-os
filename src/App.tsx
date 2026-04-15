import { BrowserRouter as Router, Routes, Route } from "react-router-dom";
import { Toaster } from "sonner";
import { AppLayout } from "@/components/layout/app-layout";
import { LockScreen } from "@/components/layout/lock-screen";
import { DashboardPage } from "@/pages/DashboardPage";
import { ContactsPage } from "@/pages/ContactsPage";
import { ContactDetailPage } from "@/pages/ContactDetailPage";
import { EmailsPage } from "@/pages/EmailsPage";
import { NotesPage } from "@/pages/NotesPage";
import { TasksPage } from "@/pages/TasksPage";
import { TemplatesPage } from "@/pages/TemplatesPage";
import { SettingsPage } from "@/pages/SettingsPage";
import { ErrorBoundary } from "@/components/error-boundary/ErrorBoundary";
import { useErrors } from "@/hooks/use-errors";
import { useState, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import "./index.css";

window.onerror = (msg, url, line) => {
  const err = `[GLOBAL ERROR] ${msg} at ${url}:${line}`;
  console.error(err);
};

function App() {
  const [isLocked, setIsLocked] = useState<boolean | null>(null);
  const { handleError } = useErrors();

  useEffect(() => {
    // Listen for background scheduled email failures
    const unlistenScheduleFailure = listen<{ email_id: string; to_email: string; subject: string; error: string }>(
      "email_schedule_failed",
      (event) => {
        import("sonner").then(({ toast }) => {
          toast.error(`Scheduled Email Failed`, {
            description: `Failed to send to ${event.payload.to_email}: ${event.payload.error}. Retrying later...`,
            duration: 10000,
          });
        });
      }
    );

    const checkLock = async () => {
      try {
        const hasPin = await invoke<boolean>("has_lock_pin");
        setIsLocked(hasPin);
      } catch (err) {
        handleError(err, "Security check failed — please restart the app");
        setIsLocked(true);
      }
    };
    checkLock();

    return () => {
      unlistenScheduleFailure.then((f) => f());
    };
  }, []);

  if (isLocked === null) {
    return (
      <div className="h-screen w-screen bg-background flex items-center justify-center">
        <div className="animate-spin h-8 w-8 border-4 border-primary border-t-transparent rounded-full" />
      </div>
    );
  }

  if (isLocked) {
    return (
      <ErrorBoundary>
        <LockScreen onUnlock={() => setIsLocked(false)} />
      </ErrorBoundary>
    );
  }

  return (
    <ErrorBoundary>
      <Router>
        <Routes>
          <Route element={<AppLayout />}>
            <Route path="/" element={<DashboardPage />} />
            <Route path="/people" element={<ContactsPage />} />
            <Route path="/people/:id" element={<ContactDetailPage />} />
            <Route path="/emails" element={<EmailsPage />} />
            <Route path="/notes" element={<NotesPage />} />
            <Route path="/tasks" element={<TasksPage />} />
            <Route path="/templates" element={<TemplatesPage />} />
            <Route path="/settings" element={<SettingsPage />} />
            <Route path="/settings/:tab" element={<SettingsPage />} />
          </Route>
        </Routes>
        <Toaster closeButton duration={2000} />
      </Router>
    </ErrorBoundary>
  );
}

export default App;
