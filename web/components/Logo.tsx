/** TESSERA mark: a tessera is one tile of a mosaic. Three tiles hold their place; the fourth has drifted out of the grid (red) and leaves a ghost where it belonged. */
export function LogoMark({ size = 28 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" fill="none" aria-hidden="true" className="shrink-0">
      <rect x="2" y="2" width="12" height="12" rx="3" fill="#f2f2f3" />
      <rect x="18" y="2" width="12" height="12" rx="3" fill="#f2f2f3" fillOpacity=".45" />
      <rect x="2" y="18" width="12" height="12" rx="3" fill="#f2f2f3" fillOpacity=".45" />
      <rect x="18.5" y="18.5" width="11" height="11" rx="2.5" stroke="#f0545a" strokeOpacity=".55" strokeDasharray="2.2 2.2" />
      <rect x="21" y="21" width="11" height="11" rx="3" fill="#f0545a" />
    </svg>
  );
}
export function Logo({ size = 28 }: { size?: number }) {
  return (<span className="flex items-center gap-2.5"><LogoMark size={size} /><span className="text-[16px] font-semibold tracking-[0.14em] text-bone">TESSERA</span></span>);
}
