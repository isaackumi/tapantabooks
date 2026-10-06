import { Suspense } from "react";
import MainLayout from "@/shared/mainLayout";
import { JournalViewerProvider } from "@/components/accounting/journalViewer";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <MainLayout>
      <JournalViewerProvider>
        <Suspense>{children}</Suspense>
      </JournalViewerProvider>
    </MainLayout>
  );
}
