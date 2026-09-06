"use client";
import WrongPage from "@/components/WrongPage";
export default function Error({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return <WrongPage kind="broken" detail={error.message} onRetry={reset} />;
}
