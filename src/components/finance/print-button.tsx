"use client";

import { Printer } from "lucide-react";
import { Button } from "@/components/ui/button";

export function PrintButton({ label = "Print", variant = "outline" }: { label?: string; variant?: "outline" | "default" }) {
  return (
    <Button type="button" variant={variant} onClick={() => window.print()}>
      <Printer />
      {label}
    </Button>
  );
}

/**
 * Print only the element marked `.finance-print-area` (the invoice or receipt),
 * hiding the app shell, and use a clean A4 page.
 */
export function PrintStyles() {
  return (
    <style>{`
      @media print {
        @page { size: A4; margin: 14mm; }
        body * { visibility: hidden !important; }
        .finance-print-area, .finance-print-area * { visibility: visible !important; }
        .finance-print-area {
          position: absolute !important; inset: 0 auto auto 0 !important; width: 100% !important;
          border: 0 !important; box-shadow: none !important; padding: 0 !important; margin: 0 !important;
          background: white !important; color: black !important;
        }
        .finance-print-area .print-muted { color: #555 !important; }
        .finance-print-area table { page-break-inside: auto; }
        .finance-print-area tr { page-break-inside: avoid; }
      }
    `}</style>
  );
}
