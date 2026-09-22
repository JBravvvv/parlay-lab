/** A still from our original artwork. No playback, timers or motion fallback. */
export function VideoBackdrop({ fixed = false, scrim = false }: { fixed?: boolean; scrim?: boolean }) {
  return <div aria-hidden="true" className={`pointer-events-none ${fixed ? "fixed -z-10" : "absolute"} inset-0 overflow-hidden`}>
    {/* eslint-disable-next-line @next/next/no-img-element */}
    <img src="/media/llama-forward-20260922.jpg" alt="" className="absolute inset-0 h-full w-full object-cover" style={{filter:"hue-rotate(230deg) saturate(0.8)"}} />
    {scrim && <div className="absolute inset-0 bg-bg/75" />}
  </div>;
}
