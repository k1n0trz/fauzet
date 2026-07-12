"use client";

import { useCallback, useEffect, useState } from "react";
import { fetchGameCatalog, type GameCatalog } from "../../../lib/games-api";
import { errorMessage } from "../../../lib/reward-api";

export function useGameCatalog() {
  const [catalog, setCatalog] = useState<GameCatalog | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const refresh = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      setCatalog(await fetchGameCatalog());
    } catch (caught) {
      setError(errorMessage(caught));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const controller = new AbortController();

    async function load() {
      try {
        const result = await fetchGameCatalog(controller.signal);
        if (!controller.signal.aborted) setCatalog(result);
      } catch (caught) {
        if (!controller.signal.aborted) setError(errorMessage(caught));
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }

    void load();
    return () => controller.abort();
  }, []);

  return { catalog, loading, error, refresh };
}
