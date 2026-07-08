import { cn } from "@/lib/utils";

export function LogoMark({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 72 72"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
      className={cn("size-6", className)}
    >
      <rect x="4" y="24" width="24" height="24" rx="6" className="fill-primary" />
      <rect
        x="44"
        y="24"
        width="24"
        height="24"
        rx="6"
        strokeWidth="2.5"
        className="fill-primary-bg stroke-primary"
      />
      <path d="M30 36H41" strokeWidth="3" strokeLinecap="round" className="stroke-primary" />
      <path
        d="M37 31L42 36L37 41"
        strokeWidth="3"
        strokeLinecap="round"
        strokeLinejoin="round"
        className="stroke-primary"
      />
    </svg>
  );
}

export function Logo({
  className,
  iconClassName,
  textClassName,
  showWordmark = true,
}: {
  className?: string;
  iconClassName?: string;
  textClassName?: string;
  showWordmark?: boolean;
}) {
  return (
    <div className={cn("flex items-center gap-2", className)}>
      <LogoMark className={iconClassName} />
      {showWordmark && (
        <span className={cn("font-semibold tracking-tight", textClassName)}>
          Content <span className="text-primary">Migration</span>
        </span>
      )}
    </div>
  );
}
