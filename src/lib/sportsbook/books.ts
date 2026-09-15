export const BOOKS = [
 {key:'williamhill_us',label:'Caesars',short:'CZ'},
 {key:'draftkings',label:'DraftKings',short:'DK'},
 {key:'fanduel',label:'FanDuel',short:'FD'},
 {key:'betmgm',label:'BetMGM',short:'MGM'},
 {key:'betrivers',label:'BetRivers',short:'BR'},
 {key:'fanatics',label:'Fanatics',short:'FAN'},
 {key:'pinnacle',label:'Pinnacle',short:'PIN'},
] as const;
export type BookKey = typeof BOOKS[number]['key'];
export const DEFAULT_BOOK: BookKey = 'williamhill_us';
export const bookName = (key: string) => BOOKS.find(b=>b.key===key)?.label ?? key;
export function bookKey(value: string | null | undefined): string | null {
 if(!value)return null; const v=value.toLowerCase().replace(/[^a-z0-9]/g,'');
 if(['cz','czr','caesars','williamhillus'].includes(v))return DEFAULT_BOOK;
 return BOOKS.find(b=>[b.key,b.label,b.short].some(s=>s.toLowerCase().replace(/[^a-z0-9]/g,'')===v))?.key??value;
}
export function validAm(n: unknown): n is number {return typeof n==='number'&&Number.isFinite(n)&&Math.abs(n)>=100;}
export function decimal(am: number): number {return am>0?1+am/100:1+100/-am;}
export function valueAt(p: number|null|undefined, am: number|null|undefined, push=0) {
 if(p==null||!Number.isFinite(p)||p<0||p>1||!validAm(am)||!Number.isFinite(push)||push<0||push>=1||p+push>1.000001)return {ev:null,edge:null};
 return {ev:100*(p*decimal(am)+push-1),edge:100*(p/(1-push)-1/decimal(am))};
}

export function american(value:unknown):number|null {const n=typeof value==='string'&&/^[+-]?\d+(?:\.\d+)?$/.test(value.trim())?Number(value):value;return validAm(n)?n:null;}
