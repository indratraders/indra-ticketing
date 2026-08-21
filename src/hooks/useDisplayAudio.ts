"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { speakTokenNumber } from "@/lib/utils";

/**
 * Display chime + spoken token announcements.
 * SpeechSynthesis is unlocked with a real spoken phrase on user tap
 * (required by Chrome / Safari / mobile browsers).
 */
export function useDisplayAudio(options: {
  enabled: boolean;
  ttsEnabled: boolean;
  counterName: string;
}) {
  const [unlocked, setUnlocked] = useState(false);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const unlockedRef = useRef(false);
  const optionsRef = useRef(options);
  const voicesReadyRef = useRef(false);
  optionsRef.current = options;

  const ensureContext = useCallback(async () => {
    const Ctx =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext })
        .webkitAudioContext;
    if (!audioCtxRef.current) {
      audioCtxRef.current = new Ctx();
    }
    if (audioCtxRef.current.state === "suspended") {
      await audioCtxRef.current.resume();
    }
    return audioCtxRef.current;
  }, []);

  const pickVoice = useCallback(() => {
    if (typeof window === "undefined" || !window.speechSynthesis) return null;
    const voices = window.speechSynthesis.getVoices();
    if (!voices.length) return null;
    voicesReadyRef.current = true;

    const english = voices.filter((v) =>
      v.lang.toLowerCase().startsWith("en")
    );
    const pool = english.length ? english : voices;

    // Prefer known female voices across Windows / macOS / Chrome / Android
    const femaleName =
      /(zira|samantha|victoria|karen|moira|tessa|fiona|veena|raveena|google us english female|female|woman|aria|jenny|sara|susan|hazel|linda|heather|emma|sonia)/i;

    return (
      pool.find((v) => femaleName.test(v.name) && /en(-|_)US/i.test(v.lang)) ||
      pool.find((v) => femaleName.test(v.name)) ||
      pool.find((v) => /en(-|_)US/i.test(v.lang) && v.localService) ||
      pool.find((v) => /en(-|_)GB/i.test(v.lang) && v.localService) ||
      pool.find((v) => v.lang.toLowerCase().startsWith("en")) ||
      pool[0] ||
      null
    );
  }, []);

  const playTone = useCallback(
    async (
      frequencies: number[],
      opts?: { volume?: number; gap?: number; duration?: number }
    ) => {
      const ctx = await ensureContext();
      const volume = opts?.volume ?? 0.45;
      const gap = opts?.gap ?? 0.16;
      const duration = opts?.duration ?? 0.35;
      const now = ctx.currentTime;

      frequencies.forEach((freq, i) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = "sine";
        osc.frequency.value = freq;

        const start = now + i * gap;
        const peak = Math.max(0.001, volume);
        gain.gain.setValueAtTime(0.0001, start);
        gain.gain.linearRampToValueAtTime(peak, start + 0.04);
        gain.gain.linearRampToValueAtTime(0.0001, start + duration);

        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(start);
        osc.stop(start + duration + 0.02);
      });

      const totalMs = (frequencies.length - 1) * gap * 1000 + duration * 1000;
      await new Promise((resolve) => window.setTimeout(resolve, totalMs + 80));
    },
    [ensureContext]
  );

  const speakText = useCallback(
    (text: string) =>
      new Promise<void>((resolve) => {
        if (typeof window === "undefined" || !window.speechSynthesis) {
          resolve();
          return;
        }

        const synth = window.speechSynthesis;

        const run = () => {
          try {
            // Chrome: cancel then wait briefly before speak, or speech is silent
            synth.cancel();
            window.setTimeout(() => {
              try {
                synth.resume();
                const utterance = new SpeechSynthesisUtterance(text);
                utterance.rate = 0.88;
                // Slightly higher pitch reads more clearly as female if OS voice is neutral
                utterance.pitch = 1.15;
                utterance.volume = 1;
                utterance.lang = "en-US";

                const voice = pickVoice();
                if (voice) {
                  utterance.voice = voice;
                  utterance.lang = voice.lang || "en-US";
                  // Keep natural pitch for explicitly female named voices
                  if (
                    /(zira|samantha|victoria|karen|moira|tessa|fiona|aria|jenny|sara|susan|hazel|linda|heather|emma|sonia|female)/i.test(
                      voice.name
                    )
                  ) {
                    utterance.pitch = 1.05;
                  }
                }

                let finished = false;
                const done = () => {
                  if (finished) return;
                  finished = true;
                  resolve();
                };

                utterance.onend = done;
                utterance.onerror = done;
                // Safety timeout if events never fire
                window.setTimeout(done, Math.max(4000, text.length * 180));

                synth.speak(utterance);

                // Chrome bug: utterance can stay pending forever — poke resume
                window.setTimeout(() => {
                  if (!finished) synth.resume();
                }, 250);
              } catch {
                resolve();
              }
            }, 60);
          } catch {
            resolve();
          }
        };

        if (!voicesReadyRef.current && !synth.getVoices().length) {
          const onVoices = () => {
            synth.removeEventListener("voiceschanged", onVoices);
            pickVoice();
            run();
          };
          synth.addEventListener("voiceschanged", onVoices);
          // Fallback if event never comes
          window.setTimeout(() => {
            synth.removeEventListener("voiceschanged", onVoices);
            run();
          }, 400);
          return;
        }

        run();
      }),
    [pickVoice]
  );

  const announce = useCallback(
    (tokenNumber: string) => {
      const opts = optionsRef.current;
      if (!opts.enabled || !opts.ttsEnabled) return Promise.resolve();

      const line = `${speakTokenNumber(tokenNumber)}. Please proceed to the counter.`;
      return speakText(line);
    },
    [speakText]
  );

  const notifyTokenCalled = useCallback(
    (tokenNumber: string) => {
      if (!optionsRef.current.enabled) return;
      if (!unlockedRef.current) return;

      void (async () => {
        try {
          await playTone([880, 1175, 1319], {
            volume: 0.55,
            gap: 0.18,
            duration: 0.38,
          });
        } catch {
          // continue to voice even if chime fails
        }
        // Speak after chime finishes so TTS is not interrupted
        await announce(tokenNumber);
      })();
    },
    [announce, playTone]
  );

  const unlock = useCallback(async () => {
    try {
      await ensureContext();
      pickVoice();

      // Audible spoken unlock — required so browsers allow later TTS
      await speakText("Sound enabled.");
      await playTone([784, 988], { volume: 0.5, gap: 0.14, duration: 0.28 });

      unlockedRef.current = true;
      setUnlocked(true);
      return true;
    } catch {
      unlockedRef.current = false;
      setUnlocked(false);
      return false;
    }
  }, [ensureContext, pickVoice, playTone, speakText]);

  // Preload voices + keep Chrome speech engine awake while unlocked
  useEffect(() => {
    if (typeof window === "undefined" || !window.speechSynthesis) return;

    const synth = window.speechSynthesis;
    const warmVoices = () => {
      pickVoice();
    };
    warmVoices();
    synth.addEventListener("voiceschanged", warmVoices);

    const keepAlive = window.setInterval(() => {
      if (!unlockedRef.current) return;
      if (synth.speaking) {
        synth.resume();
      }
    }, 8000);

    return () => {
      synth.removeEventListener("voiceschanged", warmVoices);
      window.clearInterval(keepAlive);
      synth.cancel();
    };
  }, [pickVoice]);

  return {
    unlocked,
    unlock,
    notifyTokenCalled,
    playTestSound: async () => {
      if (!unlockedRef.current) {
        const ok = await unlock();
        if (!ok) return false;
      }
      try {
        await playTone([880, 1175, 1319], {
          volume: 0.55,
          gap: 0.18,
          duration: 0.38,
        });
      } catch {
        // ignore
      }
      await announce("A-001");
      return true;
    },
  };
}
