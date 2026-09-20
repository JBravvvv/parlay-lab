"use client";
import { useContext } from "react";
import { QueryClient, QueryClientContext } from "@tanstack/react-query";
const idle = new QueryClient({defaultOptions:{queries:{retry:false}}});
export function useReadQueryClient(){return useContext(QueryClientContext)??idle;}
