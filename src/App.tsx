// src/App.tsx
import React from "react";
import { ThemeProvider } from "next-themes";
import { Toaster } from "@shared/ui/toaster";
import { Toaster as Sonner } from "@shared/ui/sonner";
import { TooltipProvider } from "@shared/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ReactQueryDevtools } from "@tanstack/react-query-devtools";
import { BrowserRouter } from "react-router-dom";

import { AuthProvider } from "@app/providers/AuthProvider";
import { TenantProvider } from "@app/providers/TenantProvider";

import AppRoutes from "@/AppRoutes"; // we'll create this as a small inner module below

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // Data is considered "fresh" for 60 seconds. During this window,
      // navigating between pages won't trigger new Firestore reads.
      staleTime: 60 * 1000,
      // Cached data stays in memory for 10 minutes even after unmounting,
      // so returning to a page is instant.
      gcTime: 10 * 60 * 1000,
      // Don't refetch when the user switches browser tabs — this prevents
      // a flood of reads whenever the educator alt-tabs.
      refetchOnWindowFocus: false,
    },
  },
});

export default function App() {
  return (
    <ThemeProvider attribute="class" defaultTheme="light" enableSystem={false}>
    <QueryClientProvider client={queryClient}>
      {/* <ReactQueryDevtools initialIsOpen={false} /> */}
      <AuthProvider>
        <TenantProvider>
          <TooltipProvider>
            <Toaster />
            <Sonner />
            <BrowserRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
              <AppRoutes />
            </BrowserRouter>
          </TooltipProvider>
        </TenantProvider>
      </AuthProvider>
    </QueryClientProvider>
    </ThemeProvider>
  );
}

