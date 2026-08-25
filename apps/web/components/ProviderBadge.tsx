"use client";

import { PROVIDER_LABELS, type Provider } from "@/lib/api";
import { useProviderDisplay } from "@/lib/providerDisplay";
import { PROVIDER_CHIP_COLOR } from "@/lib/providerColors";

export type ProviderBadgeVariant = "inline" | "stacked" | "logo-only";
export type ProviderBadgeSize = "sm" | "md" | "lg";

export function providerLabel(provider: string, override?: string): string {
  if (override?.trim()) return override.trim();
  return PROVIDER_LABELS[provider as Provider] ?? provider.replace(/_/g, " ");
}

const LOGO: Record<ProviderBadgeSize, string> = {
  sm: "w-5 h-5",
  md: "w-7 h-7",
  lg: "w-9 h-9",
};

const NAME: Record<ProviderBadgeSize, string> = {
  sm: "text-[11px] font-semibold leading-tight",
  md: "text-sm font-semibold leading-tight",
  lg: "text-base font-semibold leading-tight",
};

type Props = {
  provider: string;
  label?: string;
  variant?: ProviderBadgeVariant;
  size?: ProviderBadgeSize;
  chip?: boolean;
  className?: string;
  nameClassName?: string;
};

/**
 * Logo + color del proveedor (config admin).
 * inline: logo + nombre a la derecha · stacked: logo arriba · logo-only: solo logo (o nombre si no hay)
 */
export default function ProviderBadge({
  provider,
  label,
  variant = "inline",
  size = "md",
  chip = false,
  className = "",
  nameClassName = "",
}: Props) {
  const display = useProviderDisplay();
  const logoUrl = display.logoUrl(provider);
  const customColor = display.textColor(provider);
  const fallbackClass = display.fallbackClass(provider);
  const name = providerLabel(provider, label);
  const chipClass = PROVIDER_CHIP_COLOR[provider] || "text-surface-300 bg-surface-800 border-surface-700";

  const nameStyle = customColor ? { color: customColor } : undefined;
  const nameCls = `${NAME[size]} truncate ${customColor ? "" : fallbackClass} ${nameClassName}`.trim();

  const logo = logoUrl ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={logoUrl}
      alt=""
      className={`${LOGO[size]} object-contain flex-shrink-0 rounded-sm bg-white/90 p-0.5`}
    />
  ) : null;

  const nameEl = (
    <span className={nameCls} style={nameStyle}>
      {name}
    </span>
  );

  if (variant === "stacked") {
    return (
      <span className={`flex flex-col items-center gap-1.5 text-center min-w-0 ${className}`} title={name}>
        {logo ?? (
          <span
            className={`${LOGO[size]} rounded-md border flex items-center justify-center text-[10px] font-bold ${chipClass}`}
            style={customColor ? { color: customColor } : undefined}
          >
            {name.slice(0, 2).toUpperCase()}
          </span>
        )}
        {nameEl}
      </span>
    );
  }

  if (variant === "logo-only") {
    return (
      <span
        className={`inline-flex items-center justify-center ${chip ? `rounded-md border px-1.5 py-1 ${chipClass}` : ""} ${className}`}
        title={name}
      >
        {logo ?? nameEl}
      </span>
    );
  }

  return (
    <span
      className={`inline-flex items-center gap-2 min-w-0 ${chip ? `rounded-md border px-2 py-1 ${chipClass}` : ""} ${className}`}
      title={name}
    >
      {logo}
      {nameEl}
    </span>
  );
}
