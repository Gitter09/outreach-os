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
import { useState, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import "./index.css";

function App() {
  const [isLocked, setIsLocked] = useState<boolean | null>(null);

  useEffect(() => {
    const checkLock = async () => {
      try {
        // The Rust function `has_lock_pin` now returns Result<bool, String>.
        // `invoke` will resolve with the `bool` on success, or reject with the `String` on error.
        const hasPin = await invoke<boolean>("has_lock_pin");
        setIsLocked(hasPin);
      } catch (err) {
        console.error("Security system error:", err);
        // If there's an error (e.g., keychain inaccessible), we treat it as if no PIN is set
        // and allow access, but log the error.
        // A more robust solution might display a toast or a specific error message to the user.
        setIsLocked(false);
      }
    };
    checkLock();
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
            <Route path="/contacts" element={<ContactsPage />} />
            <Route path="/contact/:id" element={<ContactDetailPage />} />
            <Route path="/emails" element={<EmailsPage />} />
            <Route path="/notes" element={<NotesPage />} />
            <Route path="/tasks" element={<TasksPage />} />
            <Route path="/templates" element={<TemplatesPage />} />
            <Route path="/settings" element={<SettingsPage />} />
            <Route path="/settings/:tab" element={<SettingsPage />} />
          </Route>
        </Routes>
        <Toaster />
      </Router>
    </ErrorBoundary>
  );
}

export default App;
