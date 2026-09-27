"use client";

import { ChevronDown } from "lucide-react";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";

export type FaqItem = { question: string; answer: string };

export function Faq({ items }: { items: FaqItem[] }) {
  return (
    <div className="divide-y rounded-2xl border bg-card">
      {items.map((item, i) => (
        <Collapsible key={item.question} defaultOpen={i === 0} className="group/faq">
          <CollapsibleTrigger className="flex w-full items-center justify-between gap-4 px-5 py-4 text-start font-medium transition-colors hover:bg-muted/40 focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none sm:px-6">
            {item.question}
            <ChevronDown className="size-4 shrink-0 text-muted-foreground transition-transform group-data-[state=open]/faq:rotate-180" />
          </CollapsibleTrigger>
          <CollapsibleContent className="overflow-hidden data-[state=closed]:animate-collapsible-up data-[state=open]:animate-collapsible-down">
            <p className="px-5 pb-5 text-sm text-pretty text-muted-foreground sm:px-6">{item.answer}</p>
          </CollapsibleContent>
        </Collapsible>
      ))}
    </div>
  );
}
