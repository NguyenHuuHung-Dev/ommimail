import {create} from 'zustand';
type UI={selectedAccount:string|null;selectedMessage:string|null;sidebar:boolean;search:string;set:(p:Partial<UI>)=>void};
export const useUI=create<UI>(set=>({selectedAccount:null,selectedMessage:null,sidebar:false,search:'',set}));
