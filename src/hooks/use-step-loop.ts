"use client";

import { useCallback, useEffect, useRef, useState } from "react";

// Advances a job one step at a time, looped from a `useCallback` in the
// browser -- the shape every client-side job hook (transfer, generate
// package, install package) is built on. `step` is held in a latest-ref so a
// loop already in flight keeps stepping with the caller's latest closure
// (current client/context IDs) instead of the one captured when `run` started.
export function useStepLoop<TJob>(step: (job: TJob) => Promise<TJob>, isComplete: (job: TJob) => boolean) {
  const [job, setJob] = useState<TJob | null>(null);
  const [running, setRunning] = useState(false);
  const cancelledRef = useRef(false);
  const stepRef = useRef(step);

  useEffect(() => {
    stepRef.current = step;
  }, [step]);

  useEffect(
    () => () => {
      cancelledRef.current = true;
    },
    []
  );

  const run = useCallback(
    async (initialJob: TJob) => {
      cancelledRef.current = false;
      setJob(initialJob);
      setRunning(true);
      try {
        let current = initialJob;
        while (!cancelledRef.current && !isComplete(current)) {
          current = await stepRef.current(current);
          setJob(current);
        }
      } finally {
        setRunning(false);
      }
    },
    [isComplete]
  );

  const cancel = useCallback(() => {
    cancelledRef.current = true;
  }, []);

  return { job, running, run, cancel };
}
