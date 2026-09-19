'use client';
import {usePathname} from 'next/navigation';
import {BOOKS,type BookKey} from '@/lib/sportsbook/books';
import {setSportsbook,useSportsbook} from '@/lib/sportsbook/store';
export function SportsbookSelector(){
 const book=useSportsbook();const path=usePathname();
 return <div className="mb-2 flex flex-wrap items-center gap-x-3 gap-y-2 rounded-xl border border-white/10 bg-[#111a18] px-2.5 py-1.5 sm:mb-3 sm:px-3 sm:py-1.5">
 <label className="flex items-center gap-2 text-xs font-semibold">Sportsbook<select aria-label="Sportsbook" className="min-h-9 rounded-lg border border-white/15 bg-[#18241f] px-2.5 text-[13px] text-white sm:min-h-9 sm:px-3 sm:text-sm" value={book} onChange={e=>setSportsbook(e.target.value as BookKey)}>{BOOKS.map(b=><option key={b.key} value={b.key}>{b.label}</option>)}</select></label>
 <span className="hidden text-xs text-muted sm:inline">{path==='/ledger'||path==='/builder'?'Paper cards keep their recorded book and odds. Browse current prices on Board or Parlay Builder.':path==='/calc'||path==='/season'?'Enter the odds offered by your selected book.':'Edges and grades use the selected book’s quote. Missing quote = unavailable.'}</span>
 </div>;
}
