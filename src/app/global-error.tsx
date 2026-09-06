"use client";
import WrongPage from "@/components/WrongPage";
export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <html lang="en"><body style={{ margin: 0 }}><WrongPage kind="broken" detail={error.message} onRetry={reset} /></body></html>
  );
}
