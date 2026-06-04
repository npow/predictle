"use client";

import { useCallback, useEffect, useState } from "react";
import {
  DragDropContext,
  Droppable,
  Draggable,
  type DropResult,
} from "@hello-pangea/dnd";
import clsx from "clsx";
import { siteUrl } from "@/lib/site";

type Feedback = "correct" | "incorrect";

interface PuzzleItem {
  id: string;
  question: string;
  url: string;
}
interface PublicPuzzle {
  puzzleId: string;
  size: number;
  maxGuesses: number;
  items: PuzzleItem[];
  token: string;
  code?: string;
}
interface RevealItem {
  id: string;
  probability: number;
}

const emoji = (f: Feedback) => (f === "correct" ? "✅" : "❌");

export default function PredictlePage() {
  const [puzzle, setPuzzle] = useState<PublicPuzzle | null>(null);
  const [orderedIds, setOrderedIds] = useState<string[]>([]);
  const [feedbackById, setFeedbackById] = useState<Record<string, Feedback[]>>({});
  const [attemptCount, setAttemptCount] = useState(0);
  const [completed, setCompleted] = useState(false);
  const [won, setWon] = useState(false);
  const [probById, setProbById] = useState<Record<string, number> | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [challengeBusy, setChallengeBusy] = useState(false);
  const [challengeCopied, setChallengeCopied] = useState(false);
  const [codeInput, setCodeInput] = useState("");

  const itemById = (id: string) => puzzle?.items.find((i) => i.id === id);
  const isLocked = (id: string) => {
    const f = feedbackById[id];
    return f?.[f.length - 1] === "correct";
  };
  const correctCount = orderedIds.filter(isLocked).length;

  const loadPuzzle = useCallback(async (code?: string) => {
    setLoading(true);
    setError(null);
    setFeedbackById({});
    setAttemptCount(0);
    setCompleted(false);
    setWon(false);
    setProbById(null);
    setCopied(false);
    setChallengeCopied(false);
    try {
      let url: string;
      if (code) {
        // Shared puzzle: load the exact frozen snapshot for this code.
        url = `/api/puzzle?code=${encodeURIComponent(code)}`;
      } else {
        // Dedupe: tell the server which markets we've seen recently so it
        // avoids them. Rolling window so the pool never truly runs out.
        url = `/api/puzzle?exclude=${encodeURIComponent(readRecent().join(","))}`;
      }
      const res = await fetch(url);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to load puzzle");
      const p = data as PublicPuzzle;
      const ids = p.items.map((i) => i.id);
      if (!code) pushRecent(ids); // don't pollute dedupe with shared puzzles
      setPuzzle(p);
      setOrderedIds(ids);

      // Keep the URL in sync so refresh/back works and the link is copyable.
      const target = p.code ? `/?game=${p.code}` : "/";
      window.history.replaceState(null, "", target);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong");
    } finally {
      setLoading(false);
    }
  }, []);

  // Load the initial puzzle on mount (a shared one if ?game=CODE is present).
  useEffect(() => {
    const code = new URLSearchParams(window.location.search).get("game");
    // eslint-disable-next-line react-hooks/set-state-in-effect -- intentional data fetch on mount
    loadPuzzle(code ? code.toUpperCase() : undefined);
  }, [loadPuzzle]);

  // Reorder only unlocked markets; locked ones stay put (mirrors the original).
  const onDragEnd = (result: DropResult) => {
    if (!result.destination || completed) return;
    const sourceIndex = result.source.index;
    const destIndex = result.destination.index;
    if (isLocked(orderedIds[sourceIndex])) return;

    const unlockedIndices: number[] = [];
    const unlockedIds: string[] = [];
    orderedIds.forEach((id, idx) => {
      if (!isLocked(id)) {
        unlockedIndices.push(idx);
        unlockedIds.push(id);
      }
    });

    const sourceUnlockedIdx = unlockedIndices.indexOf(sourceIndex);
    if (sourceUnlockedIdx === -1) return;

    let targetUnlockedIdx: number;
    if (unlockedIndices.includes(destIndex)) {
      targetUnlockedIdx = unlockedIndices.indexOf(destIndex);
    } else {
      let nearest = 0;
      let minDist = Math.abs(unlockedIndices[0] - destIndex);
      for (let i = 1; i < unlockedIndices.length; i++) {
        const d = Math.abs(unlockedIndices[i] - destIndex);
        if (d < minDist) {
          minDist = d;
          nearest = i;
        }
      }
      targetUnlockedIdx = nearest;
    }
    if (sourceUnlockedIdx === targetUnlockedIdx) return;

    const [moved] = unlockedIds.splice(sourceUnlockedIdx, 1);
    unlockedIds.splice(targetUnlockedIdx, 0, moved);

    const newOrder = [...orderedIds];
    let u = 0;
    for (let i = 0; i < newOrder.length; i++) {
      if (!isLocked(orderedIds[i])) newOrder[i] = unlockedIds[u++];
    }
    setOrderedIds(newOrder);
  };

  const submit = async () => {
    if (!puzzle || completed || submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch("/api/score", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token: puzzle.token, guess: orderedIds }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Scoring failed");

      const fb: Record<string, Feedback[]> = { ...feedbackById };
      orderedIds.forEach((id, i) => {
        fb[id] = [...(fb[id] || []), data.feedback[i] as Feedback];
      });

      const newAttempt = attemptCount + 1;
      const didWin: boolean = data.solved;
      const done = didWin || newAttempt >= puzzle.maxGuesses;

      let probs = probById;
      if (done) {
        let reveal: RevealItem[] | undefined = data.reveal;
        if (!reveal) {
          const r2 = await fetch("/api/score", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ token: puzzle.token, guess: orderedIds, reveal: true }),
          });
          reveal = (await r2.json()).reveal;
        }
        probs = Object.fromEntries((reveal ?? []).map((r) => [r.id, r.probability]));
      }

      setFeedbackById(fb);
      setAttemptCount(newAttempt);
      setWon(didWin);
      setCompleted(done);
      setProbById(probs);
      if (done) bumpStats(didWin);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Scoring failed");
    } finally {
      setSubmitting(false);
    }
  };

  const share = async () => {
    if (!puzzle) return;
    const lines = orderedIds.map((id) => (feedbackById[id] || []).map(emoji).join(""));
    const text = `Predictle 🔮\n${lines.join("\n")}\n\nPlay at ${siteUrl}`;
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setError("Could not copy to clipboard");
    }
  };

  // Copy a link to this exact puzzle. Mints a code on first use; reuses the
  // existing code if this is already a shared puzzle.
  const challenge = async () => {
    if (!puzzle || challengeBusy) return;
    let code = puzzle.code;
    if (!code) {
      setChallengeBusy(true);
      try {
        const res = await fetch("/api/share", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ token: puzzle.token }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "Could not create code");
        code = data.code as string;
        setPuzzle({ ...puzzle, code });
        window.history.replaceState(null, "", `/?game=${code}`);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Could not create code");
        return;
      } finally {
        setChallengeBusy(false);
      }
    }
    try {
      await navigator.clipboard.writeText(`${window.location.origin}/?game=${code}`);
      setChallengeCopied(true);
      setTimeout(() => setChallengeCopied(false), 2000);
    } catch {
      setError("Could not copy link");
    }
  };

  const playCode = () => {
    const code = codeInput.trim().toUpperCase();
    if (/^[2-9A-HJKMNP-TV-Z]{6}$/.test(code)) {
      setCodeInput("");
      loadPuzzle(code);
    } else {
      setError("Codes are 6 characters (letters & digits).");
    }
  };

  return (
    <div className="relative min-h-screen w-full">
      {/* Light + dark gradient backdrop */}
      <div className="pointer-events-none fixed inset-0 -z-10 bg-gradient-to-br from-violet-100 via-fuchsia-50 to-amber-50 dark:hidden" />
      <div className="pointer-events-none fixed inset-0 -z-10 hidden bg-gradient-to-br from-violet-950 via-slate-900 to-fuchsia-950 dark:block" />

      <main className="mx-auto flex w-full max-w-xl flex-col gap-6 px-4 py-8">
        {/* Header */}
        <div className="flex flex-col items-center gap-2 text-center">
          <div className={clsx("text-6xl", loading && "animate-pulse")}>🔮</div>
          <h1 className="bg-gradient-to-r from-violet-600 via-fuchsia-500 to-pink-500 bg-clip-text text-4xl font-black tracking-tight text-transparent">
            Predictle
          </h1>
          <p className="max-w-sm text-sm text-slate-600 dark:text-slate-300">
            Sort these markets from <span className="font-semibold">highest</span> to{" "}
            <span className="font-semibold">lowest</span> probability
          </p>

          {puzzle?.code && (
            <div className="rounded-full bg-fuchsia-100 px-4 py-1.5 text-sm font-medium text-fuchsia-700 dark:bg-fuchsia-500/20 dark:text-fuchsia-300">
              🔗 Shared puzzle{" "}
              <span className="font-mono font-bold tracking-wider">{puzzle.code}</span>
            </div>
          )}

          {puzzle && !completed && (
            <div className="flex items-center gap-2">
              <span className="text-xs font-medium text-slate-500 dark:text-slate-400">Guesses</span>
              {Array.from({ length: puzzle.maxGuesses }, (_, i) => (
                <div
                  key={i}
                  className={clsx(
                    "h-3 w-3 rounded-full transition-all",
                    i < attemptCount
                      ? "bg-gradient-to-br from-violet-500 to-fuchsia-500 shadow-md shadow-violet-200 dark:shadow-violet-500/40"
                      : "bg-slate-300 dark:bg-slate-600"
                  )}
                />
              ))}
            </div>
          )}

          {attemptCount > 0 && !completed && (
            <div className="rounded-full bg-emerald-100 px-4 py-1.5 text-sm font-medium text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-400">
              ✓ {correctCount}/{puzzle?.size} correct
            </div>
          )}
        </div>

        {loading && <p className="py-10 text-center text-slate-500">Loading puzzle…</p>}
        {error && !loading && (
          <div className="rounded-lg border border-red-300 bg-red-50 p-3 text-sm text-red-700 dark:border-red-900 dark:bg-red-950/60 dark:text-red-300">
            {error}
            <button onClick={() => loadPuzzle()} className="ml-2 underline">
              Retry
            </button>
          </div>
        )}

        {puzzle && !loading && (
          <>
            <DragDropContext onDragEnd={onDragEnd}>
              <Droppable droppableId="markets">
                {(provided, snapshot) => (
                  <div
                    {...provided.droppableProps}
                    ref={provided.innerRef}
                    className={clsx(
                      "rounded-2xl border-2 p-3 transition-all duration-200",
                      snapshot.isDraggingOver
                        ? "border-fuchsia-300 bg-fuchsia-50 shadow-lg shadow-fuchsia-100 dark:border-fuchsia-500/50 dark:bg-fuchsia-500/10"
                        : "border-slate-200 bg-slate-50 dark:border-slate-700 dark:bg-slate-800/50"
                    )}
                  >
                    <ProbLabel direction="up" label="Higher probability" />
                    <div className="flex flex-col gap-2">
                      {orderedIds.map((id, index) => {
                        const item = itemById(id);
                        if (!item) return null;
                        return (
                          <Draggable
                            key={id}
                            draggableId={id}
                            index={index}
                            isDragDisabled={completed || isLocked(id)}
                          >
                            {(prov, snap) => (
                              <div
                                ref={prov.innerRef}
                                {...prov.draggableProps}
                                {...prov.dragHandleProps}
                              >
                                <MarketCard
                                  item={item}
                                  feedback={feedbackById[id] || []}
                                  isDragging={snap.isDragging}
                                  locked={isLocked(id)}
                                  completed={completed}
                                  prob={probById?.[id]}
                                />
                              </div>
                            )}
                          </Draggable>
                        );
                      })}
                      {provided.placeholder}
                    </div>
                    <ProbLabel direction="down" label="Lower probability" />
                  </div>
                )}
              </Droppable>
            </DragDropContext>

            {!completed ? (
              <button
                onClick={submit}
                disabled={submitting}
                className="w-full rounded-xl bg-gradient-to-r from-violet-600 via-fuchsia-500 to-pink-500 py-4 text-lg font-bold text-white shadow-lg shadow-fuchsia-200 transition-all hover:scale-[1.02] hover:shadow-xl active:scale-[0.98] disabled:opacity-60 dark:shadow-fuchsia-500/30"
              >
                {submitting ? "Scoring…" : "Submit Guess"}
              </button>
            ) : (
              <div className="flex flex-col gap-3">
                <div
                  className={clsx(
                    "rounded-2xl p-6 text-center text-white shadow-lg",
                    won
                      ? "bg-gradient-to-br from-emerald-400 to-teal-500 shadow-emerald-200 dark:from-emerald-600 dark:to-teal-600"
                      : "bg-gradient-to-br from-amber-400 to-orange-500 shadow-amber-200 dark:from-amber-600 dark:to-orange-600"
                  )}
                >
                  <div className="mb-2 text-4xl">{won ? "🎉" : "😅"}</div>
                  <div className="text-xl font-bold">
                    {won
                      ? attemptCount === 1
                        ? "Perfect!"
                        : `You got it in ${attemptCount} tries!`
                      : "So close — try another!"}
                  </div>
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={share}
                    className="flex-1 rounded-xl border-2 border-violet-200 bg-violet-50 py-3 font-bold text-violet-600 transition-all hover:bg-violet-100 dark:border-violet-500/50 dark:bg-violet-500/20 dark:text-violet-300"
                  >
                    {copied ? "✓ Copied!" : "📋 Share result"}
                  </button>
                  <button
                    onClick={challenge}
                    disabled={challengeBusy}
                    className="flex-1 rounded-xl border-2 border-fuchsia-200 bg-fuchsia-50 py-3 font-bold text-fuchsia-600 transition-all hover:bg-fuchsia-100 disabled:opacity-60 dark:border-fuchsia-500/50 dark:bg-fuchsia-500/20 dark:text-fuchsia-300"
                  >
                    {challengeBusy
                      ? "…"
                      : challengeCopied
                      ? "✓ Link copied!"
                      : "🔗 Challenge a friend"}
                  </button>
                </div>
                <button
                  onClick={() => loadPuzzle()}
                  className="rounded-xl bg-gradient-to-r from-violet-600 to-fuchsia-500 py-3 font-bold text-white shadow-md transition-all hover:scale-[1.02] active:scale-[0.98]"
                >
                  Next puzzle →
                </button>
              </div>
            )}

            {/* Play a friend's shared puzzle by code */}
            <div className="flex items-center justify-center gap-2">
              <input
                value={codeInput}
                onChange={(e) => setCodeInput(e.target.value.toUpperCase())}
                onKeyDown={(e) => e.key === "Enter" && playCode()}
                placeholder="Enter a code"
                maxLength={6}
                className="w-32 rounded-lg border border-slate-300 bg-white/70 px-3 py-1.5 text-center font-mono text-sm uppercase tracking-widest text-slate-700 placeholder:tracking-normal placeholder:font-sans focus:border-fuchsia-400 focus:outline-none dark:border-slate-600 dark:bg-slate-800/70 dark:text-slate-200"
              />
              <button
                onClick={playCode}
                disabled={codeInput.trim().length !== 6}
                className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm font-semibold text-slate-600 transition-colors hover:border-fuchsia-400 hover:text-fuchsia-600 disabled:opacity-40 dark:border-slate-600 dark:text-slate-300"
              >
                Play
              </button>
            </div>

            <p className="text-center text-xs text-slate-400 dark:text-slate-500">
              Powered by live Manifold markets • Play as many as you want
            </p>

            <Stats />
          </>
        )}
      </main>
    </div>
  );
}

function ProbLabel({ direction, label }: { direction: "up" | "down"; label: string }) {
  return (
    <div className="flex items-center justify-center gap-1.5 py-1 text-xs font-bold uppercase tracking-widest text-slate-500 dark:text-slate-400">
      <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          d={direction === "up" ? "M5 15l7-7 7 7" : "M19 9l-7 7-7-7"}
        />
      </svg>
      <span>{label}</span>
    </div>
  );
}

function MarketCard(props: {
  item: PuzzleItem;
  feedback: Feedback[];
  isDragging: boolean;
  locked: boolean;
  completed: boolean;
  prob?: number;
}) {
  const { item, feedback, isDragging, locked, completed, prob } = props;
  const isCorrect = feedback[feedback.length - 1] === "correct";

  return (
    <div
      className={clsx(
        "group relative rounded-xl border-2 px-4 py-3 transition-all duration-200",
        isDragging
          ? "scale-105 border-fuchsia-400 bg-fuchsia-50 shadow-xl shadow-fuchsia-200 dark:border-fuchsia-500 dark:bg-fuchsia-500/20"
          : isCorrect
          ? "border-emerald-300 bg-emerald-50 dark:border-emerald-500/50 dark:bg-emerald-500/10"
          : "border-slate-200 bg-white hover:border-slate-300 hover:shadow-md dark:border-slate-600 dark:bg-slate-800 dark:hover:border-slate-500",
        !completed && !locked && "cursor-grab active:cursor-grabbing",
        locked && "ring-2 ring-emerald-200 dark:ring-1 dark:ring-emerald-500/50"
      )}
    >
      <div className="flex items-center gap-3">
        {!completed && !locked && (
          <div className="flex flex-col gap-0.5 text-slate-300 transition-colors group-hover:text-slate-400 dark:text-slate-500">
            {[0, 1, 2].map((r) => (
              <div key={r} className="flex gap-0.5">
                <div className="h-1 w-1 rounded-full bg-current" />
                <div className="h-1 w-1 rounded-full bg-current" />
              </div>
            ))}
          </div>
        )}

        <div className="flex min-w-0 flex-1 flex-col gap-1">
          {completed ? (
            <a
              href={item.url}
              target="_blank"
              rel="noreferrer"
              className={clsx(
                "text-sm font-semibold transition-colors",
                isCorrect
                  ? "text-emerald-800 hover:text-emerald-600 dark:text-emerald-300"
                  : "text-slate-800 hover:text-fuchsia-600 dark:text-slate-200 dark:hover:text-fuchsia-400"
              )}
            >
              {item.question}
            </a>
          ) : (
            <span className="text-sm font-semibold text-slate-800 dark:text-slate-200">
              {item.question}
            </span>
          )}

          {completed && prob !== undefined && (
            <div className="flex items-center gap-2">
              <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-slate-200 dark:bg-slate-700">
                <div
                  className={clsx(
                    "h-full rounded-full",
                    isCorrect
                      ? "bg-gradient-to-r from-emerald-400 to-teal-400"
                      : "bg-gradient-to-r from-violet-400 to-fuchsia-400"
                  )}
                  style={{ width: `${Math.round(prob * 100)}%` }}
                />
              </div>
              <span
                className={clsx(
                  "whitespace-nowrap text-xs font-bold",
                  isCorrect ? "text-emerald-600 dark:text-emerald-400" : "text-fuchsia-600 dark:text-fuchsia-400"
                )}
              >
                {Math.round(prob * 100)}% chance
              </span>
            </div>
          )}
        </div>

        {feedback.length > 0 && (
          <div className="flex flex-shrink-0 gap-1 text-xl">
            {feedback.map((f, i) => (
              <span key={i}>{emoji(f)}</span>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ---- recently-seen markets (dedupe over long play) ----
const RECENT_KEY = "predictle:recent";
const RECENT_MAX = 150; // ~30 puzzles before any market can recur
function readRecent(): string[] {
  if (typeof window === "undefined") return [];
  try {
    return JSON.parse(localStorage.getItem(RECENT_KEY) || "[]");
  } catch {
    return [];
  }
}
function pushRecent(ids: string[]) {
  const merged = [...ids, ...readRecent()].slice(0, RECENT_MAX);
  localStorage.setItem(RECENT_KEY, JSON.stringify(merged));
}

// ---- lightweight localStorage stats ----
interface StatData {
  played: number;
  won: number;
}
function readStats(): StatData {
  if (typeof window === "undefined") return { played: 0, won: 0 };
  try {
    return JSON.parse(localStorage.getItem("predictle:stats") || "") as StatData;
  } catch {
    return { played: 0, won: 0 };
  }
}
function bumpStats(won: boolean) {
  const s = readStats();
  s.played += 1;
  if (won) s.won += 1;
  localStorage.setItem("predictle:stats", JSON.stringify(s));
  window.dispatchEvent(new Event("predictle-stats"));
}
function Stats() {
  const [s, setS] = useState<StatData | null>(null);
  useEffect(() => {
    const refresh = () => setS(readStats());
    refresh();
    window.addEventListener("predictle-stats", refresh);
    return () => window.removeEventListener("predictle-stats", refresh);
  }, []);
  if (!s || s.played === 0) return null;
  const pct = Math.round((s.won / s.played) * 100);
  return (
    <div className="flex justify-around border-t border-slate-200 pt-4 text-center text-xs text-slate-500 dark:border-slate-700">
      <div>
        <div className="text-lg font-bold text-slate-900 dark:text-white">{s.played}</div>Played
      </div>
      <div>
        <div className="text-lg font-bold text-slate-900 dark:text-white">{pct}%</div>Win rate
      </div>
      <div>
        <div className="text-lg font-bold text-slate-900 dark:text-white">{s.won}</div>Solved
      </div>
    </div>
  );
}
