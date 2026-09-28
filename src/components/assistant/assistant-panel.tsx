"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { ArrowUp, RotateCcw, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Spinner } from "@/components/ui/spinner";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

type ChatMessage = { role: "user" | "assistant"; content: string; toolsUsed?: string[]; error?: boolean };

const STORAGE_KEY = "hostelhub-assistant-chat";

const SUGGESTIONS = [
  "How full are my hostels right now?",
  "Who has overdue rent?",
  "Summarize this month's finances",
  "Which maintenance requests are still open?",
];

const TOOL_LABELS: Record<string, string> = {
  get_dashboard_summary: "Dashboard",
  list_hostels: "Hostels",
  get_occupancy: "Occupancy",
  search_residents: "Residents",
  get_resident_details: "Resident profile",
  search_staff: "Staff",
  list_invoices: "Invoices",
  list_payments: "Payments",
  get_finance_summary: "Finance",
  list_maintenance: "Maintenance",
  list_complaints: "Complaints",
  get_visitor_stats: "Visitors",
  run_report: "Reports",
};

/** Ask-anything assistant: answers questions from the user's own data (read-only). */
export function AssistantPanel({ enabled }: { enabled: boolean }) {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [pending, setPending] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Keep the conversation while navigating between pages in this tab.
  useEffect(() => {
    try {
      const saved = window.sessionStorage.getItem(STORAGE_KEY);
      // Restoring from an external store after mount (avoids a hydration mismatch).
      if (saved) setMessages(JSON.parse(saved) as ChatMessage[]);
    } catch {
      /* storage unavailable */
    }
  }, []);
  useEffect(() => {
    try {
      window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(messages.slice(-30)));
    } catch {
      /* ignore */
    }
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, pending]);

  const send = async (text: string) => {
    const question = text.trim();
    if (!question || pending) return;
    const next: ChatMessage[] = [...messages, { role: "user", content: question }];
    setMessages(next);
    setInput("");
    setPending(true);
    try {
      const res = await fetch("/api/assistant", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: next.filter((m) => !m.error).map(({ role, content }) => ({ role, content })),
        }),
      });
      const json = (await res.json().catch(() => null)) as
        | { data?: { answer: string; toolsUsed: string[] }; error?: { message: string } }
        | null;
      if (!res.ok || !json?.data) throw new Error(json?.error?.message ?? "The assistant couldn't answer right now.");
      setMessages((m) => [...m, { role: "assistant", content: json.data!.answer, toolsUsed: json.data!.toolsUsed }]);
    } catch (e) {
      setMessages((m) => [
        ...m,
        { role: "assistant", content: e instanceof Error ? e.message : "Something went wrong.", error: true },
      ]);
    } finally {
      setPending(false);
    }
  };

  return (
    <>
      <Button
        onClick={() => setOpen(true)}
        className="no-print fixed end-4 bottom-20 z-40 h-11 rounded-full px-4 shadow-lg md:end-6 md:bottom-6"
        aria-label="Open assistant"
      >
        <Sparkles />
        <span className="hidden sm:inline">Ask assistant</span>
      </Button>

      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent className="flex flex-col gap-0 p-0 data-[side=right]:w-full data-[side=right]:sm:w-[40rem] data-[side=right]:sm:max-w-[calc(100vw-2rem)]">
          <SheetHeader className="border-b px-4 py-3">
            <SheetTitle className="flex items-center gap-2">
              <span className="flex size-7 items-center justify-center rounded-lg bg-primary text-primary-foreground">
                <Sparkles className="size-4" />
              </span>
              Assistant
            </SheetTitle>
            <SheetDescription>Ask about occupancy, residents, dues, staff or operations. Answers use only data you can access.</SheetDescription>
          </SheetHeader>

          <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-4">
            {!enabled ? (
              <div className="rounded-xl border border-dashed p-4 text-sm text-muted-foreground">
                The assistant isn&apos;t configured on this server. An administrator needs to set <code className="font-mono">GEMINI_API_KEY</code>.
              </div>
            ) : messages.length === 0 ? (
              <div className="flex flex-col gap-3">
                <p className="text-sm text-muted-foreground">Try asking:</p>
                {SUGGESTIONS.map((s) => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => send(s)}
                    className="rounded-xl border bg-card px-3 py-2.5 text-start text-sm transition-colors hover:border-primary/40 hover:bg-accent/30"
                  >
                    {s}
                  </button>
                ))}
              </div>
            ) : (
              <div className="flex flex-col gap-4">
                {messages.map((m, i) =>
                  m.role === "user" ? (
                    <div key={i} className="ms-auto max-w-[85%] rounded-2xl rounded-ee-sm bg-primary px-3.5 py-2 text-sm text-primary-foreground whitespace-pre-wrap">
                      {m.content}
                    </div>
                  ) : (
                    <div key={i} className="flex max-w-full flex-col gap-1.5">
                      <div
                        className={cn(
                          "rounded-2xl rounded-es-sm border bg-card px-3.5 py-2.5 text-sm",
                          m.error && "border-danger/30 bg-danger-soft text-danger",
                        )}
                      >
                        <Markdown text={m.content} onNavigate={() => setOpen(false)} />
                      </div>
                      {m.toolsUsed?.length ? (
                        <p className="ps-1 text-xs text-muted-foreground">
                          Checked: {m.toolsUsed.map((t) => TOOL_LABELS[t] ?? t).join(", ")}
                        </p>
                      ) : null}
                    </div>
                  ),
                )}
                {pending ? (
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Spinner />
                    Looking that up…
                  </div>
                ) : null}
              </div>
            )}
          </div>

          <form
            className="border-t p-3"
            onSubmit={(e) => {
              e.preventDefault();
              void send(input);
            }}
          >
            <div className="flex items-end gap-2">
              <Textarea
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    void send(input);
                  }
                }}
                placeholder={enabled ? "Ask a question…" : "Assistant unavailable"}
                disabled={!enabled || pending}
                rows={1}
                maxLength={4000}
                className="max-h-32 min-h-10 resize-none"
                aria-label="Question"
              />
              <Button type="submit" size="icon" disabled={!enabled || pending || !input.trim()} aria-label="Send">
                <ArrowUp />
              </Button>
            </div>
            {messages.length ? (
              <button
                type="button"
                onClick={() => setMessages([])}
                disabled={pending}
                className="mt-2 inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
              >
                <RotateCcw className="size-3" />
                New conversation
              </button>
            ) : null}
          </form>
        </SheetContent>
      </Sheet>
    </>
  );
}

/** Markdown answer; internal links use client navigation and close the panel. */
function Markdown({ text, onNavigate }: { text: string; onNavigate: () => void }) {
  return (
    <div className="flex flex-col gap-2 leading-relaxed [&_li]:ms-4 [&_ol]:list-decimal [&_ul]:list-disc">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          a: ({ href, children }) =>
            href?.startsWith("/") ? (
              <Link href={href} onClick={onNavigate} className="font-medium text-primary underline underline-offset-4">
                {children}
              </Link>
            ) : (
              <a href={href} target="_blank" rel="noopener noreferrer" className="font-medium text-primary underline underline-offset-4">
                {children}
              </a>
            ),
          table: ({ children }) => (
            <div className="overflow-x-auto rounded-lg border">
              <table className="w-full text-xs">{children}</table>
            </div>
          ),
          th: ({ children }) => <th className="border-b bg-muted/50 px-2 py-1.5 text-start font-medium">{children}</th>,
          td: ({ children }) => <td className="border-b px-2 py-1.5 last:border-b-0">{children}</td>,
          code: ({ children }) => <code className="rounded bg-muted px-1 py-0.5 font-mono text-xs">{children}</code>,
          h1: ({ children }) => <p className="font-semibold">{children}</p>,
          h2: ({ children }) => <p className="font-semibold">{children}</p>,
          h3: ({ children }) => <p className="font-semibold">{children}</p>,
        }}
      >
        {text}
      </ReactMarkdown>
    </div>
  );
}
