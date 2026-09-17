'use client';
import {useSyncExternalStore} from 'react';
import {BOOKS,DEFAULT_BOOK,type BookKey} from './books';
const KEY='pl_display_sportsbook_dk_v1',EVENT='pl:sportsbook';
let memory: BookKey|undefined;
export function getSportsbook(): BookKey {if(memory)return memory;try{const v=localStorage.getItem(KEY);return BOOKS.find(b=>b.key===v)?.key??DEFAULT_BOOK;}catch{return DEFAULT_BOOK;}}
export function setSportsbook(book:BookKey){memory=book;try{localStorage.setItem(KEY,book);}catch{}window.dispatchEvent(new Event(EVENT));}
function subscribe(cb:()=>void){const storage=(e:StorageEvent)=>{if(e.key===KEY||e.key===null){memory=undefined;cb();}};window.addEventListener(EVENT,cb);window.addEventListener('storage',storage);return()=>{window.removeEventListener(EVENT,cb);window.removeEventListener('storage',storage);};}
export const useSportsbook=()=>useSyncExternalStore(subscribe,getSportsbook,()=>DEFAULT_BOOK);
