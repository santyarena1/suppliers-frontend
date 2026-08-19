"use client";

import { useState, useCallback } from "react";

export function useToast() {
  const [toast, setToast] = useState<{ msg: string; ok: boolean } | null>(null);

  const showToast = useCallback((msg: string, ok = true) => {
    setToast({ msg, ok });
    setTimeout(() => setToast(null), 4000);
  }, []);

  return { toast, showToast };
}
