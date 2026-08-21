"use client";

import { useEffect, useRef, useState } from "react";
import { Volume2, VolumeX } from "lucide-react";
import { useRealtimeQueue } from "@/hooks/useQueueState";
import { useDisplayAudio } from "@/hooks/useDisplayAudio";
import { formatClockNow } from "@/lib/utils/date";
import { vehicleDisplayName } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import type { TokenWithRelations } from "@/types";
import { cn } from "@/lib/utils/cn";

type DisplaySettings = {
  companyName: string;
  audioNotificationEnabled: boolean;
  textToSpeechEnabled: boolean;
  displayShowCustomerName: boolean;
  upcomingTokensCount: number;
};

type CallOverlay = {
  tokenNumber: string;
  vehicle: string;
  customer: string | null;
  counterName: string;
  phase: "enter" | "exit";
};

const OVERLAY_VISIBLE_MS = 4200;
const OVERLAY_EXIT_MS = 450;

export function PublicDisplayBoard({
  counterCode = "1",
}: {
  counterCode?: string;
}) {
  const { snapshot } = useRealtimeQueue(counterCode);
  const [clock, setClock] = useState<{ date: string; time: string } | null>(
    null
  );
  const [animating, setAnimating] = useState(false);
  const [flashLabel, setFlashLabel] = useState(false);
  const [callOverlay, setCallOverlay] = useState<CallOverlay | null>(null);
  const [settings, setSettings] = useState<DisplaySettings>({
    companyName: "Indra Traders (PVT) LTD",
    audioNotificationEnabled: true,
    textToSpeechEnabled: true,
    displayShowCustomerName: true,
    upcomingTokensCount: 3,
  });

  const counterName =
    snapshot?.activeTokens?.[0]?.counter?.name ??
    snapshot?.currentToken?.counter?.name ??
    `Counter ${String(counterCode).padStart(2, "0")}`;

  const audio = useDisplayAudio({
    enabled: settings.audioNotificationEnabled,
    ttsEnabled: settings.textToSpeechEnabled,
    counterName,
  });

  const lastAnnouncedRef = useRef<string>("");
  const readyRef = useRef(false);
  const overlayTimersRef = useRef<number[]>([]);

  useEffect(() => {
    setClock(formatClockNow());
    const t = setInterval(() => setClock(formatClockNow()), 1000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    void fetch("/api/settings")
      .then((r) => r.json())
      .then((json) => {
        if (!json.success) return;
        setSettings({
          companyName: json.data.companyName ?? "Indra Traders (PVT) LTD",
          audioNotificationEnabled:
            json.data.audioNotificationEnabled ?? true,
          textToSpeechEnabled: json.data.textToSpeechEnabled ?? true,
          displayShowCustomerName: json.data.displayShowCustomerName ?? true,
          upcomingTokensCount: json.data.upcomingTokensCount ?? 3,
        });
      });
  }, []);

  useEffect(() => {
    return () => {
      overlayTimersRef.current.forEach((id) => window.clearTimeout(id));
    };
  }, []);

  const activeTokens =
    snapshot?.activeTokens ??
    (snapshot?.currentToken ? [snapshot.currentToken] : []);
  const current = activeTokens[0] ?? null;
  const nextTokens = (snapshot?.upcomingTokens ?? []).slice(
    0,
    settings.upcomingTokensCount
  );
  const previous = snapshot?.previousToken ?? null;
  const waitingCount = snapshot?.waitingCount ?? 0;
  const maxConcurrent = snapshot?.maxConcurrentActive ?? 6;

  const notifyRef = useRef(audio.notifyTokenCalled);
  notifyRef.current = audio.notifyTokenCalled;
  const unlockedRef = useRef(audio.unlocked);
  unlockedRef.current = audio.unlocked;
  const pendingAnnounceRef = useRef<string | null>(null);
  const showCustomerRef = useRef(settings.displayShowCustomerName);
  showCustomerRef.current = settings.displayShowCustomerName;

  function clearOverlayTimers() {
    overlayTimersRef.current.forEach((id) => window.clearTimeout(id));
    overlayTimersRef.current = [];
  }

  function showNowServingOverlay(token: TokenWithRelations) {
    clearOverlayTimers();

    setCallOverlay({
      tokenNumber: token.tokenNumber,
      vehicle: vehicleDisplayName(token.vehicle.brand, token.vehicle.model),
      customer: showCustomerRef.current ? token.customer.name : null,
      counterName: token.counter?.name ?? counterName,
      phase: "enter",
    });

    const exitTimer = window.setTimeout(() => {
      setCallOverlay((prev) => (prev ? { ...prev, phase: "exit" } : null));
    }, OVERLAY_VISIBLE_MS);

    const hideTimer = window.setTimeout(() => {
      setCallOverlay(null);
    }, OVERLAY_VISIBLE_MS + OVERLAY_EXIT_MS);

    overlayTimersRef.current = [exitTimer, hideTimer];
  }

  // When an active token is newly called/recalled: full-screen pop + sound
  useEffect(() => {
    if (!snapshot) return;

    const signature = activeTokens
      .map(
        (t) =>
          `${t.id}|${t.calledAt ?? ""}|${t.lastRecalledAt ?? ""}|r${t.recallCount}`
      )
      .join(";");
    const key = `${signature}|rv${snapshot.recallVersion}`;

    if (!readyRef.current) {
      readyRef.current = true;
      lastAnnouncedRef.current = key;
      return;
    }

    if (key === lastAnnouncedRef.current) return;

    const previousIds = new Set(
      lastAnnouncedRef.current
        .split("|rv")[0]
        .split(";")
        .filter(Boolean)
        .map((part) => part.split("|")[0])
    );
    lastAnnouncedRef.current = key;

    if (!activeTokens.length) {
      setAnimating(false);
      setFlashLabel(false);
      pendingAnnounceRef.current = null;
      setCallOverlay(null);
      return;
    }

    const newest =
      activeTokens.find((t) => !previousIds.has(t.id)) ??
      [...activeTokens].sort(
        (a, b) =>
          new Date(b.lastRecalledAt ?? b.calledAt ?? 0).getTime() -
          new Date(a.lastRecalledAt ?? a.calledAt ?? 0).getTime()
      )[0];

    setAnimating(true);
    setFlashLabel(true);
    showNowServingOverlay(newest);

    if (unlockedRef.current) {
      notifyRef.current(newest.tokenNumber);
      pendingAnnounceRef.current = null;
    } else {
      pendingAnnounceRef.current = newest.tokenNumber;
    }

    const animTimer = window.setTimeout(() => setAnimating(false), 3000);
    const labelTimer = window.setTimeout(() => setFlashLabel(false), 4500);

    return () => {
      window.clearTimeout(animTimer);
      window.clearTimeout(labelTimer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [snapshot, activeTokens]);

  async function handleEnableSound() {
    const ok = await audio.unlock();
    if (!ok) return;
    const pending = pendingAnnounceRef.current;
    if (pending) {
      pendingAnnounceRef.current = null;
      window.setTimeout(() => {
        audio.notifyTokenCalled(pending);
      }, 400);
    }
  }

  return (
    <div className="display-grid-bg relative min-h-screen overflow-x-hidden text-white">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_18%_12%,rgba(197,164,110,0.14),transparent_40%),radial-gradient(circle_at_85%_0%,rgba(14,116,144,0.16),transparent_42%)]" />

      <div className="relative mx-auto flex min-h-screen max-w-[1600px] flex-col px-4 py-4 sm:px-6 sm:py-6 lg:px-10 lg:py-8">
        <header className="flex items-start justify-between gap-3 sm:gap-6">
          <div className="min-w-0">
            <p className="text-[10px] font-semibold uppercase tracking-[0.28em] text-[var(--brand-gold)] sm:text-sm sm:tracking-[0.35em]">
              {settings.companyName.replace(" (PVT) LTD", "")}
            </p>
            <h1 className="font-display mt-1 text-2xl font-bold tracking-wide sm:text-4xl md:text-5xl">
              TEST DRIVE
            </h1>
          </div>
          <div className="shrink-0 text-right">
            <p className="text-lg font-semibold tabular-nums sm:text-2xl md:text-3xl">
              {clock?.time ?? "--:--:--"}
            </p>
            <p className="mt-1 max-w-[9rem] text-[10px] leading-tight text-white/55 sm:max-w-none sm:text-sm">
              {clock?.date ?? "\u00A0"}
            </p>
          </div>
        </header>

        <div className="mt-4 grid flex-1 gap-4 sm:mt-6 sm:gap-6 lg:grid-cols-[1.55fr_1fr]">
          <section
            className={cn(
              "relative flex flex-col overflow-hidden rounded-3xl border border-white/10 bg-[var(--display-panel)]/85 p-5 shadow-2xl backdrop-blur sm:rounded-[2rem] sm:p-8",
              animating && "token-call-animation"
            )}
          >
            <div className="flex items-end justify-between gap-3">
              <p className="text-[10px] font-semibold uppercase tracking-[0.35em] text-white/50 sm:text-sm sm:tracking-[0.4em]">
                Now Serving
              </p>
              <p className="text-xs text-white/45 sm:text-sm">
                {activeTokens.length}/{maxConcurrent} drives
              </p>
            </div>

            {activeTokens.length ? (
              <div
                className={cn(
                  "mt-4 grid flex-1 gap-3",
                  activeTokens.length === 1
                    ? "grid-cols-1"
                    : activeTokens.length <= 4
                      ? "sm:grid-cols-2"
                      : "sm:grid-cols-2 xl:grid-cols-3"
                )}
              >
                {activeTokens.map((token) => (
                  <div
                    key={token.id}
                    className={cn(
                      "rounded-2xl border px-4 py-4 text-center",
                      flashLabel && token.id === activeTokens[activeTokens.length - 1]?.id
                        ? "border-[var(--brand-gold)] bg-[var(--brand-gold)]/15"
                        : "border-white/10 bg-white/5"
                    )}
                  >
                    <p
                      className={cn(
                        "font-display font-extrabold leading-none tracking-tight text-white",
                        activeTokens.length === 1
                          ? "text-[4.75rem] sm:text-[8rem]"
                          : "text-4xl sm:text-5xl"
                      )}
                    >
                      {token.tokenNumber}
                    </p>
                    <p className="mt-3 text-sm font-semibold uppercase tracking-[0.14em] text-[var(--brand-gold)] sm:text-base">
                      {vehicleDisplayName(
                        token.vehicle.brand,
                        token.vehicle.model
                      )}
                    </p>
                    {settings.displayShowCustomerName ? (
                      <p className="mt-1 truncate text-sm text-white/65">
                        {token.customer.name}
                      </p>
                    ) : null}
                  </div>
                ))}
              </div>
            ) : (
              <div className="flex flex-1 flex-col items-center justify-center py-10">
                <p className="font-display text-4xl text-white/25 sm:text-6xl">
                  — — —
                </p>
                <p className="mt-4 text-center text-sm text-white/40 sm:text-lg">
                  Waiting for next customer · {maxConcurrent} vehicle slots
                </p>
              </div>
            )}
          </section>

          <aside className="flex flex-col gap-4 sm:gap-5">
            <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-1">
              <Panel title="Previous Token">
                <p className="font-display text-3xl font-bold text-white/70 sm:text-5xl">
                  {previous?.tokenNumber ?? "—"}
                </p>
                {previous ? (
                  <p className="mt-2 truncate text-xs text-white/45 sm:text-sm">
                    {vehicleDisplayName(
                      previous.vehicle.brand,
                      previous.vehicle.model
                    )}
                  </p>
                ) : null}
              </Panel>

              <div className="grid grid-cols-1 gap-3 sm:hidden">
                <Panel title="Waiting">
                  <p className="font-display text-3xl font-bold">{waitingCount}</p>
                </Panel>
              </div>
            </div>

            <Panel title="Next Tokens" className="flex-1">
              {nextTokens.length > 0 ? (
                <ol className="space-y-2.5 sm:space-y-3">
                  {nextTokens.map((token, index) => (
                    <NextTokenRow
                      key={token.id}
                      token={token}
                      position={index + 1}
                      highlight={index === 0}
                    />
                  ))}
                </ol>
              ) : (
                <p className="text-base text-white/40 sm:text-lg">
                  No tokens waiting
                </p>
              )}
            </Panel>

            <div className="hidden grid-cols-2 gap-4 sm:grid">
              <Panel title="Waiting">
                <p className="font-display text-4xl font-bold sm:text-5xl">
                  {waitingCount}
                </p>
              </Panel>
              <Panel title="Active">
                <p className="font-display text-2xl font-bold leading-tight sm:text-3xl">
                  {activeTokens.length}/{maxConcurrent}
                </p>
              </Panel>
            </div>
          </aside>
        </div>

        <footer className="mt-4 flex flex-col gap-3 rounded-2xl border border-white/10 bg-black/20 px-4 py-4 sm:mt-6 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between sm:px-5">
          <p className="text-[10px] uppercase tracking-[0.2em] text-white/35 sm:text-xs sm:tracking-[0.25em]">
            Indra Traders Showroom · Live Queue Display
          </p>

          <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row">
            {!audio.unlocked ? (
              <Button
                size="lg"
                className="w-full bg-[var(--brand-gold)] text-[var(--sidebar)] hover:bg-[#d4b57d] sm:w-auto"
                onClick={() => void handleEnableSound()}
              >
                <Volume2 className="h-5 w-5" />
                Tap to Enable Sound
              </Button>
            ) : (
              <>
                <div className="flex items-center justify-center gap-2 rounded-xl bg-emerald-500/15 px-3 py-2 text-sm text-emerald-300">
                  {settings.audioNotificationEnabled ? (
                    <Volume2 className="h-4 w-4" />
                  ) : (
                    <VolumeX className="h-4 w-4" />
                  )}
                  Sound + voice on
                </div>
                <Button
                  size="lg"
                  variant="secondary"
                  className="w-full bg-white/10 text-white hover:bg-white/20 sm:w-auto"
                  onClick={() => void audio.playTestSound()}
                >
                  Test Voice
                </Button>
              </>
            )}
          </div>
        </footer>
      </div>

      {/* Full-screen Now Serving pop on Next / Recall */}
      {callOverlay ? (
        <div
          className={cn(
            "fixed inset-0 z-[80] flex items-center justify-center bg-[#07111f]/95 backdrop-blur-md",
            callOverlay.phase === "enter"
              ? "call-overlay-enter"
              : "call-overlay-exit"
          )}
          role="alertdialog"
          aria-live="assertive"
          aria-label={`Now serving token ${callOverlay.tokenNumber}`}
        >
          <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(197,164,110,0.18),transparent_55%)]" />
          <div className="relative px-6 text-center">
            <p className="text-sm font-semibold uppercase tracking-[0.4em] text-[var(--brand-gold)] sm:text-lg">
              Now Serving
            </p>
            <p
              className={cn(
                "font-display mt-4 font-extrabold leading-none tracking-tight text-white",
                "text-[7rem] sm:text-[10rem] lg:text-[14rem]",
                callOverlay.phase === "enter" && "call-token-pop"
              )}
            >
              {callOverlay.tokenNumber}
            </p>
            <p className="mt-6 text-2xl font-semibold uppercase tracking-[0.2em] text-[var(--brand-gold)] sm:text-3xl">
              Please Proceed To The Counter
            </p>
            <p className="mt-3 text-xl text-white/70 sm:text-2xl">
              {callOverlay.vehicle}
              {callOverlay.customer ? ` · ${callOverlay.customer}` : ""}
            </p>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function NextTokenRow({
  token,
  position,
  highlight,
}: {
  token: TokenWithRelations;
  position: number;
  highlight?: boolean;
}) {
  return (
    <li
      className={cn(
        "flex items-center justify-between gap-2 rounded-2xl px-3 py-2.5 sm:px-4 sm:py-3",
        highlight
          ? "border border-[var(--brand-gold)]/50 bg-[var(--brand-gold)]/10"
          : "bg-white/5"
      )}
    >
      <div className="flex min-w-0 items-center gap-3 sm:gap-4">
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-white/10 text-sm font-semibold text-white/70 sm:h-9 sm:w-9">
          {position}
        </span>
        <div className="min-w-0">
          <p className="font-display text-2xl font-bold leading-none sm:text-3xl">
            {token.tokenNumber}
          </p>
          <p className="mt-1 truncate text-xs text-white/45">
            {vehicleDisplayName(token.vehicle.brand, token.vehicle.model)}
          </p>
        </div>
      </div>
      {highlight ? (
        <span className="shrink-0 text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--brand-gold)] sm:text-xs sm:tracking-[0.18em]">
          Up Next
        </span>
      ) : null}
    </li>
  );
}

function Panel({
  title,
  children,
  className,
}: {
  title: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "rounded-2xl border border-white/10 bg-[var(--display-panel)]/75 p-4 backdrop-blur sm:rounded-3xl sm:p-6",
        className
      )}
    >
      <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-white/45 sm:text-xs sm:tracking-[0.28em]">
        {title}
      </p>
      <div className="mt-3 sm:mt-4">{children}</div>
    </div>
  );
}

function Meta({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-center sm:px-5 sm:py-4">
      <p className="text-[10px] uppercase tracking-[0.18em] text-white/45 sm:text-xs sm:tracking-[0.2em]">
        {label}
      </p>
      <p className="mt-1.5 text-base font-semibold sm:mt-2 sm:text-xl">
        {value}
      </p>
    </div>
  );
}
