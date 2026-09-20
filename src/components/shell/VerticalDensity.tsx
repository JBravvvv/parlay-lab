"use client";
import { useEffect,useLayoutEffect,useRef,useState,type ReactNode } from "react";
/** Literal vertical-only 50% presentation requested by the owner. Width, source layout,
 * calculation, DOM order and keyboard semantics stay unchanged. Fixed slips use portals.
 * ResizeObserver keeps flow height matched to dynamic/filter-expanded content. */
export function VerticalDensity({children,enabled,toolbar}:{children:ReactNode;enabled:boolean;toolbar?:ReactNode}){
 const ref=useRef<HTMLDivElement>(null);const [height,setHeight]=useState<number>();const [mode,setMode]=useState("compact");
 useEffect(()=>{try{const saved=localStorage.getItem("pl:vertical-density");if(saved&&["compact","half","full"].includes(saved))setMode(saved);}catch{}},[]);
 const choose=(value:string)=>{setMode(value);try{localStorage.setItem("pl:vertical-density",value);}catch{}};
 const scale=enabled && mode==="half" ? 0.5 : 1;
 useLayoutEffect(()=>{const el=ref.current;if(!el)return;const measure=()=>setHeight(el.offsetHeight);measure();const ro=new ResizeObserver(measure);ro.observe(el);return()=>ro.disconnect();},[]);
 return <><div className="mb-2 flex items-center gap-2">{toolbar&&<div className="min-w-0 flex-1">{toolbar}</div>}{enabled&&<div className="shrink-0"><label className="text-[10px] text-muted"><span className="sr-only">Density</span><select aria-label="Vertical density" value={mode} onChange={e=>choose(e.target.value)} className="min-h-9 rounded-lg border border-white/10 bg-surface-2 px-1 text-[11px] text-text"><option value="compact">Compact</option><option value="half">50% height</option><option value="full">100% height</option></select></label></div>}</div><div data-density-scale={scale} className={enabled&&mode==="compact"?"density-compact":undefined} style={{height:scale===1||height==null?undefined:height*scale,overflow:scale===1?"visible":"clip"}}><div ref={ref} style={{transform:scale===1?undefined:`scaleY(${scale})`,transformOrigin:"top center",display:"flow-root"}}>{children}</div></div></>;
}
