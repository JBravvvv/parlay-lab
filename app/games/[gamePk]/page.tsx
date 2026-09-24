"use client";
import { Suspense } from "react";
import { useParams, useSearchParams } from "next/navigation";
import { GameDetail } from "@/components/games/GameDetail";
function Content(){const params=useParams<{gamePk:string}>();const q=useSearchParams();return <GameDetail pk={String(params?.gamePk??"")} qDate={q.get("date")}/>;}
export default function BoxScorePage(){return <Suspense fallback={null}><Content/></Suspense>;}
