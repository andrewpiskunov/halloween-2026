/** Непрерывная ярмарка. Поля необязательны в старом журнале. */
export interface DestructionScene {
 id: string; author: string; targetId: string; ref: string; saltId: string;
 status: 'pending'|'active'|'saved'|'cancelled'|'destroyed';
 startedAt?: number; endsAt?: number; wardBy?: string; participants?: string[];
}
export interface ContinuousFair {
 version: 1; refreshes: number; resupplies: number; auctionReleased: boolean;
 admissions: Record<string,{requestId:string;at:number}>;
 destruction: Record<string,DestructionScene>;
 participants?: string[]; sealedAt?: number; actionStart?: number;
}
export interface FairPlayerView {
 version:1; refreshes:number; scenes:DestructionScene[];
 admission?: {at:number}; canParticipate:boolean; participants:string[];
}
export type FairCommand =
 | {type:'fair.enable'|'fair.refresh'|'fair.resupply'|'fair.auction'|'fair.finish'}
 | {type:'fair.admit';player:string;requestId:string;at:number}
 | {type:'fair.admission.remove';player:string}
 | {type:'fair.destroy.request';itemId:string;saltId:string}
 | {type:'fair.destroy.start'|'fair.destroy.cancel'|'fair.destroy.resolve';id:string}
 | {type:'fair.destroy.ward';id:string;itemId:string};
export const FAIR_COMMAND_TYPES = {'fair.enable':true,'fair.refresh':true,'fair.resupply':true,'fair.auction':true,'fair.finish':true,'fair.admit':true,'fair.admission.remove':true,'fair.destroy.request':true,'fair.destroy.start':true,'fair.destroy.cancel':true,'fair.destroy.resolve':true,'fair.destroy.ward':true} as const;
export const newFair = ():ContinuousFair => ({version:1,refreshes:0,resupplies:0,auctionReleased:false,admissions:{},destruction:{}});
