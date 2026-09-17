import type { ReactNode, ButtonHTMLAttributes } from "react";
export function IndexLabel({ index, children }: { index: string; children: ReactNode }) {
  return <span className="index-label"><span aria-hidden="true">{index}</span>{children}</span>;
}
export function Action({ children, primary = false, ...props }: ButtonHTMLAttributes<HTMLButtonElement> & { primary?: boolean }) {
  return <button {...props} className={["action", primary ? "primary" : "", props.className ?? ""].join(" ")}>{children}</button>;
}
export function Eye({ busy = false, quiet = false }: { busy?: boolean; quiet?: boolean }) {
  return <svg className={["eye", busy ? "busy" : "", quiet ? "quiet" : ""].join(" ")} viewBox="0 0 100 64" aria-hidden="true">
    <path className="eye-outline" d="M5 32Q50 -8 95 32Q50 72 5 32Z" />
    <circle className="eye-ring" cx="50" cy="32" r="20" />
    <circle className="eye-iris" cx="50" cy="32" r="12" />
    <circle className="eye-pupil" cx="50" cy="32" r="4" />
    <path className="eye-ticks" d="M50 4v7M50 53v7M20 32h8M72 32h8" />
  </svg>;
}
export function WeatherGlyph({ condition, large = false }: { condition: string; large?: boolean }) {
  return <svg viewBox="0 0 64 64" className={large ? "weather-glyph large" : "weather-glyph"} fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true">
    {(condition === "clear" || condition === "partly-cloudy") && <g><circle cx={condition === "clear" ? 32 : 23} cy={condition === "clear" ? 32 : 23} r="11" /><path d={condition === "clear" ? "M32 7v6M32 51v6M7 32h6M51 32h6M14 14l4 4M46 46l4 4M14 50l4-4M46 18l4-4" : "M23 3v5M3 23h5M9 9l4 4M38 8l-4 4"} /></g>}
    {condition !== "clear" && <path fill="var(--surface)" d="M17 44a10 10 0 0 1-1-20 15 15 0 0 1 28 3 9 9 0 1 1 3 17Z" />}
    {condition === "rain" && <path d="m23 50-3 6m15-6-3 6m15-6-3 6" />}
  </svg>;
}

