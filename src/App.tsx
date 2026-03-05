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
import { useState, useEffect, Suspense, use } from "react";
console.log("[JS] App.tsx script loaded and executing");

window.onerror = (msg, url, line) => {
  const err = `[GLOBAL ERROR] ${msg} at ${url}:${line}`;
  console.error(err);
  const root = document.getElementById("root");
  if (root) {
    root.innerHTML = `<div style="padding: 20px; color: white; background: red;">${err}</div>`;
  }
};
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { toast } from "sonner";
import { SignInButton, SignUpButton, ClerkProvider } from "@clerk/react";
import { initClerk } from "tauri-plugin-clerk";
import { Button } from "@/components/ui/button";
import "./index.css";

// Initialize once, outside component tree
console.log("[JS] Starting initClerk process...");
const clerkPromise = initClerk().then(c => {
  console.log("[JS] initClerk() SUCCESS");
  return c;
}).catch(err => {
  console.error("[JS] initClerk() FAILURE:", err);
  const root = document.getElementById("root");
  if (root) {
    root.innerHTML = `<div style="padding: 20px; color: white; background: red;">Clerk Init Failed: ${err.message || err}</div>`;
  }
  throw err;
});

function AppWithClerk() {
  console.log("[JS] AppWithClerk Component Render Started");
  const clerk = use(clerkPromise);
  console.log("[JS] clerk object available in component");

  return (
    <ClerkProvider
      publishableKey={clerk.publishableKey}
      Clerk={clerk as any}
      allowedRedirectProtocols={["tauri:"]}
      afterSignOutUrl="/"
    >
      {!clerk.user ? (
        <div className="h-screen w-screen flex flex-col items-center justify-center bg-background p-4 text-center">
          <div className="mb-8 max-w-md">
            <h1 className="text-4xl font-bold tracking-tight mb-4">OutreachOS</h1>
            <p className="text-muted-foreground text-lg mb-8">
              The privacy-first relationship manager for modern outreach.
              Please sign in to access your local database.
            </p>
            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              <SignInButton mode="modal">
                <Button size="lg" className="px-8 font-semibold">Sign In</Button>
              </SignInButton>
              <SignUpButton mode="modal">
                <Button size="lg" variant="outline" className="px-8 font-semibold">Sign Up</Button>
              </SignUpButton>
            </div>
          </div>
        </div>
      ) : (
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
      )}


    </ClerkProvider>
  );
}

function App() {
  const [isLocked, setIsLocked] = useState<boolean | null>(null);

  useEffect(() => {
    // Listen for background scheduled email failures
    const unlistenScheduleFailure = listen<{ email_id: string; to_email: string; subject: string; error: string }>(
      "email_schedule_failed",
      (event) => {
        toast.error(`Scheduled Email Failed`, {
          description: `Failed to send to ${event.payload.to_email}: ${event.payload.error}. Retrying later...`,
          duration: 10000,
        });
      }
    );

    const checkLock = async () => {
      try {
        const hasPin = await invoke<boolean>("has_lock_pin");
        setIsLocked(hasPin);
      } catch (err) {
        console.error("Security system error:", err);
        setIsLocked(false);
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
    <Suspense fallback={
      <div className="h-screen w-screen flex items-center justify-center bg-background">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    }>
      <AppWithClerk />
    </Suspense>
  );
}

export default App;
