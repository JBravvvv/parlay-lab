"use client";
import { createPortal } from "react-dom";
import { useEffect,useState,type ReactNode } from "react";
/** Fixed slips stay attached to the viewport, independent of the page density transform. */
export function ViewportPortal({children}:{children:ReactNode}){const [ready,setReady]=useState(false);useEffect(()=>setReady(true),[]);return ready?createPortal(children,document.body):children;}
