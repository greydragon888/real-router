import { useRouter } from "@real-router/react";
import { useEffect, useRef, useState } from "react";

import type { JSX } from "react";

const WINDOW_MS = 1000;

export function ScrollMeter(): JSX.Element {
  const router = useRouter();
  const [navsPerSec, setNavsPerSec] = useState(0);
  const timestampsRef = useRef<number[]>([]);

  useEffect(() => {
    const unsubscribe = router.subscribe(() => {
      timestampsRef.current.push(performance.now());
    });

    const interval = setInterval(() => {
      const cutoff = performance.now() - WINDOW_MS;

      timestampsRef.current = timestampsRef.current.filter((t) => t >= cutoff);
      setNavsPerSec(timestampsRef.current.length);
    }, 200);

    return () => {
      unsubscribe();
      clearInterval(interval);
    };
  }, [router]);

  return (
    <div className="scroll-meter" data-testid="scroll-meter">
      <span className="scroll-meter__label">navs/sec:</span>{" "}
      <code data-testid="navs-per-sec">{navsPerSec}</code>
    </div>
  );
}
