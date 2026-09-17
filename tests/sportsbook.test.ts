import {describe,it,expect} from 'vitest';
import {valueAt} from '@/lib/sportsbook/books';
import {gradeFromEv} from '@/lib/grade';
import {priceFootballProp,priceFootballRow} from '@/lib/sportsbook/football';
import {priceMlbMoneylines,priceMlbBoard,priceMlbRow,priceMlbProp,attachBookQuotes,quoteCapture} from '@/lib/sportsbook/mlb';
import {priceLiveBoard} from '@/lib/sportsbook/useLivePrices';
import type {BoardData} from '@/engine';
import type {CfbPropRow,CfbPropQuote} from '@/lib/cfb/props-types';
const quote=(book:string,price:number,line:number|null=0.5):CfbPropQuote=>({book,title:book,price,line,dec:price>0?1+price/100:1+100/-price});
const prop={key:'g|p',player:'Player',label:'Player O 0.5',fair:.5,line:.5,status:'upcoming',kickoff:'2099-01-01',cz:quote('williamhill_us',-130),dk:quote('draftkings',120),fd:null,best:quote('draftkings',120),evCz:-11.5,grade:'F'} as unknown as CfbPropRow;
describe('sportsbook value',()=>{
 it('the same probability moves from F to S at a better actual price',()=>{expect(gradeFromEv(valueAt(.5,-130).ev)).toBe('F');expect(gradeFromEv(valueAt(.5,120).ev)).toBe('S');});
 it('rejects missing, nonfinite, or impossible inputs',()=>{for(const a of [null,0,Infinity,NaN,25])expect(valueAt(.5,a).ev).toBeNull();expect(valueAt(1.2,120).ev).toBeNull();});
 it('includes refunded push mass',()=>expect(valueAt(.5,100,.1).ev).toBeCloseTo(10));
 it('football props use selected quote and preserve the original row',()=>{const out=priceFootballProp(prop,'draftkings');expect(out.cz?.price).toBe(120);expect(out.grade).toBe('S');expect(prop.cz?.price).toBe(-130);expect(prop.grade).toBe('F');});
 it('does not substitute another book when selected book is missing',()=>{const out=priceFootballProp(prop,'betmgm');expect(out.cz).toBeNull();expect(out.grade).toBeNull();expect(out.playable).toBe(false);});
 it('different prop line requires its own probability',()=>{const r={...prop,dk:quote('draftkings',120,1.5)};expect(priceFootballProp(r,'draftkings').evCz).toBeNull();const out=priceFootballProp({...r,probabilities:{draftkings:.3}},'draftkings');expect(out.fair).toBe(.3);expect(out.evCz).toBeCloseTo(-34);expect(out.line).toBe(1.5);});
 it('preserves explicit null probability rather than falling back',()=>expect(priceFootballProp({...prop,probabilities:{draftkings:null}},'draftkings').grade).toBeNull());
 it('football spread re-evaluates the selected line including push probability',()=>{const row={...prop,market:'spread',side:'home',label:'Home -3.5',line:-3.5,fair:.5,push:0,key:'g|spread',dk:quote('draftkings',-110,-7.5)} as never;const game={status:'upcoming',start:'2099-01-01',home:{short:'Home'},away:{short:'Away'},model:{muMargin:3.5,sigma:13}} as never;const out=priceFootballRow(row,game,'draftkings');expect(out.line).toBe(-7.5);expect(out.fair).toBeLessThan(.5);expect(out.label).toContain('-7.5');});
});
const data:BoardData={categories:{ml:[{label:'Away ML',sub:'ML vs Home',prob:50,czOdds:-130,czEv:-11.54,gkey:'away@home',lkey:'ml_away',cz:-130 as never}]},parlays:[{name:'Pair',prob:25,czDec:3,legs:[{label:'Away',prop:'ML',gkey:'away@home',lkey:'ml_away'},{label:'Away',prop:'ML',gkey:'away@home',lkey:'ml_away'}]}],parlaysMixed:[],gameInfo:{'away@home':{pk:1,start:'2099-01-01',home:'Home',away:'Away'}},propBoard:[{game:'Away @ Home',gkey:'away@home',start:'2099-01-01',live:false,markets:{batter_hits:[{p:'Player',tm:'AW',ln:.5,lkey:'player|batter_hits|0.5',o:120,oBook:'DraftKings',u:-130,uBook:'Caesars',cz:{o:-130,u:110},pO:50,fO:48,books:3}]}}]};
const event={id:'one',home_team:'Home',away_team:'Away',commence_time:'2099-01-01',bookmakers:[{key:'draftkings',title:'DraftKings',last_update:'2098-12-31',markets:[{key:'h2h',outcomes:[{name:'Away',price:120},{name:'Home',price:-140}]},{key:'batter_hits',outcomes:[{name:'Over',description:'Player',point:.5,price:120},{name:'Under',description:'Player',point:.5,price:-140}]}]}]};
describe('MLB sportsbook projections',()=>{
 it('captures existing responses without changing their contents',()=>{const capture=quoteCapture();capture.capture(event);expect(capture.events.size).toBe(1);expect(event.bookmakers[0].key).toBe('draftkings');capture.clear();expect(capture.events.size).toBe(0);});
 it('joins exact games and lines, reprices tickets, leaves historical input untouched',()=>{const enriched=attachBookQuotes(data,[event],'williamhill_us');/* the fixture's cz prices are Caesars' */const out=priceMlbBoard(enriched,'draftkings');expect(out.categories.ml[0].czOdds).toBe(120);expect(out.categories.ml[0].czEv).toBeCloseTo(10);expect(out.parlays[0].czDec).toBeCloseTo(4.84);expect(out.parlays[0].czEv).toBeCloseTo(21);expect(data.categories.ml[0].czOdds).toBe(-130);expect(data.parlays[0].czDec).toBe(3);expect(out.propBoard?.[0].markets.batter_hits[0].cz?.u).toBe(-140);});
 it('unoffered tickets have no combined selected-book odds',()=>{const out=priceMlbBoard(data,'betmgm');expect(out.parlays[0].czDec).toBeNull();expect(out.parlays[0].czEv).toBeNull();});
 it('never claims a best-price fallback belongs to the selected book',()=>{const row=data.propBoard![0].markets.batter_hits[0];expect(priceMlbProp(row,'draftkings').cz).toEqual({o:120,u:null});expect(priceMlbProp(row,'betmgm').o).toBeNull();});
 it('keeps live probability anchored to the live line for each side',()=>{const b={rows:{x:{ln:2.5,pLive:.3,czAm:-120,oppAm:100,quotes:{draftkings:{o:200,u:-220}}}}} as never;const out=priceLiveBoard(b,'draftkings')!;expect(out.rows.x.evCz).toBeCloseTo(-10);expect(out.rows.x.evOpp).toBeCloseTo(1.81818);expect(out.rows.x.ln).toBe(2.5);});
});

it('supports actual saved American odds strings without guessing a book',()=>{
 const r={label:'Player',sub:'Over 0.5',prob:50,odds:'+120' as never,book:'DraftKings'};
 expect(priceMlbRow(r,'draftkings').czOdds).toBe(120);
 expect(priceMlbRow(r,'draftkings').czEv).toBeCloseTo(10);
 expect(priceMlbRow(r,'fanduel').czOdds).toBeNull();
});
it('Caesars-only display never falls back to a different book on an unavailable side',()=>{
 const r={...data.propBoard![0].markets.batter_hits[0],cz:null};
 expect(priceMlbProp(r,'williamhill_us').o).toBeNull();
});
it('normalizes an integer milestone into the identical half-line bet',()=>{
 const e={...event,bookmakers:[{...event.bookmakers[0],markets:[{key:'batter_hits_alternate',outcomes:[{name:'Over',description:'Player',point:1,price:120}]}]}]};
 expect(priceMlbBoard(attachBookQuotes(data,[e],'williamhill_us'),'draftkings').propBoard![0].markets.batter_hits[0].cz?.o).toBe(120);
});
it('does not attach quotes from an unmatched game',()=>{
 const e={...event,home_team:'Other'};
 expect(attachBookQuotes(data,[e]).bookQuotes).toEqual({});
});

it("Games moneylines use the chosen book, including Caesars, without a best-book fallback",()=>{
 const data={categories:{ml:[{label:"Team",gkey:"g",lkey:"ml_home",sub:"ML",cz:-150,czOdds:"-150",odds:"+110",book:"FanDuel",bs:105,bsBook:"DK"}]}} as unknown as BoardData;
 expect(priceMlbMoneylines(data,"williamhill_us")[0]).toMatchObject({odds:-150,cz:-150,book:"Caesars"});
 expect(priceMlbMoneylines(data,"draftkings")[0]).toMatchObject({odds:105,cz:105,book:"DraftKings"});
 expect(priceMlbMoneylines(data,"pinnacle")[0].odds).toBeUndefined();
});

it("selected price retains the original all-books comparison quote",()=>{const row=priceMlbRow({label:"Player",sub:"Over 0.5",prob:50,odds:"+120",book:"FanDuel",bs:-110,bsBook:"DK"} as never,"draftkings");expect(row.czOdds).toBe(-110);expect(row.bestDisplayOdds).toBe("+120");expect(row.bestDisplayBook).toBe("FanDuel");});
