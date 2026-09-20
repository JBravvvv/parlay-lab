import type { CrossLeg } from "./cross-sport";
import type { SandboxLeg } from "./ticket-math";
import type { CfbSlipLeg } from "@/components/cfb/CfbSlip";
export const crossToMlb=(l:CrossLeg):SandboxLeg=>({id:l.id,label:l.label,sub:l.sub,game:l.game,cz:l.cz,prob:l.prob,push:l.push,market:l.market,book:l.book,src:l.src,cross:l});
export const crossToFootball=(l:CrossLeg):CfbSlipLeg=>({key:l.id,gameId:`${l.sport}:${l.gameId}`,kind:l.player?"prop":"side",label:l.label,sub:`${l.sub} · ${l.game}`,cz:l.cz,prob:l.prob,push:l.push,market:l.market,marketLabel:l.market,book:l.book,player:l.player,headshot:l.headshot,pos:l.position,cross:l});
