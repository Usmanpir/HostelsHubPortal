"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { ArrowUp, RotateCcw, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
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
        className="no-print fixed end-4 bottom-20 z-40 size-12 rounded-full p-0 shadow-lg md:end-6 md:bottom-6"
        aria-label="Open assistant"
      >
        <Sparkles className="size-5" />
      </Button>

      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent className="flex flex-col gap-0 p-0 data-[side=right]:w-full data-[side=right]:sm:w-[40rem] data-[side=right]:sm:max-w-[calc(100vw-2rem)]">
          <SheetHeader className="flex-row items-center gap-2 border-b px-4 py-3 pe-12">
            <Sparkles className="size-4 text-primary" />
            <SheetTitle className="text-base">Assistant</SheetTitle>
            <SheetDescription className="sr-only">Ask questions about your hostels. Answers use only data you can access.</SheetDescription>
            {messages.length ? (
              <Button variant="ghost" size="sm" className="ms-auto text-muted-foreground" onClick={() => setMessages([])} disabled={pending}>
                <RotateCcw />
                New chat
              </Button>
            ) : null}
          </SheetHeader>

          <div ref={scrollRef} className="flex-1 overflow-y-auto px-5 py-5">
            {!enabled ? (
              <p className="text-sm text-muted-foreground">
                The assistant isn&apos;t set up yet. An administrator needs to add <code className="font-mono">GEMINI_API_KEY</code>.
              </p>
            ) : messages.length === 0 ? (
              <div className="flex h-full flex-col items-center justify-center gap-5 text-center">
                <p className="text-lg font-medium">What would you like to know?</p>
                <div className="flex flex-wrap justify-center gap-2">
                  {SUGGESTIONS.map((s) => (
                    <button
                      key={s}
                      type="button"
                      onClick={() => send(s)}
                      className="rounded-full border px-3.5 py-1.5 text-sm text-muted-foreground transition-colors hover:border-primary/40 hover:text-foreground"
                    >
                      {s}
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              <div className="flex flex-col gap-6">
                {messages.map((m, i) =>
                  m.role === "user" ? (
                    <div key={i} className="ms-auto max-w-[85%] rounded-2xl bg-muted px-3.5 py-2 text-sm whitespace-pre-wrap">
                      {m.content}
                    </div>
                  ) : (
                    <div key={i} className={cn("text-sm", m.error && "text-danger")}>
                      <Markdown text={m.content} onNavigate={() => setOpen(false)} />
                    </div>
                  ),
                )}
                {pending ? (
                  <div className="flex gap-1" aria-label="Thinking">
                    {[0, 150, 300].map((d) => (
                      <span key={d} className="size-2 animate-bounce rounded-full bg-muted-foreground/50" style={{ animationDelay: `${d}ms` }} />
                    ))}
                  </div>
                ) : null}
              </div>
            )}
          </div>

          <form
            className="p-3"
            onSubmit={(e) => {
              e.preventDefault();
              void send(input);
            }}
          >
            <div className="flex items-end gap-2 rounded-2xl border bg-background p-1.5 ps-3 focus-within:border-primary/50">
              <Textarea
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    void send(input);
                  }
                }}
                placeholder={enabled ? "Ask anything about your hostels…" : "Assistant unavailable"}
                disabled={!enabled || pending}
                rows={1}
                maxLength={4000}
                className="max-h-32 min-h-9 resize-none border-0 bg-transparent px-0 shadow-none focus-visible:ring-0 dark:bg-transparent"
                aria-label="Question"
              />
              <Button type="submit" size="icon" className="shrink-0 rounded-xl" disabled={!enabled || pending || !input.trim()} aria-label="Send">
                <ArrowUp />
              </Button>
            </div>
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
