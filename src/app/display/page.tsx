"use client";

import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { PublicDisplayBoard } from "@/components/display/public-display-board";

export default function DisplayPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen items-center justify-center bg-[var(--display-bg)] text-white">
          Loading display...
        </div>
      }
    >
      <DisplayPageInner />
    </Suspense>
  );
}

function DisplayPageInner() {
  const searchParams = useSearchParams();
  const counter = searchParams.get("counter") ?? "1";
  return <PublicDisplayBoard counterCode={counter} />;
}
