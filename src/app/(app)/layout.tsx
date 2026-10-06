import { Suspense } from "react";
import MainLayout from "@/shared/mainLayout";
import SessionGate from "@/components/sessionGate";
import { JournalViewerProvider } from "@/components/accounting/journalViewer";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <SessionGate>
      <MainLayout>
        <JournalViewerProvider>
          <Suspense>{children}</Suspense>
        </JournalViewerProvider>
      </MainLayout>
    </SessionGate>
  );
}
