import { useState, useRef, useEffect } from "react";
import { LIGHT, DARK, DATA, gL, gPct, fmt, fmtK, useBreakpoint, Spark, PriceChart, WCP_LOGO, ADDONS, CATALOG } from "./data.jsx";
import { supabase, isOwner } from "./supabase.js";
import { loadAll, seedIfEmpty, saveReceipt, saveSales, addPrice, deletePriceEntry, deleteIngredient, deleteSupplier, upsertSupplier, saveMenuItem, deleteMenuItem, resyncMenu, saveAlert, saveMarketChecks, loadMarketChecks, canRunToday, recordRun, loadSetting, saveSetting, scansThisMonth, recordScan, loadReceipts, deleteReceiptCascade, deleteReceiptByKey, renameIngredientInPrices, loadDiscovered, saveDiscovered, saveIngredientFlags, saveCustomIngredients } from "./db.js";
import Login from "./Login.jsx";
import * as XLSX from "xlsx";

// All Claude calls go through the anthropic-proxy Edge Function — the API key
// lives only in Supabase secrets, never in this bundle.
const claudeFetch = async (body) => {
  const { data:{ session } } = await supabase.auth.getSession();
  return fetch("https://yjknlosqeqjslxzxzyys.supabase.co/functions/v1/anthropic-proxy", {
    method:"POST",
    headers:{ "Content-Type":"application/json", Authorization:`Bearer ${session?.access_token||""}` },
    body:JSON.stringify(body),
  });
};
const MODEL="claude-haiku-4-5-20251001"; // TESTING: cheapest model for MVP cost trial — revert to "claude-sonnet-4-6" if scan/insights quality drops
// TEMPORARY: 6 web searches per discovery run while testing (reaches toward 25 results).
// Pull back to 2 before launch to cap per-click cost (~$0.02).
const DISCOVERY_MAX_USES=6;
// Dedup key for the discovered-suppliers catalog: name + city + normalized street,
// so chain branches with different streets stay distinct but re-discoveries collapse.
const normStreet=s=>String(s||"").toLowerCase()
  .replace(/\bavenue\b/g,"ave").replace(/\bstreet\b/g,"st").replace(/\broad\b/g,"rd").replace(/\bboulevard\b/g,"blvd")
  .replace(/\bwest\b/g,"w").replace(/\beast\b/g,"e").replace(/\bnorth\b/g,"n").replace(/\bsouth\b/g,"s")
  .replace(/[^a-z0-9]/g,"");
const dedupKey=(name,city,street)=>[String(name||"").toLowerCase().trim(),String(city||"").toLowerCase().trim(),normStreet(street)].join("|");

// Extract the model's JSON from an API response. With the web-search tool the content
// array holds several blocks ([preamble text] → [tool use] → [tool result] → [final JSON text]),
// so grabbing the first text block fails. Walk text blocks newest-first and parse the {...} slice.
const pickJson=(out)=>{
  const texts=(out?.content||[]).filter(b=>b.type==="text").map(b=>b.text||"");
  for(let k=texts.length-1;k>=0;k--){
    const t=texts[k].replace(/```json|```/g,"");
    const s=t.indexOf("{"),e=t.lastIndexOf("}");
    if(s!==-1&&e>s){try{return JSON.parse(t.slice(s,e+1));}catch{}}
  }
  const all=texts.join("\n").replace(/```json|```/g,"");
  const s=all.indexOf("{"),e=all.lastIndexOf("}");
  if(s!==-1&&e>s)return JSON.parse(all.slice(s,e+1));
  throw new Error("No JSON in model response");
};

// Receipt categories. Food categories feed the cost tracker; the rest are kept in the
// downloadable parsed dataset but never counted in food cost or profitability.
const RECEIPT_CATS=["Protein","Base","Vegetables","Fruit","Sauces","Toppings","Packaging","Drinks","Cleaning","Equipment","Other"];
const COGS_CATS=new Set(["Protein","Base","Vegetables","Fruit","Sauces","Toppings","Drinks"]);
const isCOGSCat=c=>COGS_CATS.has(c||"Other");

// (a) taxonomy alignment: a receipt line that matches a known catalogue ingredient inherits
// that ingredient's catalogue category and is always treated as food (tracked).
const CATALOG_BY_NAME=(()=>{const m={};CATALOG.forEach(c=>{m[c.name.toLowerCase()]=c;});return m;})();
// Prepared/made-in-house categories: excluded from live price checks by default
// (you buy their raw inputs, not the prepared item itself).
const PREPARED_CATS=new Set(["Preparation","Prepared protein","Prepared side","Prepared topping","Sauce / dressing","Pickled / fermented"]);
// Market tracking is opt-in: every ingredient defaults to UNTICKED and the user
// picks what matters. Prepared-cat awareness kept only for tooltips/copy.
const defaultCheck=()=>false;
// Hardcoded location postal codes for geo-based searches (verified from Google listings)
const POSTCODES={loc1:"V5Y 3Z5",loc2:"V7A 5J3"};
const catalogMatch=name=>CATALOG_BY_NAME[String(name||"").trim().toLowerCase()]||null;
const alignLine=it=>{const m=catalogMatch(it.ingredient);if(m)return{...it,category:m.cat,matched:true,food:true};return{...it,matched:false,food:isCOGSCat(it.category)};};


const NavIcon=({id,size=22})=>{
  const p={fill:"none",stroke:"currentColor",strokeWidth:1.8,strokeLinecap:"round",strokeLinejoin:"round"};
  if(id==="dashboard")return(<svg width={size} height={size} viewBox="0 0 24 24"><polyline points="3.5,17.5 9,12 13,15 20,7" {...p}/><polyline points="15,7 20,7 20,12" {...p}/><line x1="3.5" y1="21" x2="20.5" y2="21" {...p} opacity="0.45"/></svg>);
  if(id==="sales")return(<svg width={size} height={size} viewBox="0 0 24 24"><line x1="12" y1="2.5" x2="12" y2="21.5" {...p}/><path d="M16.5 6.5H10a3.25 3.25 0 0 0 0 6.5h4a3.25 3.25 0 0 1 0 6.5H7" {...p}/></svg>);
  if(id==="menu")return(<svg width={size} height={size} viewBox="0 0 24 24"><path d="M3.5 12.5h17a8.5 6.5 0 0 1-17 0z" {...p}/><line x1="6.5" y1="9.5" x2="17" y2="3.5" {...p}/><line x1="9.5" y1="10" x2="19.5" y2="5" {...p}/></svg>);
  if(id==="suppliers")return(<svg width={size} height={size} viewBox="0 0 24 24"><path d="M6 2.5h12v19l-2-1.6-2 1.6-2-1.6-2 1.6-2-1.6-2 1.6z" {...p}/><line x1="9" y1="7.5" x2="15" y2="7.5" {...p}/><line x1="9" y1="11" x2="15" y2="11" {...p}/><line x1="9" y1="14.5" x2="13" y2="14.5" {...p}/></svg>);
  if(id==="insights")return(<svg width={size} height={size} viewBox="0 0 24 24"><path d="M10 3.5l1.6 4.4L16 9.5l-4.4 1.6L10 15.5l-1.6-4.4L4 9.5l4.4-1.6z" {...p}/><path d="M18 13l0.9 2.3L21 16.2l-2.1 0.9L18 19.4l-0.9-2.3-2.1-0.9 2.1-0.9z" {...p}/><path d="M17.5 3.5l0.6 1.6 1.6 0.6-1.6 0.6-0.6 1.6-0.6-1.6-1.6-0.6 1.6-0.6z" {...p}/></svg>);
  return null;
};

// Header action icons — SVG only, no emoji (refresh=update/time, camera, moon/sun, door+arrow)
const HdrIcon=({id,size=20})=>{
  const p={fill:"none",stroke:"currentColor",strokeWidth:1.8,strokeLinecap:"round",strokeLinejoin:"round"};
  if(id==="refresh")return(<svg width={size} height={size} viewBox="0 0 24 24"><path d="M20 12a8 8 0 1 1-2.34-5.66" {...p}/><polyline points="20,4 20,8 16,8" {...p}/><polyline points="12,8 12,12 15,14" {...p}/></svg>);
  if(id==="camera")return(<svg width={size} height={size} viewBox="0 0 24 24"><path d="M4 8h3l1.5-2h7L17 8h3a1.5 1.5 0 0 1 1.5 1.5v9A1.5 1.5 0 0 1 20 20H4a1.5 1.5 0 0 1-1.5-1.5v-9A1.5 1.5 0 0 1 4 8z" {...p}/><circle cx="12" cy="13" r="3.4" {...p}/></svg>);
  if(id==="moon")return(<svg width={size} height={size} viewBox="0 0 24 24"><path d="M20 14.5A8 8 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5z" {...p}/></svg>);
  if(id==="sun")return(<svg width={size} height={size} viewBox="0 0 24 24"><circle cx="12" cy="12" r="4" {...p}/><g {...p}><line x1="12" y1="2.5" x2="12" y2="5"/><line x1="12" y1="19" x2="12" y2="21.5"/><line x1="2.5" y1="12" x2="5" y2="12"/><line x1="19" y1="12" x2="21.5" y2="12"/><line x1="5.2" y1="5.2" x2="6.9" y2="6.9"/><line x1="17.1" y1="17.1" x2="18.8" y2="18.8"/><line x1="18.8" y1="5.2" x2="17.1" y2="6.9"/><line x1="6.9" y1="17.1" x2="5.2" y2="18.8"/></g></svg>);
  if(id==="signout")return(<svg width={size} height={size} viewBox="0 0 24 24"><path d="M14 4h4a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-4" {...p}/><line x1="4" y1="12" x2="15" y2="12" {...p}/><polyline points="11,8 15,12 11,16" {...p}/></svg>);
  return null;
};

export default function App(){
  const [dark,setDark]=useState(()=>{try{return localStorage.getItem("wp_dark")==="1";}catch{return false;}});
  useEffect(()=>{try{localStorage.setItem("wp_dark",dark?"1":"0");}catch{}},[dark]);
  const T=dark?DARK:LIGHT;
  const {isMobile,isDesktop}=useBreakpoint();

  // ── auth ──
  const [session,setSession]=useState(undefined); // undefined = loading
  useEffect(()=>{
    supabase.auth.getSession().then(({data})=>setSession(data.session));
    const {data:sub}=supabase.auth.onAuthStateChange((_e,s)=>setSession(s));
    return ()=>sub.subscription.unsubscribe();
  },[]);
  const signOut=()=>supabase.auth.signOut();

  // ── load data from database once signed in ──
  const [dbLoading,setDbLoading]=useState(false);
  useEffect(()=>{
    if(!session||!isOwner(session.user?.email))return;
    let cancelled=false;
    (async()=>{
      setDbLoading(true);
      try{
        await seedIfEmpty();
        const d=await loadAll();
        if(!cancelled)setData(d);
        const mk=await loadMarketChecks();
        if(!cancelled)setMarket(mk);
        const tgt=await loadSetting(`target_${new Date().getFullYear()}`,null);
        if(!cancelled)setYearTarget(typeof tgt==="number"&&tgt>0?tgt:null);
        const st=await loadSetting("search_terms",{});
        if(!cancelled)setSearchTerms(st&&typeof st==="object"?st:{});
        const ms=await loadSetting("market_samples",{});
        if(!cancelled)setMarketSamples(ms&&typeof ms==="object"?ms:{});
        if(!cancelled)await refreshCaps();
      }catch(e){console.error("DB load failed",e);}
      if(!cancelled)setDbLoading(false);
    })();
    return()=>{cancelled=true;};
  },[session]);

  const [data,setData]=useState(DATA);
  const [yearTarget,setYearTarget]=useState(null);
  const saveYearTarget=async v=>{
    const n=Number(v);
    if(!n||n<=0){say("Enter a target above zero",true);return;}
    setYearTarget(n);
    try{await saveSetting(`target_${new Date().getFullYear()}`,n);say("Year target saved");}
    catch(e){console.error(e);say("Couldn't save target",true);}
  };
  const [tab,setTab]=useState(()=>{try{const t=localStorage.getItem("wp_tab");return["dashboard","sales","scan","suppliers","menu","insights"].includes(t)?t:"dashboard";}catch{return "dashboard";}});
  const [loc,setLoc]=useState(()=>{try{const l=localStorage.getItem("wp_loc");return["all","loc1","loc2"].includes(l)?l:"all";}catch{return "all";}});
  useEffect(()=>{try{localStorage.setItem("wp_tab",tab);localStorage.setItem("wp_loc",loc);}catch{}},[tab,loc]);
  const [toast,setToast]=useState(null);
  const [modal,setModal]=useState(null);
  const [tip,setTip]=useState(null);
  const [replacing,setReplacing]=useState(false);
  const tipBelow=text=>({onMouseEnter:e=>{const r=e.currentTarget.getBoundingClientRect();setTip({text,x:r.left+r.width/2,y:r.bottom+6,side:"below"});},onMouseLeave:()=>setTip(null)});
  const tipRight=text=>({onMouseEnter:e=>{const r=e.currentTarget.getBoundingClientRect();setTip({text,x:r.right+8,y:r.top+r.height/2,side:"right"});},onMouseLeave:()=>setTip(null)});
  const [selIng,setSelIng]=useState(null);
  const [selSup,setSelSup]=useState(null);
  const [img,setImg]=useState(null);
  const [scanning,setScanning]=useState(false);
  const [scanRes,setScanRes]=useState(null);
  const [checks,setChecks]=useState({});
  const [chkIng,setChkIng]=useState(null);
  const [chkAll,setChkAll]=useState(false);
  const [scanLoc,setScanLoc]=useState("all");
  const [insightsStale,setInsightsStale]=useState(false);
  const [market,setMarket]=useState({});
  const [caps,setCaps]=useState({});
  // ── Item 6: per-ingredient search terms (pack size included) + market sample log ──
  const [searchTerms,setSearchTerms]=useState({});
  const saveSearchTerm=async(name,term)=>{
    const next={...searchTerms};
    if(term&&term.trim())next[name]=term.trim();else delete next[name];
    setSearchTerms(next);
    try{await saveSetting("search_terms",next);}catch(e){console.error(e);say("Couldn't save search term",true);}
  };
  const [marketSamples,setMarketSamples]=useState({});
  // ── Items 9+11: paid actions go through arm (confirm w/ last-updated) → countdown (free cancel) → run ──
  const [arm,setArm]=useState(null);      // {label,secs,lastAt,fn}
  const [pending,setPending]=useState(null); // {label,remain,fn}
  const armPaid=cfg=>setArm(cfg);
  useEffect(()=>{
    if(!pending)return;
    if(pending.remain<=0){const fn=pending.fn;setPending(null);fn();return;}
    const t=setTimeout(()=>setPending(p=>p?{...p,remain:p.remain-1}:null),1000);
    return()=>clearTimeout(t);
  },[pending]);
  const refreshCaps=async()=>{
    const out={};
    for(const a of ["price_check","discovery","preferred_refresh"]){out[a]=await canRunToday(a);}
    setCaps(out);
  };
  const reload=async()=>{try{const d=await loadAll();setData(d);setInsightsStale(true);}catch(e){console.error(e);}};
  const [aiInsights,setAiInsights]=useState(()=>{try{return JSON.parse(localStorage.getItem("wp_insights"))?.insights||null;}catch{return null;}});
  const [insightsDate,setInsightsDate]=useState(()=>{try{return JSON.parse(localStorage.getItem("wp_insights"))?.generatedAt||null;}catch{return null;}});
  const [loadingInsights,setLoadingInsights]=useState(false);
  const [insightChat,setInsightChat]=useState([]);
  const [chatInput,setChatInput]=useState("");
  const [chatLoading,setChatLoading]=useState(false);
  const fileRef=useRef(null);

  const say=(msg,err)=>{setToast({msg,err});setTimeout(()=>setToast(null),4000);};

  // ── computed ──
  const normPrice=(price,unit)=>{
    const m=/^(\d+(?:\.\d+)?)\s*(kg|g|l|ml|lb|oz)$/i.exec((unit||"").trim());
    if(!m)return price;
    const n=parseFloat(m[1]);
    return n>0?price/n:price;
  };
  const gIL=n=>{const e=data.ingredients[n];if(!e||!e.length)return 0;const last=e[e.length-1];return normPrice(last.price,last.unit);};
  const MNC=["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
  const gILAtApp=(n,monthKey)=>{
    const e=data.ingredients[n];if(!e||!e.length)return 0;
    const mi=MNC.indexOf(monthKey.split(" ")[0]);const y=parseInt(monthKey.split(" ")[1]);
    if(mi<0||!y)return gIL(n);
    const cutoff=new Date(y,mi+1,0).getTime();
    const valid=e.filter(x=>new Date(x.date).getTime()<=cutoff);
    if(!valid.length)return 0;
    const last=valid[valid.length-1];return normPrice(last.price,last.unit);
  };
  const SIZES=["small","medium","large"];
  const isBowl=m=>!m.category||m.category==="classic"||m.category==="byo";
  const ingFor=(m,sz)=>m.ing?.[sz]||m.ing?.medium||m.ing||{};
  const priceFor=(m,sz)=>m.sizes?.[sz]??m.price??0;
  const costSz=(item,sz)=>{const m=data.menu[item];if(!m)return 0;return Object.entries(ingFor(m,sz)).reduce((s,[i,q])=>s+gIL(i)*q,0);};
  const costSzAt=(item,sz,monthKey)=>{const m=data.menu[item];if(!m)return 0;return Object.entries(ingFor(m,sz)).reduce((sum,[i,q])=>sum+gILAtApp(i,monthKey)*q,0);};

  const months=Object.keys(data.sales).sort((a,b)=>new Date(a)-new Date(b));

  // ── Sales mix model: mix.bowls[bowl][size]={loc1,loc2} units · mix.other[item]={loc1,loc2} ──
  const bowlUnits=(mon,bowl,sz,l)=>{const v=data.sales[mon]?.mix?.bowls?.[bowl]?.[sz];if(!v)return 0;return l==="loc1"?(v.loc1||0):l==="loc2"?(v.loc2||0):((v.loc1||0)+(v.loc2||0));};
  const sizeAgg=(mon,l)=>{const b=data.sales[mon]?.mix?.bowls||{};const o={small:0,medium:0,large:0};Object.keys(b).forEach(bw=>SIZES.forEach(sz=>{o[sz]+=bowlUnits(mon,bw,sz,l);}));return o;};
  const bowlUnitsTotal=(mon,bowl,l)=>SIZES.reduce((s,sz)=>s+bowlUnits(mon,bowl,sz,l),0);
  const totalBowls=(mon,l)=>{const a=sizeAgg(mon,l);return a.small+a.medium+a.large;};

  // Blended weighting derives from the most recent month with bowl counts (fallback 25/50/25)
  const derivedMix=(()=>{for(let i=months.length-1;i>=0;i--){const a=sizeAgg(months[i],"all");if(a.small+a.medium+a.large>0)return a;}return{small:25,medium:50,large:25};})();
  const mixW=()=>{const t=(derivedMix.small||0)+(derivedMix.medium||0)+(derivedMix.large||0)||1;return{small:(derivedMix.small||0)/t,medium:(derivedMix.medium||0)/t,large:(derivedMix.large||0)/t};};

  const blendedPrice=item=>{const m=data.menu[item];if(!m)return 0;const w=mixW();return SIZES.reduce((s,sz)=>s+priceFor(m,sz)*w[sz],0);};
  const bCost=item=>{const m=data.menu[item];if(!m)return 0;const w=mixW();return SIZES.reduce((s,sz)=>s+costSz(item,sz)*w[sz],0);};
  const bCostAtApp=(item,monthKey)=>{const w=mixW();return SIZES.reduce((s,sz)=>s+costSzAt(item,sz,monthKey)*w[sz],0);};
  const bFCP=item=>{const p=blendedPrice(item);if(!p)return 0;return(bCost(item)/p)*100;};
  const bMargin=item=>{const p=blendedPrice(item);if(!p)return 0;return((p-bCost(item))/p)*100;};

  const movers=Object.entries(data.ingredients).map(([n,e])=>({n,ch:gPct(e),lat:gL(e),unit:e[0]?.unit,entries:e})).sort((a,b)=>Math.abs(b.ch)-Math.abs(a.ch)).slice(0,8);
  const activeAlerts=Object.entries(data.alerts).filter(([i,t])=>{const e=data.ingredients[i];return e&&e.length&&gL(e)>t;});
  const locName=l=>l==="loc1"?data.locations.loc1:l==="loc2"?data.locations.loc2:"All Locations";

  // Total sales $ is entered manually per location. Bowl revenue is derived from counts × size price.
  const cRev=(mon,l)=>{const s=data.sales[mon];if(!s)return 0;if(l==="loc1")return s.loc1||0;if(l==="loc2")return s.loc2||0;return(s.loc1||0)+(s.loc2||0);};
  const cBowlRev=(mon,l)=>{const bowls=Object.keys(data.sales[mon]?.mix?.bowls||{});return bowls.reduce((t,bw)=>t+SIZES.reduce((s,sz)=>s+bowlUnits(mon,bw,sz,l)*priceFor(data.menu[bw]||{},sz),0),0);};
  const cCOGS=(mon,l)=>{const bowls=Object.keys(data.sales[mon]?.mix?.bowls||{});return bowls.reduce((t,bw)=>t+SIZES.reduce((s,sz)=>s+bowlUnits(mon,bw,sz,l)*costSz(bw,sz),0),0);}; // bowl food cost $ (add-ons excluded)
  const cOtherRev=(mon,l)=>Math.max(0,cRev(mon,l)-cBowlRev(mon,l)); // derived: drinks, add-ons, extras

  const latMon=months[months.length-1];
  const prevMon=months[months.length-2];
  const locKey=loc==="all"?"all":loc;
  const rev=latMon?cRev(latMon,locKey):0;
  const bowlRev=latMon?cBowlRev(latMon,locKey):0;
  const otherRev=latMon?cOtherRev(latMon,locKey):0;
  const cogs=latMon?cCOGS(latMon,locKey):0;
  const bowlsSold=latMon?totalBowls(latMon,locKey):0;
  const gp=bowlRev-cogs;                       // bowl gross profit
  const fcp=bowlRev?(cogs/bowlRev)*100:0;       // bowl food cost %
  const avgBowl=bowlsSold?bowlRev/bowlsSold:0;
  const prevRev=prevMon?cRev(prevMon,locKey):0;
  const revDelta=prevRev?((rev-prevRev)/prevRev)*100:0;
  const prevBowlRev=prevMon?cBowlRev(prevMon,locKey):0;
  const prevCogs=prevMon?cCOGS(prevMon,locKey):0;
  const prevFcp=prevBowlRev?(prevCogs/prevBowlRev)*100:0;
  const fcpDelta=prevFcp?fcp-prevFcp:0;
  const hasData=!!latMon&&bowlsSold>0;

  // ── Year-to-date rollup. Food cost/profit only count months with bowl mix data,
  // so mix-less months (totals entered, no counts) don't dilute the percentages. ──
  const ytd=(()=>{
    const yr=String(new Date().getFullYear());
    const yms=months.filter(m=>m.split(" ")[1]===yr);
    if(!yms.length)return null;
    const mms=yms.filter(m=>totalBowls(m,"all")>0);
    const sum=(fn,l,list)=>list.reduce((s,m)=>s+fn(m,l),0);
    const per=(fn,list)=>({all:sum(fn,"all",list),loc1:sum(fn,"loc1",list),loc2:sum(fn,"loc2",list)});
    const sales=per(cRev,yms),cogsY=per(cCOGS,mms),bowlY=per(cBowlRev,mms),otherY=per(cOtherRev,yms);
    const gpY={all:bowlY.all-cogsY.all,loc1:bowlY.loc1-cogsY.loc1,loc2:bowlY.loc2-cogsY.loc2};
    const pct=l=>bowlY[l]?(cogsY[l]/bowlY[l])*100:0;
    return{year:yr,nAll:yms.length,nMix:mms.length,sales,cogs:cogsY,gp:gpY,other:otherY,fcp:{all:pct("all"),loc1:pct("loc1"),loc2:pct("loc2")}};
  })();

  const worstBowl=Object.entries(data.menu).filter(([,m])=>isBowl(m)).map(([n])=>({n,fcp:bFCP(n)})).sort((a,b)=>b.fcp-a.fcp)[0];
  const biggestMover=movers[0];
  const driverPhrase=(()=>{
    if(biggestMover&&Math.abs(biggestMover.ch)>=8)return `${biggestMover.n} ${biggestMover.ch>0?"up":"down"} ${Math.abs(biggestMover.ch).toFixed(0)}% is your biggest cost mover`;
    if(worstBowl&&worstBowl.fcp>30)return `${worstBowl.n} is your thinnest bowl at ${worstBowl.fcp.toFixed(0)}% food cost`;
    return null;
  })();
  const headline=!hasData
    ?{pre:"Ready when ",em:"you are.",sub:"Enter a month's total sales and upload your bowl counts to see your margins.",color:T.blue}
    :fcp>35
    ?{pre:"Margins are ",em:"under pressure.",sub:`Bowls keep just ${(100-fcp).toFixed(0)}¢ of every dollar — food cost ${fcp.toFixed(1)}%, above the 30% line.${driverPhrase?" "+driverPhrase+".":""}`,color:T.coral}
    :fcp>30
    ?{pre:"Margins are ",em:"tightening.",sub:`Food cost is ${fcp.toFixed(1)}%, a touch above the 30% target.${driverPhrase?" "+driverPhrase+".":""}`,color:T.amber}
    :{pre:"Margins are ",em:"healthy.",sub:`Bowls keep ${(100-fcp).toFixed(0)}¢ of every dollar${fcpDelta?`, ${fcpDelta<0?"better":"tighter"} than last month`:""} — food cost ${fcp.toFixed(1)}%.${driverPhrase?" "+driverPhrase+".":""}`,color:T.teal};

  const actions=[
    {icon:"📷",title:"Scan a new receipt",body:"Snap a supplier invoice and AI auto-extracts line items and updates your cost database.",cta:"Open scanner",fn:()=>setTab("scan"),color:T.blue},
    biggestMover&&biggestMover.ch>10?{icon:"🔺",title:`Renegotiate ${biggestMover.n}`,body:`Up ${biggestMover.ch.toFixed(1)}% since tracking began. Check the market to see if alternate suppliers could save money.`,cta:"Check prices",fn:()=>{setSelIng(biggestMover.n);setTab("menu");},color:T.coral}:null,
    worstBowl&&worstBowl.fcp>30?{icon:"💡",title:`Review ${worstBowl.n} pricing`,body:`Food cost is ${worstBowl.fcp.toFixed(1)}% on this bowl — above the 30% target. A modest price increase would recover margin.`,cta:"View menu costs",fn:()=>setTab("sales"),color:T.amber}:null,
  ].filter(Boolean);

  // ── scan ──
  const onFile=e=>{
    const f=e.target.files[0];if(!f)return;
    const isPdf=f.type==="application/pdf"||f.name.toLowerCase().endsWith(".pdf");
    const r=new FileReader();
    r.onload=ev=>setImg({b64:ev.target.result.split(",")[1],prev:isPdf?null:ev.target.result,name:f.name,isPdf,mime:isPdf?"application/pdf":(f.type||"image/jpeg")});
    r.readAsDataURL(f);
  };

  const doScan=async()=>{
    if(!img)return;
    const used=await scansThisMonth();
    if(used>=250){say("Monthly scan limit (250) reached — resets on the 1st",true);return;}
    setScanning(true);setScanRes(null);
    try{
      const fileBlock=img.isPdf
        ?{type:"document",source:{type:"base64",media_type:"application/pdf",data:img.b64}}
        :{type:"image",source:{type:"base64",media_type:img.mime||"image/jpeg",data:img.b64}};
      const knownList=[...new Set([...CATALOG.map(c=>c.name),...Object.keys(data.ingredients)])].sort((a,b)=>a.localeCompare(b)).join(", ");
      const prompt='Parse this supplier receipt or invoice for a poke restaurant in Vancouver. Return ONLY JSON no markdown: {"supplier":"name or Unknown","date":"YYYY-MM-DD","invoice_number":"as printed, or empty","gross_total":0.00,"invoice_total":0.00,"items":[{"ingredient":"canonical name","category":"CATEGORY","known":true,"price":0.00,"unit":"lb","quantity":1,"line_total":0.00}]}.\n'
        +'invoice_number = the invoice or receipt number exactly as printed (letters and digits). If none is shown, use an empty string — never invent one.\n'
        +'This business already tracks these ingredients (its master list): '+knownList+'.\n'
        +'For each purchased line: strip pack size, weight, grade, brand, and marketing words, then map it to the SINGLE closest name on the master list above and return that exact name with "known":true. Example: "AHI TUNA SAKU 6OZ GRADE-A FROZEN" -> "Ahi Tuna". If a line clearly does not match anything on the list, return a short clean generic name (no descriptors) with "known":false so the user can decide whether to add it. Do not invent a match — when unsure, use "known":false.\n'
        +'category = the single best fit from exactly this list: Protein, Base, Vegetables, Fruit, Sauces, Toppings, Packaging, Drinks, Cleaning, Equipment, Other.\n'
        +'gross_total = the pre-tax subtotal shown on the receipt. invoice_total = the final total actually paid (after tax). price = UNIT price. quantity = units bought. line_total = quantity x unit price as shown. If a total is not printed, use null. Do not add taxes into line items. If unreadable: {"error":"Cannot read receipt clearly"}';
      const res=await claudeFetch({model:MODEL,max_tokens:1100,messages:[{role:"user",content:[fileBlock,{type:"text",text:prompt}]}]});
      const out=await res.json();
      if(!res.ok){
        const apiMsg=out?.error?.message||`API error ${res.status}`;
        say(apiMsg.slice(0,120),true);
        setScanning(false);
        return;
      }
      const parsed=pickJson(out);
      if(parsed.error){say(parsed.error,true);}
      else{
        recordScan(session?.user?.email).catch(()=>{});
        parsed.items=(parsed.items||[]).map(it=>{
          const a=alignLine(it);
          const tracked=!a.matched&&data.ingredients[it.ingredient]!=null;
          return {...a,tracked,isNew:!a.matched&&!tracked&&a.food,state:a.food?"food":"nonfood"};
        });
        const fp=`${parsed.supplier}|${parsed.date}|${parsed.items?.length}`;
        const invKey=parsed.invoice_number?`${String(parsed.supplier||"").toLowerCase().trim()}|${String(parsed.invoice_number).toLowerCase().trim()}`:null;
        const isDup=(invKey&&(data.receiptInvoices||[]).includes(invKey))||(data.receipts||[]).includes(fp);
        if(isDup){setModal(parsed);}
        else{setScanRes(parsed);say(`Found ${parsed.items?.length||0} items on receipt`);}
      }
    }catch(e){say("Could not parse receipt — try a clearer photo",true);}
    setScanning(false);
  };

  const okScan=async(r=null)=>{
    const result=r||scanRes;if(!result?.items)return;
    const u=JSON.parse(JSON.stringify(data)),d=result.date||new Date().toISOString().slice(0,10);
    // Only food-category lines enter the cost tracker. Non-food lines (packaging, cleaning,
    // equipment, other) stay in the downloadable parsed receipt but never touch food cost.
    const foodItems=result.items.filter(it=>it.state?it.state==="food":(it.food!==undefined?it.food:isCOGSCat(it.category)));
    const excluded=result.items.length-foodItems.length;
    let saved=0;
    foodItems.forEach(it=>{
      if(!u.ingredients[it.ingredient])u.ingredients[it.ingredient]=[];
      const dup=u.ingredients[it.ingredient].some(e=>e.date===d&&e.supplier===result.supplier);
      if(!dup){u.ingredients[it.ingredient].push({date:d,price:it.price,unit:it.unit||"unit",supplier:result.supplier||"Unknown"});saved++;}
    });
    u.receipts=[...(u.receipts||[]),`${result.supplier}|${result.date}|${result.items.length}`];
    if(!u.suppliers[result.supplier])u.suppliers[result.supplier]={type:"retail",notes:"Added from receipt scan."};
    setData(u);setInsightsStale(true);setScanRes(null);setImg(null);setModal(null);setTab("dashboard");
    try{
      await saveReceipt({...result,items:foodItems},scanLoc);
      await reload();
      say(`Saved ${saved} food item${saved!==1?"s":""}${excluded?` · ${excluded} non-food line${excluded!==1?"s":""} kept in the download only`:""}`);
    }catch(e){
      console.error(e);
      say("Saved locally — database sync failed",true);
    }
  };

  const replaceScan=async(result)=>{
    if(!result?.items)return;
    setReplacing(true);
    try{
      await deleteReceiptByKey(result.supplier,result.date);
      const u=JSON.parse(JSON.stringify(data));
      u.receipts=(u.receipts||[]).filter(fp=>fp!==`${result.supplier}|${result.date}|${result.items.length}`);
      Object.keys(u.ingredients).forEach(ing=>{u.ingredients[ing]=u.ingredients[ing].filter(e=>!(e.supplier===result.supplier&&e.date===result.date));if(!u.ingredients[ing].length)delete u.ingredients[ing];});
      setData(u);
      await okScan(result);
    }catch(e){console.error(e);say("Replace failed",true);}
    setReplacing(false);
  };

  // ── price check ──
  const doCheck=async(ing,unit,price,market=false)=>{
    setChkIng(ing);setChecks(p=>({...p,[ing]:{status:"loading"}}));
    const prefs=Object.entries(data.suppliers).filter(([,sp])=>sp.preferred).map(([n])=>n);
    const usePref=!market&&prefs.length>0;
    const where=usePref?`at these specific suppliers: ${prefs.join(", ")} (Vancouver BC area)`:`at Costco, T&T Supermarket, H-Mart, Save-On-Foods, local markets in Vancouver BC Canada`;
    try{
      const r=await claudeFetch({model:MODEL,max_tokens:800,tools:[{type:"web_search_20250305",name:"web_search",max_uses:2}],messages:[{role:"user",content:`Search current price of "${ing}" per ${unit} ${where}. Return ONLY JSON no markdown: {"marketRange":{"low":0.00,"high":0.00},"sources":[{"store":"Name","price":0.00,"url":"real page URL or empty string","notes":"brief"}],"verdict":"good|high|very_high","recommendation":"one actionable sentence"}. Every source MUST include the real url of the page the price came from; if you cannot verify a price with a real page, omit it. No data: {"error":"No reliable price data"}`}]});
      const out=await r.json();
      if(!r.ok){setChecks(p=>({...p,[ing]:{status:"err",msg:(out?.error?.message||`API error ${r.status}`).slice(0,120)}}));setChkIng(null);return;}
      const parsed=pickJson(out);
      if(parsed.error)setChecks(p=>({...p,[ing]:{status:"err",msg:parsed.error}}));
      else{
        setChecks(p=>({...p,[ing]:{status:"ok",data:parsed,paying:price,at:new Date().toLocaleDateString("en-CA"),scope:usePref?"preferred":"market"}}));
        const verified=(parsed.sources||[]).filter(x=>x.url&&/^https?:\/\//.test(x.url));
        if(verified.length){
          const rows=verified.map(x=>({ingredient:ing,price:x.price,unit,source:x.store,url:x.url,checked_at:new Date().toISOString()}));
          try{await saveMarketChecks(rows);setMarket(m=>({...m,[ing]:[...(m[ing]||[]),...rows.map(x=>({price:Number(x.price),unit:x.unit,source:x.source,url:x.url,at:x.checked_at}))]}));}catch(e){}
        }
      }
    }catch(e){setChecks(p=>({...p,[ing]:{status:"err",msg:"Search failed. Try again."}}));}
    setChkIng(null);
  };

  // Live market refresh: preferred suppliers only, over ticked (price-checkable) ingredients.
  // Feeds "Best price today" + advisory insights. Never writes into actual price history.
  const checkableIngredients=()=>{
    const flags=data.ingredientFlags||{};
    const catOf=n=>CATALOG_BY_NAME[String(n).toLowerCase()]?.cat||(data.customIngredients||[]).find(c=>c.name===n)?.cat||"Other";
    const names=[...new Set([...CATALOG.map(c=>c.name),...(data.customIngredients||[]).map(c=>c.name),...Object.keys(data.ingredients)])];
    return names.filter(n=>flags[n]!==undefined?flags[n]:defaultCheck(catOf(n)));
  };
  const refreshLivePrices=async()=>{
    const prefs=Object.entries(data.suppliers).filter(([,sp])=>sp.preferred).map(([n])=>n);
    if(!prefs.length){say("Star your preferred suppliers first — live prices come only from them",true);return;}
    const list=checkableIngredients();
    if(!list.length){say("No price-checkable ingredients — tick the raw items you buy in Ingredients",true);return;}
    let gate;
    try{gate=await canRunToday("preferred_refresh");}catch(e){console.error(e);say("Couldn't check the daily limit — try again",true);return;}
    if(!gate.allowed){say(`Live price limit reached (${gate.used}/${gate.limit} today) — try again tomorrow`,true);return;}
    setChkAll(true);
    try{
      await recordRun("preferred_refresh",session?.user?.email);
      for(const n of list){const e=data.ingredients[n];await doCheck(n,e?.[0]?.unit||"unit",e?gL(e):0);}
      say(`Live prices refreshed across ${list.length} ingredient${list.length!==1?"s":""} at your preferred suppliers`);
    }catch(e){console.error(e);say((e?.message||"Live refresh failed").slice(0,120),true);}
    finally{setChkAll(false);try{await refreshCaps();}catch(e){}}
  };

  // ── Item 7: volatility check on receipt prices (free — no API). Flags untracked
  // ingredients whose recent paid prices swing ≥12% and recommends tracking. ──
  const trackIngredient=async n=>{
    const f={...(data.ingredientFlags||{})};f[n]=true;
    try{await saveIngredientFlags(f);await reload();say(`${n} is now market-tracked`);}
    catch(e){say("Save failed",true);}
  };
  const volatileIngredients=(()=>{
    const flags=data.ingredientFlags||{};
    return Object.entries(data.ingredients).map(([n,e])=>{
      if(flags[n])return null;
      const ps=e.slice(-5).map(x=>normPrice(x.price,x.unit)).filter(p=>p>0);
      if(ps.length<3)return null;
      const hi=Math.max(...ps),lo=Math.min(...ps);
      const swing=lo?((hi-lo)/lo)*100:0;
      return swing>=12?{n,swing,count:ps.length}:null;
    }).filter(Boolean).sort((a,b)=>b.swing-a.swing).slice(0,3);
  })();

  // ── Item 6: mid-month + month-end market samples per location postal code.
  // Runs via the arm/countdown flow (never silently); both raw samples stored. ──
  const trackedIngredients=Object.keys(data.ingredientFlags||{}).filter(n=>data.ingredientFlags[n]);
  const sampleDue=(()=>{
    const now=new Date(),y=now.getFullYear(),m=now.getMonth();
    const key=d=>`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;
    const end=new Date(y,m+1,0),mid=new Date(y,m,15);
    if(now.getDate()>=end.getDate()&&!marketSamples[key(end)])return{date:key(end),label:"month-end"};
    if(now.getDate()>=15&&!marketSamples[key(mid)])return{date:key(mid),label:"mid-month"};
    return null;
  })();
  const [sampleBusy,setSampleBusy]=useState(false);
  const runMarketSample=async()=>{
    if(!sampleDue||!trackedIngredients.length)return;
    setSampleBusy(true);
    let saved=0;
    try{
      for(const n of trackedIngredients){
        const term=searchTerms[n]||n;
        const unit=data.ingredients[n]?.[0]?.unit||"unit";
        for(const lk of ["loc1","loc2"]){
          try{
            const r=await claudeFetch({model:MODEL,max_tokens:600,tools:[{type:"web_search_20250305",name:"web_search",max_uses:1}],messages:[{role:"user",content:`Search the current retail/wholesale price of "${term}" per ${unit} at stores near postal code ${POSTCODES[lk]} (${lk==="loc1"?"Vancouver":"Richmond"} BC Canada). Return ONLY JSON no markdown: {"price":0.00,"store":"Name","url":"real page URL or empty"}. Only report a price you can verify with a real page; otherwise {"error":"no data"}`}]});
            const out=await r.json();
            if(!r.ok)continue;
            const p=pickJson(out);
            if(!p.error&&Number(p.price)>0&&p.url&&/^https?:\/\//.test(p.url)){
              const row={ingredient:n,price:Number(p.price),unit,source:`${p.store||"Web"} · ${lk==="loc1"?data.locations.loc1:data.locations.loc2}`,url:p.url,checked_at:new Date().toISOString()};
              await saveMarketChecks([row]);
              setMarket(mk=>({...mk,[n]:[...(mk[n]||[]),{price:row.price,unit:row.unit,source:row.source,url:row.url,at:row.checked_at}]}));
              saved++;
            }
          }catch(e){console.error(e);}
        }
      }
      const next={...marketSamples,[sampleDue.date]:new Date().toISOString()};
      setMarketSamples(next);
      await saveSetting("market_samples",next);
      say(`Market sample recorded — ${saved} price${saved!==1?"s":""} found across ${trackedIngredients.length} tracked ingredient${trackedIngredients.length!==1?"s":""}`);
    }catch(e){console.error(e);say("Market sample failed — try again",true);}
    setSampleBusy(false);
  };

  // ── AI insights ──
  const buildDataSummary=()=>JSON.stringify({
    period:latMon,
    locations:data.locations,
    revenue:{total:rev,loc1:latMon?cRev(latMon,"loc1"):0,loc2:latMon?cRev(latMon,"loc2"):0},
    bowlFoodCostPct:{overall:fcp.toFixed(1),loc1:latMon&&cBowlRev(latMon,"loc1")?(cCOGS(latMon,"loc1")/cBowlRev(latMon,"loc1")*100).toFixed(1):0,loc2:latMon&&cBowlRev(latMon,"loc2")?(cCOGS(latMon,"loc2")/cBowlRev(latMon,"loc2")*100).toFixed(1):0},
    bowlEconomics:{bowlsSold,bowlRevenue:bowlRev.toFixed(2),avgRevenuePerBowl:avgBowl.toFixed(2)},
    topMovers:movers.slice(0,5).map(m=>({ingredient:m.n,changePct:m.ch.toFixed(1),price:`$${m.lat.toFixed(2)}/${m.unit}`})),
    menu:Object.entries(data.menu).map(([name])=>({name,sellBlended:blendedPrice(name).toFixed(2),costBlended:bCost(name).toFixed(2),foodCostPct:bFCP(name).toFixed(1)})),
    sizeMix:derivedMix,
    extras:(()=>{
      const t=data.sales[latMon]?.mix?.totals;
      const sum=k=>t?(t[k]?.loc1||0)+(t[k]?.loc2||0):0;
      const sides=sum("sidesRevenue"),drinks=sum("drinksRevenue");
      const implied=Math.max(0,otherRev-sides-drinks);
      const legacyUnits=(()=>{const o=data.sales[latMon]?.mix?.other||{};return Object.entries(o).map(([item,v])=>({item,units:(v.loc1||0)+(v.loc2||0)})).filter(x=>x.units>0).sort((a,b)=>b.units-a.units);})();
      return {
        otherRevenue:otherRev.toFixed(2),
        otherRevenuePctOfSales:rev?((otherRev/rev)*100).toFixed(1):"0",
        sidesRevenue:t?sides.toFixed(2):null,
        drinksRevenue:t?drinks.toFixed(2):null,
        impliedAddOnsAndFees:t&&(sides||drinks)?implied.toFixed(2):null,
        legacyPerItemUnits:legacyUnits.length?legacyUnits:undefined,
        note:"Sides/drinks are reported as total $ sold (typed from the till summary) — indicative only, no per-item detail and no costs, so never compute extras food cost or margin. impliedAddOnsAndFees = other revenue minus sides minus drinks: an indicative estimate of add-on and fee revenue, label it as such. Never fold any of these into bowl economics."
      };
    })(),
    addOnPricing:ADDONS,
    alerts:activeAlerts.map(([i,t])=>({ingredient:i,threshold:t,current:gL(data.ingredients[i]).toFixed(2)})),
    marketSignals:Object.entries(market).slice(0,20).map(([ing,rows])=>{
      const latest=rows[rows.length-1];const first=rows[0];
      return {ingredient:ing,latestMarket:latest?`$${latest.price} (${latest.source}, ${String(latest.at).slice(0,10)})`:null,checksRecorded:rows.length,marketTrendPct:rows.length>=3&&first.price?(((latest.price-first.price)/first.price)*100).toFixed(1):null,advisory:true};
    }),
    dataNote:"'ingredients' prices and all cost/margin/trend figures are ACTUALS from receipts — treat these as ground truth. 'marketSignals' are live advisory web checks at preferred suppliers: use them only to compare paid-vs-market and flag opportunities, never fold them into actual cost or margin maths. Some prepared items (sauces, prepared toppings) carry estimated recipe costs, not receipt-verified — flag as estimates if you rely on them.",
  });

  const generateInsights=async()=>{
    setLoadingInsights(true);setAiInsights(null);setInsightsStale(false);
    try{
      const res=await claudeFetch({model:MODEL,max_tokens:1500,messages:[{role:"user",content:`You are a food cost analyst for Westcoast Poké, a two-location poke restaurant in Vancouver BC. Data: ${buildDataSummary()}\n\nData notes: prices in ingredients are what the restaurant actually pays (receipts). marketSignals are advisory web-check results with dates — use them for comparisons and direction but never treat them as paid prices, and always cite the check date. Give 4-5 specific actionable insights referencing actual numbers, bowls and ingredients from the data. If marketSignals exist, one insight should compare paid vs market with the monthly dollar impact. Also choose ONE focus bowl to push this month using margins, market direction and sales mix together. If extras has sidesRevenue/drinksRevenue data, include one insight on the revenue mix between bowls, sides, drinks and implied add-ons/fees — label all extras figures as indicative. Return ONLY JSON no markdown: {"headline":"one punchy sentence on the biggest issue or opportunity","focus":{"bowl":"name","reason":"2 sentences: why this bowl now, citing data","contingency":"one sentence: what to revisit if conditions change"},"insights":[{"priority":"high|medium|low","icon":"emoji","title":"short title with a number","detail":"2-3 sentences with specific numbers","action":"exactly what to do next"}]}`}]});
      const out=await res.json();
      const parsed=pickJson(out);
      setAiInsights(parsed);
      const generatedAt=new Date().toISOString();
      setInsightsDate(generatedAt);
      try{localStorage.setItem("wp_insights",JSON.stringify({insights:parsed,generatedAt}));}catch{}
    }catch(e){say("Could not generate insights — try again",true);}
    setLoadingInsights(false);
  };

  const sendChat=async()=>{
    if(!chatInput.trim()||chatLoading)return;
    const hist=[...insightChat,{role:"user",content:chatInput}];
    setInsightChat(hist);setChatInput("");setChatLoading(true);
    try{
      const res=await claudeFetch({model:MODEL,max_tokens:600,system:`You are a food cost analyst for Westcoast Poké Vancouver. Answer using this data: ${buildDataSummary()}. Be concise and specific with numbers. 2-3 sentences max.`,messages:hist});
      const out=await res.json();
      const txt=out.content?.find(b=>b.type==="text")?.text||"Sorry, I could not answer that.";
      setInsightChat([...hist,{role:"assistant",content:txt}]);
    }catch(e){say("Chat failed — try again",true);}
    setChatLoading(false);
  };

  // ── styles ──
  const MAXW=isDesktop?1280:900;
  const card={background:T.card,border:`1px solid ${T.border}`,borderRadius:isMobile?12:16,padding:isMobile?"16px":isDesktop?"14px 16px":"22px 24px"};
  const Tag=({c,bg,children,sm})=><span style={{background:bg||T.blueL,color:c||T.blue,border:`1px solid ${(c||T.blue)}22`,padding:sm?"2px 8px":"3px 10px",borderRadius:20,fontSize:sm?10:12,fontWeight:700,whiteSpace:"nowrap"}}>{children}</span>;

  const TABS=[{id:"dashboard",label:"Dashboard"},{id:"sales",label:"Sales"},{id:"menu",label:"Menu"},{id:"suppliers",label:"Suppliers"},{id:"insights",label:"AI Insights"}];

  // ── auth gate ──
  if(session===undefined) return <div style={{minHeight:"100vh",background:T.bg,display:"flex",alignItems:"center",justifyContent:"center",color:T.muted,fontFamily:"sans-serif"}}>Loading...</div>;
  if(!session||!isOwner(session.user?.email)) return <Login T={T}/>;

  return(
    <div style={{height:"100dvh",width:"100%",overflow:"hidden",display:"flex",flexDirection:"column",background:T.bg,color:T.navy,fontFamily:"-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif"}}>

      {/* modal */}
      {modal&&(
        <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.55)",zIndex:1000,display:"flex",alignItems:"center",justifyContent:"center",padding:20}}>
          <div style={{background:T.card,border:`1px solid ${T.border}`,borderRadius:20,padding:28,maxWidth:420,width:"100%"}}>
            <div style={{fontSize:36,marginBottom:12}}>⚠️</div>
            <div style={{fontSize:20,fontWeight:800,marginBottom:8}}>Duplicate receipt</div>
            <div style={{fontSize:15,color:T.slate,lineHeight:1.7,marginBottom:20}}>A receipt from <strong>{modal.supplier}</strong> on <strong>{modal.date}</strong> is already saved. Discard this scan, or replace the saved one with it — replacing removes the old receipt and its price entries first, then saves this one fresh.</div>
            <div style={{display:"flex",gap:10,flexDirection:"column"}}>
              <button onClick={()=>{setModal(null);setImg(null);setScanRes(null);}} style={{background:T.blue,color:"#fff",border:"none",borderRadius:12,padding:"13px",fontSize:15,fontWeight:700,cursor:"pointer"}}>Discard this scan</button>
              <button onClick={()=>replaceScan(modal)} disabled={replacing} style={{background:"transparent",color:T.coral,border:`1px solid ${T.coral}55`,borderRadius:12,padding:"12px",fontSize:14,fontWeight:700,cursor:replacing?"wait":"pointer",opacity:replacing?0.6:1}}>{replacing?"Replacing…":"Replace saved receipt"}</button>
            </div>
          </div>
        </div>
      )}

      {/* arm step: confirm with last-updated before any paid call (item 11) */}
      {arm&&(
        <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.45)",zIndex:1000,display:"flex",alignItems:"center",justifyContent:"center",padding:20}}>
          <div style={{background:T.card,border:`1px solid ${T.border}`,borderRadius:16,padding:22,maxWidth:360,width:"100%"}}>
            <div style={{fontSize:16,fontWeight:800,marginBottom:6}}>{arm.label}</div>
            <div style={{fontSize:13,color:T.slate,lineHeight:1.6,marginBottom:14}}>
              {arm.lastAt?<>Last updated <strong>{new Date(arm.lastAt).toLocaleString("en-CA",{day:"numeric",month:"short",hour:"numeric",minute:"2-digit"})}</strong>. Refresh?</>:"Not run yet in this session."}
              {" "}This uses a paid API call — you'll get a {arm.secs}-second window to stop it for free.
            </div>
            <div style={{display:"flex",gap:8}}>
              <button onClick={()=>{const a=arm;setArm(null);setPending({label:a.label,remain:a.secs,fn:a.fn});}} style={{background:T.blue,color:"#fff",border:"none",borderRadius:10,padding:"10px 18px",fontSize:13,fontWeight:700,cursor:"pointer"}}>Refresh now</button>
              <button onClick={()=>setArm(null)} style={{background:"transparent",border:`1px solid ${T.border}`,borderRadius:10,color:T.muted,padding:"10px 16px",fontSize:13,cursor:"pointer"}}>Cancel</button>
            </div>
          </div>
        </div>
      )}
      {/* countdown step: nothing has been sent yet — stopping here costs $0 (item 9) */}
      {pending&&(
        <div style={{position:"fixed",left:"50%",bottom:24,transform:"translateX(-50%)",zIndex:1100,background:T.navy,color:"#fff",borderRadius:14,padding:"12px 18px",display:"flex",alignItems:"center",gap:14,boxShadow:"0 6px 20px rgba(0,0,0,0.3)"}}>
          <span style={{fontSize:13,fontWeight:600}}>{pending.label} starting in {pending.remain}s…</span>
          <button onClick={()=>setPending(null)} style={{background:"rgba(255,255,255,0.14)",border:"1px solid rgba(255,255,255,0.35)",borderRadius:10,color:"#fff",padding:"6px 12px",fontSize:12,fontWeight:700,cursor:"pointer"}}>✕ Stop — costs $0</button>
        </div>
      )}

      {tip&&<div style={{position:"fixed",left:tip.x,top:tip.y,transform:tip.side==="right"?"translateY(-50%)":"translateX(-50%)",background:T.navy,color:"#fff",fontSize:11,fontWeight:600,padding:"5px 9px",borderRadius:7,pointerEvents:"none",zIndex:2000,whiteSpace:"nowrap",boxShadow:"0 4px 14px rgba(0,0,0,0.22)"}}>{tip.text}</div>}

      {/* header */}
      <div style={{background:T.card,borderBottom:`1px solid ${T.border}`,padding:isMobile?"6px 10px":"8px 20px",display:"flex",alignItems:"center",minHeight:isMobile?52:64,gap:isMobile?6:8,flexWrap:"nowrap",flexShrink:0,width:"100%",overflow:"hidden"}}>
        <div style={{display:"flex",alignItems:"center",gap:10,flexShrink:0}}>
          <div style={{width:isMobile?38:46,height:isMobile?38:46,borderRadius:"50%",background:"#fff",border:`1px solid ${T.border}`,display:"flex",alignItems:"center",justifyContent:"center",overflow:"hidden",flexShrink:0}}>
            <img src={WCP_LOGO} alt="WCP" style={{width:"100%",height:"100%",objectFit:"contain"}}/>
          </div>
          {!isMobile&&<div>
            <div style={{fontWeight:800,fontSize:16,color:T.blue,lineHeight:1,letterSpacing:"-0.3px"}}>Westcoast Poké</div>
            <div style={{fontSize:10,color:T.muted,textTransform:"uppercase",letterSpacing:"1.5px",fontWeight:600}}>Food Cost Intelligence</div>
          </div>}
        </div>
        <div style={{display:"flex",gap:isMobile?4:6,alignItems:"center",flex:1,minWidth:0,justifyContent:"center",overflow:"hidden"}}>
          {(tab==="dashboard"||tab==="sales")&&[{id:"all",l:isMobile?"All":"All Locations"},{id:"loc1",l:isMobile?"L1":data.locations.loc1},{id:"loc2",l:isMobile?"L2":data.locations.loc2}].map(l=>(
            <button key={l.id} onClick={()=>setLoc(l.id)} {...tipBelow(l.id==="all"?"All Locations":l.id==="loc1"?data.locations.loc1:data.locations.loc2)} style={{background:loc===l.id?T.blue:"transparent",border:`1.5px solid ${loc===l.id?T.blue:T.border}`,color:loc===l.id?"#fff":T.slate,padding:isMobile?"4px 10px":"5px 14px",borderRadius:24,fontSize:isMobile?11:13,cursor:"pointer",fontWeight:600,whiteSpace:"nowrap"}}>{l.l}</button>
          ))}
        </div>
        <div style={{display:"flex",gap:isMobile?4:8,alignItems:"center",flexShrink:0}}>
          <button onClick={()=>{setTab("insights");if(!loadingInsights)armPaid({label:"AI insights refresh",secs:3,lastAt:insightsDate,fn:generateInsights});}} {...tipBelow(insightsStale?"New data — refresh AI insights":"Refresh AI insights")} aria-label="Refresh AI insights" style={{position:"relative",background:T.blueL,border:`1.5px solid ${T.blue}66`,borderRadius:"50%",width:isMobile?32:34,height:isMobile?32:34,color:T.blue,cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center",padding:0}}>
            <HdrIcon id="refresh" size={isMobile?17:18}/>
            {insightsStale&&<span style={{position:"absolute",top:-2,right:-2,width:9,height:9,borderRadius:"50%",background:T.coral,border:`2px solid ${T.card}`}}/>}
          </button>
          <button onClick={()=>setTab("scan")} {...tipBelow("Scan receipt")} aria-label="Scan receipt" style={{background:T.blue,border:"none",borderRadius:20,padding:isMobile?"6px 8px":"7px 16px",color:"#fff",fontSize:13,fontWeight:700,cursor:"pointer",whiteSpace:"nowrap",display:"flex",alignItems:"center",gap:6}}><HdrIcon id="camera" size={isMobile?18:18}/>{!isMobile&&<span>Scan receipt</span>}</button>
          <button onClick={signOut} {...tipBelow(session.user?.email||"Sign out")} aria-label="Sign out" style={{background:"none",border:`1px solid ${T.border}`,borderRadius:20,color:T.muted,padding:isMobile?"5px 8px":"6px 14px",fontSize:12,fontWeight:700,cursor:"pointer",whiteSpace:"nowrap",display:"flex",alignItems:"center",gap:6}}><HdrIcon id="signout" size={isMobile?17:18}/>{!isMobile&&<span>Sign out</span>}</button>
          <button onClick={()=>setDark(v=>!v)} aria-label={dark?"Switch to light mode":"Switch to dark mode"} {...tipBelow(dark?"Light mode":"Dark mode")} style={{background:"none",border:`1px solid ${T.border}`,borderRadius:"50%",width:isMobile?32:34,height:isMobile?32:34,color:T.muted,cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center",padding:0}}><HdrIcon id={dark?"sun":"moon"} size={isMobile?17:18}/></button>
        </div>
      </div>

      {activeAlerts.length>0&&(
        <div style={{background:T.coralL,borderBottom:`1px solid ${T.coral}33`,padding:isMobile?"9px 14px":"9px 28px",display:"flex",alignItems:"center",gap:10,fontSize:isMobile?12:14,flexShrink:0}}>
          <span>🔺</span><span style={{color:T.coral,fontWeight:700}}>Price alert:</span>
          <span style={{color:T.slate,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{activeAlerts.map(([i])=>i).join(" · ")}</span>
          <button onClick={()=>setTab("menu")} style={{marginLeft:"auto",background:"none",border:`1px solid ${T.coral}`,borderRadius:20,color:T.coral,padding:"3px 10px",fontSize:12,cursor:"pointer",fontWeight:700,whiteSpace:"nowrap",flexShrink:0}}>Review →</button>
        </div>
      )}

      {sampleDue&&trackedIngredients.length>0&&(
        <div style={{background:T.blueL,borderBottom:`1px solid ${T.blue}33`,padding:isMobile?"8px 14px":"8px 28px",display:"flex",alignItems:"center",gap:10,fontSize:isMobile?12:13,flexShrink:0}}>
          <span style={{color:T.blue,fontWeight:700}}>Market sample due ({sampleDue.label}):</span>
          <span style={{color:T.slate,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{trackedIngredients.length} tracked ingredient{trackedIngredients.length!==1?"s":""} × 2 locations</span>
          <button disabled={sampleBusy} onClick={()=>armPaid({label:`Market sample · ${sampleDue.label}`,secs:10,lastAt:Object.values(marketSamples).sort().pop()||null,fn:runMarketSample})} style={{marginLeft:"auto",background:sampleBusy?T.bg:T.blue,border:"none",borderRadius:20,color:sampleBusy?T.muted:"#fff",padding:"4px 12px",fontSize:12,cursor:sampleBusy?"wait":"pointer",fontWeight:700,whiteSpace:"nowrap",flexShrink:0}}>{sampleBusy?"Sampling…":"Run sample"}</button>
        </div>
      )}

      <div style={{display:"flex",alignItems:"stretch",flex:1,minHeight:0,overflow:"hidden"}}>
        <div style={{width:isMobile?54:64,flexShrink:0,background:T.card,borderRight:`1px solid ${T.border}`,display:"flex",flexDirection:"column",alignItems:"center",gap:4,paddingTop:14,paddingBottom:20,height:"100%",overflowY:"auto"}}>
          {TABS.map(t=>(
            <button key={t.id} onClick={()=>setTab(t.id)} {...tipRight(t.label)} aria-label={t.label} style={{position:"relative",width:isMobile?40:46,height:isMobile?40:46,borderRadius:12,background:tab===t.id?T.blueL:"transparent",border:tab===t.id?`1.5px solid ${T.blue}44`:"1.5px solid transparent",color:tab===t.id?T.blue:T.muted,cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center",padding:0,lineHeight:1}}>
              <NavIcon id={t.id} size={isMobile?19:22}/>
              {t.id==="insights"&&insightsStale&&<span style={{position:"absolute",top:5,right:5,width:7,height:7,borderRadius:"50%",background:T.coral}}/>}
            </button>
          ))}
        </div>
        <div style={{flex:1,minWidth:0,height:"100%",overflowY:"auto"}}>
      <div style={{padding:isMobile?"16px":"28px 32px",maxWidth:MAXW,margin:"0 auto"}}>
        {tab==="dashboard"&&<Dashboard {...{T,isMobile,isDesktop,card,Tag,latMon,loc,locName,headline,rev,bowlRev,otherRev,cogs,ytd,yearTarget,saveYearTarget,bowlsSold,gp,fcp,avgBowl,fcpDelta,revDelta,hasData,data,movers,actions,cRev,cCOGS,cBowlRev,setSelIng,setTab,bCost,bFCP,bMargin,blendedPrice,market,searchTerms,volatileIngredients,trackIngredient,onRefreshLive:()=>armPaid({label:"Live price refresh",secs:10,lastAt:(()=>{const all=Object.values(market||{}).flat().map(r=>r.at).sort();return all.pop()||null;})(),fn:refreshLivePrices}),liveBusy:chkAll}}/>}
        {tab==="menu"&&<MenuTab {...{T,isMobile,isDesktop,card,Tag,data,bCost,bFCP,bMargin,blendedPrice,priceFor,say,reload,selIng,setSelIng,checks,chkIng,chkAll,doCheck,market,searchTerms,saveSearchTerm}}/>}
        {tab==="suppliers"&&<Suppliers {...{T,isMobile,isDesktop,card,Tag,data,selSup,setSelSup,say,reload,armPaid}}/>}
        {tab==="sales"&&<Sales {...{T,isMobile,isDesktop,card,Tag,data,loc,locKey,cRev,cCOGS,cBowlRev,cOtherRev,bowlUnits,bowlUnitsTotal,sizeAgg,totalBowls,costSz,isBowl,bCost,bCostAtApp,costSzAt,priceFor,blendedPrice,bFCP,bMargin,months,say,onSaveSales:async(month,l1,l2,mix)=>{
          const u=JSON.parse(JSON.stringify(data));
          u.sales[month]={loc1:l1,loc2:l2,mix:mix||{}};
          setData(u);
          try{await saveSales(month,l1,l2,mix||{});say(`${month} sales saved`);}
          catch(e){console.error(e);say("Save failed — try again",true);}
        }}}/>}
        {tab==="scan"&&<Scan {...{T,isMobile,card,img,setImg,scanRes,setScanRes,scanning,doScan:()=>armPaid({label:"Receipt extraction (~$0.02)",secs:3,lastAt:null,fn:doScan}),okScan,onFile,fileRef,scanLoc,setScanLoc,locations:data.locations,data,reload,say}}/>}
        {tab==="insights"&&<Insights {...{T,isMobile,isDesktop,card,Tag,latMon,aiInsights,insightsDate,loadingInsights,generateInsights:()=>armPaid({label:"AI insights",secs:3,lastAt:insightsDate,fn:generateInsights}),insightChat,chatInput,setChatInput,chatLoading,sendChat}}/>}
      </div>
        </div>
      </div>

      <style>{"@keyframes pulse{0%,100%{opacity:1}50%{opacity:0.4}} @keyframes bounce{0%,100%{transform:translateY(0)}50%{transform:translateY(-6px)}} *{box-sizing:border-box} button:active:not(:disabled){transform:scale(0.97)}"}</style>
    </div>
  );
}

// ─── DASHBOARD ───────────────────────────────────────────────────────────────
// Collapse long advisory copy to 2 lines with a "more" toggle (item 10)
function Clamp({T,children}){
  const [open,setOpen]=useState(false);
  return(
    <div style={{fontSize:12,color:T.muted,marginBottom:12,lineHeight:1.6}}>
      <span style={open?{}:{display:"-webkit-box",WebkitLineClamp:2,WebkitBoxOrient:"vertical",overflow:"hidden"}}>{children}</span>
      <button onClick={()=>setOpen(v=>!v)} style={{background:"none",border:"none",color:T.blue,fontSize:11,fontWeight:700,cursor:"pointer",padding:"2px 0 0"}}>{open?"less ▴":"more ▾"}</button>
    </div>
  );
}

function Dashboard({T,isMobile,isDesktop,card,Tag,latMon,loc,locName,headline,rev,bowlRev,otherRev,cogs,ytd,yearTarget,saveYearTarget,bowlsSold,gp,fcp,avgBowl,fcpDelta,revDelta,hasData,data,movers,actions,cRev,cCOGS,cBowlRev,setSelIng,setTab,bCost,bFCP,bMargin,blendedPrice,market={},searchTerms={},volatileIngredients=[],trackIngredient,onRefreshLive,liveBusy}){
  const h=headline;
  const [tgtEdit,setTgtEdit]=useState(null);
  const [buyIng,setBuyIng]=useState("");
  const [buyLoc,setBuyLoc]=useState("loc1");
  const allIngNames=[...new Set([...CATALOG.map(c=>c.name),...(data.customIngredients||[]).map(c=>c.name),...Object.keys(data.ingredients)])].sort((a,b)=>a.localeCompare(b));
  const buySearch=()=>{
    if(!buyIng)return;
    const term=searchTerms[buyIng]||buyIng;
    const q=encodeURIComponent(`best price today ${term} near ${POSTCODES[buyLoc]}`);
    window.open(`https://www.google.com/search?q=${q}`,"_blank","noopener");
  };
  return(
    <div>
      <div style={{marginBottom:isMobile?16:isDesktop?12:24}}>
        <div style={{fontSize:isMobile?10:11,color:T.muted,textTransform:"uppercase",letterSpacing:"1.5px",fontWeight:700,marginBottom:isDesktop?4:6}}>{latMon} · {locName(loc)}</div>
        <h1 style={{fontSize:isMobile?26:isDesktop?24:40,fontWeight:900,margin:"0 0 6px",letterSpacing:"-1px",lineHeight:1.1}}>
          {h.pre}<span style={{color:h.color,fontStyle:"italic"}}>{h.em}</span>
        </h1>
        <p style={{fontSize:isMobile?13:isDesktop?13:15,color:T.slate,margin:0,lineHeight:1.6}}>{h.sub}</p>
        <div style={{display:"flex",alignItems:"center",gap:6,marginTop:isDesktop?5:8}}>
          <div style={{width:7,height:7,borderRadius:"50%",background:T.teal,animation:"pulse 2s infinite"}}/>
          <span style={{fontSize:12,color:T.muted}}>Live · synced to database</span>
        </div>
      </div>

      {(()=>{
        const yr=ytd?ytd.year:String(new Date().getFullYear());
        const ytdSales=ytd?ytd.sales.all:0;
        const now=new Date();
        const yearFrac=(now-new Date(now.getFullYear(),0,1))/(new Date(now.getFullYear()+1,0,1)-new Date(now.getFullYear(),0,1));
        const pace=yearTarget?yearTarget*yearFrac:0;
        const pct=yearTarget?Math.min((ytdSales/yearTarget)*100,100):0;
        const diff=ytdSales-pace;
        return(
          <div style={{...card,marginBottom:isMobile?14:20}}>
            <div style={{display:"flex",alignItems:"center",gap:10,flexWrap:"wrap",marginBottom:4}}>
              <div style={{fontSize:isMobile?15:17,fontWeight:700}}>{yr} target</div>
              {yearTarget?(
                tgtEdit===null
                  ?<button onClick={()=>setTgtEdit(String(yearTarget))} style={{marginLeft:"auto",background:"transparent",border:`1px solid ${T.border}`,borderRadius:16,color:T.slate,padding:"4px 12px",fontSize:12,fontWeight:600,cursor:"pointer"}}>Edit target</button>
                  :null
              ):null}
            </div>
            {(!yearTarget||tgtEdit!==null)?(
              <div>
                <div style={{fontSize:12,color:T.muted,marginBottom:10,lineHeight:1.6}}>Set your total sales target for {yr} (both locations combined) to track pace against it all year.</div>
                <div style={{display:"flex",gap:8,alignItems:"center",flexWrap:"wrap"}}>
                  <span style={{fontSize:15,fontWeight:700,color:T.slate}}>$</span>
                  <input type="number" min="1" placeholder="e.g. 250000" value={tgtEdit??""} onChange={e=>setTgtEdit(e.target.value)} style={{background:T.bg,border:`1px solid ${T.border}`,borderRadius:10,color:T.ink,padding:"8px 12px",fontSize:14,width:140}}/>
                  <button onClick={()=>{saveYearTarget(tgtEdit);setTgtEdit(null);}} style={{background:T.blue,color:"#fff",border:"none",borderRadius:16,padding:"8px 16px",fontSize:13,fontWeight:700,cursor:"pointer"}}>Save target</button>
                  {yearTarget&&<button onClick={()=>setTgtEdit(null)} style={{background:"transparent",border:"none",color:T.muted,fontSize:13,cursor:"pointer"}}>Cancel</button>}
                </div>
              </div>
            ):(
              <div>
                <div style={{display:"flex",alignItems:"baseline",gap:8,flexWrap:"wrap",marginBottom:isDesktop?6:10}}>
                  <span style={{fontSize:isMobile?24:isDesktop?20:30,fontWeight:900,color:T.blue,letterSpacing:"-0.5px"}}>{fmtK2(ytdSales)}</span>
                  <span style={{fontSize:isMobile?13:isDesktop?13:15,color:T.muted}}>of {fmtK2(yearTarget)} · {(yearTarget?(ytdSales/yearTarget)*100:0).toFixed(1)}%</span>
                </div>
                <div style={{position:"relative",height:isDesktop?6:12,background:T.border,borderRadius:6,marginBottom:6}}>
                  <div style={{position:"absolute",height:"100%",width:`${pct}%`,background:diff>=0?T.teal:T.blue,borderRadius:6}}/>
                  <div style={{position:"absolute",left:`${Math.min(yearFrac*100,100)}%`,top:isDesktop?-2:-3,width:2,height:isDesktop?10:18,background:T.ink,opacity:0.55}} title="Where you should be today at an even pace"/>
                </div>
                <div style={{display:"flex",justifyContent:"space-between",flexWrap:"wrap",gap:6}}>
                  <span style={{fontSize:12,fontWeight:700,color:diff>=0?T.teal:T.coral}}>{diff>=0?`Ahead of pace by ${fmtK2(diff)}`:`Behind pace by ${fmtK2(-diff)}`}</span>
                  <span style={{fontSize:11,color:T.muted}}>Pace marker = even spend of the year to date ({fmtK2(pace)})</span>
                </div>
              </div>
            )}
          </div>
        );
      })()}

      {ytd&&(
        <div style={{marginBottom:isMobile?14:20}}>
          <div style={{fontSize:10,color:T.muted,textTransform:"uppercase",letterSpacing:"1.5px",fontWeight:700,marginBottom:8}}>Year to date · {ytd.year} · {locName(loc)}</div>
          <div style={{display:"grid",gridTemplateColumns:isDesktop?"repeat(4,minmax(0,1fr))":"repeat(2,minmax(0,1fr))",gap:isMobile?10:14}}>
            {(()=>{const l=loc==="all"?"all":loc;const split=k=>loc==="all"?k:null;return[
              {lb:"YTD Sales",v:fmtK2(ytd.sales[l]),split:split(`${data.locations.loc1} ${fmtK2(ytd.sales.loc1)} · ${data.locations.loc2} ${fmtK2(ytd.sales.loc2)}`),col:T.blue,bg:T.blueL},
              {lb:"YTD Food Cost",v:fmtK2(ytd.cogs[l]),extra:`${ytd.fcp[l].toFixed(1)}%`,split:split(`${data.locations.loc1} ${ytd.fcp.loc1.toFixed(1)}% · ${data.locations.loc2} ${ytd.fcp.loc2.toFixed(1)}%`),col:ytd.fcp[l]>30?T.coral:T.amber,bg:ytd.fcp[l]>30?T.coralL:T.amberL},
              {lb:"YTD Gross Profit",v:fmtK2(ytd.gp[l]),split:split(`${data.locations.loc1} ${fmtK2(ytd.gp.loc1)} · ${data.locations.loc2} ${fmtK2(ytd.gp.loc2)}`),col:T.teal,bg:T.tealL},
              {lb:"YTD Other Revenue",v:fmtK2(ytd.other[l]),split:split(`${data.locations.loc1} ${fmtK2(ytd.other.loc1)} · ${data.locations.loc2} ${fmtK2(ytd.other.loc2)}`),col:T.blue,bg:T.blueL},
            ];})().map((k,i)=>(
              <div key={i} title={k.split||undefined} style={{background:k.bg,border:`1px solid ${T.border}`,borderRadius:isMobile?12:isDesktop?10:16,padding:isMobile?"14px 16px":isDesktop?"9px 14px":"18px 22px"}}>
                <div style={{fontSize:isDesktop?11:10,color:T.inkL,textTransform:"uppercase",letterSpacing:"1px",fontWeight:700,marginBottom:isDesktop?3:8}}>{k.lb}</div>
                <div style={{fontSize:isMobile?22:isDesktop?18:30,fontWeight:900,color:k.col,letterSpacing:"-0.5px",lineHeight:1}}>{k.v}{k.extra&&<span style={{fontSize:isDesktop?12:13,fontWeight:600,color:T.inkL,marginLeft:6}}>{k.extra}</span>}</div>
                {k.split&&!isDesktop&&<div style={{fontSize:isMobile?11:12,color:T.muted,marginTop:6,whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>{k.split}</div>}
              </div>
            ))}
          </div>
          {ytd.nMix<ytd.nAll&&<div style={{fontSize:10.5,color:T.muted,marginTop:6}}>Food cost & profit based on {ytd.nMix} of {ytd.nAll} months with bowl counts</div>}
        </div>
      )}

      <div style={{display:"grid",gridTemplateColumns:isDesktop&&loc==="all"?"1fr 1fr":"1fr",gap:isMobile?12:16,marginBottom:isMobile?12:16}}>
        {loc==="all"&&latMon&&(
          <div style={card}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"baseline",marginBottom:4}}>
              <div style={{fontSize:isMobile?15:17,fontWeight:700}}>Location comparison</div>
              <div style={{fontSize:12,color:T.muted}}>{latMon}</div>
            </div>
            <div style={{fontSize:12,color:T.muted,marginBottom:14}}>Bowl food cost as share of bowl sales · target 30%</div>
            {["loc1","loc2"].map((l,i)=>{
              const lr=cRev(latMon,l),lbr=cBowlRev(latMon,l),lc=cCOGS(latMon,l),lp=lbr?(lc/lbr)*100:0,delta=lp-30;
              return(
                <div key={l} style={{marginBottom:i===0?16:0}}>
                  <div style={{display:"flex",justifyContent:"space-between",alignItems:"baseline",marginBottom:5}}>
                    <div style={{fontSize:isMobile?13:15,fontWeight:600}}>{data.locations[l]} <span style={{fontSize:11,color:T.muted,fontWeight:400}}>L{i+1}</span></div>
                    <div style={{textAlign:"right"}}>
                      <span style={{fontSize:isMobile?13:15,fontWeight:800,marginRight:8}}>${(lr||0).toLocaleString("en-CA")}</span>
                      <span style={{fontSize:13,fontWeight:700,color:lp>30?T.coral:T.teal}}>{lp.toFixed(1)}%</span>
                    </div>
                  </div>
                  <div style={{position:"relative",height:8,background:T.border,borderRadius:4,marginBottom:5}}>
                    <div style={{position:"absolute",height:"100%",width:`${Math.min(lp/40*100,100)}%`,background:lp>30?T.coral:T.blue,borderRadius:4}}/>
                    <div style={{position:"absolute",left:"75%",top:-2,width:2,height:12,background:T.navy,opacity:0.4}}/>
                  </div>
                  <div style={{fontSize:11,color:delta>0?T.coral:T.teal,fontWeight:600,textAlign:"right"}}>Δ {delta>0?"+":""}{delta.toFixed(1)}pts vs target</div>
                  {i===0&&<div style={{borderTop:`1px solid ${T.border}`,margin:"12px 0"}}/>}
                </div>
              );
            })}
            {(()=>{
              const l1p=cRev(latMon,"loc1")?(cCOGS(latMon,"loc1")/cRev(latMon,"loc1")*100):0;
              const l2p=cRev(latMon,"loc2")?(cCOGS(latMon,"loc2")/cRev(latMon,"loc2")*100):0;
              const diff=Math.abs(l1p-l2p);
              if(diff<0.5)return null;
              const hotter=l1p>l2p?data.locations.loc1:data.locations.loc2;
              return <div style={{background:T.bg,borderRadius:10,padding:"10px 14px",marginTop:12,fontSize:13,color:T.slate,lineHeight:1.6}}><strong style={{color:T.navy}}>Insight</strong> · {hotter} is running {diff.toFixed(1)}pts hotter on COGS. Check portion consistency across locations.</div>;
            })()}
          </div>
        )}

        <div style={{...card,border:`1.5px solid ${T.blue}66`}}>
          <div style={{fontSize:9.5,fontWeight:800,color:T.blue,background:T.blueL,border:`1px solid ${T.blue}44`,borderRadius:20,padding:"3px 10px",display:"inline-block",letterSpacing:"0.8px",marginBottom:8}}>⚡ QUICK WIN</div>
          <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:2,flexWrap:"wrap"}}>
            <div style={{fontSize:isMobile?18:21,fontWeight:800,letterSpacing:"-0.3px"}}>💰 Best price today</div>
            <Tag c={T.amber} bg={T.amberL} sm>LIVE · ADVISORY</Tag>
            <button onClick={onRefreshLive} disabled={liveBusy} style={{marginLeft:"auto",background:liveBusy?T.bg:T.blue,color:liveBusy?T.muted:"#fff",border:"none",borderRadius:16,padding:"6px 14px",fontSize:12,fontWeight:700,cursor:liveBusy?"wait":"pointer"}}>{liveBusy?"Refreshing…":"⟳ Refresh live prices"}</button>
          </div>
          <div style={{fontSize:13,fontWeight:600,color:T.slate,marginBottom:6}}>Save on your next order</div>
          <Clamp T={T}>Live cheapest price found online at your <strong>preferred suppliers only</strong>. Indicative only — <strong>confirm with the supplier before ordering; don't rely on this alone.</strong> Tap ↗ to open the source page the price came from. Click Refresh to run a live search (uses your market-tracked ingredients).</Clamp>
          {(()=>{
            const rows=Object.entries(market||{}).map(([ing,checks])=>{
              const verified=(checks||[]).filter(c=>c.url&&/^https?:\/\//.test(c.url)&&Number(c.price)>0);
              if(!verified.length)return null;
              const best=verified.slice().sort((a,b)=>Number(a.price)-Number(b.price))[0];
              return {ing,...best};
            }).filter(Boolean).sort((a,b)=>a.ing.localeCompare(b.ing));
            if(!rows.length)return(
              <div style={{textAlign:"center",padding:"24px 12px",color:T.muted}}>
                <div style={{fontSize:30,marginBottom:8}}>🌐</div>
                <div style={{fontSize:13,fontWeight:700,color:T.slate,marginBottom:4}}>No live prices yet</div>
                <div style={{fontSize:12,lineHeight:1.6,marginBottom:14}}>Star your preferred suppliers, tick the raw ingredients you buy in Ingredients, then click <strong>Refresh live prices</strong> above — the cheapest online price we can source at your preferred suppliers (with its source link) appears here. Nothing is shown unless a real source is found.</div>
                <button onClick={()=>setTab("suppliers")} style={{background:T.blue,color:"#fff",border:"none",borderRadius:20,padding:"8px 18px",fontSize:13,fontWeight:700,cursor:"pointer"}}>Go to Suppliers →</button>
              </div>
            );
            return(
              <div style={{maxHeight:340,overflowY:"auto"}}>
                {rows.map((r,i)=>{
                  const age=Math.floor((Date.now()-new Date(r.at).getTime())/86400000);
                  const stale=age>14;
                  return(
                    <div key={r.ing} style={{display:"flex",alignItems:"center",gap:10,padding:"8px 0",borderBottom:i<rows.length-1?`1px solid ${T.border}`:"none"}}>
                      <div style={{flex:1,minWidth:0}}>
                        <div style={{fontSize:isMobile?13:14,fontWeight:600,whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>{r.ing}</div>
                        <div style={{fontSize:11,color:T.muted,whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>{r.source}</div>
                      </div>
                      <div style={{textAlign:"right",flexShrink:0}}>
                        <a href={r.url} target="_blank" rel="noopener noreferrer" title="Open source page" style={{fontSize:isMobile?13:15,fontWeight:800,color:T.blue,textDecoration:"none",whiteSpace:"nowrap"}}>${fmt(r.price)}<span style={{fontSize:10,color:T.muted,fontWeight:400}}>/{r.unit}</span> ↗</a>
                        <div style={{fontSize:10,color:stale?T.amber:T.muted}}>{isNaN(age)?"":stale?`⚠ ${age}d old`:String(r.at).slice(0,10)}</div>
                      </div>
                    </div>
                  );
                })}
              </div>
            );
          })()}
        </div>

        <div style={{...card,border:`1.5px solid ${T.teal}66`}}>
          <div style={{fontSize:9.5,fontWeight:800,color:T.teal,background:T.tealL,border:`1px solid ${T.teal}44`,borderRadius:20,padding:"3px 10px",display:"inline-block",letterSpacing:"0.8px",marginBottom:8}}>⚡ QUICK WIN</div>
          <div style={{fontSize:isMobile?18:21,fontWeight:800,letterSpacing:"-0.3px",marginBottom:2}}>🔥 What to push</div>
          <div style={{fontSize:13,fontWeight:600,color:T.slate,marginBottom:6}}>Today's highest-margin bowl</div>
          <Clamp T={T}>Your most profitable bowls right now, costed from the latest prices you have recorded. Tell the team to recommend the top one — every sale of it earns more than any other bowl.</Clamp>
          {(Object.keys(data.ingredients).length===0||Object.keys(data.menu).every(b=>bCost(b)===0))?(
            <div style={{textAlign:"center",padding:"24px 12px",color:T.muted}}>
              <div style={{fontSize:30,marginBottom:8}}>📋</div>
              <div style={{fontSize:13,fontWeight:700,color:T.slate,marginBottom:4}}>Nothing to rank yet</div>
              <div style={{fontSize:12,lineHeight:1.6}}>Bowl costs build as you scan receipts or add prices. Once your ingredients have real prices, this ranking appears automatically.</div>
            </div>
          ):Object.entries(data.menu).filter(([,m])=>!m.category||m.category==="classic"||m.category==="byo").map(([b])=>({b,margin:bMargin(b),profit:blendedPrice(b)-bCost(b)})).sort((a,b)=>b.profit-a.profit).map((r,i,arr)=>(
            <div key={r.b} style={{display:"flex",alignItems:"center",gap:10,padding:"9px 0",borderBottom:i<arr.length-1?`1px solid ${T.border}`:"none"}}>
              <div style={{width:22,height:22,borderRadius:"50%",background:i===0?T.teal:T.bg,color:i===0?"#fff":T.muted,display:"flex",alignItems:"center",justifyContent:"center",fontSize:11,fontWeight:800,flexShrink:0,border:i===0?"none":`1px solid ${T.border}`}}>{i+1}</div>
              <div style={{flex:1,fontSize:isMobile?13:14,fontWeight:600}}>{r.b}{i===0&&<span style={{marginLeft:8,fontSize:10,color:T.teal,fontWeight:800}}>PUSH</span>}</div>
              <div style={{textAlign:"right"}}>
                <div style={{fontSize:isMobile?13:15,fontWeight:800,color:r.margin>70?T.teal:r.margin>60?T.amber:T.coral}}>${fmt(r.profit)}</div>
                <div style={{fontSize:10,color:T.muted}}>{r.margin.toFixed(1)}% margin</div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Item 6b: free Google "buy it today" search — no API, no cost */}
      <div style={{...card,marginBottom:isMobile?12:16}}>
        <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:6,flexWrap:"wrap"}}>
          <div style={{fontSize:isMobile?15:17,fontWeight:800}}>🛒 Buy it today</div>
          <Tag c={T.teal} bg={T.tealL} sm>FREE SEARCH</Tag>
        </div>
        <div style={{fontSize:12,color:T.muted,marginBottom:12,lineHeight:1.6}}>Run out of something? Pick the ingredient and location — this opens a Google "best price today near me" search in a new tab. Free, nothing stored. Tip: set a search term with pack size (e.g. "Kikkoman soy sauce 1L") on the ingredient in Menu → Ingredients for sharper results.</div>
        <div style={{display:"flex",gap:8,flexWrap:"wrap",alignItems:"center"}}>
          <select value={buyIng} onChange={e=>setBuyIng(e.target.value)} style={{flex:"1 1 200px",background:T.bg,border:`1px solid ${T.border}`,borderRadius:10,padding:"9px 12px",color:T.navy,fontSize:13,outline:"none"}}>
            <option value="">Pick an ingredient…</option>
            {allIngNames.map(n=><option key={n} value={n}>{searchTerms[n]?`${n} — “${searchTerms[n]}”`:n}</option>)}
          </select>
          <div style={{display:"flex",gap:2,background:T.bg,border:`1px solid ${T.border}`,borderRadius:14,padding:2}}>
            {[["loc1",data.locations.loc1],["loc2",data.locations.loc2]].map(([id,lb])=>(
              <button key={id} onClick={()=>setBuyLoc(id)} style={{background:buyLoc===id?T.blue:"transparent",color:buyLoc===id?"#fff":T.slate,border:"none",borderRadius:12,padding:"6px 12px",fontSize:12,fontWeight:600,cursor:"pointer"}}>{lb}</button>
            ))}
          </div>
          <button onClick={buySearch} disabled={!buyIng} style={{background:buyIng?T.teal:T.bg,color:buyIng?"#fff":T.muted,border:"none",borderRadius:16,padding:"9px 18px",fontSize:13,fontWeight:700,cursor:buyIng?"pointer":"not-allowed"}}>Search Google ↗</button>
        </div>
      </div>

      {/* Item 7: volatility insights — recommend tracking, never auto-enable */}
      {volatileIngredients.length>0&&(
        <div style={{marginBottom:isMobile?12:16}}>
          {volatileIngredients.map(v=>(
            <div key={v.n} style={{...card,borderLeft:`4px solid ${T.amber}`,borderRadius:isMobile?12:16,marginBottom:8,display:"flex",alignItems:"center",gap:12,flexWrap:"wrap"}}>
              <div style={{flex:1,minWidth:200}}>
                <div style={{fontSize:14,fontWeight:800,marginBottom:2}}>📈 {v.n} price is volatile</div>
                <div style={{fontSize:12.5,color:T.slate,lineHeight:1.5}}>Your paid price varied <strong>{v.swing.toFixed(0)}%</strong> over your last {v.count} purchases — worth watching the market. Recommend enabling market tracking.</div>
              </div>
              <button onClick={()=>trackIngredient(v.n)} style={{background:T.amberL,border:`1px solid ${T.amber}55`,borderRadius:16,color:T.amber,padding:"8px 16px",fontSize:12,fontWeight:700,cursor:"pointer",whiteSpace:"nowrap"}}>Track {v.n}</button>
            </div>
          ))}
        </div>
      )}

      <div style={{display:"grid",gridTemplateColumns:isDesktop?`repeat(${actions.length},1fr)`:"1fr",gap:isMobile?10:14}}>
        {actions.map((a,i)=>(
          <div key={i} style={{...card}}>
            <div style={{fontSize:10,color:a.color,textTransform:"uppercase",letterSpacing:"1.5px",fontWeight:800,marginBottom:10}}>{a.icon} ACTION</div>
            <div style={{fontSize:isMobile?15:18,fontWeight:800,marginBottom:8,lineHeight:1.3}}>{a.title}</div>
            <div style={{fontSize:isMobile?12:14,color:T.slate,lineHeight:1.6,marginBottom:16}}>{a.body}</div>
            <button onClick={a.fn} style={{background:a.color,color:"#fff",border:"none",borderRadius:20,padding:"8px 18px",fontSize:13,fontWeight:700,cursor:"pointer"}}>{a.cta} →</button>
          </div>
        ))}
      </div>
    </div>
  );
}
const fmtK2 = n => typeof n==="number"&&n>=1000?`$${(n/1000).toFixed(1)}k`:typeof n==="number"?`$${n.toLocaleString("en-CA",{minimumFractionDigits:2,maximumFractionDigits:2})}`:n;

// ─── INGREDIENTS ─────────────────────────────────────────────────────────────
function Ingredients({T,isMobile,isDesktop,card,Tag,data,selIng,setSelIng,checks,chkIng,chkAll,doCheck,say,reload,market,searchTerms={},saveSearchTerm}){
  const [termEdit,setTermEdit]=useState({});
  const [showAdd,setShowAdd]=useState(false);
  const [mIng,setMIng]=useState("");const [mPrice,setMPrice]=useState("");const [mUnit,setMUnit]=useState("lb");const [mSup,setMSup]=useState("");const [mDate,setMDate]=useState(new Date().toISOString().slice(0,10));
  const [mSaving,setMSaving]=useState(false);
  const [thrEdit,setThrEdit]=useState("");
  const [ren,setRen]=useState("");
  const [mergeInto,setMergeInto]=useState("");
  const [recipePick,setRecipePick]=useState(null);
  const [recipeSel,setRecipeSel]=useState({});
  const [busy,setBusy]=useState(false);
  const [showNewIng,setShowNewIng]=useState(false);
  const [niName,setNiName]=useState("");const [niCat,setNiCat]=useState("Produce");const [niPrice,setNiPrice]=useState("");const [niUnit,setNiUnit]=useState("lb");const [niSup,setNiSup]=useState("");
  const ING_CATS=["Protein","Produce","Base / side","Crunch / finish","Seasoning / finish","Pickled / fermented","Prepared protein","Prepared side","Prepared topping","Sauce / dressing","Preparation"];
  const catOf=n=>CATALOG_BY_NAME[String(n).toLowerCase()]?.cat||(data.customIngredients||[]).find(c=>c.name===n)?.cat||"Other";
  const isChecked=n=>{const f=data.ingredientFlags||{};return f[n]!==undefined?f[n]:defaultCheck(catOf(n));};
  const toggleCheck=async(n)=>{
    const f={...(data.ingredientFlags||{})};f[n]=!isChecked(n);
    try{await saveIngredientFlags(f);await reload();}catch(e){say("Save failed",true);}
  };
  const saveNewIng=async()=>{
    const nm=niName.trim();if(!nm)return;setBusy(true);
    try{
      if(niPrice){await addPrice(nm,parseFloat(niPrice),niUnit,niSup.trim()||"Manual entry",new Date().toISOString().slice(0,10));}
      else{const cur=data.customIngredients||[];if(!cur.some(c=>c.name===nm)&&!CATALOG_BY_NAME[nm.toLowerCase()])await saveCustomIngredients([...cur,{name:nm,cat:niCat}]);}
      await reload();say(niPrice?`${nm} added with price`:`${nm} added`);
      setShowNewIng(false);setNiName("");setNiPrice("");setNiSup("");
    }catch(e){console.error(e);say("Save failed",true);}
    setBusy(false);
  };
  const SZ3=["small","medium","large"];
  const recipesUsing=(ing)=>Object.keys(data.menu).filter(n=>SZ3.some(sz=>data.menu[n].ing?.[sz]?.[ing]!=null));
  const allIngNames=[...new Set([...CATALOG.map(c=>c.name),...(data.customIngredients||[]).map(c=>c.name),...Object.keys(data.ingredients)])].sort((a,b)=>a.localeCompare(b));
  const formRef=useRef(null);const priceRef=useRef(null);
  const openAdd=(name)=>{
    setShowAdd(true);
    if(name!==undefined)setMIng(name);
    setTimeout(()=>{formRef.current?.scrollIntoView({behavior:"smooth",block:"start"});priceRef.current?.focus();},60);
  };
  const inp={background:T.bg,border:`1px solid ${T.border}`,borderRadius:10,padding:"10px 12px",color:T.navy,fontSize:14,fontFamily:"inherit",outline:"none",width:"100%"};
  const submitManual=async()=>{
    if(!mIng.trim()||!mPrice)return;
    setMSaving(true);
    try{
      await addPrice(mIng.trim(),parseFloat(mPrice),mUnit,mSup.trim()||"Manual entry",mDate);
      await reload();
      say("Price added");
      setShowAdd(false);setMIng("");setMPrice("");setMSup("");
    }catch(e){console.error(e);say("Save failed",true);}
    setMSaving(false);
  };
  const delEntry=async(id,name)=>{
    if(!id){say("Refresh before deleting this entry",true);return;}
    if(!window.confirm(`Delete this price entry for ${name}?`))return;
    try{await deletePriceEntry(id);await reload();say("Entry deleted");}
    catch(e){say("Delete failed",true);}
  };
  const delIng=async(name)=>{
    if(!window.confirm(`Delete "${name}" and ALL its price history? This cannot be undone.`))return;
    try{await deleteIngredient(name);await reload();setSelIng(null);say(`${name} deleted`);}
    catch(e){say("Delete failed",true);}
  };
  const saveThr=async(name)=>{
    const v=thrEdit===""?null:parseFloat(thrEdit);
    try{await saveAlert(name,v);await reload();say(v===null?"Alert removed":`Alert set at $${v}`);}
    catch(e){say("Save failed",true);}
  };
  // Repoint an ingredient to another name across prices, recipes, and alerts.
  // Target that already exists = merge (history + recipe refs combine); new target = rename.
  const repoint=async(oldName,newName,isMerge)=>{
    newName=(newName||"").trim();
    if(!newName||newName===oldName){setRen("");setMergeInto("");return;}
    setBusy(true);
    try{
      await renameIngredientInPrices(oldName,newName);
      for(const [mn,m] of Object.entries(data.menu)){
        let changed=false;const ing=JSON.parse(JSON.stringify(m.ing||{}));
        SZ3.forEach(sz=>{if(ing[sz]&&ing[sz][oldName]!=null){const q=ing[sz][oldName];delete ing[sz][oldName];if(ing[sz][newName]==null)ing[sz][newName]=q;changed=true;}});
        if(changed)await saveMenuItem(mn,m.sizes,ing,m.category);
      }
      if(data.alerts[oldName]!=null){if(data.alerts[newName]==null)await saveAlert(newName,data.alerts[oldName]);await saveAlert(oldName,null);}
      await reload();
      setSelIng(newName);setRen("");setMergeInto("");
      say(isMerge?`Merged into ${newName}`:`Renamed to ${newName}`);
    }catch(e){console.error(e);say("Update failed",true);}
    setBusy(false);
  };
  const startRename=(oldName)=>{
    const nn=(ren||"").trim();if(!nn||nn===oldName){setRen("");return;}
    const exists=allIngNames.includes(nn);
    if(exists&&!window.confirm(`"${nn}" already exists — this merges ${oldName} into it (price history and recipe use combine, ${oldName} removed). Continue?`))return;
    repoint(oldName,nn,exists);
  };
  const doAddToRecipe=async(ing)=>{
    const chosen=Object.keys(recipeSel).filter(k=>recipeSel[k]);
    if(!chosen.length)return;
    setBusy(true);
    try{
      const def={small:0.08,medium:0.1,large:0.125};
      for(const mn of chosen){
        const m=data.menu[mn];const ing2=JSON.parse(JSON.stringify(m.ing||{small:{},medium:{},large:{}}));
        SZ3.forEach(sz=>{ing2[sz]=ing2[sz]||{};if(ing2[sz][ing]==null)ing2[sz][ing]=def[sz];});
        await saveMenuItem(mn,m.sizes,ing2,m.category);
      }
      await reload();setRecipePick(null);setRecipeSel({});
      say(`Added to ${chosen.length} bowl${chosen.length>1?"s":""} · fine-tune grams in Menu`);
    }catch(e){console.error(e);say("Update failed",true);}
    setBusy(false);
  };
  return(
    <div>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:18,flexWrap:"wrap",gap:8}}>
        <div style={{fontSize:isMobile?13:14,color:T.slate,lineHeight:1.6,maxWidth:560}}>Your ingredient catalogue with the actual prices you've paid, from receipts and manual entries. Tap a priced one for its history and alerts; tap an unpriced one to add its first price. Live market prices live on the dashboard's "Best price today".</div>
        <div style={{display:"flex",gap:8,flexWrap:"wrap"}}>
          <button onClick={()=>showAdd?setShowAdd(false):openAdd()} style={{background:showAdd?"transparent":T.blue,color:showAdd?T.muted:"#fff",border:showAdd?`1px solid ${T.border}`:"none",padding:"8px 16px",borderRadius:20,fontSize:13,cursor:"pointer",fontWeight:700}}>{showAdd?"Cancel":"+ Add price"}</button>
          <button onClick={()=>setShowNewIng(v=>!v)} style={{background:showNewIng?"transparent":T.tealL,color:showNewIng?T.muted:T.teal,border:showNewIng?`1px solid ${T.border}`:`1px solid ${T.teal}44`,padding:"8px 16px",borderRadius:20,fontSize:13,cursor:"pointer",fontWeight:700}}>{showNewIng?"Cancel":"+ Add ingredient"}</button>
        </div>
        <div style={{fontSize:11,color:T.muted,lineHeight:1.6,marginTop:8,flexBasis:"100%"}}>The tickbox opts an ingredient into <strong>market tracking</strong> — twice-monthly market price samples and live price checks. Everything starts unticked: tick only what's worth watching (tracking uses paid API calls). For sharper searches, open a tracked ingredient and set a search term with brand and pack size, e.g. "Kikkoman soy sauce 1L".</div>
      </div>

      {showAdd&&(
        <div ref={formRef} style={{...card,marginBottom:14,borderColor:T.blue}}>
          <div style={{fontSize:15,fontWeight:700,marginBottom:12}}>Add a price manually</div>
          <div style={{display:"grid",gridTemplateColumns:isMobile?"1fr 1fr":"2fr 1fr 1fr 2fr 1.4fr auto",gap:8,alignItems:"end"}}>
            <div><div style={{fontSize:10,color:T.muted,fontWeight:700,marginBottom:4}}>INGREDIENT</div><input list="ing-list" value={mIng} onChange={e=>setMIng(e.target.value)} placeholder="e.g. Ahi Tuna" style={inp}/><datalist id="ing-list">{[...new Set([...CATALOG.map(c=>c.name),...Object.keys(data.ingredients)])].sort((a,b)=>a.localeCompare(b)).map(i=><option key={i} value={i}/>)}</datalist></div>
            <div><div style={{fontSize:10,color:T.muted,fontWeight:700,marginBottom:4}}>PRICE $</div><input ref={priceRef} type="number" inputMode="decimal" value={mPrice} onChange={e=>setMPrice(e.target.value)} placeholder="0.00" style={inp}/></div>
            <div><div style={{fontSize:10,color:T.muted,fontWeight:700,marginBottom:4}}>UNIT</div><select value={mUnit} onChange={e=>setMUnit(e.target.value)} style={inp}>{["lb","kg","each","bottle","case","25kg","10kg","L","bag"].map(u=><option key={u}>{u}</option>)}</select></div>
            <div><div style={{fontSize:10,color:T.muted,fontWeight:700,marginBottom:4}}>SUPPLIER</div><input list="sup-list" value={mSup} onChange={e=>setMSup(e.target.value)} placeholder="e.g. Costco" style={inp}/><datalist id="sup-list">{Object.keys(data.suppliers).map(s=><option key={s} value={s}/>)}</datalist></div>
            <div><div style={{fontSize:10,color:T.muted,fontWeight:700,marginBottom:4}}>DATE</div><input type="date" value={mDate} onChange={e=>setMDate(e.target.value)} style={inp}/></div>
            <button onClick={submitManual} disabled={mSaving||!mIng.trim()||!mPrice} style={{background:T.teal,color:"#fff",border:"none",borderRadius:10,padding:"11px 20px",fontSize:14,fontWeight:800,cursor:"pointer",opacity:mSaving||!mIng.trim()||!mPrice?0.6:1,whiteSpace:"nowrap"}}>{mSaving?"Saving...":"Save"}</button>
          </div>
        </div>
      )}

      {showNewIng&&(
        <div style={{...card,marginBottom:14,borderColor:T.teal}}>
          <div style={{fontSize:15,fontWeight:700,marginBottom:4}}>Add an ingredient</div>
          <div style={{fontSize:12,color:T.muted,marginBottom:12,lineHeight:1.6}}>Add a raw ingredient you buy (e.g. Crab, Lettuce) so receipts can price it and it can be included in live checks. A price is optional — add it now or later. Raw items are price-checkable by default; prepared items aren't.</div>
          <div style={{display:"grid",gridTemplateColumns:isMobile?"1fr 1fr":"2fr 1.4fr 1fr 1fr 2fr auto",gap:8,alignItems:"end"}}>
            <div><div style={{fontSize:10,color:T.muted,fontWeight:700,marginBottom:4}}>NAME *</div><input value={niName} onChange={e=>setNiName(e.target.value)} placeholder="e.g. Crab" style={inp}/></div>
            <div><div style={{fontSize:10,color:T.muted,fontWeight:700,marginBottom:4}}>CATEGORY</div><select value={niCat} onChange={e=>setNiCat(e.target.value)} style={inp}>{ING_CATS.map(c=><option key={c}>{c}</option>)}</select></div>
            <div><div style={{fontSize:10,color:T.muted,fontWeight:700,marginBottom:4}}>PRICE $ (opt)</div><input type="number" inputMode="decimal" value={niPrice} onChange={e=>setNiPrice(e.target.value)} placeholder="—" style={inp}/></div>
            <div><div style={{fontSize:10,color:T.muted,fontWeight:700,marginBottom:4}}>UNIT</div><select value={niUnit} onChange={e=>setNiUnit(e.target.value)} style={inp}>{["lb","kg","each","bottle","case","25kg","10kg","L","bag"].map(u=><option key={u}>{u}</option>)}</select></div>
            <div><div style={{fontSize:10,color:T.muted,fontWeight:700,marginBottom:4}}>SUPPLIER (opt)</div><input list="sup-list" value={niSup} onChange={e=>setNiSup(e.target.value)} placeholder="if adding price" style={inp}/></div>
            <button onClick={saveNewIng} disabled={busy||!niName.trim()} style={{background:T.teal,color:"#fff",border:"none",borderRadius:10,padding:"11px 20px",fontSize:14,fontWeight:800,cursor:"pointer",opacity:busy||!niName.trim()?0.6:1,whiteSpace:"nowrap"}}>{busy?"Saving...":"Add"}</button>
          </div>
        </div>
      )}

      {(()=>{
        const catByName=Object.fromEntries(CATALOG.map(c=>[c.name,c]));
        const names=[...new Set([...CATALOG.map(c=>c.name),...(data.customIngredients||[]).map(c=>c.name),...Object.keys(data.ingredients)])];
        const catOf=n=>catByName[n]?.cat||(data.customIngredients||[]).find(c=>c.name===n)?.cat||"Other";
        const order=[];CATALOG.forEach(c=>{if(!order.includes(c.cat))order.push(c.cat);});order.push("Other");
        const groups={};names.forEach(n=>{const c=catOf(n);(groups[c]=groups[c]||[]).push(n);});
        return(
          <div>
            {order.filter(c=>groups[c]&&groups[c].length).map(cat=>{
              const rows=groups[cat].slice().sort((a,b)=>a.localeCompare(b));
              return(
                <div key={cat} style={{marginBottom:14}}>
                  <div style={{fontSize:11,color:T.muted,fontWeight:800,textTransform:"uppercase",letterSpacing:"1px",margin:"0 0 6px 2px"}}>{cat} · {rows.length}</div>
                  <div style={{...card,padding:0,overflow:"hidden"}}>
                    {rows.map((name,i)=>{
                      const entries=data.ingredients[name],has=entries&&entries.length,meta=catByName[name],last=i===rows.length-1;
                      if(has){
                        const lat=gL(entries),ch=gPct(entries),thr=data.alerts[name],ov=thr&&lat>thr,isSel=selIng===name,pc=checks[name];
                        return(
                          <div key={name} style={{borderBottom:last&&!isSel?"none":`1px solid ${T.border}`}}>
                            <div onClick={()=>setSelIng(isSel?null:name)} style={{display:"flex",alignItems:"center",gap:10,padding:"10px 16px",cursor:"pointer",background:isSel?T.blueL:"transparent"}}>
                              <input type="checkbox" checked={isChecked(name)} onClick={e=>e.stopPropagation()} onChange={()=>toggleCheck(name)} title={isChecked(name)?"Included in live price checks":"Excluded (prepared / not bought raw)"} style={{cursor:"pointer",flexShrink:0}}/>
                              <div style={{flex:1,fontSize:13,fontWeight:600}}>{name}{ov&&<span style={{marginLeft:6,fontSize:11,color:T.coral}}>{"\u26a0"}</span>}{recipesUsing(name).length===0&&<span title="Not in any bowl — won't affect food cost" style={{marginLeft:8,fontSize:10,fontWeight:700,color:T.amber,background:T.amberL,border:`1px solid ${T.amber}44`,padding:"1px 7px",borderRadius:10,whiteSpace:"nowrap"}}>not in a bowl</span>}</div>
                              <div style={{fontSize:12,color:T.muted}}>{entries[entries.length-1]?.supplier}</div>
                              <div style={{fontSize:13,fontWeight:700,width:88,textAlign:"right"}}>${fmt(lat)}<span style={{fontSize:10,color:T.muted,fontWeight:400}}>/{entries[0]?.unit}</span></div>
                              <div style={{fontSize:12,fontWeight:700,color:ch>0?T.coral:T.teal,width:52,textAlign:"right"}}>{ch>0?"+":""}{ch.toFixed(1)}%</div>
                              <span style={{color:T.muted,fontSize:11,width:12,textAlign:"center"}}>{isSel?"\u25be":"\u25b8"}</span>
                            </div>
                            {isSel&&(
                              <div onClick={e=>e.stopPropagation()} style={{padding:"6px 16px 18px"}}>
                                <PriceChart data={entries} T={T} market={market[name]}/>
                                <div style={{marginTop:12}}>
                                  {entries.map((e,i)=>(
                                    <div key={i} style={{display:"flex",justifyContent:"space-between",alignItems:"center",gap:8,fontSize:13,color:T.muted,padding:"5px 0",borderBottom:`1px solid ${T.border}`}}>
                                      <span>{e.date}</span><span>{e.supplier}</span>
                                      <span style={{color:T.navy,fontWeight:600,marginLeft:"auto"}}>${fmt(e.price)}/{e.unit}</span>
                                      <button onClick={()=>delEntry(e.id,name)} title="Delete entry" style={{background:"none",border:"none",color:T.coral,fontSize:15,cursor:"pointer",padding:"2px 6px",lineHeight:1}}>×</button>
                                    </div>
                                  ))}
                                </div>
                                {entries.length>=4&&(()=>{
                                  const last3=entries.slice(-3).map(e=>e.price);
                                  const slope=(last3[2]-last3[0])/2;
                                  const projected=Math.max(0,last3[2]+slope*3);
                                  if(Math.abs(slope)<0.01)return null;
                                  return <div style={{marginTop:12,fontSize:12,color:T.slate}}>Trending toward ~<strong>${fmt(projected)}/{entries[0]?.unit}</strong> in 3 months <Tag c={T.slate} bg={T.bg} sm>FORECAST</Tag></div>;
                                })()}
                                {(market[name]||[]).length>=3&&(()=>{
                                  const mk=market[name];
                                  const first=mk[0].price,latest=mk[mk.length-1].price;
                                  const chg=first?((latest-first)/first)*100:0;
                                  return(
                                    <div style={{marginTop:10,background:T.amberL,border:`1px solid ${T.amber}33`,borderRadius:10,padding:"10px 14px"}}>
                                      <div style={{fontSize:12,fontWeight:700,color:T.slate,marginBottom:2}}>Market outlook <Tag c={T.amber} bg={T.amberL} sm>ADVISORY</Tag></div>
                                      <div style={{fontSize:12,color:T.slate}}>Market {chg>1?`rising ${chg.toFixed(0)}%`:chg<-1?`falling ${Math.abs(chg).toFixed(0)}%`:"flat"} across your last {mk.length} checks · latest ${fmt(latest)} vs you paying ${fmt(gL(entries))}</div>
                                    </div>
                                  );
                                })()}
                                <div style={{display:"flex",gap:8,alignItems:"center",marginTop:14,flexWrap:"wrap"}}>
                                  <span style={{fontSize:12,color:T.muted,fontWeight:700}}>Search term</span>
                                  <input value={termEdit[name]??searchTerms[name]??""} onChange={e=>setTermEdit(p=>({...p,[name]:e.target.value}))} placeholder={`e.g. ${name} 1kg`} style={{flex:"1 1 180px",background:T.bg,border:`1px solid ${T.border}`,borderRadius:8,padding:"7px 10px",color:T.navy,fontSize:13,outline:"none"}}/>
                                  <button onClick={()=>saveSearchTerm&&saveSearchTerm(name,termEdit[name]??searchTerms[name]??"")} style={{background:T.blueL,border:`1px solid ${T.border}`,borderRadius:16,color:T.blue,padding:"6px 14px",fontSize:12,fontWeight:700,cursor:"pointer"}}>Save term</button>
                                  <span style={{fontSize:10.5,color:T.muted,flexBasis:"100%"}}>Used for market samples and the free "Buy it today" search — include brand and pack size.</span>
                                </div>
                                <div style={{display:"flex",gap:8,alignItems:"center",marginTop:10,flexWrap:"wrap"}}>
                                  <span style={{fontSize:12,color:T.muted,fontWeight:700}}>Price alert above $</span>
                                  <input type="number" inputMode="decimal" defaultValue={thr||""} onChange={e=>setThrEdit(e.target.value)} placeholder="none" style={{width:90,background:T.bg,border:`1px solid ${T.border}`,borderRadius:8,padding:"7px 10px",color:T.navy,fontSize:13,outline:"none"}}/>
                                  <button onClick={()=>saveThr(name)} style={{background:T.blueL,border:`1px solid ${T.border}`,borderRadius:16,color:T.blue,padding:"6px 14px",fontSize:12,fontWeight:700,cursor:"pointer"}}>Set alert</button>
                                  <button onClick={()=>delIng(name)} style={{marginLeft:"auto",background:"none",border:`1px solid ${T.coral}55`,borderRadius:16,color:T.coral,padding:"6px 14px",fontSize:12,fontWeight:700,cursor:"pointer"}}>Delete ingredient</button>
                                </div>
                                {(()=>{const used=recipesUsing(name);const inRecipe=used.length>0;const opts=Object.keys(data.menu).filter(mn=>data.menu[mn].category!=="drink"&&!used.includes(mn)).sort((a,b)=>a.localeCompare(b));return(
                                <div style={{marginTop:14,paddingTop:14,borderTop:`1px solid ${T.border}`}}>
                                  <div style={{fontSize:11,color:T.muted,fontWeight:800,textTransform:"uppercase",letterSpacing:"0.8px",marginBottom:8}}>Manage ingredient</div>
                                  <div style={{fontSize:12,color:inRecipe?T.slate:T.amber,marginBottom:10}}>{inRecipe?`In ${used.length} recipe${used.length>1?"s":""}: ${used.join(", ")}`:"Not in any bowl — its price shows in alerts and movers, but won't affect food cost until you add it to a recipe."}</div>
                                  <div style={{display:"flex",gap:8,flexWrap:"wrap",alignItems:"center",marginBottom:8}}>
                                    <input value={ren} onChange={e=>setRen(e.target.value)} placeholder="Rename to…" style={{flex:"1 1 160px",background:T.bg,border:`1px solid ${T.border}`,borderRadius:8,padding:"8px 11px",color:T.navy,fontSize:13,outline:"none"}}/>
                                    <button onClick={()=>startRename(name)} disabled={busy||!ren.trim()} style={{background:T.blueL,border:`1px solid ${T.border}`,borderRadius:16,color:T.blue,padding:"7px 14px",fontSize:12,fontWeight:700,cursor:busy?"wait":"pointer",opacity:busy||!ren.trim()?0.6:1}}>Rename</button>
                                    <select value={mergeInto} onChange={e=>setMergeInto(e.target.value)} style={{background:T.bg,border:`1px solid ${T.border}`,borderRadius:8,padding:"8px 10px",color:T.navy,fontSize:12,outline:"none",maxWidth:180}}><option value="">Merge into…</option>{allIngNames.filter(n=>n!==name).map(n=><option key={n} value={n}>{n}</option>)}</select>
                                    <button onClick={()=>{if(mergeInto&&window.confirm(`Merge ${name} into ${mergeInto}? Price history and recipe use combine, and ${name} is removed.`))repoint(name,mergeInto,true);}} disabled={busy||!mergeInto} style={{background:"none",border:`1px solid ${T.border}`,borderRadius:16,color:T.slate,padding:"7px 14px",fontSize:12,fontWeight:700,cursor:busy?"wait":"pointer",opacity:busy||!mergeInto?0.6:1}}>Merge</button>
                                  </div>
                                  {recipePick===name?(
                                    <div style={{background:T.bg,border:`1px solid ${T.border}`,borderRadius:10,padding:12,marginTop:4}}>
                                      <div style={{fontSize:12,color:T.slate,marginBottom:8}}>Add {name} to these — grams default in, fine-tune later in Menu</div>
                                      <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(140px,1fr))",gap:6,marginBottom:10}}>
                                        {opts.map(mn=>(
                                          <label key={mn} style={{display:"flex",alignItems:"center",gap:8,fontSize:13,border:`1px solid ${T.border}`,borderRadius:8,padding:"8px 10px",cursor:"pointer",background:recipeSel[mn]?T.blueL:T.card}}>
                                            <input type="checkbox" checked={!!recipeSel[mn]} onChange={e=>setRecipeSel(s=>({...s,[mn]:e.target.checked}))}/>{mn}
                                          </label>
                                        ))}
                                      </div>
                                      <div style={{display:"flex",gap:8}}>
                                        <button onClick={()=>doAddToRecipe(name)} disabled={busy||!Object.values(recipeSel).some(Boolean)} style={{background:T.teal,color:"#fff",border:"none",borderRadius:10,padding:"9px 16px",fontSize:13,fontWeight:800,cursor:busy?"wait":"pointer",opacity:busy||!Object.values(recipeSel).some(Boolean)?0.6:1}}>Add to {Object.values(recipeSel).filter(Boolean).length||""} bowl{Object.values(recipeSel).filter(Boolean).length===1?"":"s"}</button>
                                        <button onClick={()=>{setRecipePick(null);setRecipeSel({});}} style={{background:"transparent",border:`1px solid ${T.border}`,borderRadius:10,color:T.muted,padding:"9px 14px",fontSize:13,cursor:"pointer"}}>Cancel</button>
                                      </div>
                                    </div>
                                  ):(
                                    <button onClick={()=>{setRecipePick(name);setRecipeSel({});}} style={{background:"none",border:`1px solid ${T.border}`,borderRadius:16,color:T.blue,padding:"7px 14px",fontSize:12,fontWeight:700,cursor:"pointer"}}>+ Add to recipe</button>
                                  )}
                                </div>
                                );})()}
                                <div style={{marginTop:16}}>
                                  <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:10}}>
                                    <div style={{fontSize:14,fontWeight:700}}>Vancouver Market Price Check</div>
                                    <span style={{fontSize:11,color:T.muted}}>{chkIng===name?"Searching...":pc?"":"Runs with the daily price check"}</span>
                                  </div>
                                  {pc?.status==="loading"&&<div style={{background:T.blueL,borderRadius:10,padding:14,fontSize:14,color:T.blue}}>Searching Vancouver retailers...</div>}
                                  {pc?.status==="err"&&<div style={{background:T.coralL,borderRadius:10,padding:14,fontSize:14,color:T.coral}}>{pc.msg}</div>}
                                  {pc?.status==="ok"&&(()=>{
                                    const r=pc.data;
                                    const vc=r.verdict==="good"?T.teal:r.verdict==="high"?T.amber:T.coral;
                                    const vbg=r.verdict==="good"?T.tealL:r.verdict==="high"?T.amberL:T.coralL;
                                    return(
                                      <div style={{background:vbg,borderRadius:12,padding:16,border:`1px solid ${vc}33`}}>
                                        <div style={{fontSize:15,fontWeight:700,color:vc,marginBottom:4}}>{r.verdict==="good"?"✓ You're getting a good price":r.verdict==="high"?"↑ Paying above market":"⚠ Significantly above market"}</div>
                                        <div style={{fontSize:12,color:T.muted,marginBottom:12}}>Market range: ${r.marketRange?.low?.toFixed(2)} – ${r.marketRange?.high?.toFixed(2)}/{entries[0]?.unit}</div>
                                        <div style={{background:T.card,borderRadius:10,marginBottom:12,overflow:"hidden"}}>
                                          {r.sources?.sort((a,b)=>a.price-b.price).map((src,si)=>{
                                            const sav=(pc.paying||lat)-src.price,cheap=sav>0;
                                            return(
                                              <div key={si} style={{display:"flex",alignItems:"center",gap:10,padding:"10px 14px",borderBottom:si<r.sources.length-1?`1px solid ${T.border}`:"none"}}>
                                                <div style={{width:6,height:6,borderRadius:"50%",background:cheap?T.teal:T.border,flexShrink:0}}/>
                                                <div style={{flex:1}}>
                                                  <div style={{fontSize:14,fontWeight:600}}>{src.url&&/^https?:\/\//.test(src.url)?<a href={src.url} target="_blank" rel="noopener noreferrer" style={{color:T.blue,textDecoration:"none"}}>{src.store} ↗</a>:<span>{src.store} <span style={{fontSize:10,color:T.amber,fontWeight:700}}>UNVERIFIED</span></span>}</div>
                                                  {src.notes&&<div style={{fontSize:11,color:T.muted}}>{src.notes}</div>}
                                                </div>
                                                <div style={{textAlign:"right"}}>
                                                  <div style={{fontSize:14,fontWeight:700,color:cheap?T.teal:T.slate}}>${fmt(src.price)}</div>
                                                  {cheap&&<div style={{fontSize:11,color:T.teal,fontWeight:600}}>Save ${fmt(sav)}</div>}
                                                </div>
                                              </div>
                                            );
                                          })}
                                        </div>
                                        <div style={{fontSize:13,color:vc,fontWeight:600,marginBottom:6}}>💡 {r.recommendation}</div>
                                        <div style={{fontSize:11,color:T.muted}}>Checked {pc.at} · {pc.scope==="preferred"?"Preferred suppliers":"Market-wide"} · indicative only</div>
                                      </div>
                                    );
                                  })()}
                                </div>
                              </div>
                            )}
                          </div>
                        );
                      }
                      return(
                        <div key={name} onClick={()=>openAdd(name)} style={{display:"flex",alignItems:"center",gap:10,padding:"10px 16px",borderBottom:last?"none":`1px solid ${T.border}`,cursor:"pointer"}}>
                          <input type="checkbox" checked={isChecked(name)} onClick={e=>e.stopPropagation()} onChange={()=>toggleCheck(name)} title={isChecked(name)?"Included in live price checks":"Excluded (prepared / not bought raw)"} style={{cursor:"pointer",flexShrink:0}}/>
                          <div style={{flex:1,fontSize:13,fontWeight:600,color:T.slate}}>{name}{meta&&meta.addon&&meta.addonPrice>0?<span style={{marginLeft:8,fontSize:10,color:T.muted}}>add-on ${fmt(meta.addonPrice)}</span>:null}</div>
                          <div style={{fontSize:11,color:T.muted,fontStyle:"italic"}}>{meta&&meta.usedIn?`in ${meta.usedIn.split(", ").filter(Boolean).length} item(s)`:"add-on / BYO"}</div>
                          <div style={{fontSize:12,fontWeight:700,color:T.blue,width:100,textAlign:"right"}}>+ add price</div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        );
      })()}
    </div>
  );
}

// ─── SUPPLIERS ───────────────────────────────────────────────────────────────
function Suppliers({T,isMobile,isDesktop,card,Tag,data,selSup,setSelSup,say,reload,armPaid}){
  const [editSup,setEditSup]=useState(null);
  const [ef,setEf]=useState({});
  const [showAdd,setShowAdd]=useState(false);
  const [nf,setNf]=useState({name:"",type:"trade",contact:"",phone:"",email:"",website:"",terms:"",delivery:"",notes:""});
  const [adding,setAdding]=useState(false);
  const [dCat,setDCat]=useState("Any");
  const [dRad,setDRad]=useState(20);
  const [dLoc,setDLoc]=useState("both");
  const [dBusy,setDBusy]=useState(false);
  const [dResults,setDResults]=useState(null);
  const [refBusy,setRefBusy]=useState(false);
  const [refResults,setRefResults]=useState(null);
  const [catalog,setCatalog]=useState([]);
  const [pick,setPick]=useState("");
  const loadCatalog=async()=>{try{setCatalog(await loadDiscovered());}catch(e){console.error(e);}};
  useEffect(()=>{loadCatalog();},[]);
  const inp={background:T.bg,border:`1px solid ${T.border}`,borderRadius:8,padding:"9px 12px",color:T.navy,fontSize:13,fontFamily:"inherit",outline:"none",width:"100%"};

  const now=new Date();
  const monthStart=new Date(now.getFullYear(),now.getMonth(),1).getTime();
  const yearStart=new Date(now.getFullYear(),0,1).getTime();
  const allEntries=[];
  Object.entries(data.ingredients).forEach(([ing,entries])=>entries.forEach(e=>allEntries.push({...e,ingredient:ing})));
  const spend=(name,since)=>allEntries.filter(e=>e.supplier===name&&e.line_total!=null&&new Date(e.date).getTime()>=since).reduce((sm,e)=>sm+e.line_total,0);

  const wins={},losses={};
  Object.entries(data.ingredients).forEach(([ing,entries])=>{
    const bySup={};entries.forEach(e=>{bySup[e.supplier]=e;});
    const sorted=Object.entries(bySup).sort((a,b)=>a[1].price-b[1].price);
    if(sorted.length<1)return;
    const [wName,wE]=sorted[0];
    if(!wins[wName])wins[wName]=[];
    wins[wName].push({ing,price:wE.price,unit:wE.unit,vs:sorted[1]?{sup:sorted[1][0],gap:sorted[1][1].price-wE.price}:null});
    sorted.slice(1).forEach(([lName,lE])=>{
      if(!losses[lName])losses[lName]=[];
      losses[lName].push({ing,price:lE.price,unit:lE.unit,best:wName,gap:lE.price-wE.price});
    });
  });

  const startEdit=(name,sp)=>{setEditSup(name);setEf({type:sp.type||"retail",contact:sp.contact||"",phone:sp.phone||"",email:sp.email||"",website:sp.website||"",terms:sp.terms||"",delivery:sp.delivery||"",notes:sp.notes||"",preferred:!!sp.preferred,address:sp.address||""});};
  const saveEdit=async()=>{try{await upsertSupplier(editSup,ef);await reload();say("Supplier updated");setEditSup(null);}catch(e){say("Save failed",true);}};
  const delSup=async(name)=>{
    if(!window.confirm(`Delete supplier "${name}"?`))return;
    try{await deleteSupplier(name);await reload();setSelSup(null);say(`${name} deleted`);}catch(e){say("Delete failed",true);}
  };
  const addSup=async()=>{
    const name=nf.name.trim();if(!name)return;
    if(data.suppliers[name]){say("That supplier already exists",true);return;}
    setAdding(true);
    try{const {name:_,...fields}=nf;await upsertSupplier(name,fields);await reload();say(`${name} added`);setShowAdd(false);setNf({name:"",type:"trade",contact:"",phone:"",email:"",website:"",terms:"",delivery:"",notes:""});}
    catch(e){say("Add failed",true);}
    setAdding(false);
  };
  const discover=async()=>{
    const gate=await canRunToday("discovery");
    if(!gate.allowed){say(`Discovery limit reached (${gate.used}/${gate.limit} today) — try again tomorrow`,true);return;}
    setDBusy(true);setDResults(null);
    await recordRun("discovery","");
    try{
      const where=dLoc==="loc1"?"West 8th & Cambie, Vancouver BC":dLoc==="loc2"?"Ironwood Plaza, Richmond BC":"a poke restaurant with locations at West 8th & Cambie Vancouver BC and Ironwood Plaza Richmond BC";
      const prompt=`Find real food suppliers within ${dRad}km of ${where} that a small restaurant could buy from. Measure distance from ${dLoc==="both"?"whichever location is nearer":"that location only"}. Include BOTH (a) wholesalers and distributors for bulk buying, AND (b) grocery and retail stores — this is a small 2-location poke restaurant that also buys smaller quantities from grocery/retail for low-volume, specialty, or perishable items to avoid food waste, so retail options are useful, not just bulk. Category: ${dCat==="Any"?"seafood, produce, or dry goods":dCat}. Return ONLY JSON no markdown: {"suppliers":[{"name":"","type":"wholesale | distributor | grocery | retail","category":"","city":"","street":"street address only, or empty","website":"https URL or empty","distance":"~Xkm from <location>","notes":"one line: what they offer, bulk or retail, terms if known"}]}. Return up to 25 results, mixing wholesale and grocery/retail where both exist. Only real, verifiable businesses — do NOT invent entries or pad the list to reach 25, and do NOT repeat the same business twice (a chain with multiple branches is fine only if the street addresses genuinely differ). If nothing found: {"suppliers":[]}`;
      const r=await claudeFetch({model:MODEL,max_tokens:4000,tools:[{type:"web_search_20250305",name:"web_search",max_uses:DISCOVERY_MAX_USES}],messages:[{role:"user",content:prompt}]});
      const out=await r.json();
      if(!r.ok){say((out?.error?.message||`API error ${r.status}`).slice(0,140),true);setDBusy(false);return;}
      const parsed=pickJson(out);
      const list=(parsed.suppliers||[]).slice(0,25);
      setDResults(list);
      // Bank every result into the discovered-suppliers catalog so the search is never wasted
      if(list.length){
        try{await saveDiscovered(list.map(s=>({name:s.name,website:s.website||"",city:s.city||"",street:s.street||"",type:s.type||"",dedup_key:dedupKey(s.name,s.city,s.street)})));await loadCatalog();}catch(e){console.error(e);}
      }
      if(!list.length)say("No suppliers found — try a wider radius",true);
    }catch(e){console.error(e);say("Search failed — try again",true);}
    setDBusy(false);
  };
  const addPreferred=async(r)=>{
    try{
      await upsertSupplier(r.name,{type:/grocery|retail/i.test(r.type||"")?"retail":"trade",preferred:true,website:r.website||"",address:[r.street,r.city].filter(Boolean).join(", ")||r.address||"",notes:`${r.category||""} · ${r.distance||""} · ${r.notes||""}`.trim()});
      await reload();say(`${r.name} added to preferred`);
    }catch(e){say("Add failed",true);}
  };
  const togglePreferred=async(name,sp)=>{
    try{await upsertSupplier(name,{...sp,preferred:!sp.preferred});await reload();}
    catch(e){say("Update failed",true);}
  };
  const refreshPreferred=async()=>{
    const prefs=Object.entries(data.suppliers).filter(([,sp])=>sp.preferred).map(([n])=>n);
    if(!prefs.length){say("No preferred suppliers yet — star some first",true);return;}
    const gate=await canRunToday("preferred_refresh");
    if(!gate.allowed){say(`Preferred refresh limit reached (${gate.used}/${gate.limit} today) — try again tomorrow`,true);return;}
    setRefBusy(true);setRefResults(null);
    await recordRun("preferred_refresh","");
    const ingList=Object.entries(data.ingredients).map(([n,e])=>`${n} (per ${e[0]?.unit||"unit"})`).join(", ");
    const results={};
    for(const supName of prefs){
      try{
        const site=data.suppliers[supName]?.website||"";
        const siteHint=site?` Their website is ${site} — check that site first before searching elsewhere.`:"";
        const r=await claudeFetch({model:MODEL,max_tokens:900,tools:[{type:"web_search_20250305",name:"web_search",max_uses:2}],messages:[{role:"user",content:`Search current prices at "${supName}" in Vancouver BC area for these restaurant ingredients: ${ingList}.${siteHint} Return ONLY JSON no markdown: {"found":[{"ingredient":"","price":0.00,"unit":"","notes":"brief"}]}. Only include items with a genuine price signal. If none: {"found":[]}`}]});
        const out=await r.json();
        if(!r.ok){results[supName]={found:[],err:true};continue;}
        const parsed=pickJson(out);
        results[supName]={found:parsed.found||[],at:new Date().toLocaleDateString("en-CA")};
      }catch(e){results[supName]={found:[],err:true};}
    }
    setRefResults(results);setRefBusy(false);say("Preferred price refresh complete");
  };
  const exportSupCsv=(name)=>{
    const rows=[["Date","Ingredient","Unit price","Unit","Quantity","Line total"]];
    allEntries.filter(e=>e.supplier===name).sort((a,b)=>a.date<b.date?1:-1).forEach(e=>rows.push([e.date,e.ingredient,e.price,e.unit,e.quantity??"",e.line_total??""]));
    const csv=rows.map(r=>r.map(c=>`"${String(c).replace(/"/g,'""')}"`).join(",")).join("\n");
    const blob=new Blob([csv],{type:"text/csv"});
    const a=document.createElement("a");a.href=URL.createObjectURL(blob);a.download=`${name.replace(/\s/g,"-")}-line-items.csv`;a.click();URL.revokeObjectURL(a.href);
  };

  return(
    <div>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:6,flexWrap:"wrap",gap:8}}>
        <h2 style={{margin:0,fontSize:isMobile?20:26,fontWeight:800,letterSpacing:"-0.5px"}}>Suppliers</h2>
        <button onClick={()=>setShowAdd(v=>!v)} style={{background:showAdd?"transparent":T.blue,color:showAdd?T.muted:"#fff",border:showAdd?`1px solid ${T.border}`:"none",padding:"8px 16px",borderRadius:20,fontSize:13,cursor:"pointer",fontWeight:700}}>{showAdd?"Cancel":"+ Add supplier"}</button>
      </div>
      <p style={{margin:"0 0 16px",fontSize:isMobile?12:13,color:T.muted}}>Spend figures build from receipts scanned with quantities · tap a supplier for detail and line items</p>

      {showAdd&&(
        <div style={{...card,marginBottom:14,borderColor:T.blue}}>
          <div style={{fontSize:15,fontWeight:700,marginBottom:12}}>Add a supplier</div>
          {catalog.length>0&&(
            <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:12,flexWrap:"wrap"}}>
              <span style={{fontSize:11,color:T.muted,fontWeight:700}}>PREFILL FROM DISCOVERED</span>
              <select value={pick} onChange={e=>{const c=catalog.find(x=>String(x.id)===e.target.value);setPick(e.target.value);if(c)setNf(p=>({...p,name:c.name,website:c.website||"",notes:[c.city,c.street].filter(Boolean).join(", ")||p.notes}));}} style={{...inp,width:"auto",minWidth:220}}>
                <option value="">Pick a discovered supplier…</option>
                {catalog.map(c=><option key={c.id} value={c.id}>{c.name}{c.city?` — ${c.city}`:""}</option>)}
              </select>
              <span style={{fontSize:11,color:T.muted}}>or type below</span>
            </div>
          )}
          <div style={{display:"grid",gridTemplateColumns:isMobile?"1fr 1fr":"repeat(4,1fr)",gap:8,marginBottom:10}}>
            <div><div style={{fontSize:10,color:T.muted,fontWeight:700,marginBottom:3}}>NAME *</div><input value={nf.name} onChange={e=>setNf(p=>({...p,name:e.target.value}))} style={inp}/></div>
            <div><div style={{fontSize:10,color:T.muted,fontWeight:700,marginBottom:3}}>TYPE</div><select value={nf.type} onChange={e=>setNf(p=>({...p,type:e.target.value}))} style={inp}><option value="trade">Trade account</option><option value="retail">Retail (cash)</option></select></div>
            <div><div style={{fontSize:10,color:T.muted,fontWeight:700,marginBottom:3}}>TERMS</div><input value={nf.terms} onChange={e=>setNf(p=>({...p,terms:e.target.value}))} placeholder="e.g. Net 14" style={inp}/></div>
            <div><div style={{fontSize:10,color:T.muted,fontWeight:700,marginBottom:3}}>DELIVERY</div><input value={nf.delivery} onChange={e=>setNf(p=>({...p,delivery:e.target.value}))} placeholder="e.g. Mon/Wed" style={inp}/></div>
            <div><div style={{fontSize:10,color:T.muted,fontWeight:700,marginBottom:3}}>CONTACT</div><input value={nf.contact} onChange={e=>setNf(p=>({...p,contact:e.target.value}))} style={inp}/></div>
            <div><div style={{fontSize:10,color:T.muted,fontWeight:700,marginBottom:3}}>PHONE</div><input value={nf.phone} onChange={e=>setNf(p=>({...p,phone:e.target.value}))} style={inp}/></div>
            <div><div style={{fontSize:10,color:T.muted,fontWeight:700,marginBottom:3}}>EMAIL</div><input value={nf.email} onChange={e=>setNf(p=>({...p,email:e.target.value}))} style={inp}/></div>
            <div><div style={{fontSize:10,color:T.muted,fontWeight:700,marginBottom:3}}>WEBSITE</div><input value={nf.website} onChange={e=>setNf(p=>({...p,website:e.target.value}))} placeholder="https://…" style={inp}/></div>
            <div><div style={{fontSize:10,color:T.muted,fontWeight:700,marginBottom:3}}>NOTES</div><input value={nf.notes} onChange={e=>setNf(p=>({...p,notes:e.target.value}))} style={inp}/></div>
          </div>
          <button onClick={addSup} disabled={adding||!nf.name.trim()} style={{background:T.teal,color:"#fff",border:"none",borderRadius:10,padding:"10px 24px",fontSize:14,fontWeight:800,cursor:"pointer",opacity:adding||!nf.name.trim()?0.6:1}}>{adding?"Adding...":"Add supplier"}</button>
        </div>
      )}

      <div style={{...card,marginBottom:14}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",gap:10,flexWrap:"wrap",marginBottom:dResults?12:0}}>
          <div><div style={{fontSize:14,fontWeight:700}}>Find new suppliers</div>{catalog.length>0&&<div style={{fontSize:11,color:T.muted,marginTop:2}}>{catalog.length} supplier{catalog.length!==1?"s":""} already discovered — check the list before spending a new search</div>}</div>
          <div style={{display:"flex",gap:6,alignItems:"center",flexWrap:"wrap"}}>
            <select value={dCat} onChange={e=>setDCat(e.target.value)} style={{background:T.bg,border:`1px solid ${T.border}`,borderRadius:14,padding:"6px 12px",color:T.navy,fontSize:12,fontWeight:600,outline:"none"}}>
              {["Any","Seafood","Produce","Dry goods"].map(c=><option key={c}>{c}</option>)}
            </select>
            <div style={{display:"flex",gap:2,background:T.bg,border:`1px solid ${T.border}`,borderRadius:14,padding:2}}>
              {[["both","Both"],["loc1","West 8th"],["loc2","Ironwood"]].map(([id,lb])=><button key={id} onClick={()=>setDLoc(id)} style={{background:dLoc===id?T.blue:"transparent",color:dLoc===id?"#fff":T.slate,border:"none",borderRadius:12,padding:"4px 10px",fontSize:12,fontWeight:600,cursor:"pointer"}}>{lb}</button>)}
            </div>
            <div style={{display:"flex",gap:2,background:T.bg,border:`1px solid ${T.border}`,borderRadius:14,padding:2}}>
              {[10,20,30].map(r=><button key={r} onClick={()=>setDRad(r)} style={{background:dRad===r?T.blue:"transparent",color:dRad===r?"#fff":T.slate,border:"none",borderRadius:12,padding:"4px 10px",fontSize:12,fontWeight:600,cursor:"pointer"}}>{r}km</button>)}
            </div>
            <button onClick={()=>armPaid?armPaid({label:"Supplier discovery search (~$0.10)",secs:10,lastAt:null,fn:discover}):discover()} disabled={dBusy} style={{background:T.blue,color:"#fff",border:"none",borderRadius:16,padding:"7px 16px",fontSize:12,fontWeight:700,cursor:"pointer",opacity:dBusy?0.6:1}}>{dBusy?"Searching...":"\ud83d\udd0d Search · up to 25 · ~$0.10 · 1/day"}</button>
          </div>
        </div>
        <div style={{fontSize:10,color:T.muted,marginTop:dResults?0:8,marginBottom:dResults?8:0}}>Returns up to 25 real suppliers (often fewer exist nearby). Every result is saved to your discovered-suppliers list so the search is never wasted.</div>
        {dResults&&dResults.length>0&&(
          <div style={{borderTop:`1px solid ${T.border}`,paddingTop:8}}>
            {dResults.map((r,i)=>(
              <div key={i} style={{display:"flex",justifyContent:"space-between",alignItems:"center",gap:10,padding:"9px 0",borderBottom:i<dResults.length-1?`1px solid ${T.border}`:"none"}}>
                <div style={{flex:1,minWidth:0}}>
                  <div style={{fontSize:13,fontWeight:700,display:"flex",alignItems:"center",gap:6,flexWrap:"wrap"}}>{r.website?<a href={/^https?:\/\//.test(r.website)?r.website:`https://${r.website}`} target="_blank" rel="noopener noreferrer" style={{color:T.blue,textDecoration:"none"}}>{r.name} ↗</a>:r.name}{r.type&&<span style={{fontSize:9,fontWeight:700,textTransform:"uppercase",letterSpacing:"0.5px",color:/whole|distrib/i.test(r.type)?T.blue:T.teal,background:/whole|distrib/i.test(r.type)?T.blueL:T.tealL,padding:"1px 7px",borderRadius:10}}>{r.type}</span>}</div>
                  <div style={{fontSize:11,color:T.muted}}>{[r.category,r.city,r.distance,r.notes].filter(Boolean).join(" \u00b7 ")}</div>
                </div>
                {data.suppliers[r.name]
                  ?<Tag c={T.teal} bg={T.tealL} sm>{"\u2713"} In your list</Tag>
                  :<button onClick={()=>addPreferred(r)} style={{background:T.tealL,border:`1px solid ${T.teal}44`,borderRadius:16,color:T.teal,padding:"6px 12px",fontSize:12,fontWeight:700,cursor:"pointer",whiteSpace:"nowrap"}}>{"\u2606"} Add to preferred</button>}
              </div>
            ))}
            <div style={{fontSize:10,color:T.muted,marginTop:8}}>Web results are indicative \u2014 verify details before ordering. Contact info may be incomplete for trade-only suppliers.</div>
          </div>
        )}
      </div>

      <div style={{...card,marginBottom:14}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",gap:10,flexWrap:"wrap"}}>
          <div style={{fontSize:14,fontWeight:700}}>{"\u2605"} Preferred suppliers <span style={{fontSize:12,color:T.muted,fontWeight:400}}>({Object.values(data.suppliers).filter(sp=>sp.preferred).length})</span></div>
        </div>
        <div style={{fontSize:11,color:T.muted,marginTop:6}}>Star the suppliers you actually buy from. The table below shows the actual prices you've paid them, from receipts. Live market prices are on the dashboard's "Best price today", which sources only from your preferred suppliers.</div>
      </div>

      <div style={{...card,padding:0,overflow:"hidden"}}>
        <div style={{display:"grid",gridTemplateColumns:isMobile?"1fr auto auto":"2fr 1fr 1fr 1fr 1fr",gap:8,padding:"10px 16px",background:T.bg,fontSize:10,color:T.muted,fontWeight:700,textTransform:"uppercase",letterSpacing:"0.8px"}}>
          <div>Supplier</div>
          {!isMobile&&<div>Type</div>}
          {!isMobile&&<div style={{textAlign:"right"}}>Cheapest on</div>}
          <div style={{textAlign:"right"}}>This month</div>
          <div style={{textAlign:"right"}}>This year</div>
        </div>
        {Object.entries(data.suppliers).sort((a,b)=>(b[1].preferred?1:0)-(a[1].preferred?1:0)||spend(b[0],yearStart)-spend(a[0],yearStart)).map(([name,sp],i,arr)=>{
          const isSel=selSup===name;
          const mSpend=spend(name,monthStart),ySpend=spend(name,yearStart);
          const w=(wins[name]||[]).length,l=(losses[name]||[]).length;
          return(
            <div key={name} style={{borderTop:`1px solid ${T.border}`}}>
              <div onClick={()=>setSelSup(isSel?null:name)} style={{display:"grid",gridTemplateColumns:isMobile?"1fr auto auto":"2fr 1fr 1fr 1fr 1fr",gap:8,padding:"12px 16px",cursor:"pointer",background:isSel?T.blueL:"transparent",alignItems:"center"}}>
                <div style={{fontSize:isMobile?13:15,fontWeight:700,display:"flex",alignItems:"center",gap:6}}>
                  <button onClick={e=>{e.stopPropagation();togglePreferred(name,sp);}} title={sp.preferred?"Remove from preferred":"Add to preferred"} style={{background:"none",border:"none",cursor:"pointer",fontSize:15,padding:0,color:sp.preferred?T.amber:T.border,lineHeight:1}}>{sp.preferred?"\u2605":"\u2606"}</button>
                  {sp.website
                    ?<a href={/^https?:\/\//.test(sp.website)?sp.website:`https://${sp.website}`} target="_blank" rel="noopener noreferrer" onClick={e=>e.stopPropagation()} title="Open supplier website" style={{color:T.blue,textDecoration:"none"}}>{name} <span style={{fontSize:11}}>↗</span></a>
                    :name}
                </div>
                {!isMobile&&<div style={{fontSize:12,color:T.muted}}>{sp.type==="trade"?"Trade":"Retail"}</div>}
                {!isMobile&&<div style={{textAlign:"right",fontSize:13}}>{w+l>0?<span style={{fontWeight:700,color:w>=l?T.teal:T.coral}}>{w} of {w+l}</span>:<span style={{color:T.muted}}>{"\u2014"}</span>}</div>}
                <div style={{textAlign:"right",fontSize:isMobile?12:14,fontWeight:600,color:mSpend?T.navy:T.muted}}>{mSpend?`$${fmt(mSpend)}`:"\u2014"}</div>
                <div style={{textAlign:"right",fontSize:isMobile?12:14,fontWeight:600,color:ySpend?T.navy:T.muted}}>{ySpend?`$${fmt(ySpend)}`:"\u2014"}</div>
              </div>
              {isSel&&(
                <div style={{padding:"14px 16px",borderTop:`1px solid ${T.border}`,background:T.bg}}>
                  {editSup===name?(
                    <div>
                      <div style={{display:"grid",gridTemplateColumns:isMobile?"1fr 1fr":"1fr 1fr 1fr",gap:8,marginBottom:10}}>
                        {[["contact","Contact"],["phone","Phone"],["email","Email"],["website","Website"],["terms","Terms"],["delivery","Delivery days"]].map(([k,lb])=>(
                          <div key={k}><div style={{fontSize:10,color:T.muted,fontWeight:700,marginBottom:3}}>{lb.toUpperCase()}</div><input value={ef[k]} onChange={e=>setEf(p=>({...p,[k]:e.target.value}))} style={{...inp,background:T.card}}/></div>
                        ))}
                        <div><div style={{fontSize:10,color:T.muted,fontWeight:700,marginBottom:3}}>TYPE</div><select value={ef.type} onChange={e=>setEf(p=>({...p,type:e.target.value}))} style={{...inp,background:T.card}}><option value="trade">Trade account</option><option value="retail">Retail (cash)</option></select></div>
                      </div>
                      <div style={{marginBottom:10}}><div style={{fontSize:10,color:T.muted,fontWeight:700,marginBottom:3}}>NOTES</div><input value={ef.notes} onChange={e=>setEf(p=>({...p,notes:e.target.value}))} style={{...inp,background:T.card}}/></div>
                      <div style={{display:"flex",gap:8}}>
                        <button onClick={saveEdit} style={{background:T.teal,color:"#fff",border:"none",borderRadius:16,padding:"8px 18px",fontSize:13,fontWeight:700,cursor:"pointer"}}>Save</button>
                        <button onClick={()=>setEditSup(null)} style={{background:"transparent",border:`1px solid ${T.border}`,borderRadius:16,color:T.muted,padding:"8px 18px",fontSize:13,cursor:"pointer"}}>Cancel</button>
                      </div>
                    </div>
                  ):(
                    <div>
                      <div style={{display:"flex",flexWrap:"wrap",gap:14,marginBottom:12,fontSize:13,color:T.slate}}>
                        {sp.terms&&<span><strong>Terms</strong> {sp.terms}</span>}
                        {sp.delivery&&<span><strong>Delivery</strong> {sp.delivery}</span>}
                        {sp.contact&&<span><strong>Contact</strong> {sp.contact}</span>}
                        {sp.phone&&<span><strong>Phone</strong> {sp.phone}</span>}
                        {sp.email&&<span><strong>Email</strong> {sp.email}</span>}
                        {sp.website&&<span><strong>Website</strong> <a href={/^https?:\/\//.test(sp.website)?sp.website:`https://${sp.website}`} target="_blank" rel="noopener noreferrer" style={{color:T.blue,textDecoration:"none"}}>{sp.website.replace(/^https?:\/\//,"")} ↗</a></span>}
                        {sp.address&&<span><strong>Address</strong> {sp.address}</span>}
                      </div>
                      {sp.notes&&<div style={{fontSize:12,color:T.muted,fontStyle:"italic",marginBottom:12}}>{sp.notes}</div>}
                      {(wins[name]||[]).length>0&&(
                        <div style={{marginBottom:10}}>
                          <div style={{fontSize:11,color:T.teal,fontWeight:800,marginBottom:6}}>{"\u2713"} CHEAPEST ON</div>
                          <div style={{display:"flex",flexWrap:"wrap",gap:6}}>
                            {wins[name].map(wn=><Tag key={wn.ing} c={T.teal} bg={T.tealL} sm>{wn.ing} ${wn.price.toFixed(2)}{wn.vs?` (${wn.vs.sup} +$${wn.vs.gap.toFixed(2)})`:""}</Tag>)}
                          </div>
                        </div>
                      )}
                      {(losses[name]||[]).length>0&&(
                        <div style={{marginBottom:12}}>
                          <div style={{fontSize:11,color:T.coral,fontWeight:800,marginBottom:6}}>{"\u2717"} BEATEN ON</div>
                          <div style={{display:"flex",flexWrap:"wrap",gap:6}}>
                            {losses[name].map(ls=><Tag key={ls.ing} c={T.coral} bg={T.coralL} sm>{ls.ing} +${ls.gap.toFixed(2)} vs {ls.best}</Tag>)}
                          </div>
                        </div>
                      )}
                      <div style={{display:"flex",gap:8,flexWrap:"wrap"}}>
                        <button onClick={()=>exportSupCsv(name)} style={{background:T.blueL,border:`1px solid ${T.border}`,borderRadius:16,color:T.blue,padding:"7px 16px",fontSize:12,fontWeight:700,cursor:"pointer"}}>{"\u2b07"} Line items CSV</button>
                        <button onClick={()=>startEdit(name,sp)} style={{background:T.blueL,border:`1px solid ${T.border}`,borderRadius:16,color:T.blue,padding:"7px 16px",fontSize:12,fontWeight:700,cursor:"pointer"}}>{"\u270e"} Edit</button>
                        <button onClick={()=>delSup(name)} style={{marginLeft:"auto",background:"none",border:`1px solid ${T.coral}55`,borderRadius:16,color:T.coral,padding:"7px 16px",fontSize:12,fontWeight:700,cursor:"pointer"}}>Delete</button>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── MULTI-LINE TREND CHART ──────────────────────────────────────────────
function MultiLine({series,T,money=true}){
  const pts=series[0]?.points||[];
  if(!pts.length)return <div style={{padding:"20px 0",color:T.muted,fontSize:13,textAlign:"center"}}>Not enough data yet — enter more months of sales.</div>;
  const FC=pts.length>=3?2:0; // forecast points, unlocked at 3 actuals
  const proj=(arr)=>{ // straight-line from last 3 points
    if(FC===0)return [];
    const last=arr.slice(-3).map(p=>p.y);
    const slope=(last[2]-last[0])/2;
    return [1,2].map(k=>Math.max(0,last[2]+slope*k));
  };
  const W=560,H=190,pl=54,pr=14,pt=14,pb=34,iw=W-pl-pr,ih=H-pt-pb;
  const total=pts.length+FC;
  const all=series.flatMap(sr=>[...sr.points.map(p=>p.y),...proj(sr.points)]);
  const mx=Math.max(...all)*1.08||1,mn=0;
  const tx=i=>pl+(total>1?(i/(total-1))*iw:iw/2);
  const ty=v=>pt+ih-((v-mn)/(mx-mn))*ih;
  const fv=v=>money?(v>=1000?`$${(v/1000).toFixed(0)}k`:`$${v.toFixed(0)}`):v>=1000?`${(v/1000).toFixed(1)}k`:`${Math.round(v)}`;
  return(
    <div>
      <svg width="100%" viewBox={`0 0 ${W} ${H}`} style={{maxWidth:"100%"}}>
        {[mn,(mn+mx)/2,mx].map((t,i)=><g key={i}><line x1={pl} y1={ty(t)} x2={W-pr} y2={ty(t)} stroke={T.border} strokeWidth="1" strokeDasharray="4 4"/><text x={pl-6} y={ty(t)+4} textAnchor="end" fontSize="10" fill={T.muted}>{fv(t)}</text></g>)}
        {FC>0&&<rect x={tx(pts.length-1)} y={pt-4} width={tx(total-1)-tx(pts.length-1)+8} height={ih+8} fill={T.border} opacity="0.18" rx="6"/>}
        {series.map((sr,si)=>{
          const fp=proj(sr.points);
          return(
          <g key={si}>
            <polyline points={sr.points.map((p,i)=>`${tx(i)},${ty(p.y)}`).join(" ")} fill="none" stroke={sr.color} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/>
            {fp.length>0&&<polyline points={[`${tx(pts.length-1)},${ty(sr.points[pts.length-1].y)}`,...fp.map((v,k)=>`${tx(pts.length+k)},${ty(v)}`)].join(" ")} fill="none" stroke={sr.color} strokeWidth="2.5" strokeDasharray="6 5" opacity="0.6" strokeLinecap="round"/>}
            {sr.points.map((p,i)=><circle key={i} cx={tx(i)} cy={ty(p.y)} r="3.5" fill={sr.color}/>)}
          </g>
        );})}
        {pts.map((p,i)=><text key={i} x={tx(i)} y={H-pb+18} textAnchor="middle" fontSize="9" fill={T.muted}>{p.label}</text>)}
        {FC>0&&<text x={(tx(pts.length-1)+tx(total-1))/2} y={H-pb+18} textAnchor="middle" fontSize="8" fill={T.muted}>FORECAST</text>}
      </svg>
      <div style={{display:"flex",gap:14,flexWrap:"wrap",marginTop:4,alignItems:"center"}}>
        {series.map((sr,i)=><div key={i} style={{display:"flex",alignItems:"center",gap:6,fontSize:12,color:T.slate}}><div style={{width:10,height:10,borderRadius:3,background:sr.color}}/>{sr.label}</div>)}
        <div style={{fontSize:11,color:T.muted}}>{FC>0?"Dashed = straight-line forecast from your actuals":"Forecast unlocks at 3 periods of data"}</div>
      </div>
    </div>
  );
}

// ─── SALES & P&L ─────────────────────────────────────────────────────────────
function Sales({T,isMobile,isDesktop,card,Tag,data,loc,locKey,cRev,cCOGS,cBowlRev,cOtherRev,bowlUnits,bowlUnitsTotal,sizeAgg,totalBowls,costSz,isBowl,bCost,bCostAtApp,costSzAt,priceFor,blendedPrice,bFCP,bMargin,months,say,onSaveSales}){
  const SZ=["small","medium","large"];
  const [showForm,setShowForm]=useState(false);
  const [fMonth,setFMonth]=useState("");
  const [fL1,setFL1]=useState("");
  const [fL2,setFL2]=useState("");
  const [parsedMix,setParsedMix]=useState(null);
  const [parseMsg,setParseMsg]=useState(null);
  const [saving,setSaving]=useState(false);
  const [period,setPeriod]=useState("month");
  // Historical view: default to last month; if it has no data, fall back to the
  // most recent month that does (current month included). No data at all → last month.
  const [off,setOff]=useState(()=>{
    const MNi=["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
    const now=new Date();
    const key=o=>{const d=new Date(now.getFullYear(),now.getMonth()-o);return `${MNi[d.getMonth()]} ${d.getFullYear()}`;};
    if(data.sales[key(1)])return 1;
    for(let o=0;o<24;o++)if(data.sales[key(o)])return o;
    return 1;
  });
  const [mcaSz,setMcaSz]=useState("agg");
  const [editMonth,setEditMonth]=useState(null);
  const [ed,setEd]=useState(null);
  const [edSaving,setEdSaving]=useState(false);
  const upRef=useRef(null);
  const MNc=["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
  const monthOptions=(()=>{
    const opts=[];const now=new Date();
    for(let i=0;i<12;i++){const d=new Date(now.getFullYear(),now.getMonth()-i);opts.push(`${MNc[d.getMonth()]} ${d.getFullYear()}`);}
    return opts;
  })();
  const catLabel=m=>isBowl(m)?"Bowl":m.category==="side"?"Side":m.category==="drink"?"Drink":"Item";
  const orderedMenu=Object.entries(data.menu).sort((a,b)=>{
    const rank=m=>isBowl(m[1])?0:m[1].category==="side"?1:m[1].category==="drink"?2:3;
    return rank(a)-rank(b)||a[0].localeCompare(b[0]);
  });

  // ── Build the fixed Excel template in-browser (same structure the parser expects) ──
  const downloadTemplate=()=>{
    const wb=XLSX.utils.book_new();
    const readme=[
      ["Westcoast Poké — Monthly Product Mix template"],
      [],
      ["How to use"],
      ["1. One file covers ONE month, both locations (one tab per location)."],
      ["2. On each location tab, fill the bowl counts from your POS monthly product report."],
      ["3. Bowls use the S / M / L columns. For sides and drinks, enter the total $ value sold in the One-size column of the two Totals rows."],
      ["4. Enter 0 where nothing sold. Leave the Category / Sub-category columns as they are."],
      ["5. Set the Month cell on each tab to the month you're reporting."],
      ["6. Save, then use ‘Upload counts’ in the app — total sales $ is still typed in by hand."],
      [],
      ["Do not rename the Category header row or the Location / Month rows — the importer looks for them."],
    ];
    XLSX.utils.book_append_sheet(wb,XLSX.utils.aoa_to_sheet(readme),"Read me");
    [data.locations.loc1,data.locations.loc2].forEach(locName=>{
      const rows=[
        ["Westcoast Poké — Monthly Product Mix"],
        ["Location:",locName],
        ["Month:",""],
        [],
        ["Category","Sub-category","One-size","S","M","L"],
      ];
      orderedMenu.forEach(([name,m])=>{
        if(isBowl(m))rows.push(["Bowl",name,"","","",""]);
      });
      rows.push([]);
      rows.push(["Totals","Sides — total $ sold","","","",""]);
      rows.push(["Totals","Drinks — total $ sold","","","",""]);
      const ws=XLSX.utils.aoa_to_sheet(rows);
      ws["!cols"]=[{wch:12},{wch:26},{wch:10},{wch:8},{wch:8},{wch:8}];
      XLSX.utils.book_append_sheet(wb,ws,locName.slice(0,31));
    });
    XLSX.writeFile(wb,`westcoast-poke-product-mix-${(fMonth||"template").replace(/\s+/g,"-")}.xlsx`);
  };

  // ── Parse an uploaded template into the mix shape (per parser contract) ──
  const num=v=>{const n=parseFloat(v);return isNaN(n)||n<0?0:Math.round(n);};
  const onUpload=async(e)=>{
    const file=e.target.files?.[0];if(!file)return;
    if(!fMonth){setParseMsg({err:true,text:"Pick the month first, then upload — counts attach to that month."});e.target.value="";return;}
    try{
      const buf=await file.arrayBuffer();
      const wb=XLSX.read(buf,{type:"array"});
      const mix={bowls:{},other:{},totals:{sidesRevenue:{loc1:0,loc2:0},drinksRevenue:{loc1:0,loc2:0}}};
      const money=v=>{const n=parseFloat(String(v).replace(/[$,\s]/g,""));return isNaN(n)||n<0?0:Math.round(n*100)/100;};
      const warnings=[];let boundTabs=0;
      wb.SheetNames.filter(n=>n.trim().toLowerCase()!=="read me").forEach(sn=>{
        const aoa=XLSX.utils.sheet_to_json(wb.Sheets[sn],{header:1,blankrows:false,defval:""});
        // Find a labelled value ("Location"/"Month") anywhere in the header rows; value = next cell to the right
        const labelVal=(label)=>{for(const row of aoa.slice(0,8)){for(let c=0;c<row.length;c++){if(String(row[c]||"").trim().toLowerCase().replace(/:$/,"")===label)return String(row[c+1]||"").trim();}}return "";};
        const locName=labelVal("location");
        const monCell=labelVal("month");
        let lk=null;
        if(locName&&locName.toLowerCase()===String(data.locations.loc1).toLowerCase())lk="loc1";
        else if(locName&&locName.toLowerCase()===String(data.locations.loc2).toLowerCase())lk="loc2";
        if(!lk){warnings.push(`Tab “${sn}”: Location cell “${locName||"blank"}” didn’t match either location — skipped.`);return;}
        if(monCell&&monCell.toLowerCase()!==fMonth.toLowerCase())warnings.push(`Tab “${sn}”: Month cell says “${monCell}”, importing into ${fMonth}.`);
        const hIdx=aoa.findIndex(r=>String(r[0]||"").trim().toLowerCase()==="category");
        if(hIdx<0){warnings.push(`Tab “${sn}”: no “Category” header row found — skipped.`);return;}
        for(let i=hIdx+1;i<aoa.length;i++){
          const r=aoa[i];const cat=String(r[0]||"").trim();const name=String(r[1]||"").trim();
          if(!name)continue;
          if(cat.toLowerCase()==="totals"){
            const key=name.toLowerCase().includes("drink")?"drinksRevenue":"sidesRevenue";
            mix.totals[key][lk]=money(r[2]);
            continue;
          }
          const mi=data.menu[name];
          const bowl=mi?isBowl(mi):cat.toLowerCase().includes("bowl");
          if(bowl){
            if(money(r[2])>0)warnings.push(`Tab “${sn}”: ${name} has a value in One-size — bowls use the S / M / L columns, so it was ignored.`);
            const s=num(r[3]),m=num(r[4]),l=num(r[5]);
            mix.bowls[name]=mix.bowls[name]||{small:{loc1:0,loc2:0},medium:{loc1:0,loc2:0},large:{loc1:0,loc2:0}};
            mix.bowls[name].small[lk]=s;mix.bowls[name].medium[lk]=m;mix.bowls[name].large[lk]=l;
          }else{
            const one=num(r[2]);
            mix.other[name]=mix.other[name]||{loc1:0,loc2:0};
            mix.other[name][lk]=one;
          }
        }
        boundTabs++;
      });
      if(!boundTabs){setParseMsg({err:true,text:"Couldn’t read either location tab. Use the template from the button above."});e.target.value="";return;}
      const hasExisting=Object.keys(data.sales[fMonth]?.mix?.bowls||{}).length>0;
      if(hasExisting&&!window.confirm(`Replace existing counts for ${fMonth}? This overwrites the bowl counts already saved for that month.`)){e.target.value="";return;}
      const tot=Object.keys(mix.bowls).reduce((s,bw)=>s+SZ.reduce((t,sz)=>t+(mix.bowls[bw][sz].loc1||0)+(mix.bowls[bw][sz].loc2||0),0),0);
      const totRev=["sidesRevenue","drinksRevenue"].reduce((s,k)=>s+mix.totals[k].loc1+mix.totals[k].loc2,0);
      setParsedMix(mix);
      setParseMsg({err:false,text:`Imported ${tot} bowls${totRev?` and $${totRev.toFixed(2)} of sides/drinks`:""} across ${boundTabs} location tab${boundTabs>1?"s":""}.`,warnings});
    }catch(err){console.error(err);setParseMsg({err:true,text:"That file couldn’t be read as an .xlsx template."});}
    e.target.value="";
  };

  const pickMonth=(m)=>{setFMonth(m);setParsedMix(null);setParseMsg(null);const ex=data.sales[m];if(ex){setFL1(ex.loc1?String(ex.loc1):"");setFL2(ex.loc2?String(ex.loc2):"");}else{setFL1("");setFL2("");}};

  const submit=async()=>{
    if(!fMonth)return;
    setSaving(true);
    const existing=data.sales[fMonth]||{};
    const l1=fL1!==""?(parseFloat(fL1)||0):(existing.loc1||0);
    const l2=fL2!==""?(parseFloat(fL2)||0):(existing.loc2||0);
    const mix=parsedMix||existing.mix||{bowls:{},other:{}};
    await onSaveSales(fMonth,l1,l2,mix);
    setSaving(false);setShowForm(false);setFMonth("");setFL1("");setFL2("");setParsedMix(null);setParseMsg(null);
  };

  // ── Edit-month correction modal: full template, line-editable ──
  const menuBowls=Object.entries(data.menu).filter(([,m])=>isBowl(m)).map(([n])=>n).sort((a,b)=>a.localeCompare(b));
  const menuOther=Object.entries(data.menu).filter(([,m])=>!isBowl(m)).map(([n,m])=>[n,m.category||"item"]).sort((a,b)=>a[1].localeCompare(b[1])||a[0].localeCompare(b[0]));
  const openEdit=(m)=>{
    if(!m)return;
    const s=data.sales[m]||{};const mix=s.mix||{};
    const bowls={};menuBowls.forEach(bw=>{const src=mix.bowls?.[bw]||{};bowls[bw]={};SZ.forEach(sz=>{const v=src[sz]||{};bowls[bw][sz]={l1:v.loc1!=null?String(v.loc1):"",l2:v.loc2!=null?String(v.loc2):""};});});
    const other={};menuOther.forEach(([it])=>{const v=mix.other?.[it]||{};other[it]={l1:v.loc1!=null?String(v.loc1):"",l2:v.loc2!=null?String(v.loc2):""};});
    setEd({l1:s.loc1?String(s.loc1):"",l2:s.loc2?String(s.loc2):"",bowls,other});
    setEditMonth(m);
  };
  const saveEdit=async()=>{
    if(!window.confirm(`Replace saved figures for ${editMonth}? This overwrites the totals and counts for that month.`))return;
    setEdSaving(true);
    const mix={bowls:{},other:{}};
    Object.entries(ed.bowls).forEach(([bw,szs])=>{mix.bowls[bw]={small:{loc1:0,loc2:0},medium:{loc1:0,loc2:0},large:{loc1:0,loc2:0}};SZ.forEach(sz=>{mix.bowls[bw][sz]={loc1:parseInt(szs[sz].l1)||0,loc2:parseInt(szs[sz].l2)||0};});});
    Object.entries(ed.other).forEach(([it,v])=>{mix.other[it]={loc1:parseInt(v.l1)||0,loc2:parseInt(v.l2)||0};});
    const l1=ed.l1!==""?(parseFloat(ed.l1)||0):0,l2=ed.l2!==""?(parseFloat(ed.l2)||0):0;
    await onSaveSales(editMonth,l1,l2,mix);
    setEdSaving(false);setEditMonth(null);setEd(null);
  };
  const savedMonths=months.slice().reverse();

  // ── Derived read-outs for the form (from parsed upload, or already-saved month) ──
  const previewMix=parsedMix||(fMonth?data.sales[fMonth]?.mix:null);
  const pvUnits=(bw,sz,l)=>{const v=previewMix?.bowls?.[bw]?.[sz];if(!v)return 0;return l==="loc1"?(v.loc1||0):l==="loc2"?(v.loc2||0):((v.loc1||0)+(v.loc2||0));};
  const pvAgg=(l)=>{const b=previewMix?.bowls||{};const o={small:0,medium:0,large:0};Object.keys(b).forEach(bw=>SZ.forEach(sz=>{o[sz]+=pvUnits(bw,sz,l);}));return o;};
  const pvBowlRev=(l)=>Object.keys(previewMix?.bowls||{}).reduce((t,bw)=>t+SZ.reduce((s,sz)=>s+pvUnits(bw,sz,l)*priceFor(data.menu[bw]||{},sz),0),0);
  const pvCOGS=(l)=>Object.keys(previewMix?.bowls||{}).reduce((t,bw)=>t+SZ.reduce((s,sz)=>s+pvUnits(bw,sz,l)*costSz(bw,sz),0),0);
  const agg=pvAgg("all");const pvBowls=agg.small+agg.medium+agg.large;
  const salesTotal=(fL1!==""?(parseFloat(fL1)||0):(data.sales[fMonth]?.loc1||0))+(fL2!==""?(parseFloat(fL2)||0):(data.sales[fMonth]?.loc2||0));
  const pvRev=pvBowlRev("all");const pvC=pvCOGS("all");
  const pvFcp=pvRev?(pvC/pvRev)*100:0;const pvAvg=pvBowls?pvRev/pvBowls:0;const pvOther=Math.max(0,salesTotal-pvRev);

  const inp={width:"100%",background:"#fff",border:`1px solid ${T.border}`,borderRadius:10,padding:"11px 14px",color:"#111827",fontSize:15,fontFamily:"inherit",outline:"none"};
  const readout=(lb,v,sub,tag)=>(
    <div style={{background:T.bg,border:`1px solid ${T.border}`,borderRadius:10,padding:"10px 12px"}}>
      <div style={{fontSize:9.5,color:T.inkL,fontWeight:700,textTransform:"uppercase",letterSpacing:"0.8px",marginBottom:4}}>{lb}</div>
      <div style={{fontSize:isMobile?16:19,fontWeight:900,color:T.navy,letterSpacing:"-0.5px"}}>{v}</div>
      {sub&&<div style={{fontSize:10.5,color:T.muted,marginTop:2}}>{sub}</div>}
      {tag&&<div style={{marginTop:5,fontSize:9,fontWeight:700,color:T.muted,background:T.card,border:`1px solid ${T.border}`,borderRadius:20,padding:"1px 7px",display:"inline-block"}}>{tag}</div>}
    </div>
  );

  return(
    <div>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:20,flexWrap:"wrap",gap:10}}>
        <h2 style={{margin:0,fontSize:isMobile?20:26,fontWeight:800,letterSpacing:"-0.5px"}}>Sales</h2>
        <div style={{display:"flex",gap:8,flexWrap:"wrap"}}>
          {savedMonths.length>0&&<button onClick={()=>openEdit(savedMonths[0])} style={{background:"transparent",color:T.slate,border:`1px solid ${T.border}`,borderRadius:20,padding:"9px 16px",fontSize:13,fontWeight:700,cursor:"pointer",display:"flex",alignItems:"center",gap:6}}>✎ Edit month</button>}
          <button onClick={()=>setShowForm(v=>!v)} style={{background:showForm?"transparent":T.blue,color:showForm?T.muted:"#fff",border:showForm?`1px solid ${T.border}`:"none",borderRadius:20,padding:"9px 18px",fontSize:13,fontWeight:700,cursor:"pointer"}}>{showForm?"Cancel":"+ Enter monthly sales"}</button>
        </div>
      </div>

      {editMonth&&ed&&(()=>{
        const numInp={width:44,textAlign:"center",background:T.bg,border:`1px solid ${T.border}`,borderRadius:8,padding:"7px 4px",color:T.navy,fontSize:13,outline:"none"};
        const setBowl=(bw,sz,loc,val)=>setEd(p=>({...p,bowls:{...p.bowls,[bw]:{...p.bowls[bw],[sz]:{...p.bowls[bw][sz],[loc]:val}}}}));
        const setOther=(it,loc,val)=>setEd(p=>({...p,other:{...p.other,[it]:{...p.other[it],[loc]:val}}}));
        return(
        <div onClick={()=>{if(!edSaving){setEditMonth(null);setEd(null);}}} style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.55)",zIndex:1000,display:"flex",alignItems:"flex-start",justifyContent:"center",padding:isMobile?"10px":"30px",overflowY:"auto"}}>
          <div onClick={e=>e.stopPropagation()} style={{background:T.card,border:`1px solid ${T.border}`,borderRadius:18,width:"100%",maxWidth:680,maxHeight:"92vh",display:"flex",flexDirection:"column",overflow:"hidden"}}>
            <div style={{padding:isMobile?"14px 16px":"16px 22px",borderBottom:`1px solid ${T.border}`,display:"flex",alignItems:"center",gap:12,flexWrap:"wrap"}}>
              <div style={{fontSize:isMobile?16:18,fontWeight:800}}>Edit month</div>
              <select value={editMonth} onChange={e=>openEdit(e.target.value)} style={{background:T.bg,border:`1px solid ${T.border}`,borderRadius:10,padding:"8px 12px",color:T.navy,fontSize:14,fontFamily:"inherit",outline:"none"}}>
                {savedMonths.map(m=><option key={m} value={m}>{m}</option>)}
              </select>
              <button onClick={()=>{setEditMonth(null);setEd(null);}} aria-label="Close" style={{marginLeft:"auto",background:"none",border:"none",fontSize:24,color:T.muted,cursor:"pointer",lineHeight:1,padding:0}}>×</button>
            </div>
            <div style={{padding:isMobile?"14px 16px":"18px 22px",overflowY:"auto"}}>
              <div style={{fontSize:11,color:T.muted,fontWeight:800,textTransform:"uppercase",letterSpacing:"0.8px",marginBottom:8}}>Total sales $ · manual</div>
              <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10,marginBottom:18}}>
                <div><div style={{fontSize:11,color:T.slate,fontWeight:700,marginBottom:4}}>{data.locations.loc1}</div><input type="number" inputMode="decimal" value={ed.l1} onChange={e=>setEd(p=>({...p,l1:e.target.value}))} placeholder="0.00" style={{...inp,width:"100%"}}/></div>
                <div><div style={{fontSize:11,color:T.slate,fontWeight:700,marginBottom:4}}>{data.locations.loc2}</div><input type="number" inputMode="decimal" value={ed.l2} onChange={e=>setEd(p=>({...p,l2:e.target.value}))} placeholder="0.00" style={{...inp,width:"100%"}}/></div>
              </div>
              <div style={{fontSize:11,color:T.muted,fontWeight:800,textTransform:"uppercase",letterSpacing:"0.8px",marginBottom:8}}>Bowls · counts by size (L1 / L2)</div>
              {menuBowls.map((bw,i)=>(
                <div key={bw} style={{display:"flex",alignItems:"center",gap:10,padding:"8px 0",borderBottom:`1px solid ${T.border}`,flexWrap:"wrap"}}>
                  <div style={{flex:"1 1 110px",fontSize:13,fontWeight:600,minWidth:96}}>{bw}</div>
                  <div style={{display:"flex",gap:isMobile?8:14,flexWrap:"wrap"}}>
                    {SZ.map(sz=>(
                      <div key={sz} style={{display:"flex",flexDirection:"column",alignItems:"center",gap:3}}>
                        <span style={{fontSize:9,color:T.muted,fontWeight:800}}>{sz==="small"?"S":sz==="medium"?"M":"L"}</span>
                        <div style={{display:"flex",gap:3}}>
                          <input type="number" inputMode="numeric" min="0" value={ed.bowls[bw][sz].l1} onChange={e=>setBowl(bw,sz,"l1",e.target.value)} placeholder="L1" style={numInp}/>
                          <input type="number" inputMode="numeric" min="0" value={ed.bowls[bw][sz].l2} onChange={e=>setBowl(bw,sz,"l2",e.target.value)} placeholder="L2" style={numInp}/>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
              {menuOther.length>0&&<div style={{fontSize:11,color:T.muted,fontWeight:800,textTransform:"uppercase",letterSpacing:"0.8px",margin:"16px 0 8px"}}>Sides &amp; drinks · One-size (L1 / L2)</div>}
              {menuOther.map(([it,cat])=>(
                <div key={it} style={{display:"flex",alignItems:"center",gap:10,padding:"7px 0",borderBottom:`1px solid ${T.border}`}}>
                  <div style={{flex:1,fontSize:13,fontWeight:600}}>{it} <span style={{fontSize:10,color:T.muted,fontWeight:500}}>{cat}</span></div>
                  <input type="number" inputMode="numeric" min="0" value={ed.other[it].l1} onChange={e=>setOther(it,"l1",e.target.value)} placeholder="L1" style={numInp}/>
                  <input type="number" inputMode="numeric" min="0" value={ed.other[it].l2} onChange={e=>setOther(it,"l2",e.target.value)} placeholder="L2" style={numInp}/>
                </div>
              ))}
              <div style={{marginTop:12,fontSize:11.5,color:T.muted,lineHeight:1.6}}>Side and drink counts are saved, but don't move food cost or profit yet — extras costing is coming soon. Other revenue stays derived as total sales minus bowl revenue.</div>
            </div>
            <div style={{padding:isMobile?"12px 16px":"14px 22px",borderTop:`1px solid ${T.border}`,display:"flex",gap:10,alignItems:"center"}}>
              <button onClick={saveEdit} disabled={edSaving} style={{background:T.teal,color:"#fff",border:"none",borderRadius:10,padding:"11px 22px",fontSize:14,fontWeight:800,cursor:edSaving?"not-allowed":"pointer",opacity:edSaving?0.6:1}}>{edSaving?"Saving…":"Save changes"}</button>
              <button onClick={()=>{setEditMonth(null);setEd(null);}} disabled={edSaving} style={{background:"transparent",border:`1px solid ${T.border}`,borderRadius:10,color:T.muted,padding:"11px 18px",fontSize:13,cursor:"pointer"}}>Cancel</button>
              <span style={{marginLeft:"auto",fontSize:11.5,color:T.amber,fontWeight:600}}>Saving replaces {editMonth}</span>
            </div>
          </div>
        </div>
        );
      })()}

      {showForm&&(
        <div style={{...card,marginBottom:16,borderColor:T.blue,padding:0,overflow:"hidden"}}>
          <div style={{background:T.blueL,padding:isMobile?"14px 16px":"16px 20px",borderBottom:`1px solid ${T.border}`}}>
            <div style={{fontSize:isMobile?15:17,fontWeight:800,color:T.blueDark,marginBottom:4}}>Enter monthly sales</div>
            <div style={{fontSize:12.5,color:T.slate,lineHeight:1.6}}>Type each location’s <strong>total sales $</strong> for the month by hand. Then download the Excel template, fill in your bowl counts from the POS product report, and upload it — the counts do the rest. Other revenue (drinks, add-ons, extras) is worked out for you as total sales minus bowl revenue.</div>
            <div style={{display:"grid",gridTemplateColumns:isMobile?"1fr":"1.2fr 1fr 1fr",gap:10,marginTop:14}}>
              <div>
                <div style={{fontSize:11,color:T.slate,fontWeight:700,marginBottom:5}}>MONTH</div>
                <select value={fMonth} onChange={e=>pickMonth(e.target.value)} style={inp}>
                  <option value="">Select month…</option>
                  {monthOptions.map(m=><option key={m} value={m}>{m}{data.sales[m]?" (update)":""}</option>)}
                </select>
              </div>
              <div>
                <div style={{fontSize:11,color:T.slate,fontWeight:700,marginBottom:5}}>{data.locations.loc1.toUpperCase()} · TOTAL $</div>
                <input type="number" inputMode="decimal" placeholder="0.00" value={fL1} onChange={e=>setFL1(e.target.value)} style={inp}/>
              </div>
              <div>
                <div style={{fontSize:11,color:T.slate,fontWeight:700,marginBottom:5}}>{data.locations.loc2.toUpperCase()} · TOTAL $</div>
                <input type="number" inputMode="decimal" placeholder="0.00" value={fL2} onChange={e=>setFL2(e.target.value)} style={inp}/>
              </div>
            </div>
            <div style={{display:"flex",gap:10,marginTop:12,flexWrap:"wrap"}}>
              <button onClick={downloadTemplate} style={{background:"#fff",border:`1px solid ${T.blue}`,color:T.blue,borderRadius:10,padding:"10px 16px",fontSize:13,fontWeight:700,cursor:"pointer"}}>⬇ Download Excel template</button>
              <button onClick={()=>fMonth?upRef.current?.click():setParseMsg({err:true,text:"Pick the month first."})} style={{background:T.blue,border:"none",color:"#fff",borderRadius:10,padding:"10px 16px",fontSize:13,fontWeight:700,cursor:"pointer"}}>⬆ Upload counts (.xlsx)</button>
              <input ref={upRef} type="file" accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" onChange={onUpload} style={{display:"none"}}/>
              <button onClick={()=>say("Coming in V2 — upload your POS monthly report and the counts fill themselves in")} style={{background:"transparent",border:`1px dashed ${T.border}`,color:T.muted,borderRadius:10,padding:"10px 16px",fontSize:13,fontWeight:700,cursor:"pointer"}}>⬆ Upload POS report · V2</button>
            </div>
            {parseMsg&&(
              <div style={{marginTop:10,fontSize:12,fontWeight:600,color:parseMsg.err?T.coral:T.teal,background:parseMsg.err?T.coralL:T.tealL,border:`1px solid ${(parseMsg.err?T.coral:T.teal)}33`,borderRadius:10,padding:"8px 12px",lineHeight:1.5}}>
                {parseMsg.err?"⚠ ":"✓ "}{parseMsg.text}
                {parseMsg.warnings&&parseMsg.warnings.map((w,i)=><div key={i} style={{color:T.amber,marginTop:3,fontWeight:500}}>· {w}</div>)}
              </div>
            )}
          </div>
          <div style={{padding:isMobile?"14px 16px":"16px 20px"}}>
            {pvBowls>0?(
              <>
                <div style={{fontSize:12,fontWeight:800,color:T.navy,marginBottom:10}}>This month, from your counts{parsedMix?" (uploaded, not yet saved)":""}</div>
                <div style={{display:"grid",gridTemplateColumns:isMobile?"1fr 1fr":"repeat(4,1fr)",gap:8}}>
                  {readout("Total bowls",pvBowls.toLocaleString(),`S ${agg.small} · M ${agg.medium} · L ${agg.large}`)}
                  {readout("Size mix",`${Math.round(agg.small/pvBowls*100)}/${Math.round(agg.medium/pvBowls*100)}/${Math.round(agg.large/pvBowls*100)}`,"S / M / L %")}
                  {readout("Avg revenue / bowl",`$${fmt(pvAvg)}`,"bowl revenue ÷ bowls")}
                  {readout("Bowl food cost",`${pvFcp.toFixed(1)}%`,`$${fmt(pvC)} of $${fmt(pvRev)}`,"excl. add-ons · coming soon")}
                </div>
                <div style={{display:"grid",gridTemplateColumns:isMobile?"1fr 1fr":"repeat(4,1fr)",gap:8,marginTop:8}}>
                  {readout("Bowl revenue",`$${fmt(pvRev)}`,"counts × size price")}
                  {readout("Bowl gross profit",`$${fmt(pvRev-pvC)}`,`${(100-pvFcp).toFixed(1)}% margin`)}
                  {readout("Other revenue",`$${fmt(pvOther)}`,salesTotal?`${((pvOther/salesTotal)*100).toFixed(0)}% of sales`:"enter total sales")}
                  {readout("Total sales",`$${fmt(salesTotal)}`,"typed in above")}
                </div>
              </>
            ):(
              <div style={{fontSize:12.5,color:T.muted,lineHeight:1.6}}>No bowl counts yet for {fMonth||"this month"}. Download the template, fill it from your POS report, and upload — your size mix, average bowl and food cost appear here before you save.</div>
            )}
            <div style={{display:"flex",gap:10,marginTop:14,alignItems:"center",flexWrap:"wrap"}}>
              <button onClick={submit} disabled={saving||!fMonth||(!fL1&&!fL2&&!parsedMix)} style={{background:T.teal,color:"#fff",border:"none",borderRadius:10,padding:"12px 24px",fontSize:14,fontWeight:800,cursor:saving?"not-allowed":"pointer",opacity:saving||!fMonth||(!fL1&&!fL2&&!parsedMix)?0.6:1}}>{saving?"Saving…":"Save month"}</button>
              {fMonth&&data.sales[fMonth]&&<span style={{fontSize:12,color:T.amber,fontWeight:600}}>⚠ {fMonth} already saved (${(data.sales[fMonth].loc1||0).toLocaleString()} / ${(data.sales[fMonth].loc2||0).toLocaleString()}) — Save overwrites it.</span>}
            </div>
          </div>
        </div>
      )}

      {(()=>{
        const MN=MNc;
        const now=new Date();
        const periodMonths=()=>{
          if(period==="month"){const d=new Date(now.getFullYear(),now.getMonth()-off);return[`${MN[d.getMonth()]} ${d.getFullYear()}`];}
          if(period==="quarter"){
            const qStart=Math.floor(now.getMonth()/3)*3;
            const d=new Date(now.getFullYear(),qStart-off*3);
            return[0,1,2].map(i=>{const m=new Date(d.getFullYear(),d.getMonth()+i);return`${MN[m.getMonth()]} ${m.getFullYear()}`;});
          }
          const y=now.getFullYear()-off;
          return MN.map(m=>`${m} ${y}`);
        };
        const pm=periodMonths();
        const label=period==="month"?pm[0]:period==="quarter"?`Q${Math.floor(MN.indexOf(pm[0].split(" ")[0])/3)+1} ${pm[0].split(" ")[1]}`:pm[0].split(" ")[1];
        const r=pm.reduce((s,m)=>s+cRev(m,locKey),0);
        const brev=pm.reduce((s,m)=>s+cBowlRev(m,locKey),0);
        const c=pm.reduce((s,m)=>s+cCOGS(m,locKey),0);
        const g=brev-c,p=brev?(c/brev)*100:0,other=Math.max(0,r-brev);
        const hasData=pm.some(m=>data.sales[m]);
        return(
          <div style={{...card,marginBottom:16}}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",flexWrap:"wrap",gap:10,marginBottom:16}}>
              <div style={{display:"flex",gap:3,background:T.bg,border:`1px solid ${T.border}`,borderRadius:20,padding:3}}>
                {[["month","Month"],["quarter","Quarter"],["year","Year"]].map(([id,lb])=>(
                  <button key={id} onClick={()=>{setPeriod(id);setOff(0);}} style={{background:period===id?T.blue:"transparent",color:period===id?"#fff":T.slate,border:"none",borderRadius:16,padding:"6px 14px",fontSize:13,fontWeight:period===id?700:500,cursor:"pointer"}}>{lb}</button>
                ))}
              </div>
              <div style={{display:"flex",alignItems:"center",gap:10}}>
                <button onClick={()=>setOff(o=>o+1)} style={{width:32,height:32,borderRadius:"50%",border:`1px solid ${T.border}`,background:T.card,color:T.slate,fontSize:15,cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center",padding:0}}>‹</button>
                <div style={{fontSize:isMobile?14:16,fontWeight:800,minWidth:90,textAlign:"center"}}>{label}</div>
                <button onClick={()=>setOff(o=>Math.max(0,o-1))} disabled={off===0} style={{width:32,height:32,borderRadius:"50%",border:`1px solid ${T.border}`,background:T.card,color:T.slate,fontSize:15,cursor:off===0?"not-allowed":"pointer",opacity:off===0?0.35:1,display:"flex",alignItems:"center",justifyContent:"center",padding:0}}>›</button>
              </div>
              <div style={{display:"flex",gap:8,alignItems:"center"}}>
                <Tag c={p>30?T.coral:T.teal} bg={p>30?T.coralL:T.tealL}>Food cost {p.toFixed(1)}%{p>30?" ⚠":""}</Tag>
                <button onClick={()=>{
                  const rows=[["Date","Ingredient","Price","Unit","Supplier"]];
                  Object.entries(data.ingredients).forEach(([ing,entries])=>{
                    entries.forEach(e=>{
                      const d=new Date(e.date);
                      const mk=`${MN[d.getMonth()]} ${d.getFullYear()}`;
                      if(pm.includes(mk))rows.push([e.date,ing,e.price,e.unit,e.supplier]);
                    });
                  });
                  const csv=rows.map(r=>r.map(c=>`"${String(c).replace(/"/g,'""')}"`).join(",")).join("\n");
                  const a=document.createElement("a");
                  a.href=URL.createObjectURL(new Blob([csv],{type:"text/csv"}));
                  a.download=`westcoast-poke-prices-${label.replace(/\s/g,"-")}.csv`;
                  a.click();URL.revokeObjectURL(a.href);
                }} style={{background:T.blueL,border:`1px solid ${T.border}`,borderRadius:16,color:T.blue,padding:"6px 14px",fontSize:12,fontWeight:700,cursor:"pointer",whiteSpace:"nowrap"}}>⬇ CSV</button>
              </div>
            </div>
            {!hasData?(
              <div style={{textAlign:"center",padding:"28px 16px",color:T.muted,fontSize:14}}>No sales entered for this period yet.</div>
            ):(
              <>
                <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:isMobile?8:12,marginBottom:loc==="all"?16:0}}>
                  {[["Total Sales",r,T.blue,T.blueL],["Bowl Food Cost",c,p>30?T.coral:T.amber,p>30?T.coralL:T.amberL],["Bowl Gross Profit",g,T.teal,T.tealL]].map(([l,v,col,bg])=>(
                    <div key={l} style={{background:bg,borderRadius:10,padding:isMobile?"10px 12px":isDesktop?"9px 14px":"14px 18px",border:`1px solid ${T.border}`}}>
                      <div style={{fontSize:isDesktop?11:10,color:T.inkL,fontWeight:700,textTransform:"uppercase",letterSpacing:"0.8px",marginBottom:isDesktop?3:5}}>{l}</div>
                      <div style={{fontSize:isMobile?18:isDesktop?18:24,fontWeight:900,color:col,letterSpacing:"-0.5px"}}>${fmt(v)}</div>
                    </div>
                  ))}
                </div>
                {brev>0&&(
                  <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"10px 4px 0",fontSize:isMobile?12:13,flexWrap:"wrap",gap:6}}>
                    <span style={{color:T.muted}}>Bowls ≈ ${fmt(brev)} (counts × size price) · <strong style={{color:T.slate}}>Other revenue ≈ ${fmt(other)}</strong> (drinks, add-ons, extras)</span>
                    <span style={{fontSize:11,fontWeight:700,color:T.muted,background:T.bg,border:`1px solid ${T.border}`,borderRadius:20,padding:"2px 8px"}}>add-on costs · coming soon</span>
                  </div>
                )}
                {loc==="all"&&(
                  <div style={{borderTop:`1px solid ${T.border}`,paddingTop:14,marginTop:10}}>
                    {["loc1","loc2"].map((l,i)=>{
                      const lr=pm.reduce((s,m)=>s+cRev(m,l),0),lbr=pm.reduce((s,m)=>s+cBowlRev(m,l),0),lc=pm.reduce((s,m)=>s+cCOGS(m,l),0),lp=lbr?(lc/lbr)*100:0;
                      return(
                        <div key={l} style={{display:"flex",gap:12,alignItems:"center",padding:"6px 0",borderBottom:i===0?`1px solid ${T.border}`:"none"}}>
                          <div style={{fontSize:isMobile?12:14,color:T.slate,fontWeight:600,width:isMobile?90:180,flexShrink:0}}>{data.locations[l]}</div>
                          <div style={{fontSize:isMobile?12:14,color:T.inkL}}>${fmt(lr)}</div>
                          <div style={{flex:1}}/>
                          <div style={{fontSize:isMobile?12:14,fontWeight:700,color:lp>30?T.coral:T.teal}}>{lp.toFixed(1)}%</div>
                        </div>
                      );
                    })}
                  </div>
                )}
                {period!=="month"&&(
                  <div style={{borderTop:`1px solid ${T.border}`,paddingTop:12,marginTop:12}}>
                    <div style={{fontSize:11,color:T.muted,fontWeight:700,textTransform:"uppercase",letterSpacing:"0.8px",marginBottom:8}}>Months in this period</div>
                    {pm.filter(m=>data.sales[m]).map(m=>{
                      const mr=cRev(m,locKey),mbr=cBowlRev(m,locKey),mc=cCOGS(m,locKey),mp=mbr?(mc/mbr)*100:0;
                      return(
                        <div key={m} style={{display:"flex",gap:12,alignItems:"center",padding:"5px 0",fontSize:isMobile?12:13}}>
                          <div style={{color:T.slate,fontWeight:600,width:80}}>{m}</div>
                          <div style={{color:T.inkL}}>${fmt(mr)}</div>
                          <div style={{flex:1}}/>
                          <div style={{fontWeight:700,color:mp>30?T.coral:T.teal}}>{mp.toFixed(1)}%</div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </>
            )}
          </div>
        );
      })()}

      {/* Row 2 (item 12): Menu cost analysis moved up, above the trend charts */}
      <div style={{...card,marginBottom:16}}>
        {(()=>{window.__salesPeriodMonth=(()=>{
          const MNz=MNc;
          const now=new Date();
          if(period==="month"){const d=new Date(now.getFullYear(),now.getMonth()-off);return `${MNz[d.getMonth()]} ${d.getFullYear()}`;}
          if(period==="quarter"){const qs=Math.floor(now.getMonth()/3)*3;const d=new Date(now.getFullYear(),qs-off*3+2);return `${MNz[d.getMonth()]} ${d.getFullYear()}`;}
          return `Dec ${now.getFullYear()-off}`;
        })();return null;})()}
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",gap:10,flexWrap:"wrap"}}>
          <h3 style={{margin:"0 0 4px",fontSize:isMobile?16:20,fontWeight:800}}>Menu Cost Analysis <span style={{fontSize:12,color:T.muted,fontWeight:400}}>· {window.__salesPeriodMonth} prices</span></h3>
          <div style={{display:"flex",gap:2,background:T.bg,border:`1px solid ${T.border}`,borderRadius:14,padding:2}}>
            {[["agg","Aggregate"],["small","S"],["medium","M"],["large","L"]].map(([id,lb])=>(
              <button key={id} onClick={()=>setMcaSz(id)} style={{background:mcaSz===id?T.blue:"transparent",color:mcaSz===id?"#fff":T.slate,border:"none",borderRadius:12,padding:"5px 12px",fontSize:12,fontWeight:600,cursor:"pointer"}}>{lb}</button>
            ))}
          </div>
        </div>
        <p style={{margin:"0 0 14px",fontSize:isMobile?12:13,color:T.muted,lineHeight:1.6}}>Each bowl costed at the prices you were actually paying in this period — the margin that month genuinely made. Flip periods with the arrows above to watch costs creep or ease. Today's costs and what-if testing live on the Menu page.</p>
        <div style={{display:"grid",gridTemplateColumns:isDesktop?"1fr 1fr":"1fr",columnGap:32}}>
          {Object.entries(data.menu).filter(([,md])=>isBowl(md)).map(([item,md])=>{
            const cost=mcaSz==="agg"?bCostAtApp(item,window.__salesPeriodMonth||""):costSzAt(item,mcaSz,window.__salesPeriodMonth||"");
            const sell=mcaSz==="agg"?blendedPrice(item):priceFor(md,mcaSz);
            const fp=sell?(cost/sell)*100:0,mg=sell?((sell-cost)/sell)*100:0;
            return(
              <div key={item} style={{display:"flex",alignItems:"center",gap:12,padding:"11px 0",borderBottom:`1px solid ${T.border}`}}>
                <div style={{flex:1}}>
                  <div style={{fontSize:isMobile?13:15,fontWeight:700}}>{item}</div>
                  <div style={{fontSize:12,color:T.muted}}>Sell ${fmt(sell)}{mcaSz==="agg"?" (blended)":""} · Cost ${fmt(cost)}</div>
                </div>
                <div style={{textAlign:"right"}}>
                  <Tag c={fp>30?T.coral:T.teal} bg={fp>30?T.coralL:T.tealL} sm>{fp.toFixed(1)}% food cost</Tag>
                  <div style={{fontSize:11,color:T.muted,marginTop:3}}>{mg.toFixed(1)}% margin</div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {(()=>{
        const MNx=MNc;
        const entered=Object.keys(data.sales).sort((a,b)=>new Date("1 "+a)-new Date("1 "+b));
        const pKey=(m)=>{
          if(period==="month")return m;
          const [mo,yr]=m.split(" ");
          if(period==="quarter")return `Q${Math.floor(MNx.indexOf(mo)/3)+1} ${yr}`;
          return yr;
        };
        const groups={};
        entered.forEach(m=>{const k=pKey(m);if(!groups[k])groups[k]=[];groups[k].push(m);});
        const keys=Object.keys(groups).slice(-8);
        const unitsFor=(b,ms)=>ms.reduce((sum,m)=>sum+bowlUnitsTotal(m,b,locKey),0);
        const cogsSales=[
          {label:"Sales",color:T.blue,points:keys.map(k=>({label:k,y:groups[k].reduce((sum,m)=>sum+cRev(m,locKey),0)}))},
          {label:"Bowl COGS",color:T.coral,points:keys.map(k=>({label:k,y:groups[k].reduce((sum,m)=>sum+cCOGS(m,locKey),0)}))},
        ];
        const bowlCols=[T.blue,T.teal,T.coral,T.amber,"#8B5CF6","#EC4899","#6366F1","#10B981"];
        const bowlNames=Object.entries(data.menu).filter(([,m])=>isBowl(m)).map(([b])=>b);
        const bowlSeries=bowlNames.map((b,i)=>({label:b,color:bowlCols[i%bowlCols.length],points:keys.map(k=>({label:k,y:unitsFor(b,groups[k])}))}));
        const top3=bowlNames.map(b=>({b,u:unitsFor(b,entered)})).sort((a,x)=>x.u-a.u).slice(0,3);
        const bowlProfit=(b,ms)=>ms.reduce((sum,m)=>sum+SZ.reduce((s,sz)=>s+bowlUnits(m,b,sz,locKey)*(priceFor(data.menu[b]||{},sz)-costSz(b,sz)),0),0);
        const profitSeries=top3.map((t,i)=>({label:`${t.b} profit`,color:bowlCols[i],points:keys.map(k=>({label:k,y:bowlProfit(t.b,groups[k])}))}));
        return(
          <>
            {/* Row 3 (item 12): COGS vs Sales + Top 3 sellers side by side on desktop */}
            <div style={{display:"grid",gridTemplateColumns:isDesktop?"1fr 1fr":"1fr",gap:isMobile?10:16,marginBottom:16}}>
              <div style={card}>
                <h3 style={{margin:"0 0 4px",fontSize:isMobile?15:18,fontWeight:800}}>Bowl COGS vs Sales trend</h3>
                <div style={{fontSize:12,color:T.muted,marginBottom:12}}>Grouped by {period} · {locKey==="all"?"both locations":data.locations[locKey]}</div>
                <MultiLine series={cogsSales} T={T}/>
              </div>
              <div style={card}>
                <h3 style={{margin:"0 0 4px",fontSize:isMobile?15:18,fontWeight:800}}>Top 3 sellers · net profit</h3>
                <div style={{fontSize:12,color:T.muted,marginBottom:12}}>Best sellers ranked by what they actually earn · profit uses current recipe costs, per size</div>
                <MultiLine series={profitSeries} T={T}/>
              </div>
            </div>
            {/* Row 4: Units sold per bowl, full width — measures all bowls once populated */}
            <div style={{...card,marginBottom:16}}>
              <h3 style={{margin:"0 0 4px",fontSize:isMobile?15:18,fontWeight:800}}>Units sold per bowl</h3>
              <div style={{fontSize:12,color:T.muted,marginBottom:12}}>What sells best · needs bowl counts uploaded with monthly sales</div>
              <MultiLine series={bowlSeries} T={T} money={false}/>
            </div>
            {/* Row 5: Top 5 add-ons — stub until detailed POS output integration (V2) */}
            <div style={{...card,marginBottom:16,borderStyle:"dashed"}}>
              <h3 style={{margin:"0 0 4px",fontSize:isMobile?15:18,fontWeight:800}}>Top 5 add-ons <span style={{fontSize:11,color:T.muted,fontWeight:600}}>· coming in V2</span></h3>
              <div style={{fontSize:12,color:T.muted,lineHeight:1.6}}>Your best-selling add-ons (extra protein, premium toppings, aburi prep…) will rank here once the detailed POS product report upload lands in V2 — the current template only carries sides/drinks as $ totals.</div>
            </div>
          </>
        );
      })()}
    </div>
  );
}

// ─── SCAN ────────────────────────────────────────────────────────────────────
function Scan({T,isMobile,card,img,setImg,scanRes,setScanRes,scanning,doScan,okScan,onFile,fileRef,scanLoc,setScanLoc,locations,data,reload,say}){
  const MN=["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
  const [receipts,setReceipts]=useState([]);
  const [histLoading,setHistLoading]=useState(true);
  const [hp,setHp]=useState("month");
  const [hoff,setHoff]=useState(0);
  const [busy,setBusy]=useState(null);
  const loadHist=async()=>{setHistLoading(true);try{setReceipts(await loadReceipts());}catch(e){console.error(e);}setHistLoading(false);};
  useEffect(()=>{loadHist();},[]);

  const updateLine=(i,patch)=>setScanRes(r=>{
    const items=r.items.slice();let it={...items[i],...patch};
    if(patch.ingredient!==undefined){const m=catalogMatch(it.ingredient);if(m){it.matched=true;it.category=m.cat;it.food=true;it.isNew=false;if(it.state!=="exclude")it.state="food";}else{it.matched=false;it.food=isCOGSCat(it.category);it.tracked=r.items[i]?.tracked&&false;it.isNew=it.food;if(it.state!=="exclude")it.state=it.food?"food":"nonfood";}}
    if(patch.category!==undefined&&!it.matched){it.food=isCOGSCat(it.category);if(it.state!=="exclude")it.state=it.food?"food":"nonfood";}
    items[i]=it;return {...r,items};
  });
  const setLineState=(i,st)=>setScanRes(r=>{const items=r.items.slice();items[i]={...items[i],state:st};return {...r,items};});
  const useBusinessTotal=()=>setScanRes(r=>{const kept=(r.items||[]).filter(it=>it.state!=="exclude");const sum=kept.reduce((s,it)=>s+((parseFloat(it.line_total)||(parseFloat(it.price)||0)*(parseFloat(it.quantity)||0))||0),0);return {...r,invoice_total:Math.round(sum*100)/100};});
  const removeLine=i=>setScanRes(r=>({...r,items:r.items.filter((_,j)=>j!==i)}));
  const setTotal=(k,v)=>setScanRes(r=>({...r,[k]:v===""?null:parseFloat(v)}));

  const csvFromLines=(supplier,date,lines,withFlag,meta={})=>{
    const head=["Supplier","Date","Invoice #","Saved","Category","Ingredient","Unit price","Unit","Quantity","Line total"];
    if(withFlag)head.push("Counts to food cost");
    const inv=meta.invoiceNumber||"";const saved=meta.savedAt?String(meta.savedAt).slice(0,10):"";
    const rows=[head];
    lines.forEach(it=>{const row=[supplier||"Unknown",date||"",inv,saved,it.category||"Other",it.ingredient,it.price,it.unit||"",it.quantity??"",it.line_total??""];if(withFlag)row.push((it.state?it.state==="food":(it.food!==undefined?it.food:isCOGSCat(it.category)))?"Yes":"No");rows.push(row);});
    return rows.map(r=>r.map(c=>`"${String(c).replace(/"/g,'""')}"`).join(",")).join("\n");
  };
  const download=(name,csv)=>{const a=document.createElement("a");a.href=URL.createObjectURL(new Blob([csv],{type:"text/csv"}));a.download=name;a.click();URL.revokeObjectURL(a.href);};

  // Rebuild a saved receipt's tracked (food) line items from ingredient_prices by supplier+date
  const linesFor=r=>{const out=[];Object.entries(data.ingredients||{}).forEach(([ing,entries])=>{entries.forEach(e=>{if(e.supplier===r.supplier&&e.date===r.date)out.push({ingredient:ing,category:catalogMatch(ing)?.cat||"",price:e.price,unit:e.unit||"",quantity:e.quantity??"",line_total:e.line_total??""});});});return out;};

  const now=new Date();
  const view=(()=>{if(hp==="month"){const d=new Date(now.getFullYear(),now.getMonth()-hoff);return{y:d.getFullYear(),m:d.getMonth(),label:`${MN[d.getMonth()]} ${d.getFullYear()}`};}const y=now.getFullYear()-hoff;return{y,m:null,label:`${y}`};})();
  const inView=r=>{const d=new Date(r.date+"T00:00:00");if(isNaN(d))return false;return view.m===null?d.getFullYear()===view.y:(d.getFullYear()===view.y&&d.getMonth()===view.m);};
  const filtered=receipts.filter(inView);
  const sumG=filtered.reduce((s,r)=>s+(r.gross||0),0);
  const sumI=filtered.reduce((s,r)=>s+(r.invoice||0),0);

  const delReceipt=async r=>{
    const n=linesFor(r).length;
    if(!window.confirm(`Delete this receipt from ${r.supplier} (${r.date}) and the ${n} price ${n===1?"entry":"entries"} it added? Trends and menu costs will recalculate. This can't be undone.`))return;
    setBusy(r.id);
    try{await deleteReceiptCascade(r);await reload();await loadHist();say("Receipt and its price entries deleted");}
    catch(e){console.error(e);say("Delete failed",true);}
    setBusy(null);
  };
  const downloadAll=()=>{
    if(!filtered.length)return;
    const rows=[["Supplier","Date","Invoice #","Saved","Category","Ingredient","Unit price","Unit"]];
    filtered.forEach(r=>linesFor(r).forEach(it=>rows.push([r.supplier,r.date,r.invoiceNumber||"",r.savedAt?String(r.savedAt).slice(0,10):"",it.category||"Other",it.ingredient,it.price,it.unit||""])));
    download(`receipts-${view.label.replace(/\s/g,"-")}.csv`,rows.map(r=>r.map(c=>`"${String(c).replace(/"/g,'""')}"`).join(",")).join("\n"));
  };

  const numInp={width:76,textAlign:"right",background:T.bg,border:`1px solid ${T.border}`,borderRadius:8,padding:"7px 8px",color:T.navy,fontSize:13,outline:"none"};
  const lineSum=(scanRes?.items||[]).filter(it=>it.state!=="exclude").reduce((s,it)=>s+((parseFloat(it.line_total)|| (parseFloat(it.price)||0)*(parseFloat(it.quantity)||0))||0),0);
  const hasExcluded=(scanRes?.items||[]).some(it=>it.state==="exclude");

  return(
    <div style={{maxWidth:scanRes&&!scanning?820:640,margin:"0 auto"}}>
      <h2 style={{margin:"0 0 6px",fontSize:isMobile?20:26,fontWeight:800,letterSpacing:"-0.5px"}}>Scan receipt or invoice</h2>
      <p style={{margin:"0 0 16px",fontSize:isMobile?13:15,color:T.muted,lineHeight:1.6}}>AI extracts ingredients, prices, and supplier. You review and correct before saving. The photo is discarded after extraction — only the data is saved.</p>
      <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:20,flexWrap:"wrap"}}>
        <span style={{fontSize:12,color:T.muted,fontWeight:700}}>Upload for:</span>
        {[{id:"all",l:"Shared"},{id:"loc1",l:locations.loc1},{id:"loc2",l:locations.loc2}].map(l=>(
          <button key={l.id} onClick={()=>setScanLoc(l.id)} style={{background:scanLoc===l.id?T.blue:"transparent",border:`1.5px solid ${scanLoc===l.id?T.blue:T.border}`,color:scanLoc===l.id?"#fff":T.slate,padding:"5px 12px",borderRadius:18,fontSize:12,cursor:"pointer",fontWeight:600}}>{l.l}</button>
        ))}
      </div>
      {!img?(
        <div onClick={()=>fileRef.current?.click()} style={{border:`2px dashed ${T.border}`,borderRadius:20,padding:isMobile?"52px 24px":"64px 40px",textAlign:"center",cursor:"pointer",background:T.card}}>
          <div style={{fontSize:isMobile?48:64,marginBottom:14}}>📸</div>
          <div style={{fontSize:isMobile?16:20,fontWeight:700,color:T.slate,marginBottom:6}}>Tap to upload receipt or invoice</div>
          <div style={{fontSize:isMobile?13:14,color:T.muted}}>Photo (JPG/PNG) or PDF · Paper receipts and emailed invoices</div>
          <input ref={fileRef} type="file" accept="image/*,application/pdf,.pdf" onChange={onFile} style={{display:"none"}}/>
        </div>
      ):(
        <div>
          {!scanRes&&<div style={{display:"flex",gap:16,marginBottom:16,background:T.card,border:`1px solid ${T.border}`,borderRadius:16,padding:16}}>
            {img.prev
              ?<img src={img.prev} alt="Receipt" style={{width:isMobile?90:120,borderRadius:12,border:`1px solid ${T.border}`,objectFit:"cover",flexShrink:0}}/>
              :<div style={{width:isMobile?90:120,height:isMobile?110:140,borderRadius:12,border:`1px solid ${T.border}`,background:T.bg,display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",flexShrink:0,gap:8}}><span style={{fontSize:40}}>📄</span><span style={{fontSize:11,color:T.muted,fontWeight:700}}>PDF</span></div>}
            <div style={{flex:1}}>
              <div style={{fontSize:12,color:T.muted,marginBottom:10}}>{img.name}</div>
              <button onClick={doScan} disabled={scanning} style={{width:"100%",background:T.blue,color:"#fff",border:"none",borderRadius:12,padding:isMobile?"13px":"15px",fontSize:isMobile?15:17,cursor:scanning?"not-allowed":"pointer",fontWeight:800,marginBottom:8,opacity:scanning?0.7:1}}>{scanning?"🔍 Analysing receipt...":"Extract prices with AI · ~$0.02"}</button>
              <button onClick={()=>{setImg(null);setScanRes(null);}} style={{width:"100%",background:"transparent",border:`1px solid ${T.border}`,borderRadius:12,color:T.muted,padding:isMobile?"10px":"12px",fontSize:13,cursor:"pointer"}}>Use different photo</button>
            </div>
          </div>}
          {scanning&&<div style={{background:T.blueL,borderRadius:14,padding:18,textAlign:"center",color:T.blue,fontSize:isMobile?14:16,fontWeight:700}}>🔍 Reading receipt and checking for duplicates...</div>}

          {scanRes&&!scanning&&(
            <div style={{...card,borderColor:T.amber}}>
              <div style={{fontSize:isMobile?16:18,fontWeight:800,marginBottom:2}}>Review &amp; correct</div>
              <div style={{fontSize:13,color:T.muted,marginBottom:10}}>{scanRes.supplier} · {scanRes.date} · {scanRes.items?.length} lines</div>
              <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:12,flexWrap:"wrap"}}>
                <span style={{fontSize:10,color:T.muted,fontWeight:700}}>INVOICE #</span>
                <input value={scanRes.invoice_number??""} onChange={e=>setScanRes(r=>({...r,invoice_number:e.target.value}))} placeholder="as printed (blank if none)" style={{background:T.bg,border:`1px solid ${T.border}`,borderRadius:8,padding:"7px 10px",color:T.navy,fontSize:13,outline:"none",minWidth:200}}/>
              </div>
              <div style={{background:T.amberL,border:`1px solid ${T.amber}44`,borderRadius:10,padding:"10px 12px",fontSize:12.5,color:T.slate,lineHeight:1.6,marginBottom:14}}>⚠ Check every line before accepting — fix shortened names, wrong categories, or discounted prices the AI misread. Set anything unrelated to the business to <strong>Exclude</strong>. <strong>Once you accept, this can't be edited</strong> — you'd re-scan the receipt.</div>

              <div style={{display:"grid",gridTemplateColumns:isMobile?"1fr":"1.5fr 1.1fr 0.8fr 0.6fr 1.3fr auto",gap:8,alignItems:"center",fontSize:10,color:T.muted,fontWeight:700,textTransform:"uppercase",letterSpacing:"0.5px",padding:"0 2px 6px"}}>
                <div>Ingredient</div>{!isMobile&&<><div>Category</div><div style={{textAlign:"right"}}>Unit price</div><div style={{textAlign:"right"}}>Qty</div><div>Treatment</div><div/></>}
              </div>
              {scanRes.items?.map((it,i)=>{const st=it.state||(it.food?"food":"nonfood");const excl=st==="exclude";const isNew=it.isNew&&!it.matched&&!it.tracked&&st==="food";return(
                <div key={i} style={{display:"grid",gridTemplateColumns:isMobile?"1fr":"1.5fr 1.1fr 0.8fr 0.6fr 1.3fr auto",gap:8,alignItems:"center",padding:"7px 2px",borderBottom:`1px solid ${T.border}`,opacity:excl?0.45:1}}>
                  <div style={{display:"flex",flexDirection:"column",gap:3}}>
                    <input value={it.ingredient} onChange={e=>updateLine(i,{ingredient:e.target.value})} style={{background:T.bg,border:`1px solid ${isNew?T.amber:T.border}`,borderRadius:8,padding:"8px 10px",color:T.navy,fontSize:13,outline:"none",width:"100%"}}/>
                    {isNew&&<span style={{fontSize:10,color:T.amber,fontWeight:700}}>new — keep as Food to add it, or Exclude to skip</span>}
                    {it.tracked&&!it.matched&&<span style={{fontSize:10,color:T.muted}}>matches a tracked ingredient</span>}
                  </div>
                  <div style={{display:"flex",alignItems:"center",gap:6}}>
                    {it.matched
                      ?<span title="Matched to your ingredient catalogue" style={{fontSize:11,fontWeight:700,color:T.teal,background:T.tealL,border:`1px solid ${T.teal}44`,padding:"6px 10px",borderRadius:8,whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>✓ {it.category}</span>
                      :<select value={RECEIPT_CATS.includes(it.category)?it.category:"Other"} onChange={e=>updateLine(i,{category:e.target.value})} style={{background:T.bg,border:`1px solid ${T.border}`,borderRadius:8,padding:"8px 8px",color:T.navy,fontSize:12,outline:"none",width:"100%"}}>{RECEIPT_CATS.map(c=><option key={c} value={c}>{c}{isCOGSCat(c)?"":" · not food"}</option>)}</select>}
                  </div>
                  <input type="number" inputMode="decimal" value={it.price??""} onChange={e=>updateLine(i,{price:parseFloat(e.target.value)||0})} style={{...numInp,width:isMobile?"100%":numInp.width}}/>
                  <input type="number" inputMode="decimal" value={it.quantity??""} onChange={e=>updateLine(i,{quantity:e.target.value===""?null:parseFloat(e.target.value)})} style={{...numInp,width:isMobile?"100%":numInp.width}}/>
                  <div style={{display:"flex",gap:2,background:T.bg,border:`1px solid ${T.border}`,borderRadius:8,padding:2}}>
                    {[["food","Food",T.teal],["nonfood","Non-food",T.slate],["exclude","Exclude",T.coral]].map(([v,lb,c])=>(
                      <button key={v} onClick={()=>setLineState(i,v)} title={v==="food"?"Tracked in food cost":v==="nonfood"?"Business cost, not food-costed":"Dropped — not saved"} style={{flex:1,background:st===v?c:"transparent",color:st===v?"#fff":T.muted,border:"none",borderRadius:6,padding:"5px 4px",fontSize:10.5,fontWeight:st===v?700:500,cursor:"pointer",whiteSpace:"nowrap"}}>{lb}</button>
                    ))}
                  </div>
                  <button onClick={()=>removeLine(i)} aria-label="Remove line" title="Remove line" style={{background:"none",border:"none",color:T.coral,fontSize:16,cursor:"pointer",padding:"2px 6px",lineHeight:1}}>×</button>
                </div>
              );})}

              <div style={{display:"grid",gridTemplateColumns:isMobile?"1fr 1fr":"1fr 1fr auto",gap:10,alignItems:"end",marginTop:16,paddingTop:14,borderTop:`1px solid ${T.border}`}}>
                <div>
                  <div style={{fontSize:10,color:T.muted,fontWeight:700,marginBottom:4}}>GROSS TOTAL (SUBTOTAL) $</div>
                  <input type="number" inputMode="decimal" value={scanRes.gross_total??""} onChange={e=>setTotal("gross_total",e.target.value)} placeholder="0.00" style={{...numInp,width:"100%",textAlign:"left"}}/>
                </div>
                <div>
                  <div style={{fontSize:10,color:T.muted,fontWeight:700,marginBottom:4}}>INVOICE TOTAL (PAID) $</div>
                  <input type="number" inputMode="decimal" value={scanRes.invoice_total??""} onChange={e=>setTotal("invoice_total",e.target.value)} placeholder="0.00" style={{...numInp,width:"100%",textAlign:"left"}}/>
                </div>
                <div style={{fontSize:11,color:T.muted,paddingBottom:8}}>Kept lines sum ≈ <strong style={{color:T.slate}}>${fmt(lineSum)}</strong></div>
              </div>
              {hasExcluded&&(
                <div style={{marginTop:10,background:T.bg,border:`1px solid ${T.border}`,borderRadius:10,padding:"10px 12px",fontSize:12,color:T.slate,display:"flex",alignItems:"center",gap:10,flexWrap:"wrap"}}>
                  <span>This receipt has excluded lines, so the printed total includes items that aren't the business's.</span>
                  <button onClick={useBusinessTotal} style={{background:T.blueL,border:`1px solid ${T.border}`,borderRadius:16,color:T.blue,padding:"6px 12px",fontSize:12,fontWeight:700,cursor:"pointer",whiteSpace:"nowrap"}}>Use business-only total (${fmt(lineSum)})</button>
                </div>
              )}

              <div style={{display:"flex",gap:10,marginTop:16,flexWrap:"wrap"}}>
                <button onClick={()=>okScan()} style={{flex:"2 1 180px",background:T.teal,color:"#fff",border:"none",borderRadius:12,padding:isMobile?"13px":"15px",fontSize:isMobile?14:16,cursor:"pointer",fontWeight:800}}>Accept &amp; save</button>
                <button onClick={()=>download(`parsed-receipt-${(scanRes.supplier||"receipt").replace(/\s+/g,"-")}-${scanRes.date||""}.csv`,csvFromLines(scanRes.supplier,scanRes.date,(scanRes.items||[]).filter(it=>it.state!=="exclude"),true,{invoiceNumber:scanRes.invoice_number}))} style={{flex:"1 1 130px",background:T.blueL,border:`1px solid ${T.border}`,borderRadius:12,color:T.blue,padding:isMobile?"13px":"15px",fontSize:13,fontWeight:700,cursor:"pointer"}}>⬇ Parsed CSV</button>
                <button onClick={()=>{setScanRes(null);setImg(null);}} style={{flex:"0 1 90px",background:"transparent",border:`1px solid ${T.border}`,borderRadius:12,color:T.muted,padding:isMobile?"13px":"15px",fontSize:13,cursor:"pointer"}}>Discard</button>
              </div>
            </div>
          )}
        </div>
      )}

      {!scanRes&&(
        <div style={{...card,marginTop:22,padding:0,overflow:"hidden"}}>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",gap:10,flexWrap:"wrap",padding:isMobile?"12px 14px":"14px 18px",borderBottom:`1px solid ${T.border}`}}>
            <div style={{fontSize:isMobile?15:17,fontWeight:800}}>Upload history</div>
            <div style={{display:"flex",alignItems:"center",gap:10,flexWrap:"wrap"}}>
              <div style={{display:"flex",gap:2,background:T.bg,border:`1px solid ${T.border}`,borderRadius:18,padding:2}}>
                {[["month","Month"],["year","Year"]].map(([id,lb])=>(
                  <button key={id} onClick={()=>{setHp(id);setHoff(0);}} style={{background:hp===id?T.blue:"transparent",color:hp===id?"#fff":T.slate,border:"none",borderRadius:14,padding:"5px 12px",fontSize:12,fontWeight:hp===id?700:500,cursor:"pointer"}}>{lb}</button>
                ))}
              </div>
              <div style={{display:"flex",alignItems:"center",gap:6}}>
                <button onClick={()=>setHoff(o=>o+1)} aria-label="Previous" style={{width:30,height:30,borderRadius:"50%",border:`1px solid ${T.border}`,background:T.card,color:T.slate,fontSize:14,cursor:"pointer"}}>‹</button>
                <span style={{fontSize:13,fontWeight:800,minWidth:74,textAlign:"center"}}>{view.label}</span>
                <button onClick={()=>setHoff(o=>Math.max(0,o-1))} disabled={hoff===0} aria-label="Next" style={{width:30,height:30,borderRadius:"50%",border:`1px solid ${T.border}`,background:T.card,color:T.slate,fontSize:14,cursor:hoff===0?"not-allowed":"pointer",opacity:hoff===0?0.35:1}}>›</button>
              </div>
              <button onClick={downloadAll} disabled={!filtered.length} style={{background:T.blueL,border:`1px solid ${T.border}`,borderRadius:16,color:T.blue,padding:"6px 12px",fontSize:12,fontWeight:700,cursor:filtered.length?"pointer":"not-allowed",opacity:filtered.length?1:0.5,whiteSpace:"nowrap"}}>⬇ Download all</button>
            </div>
          </div>
          <div style={{overflowX:"auto"}}>
            <table style={{width:"100%",borderCollapse:"collapse",fontSize:isMobile?12:13,minWidth:520}}>
              <thead>
                <tr style={{textAlign:"left",color:T.muted,fontSize:10,textTransform:"uppercase",letterSpacing:"0.5px"}}>
                  <th style={{padding:"9px 14px",fontWeight:700}}>Date</th>
                  <th style={{padding:"9px 8px",fontWeight:700}}>Supplier</th>
                  <th style={{padding:"9px 8px",fontWeight:700}}>Location</th>
                  <th style={{padding:"9px 8px",fontWeight:700,textAlign:"right"}}>Items</th>
                  <th style={{padding:"9px 8px",fontWeight:700}}>Invoice #</th>
                  <th style={{padding:"9px 8px",fontWeight:700,textAlign:"right"}}>Invoice</th>
                  <th style={{padding:"9px 14px",fontWeight:700,textAlign:"right"}}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {histLoading?(
                  <tr><td colSpan={7} style={{padding:"22px 14px",textAlign:"center",color:T.muted}}>Loading…</td></tr>
                ):filtered.length===0?(
                  <tr><td colSpan={7} style={{padding:"22px 14px",textAlign:"center",color:T.muted}}>No receipts in {view.label}.</td></tr>
                ):filtered.map(r=>(
                  <tr key={r.id} style={{borderTop:`1px solid ${T.border}`}}>
                    <td style={{padding:"10px 14px",color:T.slate,whiteSpace:"nowrap"}}>{r.date}</td>
                    <td style={{padding:"10px 8px",fontWeight:600,overflow:"hidden",textOverflow:"ellipsis",maxWidth:160}}>{r.supplier}</td>
                    <td style={{padding:"10px 8px",color:T.muted,whiteSpace:"nowrap"}}>{r.location==="loc1"?locations.loc1:r.location==="loc2"?locations.loc2:"Shared"}</td>
                    <td style={{padding:"10px 8px",textAlign:"right",color:T.muted}}>{r.itemCount}</td>
                    <td style={{padding:"10px 8px",color:T.slate,whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis",maxWidth:120}}>{r.invoiceNumber||"—"}</td>
                    <td style={{padding:"10px 8px",textAlign:"right",fontWeight:600}}>{r.invoice!=null?`$${fmt(r.invoice)}`:"—"}</td>
                    <td style={{padding:"10px 14px",textAlign:"right",whiteSpace:"nowrap"}}>
                      <button onClick={()=>download(`receipt-${(r.supplier||"").replace(/\s+/g,"-")}-${r.date}.csv`,csvFromLines(r.supplier,r.date,linesFor(r),false,{invoiceNumber:r.invoiceNumber,savedAt:r.savedAt}))} title="Download CSV" aria-label="Download CSV" style={{background:"none",border:`1px solid ${T.border}`,borderRadius:8,color:T.blue,padding:"5px 8px",fontSize:12,cursor:"pointer",marginRight:6}}>⬇</button>
                      <button onClick={()=>delReceipt(r)} disabled={busy===r.id} title="Delete receipt (cannot be undone)" aria-label="Delete receipt" style={{background:"none",border:`1px solid ${T.coral}55`,borderRadius:8,color:T.coral,padding:"5px 9px",fontSize:13,cursor:busy===r.id?"wait":"pointer",opacity:busy===r.id?0.5:1}}>×</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {filtered.length>0&&(
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:isMobile?"10px 14px":"12px 18px",borderTop:`1px solid ${T.border}`,fontSize:13,flexWrap:"wrap",gap:6}}>
              <span style={{color:T.muted}}>{filtered.length} receipt{filtered.length!==1?"s":""} · {view.label}</span>
              <span style={{color:T.muted}}><span style={{color:T.navy,fontWeight:700}}>Invoice total ${fmt(sumI)}</span></span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── INSIGHTS ────────────────────────────────────────────────────────────────
function Insights({T,isMobile,isDesktop,card,Tag,latMon,aiInsights,insightsDate,loadingInsights,generateInsights,insightChat,chatInput,setChatInput,chatLoading,sendChat}){
  const [iView,setIView]=useState("cards");
  return(
    <div>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:20,flexWrap:"wrap",gap:12}}>
        <div>
          <h2 style={{margin:"0 0 4px",fontSize:isMobile?20:26,fontWeight:800,letterSpacing:"-0.5px"}}>AI Insights</h2>
          <p style={{margin:0,fontSize:isMobile?13:14,color:T.muted}}>Generated from your real data — specific numbers, specific recommendations</p>
        </div>
        {aiInsights&&<button onClick={generateInsights} disabled={loadingInsights} style={{background:T.blue,color:"#fff",border:"none",borderRadius:20,padding:"10px 20px",fontSize:14,fontWeight:700,cursor:loadingInsights?"not-allowed":"pointer",opacity:loadingInsights?0.7:1}}>✦ Regenerate</button>}
      </div>

      {!aiInsights&&!loadingInsights&&(
        <div style={{...card,textAlign:"center",padding:"48px 32px"}}>
          <div style={{fontSize:48,marginBottom:16}}>✦</div>
          <div style={{fontSize:isMobile?16:20,fontWeight:700,marginBottom:8}}>Ready to analyse your data</div>
          <div style={{fontSize:isMobile?13:15,color:T.muted,lineHeight:1.7,maxWidth:480,margin:"0 auto 24px"}}>Claude will analyse your real ingredient costs, menu margins and location performance, then give specific actionable recommendations — not generic advice.</div>
          <button onClick={generateInsights} style={{background:T.blue,color:"#fff",border:"none",borderRadius:20,padding:"12px 28px",fontSize:15,fontWeight:700,cursor:"pointer"}}>✦ Generate Insights</button>
        </div>
      )}

      {loadingInsights&&(
        <div style={{...card,textAlign:"center",padding:"48px 32px"}}>
          <div style={{fontSize:36,marginBottom:14}}>⏳</div>
          <div style={{fontSize:16,fontWeight:700,marginBottom:6}}>Analysing your data...</div>
          <div style={{fontSize:14,color:T.muted}}>Ingredient costs · menu margins · location performance</div>
        </div>
      )}

      {aiInsights&&!loadingInsights&&(
        <div>
          <div style={{background:T.navy,borderRadius:isDesktop?12:16,padding:isMobile?"18px 20px":isDesktop?"14px 18px":"24px 28px",marginBottom:isDesktop?12:16}}>
            <div style={{fontSize:10,color:T.bg,opacity:0.55,textTransform:"uppercase",letterSpacing:"1.5px",fontWeight:700,marginBottom:isDesktop?4:8}}>✦ Generated {new Date(insightsDate||Date.now()).toLocaleDateString("en-CA",{day:"numeric",month:"short",year:"numeric"})} · based on {latMon} data</div>
            <div style={{fontSize:isMobile?18:isDesktop?16:24,fontWeight:800,color:T.bg,lineHeight:1.4}}>{aiInsights.headline}</div>
          </div>
          <div style={card}>
            <div style={{fontSize:isMobile?15:17,fontWeight:700,marginBottom:4}}>Ask a question about your data</div>
            <div style={{fontSize:13,color:T.muted,marginBottom:14}}>e.g. "Which bowl has the worst margin?" or "If tuna goes up 10% what happens?"</div>
            {insightChat.length>0&&(
              <div style={{marginBottom:14,maxHeight:320,overflowY:"auto"}}>
                {insightChat.map((msg,i)=>(
                  <div key={i} style={{marginBottom:10,display:"flex",justifyContent:msg.role==="user"?"flex-end":"flex-start"}}>
                    <div style={{background:msg.role==="user"?T.blue:T.bg,color:msg.role==="user"?"#fff":T.navy,borderRadius:msg.role==="user"?"16px 16px 4px 16px":"16px 16px 16px 4px",padding:"10px 14px",maxWidth:"85%",fontSize:14,lineHeight:1.6,border:msg.role==="assistant"?`1px solid ${T.border}`:"none"}}>{msg.content}</div>
                  </div>
                ))}
                {chatLoading&&<div style={{display:"flex",gap:4,padding:"10px 14px"}}>{[0,1,2].map(i=><div key={i} style={{width:7,height:7,borderRadius:"50%",background:T.muted,animation:`bounce 1s ${i*0.15}s infinite`}}/>)}</div>}
              </div>
            )}
            <div style={{display:"flex",gap:8}}>
              <input value={chatInput} onChange={e=>setChatInput(e.target.value)} onKeyDown={e=>e.key==="Enter"&&sendChat()} placeholder="Ask anything about your costs and margins..." style={{flex:1,background:T.bg,border:`1px solid ${T.border}`,borderRadius:12,padding:"11px 16px",color:T.navy,fontSize:14,fontFamily:"inherit",outline:"none"}}/>
              <button onClick={sendChat} disabled={chatLoading||!chatInput.trim()} style={{background:T.blue,color:"#fff",border:"none",borderRadius:12,padding:"11px 18px",fontSize:14,fontWeight:700,cursor:chatLoading||!chatInput.trim()?"not-allowed":"pointer",opacity:chatLoading||!chatInput.trim()?0.6:1,flexShrink:0}}>Send</button>
            </div>
          </div>
          {aiInsights.focus?.bowl&&(
            <div style={{background:T.card,border:`1px solid ${T.border}`,borderLeft:`4px solid ${T.teal}`,borderRadius:isMobile?12:16,padding:isMobile?"16px":"18px 22px",marginBottom:16}}>
              <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:6,flexWrap:"wrap"}}>
                <span style={{fontSize:20}}>🎯</span>
                <span style={{fontSize:isMobile?14:16,fontWeight:800}}>This month's focus: push the {aiInsights.focus.bowl}</span>
                <Tag c={T.slate} bg={T.bg} sm>ADVISORY</Tag>
              </div>
              <div style={{fontSize:isMobile?13:14,color:T.slate,lineHeight:1.65,marginBottom:6}}>{aiInsights.focus.reason}</div>
              {aiInsights.focus.contingency&&<div style={{fontSize:12,color:T.muted}}>{aiInsights.focus.contingency}</div>}
            </div>
          )}
          <div style={{display:"flex",justifyContent:"flex-end",marginBottom:10}}>
            <div style={{display:"flex",gap:2,background:T.card,border:`1px solid ${T.border}`,borderRadius:16,padding:2}}>
              {[["cards","▦ Cards"],["list","≡ List"]].map(([id,lb])=>(
                <button key={id} onClick={()=>setIView(id)} style={{background:iView===id?T.blue:"transparent",color:iView===id?"#fff":T.slate,border:"none",borderRadius:14,padding:"5px 12px",fontSize:12,fontWeight:600,cursor:"pointer"}}>{lb}</button>
              ))}
            </div>
          </div>
          {iView==="list"&&(
            <div style={{...card,padding:0,overflow:"hidden",marginBottom:20}}>
              {aiInsights.insights?.map((ins,i,arr)=>{
                const col=ins.priority==="high"?T.coral:ins.priority==="medium"?T.amber:T.teal;
                return(
                  <div key={i} style={{display:"flex",alignItems:"center",gap:10,padding:"11px 16px",borderBottom:i<arr.length-1?`1px solid ${T.border}`:"none"}}>
                    <span style={{fontSize:18,flexShrink:0}}>{ins.icon}</span>
                    <div style={{flex:1,minWidth:0}}>
                      <div style={{fontSize:13,fontWeight:700,whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>{ins.title}</div>
                      <div style={{fontSize:12,color:col,fontWeight:600,whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>→ {ins.action}</div>
                    </div>
                    <Tag c={col} bg={ins.priority==="high"?T.coralL:ins.priority==="medium"?T.amberL:T.tealL} sm>{ins.priority?.toUpperCase()}</Tag>
                  </div>
                );
              })}
            </div>
          )}
          {iView==="cards"&&(
          <div style={{display:"grid",gridTemplateColumns:isDesktop?"1fr 1fr":"1fr",gap:10,marginBottom:20}}>
            {aiInsights.insights?.map((ins,i)=>{
              const col=ins.priority==="high"?T.coral:ins.priority==="medium"?T.amber:T.teal;
              const bg=ins.priority==="high"?T.coralL:ins.priority==="medium"?T.amberL:T.tealL;
              return(
                <div key={i} style={{background:T.card,border:`1px solid ${T.border}`,borderLeft:`4px solid ${col}`,borderRadius:isMobile?12:16,padding:isMobile?"16px":"20px 22px"}}>
                  <div style={{display:"flex",alignItems:"flex-start",gap:12}}>
                    <div style={{fontSize:isMobile?22:26,flexShrink:0}}>{ins.icon}</div>
                    <div style={{flex:1}}>
                      <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:6,flexWrap:"wrap"}}>
                        <div style={{fontSize:isMobile?14:16,fontWeight:800}}>{ins.title}</div>
                        <Tag c={col} bg={bg} sm>{ins.priority?.toUpperCase()}</Tag>
                      </div>
                      <div style={{fontSize:isMobile?13:14,color:T.slate,lineHeight:1.65,marginBottom:10}}>{ins.detail}</div>
                      <div style={{fontSize:isMobile?12:13,color:col,fontWeight:700}}>→ {ins.action}</div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── MENU / RECIPE EDITOR ──────────────────────────────────────────────────────────
function MenuTab({T,isMobile,isDesktop,card,Tag,data,bCost,bFCP,bMargin,blendedPrice,priceFor,say,reload,selIng,setSelIng,checks,chkIng,chkAll,doCheck,market,searchTerms,saveSearchTerm}){
  const [sub,setSub]=useState("ingredients");
  const [histMonth,setHistMonth]=useState("live");
  const [sel,setSel]=useState(null);
  const [draft,setDraft]=useState(null); // {sizes:{small,medium,large}, ing:{small:{},medium:{},large:{}}}
  const [edSz,setEdSz]=useState("medium");
  const [addSel,setAddSel]=useState("");
  const [newBowl,setNewBowl]=useState("");
  const [saving,setSaving]=useState(false);
  const [resyncing,setResyncing]=useState(false);
  const doResync=async()=>{
    if(!window.confirm("Resync the menu from the built-in seed?\n\nThis ADDS any items missing from the menu and OVERWRITES the sizes, recipe and prices of existing items with the seed (spreadsheet) values. In-app edits to those items will be replaced."))return;
    setResyncing(true);
    try{
      const {orphans}=await resyncMenu();
      if(orphans.length){
        const del=window.confirm(`${orphans.length} item(s) are on the menu but NOT in the seed:\n\n${orphans.join(", ")}\n\nOK = delete them so the menu matches the seed.\nCancel = keep them.`);
        if(del){for(const n of orphans)await deleteMenuItem(n);}
      }
      await reload();
      say(orphans.length?`Menu resynced · ${orphans.length} orphan(s) reviewed`:"Menu resynced from seed");
    }catch(e){console.error(e);say("Resync failed",true);}
    setResyncing(false);
  };
  const SZ=["small","medium","large"];
  const SZL={small:"S",medium:"M",large:"L"};
  const inp={background:T.bg,border:`1px solid ${T.border}`,borderRadius:8,padding:"8px 10px",color:T.navy,fontSize:14,fontFamily:"inherit",outline:"none"};
  const MN2=["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
  const histOptions=(()=>{const o=[];const now=new Date();for(let i=1;i<=12;i++){const d=new Date(now.getFullYear(),now.getMonth()-i);o.push(`${MN2[d.getMonth()]} ${d.getFullYear()}`);}return o;})();
  const norm=(p,u)=>{const m=/^(\d+(?:\.\d+)?)\s*(kg|g|l|ml|lb|oz)$/i.exec((u||"").trim());if(!m)return p;const n=parseFloat(m[1]);return n>0?p/n:p;};
  const baseU=(u)=>{const m=/^(\d+(?:\.\d+)?)\s*(kg|g|l|ml|lb|oz)$/i.exec((u||"").trim());return m?m[2].toLowerCase():(u||"unit");};
  const gIL=n=>{const e=data.ingredients[n];if(!e||!e.length)return 0;const last=e[e.length-1];return norm(last.price,last.unit);};
  const gILAt=(n,monthKey)=>{
    const e=data.ingredients[n];if(!e||!e.length)return 0;
    if(monthKey==="live")return gIL(n);
    const mi=MN2.indexOf(monthKey.split(" ")[0]);const y=parseInt(monthKey.split(" ")[1]);
    const cutoff=new Date(y,mi+1,0).getTime();
    const valid=e.filter(x=>new Date(x.date).getTime()<=cutoff);
    if(!valid.length)return 0;
    const last=valid[valid.length-1];return norm(last.price,last.unit);
  };
  const ingOf=(m,sz)=>m.ing?.[sz]||m.ing?.medium||{};
  const costOf=(ingSet,at="live")=>Object.entries(ingSet).reduce((s,[i,q])=>s+gILAt(i,at)*(parseFloat(q)||0),0);
  const open=(name)=>{
    const m=data.menu[name];
    setSel(name);setEdSz("medium");
    setDraft({
      sizes:{small:m.sizes?.small??((m.price||18.95)-2),medium:m.sizes?.medium??(m.price||18.95),large:m.sizes?.large??((m.price||18.95)+3)},
      ing:{small:{...ingOf(m,"small")},medium:{...ingOf(m,"medium")},large:{...ingOf(m,"large")}},
    });
  };
  const save=async()=>{
    if(!draft)return;setSaving(true);
    const cleanIng={small:{},medium:{},large:{}};
    SZ.forEach(sz=>Object.entries(draft.ing[sz]).forEach(([i,q])=>{const n=parseFloat(q);if(n>0)cleanIng[sz][i]=n;}));
    const sizes={small:parseFloat(draft.sizes.small)||0,medium:parseFloat(draft.sizes.medium)||0,large:parseFloat(draft.sizes.large)||0};
    try{
      await saveMenuItem(sel,sizes,cleanIng,data.menu[sel]?.category||"classic");
      await reload();say(`${sel} saved`);setSel(null);setDraft(null);
    }catch(e){say("Save failed",true);}
    setSaving(false);
  };
  const delBowl=async(name)=>{
    if(!window.confirm(`Delete "${name}" from the menu? This cannot be undone.`))return;
    try{await deleteMenuItem(name);await reload();setSel(null);setDraft(null);say(`${name} deleted`);}
    catch(e){say("Delete failed",true);}
  };
  const createBowl=async()=>{
    const name=newBowl.trim();if(!name)return;
    if(data.menu[name]){say("A bowl with that name exists",true);return;}
    try{
      await saveMenuItem(name,{small:19.95,medium:21.95,large:24.95},{small:{},medium:{},large:{}},"classic");
      await reload();setNewBowl("");
      setSel(name);setEdSz("medium");
      setDraft({sizes:{small:19.95,medium:21.95,large:24.95},ing:{small:{},medium:{},large:{}}});
      say(`${name} created — add its ingredients per size`);
    }catch(e){say("Create failed",true);}
  };
  const addIng=(v)=>{
    if(!v)return;
    setDraft(p=>({...p,ing:{
      small:{...p.ing.small,[v]:p.ing.small[v]||0.08},
      medium:{...p.ing.medium,[v]:p.ing.medium[v]||0.1},
      large:{...p.ing.large,[v]:p.ing.large[v]||0.125},
    }}));
    setAddSel("");
  };
  const removeIng=(ing)=>{
    setDraft(p=>{const n={small:{...p.ing.small},medium:{...p.ing.medium},large:{...p.ing.large}};SZ.forEach(sz=>delete n[sz][ing]);return{...p,ing:n};});
  };
  return(
    <div>
      <div style={{display:"flex",gap:3,background:T.card,border:`1px solid ${T.border}`,borderRadius:20,padding:3,width:"fit-content",marginBottom:16}}>
        {[["recipes","Recipes"],["ingredients","Ingredients"]].map(([id,lb])=>(
          <button key={id} onClick={()=>setSub(id)} style={{background:sub===id?T.blue:"transparent",color:sub===id?"#fff":T.slate,border:"none",borderRadius:16,padding:"7px 18px",fontSize:13,fontWeight:sub===id?700:500,cursor:"pointer"}}>{lb}</button>
        ))}
      </div>
      {sub==="ingredients"&&<Ingredients {...{T,isMobile,isDesktop,card,Tag,data,selIng,setSelIng,checks,chkIng,chkAll,doCheck,say,reload,market,searchTerms,saveSearchTerm}}/>}
      {sub==="recipes"&&(<div>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:12,flexWrap:"wrap",gap:8}}>
        <div style={{fontSize:isMobile?13:14,color:T.slate,lineHeight:1.6,maxWidth:640}}>Your bowls with real per-size portions — tap a bowl, pick S / M / L, and enter what the kitchen actually uses for that size. Margins per size recalculate live. Costs update the moment a receipt lands.</div>
        <div style={{display:"flex",gap:8}}>
          <input value={newBowl} onChange={e=>setNewBowl(e.target.value)} onKeyDown={e=>e.key==="Enter"&&createBowl()} placeholder="New bowl name..." style={{...inp,width:150}}/>
          <button onClick={createBowl} disabled={!newBowl.trim()} style={{background:T.blue,color:"#fff",border:"none",borderRadius:20,padding:"8px 16px",fontSize:13,fontWeight:700,cursor:"pointer",opacity:newBowl.trim()?1:0.5,whiteSpace:"nowrap"}}>+ Add bowl</button>
          <button onClick={doResync} disabled={resyncing} title="Overwrite the menu with the built-in seed (spreadsheet) values" style={{background:"transparent",color:T.slate,border:`1px solid ${T.border}`,borderRadius:20,padding:"8px 16px",fontSize:13,fontWeight:700,cursor:resyncing?"not-allowed":"pointer",opacity:resyncing?0.6:1,whiteSpace:"nowrap"}}>{resyncing?"Resyncing...":"⟳ Resync from seed"}</button>
        </div>
      </div>
      <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:16,flexWrap:"wrap"}}>
        <span style={{fontSize:12,color:T.muted,fontWeight:700}}>Cost basis:</span>
        <select value={histMonth} onChange={e=>setHistMonth(e.target.value)} style={{background:T.bg,border:`1px solid ${T.border}`,borderRadius:16,padding:"7px 14px",color:T.navy,fontSize:13,fontWeight:600,outline:"none"}}>
          <option value="live">Live (latest prices)</option>
          {histOptions.map(m=><option key={m} value={m}>{m} prices</option>)}
        </select>
        {histMonth!=="live"&&<span style={{fontSize:12,color:T.amber,fontWeight:600}}>Showing costs as they were in {histMonth} · editing disabled</span>}
      </div>
      {Object.keys(data.menu).length===0&&(
        <div style={{...card,textAlign:"center",padding:"48px 24px",color:T.muted}}>
          <div style={{fontSize:44,marginBottom:12}}>🍲</div>
          <div style={{fontSize:16,fontWeight:700,color:T.slate,marginBottom:6}}>No menu items yet</div>
          <div style={{fontSize:14}}>Add your first bowl above to start tracking margins.</div>
        </div>
      )}
      {[["Classic Bowls",["classic",undefined]],["Build Your Own",["byo"]],["Sides",["side"]],["Drinks",["drink"]]].map(([secTitle,cats])=>{
        const items=Object.entries(data.menu).filter(([,m])=>cats.includes(m.category)||(cats.includes(undefined)&&!m.category));
        if(!items.length)return null;
        return(
        <div key={secTitle} style={{marginBottom:18}}>
        <div style={{fontSize:11,color:T.muted,fontWeight:800,textTransform:"uppercase",letterSpacing:"1px",margin:"0 0 8px 2px"}}>{secTitle} · {items.length}</div>
        <div style={{display:"grid",gridTemplateColumns:isDesktop?"repeat(3,minmax(0,1fr))":"1fr",gap:10}}>
        {items.map(([name,m])=>{
          const isSel=sel===name;
          const simple=m.category==="side"||m.category==="drink";
          const hist=histMonth!=="live";
          // header figures: blended (or historical blended-ish using medium view for simplicity in hist mode)
          const headCost=hist?costOf(ingOf(m,"medium"),histMonth):(isSel&&draft?costOf(draft.ing.medium):bCost(name));
          const headSell=simple?(m.sizes?.medium??m.price??0):(hist?(m.sizes?.medium??m.price??0):(isSel&&draft?(parseFloat(draft.sizes.medium)||0):blendedPrice(name)));
          const fp=headSell?(headCost/headSell)*100:0;
          const mg=headSell?((headSell-headCost)/headSell)*100:0;
          return(
            <div key={name} onClick={()=>!hist&&!isSel&&open(name)} style={{...card,borderColor:isSel?T.blue:T.border,cursor:isSel||hist?"default":"pointer",gridColumn:isSel&&isDesktop?"1 / -1":"auto"}}>
              <div style={{display:"flex",alignItems:"center",gap:12,flexWrap:"wrap"}}>
                <div style={{flex:1,minWidth:120}}>
                  <div style={{fontSize:isMobile?15:17,fontWeight:700}}>{name}</div>
                  <div style={{fontSize:12,color:T.muted}}>{simple?`Sell $${fmt(headSell)} · cost $${fmt(headCost)}${hist?` (${histMonth})`:""}`:hist?`M sell $${fmt(headSell)} · M cost $${fmt(headCost)} (${histMonth})`:isSel?`M sell $${fmt(headSell)} · M cost $${fmt(headCost)}`:`Blended sell $${fmt(headSell)} · cost $${fmt(headCost)}`}</div>
                </div>
                <div style={{textAlign:"right"}}>
                  <Tag c={fp>30?T.coral:T.teal} bg={fp>30?T.coralL:T.tealL} sm>{fp.toFixed(1)}% food cost</Tag>
                  <div style={{fontSize:11,color:T.muted,marginTop:3}}>{mg.toFixed(1)}% margin</div>
                </div>
              </div>

              {isSel&&draft&&(
                <div style={{marginTop:14,paddingTop:14,borderTop:`1px solid ${T.border}`}} onClick={e=>e.stopPropagation()}>

                  {(m.category==="side"||m.category==="drink")&&(
                    <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:14}}>
                      <span style={{fontSize:12,color:T.muted,fontWeight:700}}>PRICE $</span>
                      <input type="number" inputMode="decimal" value={draft.sizes.medium} onChange={e=>setDraft(pr=>({...pr,sizes:{small:e.target.value,medium:e.target.value,large:e.target.value}}))} style={{...inp,width:90,textAlign:"right",fontWeight:700}}/>
                      <span style={{fontSize:11,color:T.muted}}>single size · cost ${fmt(costOf(draft.ing.medium))}</span>
                    </div>
                  )}
                  {!(m.category==="side"||m.category==="drink")&&(
                  <div style={{display:"grid",gridTemplateColumns:isMobile?"1fr":"repeat(3,1fr)",gap:8,marginBottom:14}}>
                    {SZ.map(sz=>{
                      const c=costOf(draft.ing[sz]);
                      const p=parseFloat(draft.sizes[sz])||0;
                      const f=p?(c/p)*100:0;
                      return(
                        <div key={sz} onClick={()=>setEdSz(sz)} style={{background:edSz===sz?T.blueL:T.bg,border:`1.5px solid ${edSz===sz?T.blue:T.border}`,borderRadius:12,padding:"10px 12px",cursor:"pointer"}}>
                          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:4}}>
                            <span style={{fontSize:13,fontWeight:800,color:edSz===sz?T.blue:T.slate}}>{SZL[sz]}{edSz===sz?" · editing":""}</span>
                            <span style={{fontSize:12,fontWeight:700,color:f>30?T.coral:T.teal}}>{f.toFixed(1)}%</span>
                          </div>
                          <div style={{display:"flex",alignItems:"center",gap:6}}>
                            <span style={{fontSize:11,color:T.muted}}>$</span>
                            <input type="number" inputMode="decimal" value={draft.sizes[sz]} onClick={e=>e.stopPropagation()} onChange={e=>setDraft(pr=>({...pr,sizes:{...pr.sizes,[sz]:e.target.value}}))} style={{...inp,width:72,textAlign:"right",fontWeight:700,padding:"5px 8px"}}/>
                            <span style={{fontSize:11,color:T.muted,marginLeft:"auto"}}>cost ${fmt(c)}</span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                  )}

                  <div style={{fontSize:11,color:T.muted,fontWeight:700,textTransform:"uppercase",letterSpacing:"0.8px",marginBottom:6}}>{(m.category==="side"||m.category==="drink")?"Portion · actual quantities used":`${SZL[edSz]} bowl · actual quantities used`}</div>
                  {Object.entries(draft.ing[edSz]).map(([ing,qty])=>(
                    <div key={ing} style={{display:"flex",alignItems:"center",gap:10,padding:"7px 0",borderBottom:`1px solid ${T.border}`}}>
                      <div style={{flex:1,fontSize:14,fontWeight:600}}>{ing}{!(data.ingredients[ing]&&data.ingredients[ing].length)&&<span title="No recorded price yet — add one in Ingredients for this to affect cost" style={{marginLeft:8,fontSize:9,fontWeight:700,color:T.amber,background:T.amberL,border:`1px solid ${T.amber}44`,padding:"1px 6px",borderRadius:9,whiteSpace:"nowrap",textTransform:"uppercase",letterSpacing:"0.4px"}}>no price</span>}</div>
                      <input type="number" inputMode="decimal" step="0.01" value={qty} onChange={e=>setDraft(p=>{const v=e.target.value;if(m.category==="side"||m.category==="drink"){return{...p,ing:{small:{...p.ing.small,[ing]:v},medium:{...p.ing.medium,[ing]:v},large:{...p.ing.large,[ing]:v}}};}return{...p,ing:{...p.ing,[edSz]:{...p.ing[edSz],[ing]:v}}};})} style={{...inp,width:80,textAlign:"right"}}/>
                      <div style={{fontSize:12,color:T.muted,width:44}}>{baseU(data.ingredients[ing]?.[0]?.unit)}</div>
                      <div style={{fontSize:13,fontWeight:600,color:T.slate,width:64,textAlign:"right"}}>${fmt(gIL(ing)*(parseFloat(qty)||0))}</div>
                      <button onClick={()=>removeIng(ing)} title="Remove from all sizes" style={{background:"none",border:"none",color:T.coral,fontSize:16,cursor:"pointer",padding:"2px 6px"}}>×</button>
                    </div>
                  ))}
                  {Object.keys(draft.ing[edSz]).length===0&&<div style={{padding:"14px 0",fontSize:13,color:T.muted}}>No ingredients on the {SZL[edSz]} yet — add below (new ingredients are pre-filled on all three sizes as estimates; correct each size to what the kitchen actually uses).</div>}

                  <div style={{display:"flex",gap:8,marginTop:12,flexWrap:"wrap"}}>
                    <select value={addSel} onChange={e=>addIng(e.target.value)} style={{...inp,flex:1,minWidth:150}}>
                      <option value="">Add to recipe…</option>
                      {[...new Set([...CATALOG.map(c=>c.name),...(data.customIngredients||[]).map(c=>c.name),...Object.keys(data.ingredients)])].sort((a,b)=>a.localeCompare(b)).filter(i=>!(i in draft.ing.medium)).map(i=><option key={i} value={i}>{i}{(data.ingredients[i]&&data.ingredients[i].length)?"":" — no price yet"}</option>)}
                    </select>
                    <button onClick={save} disabled={saving} style={{background:T.teal,color:"#fff",border:"none",borderRadius:10,padding:"10px 22px",fontSize:14,fontWeight:800,cursor:"pointer",opacity:saving?0.6:1}}>{saving?"Saving...":"Save all sizes"}</button>
                    <button onClick={()=>{setSel(null);setDraft(null);}} style={{background:"transparent",border:`1px solid ${T.border}`,borderRadius:10,color:T.muted,padding:"10px 16px",fontSize:13,cursor:"pointer"}}>Cancel</button>
                    <button onClick={()=>delBowl(name)} style={{marginLeft:"auto",background:"none",border:`1px solid ${T.coral}55`,borderRadius:10,color:T.coral,padding:"10px 16px",fontSize:13,fontWeight:700,cursor:"pointer"}}>Delete bowl</button>
                  </div>
                </div>
              )}
            </div>
          );
        })}
        </div>
        </div>
        );
      })}
      </div>)}
    </div>
  );
}
