"use client";

import { useEffect, useState } from "react";
import { toDataURL } from "qrcode";

/** QR del código de vinculación: el comercio lo escanea y canjea el mismo texto. */
export default function AccessCodeQr({ value, size = 192 }: { value: string; size?: number }) {
  const [url, setUrl] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void toDataURL(value, {
      margin: 1,
      width: size,
      color: { dark: "#020617", light: "#ffffff" },
      errorCorrectionLevel: "M",
    }).then((data) => {
      if (!cancelled) setUrl(data);
    });
    return () => {
      cancelled = true;
    };
  }, [value, size]);

  if (!url) {
    return <div className="bg-white rounded-lg animate-pulse" style={{ width: size, height: size }} />;
  }

  return (
    <img
      src={url}
      alt={`Código QR ${value}`}
      width={size}
      height={size}
      className="bg-white rounded-lg p-1"
    />
  );
}
