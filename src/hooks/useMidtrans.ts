import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";

interface MidtransConfig {
  client_key: string;
  is_sandbox: boolean;
  snap_url: string;
}

let cachedConfig: MidtransConfig | null = null;
let scriptLoaded = false;

export function useMidtrans() {
  const [isReady, setIsReady] = useState(scriptLoaded);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadMidtrans = useCallback(async () => {
    // Already loaded
    if (scriptLoaded) {
      setIsReady(true);
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      // Fetch config from edge function (cache it)
      if (!cachedConfig) {
        const { data, error: fnError } = await supabase.functions.invoke(
          "get-midtrans-config"
        );
        if (fnError) throw new Error(fnError.message);
        cachedConfig = data as MidtransConfig;
      }

      if (!cachedConfig?.client_key) {
        throw new Error("MIDTRANS_CLIENT_KEY belum dikonfigurasi");
      }

      // Load Snap.js dynamically
      await new Promise<void>((resolve, reject) => {
        // Check if script already exists
        const existing = document.querySelector(
          'script[src*="midtrans.com/snap"]'
        );
        if (existing) {
          existing.remove();
        }

        const script = document.createElement("script");
        script.src = cachedConfig!.snap_url;
        script.setAttribute("data-client-key", cachedConfig!.client_key);
        script.onload = () => {
          scriptLoaded = true;
          resolve();
        };
        script.onerror = () =>
          reject(new Error("Gagal memuat Midtrans Snap.js"));
        document.head.appendChild(script);
      });

      setIsReady(true);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setIsLoading(false);
    }
  }, []);

  return { isReady, isLoading, error, loadMidtrans };
}
