export function BrandMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" className={className} aria-hidden="true">
      <rect width="32" height="32" rx="8" fill="#6ea8fe" />
      <rect x="7" y="6" width="7" height="13" rx="1.5" fill="#101216" />
      <rect x="18" y="13" width="7" height="13" rx="1.5" fill="#101216" />
    </svg>
  )
}
