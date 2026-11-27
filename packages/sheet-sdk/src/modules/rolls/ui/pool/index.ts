import dynamic from "next/dynamic";

/** Only a pool row needs its messages and chip renderer. */
export const PoolResult = dynamic(() => import("./pool-result").then((mod) => mod.PoolResult));
