import type { SerializableColor } from "../shared/types";

export function clamp(value: number, min = 0, max = 1): number {
  return Math.min(max, Math.max(min, value));
}

export function colorToDisplay(color: SerializableColor, opacity = 1): string {
  const channels = [color.r, color.g, color.b].map((channel) => Math.round(clamp(channel) * 255).toString(16).padStart(2, "0")).join("").toUpperCase();
  const alpha = clamp((color.a ?? 1) * opacity);
  return alpha < 0.995 ? `#${channels}${Math.round(alpha * 255).toString(16).padStart(2, "0").toUpperCase()}` : `#${channels}`;
}

export function paintColor(paint: SolidPaint): SerializableColor {
  return { r: paint.color.r, g: paint.color.g, b: paint.color.b, a: paint.opacity ?? 1 };
}

export function colorDistance(a: SerializableColor, b: SerializableColor): number {
  const redMean = (a.r + b.r) / 2;
  const r = (a.r - b.r) * (2 + redMean);
  const g = (a.g - b.g) * 4;
  const blue = (a.b - b.b) * (2 + 1 - redMean);
  const alpha = Math.abs((a.a ?? 1) - (b.a ?? 1)) * 2;
  return Math.sqrt(r * r + g * g + blue * blue + alpha * alpha) / 3;
}

export function relativeLuminance(color: SerializableColor): number {
  const linear = [color.r, color.g, color.b].map((channel) => {
    const value = clamp(channel);
    return value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
  });
  return linear[0] * 0.2126 + linear[1] * 0.7152 + linear[2] * 0.0722;
}

export function contrastRatio(foreground: SerializableColor, background: SerializableColor): number {
  const foregroundLum = relativeLuminance(foreground);
  const backgroundLum = relativeLuminance(background);
  return (Math.max(foregroundLum, backgroundLum) + 0.05) / (Math.min(foregroundLum, backgroundLum) + 0.05);
}

export function composite(foreground: SerializableColor, background: SerializableColor): SerializableColor {
  const alpha = clamp(foreground.a ?? 1);
  const baseAlpha = clamp(background.a ?? 1);
  const outputAlpha = alpha + baseAlpha * (1 - alpha);
  if (outputAlpha === 0) return { r: 0, g: 0, b: 0, a: 0 };
  return {
    r: (foreground.r * alpha + background.r * baseAlpha * (1 - alpha)) / outputAlpha,
    g: (foreground.g * alpha + background.g * baseAlpha * (1 - alpha)) / outputAlpha,
    b: (foreground.b * alpha + background.b * baseAlpha * (1 - alpha)) / outputAlpha,
    a: outputAlpha,
  };
}

export function solidPaint(paint: Paint | undefined): SolidPaint | undefined {
  return paint && paint.type === "SOLID" ? paint : undefined;
}
