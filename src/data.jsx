// ─── Westcoast Poké Cost Intelligence — data, themes, helpers ────────────────
import { useState, useEffect } from "react";

export const LIGHT = {
  blue:"#2D6E9E", blueL:"#EBF4FA", blueDark:"#1E4F73",
  teal:"#3A9E8A", tealL:"#EAF7F4",
  coral:"#C8502A", coralL:"#FDF0EC",
  amber:"#C98B2A", amberL:"#FDF6E8",
  navy:"#111827", slate:"#374151", muted:"#9CA3AF",
  border:"#E5E7EB", bg:"#F9FAFB", card:"#FFFFFF",
  ink:"#111827", inkL:"#6B7280",
};
export const DARK = {
  blue:"#60A5D6", blueL:"#0D1E2E", blueDark:"#4A90BE",
  teal:"#4CC9B0", tealL:"#0A1E1A",
  coral:"#E87B5A", coralL:"#2A1008",
  amber:"#D4A044", amberL:"#231808",
  navy:"#F9FAFB", slate:"#D1D5DB", muted:"#6B7280",
  border:"#1F2937", bg:"#0D1117", card:"#161B22",
  ink:"#F9FAFB", inkL:"#9CA3AF",
};

export const DATA = {
  ingredients:{
    "Ahi Tuna":           [{date:"2025-12-01",price:28.50,unit:"lb",supplier:"Pacific Foods"},{date:"2026-02-20",price:34.50,unit:"lb",supplier:"Pacific Foods"},{date:"2026-05-22",price:36.80,unit:"lb",supplier:"Pacific Foods"}],
    "Albacore Tuna":      [{date:"2025-12-01",price:22.00,unit:"lb",supplier:"Pacific Foods"},{date:"2026-05-22",price:25.50,unit:"lb",supplier:"Pacific Foods"}],
    "Atlantic Salmon":    [{date:"2025-12-01",price:18.00,unit:"lb",supplier:"BC Seafood"},{date:"2026-03-08",price:21.00,unit:"lb",supplier:"BC Seafood"},{date:"2026-05-22",price:22.50,unit:"lb",supplier:"BC Seafood"}],
    "Wild Sockeye Salmon":[{date:"2025-12-01",price:24.00,unit:"lb",supplier:"BC Seafood"},{date:"2026-05-22",price:28.00,unit:"lb",supplier:"BC Seafood"}],
    "Prawn":              [{date:"2025-12-01",price:16.00,unit:"lb",supplier:"Pacific Foods"},{date:"2026-05-22",price:18.50,unit:"lb",supplier:"Pacific Foods"}],
    "Chicken":            [{date:"2025-12-01",price:8.50,unit:"lb",supplier:"Fresh Direct"},{date:"2026-05-22",price:9.20,unit:"lb",supplier:"Fresh Direct"}],
    "Sushi Rice":         [{date:"2025-12-01",price:42.00,unit:"25kg",supplier:"Asia Grocery"},{date:"2026-05-01",price:48.00,unit:"25kg",supplier:"Asia Grocery"}],
    "Avocado":            [{date:"2025-12-01",price:1.20,unit:"each",supplier:"Fresh Direct"},{date:"2026-03-15",price:2.10,unit:"each",supplier:"Fresh Direct"},{date:"2026-05-22",price:1.85,unit:"each",supplier:"Fresh Direct"}],
    "Mango":              [{date:"2026-02-01",price:1.50,unit:"each",supplier:"Fresh Direct"},{date:"2026-05-22",price:1.80,unit:"each",supplier:"Fresh Direct"}],
    "Edamame":            [{date:"2025-12-01",price:8.50,unit:"kg",supplier:"Fresh Direct"},{date:"2026-05-22",price:8.80,unit:"kg",supplier:"Fresh Direct"}],
    "Cucumber":           [{date:"2026-01-01",price:0.80,unit:"each",supplier:"Fresh Direct"},{date:"2026-05-22",price:0.90,unit:"each",supplier:"Fresh Direct"}],
    "Sesame Oil":         [{date:"2025-12-01",price:12.00,unit:"bottle",supplier:"Asia Grocery"},{date:"2026-03-10",price:13.50,unit:"bottle",supplier:"T&T"}],
    "Crab Salad":         [{date:"2025-12-01",price:14.00,unit:"kg",supplier:"Pacific Foods"},{date:"2026-05-22",price:16.50,unit:"kg",supplier:"Pacific Foods"}],
    "Pineapple":          [{date:"2025-12-01",price:3.50,unit:"each",supplier:"Fresh Direct"},{date:"2026-05-22",price:4.20,unit:"each",supplier:"Fresh Direct"}],
  },
  suppliers:{
    "Pacific Foods":  {type:"trade",contact:"",phone:"",email:"",terms:"Net 14",delivery:"Mon/Wed/Fri",notes:"Primary seafood trade account."},
    "BC Seafood":     {type:"trade",contact:"",phone:"",email:"",terms:"Net 7",delivery:"Tue/Thu",notes:"Salmon and seafood supplier."},
    "Asia Grocery":   {type:"trade",contact:"",phone:"",email:"",terms:"Net 30",delivery:"Weekly Mon",notes:"Dry goods, rice and pantry staples."},
    "Fresh Direct":   {type:"trade",contact:"",phone:"",email:"",terms:"Net 7",delivery:"Daily",notes:"Produce supplier."},
    "Costco":         {type:"retail",notes:"Bulk items when prices are right. Cash."},
    "T&T":            {type:"retail",notes:"Asian pantry items. Cash."},
    "Save-On-Foods":  {type:"retail",notes:"Backup produce. Cash."},
  },
  menu:{
    "Aloha":    {price:18.95,ing:{"Ahi Tuna":0.31,"Sushi Rice":0.22,"Avocado":0.5,"Cucumber":1,"Edamame":0.08,"Sesame Oil":0.02}},
    "Dynamite": {price:18.95,ing:{"Prawn":0.31,"Sushi Rice":0.22,"Avocado":0.5,"Cucumber":1,"Crab Salad":0.08}},
    "Teriyaki": {price:18.95,ing:{"Chicken":0.31,"Sushi Rice":0.22,"Mango":0.5,"Cucumber":1,"Crab Salad":0.08}},
    "Pacific":  {price:18.95,ing:{"Albacore Tuna":0.31,"Sushi Rice":0.22,"Pineapple":0.25,"Mango":0.25,"Crab Salad":0.08}},
    "Cascade":  {price:18.95,ing:{"Atlantic Salmon":0.31,"Sushi Rice":0.22,"Cucumber":1,"Crab Salad":0.08}},
    "Coast":    {price:18.95,ing:{"Atlantic Salmon":0.31,"Sushi Rice":0.22,"Mango":0.5,"Avocado":0.5,"Crab Salad":0.08}},
    "Chief":    {price:21.95,ing:{"Wild Sockeye Salmon":0.31,"Sushi Rice":0.22,"Edamame":0.1,"Pineapple":0.25,"Avocado":0.5}},
  },
  sales:{
    "Apr 2026":{loc1:28400,loc2:21600,mix:{"Aloha":{loc1:180,loc2:130},"Dynamite":{loc1:150,loc2:110},"Teriyaki":{loc1:120,loc2:90},"Pacific":{loc1:100,loc2:80},"Cascade":{loc1:130,loc2:100},"Coast":{loc1:110,loc2:85},"Chief":{loc1:80,loc2:60}}},
    "May 2026":{loc1:31200,loc2:23800,mix:{"Aloha":{loc1:200,loc2:145},"Dynamite":{loc1:165,loc2:120},"Teriyaki":{loc1:135,loc2:100},"Pacific":{loc1:110,loc2:88},"Cascade":{loc1:145,loc2:110},"Coast":{loc1:120,loc2:95},"Chief":{loc1:90,loc2:68}}},
  },
  locations:{ loc1:"West 8th & Cambie", loc2:"Ironwood Plaza" },
  alerts:{"Ahi Tuna":34,"Avocado":2.00,"Atlantic Salmon":22},
  receipts:[],
};

export const gL   = e => e[e.length-1]?.price||0;
export const gPct = e => e.length<2?0:((gL(e)-e[0].price)/e[0].price)*100;
export const fmt  = n => (n||0).toLocaleString("en-CA",{minimumFractionDigits:2,maximumFractionDigits:2});
export const fmtK = n => n>=1000?`$${(n/1000).toFixed(1)}k`:`$${fmt(n)}`;
export const MON  = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];

export function useBreakpoint(){
  const [w,setW]=useState(()=>typeof window!=="undefined"?window.innerWidth:1200);
  useEffect(()=>{const fn=()=>setW(window.innerWidth);window.addEventListener("resize",fn);return()=>window.removeEventListener("resize",fn);},[]);
  return { isMobile:w<640, isTablet:w>=640&&w<1024, isDesktop:w>=1024, w };
}

export function Spark({data,up,T,W=80,H=30}){
  if(!data||data.length<2) return <span style={{width:W,display:"inline-block"}}/>;
  const pp=data.map(d=>d.price),mn=Math.min(...pp),mx=Math.max(...pp),rng=mx-mn||1;
  const col=up?T.coral:T.teal;
  const pts=pp.map((p,i)=>`${(i/(pp.length-1))*W},${H-((p-mn)/rng)*(H-6)-3}`).join(" ");
  return(
    <svg width={W} height={H} style={{display:"block",flexShrink:0}}>
      <polyline points={pts} fill="none" stroke={col} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/>
      {pp.map((p,i)=>{const x=(i/(pp.length-1))*W,y=H-((p-mn)/rng)*(H-6)-3;return <circle key={i} cx={x} cy={y} r="3" fill={col}/>;} )}
    </svg>
  );
}

export function PriceChart({data,T}){
  if(!data||!data.length)return null;
  const pp=data.map(d=>d.price),dd=data.map(d=>{const dt=new Date(d.date);return `${MON[dt.getMonth()]} ${dt.getDate()}`;});
  const mn=Math.min(...pp)*0.92,mx=Math.max(...pp)*1.08;
  const W=460,H=160,pl=52,pr=16,pt=16,pb=36,iw=W-pl-pr,ih=H-pt-pb;
  const tx=i=>pl+(i/Math.max(data.length-1,1))*iw;
  const ty=p=>pt+ih-((p-mn)/(mx-mn))*ih;
  const pts=pp.map((p,i)=>`${tx(i)},${ty(p)}`).join(" ");
  const area=`M${tx(0)},${ty(pp[0])} ${pp.map((p,i)=>`L${tx(i)},${ty(p)}`).join(" ")} L${tx(pp.length-1)},${H-pb} L${tx(0)},${H-pb} Z`;
  return(
    <svg width="100%" viewBox={`0 0 ${W} ${H}`} style={{maxWidth:"100%"}}>
      <defs><linearGradient id="cg" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor={T.blue} stopOpacity="0.18"/><stop offset="100%" stopColor={T.blue} stopOpacity="0"/></linearGradient></defs>
      {[mn,(mn+mx)/2,mx].map((t,i)=><g key={i}><line x1={pl} y1={ty(t)} x2={W-pr} y2={ty(t)} stroke={T.border} strokeWidth="1" strokeDasharray="4 4"/><text x={pl-6} y={ty(t)+4} textAnchor="end" fontSize="11" fill={T.muted}>${t.toFixed(0)}</text></g>)}
      <path d={area} fill="url(#cg)"/>
      <polyline points={pts} fill="none" stroke={T.blue} strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"/>
      {pp.map((p,i)=><g key={i}><circle cx={tx(i)} cy={ty(p)} r="5" fill={T.card} stroke={T.blue} strokeWidth="2.5"/><text x={tx(i)} y={H-pb+20} textAnchor="middle" fontSize="10" fill={T.muted}>{dd[i]}</text></g>)}
    </svg>
  );
}

export const WCP_LOGO = "data:image/png;base64,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";
