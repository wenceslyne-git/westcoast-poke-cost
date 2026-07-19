import { useState, useRef, useEffect } from "react";
import { LIGHT, DARK, DATA, gL, gPct, fmt, fmtK, useBreakpoint, Spark, PriceChart, WCP_LOGO, ADDONS } from "./data.jsx";
import { supabase, isOwner } from "./supabase.js";
import { loadAll, seedIfEmpty, saveReceipt, saveSales, addPrice, deletePriceEntry, deleteIngredient, deleteSupplier, upsertSupplier, saveMenuItem, deleteMenuItem, saveAlert, saveMarketChecks, loadMarketChecks, canRunToday, recordRun, loadSetting, saveSetting, scansThisMonth, recordScan } from "./db.js";
import Login from "./Login.jsx";

const API_HEADERS = () => ({
  "Content-Type":"application/json",
  "x-api-key":import.meta.env.VITE_ANTHROPIC_KEY,
  "anthropic-version":"2023-06-01",
  "anthropic-dangerous-direct-browser-access":"true",
});
const MODEL="claude-sonnet-4-6";


const NavIcon=({id,size=22})=>{
  const p={fill:"none",stroke:"currentColor",strokeWidth:1.8,strokeLinecap:"round",strokeLinejoin:"round"};
  if(id==="dashboard")return(<svg width={size} height={size} viewBox="0 0 24 24"><polyline points="3.5,17.5 9,12 13,15 20,7" {...p}/><polyline points="15,7 20,7 20,12" {...p}/><line x1="3.5" y1="21" x2="20.5" y2="21" {...p} opacity="0.45"/></svg>);
  if(id==="sales")return(<svg width={size} height={size} viewBox="0 0 24 24"><line x1="12" y1="2.5" x2="12" y2="21.5" {...p}/><path d="M16.5 6.5H10a3.25 3.25 0 0 0 0 6.5h4a3.25 3.25 0 0 1 0 6.5H7" {...p}/></svg>);
  if(id==="menu")return(<svg width={size} height={size} viewBox="0 0 24 24"><path d="M3.5 12.5h17a8.5 6.5 0 0 1-17 0z" {...p}/><line x1="6.5" y1="9.5" x2="17" y2="3.5" {...p}/><line x1="9.5" y1="10" x2="19.5" y2="5" {...p}/></svg>);
  if(id==="suppliers")return(<svg width={size} height={size} viewBox="0 0 24 24"><path d="M6 2.5h12v19l-2-1.6-2 1.6-2-1.6-2 1.6-2-1.6-2 1.6z" {...p}/><line x1="9" y1="7.5" x2="15" y2="7.5" {...p}/><line x1="9" y1="11" x2="15" y2="11" {...p}/><line x1="9" y1="14.5" x2="13" y2="14.5" {...p}/></svg>);
  if(id==="insights")return(<svg width={size} height={size} viewBox="0 0 24 24"><path d="M10 3.5l1.6 4.4L16 9.5l-4.4 1.6L10 15.5l-1.6-4.4L4 9.5l4.4-1.6z" {...p}/><path d="M18 13l0.9 2.3L21 16.2l-2.1 0.9L18 19.4l-0.9-2.3-2.1-0.9 2.1-0.9z" {...p}/><path d="M17.5 3.5l0.6 1.6 1.6 0.6-1.6 0.6-0.6 1.6-0.6-1.6-1.6-0.6 1.6-0.6z" {...p}/></svg>);
  return null;
};

export default function App(){
  const [dark,setDark]=useState(false);
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
        const mix=await loadSetting("size_mix",{small:25,medium:50,large:25});
        if(!cancelled&&mix)setSizeMix(mix);
        if(!cancelled)await refreshCaps();
      }catch(e){console.error("DB load failed",e);}
      if(!cancelled)setDbLoading(false);
    })();
    return()=>{cancelled=true;};
  },[session]);

  const [data,setData]=useState(DATA);
  const [tab,setTab]=useState("dashboard");
  const [loc,setLoc]=useState("all");
  const [toast,setToast]=useState(null);
  const [modal,setModal]=useState(null);
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
  const [sizeMix,setSizeMix]=useState({small:25,medium:50,large:25});
  const [caps,setCaps]=useState({});
  const refreshCaps=async()=>{
    const out={};
    for(const a of ["price_check","discovery","preferred_refresh"]){out[a]=await canRunToday(a);}
    setCaps(out);
  };
  const reload=async()=>{try{const d=await loadAll();setData(d);setInsightsStale(true);}catch(e){console.error(e);}};
  const [aiInsights,setAiInsights]=useState(null);
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
  const costSzAt=(item,sz,monthKey)=>{const m=data.menu[item];if(!m)return 0;return Object.entries(ingFor(m,sz)).reduce((sum,[i,q])=>sum+gILAtApp(i,monthKey)*q,0);};
  const bCostAtApp=(item,monthKey)=>{const w=mixW();return SIZES.reduce((s,sz)=>s+costSzAt(item,sz,monthKey)*w[sz],0);};
  const SIZES=["small","medium","large"];
  const isBowl=m=>!m.category||m.category==="classic"||m.category==="byo";
  const mixW=()=>{const t=(sizeMix.small||0)+(sizeMix.medium||0)+(sizeMix.large||0)||100;return{small:(sizeMix.small||0)/t,medium:(sizeMix.medium||0)/t,large:(sizeMix.large||0)/t};};
  const ingFor=(m,sz)=>m.ing?.[sz]||m.ing?.medium||m.ing||{};
  const priceFor=(m,sz)=>m.sizes?.[sz]??m.price??0;
  const costSz=(item,sz)=>{const m=data.menu[item];if(!m)return 0;return Object.entries(ingFor(m,sz)).reduce((s,[i,q])=>s+gIL(i)*q,0);};
  const blendedPrice=item=>{const m=data.menu[item];if(!m)return 0;const w=mixW();return SIZES.reduce((s,sz)=>s+priceFor(m,sz)*w[sz],0);};
  const bCost=item=>{const m=data.menu[item];if(!m)return 0;const w=mixW();return SIZES.reduce((s,sz)=>s+costSz(item,sz)*w[sz],0);};
  const bFCP=item=>{const p=blendedPrice(item);if(!p)return 0;return(bCost(item)/p)*100;};
  const bMargin=item=>{const p=blendedPrice(item);if(!p)return 0;return((p-bCost(item))/p)*100;};

  const movers=Object.entries(data.ingredients).map(([n,e])=>({n,ch:gPct(e),lat:gL(e),unit:e[0]?.unit,entries:e})).sort((a,b)=>Math.abs(b.ch)-Math.abs(a.ch)).slice(0,8);
  const activeAlerts=Object.entries(data.alerts).filter(([i,t])=>{const e=data.ingredients[i];return e&&e.length&&gL(e)>t;});
  const locName=l=>l==="loc1"?data.locations.loc1:l==="loc2"?data.locations.loc2:"All Locations";

  const cRev=(mon,l)=>{const s=data.sales[mon];if(!s)return 0;if(l==="loc1")return s.loc1;if(l==="loc2")return s.loc2;return(s.loc1||0)+(s.loc2||0);};
  const cCOGS=(mon,l)=>{const s=data.sales[mon];if(!s||!s.mix)return 0;return Object.entries(data.menu).reduce((t,[item])=>{const mix=s.mix[item];if(!mix)return t;const sold=l==="loc1"?(mix.loc1||0):l==="loc2"?(mix.loc2||0):((mix.loc1||0)+(mix.loc2||0));return t+bCost(item)*sold;},0);};

  const months=Object.keys(data.sales).sort((a,b)=>new Date(a)-new Date(b));
  const latMon=months[months.length-1];
  const prevMon=months[months.length-2];
  const locKey=loc==="all"?"all":loc;
  const rev=latMon?cRev(latMon,locKey):0;
  const cogs=latMon?cCOGS(latMon,locKey):0;
  const gp=rev-cogs;
  const fcp=rev?(cogs/rev)*100:0;
  const prevRev=prevMon?cRev(prevMon,locKey):0;
  const revDelta=prevRev?((rev-prevRev)/prevRev)*100:0;

  const headline=fcp>35
    ?{pre:"Margins are ",em:"under pressure.",sub:`Food COGS at ${fcp.toFixed(1)}% — ${(fcp-30).toFixed(1)}pts above the 30% benchmark.`,color:T.coral}
    :fcp>30
    ?{pre:"Margins are ",em:"tightening.",sub:`Food COGS at ${fcp.toFixed(1)}% — worth a closer look at protein costs.`,color:T.amber}
    :revDelta>5
    ?{pre:"Revenue is ",em:"growing.",sub:`Up ${revDelta.toFixed(1)}% vs last month. Keep an eye on COGS tracking with it.`,color:T.teal}
    :{pre:"Operations look ",em:"steady.",sub:`Food COGS at ${fcp.toFixed(1)}% — within the healthy 28–32% range.`,color:T.teal};

  const worstBowl=Object.entries(data.menu).map(([n])=>({n,fcp:bFCP(n)})).sort((a,b)=>b.fcp-a.fcp)[0];
  const biggestMover=movers[0];
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
      const res=await fetch("https://api.anthropic.com/v1/messages",{method:"POST",headers:API_HEADERS(),body:JSON.stringify({model:MODEL,max_tokens:600,messages:[{role:"user",content:[fileBlock,{type:"text",text:'Parse this supplier receipt or invoice for a poke restaurant in Vancouver. Return ONLY JSON no markdown: {"supplier":"name or Unknown","date":"YYYY-MM-DD","items":[{"ingredient":"normalised name","price":0.00,"unit":"lb","quantity":1,"line_total":0.00}]}. price = UNIT price. quantity = units bought. line_total = quantity x unit price as shown on the receipt. Skip taxes and fees. If unreadable: {"error":"Cannot read receipt clearly"}'}]}]})});
      const out=await res.json();
      if(!res.ok){
        const apiMsg=out?.error?.message||`API error ${res.status}`;
        say(apiMsg.slice(0,120),true);
        setScanning(false);
        return;
      }
      const txt=out.content?.find(b=>b.type==="text")?.text||"";
      const parsed=JSON.parse(txt.replace(/```json|```/g,"").trim());
      if(parsed.error){say(parsed.error,true);}
      else{
        recordScan(session?.user?.email).catch(()=>{});
        const fp=`${parsed.supplier}|${parsed.date}|${parsed.items?.length}`;
        if((data.receipts||[]).includes(fp)){setModal(parsed);}
        else{setScanRes(parsed);say(`Found ${parsed.items?.length||0} items on receipt`);}
      }
    }catch(e){say("Could not parse receipt — try a clearer photo",true);}
    setScanning(false);
  };

  const okScan=async(r=null)=>{
    const result=r||scanRes;if(!result?.items)return;
    const u=JSON.parse(JSON.stringify(data)),d=result.date||"2026-07-16";
    let saved=0;
    result.items.forEach(it=>{
      if(!u.ingredients[it.ingredient])u.ingredients[it.ingredient]=[];
      const dup=u.ingredients[it.ingredient].some(e=>e.date===d&&e.supplier===result.supplier);
      if(!dup){u.ingredients[it.ingredient].push({date:d,price:it.price,unit:it.unit||"unit",supplier:result.supplier||"Unknown"});saved++;}
    });
    u.receipts=[...(u.receipts||[]),`${result.supplier}|${result.date}|${result.items.length}`];
    if(!u.suppliers[result.supplier])u.suppliers[result.supplier]={type:"retail",notes:"Added from receipt scan."};
    setData(u);setInsightsStale(true);setScanRes(null);setImg(null);setModal(null);setTab("dashboard");
    try{
      await saveReceipt(result,scanLoc);
      await reload();
      say(`Saved ${saved} item${saved!==1?"s":""} to database`);
    }catch(e){
      console.error(e);
      say("Saved locally — database sync failed",true);
    }
  };

  // ── price check ──
  const doCheck=async(ing,unit,price,market=false)=>{
    setChkIng(ing);setChecks(p=>({...p,[ing]:{status:"loading"}}));
    const prefs=Object.entries(data.suppliers).filter(([,sp])=>sp.preferred).map(([n])=>n);
    const usePref=!market&&prefs.length>0;
    const where=usePref?`at these specific suppliers: ${prefs.join(", ")} (Vancouver BC area)`:`at Costco, T&T Supermarket, H-Mart, Save-On-Foods, local markets in Vancouver BC Canada`;
    try{
      const r=await fetch("https://api.anthropic.com/v1/messages",{method:"POST",headers:API_HEADERS(),body:JSON.stringify({model:MODEL,max_tokens:800,tools:[{type:"web_search_20250305",name:"web_search",max_uses:2}],messages:[{role:"user",content:`Search current price of "${ing}" per ${unit} ${where}. Return ONLY JSON no markdown: {"marketRange":{"low":0.00,"high":0.00},"sources":[{"store":"Name","price":0.00,"url":"real page URL or empty string","notes":"brief"}],"verdict":"good|high|very_high","recommendation":"one actionable sentence"}. Every source MUST include the real url of the page the price came from; if you cannot verify a price with a real page, omit it. No data: {"error":"No reliable price data"}`}]})});
      const out=await r.json();
      const txt=out.content?.find(b=>b.type==="text")?.text||"";
      const parsed=JSON.parse(txt.replace(/```json|```/g,"").trim());
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

  const doAllChecks=async()=>{
    const gate=await canRunToday("price_check");
    if(!gate.allowed){say(`Already checked today${gate.last?.by_email?" by "+gate.last.by_email.split("@")[0]:""} — next check tomorrow`,true);return;}
    setChkAll(true);
    await recordRun("price_check",session?.user?.email);
    for(const[n,e]of Object.entries(data.ingredients))await doCheck(n,e[0]?.unit||"unit",gL(e));
    setChkAll(false);await refreshCaps();say("Daily price check complete");
  };

  // ── AI insights ──
  const buildDataSummary=()=>JSON.stringify({
    period:latMon,
    locations:data.locations,
    revenue:{total:rev,loc1:latMon?cRev(latMon,"loc1"):0,loc2:latMon?cRev(latMon,"loc2"):0},
    cogsPct:{overall:fcp.toFixed(1),loc1:latMon&&cRev(latMon,"loc1")?(cCOGS(latMon,"loc1")/cRev(latMon,"loc1")*100).toFixed(1):0,loc2:latMon&&cRev(latMon,"loc2")?(cCOGS(latMon,"loc2")/cRev(latMon,"loc2")*100).toFixed(1):0},
    topMovers:movers.slice(0,5).map(m=>({ingredient:m.n,changePct:m.ch.toFixed(1),price:`$${m.lat.toFixed(2)}/${m.unit}`})),
    menu:Object.entries(data.menu).map(([name])=>({name,sellBlended:blendedPrice(name).toFixed(2),costBlended:bCost(name).toFixed(2),foodCostPct:bFCP(name).toFixed(1)})),
    sizeMix,
    addOnPricing:ADDONS,
    alerts:activeAlerts.map(([i,t])=>({ingredient:i,threshold:t,current:gL(data.ingredients[i]).toFixed(2)})),
    marketSignals:Object.entries(market).slice(0,20).map(([ing,rows])=>{
      const latest=rows[rows.length-1];const first=rows[0];
      return {ingredient:ing,latestMarket:latest?`$${latest.price} (${latest.source}, ${String(latest.at).slice(0,10)})`:null,checksRecorded:rows.length,marketTrendPct:rows.length>=3&&first.price?(((latest.price-first.price)/first.price)*100).toFixed(1):null,advisory:true};
    }),
  });

  const generateInsights=async()=>{
    setLoadingInsights(true);setAiInsights(null);setInsightsStale(false);
    try{
      const res=await fetch("https://api.anthropic.com/v1/messages",{method:"POST",headers:API_HEADERS(),body:JSON.stringify({model:MODEL,max_tokens:1500,messages:[{role:"user",content:`You are a food cost analyst for Westcoast Poké, a two-location poke restaurant in Vancouver BC. Data: ${buildDataSummary()}\n\nData notes: prices in ingredients are what the restaurant actually pays (receipts). marketSignals are advisory web-check results with dates — use them for comparisons and direction but never treat them as paid prices, and always cite the check date. Give 4-5 specific actionable insights referencing actual numbers, bowls and ingredients from the data. If marketSignals exist, one insight should compare paid vs market with the monthly dollar impact. Also choose ONE focus bowl to push this month using margins, market direction and sales mix together. Return ONLY JSON no markdown: {"headline":"one punchy sentence on the biggest issue or opportunity","focus":{"bowl":"name","reason":"2 sentences: why this bowl now, citing data","contingency":"one sentence: what to revisit if conditions change"},"insights":[{"priority":"high|medium|low","icon":"emoji","title":"short title with a number","detail":"2-3 sentences with specific numbers","action":"exactly what to do next"}]}`}]})});
      const out=await res.json();
      const txt=out.content?.find(b=>b.type==="text")?.text||"";
      setAiInsights(JSON.parse(txt.replace(/```json|```/g,"").trim()));
    }catch(e){say("Could not generate insights — try again",true);}
    setLoadingInsights(false);
  };

  const sendChat=async()=>{
    if(!chatInput.trim()||chatLoading)return;
    const hist=[...insightChat,{role:"user",content:chatInput}];
    setInsightChat(hist);setChatInput("");setChatLoading(true);
    try{
      const res=await fetch("https://api.anthropic.com/v1/messages",{method:"POST",headers:API_HEADERS(),body:JSON.stringify({model:MODEL,max_tokens:600,system:`You are a food cost analyst for Westcoast Poké Vancouver. Answer using this data: ${buildDataSummary()}. Be concise and specific with numbers. 2-3 sentences max.`,messages:hist})});
      const out=await res.json();
      const txt=out.content?.find(b=>b.type==="text")?.text||"Sorry, I could not answer that.";
      setInsightChat([...hist,{role:"assistant",content:txt}]);
    }catch(e){say("Chat failed — try again",true);}
    setChatLoading(false);
  };

  // ── styles ──
  const MAXW=isDesktop?1280:900;
  const card={background:T.card,border:`1px solid ${T.border}`,borderRadius:isMobile?12:16,padding:isMobile?"16px":"22px 24px"};
  const Tag=({c,bg,children,sm})=><span style={{background:bg||T.blueL,color:c||T.blue,border:`1px solid ${(c||T.blue)}22`,padding:sm?"2px 8px":"3px 10px",borderRadius:20,fontSize:sm?10:12,fontWeight:700,whiteSpace:"nowrap"}}>{children}</span>;

  const TABS=[{id:"dashboard",label:"Dashboard"},{id:"sales",label:"Sales"},{id:"menu",label:"Menu"},{id:"suppliers",label:"Suppliers"},{id:"insights",label:"AI Insights"}];

  // ── auth gate ──
  if(session===undefined) return <div style={{minHeight:"100vh",background:T.bg,display:"flex",alignItems:"center",justifyContent:"center",color:T.muted,fontFamily:"sans-serif"}}>Loading...</div>;
  if(!session||!isOwner(session.user?.email)) return <Login T={T}/>;

  return(
    <div style={{minHeight:"100vh",width:"100%",overflowX:"hidden",background:T.bg,color:T.navy,fontFamily:"-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif"}}>

      {/* modal */}
      {modal&&(
        <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.55)",zIndex:1000,display:"flex",alignItems:"center",justifyContent:"center",padding:20}}>
          <div style={{background:T.card,border:`1px solid ${T.border}`,borderRadius:20,padding:28,maxWidth:420,width:"100%"}}>
            <div style={{fontSize:36,marginBottom:12}}>⚠️</div>
            <div style={{fontSize:20,fontWeight:800,marginBottom:8}}>Duplicate Receipt</div>
            <div style={{fontSize:15,color:T.slate,lineHeight:1.7,marginBottom:20}}>This receipt from <strong>{modal.supplier}</strong> on <strong>{modal.date}</strong> has already been saved.</div>
            <div style={{display:"flex",gap:10}}>
              <button onClick={()=>setModal(null)} style={{flex:2,background:T.blue,color:"#fff",border:"none",borderRadius:12,padding:"13px",fontSize:15,fontWeight:700,cursor:"pointer"}}>Discard Receipt</button>
              <button onClick={()=>okScan(modal)} style={{flex:1,background:"transparent",color:T.muted,border:`1px solid ${T.border}`,borderRadius:12,padding:"13px",fontSize:13,cursor:"pointer"}}>Override</button>
            </div>
          </div>
        </div>
      )}

      {toast&&<div style={{position:"fixed",top:16,left:"50%",transform:"translateX(-50%)",zIndex:999,background:toast.err?T.coral:T.teal,color:"#fff",padding:"10px 22px",borderRadius:30,fontSize:14,fontWeight:700,boxShadow:"0 4px 24px rgba(0,0,0,0.2)",whiteSpace:"nowrap"}}>{toast.msg}</div>}

      {/* header */}
      <div style={{background:T.card,borderBottom:`1px solid ${T.border}`,padding:isMobile?"6px 14px":"8px 20px",display:"flex",alignItems:"center",minHeight:isMobile?52:64,gap:8,rowGap:6,flexWrap:"wrap",position:"sticky",top:0,zIndex:100}}>
        <div style={{display:"flex",alignItems:"center",gap:10,flexShrink:0}}>
          <div style={{width:isMobile?38:46,height:isMobile?38:46,borderRadius:"50%",background:"#fff",border:`1px solid ${T.border}`,display:"flex",alignItems:"center",justifyContent:"center",overflow:"hidden",flexShrink:0}}>
            <img src={WCP_LOGO} alt="WCP" style={{width:"100%",height:"100%",objectFit:"contain"}}/>
          </div>
          {!isMobile&&<div>
            <div style={{fontWeight:800,fontSize:16,color:T.blue,lineHeight:1,letterSpacing:"-0.3px"}}>Westcoast Poké</div>
            <div style={{fontSize:10,color:T.muted,textTransform:"uppercase",letterSpacing:"1.5px",fontWeight:600}}>Cost Intelligence</div>
          </div>}
        </div>
        <div style={{display:"flex",gap:isMobile?4:6,alignItems:"center",flex:1,justifyContent:"center"}}>
          {[{id:"all",l:isMobile?"All":"All Locations"},{id:"loc1",l:isMobile?"L1":data.locations.loc1},{id:"loc2",l:isMobile?"L2":data.locations.loc2}].map(l=>(
            <button key={l.id} onClick={()=>setLoc(l.id)} style={{background:loc===l.id?T.blue:"transparent",border:`1.5px solid ${loc===l.id?T.blue:T.border}`,color:loc===l.id?"#fff":T.slate,padding:isMobile?"4px 10px":"5px 14px",borderRadius:24,fontSize:isMobile?11:13,cursor:"pointer",fontWeight:600,whiteSpace:"nowrap"}}>{l.l}</button>
          ))}
        </div>
        <div style={{display:"flex",gap:8,alignItems:"center",flexShrink:0}}>
          <button onClick={()=>{setTab("insights");if(!loadingInsights)generateInsights();}} title={insightsStale?"New data — refresh AI insights":"Refresh AI insights"} style={{position:"relative",background:"none",border:`1px solid ${T.border}`,borderRadius:"50%",width:isMobile?30:34,height:isMobile?30:34,color:insightsStale?T.blue:T.muted,fontSize:isMobile?14:16,cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center",padding:0,fontWeight:700}}>
            ↻
            {insightsStale&&<span style={{position:"absolute",top:-2,right:-2,width:9,height:9,borderRadius:"50%",background:T.coral,border:`2px solid ${T.card}`}}/>}
          </button>
          <button onClick={()=>setTab("scan")} style={{background:T.blue,border:"none",borderRadius:20,padding:isMobile?"6px 12px":"7px 16px",color:"#fff",fontSize:isMobile?12:13,fontWeight:700,cursor:"pointer",whiteSpace:"nowrap"}}>📷 {isMobile?"Scan":"Scan receipt"}</button>
          <button onClick={()=>setDark(v=>!v)} style={{background:"none",border:"none",fontSize:isMobile?18:20,cursor:"pointer",padding:4,lineHeight:1}}>{dark?"☀️":"🌙"}</button>
          <button onClick={signOut} title={session.user?.email} style={{background:"none",border:`1px solid ${T.border}`,borderRadius:20,color:T.muted,padding:isMobile?"5px 10px":"6px 14px",fontSize:isMobile?11:12,fontWeight:700,cursor:"pointer",whiteSpace:"nowrap"}}>Sign out</button>
        </div>
      </div>

      {activeAlerts.length>0&&(
        <div style={{background:T.coralL,borderBottom:`1px solid ${T.coral}33`,padding:isMobile?"9px 14px":"9px 28px",display:"flex",alignItems:"center",gap:10,fontSize:isMobile?12:14}}>
          <span>🔺</span><span style={{color:T.coral,fontWeight:700}}>Price alert:</span>
          <span style={{color:T.slate,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{activeAlerts.map(([i])=>i).join(" · ")}</span>
          <button onClick={()=>setTab("menu")} style={{marginLeft:"auto",background:"none",border:`1px solid ${T.coral}`,borderRadius:20,color:T.coral,padding:"3px 10px",fontSize:12,cursor:"pointer",fontWeight:700,whiteSpace:"nowrap",flexShrink:0}}>Review →</button>
        </div>
      )}

      <div style={{display:"flex",alignItems:"stretch"}}>
        <div style={{width:isMobile?54:64,flexShrink:0,background:T.card,borderRight:`1px solid ${T.border}`,display:"flex",flexDirection:"column",alignItems:"center",gap:4,paddingTop:14,position:"sticky",top:0,alignSelf:"flex-start",height:"100vh",paddingBottom:80}}>
          {TABS.map(t=>(
            <button key={t.id} onClick={()=>setTab(t.id)} title={t.label} aria-label={t.label} style={{position:"relative",width:isMobile?40:46,height:isMobile?40:46,borderRadius:12,background:tab===t.id?T.blueL:"transparent",border:tab===t.id?`1.5px solid ${T.blue}44`:"1.5px solid transparent",color:tab===t.id?T.blue:T.muted,cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center",padding:0,lineHeight:1}}>
              <NavIcon id={t.id} size={isMobile?19:22}/>
              {t.id==="insights"&&insightsStale&&<span style={{position:"absolute",top:5,right:5,width:7,height:7,borderRadius:"50%",background:T.coral}}/>}
            </button>
          ))}
        </div>
        <div style={{flex:1,minWidth:0}}>
      <div style={{padding:isMobile?"16px":"28px 32px",maxWidth:MAXW,margin:"0 auto"}}>
        {tab==="dashboard"&&<Dashboard {...{T,isMobile,isDesktop,card,Tag,latMon,loc,locName,headline,rev,cogs,gp,fcp,revDelta,data,movers,actions,cRev,cCOGS,setSelIng,setTab,bCost,bFCP,bMargin,blendedPrice}}/>}
        {tab==="menu"&&<MenuTab {...{T,isMobile,isDesktop,card,Tag,data,bCost,bFCP,bMargin,blendedPrice,priceFor,say,reload,selIng,setSelIng,checks,chkIng,chkAll,doCheck,doAllChecks,market}}/>}
        {tab==="suppliers"&&<Suppliers {...{T,isMobile,isDesktop,card,Tag,data,selSup,setSelSup,say,reload}}/>}
        {tab==="sales"&&<Sales {...{T,isMobile,isDesktop,card,Tag,data,loc,locKey,cRev,cCOGS,bCost,bCostAtApp,costSzAt,priceFor,blendedPrice,sizeMix,onSaveMix:async(mx)=>{setSizeMix(mx);try{await saveSetting("size_mix",mx);say("Size mix saved");}catch(e){say("Mix save failed",true);}},bFCP,bMargin,months,onSaveSales:async(month,l1,l2,mix)=>{
          const u=JSON.parse(JSON.stringify(data));
          u.sales[month]={loc1:l1,loc2:l2,mix:mix||{}};
          setData(u);
          try{await saveSales(month,l1,l2,mix||{});say(`${month} sales saved`);}
          catch(e){console.error(e);say("Save failed — try again",true);}
        }}}/>}
        {tab==="scan"&&<Scan {...{T,isMobile,card,img,setImg,scanRes,setScanRes,scanning,doScan,okScan,onFile,fileRef,scanLoc,setScanLoc,locations:data.locations}}/>}
        {tab==="insights"&&<Insights {...{T,isMobile,isDesktop,card,Tag,latMon,aiInsights,loadingInsights,generateInsights,insightChat,chatInput,setChatInput,chatLoading,sendChat}}/>}
      </div>
        </div>
      </div>

      <style>{"@keyframes pulse{0%,100%{opacity:1}50%{opacity:0.4}} @keyframes bounce{0%,100%{transform:translateY(0)}50%{transform:translateY(-6px)}} *{box-sizing:border-box} button:active:not(:disabled){transform:scale(0.97)}"}</style>
    </div>
  );
}

// ─── DASHBOARD ───────────────────────────────────────────────────────────────
function Dashboard({T,isMobile,isDesktop,card,Tag,latMon,loc,locName,headline,rev,cogs,gp,fcp,revDelta,data,movers,actions,cRev,cCOGS,setSelIng,setTab,bCost,bFCP,bMargin,blendedPrice}){
  const h=headline;
  return(
    <div>
      <div style={{marginBottom:isMobile?16:24}}>
        <div style={{fontSize:isMobile?10:11,color:T.muted,textTransform:"uppercase",letterSpacing:"1.5px",fontWeight:700,marginBottom:6}}>{latMon} · {locName(loc)}</div>
        <h1 style={{fontSize:isMobile?26:40,fontWeight:900,margin:"0 0 6px",letterSpacing:"-1px",lineHeight:1.1}}>
          {h.pre}<span style={{color:h.color,fontStyle:"italic"}}>{h.em}</span>
        </h1>
        <p style={{fontSize:isMobile?13:15,color:T.slate,margin:0,lineHeight:1.6}}>{h.sub}</p>
        <div style={{display:"flex",alignItems:"center",gap:6,marginTop:8}}>
          <div style={{width:7,height:7,borderRadius:"50%",background:T.teal,animation:"pulse 2s infinite"}}/>
          <span style={{fontSize:12,color:T.muted}}>Live · synced to database</span>
        </div>
      </div>

      <div style={{display:"grid",gridTemplateColumns:isDesktop?"repeat(4,1fr)":"repeat(2,1fr)",gap:isMobile?10:14,marginBottom:isMobile?14:20}}>
        {[
          {lb:"Revenue",v:fmtK2(rev),sub:latMon,delta:revDelta,col:T.blue,bg:T.blueL},
          {lb:"Food COGS",v:fmtK2(cogs),sub:`${fcp.toFixed(1)}% of revenue`,col:fcp>30?T.coral:T.amber,bg:fcp>30?T.coralL:T.amberL},
          {lb:"Gross Profit",v:fmtK2(gp),sub:`${(100-fcp).toFixed(1)}% margin`,col:T.teal,bg:T.tealL},
          {lb:"Ingredients",v:Object.keys(data.ingredients).length,sub:`${Object.keys(data.suppliers).length} suppliers`,col:T.blue,bg:T.blueL},
        ].map((k,i)=>(
          <div key={i} style={{background:k.bg,border:`1px solid ${T.border}`,borderRadius:isMobile?12:16,padding:isMobile?"14px 16px":"18px 22px"}}>
            <div style={{fontSize:10,color:T.inkL,textTransform:"uppercase",letterSpacing:"1px",fontWeight:700,marginBottom:8}}>{k.lb}</div>
            <div style={{fontSize:isMobile?22:30,fontWeight:900,color:k.col,letterSpacing:"-0.5px",lineHeight:1}}>{k.v}</div>
            <div style={{display:"flex",alignItems:"center",gap:6,marginTop:6}}>
              <span style={{fontSize:isMobile?11:12,color:T.inkL}}>{k.sub}</span>
              {k.delta!==undefined&&<span style={{fontSize:11,fontWeight:700,color:k.delta>0?T.teal:T.coral}}>{k.delta>0?"↑":"↓"}{Math.abs(k.delta).toFixed(1)}%</span>}
            </div>
          </div>
        ))}
      </div>

      <div style={{display:"grid",gridTemplateColumns:isDesktop&&loc==="all"?"1fr 1fr":"1fr",gap:isMobile?12:16,marginBottom:isMobile?12:16}}>
        {loc==="all"&&latMon&&(
          <div style={card}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"baseline",marginBottom:4}}>
              <div style={{fontSize:isMobile?15:17,fontWeight:700}}>Location comparison</div>
              <div style={{fontSize:12,color:T.muted}}>{latMon}</div>
            </div>
            <div style={{fontSize:12,color:T.muted,marginBottom:14}}>Food COGS as share of revenue · target 30%</div>
            {["loc1","loc2"].map((l,i)=>{
              const lr=cRev(latMon,l),lc=cCOGS(latMon,l),lp=lr?(lc/lr)*100:0,delta=lp-30;
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

        <div style={card}>
          <div style={{fontSize:isMobile?15:17,fontWeight:700,marginBottom:4}}>Best price today</div>
          <div style={{fontSize:12,color:T.muted,marginBottom:14}}>Cheapest known supplier per ingredient · date shows how fresh the price is</div>
          {Object.keys(data.ingredients).length===0&&(
            <div style={{textAlign:"center",padding:"24px 12px",color:T.muted}}>
              <div style={{fontSize:30,marginBottom:8}}>🧾</div>
              <div style={{fontSize:13,fontWeight:700,color:T.slate,marginBottom:4}}>No prices recorded yet</div>
              <div style={{fontSize:12,lineHeight:1.6}}>Scan your first receipt and the cheapest supplier for every ingredient appears here.</div>
            </div>
          )}
          <div style={{maxHeight:340,overflowY:"auto"}}>
            {Object.entries(data.ingredients).map(([ing,entries],i,arr)=>{
              const bySup={};
              entries.forEach(e=>{bySup[e.supplier]=e;});
              const best=Object.values(bySup).sort((a,b)=>a.price-b.price)[0];
              if(!best)return null;
              const age=Math.floor((Date.now()-new Date(best.date).getTime())/86400000);
              const stale=age>14;
              return(
                <div key={ing} onClick={()=>{setSelIng(ing);setTab("menu");}} style={{display:"flex",alignItems:"center",gap:10,padding:"8px 0",borderBottom:i<arr.length-1?`1px solid ${T.border}`:"none",cursor:"pointer"}}>
                  <div style={{flex:1,minWidth:0}}>
                    <div style={{fontSize:isMobile?13:14,fontWeight:600,whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>{ing}</div>
                    <div style={{fontSize:11,color:T.muted}}>{best.supplier}</div>
                  </div>
                  <div style={{textAlign:"right"}}>
                    <div style={{fontSize:isMobile?13:15,fontWeight:800,color:T.teal}}>${fmt(best.price)}<span style={{fontSize:10,color:T.muted,fontWeight:400}}>/{best.unit}</span></div>
                    <div style={{fontSize:10,color:stale?T.amber:T.muted}}>{stale?`⚠ ${age}d old`:best.date}</div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <div style={card}>
          <div style={{fontSize:isMobile?15:17,fontWeight:700,marginBottom:4}}>What to push</div>
          <div style={{fontSize:12,color:T.muted,marginBottom:14}}>Your most profitable bowls right now, costed from the latest prices you have recorded. Tell the team to recommend the top one — every sale of it earns more than any other bowl.</div>
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
function Ingredients({T,isMobile,isDesktop,card,Tag,data,selIng,setSelIng,checks,chkIng,chkAll,doCheck,doAllChecks,say,reload,market}){
  const [showAdd,setShowAdd]=useState(false);
  const [mIng,setMIng]=useState("");const [mPrice,setMPrice]=useState("");const [mUnit,setMUnit]=useState("lb");const [mSup,setMSup]=useState("");const [mDate,setMDate]=useState(new Date().toISOString().slice(0,10));
  const [mSaving,setMSaving]=useState(false);
  const [thrEdit,setThrEdit]=useState("");
  const [iView,setIView]=useState("list");
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
  return(
    <div>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:18,flexWrap:"wrap",gap:8}}>
        <div style={{fontSize:isMobile?13:14,color:T.slate,lineHeight:1.6,maxWidth:560}}>Every price you have recorded, from receipts and manual entries, with the trend since you started tracking ({Object.keys(data.ingredients).length} ingredients). Tap one for its full history, market outlook, and alerts.</div>
        <div style={{display:"flex",gap:8,flexWrap:"wrap"}}>
          <div style={{display:"flex",gap:2,background:T.card,border:`1px solid ${T.border}`,borderRadius:16,padding:2}}>
            {[["cards","▦"],["list","≡"]].map(([id,ic])=>(
              <button key={id} onClick={()=>setIView(id)} title={id} style={{background:iView===id?T.blue:"transparent",color:iView===id?"#fff":T.slate,border:"none",borderRadius:14,padding:"5px 12px",fontSize:13,fontWeight:700,cursor:"pointer"}}>{ic}</button>
            ))}
          </div>
          <button onClick={()=>setShowAdd(v=>!v)} style={{background:showAdd?"transparent":T.blue,color:showAdd?T.muted:"#fff",border:showAdd?`1px solid ${T.border}`:"none",padding:"8px 16px",borderRadius:20,fontSize:13,cursor:"pointer",fontWeight:700}}>{showAdd?"Cancel":"+ Add price"}</button>
          <button onClick={doAllChecks} disabled={chkAll} style={{background:T.tealL,border:`1px solid ${T.teal}44`,color:T.teal,padding:"8px 16px",borderRadius:20,fontSize:13,cursor:chkAll?"not-allowed":"pointer",fontWeight:700,opacity:chkAll?0.6:1}}>{chkAll?"🔍 Checking...":`🔍 Check prices · ~$${(0.02*Math.max(1,Object.keys(data.ingredients).length)).toFixed(2)} · 1/day`}</button>
        </div>
      </div>

      {showAdd&&(
        <div style={{...card,marginBottom:14,borderColor:T.blue}}>
          <div style={{fontSize:15,fontWeight:700,marginBottom:12}}>Add a price manually</div>
          <div style={{display:"grid",gridTemplateColumns:isMobile?"1fr 1fr":"2fr 1fr 1fr 2fr 1.4fr auto",gap:8,alignItems:"end"}}>
            <div><div style={{fontSize:10,color:T.muted,fontWeight:700,marginBottom:4}}>INGREDIENT</div><input list="ing-list" value={mIng} onChange={e=>setMIng(e.target.value)} placeholder="e.g. Ahi Tuna" style={inp}/><datalist id="ing-list">{Object.keys(data.ingredients).map(i=><option key={i} value={i}/>)}</datalist></div>
            <div><div style={{fontSize:10,color:T.muted,fontWeight:700,marginBottom:4}}>PRICE $</div><input type="number" inputMode="decimal" value={mPrice} onChange={e=>setMPrice(e.target.value)} placeholder="0.00" style={inp}/></div>
            <div><div style={{fontSize:10,color:T.muted,fontWeight:700,marginBottom:4}}>UNIT</div><select value={mUnit} onChange={e=>setMUnit(e.target.value)} style={inp}>{["lb","kg","each","bottle","case","25kg","10kg","L","bag"].map(u=><option key={u}>{u}</option>)}</select></div>
            <div><div style={{fontSize:10,color:T.muted,fontWeight:700,marginBottom:4}}>SUPPLIER</div><input list="sup-list" value={mSup} onChange={e=>setMSup(e.target.value)} placeholder="e.g. Costco" style={inp}/><datalist id="sup-list">{Object.keys(data.suppliers).map(s=><option key={s} value={s}/>)}</datalist></div>
            <div><div style={{fontSize:10,color:T.muted,fontWeight:700,marginBottom:4}}>DATE</div><input type="date" value={mDate} onChange={e=>setMDate(e.target.value)} style={inp}/></div>
            <button onClick={submitManual} disabled={mSaving||!mIng.trim()||!mPrice} style={{background:T.teal,color:"#fff",border:"none",borderRadius:10,padding:"11px 20px",fontSize:14,fontWeight:800,cursor:"pointer",opacity:mSaving||!mIng.trim()||!mPrice?0.6:1,whiteSpace:"nowrap"}}>{mSaving?"Saving...":"Save"}</button>
          </div>
        </div>
      )}

      {Object.keys(data.ingredients).length===0&&(
        <div style={{...card,textAlign:"center",padding:"48px 24px",color:T.muted}}>
          <div style={{fontSize:44,marginBottom:12}}>🥑</div>
          <div style={{fontSize:16,fontWeight:700,color:T.slate,marginBottom:6}}>No ingredients yet</div>
          <div style={{fontSize:14}}>Scan your first receipt or add a price manually to get started.</div>
        </div>
      )}
      {iView==="list"&&(
        <div style={{...card,padding:0,overflow:"hidden"}}>
          {Object.entries(data.ingredients).map(([name,entries],i,arr)=>{
            const lat=gL(entries),ch=gPct(entries),thr=data.alerts[name],ov=thr&&lat>thr;
            return(
              <div key={name} onClick={()=>{setSelIng(name);setIView("cards");}} style={{display:"flex",alignItems:"center",gap:10,padding:"10px 16px",borderBottom:i<arr.length-1?`1px solid ${T.border}`:"none",cursor:"pointer"}}>
                <div style={{flex:1,fontSize:13,fontWeight:600}}>{name}{ov&&<span style={{marginLeft:6,fontSize:11,color:T.coral}}>{"\u26a0"}</span>}</div>
                <div style={{fontSize:12,color:T.muted}}>{entries[entries.length-1]?.supplier}</div>
                <div style={{fontSize:13,fontWeight:700,width:90,textAlign:"right"}}>${fmt(lat)}<span style={{fontSize:10,color:T.muted,fontWeight:400}}>/{entries[0]?.unit}</span></div>
                <div style={{fontSize:12,fontWeight:700,color:ch>0?T.coral:T.teal,width:64,textAlign:"right"}}>{ch>0?"+":""}{ch.toFixed(1)}%</div>
              </div>
            );
          })}
        </div>
      )}
      {iView==="cards"&&(
      <div style={{display:"grid",gridTemplateColumns:isDesktop?"1fr 1fr":"1fr",gap:10}}>
        {Object.entries(data.ingredients).map(([name,entries])=>{
          const lat=gL(entries),ch=gPct(entries),isSel=selIng===name,thr=data.alerts[name],ov=thr&&lat>thr,pc=checks[name];
          return(
            <div key={name} onClick={()=>setSelIng(isSel?null:name)} style={{...card,borderColor:ov?T.coral:isSel?T.blue:T.border,cursor:"pointer",gridColumn:isSel&&isDesktop?"1 / -1":"auto"}}>
              <div style={{display:"flex",alignItems:"center",gap:12}}>
                <div style={{flex:1,minWidth:0}}>
                  <div style={{fontSize:isMobile?14:16,fontWeight:700,display:"flex",alignItems:"center",gap:6,flexWrap:"wrap",marginBottom:3}}>
                    {name}
                    {ov&&<Tag c={T.coral} bg={T.coralL} sm>🔺 Alert</Tag>}
                    {pc?.status==="ok"&&<Tag c={pc.data?.verdict==="good"?T.teal:pc.data?.verdict==="high"?T.amber:T.coral} bg={pc.data?.verdict==="good"?T.tealL:pc.data?.verdict==="high"?T.amberL:T.coralL} sm>{pc.data?.verdict==="good"?"✓ Good":pc.data?.verdict==="high"?"↑ High":"⚠ Very high"}</Tag>}
                  </div>
                  <div style={{fontSize:12,color:T.muted}}>{entries[entries.length-1]?.supplier} · {entries[entries.length-1]?.date}</div>
                </div>
                <div style={{textAlign:"right",marginRight:8}}>
                  <div style={{fontSize:isMobile?18:22,fontWeight:800,letterSpacing:"-0.5px"}}>${fmt(lat)}<span style={{fontSize:11,color:T.muted,fontWeight:400}}>/{entries[0]?.unit}</span></div>
                  <div style={{fontSize:13,fontWeight:700,color:ch>0?T.coral:T.teal}}>{ch>0?"▲":"▼"} {Math.abs(ch).toFixed(1)}%<span style={{fontSize:10,color:T.muted,fontWeight:400}}> · {(()=>{const ms=(new Date(entries[entries.length-1].date)-new Date(entries[0].date))/2592000000;return ms<1?"<1 mo":`${Math.round(ms)} mo`;})()}</span></div>
                </div>
                <Spark data={entries} up={ch>0} T={T} W={isDesktop?90:70} H={32}/>
              </div>

              {isSel&&(
                <div style={{marginTop:16,paddingTop:16,borderTop:`1px solid ${T.border}`}} onClick={e=>e.stopPropagation()}>
                  <PriceChart data={entries} T={T}/>
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
                    <span style={{fontSize:12,color:T.muted,fontWeight:700}}>Price alert above $</span>
                    <input type="number" inputMode="decimal" defaultValue={thr||""} onChange={e=>setThrEdit(e.target.value)} placeholder="none" style={{width:90,background:T.bg,border:`1px solid ${T.border}`,borderRadius:8,padding:"7px 10px",color:T.navy,fontSize:13,outline:"none"}}/>
                    <button onClick={()=>saveThr(name)} style={{background:T.blueL,border:`1px solid ${T.border}`,borderRadius:16,color:T.blue,padding:"6px 14px",fontSize:12,fontWeight:700,cursor:"pointer"}}>Set alert</button>
                    <button onClick={()=>delIng(name)} style={{marginLeft:"auto",background:"none",border:`1px solid ${T.coral}55`,borderRadius:16,color:T.coral,padding:"6px 14px",fontSize:12,fontWeight:700,cursor:"pointer"}}>Delete ingredient</button>
                  </div>
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
                          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",gap:8,flexWrap:"wrap"}}>
                            <div style={{fontSize:11,color:T.muted}}>Checked {pc.at} · {pc.scope==="preferred"?"Preferred suppliers":"Market-wide"} · indicative only</div>
                            
                          </div>
                        </div>
                      );
                    })()}
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
      )}
    </div>
  );
}

// ─── SUPPLIERS ───────────────────────────────────────────────────────────────
function Suppliers({T,isMobile,isDesktop,card,Tag,data,selSup,setSelSup,say,reload}){
  const [editSup,setEditSup]=useState(null);
  const [ef,setEf]=useState({});
  const [showAdd,setShowAdd]=useState(false);
  const [nf,setNf]=useState({name:"",type:"trade",contact:"",phone:"",email:"",terms:"",delivery:"",notes:""});
  const [adding,setAdding]=useState(false);
  const [dCat,setDCat]=useState("Any");
  const [dRad,setDRad]=useState(20);
  const [dLoc,setDLoc]=useState("both");
  const [dBusy,setDBusy]=useState(false);
  const [dResults,setDResults]=useState(null);
  const [refBusy,setRefBusy]=useState(false);
  const [refResults,setRefResults]=useState(null);
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

  const startEdit=(name,sp)=>{setEditSup(name);setEf({type:sp.type||"retail",contact:sp.contact||"",phone:sp.phone||"",email:sp.email||"",terms:sp.terms||"",delivery:sp.delivery||"",notes:sp.notes||"",preferred:!!sp.preferred,address:sp.address||""});};
  const saveEdit=async()=>{try{await upsertSupplier(editSup,ef);await reload();say("Supplier updated");setEditSup(null);}catch(e){say("Save failed",true);}};
  const delSup=async(name)=>{
    if(!window.confirm(`Delete supplier "${name}"?`))return;
    try{await deleteSupplier(name);await reload();setSelSup(null);say(`${name} deleted`);}catch(e){say("Delete failed",true);}
  };
  const addSup=async()=>{
    const name=nf.name.trim();if(!name)return;
    if(data.suppliers[name]){say("That supplier already exists",true);return;}
    setAdding(true);
    try{const {name:_,...fields}=nf;await upsertSupplier(name,fields);await reload();say(`${name} added`);setShowAdd(false);setNf({name:"",type:"trade",contact:"",phone:"",email:"",terms:"",delivery:"",notes:""});}
    catch(e){say("Add failed",true);}
    setAdding(false);
  };
  const discover=async()=>{
    const gate=await canRunToday("discovery");
    if(!gate.allowed){say(`Discovery already used today${gate.last?.by_email?" by "+gate.last.by_email.split("@")[0]:""} — available tomorrow`,true);return;}
    setDBusy(true);setDResults(null);
    await recordRun("discovery","");
    try{
      const r=await fetch("https://api.anthropic.com/v1/messages",{method:"POST",headers:API_HEADERS(),body:JSON.stringify({model:MODEL,max_tokens:1200,tools:[{type:"web_search_20250305",name:"web_search",max_uses:2}],messages:[{role:"user",content:`Find wholesale/trade food suppliers within ${dRad}km of ${dLoc==="loc1"?"West 8th & Cambie, Vancouver BC":dLoc==="loc2"?"Ironwood Plaza, Richmond BC":"a poke restaurant with locations at West 8th & Cambie Vancouver BC and Ironwood Plaza Richmond BC"}. Measure distance from ${dLoc==="both"?"whichever location is nearer":"that location only"}. Category: ${dCat==="Any"?"seafood, produce or dry goods":dCat}. Prioritise wholesalers and distributors over retail. Return ONLY JSON no markdown: {"suppliers":[{"name":"","category":"","distance":"~Xkm from <location>","address":"","notes":"one line: what they offer, trade terms if known"}]}. Max 6 results. If nothing found: {"suppliers":[]}`}]})});
      const out=await r.json();
      const txt=out.content?.find(b=>b.type==="text")?.text||"";
      const parsed=JSON.parse(txt.replace(/```json|```/g,"").trim());
      setDResults(parsed.suppliers||[]);
      if(!(parsed.suppliers||[]).length)say("No suppliers found — try a wider radius",true);
    }catch(e){say("Search failed — try again",true);}
    setDBusy(false);
  };
  const addPreferred=async(r)=>{
    try{
      await upsertSupplier(r.name,{type:"trade",preferred:true,address:r.address||"",notes:`${r.category||""} · ${r.distance||""} · ${r.notes||""}`.trim()});
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
    if(!gate.allowed){say(`Preferred refresh already used today${gate.last?.by_email?" by "+gate.last.by_email.split("@")[0]:""} — available tomorrow`,true);return;}
    setRefBusy(true);setRefResults(null);
    await recordRun("preferred_refresh","");
    const ingList=Object.entries(data.ingredients).map(([n,e])=>`${n} (per ${e[0]?.unit||"unit"})`).join(", ");
    const results={};
    for(const supName of prefs){
      try{
        const r=await fetch("https://api.anthropic.com/v1/messages",{method:"POST",headers:API_HEADERS(),body:JSON.stringify({model:MODEL,max_tokens:900,tools:[{type:"web_search_20250305",name:"web_search",max_uses:2}],messages:[{role:"user",content:`Search current prices at "${supName}" in Vancouver BC area for these restaurant ingredients: ${ingList}. Return ONLY JSON no markdown: {"found":[{"ingredient":"","price":0.00,"unit":"","notes":"brief"}]}. Only include items with a genuine price signal. If none: {"found":[]}`}]})});
        const out=await r.json();
        const txt=out.content?.find(b=>b.type==="text")?.text||"";
        const parsed=JSON.parse(txt.replace(/```json|```/g,"").trim());
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
          <div style={{display:"grid",gridTemplateColumns:isMobile?"1fr 1fr":"repeat(4,1fr)",gap:8,marginBottom:10}}>
            <div><div style={{fontSize:10,color:T.muted,fontWeight:700,marginBottom:3}}>NAME *</div><input value={nf.name} onChange={e=>setNf(p=>({...p,name:e.target.value}))} style={inp}/></div>
            <div><div style={{fontSize:10,color:T.muted,fontWeight:700,marginBottom:3}}>TYPE</div><select value={nf.type} onChange={e=>setNf(p=>({...p,type:e.target.value}))} style={inp}><option value="trade">Trade account</option><option value="retail">Retail (cash)</option></select></div>
            <div><div style={{fontSize:10,color:T.muted,fontWeight:700,marginBottom:3}}>TERMS</div><input value={nf.terms} onChange={e=>setNf(p=>({...p,terms:e.target.value}))} placeholder="e.g. Net 14" style={inp}/></div>
            <div><div style={{fontSize:10,color:T.muted,fontWeight:700,marginBottom:3}}>DELIVERY</div><input value={nf.delivery} onChange={e=>setNf(p=>({...p,delivery:e.target.value}))} placeholder="e.g. Mon/Wed" style={inp}/></div>
            <div><div style={{fontSize:10,color:T.muted,fontWeight:700,marginBottom:3}}>CONTACT</div><input value={nf.contact} onChange={e=>setNf(p=>({...p,contact:e.target.value}))} style={inp}/></div>
            <div><div style={{fontSize:10,color:T.muted,fontWeight:700,marginBottom:3}}>PHONE</div><input value={nf.phone} onChange={e=>setNf(p=>({...p,phone:e.target.value}))} style={inp}/></div>
            <div><div style={{fontSize:10,color:T.muted,fontWeight:700,marginBottom:3}}>EMAIL</div><input value={nf.email} onChange={e=>setNf(p=>({...p,email:e.target.value}))} style={inp}/></div>
            <div><div style={{fontSize:10,color:T.muted,fontWeight:700,marginBottom:3}}>NOTES</div><input value={nf.notes} onChange={e=>setNf(p=>({...p,notes:e.target.value}))} style={inp}/></div>
          </div>
          <button onClick={addSup} disabled={adding||!nf.name.trim()} style={{background:T.teal,color:"#fff",border:"none",borderRadius:10,padding:"10px 24px",fontSize:14,fontWeight:800,cursor:"pointer",opacity:adding||!nf.name.trim()?0.6:1}}>{adding?"Adding...":"Add supplier"}</button>
        </div>
      )}

      <div style={{...card,marginBottom:14}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",gap:10,flexWrap:"wrap",marginBottom:dResults?12:0}}>
          <div style={{fontSize:14,fontWeight:700}}>Find new suppliers</div>
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
            <button onClick={discover} disabled={dBusy} style={{background:T.blue,color:"#fff",border:"none",borderRadius:16,padding:"7px 16px",fontSize:12,fontWeight:700,cursor:"pointer",opacity:dBusy?0.6:1}}>{dBusy?"Searching...":"\ud83d\udd0d Search · ~$0.02 · 1/day"}</button>
          </div>
        </div>
        {dResults&&dResults.length>0&&(
          <div style={{borderTop:`1px solid ${T.border}`,paddingTop:8}}>
            {dResults.map((r,i)=>(
              <div key={i} style={{display:"flex",justifyContent:"space-between",alignItems:"center",gap:10,padding:"9px 0",borderBottom:i<dResults.length-1?`1px solid ${T.border}`:"none"}}>
                <div style={{flex:1,minWidth:0}}>
                  <div style={{fontSize:13,fontWeight:700}}>{r.name}</div>
                  <div style={{fontSize:11,color:T.muted}}>{[r.category,r.distance,r.notes].filter(Boolean).join(" \u00b7 ")}</div>
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
          <button onClick={refreshPreferred} disabled={refBusy} style={{background:T.blueL,border:`1px solid ${T.border}`,borderRadius:16,color:T.blue,padding:"7px 16px",fontSize:12,fontWeight:700,cursor:"pointer",opacity:refBusy?0.6:1}}>{refBusy?"Refreshing...":`\u21bb Refresh prices · ~$${(0.03*Math.max(1,Object.values(data.suppliers).filter(sp=>sp.preferred).length)).toFixed(2)} · 1/day`}</button>
        </div>
        <div style={{fontSize:11,color:T.muted,marginTop:6}}>Star suppliers in the table below. Refresh runs one live search per preferred supplier \u2014 results are advisory only and never write into your price history.</div>
        {refResults&&(
          <div style={{marginTop:12,borderTop:`1px solid ${T.border}`,paddingTop:10}}>
            {Object.entries(refResults).map(([supName,res])=>(
              <div key={supName} style={{marginBottom:10}}>
                <div style={{fontSize:13,fontWeight:700,marginBottom:4}}>{supName} <span style={{fontSize:10,color:T.muted,fontWeight:400}}>checked {res.at||"now"}</span></div>
                {res.err&&<div style={{fontSize:12,color:T.coral}}>Search failed for this supplier.</div>}
                {!res.err&&!res.found.length&&<div style={{fontSize:12,color:T.muted}}>No reliable price signals found online.</div>}
                {res.found.length>0&&(
                  <div style={{display:"flex",flexWrap:"wrap",gap:6}}>
                    {res.found.map((f,fi)=>{
                      const cur=data.ingredients[f.ingredient]?gL(data.ingredients[f.ingredient]):null;
                      const cheaper=cur!=null&&f.price<cur;
                      return <Tag key={fi} c={cheaper?T.teal:T.slate} bg={cheaper?T.tealL:T.bg} sm>{f.ingredient} ${Number(f.price).toFixed(2)}/{f.unit}{cheaper?` (you pay $${cur.toFixed(2)})`:""}</Tag>;
                    })}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
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
                  {name}
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
                        {[["contact","Contact"],["phone","Phone"],["email","Email"],["terms","Terms"],["delivery","Delivery days"]].map(([k,lb])=>(
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
function Sales({T,isMobile,isDesktop,card,Tag,data,loc,locKey,cRev,cCOGS,bCost,bCostAtApp,costSzAt,priceFor,blendedPrice,sizeMix,onSaveMix,bFCP,bMargin,months,onSaveSales}){
  const [showForm,setShowForm]=useState(false);
  const [fMonth,setFMonth]=useState("");
  const [fL1,setFL1]=useState("");
  const [fL2,setFL2]=useState("");
  const [fMix,setFMix]=useState({});
  const [saving,setSaving]=useState(false);
  const [period,setPeriod]=useState("month");
  const [off,setOff]=useState(0);
  const [mcaSz,setMcaSz]=useState("agg");
  const [mixDraft,setMixDraft]=useState(null);
  const monthOptions=(()=>{
    const opts=[];const now=new Date(2026,6);
    for(let i=0;i<12;i++){const d=new Date(now.getFullYear(),now.getMonth()-i);opts.push(`${["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"][d.getMonth()]} ${d.getFullYear()}`);}
    return opts;
  })();
  const bowls=Object.entries(data.menu).filter(([,m])=>!m.category||m.category==="classic"||m.category==="byo").map(([n])=>n);
  const mixComplete=bowls.every(b=>fMix[b]?.l1!==undefined&&fMix[b]?.l1!==""&&fMix[b]?.l2!==undefined&&fMix[b]?.l2!=="");
  const submit=async()=>{
    if(!fMonth||(!fL1&&!fL2)||!mixComplete)return;
    setSaving(true);
    const existing=data.sales[fMonth]||{};
    const l1=fL1!==""?(parseFloat(fL1)||0):(existing.loc1||0);
    const l2=fL2!==""?(parseFloat(fL2)||0):(existing.loc2||0);
    const mix={};
    bowls.forEach(b=>{mix[b]={loc1:parseInt(fMix[b]?.l1)||0,loc2:parseInt(fMix[b]?.l2)||0};});
    await onSaveSales(fMonth,l1,l2,mix);
    setSaving(false);setShowForm(false);setFMonth("");setFL1("");setFL2("");setFMix({});
  };
  const pickMonth=(m)=>{
    setFMonth(m);
    const ex=data.sales[m];
    if(ex?.mix){const pre={};Object.entries(ex.mix).forEach(([b,v])=>{pre[b]={l1:String(v.loc1||0),l2:String(v.loc2||0)};});setFMix(pre);}
    else setFMix({});
  };
  const inp={width:"100%",background:T.bg,border:`1px solid ${T.border}`,borderRadius:10,padding:"11px 14px",color:T.navy,fontSize:15,fontFamily:"inherit",outline:"none"};
  return(
    <div>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:20,flexWrap:"wrap",gap:10}}>
        <h2 style={{margin:0,fontSize:isMobile?20:26,fontWeight:800,letterSpacing:"-0.5px"}}>Sales</h2>
        <button onClick={()=>setShowForm(v=>!v)} style={{background:showForm?"transparent":T.blue,color:showForm?T.muted:"#fff",border:showForm?`1px solid ${T.border}`:"none",borderRadius:20,padding:"9px 18px",fontSize:13,fontWeight:700,cursor:"pointer"}}>{showForm?"Cancel":"+ Enter monthly sales"}</button>
      </div>

      {showForm&&(
        <div style={{...card,marginBottom:16,borderColor:T.blue}}>
          <div style={{fontSize:isMobile?15:17,fontWeight:700,marginBottom:14}}>Enter monthly revenue</div>
          <div style={{display:"grid",gridTemplateColumns:isMobile?"1fr":"1fr 1fr 1fr auto",gap:10,alignItems:"end"}}>
            <div>
              <div style={{fontSize:11,color:T.muted,fontWeight:700,marginBottom:5}}>MONTH</div>
              <select value={fMonth} onChange={e=>pickMonth(e.target.value)} style={inp}>
                <option value="">Select month...</option>
                {monthOptions.map(m=><option key={m} value={m}>{m}{data.sales[m]?" (update)":""}</option>)}
              </select>
            </div>
            <div>
              <div style={{fontSize:11,color:T.muted,fontWeight:700,marginBottom:5}}>{data.locations.loc1.toUpperCase()} $</div>
              <input type="number" inputMode="decimal" placeholder="0.00" value={fL1} onChange={e=>setFL1(e.target.value)} style={inp}/>
            </div>
            <div>
              <div style={{fontSize:11,color:T.muted,fontWeight:700,marginBottom:5}}>{data.locations.loc2.toUpperCase()} $</div>
              <input type="number" inputMode="decimal" placeholder="0.00" value={fL2} onChange={e=>setFL2(e.target.value)} style={inp}/>
            </div>
            <button onClick={submit} disabled={saving||!fMonth||(!fL1&&!fL2)||!mixComplete} style={{background:T.teal,color:"#fff",border:"none",borderRadius:10,padding:"12px 22px",fontSize:14,fontWeight:800,cursor:saving?"not-allowed":"pointer",opacity:saving||!fMonth||(!fL1&&!fL2)||!mixComplete?0.6:1,whiteSpace:"nowrap"}}>{saving?"Saving...":"Save"}</button>
          </div>
          {fMonth&&(
            <div style={{marginTop:14,paddingTop:14,borderTop:`1px solid ${T.border}`}}>
              <div style={{fontSize:12,fontWeight:800,color:T.navy,marginBottom:4}}>Bowls sold · required</div>
              <div style={{fontSize:11,color:T.muted,marginBottom:10}}>From your POS monthly product report · enter 0 if none sold. Revenue and bowl counts are independent (drinks and extras mean they will not reconcile exactly).</div>
              <div style={{display:"grid",gridTemplateColumns:isMobile?"1fr":"1fr 1fr",gap:"6px 24px"}}>
                {bowls.map(b=>(
                  <div key={b} style={{display:"flex",alignItems:"center",gap:8}}>
                    <div style={{flex:1,fontSize:13,fontWeight:600}}>{b}</div>
                    <input type="number" inputMode="numeric" min="0" placeholder="L1" value={fMix[b]?.l1??""} onChange={e=>setFMix(p=>({...p,[b]:{...p[b],l1:e.target.value}}))} style={{...inp,width:70,textAlign:"right"}}/>
                    <input type="number" inputMode="numeric" min="0" placeholder="L2" value={fMix[b]?.l2??""} onChange={e=>setFMix(p=>({...p,[b]:{...p[b],l2:e.target.value}}))} style={{...inp,width:70,textAlign:"right"}}/>
                  </div>
                ))}
              </div>
              {!mixComplete&&<div style={{marginTop:8,fontSize:11,color:T.amber,fontWeight:600}}>Fill every bowl count (use 0) to enable Save</div>}
            </div>
          )}
          {fMonth&&data.sales[fMonth]&&<div style={{marginTop:10,fontSize:12,color:T.amber,fontWeight:600}}>⚠ {fMonth} already has figures (${(data.sales[fMonth].loc1||0).toLocaleString()} / ${(data.sales[fMonth].loc2||0).toLocaleString()}) — saving will overwrite them.</div>}
        </div>
      )}
      {(()=>{
        const MN=["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
        const now=new Date();
        const periodMonths=()=>{
          if(period==="month"){const d=new Date(now.getFullYear(),now.getMonth()-off);return[[`${MN[d.getMonth()]} ${d.getFullYear()}`]].flat();}
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
        const c=pm.reduce((s,m)=>s+cCOGS(m,locKey),0);
        const g=r-c,p=r?(c/r)*100:0;
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
                  const blob=new Blob([csv],{type:"text/csv"});
                  const a=document.createElement("a");
                  a.href=URL.createObjectURL(blob);
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
                  {[["Revenue",r,T.blue,T.blueL],["COGS",c,p>30?T.coral:T.amber,p>30?T.coralL:T.amberL],["Gross Profit",g,T.teal,T.tealL]].map(([l,v,col,bg])=>(
                    <div key={l} style={{background:bg,borderRadius:10,padding:isMobile?"10px 12px":"14px 18px",border:`1px solid ${T.border}`}}>
                      <div style={{fontSize:10,color:T.inkL,fontWeight:700,textTransform:"uppercase",letterSpacing:"0.8px",marginBottom:5}}>{l}</div>
                      <div style={{fontSize:isMobile?18:24,fontWeight:900,color:col,letterSpacing:"-0.5px"}}>${fmt(v)}</div>
                    </div>
                  ))}
                </div>
                {(()=>{
                  const bowlRev=pm.reduce((s,m)=>{
                    const mx=data.sales[m]?.mix||{};
                    return s+Object.entries(mx).reduce((t,[b,v])=>{
                      const units=locKey==="loc1"?(v.loc1||0):locKey==="loc2"?(v.loc2||0):((v.loc1||0)+(v.loc2||0));
                      return t+units*blendedPrice(b);
                    },0);
                  },0);
                  const other=r-bowlRev;
                  if(!r||bowlRev<=0)return null;
                  return(
                    <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"10px 4px 0",fontSize:isMobile?12:13}}>
                      <span style={{color:T.muted}}>Bowls ≈ ${fmt(bowlRev)} (est. from counts × blended prices) · <strong style={{color:T.slate}}>Other revenue ≈ ${fmt(Math.max(0,other))}</strong> (drinks, sides, extras)</span>
                    </div>
                  );
                })()}
                {loc==="all"&&(
                  <div style={{borderTop:`1px solid ${T.border}`,paddingTop:14,marginTop:10}}>
                    {["loc1","loc2"].map((l,i)=>{
                      const lr=pm.reduce((s,m)=>s+cRev(m,l),0),lc=pm.reduce((s,m)=>s+cCOGS(m,l),0),lp=lr?(lc/lr)*100:0;
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
                      const mr=cRev(m,locKey),mc=cCOGS(m,locKey),mp=mr?(mc/mr)*100:0;
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
      <div style={{...card,marginBottom:16}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",gap:10,flexWrap:"wrap"}}>
          <div>
            <div style={{fontSize:14,fontWeight:700}}>Size mix</div>
            <div style={{fontSize:11,color:T.muted}}>Share of bowls sold per size · set once from your POS report · powers all blended pricing and costs</div>
          </div>
          <div style={{display:"flex",gap:8,alignItems:"center",flexWrap:"wrap"}}>
            {["small","medium","large"].map(sz=>(
              <div key={sz} style={{display:"flex",alignItems:"center",gap:4}}>
                <span style={{fontSize:11,color:T.muted,fontWeight:700}}>{sz==="small"?"S":sz==="medium"?"M":"L"}</span>
                <input type="number" inputMode="numeric" min="0" max="100" value={(mixDraft||sizeMix)[sz]} onChange={e=>setMixDraft(p=>({...(p||sizeMix),[sz]:parseInt(e.target.value)||0}))} style={{width:56,background:T.bg,border:`1px solid ${T.border}`,borderRadius:8,padding:"7px 8px",color:T.navy,fontSize:13,textAlign:"right",outline:"none"}}/>
                <span style={{fontSize:11,color:T.muted}}>%</span>
              </div>
            ))}
            {mixDraft&&<button onClick={()=>{onSaveMix(mixDraft);setMixDraft(null);}} style={{background:T.teal,color:"#fff",border:"none",borderRadius:14,padding:"7px 16px",fontSize:12,fontWeight:700,cursor:"pointer"}}>Save mix</button>}
          </div>
        </div>
        {(()=>{const d=mixDraft||sizeMix;const t=(d.small||0)+(d.medium||0)+(d.large||0);return t!==100?<div style={{marginTop:6,fontSize:11,color:T.amber,fontWeight:600}}>Adds to {t}% — weights are normalised automatically, but 100% keeps it honest.</div>:null;})()}
      </div>

      {(()=>{
        const MNx=["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
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
        const unitsFor=(b,ms)=>ms.reduce((sum,m)=>{
          const mx=data.sales[m]?.mix?.[b];if(!mx)return sum;
          return sum+(locKey==="loc1"?(mx.loc1||0):locKey==="loc2"?(mx.loc2||0):((mx.loc1||0)+(mx.loc2||0)));
        },0);
        const cogsSales=[
          {label:"Sales",color:T.blue,points:keys.map(k=>({label:k,y:groups[k].reduce((sum,m)=>sum+cRev(m,locKey),0)}))},
          {label:"COGS",color:T.coral,points:keys.map(k=>({label:k,y:groups[k].reduce((sum,m)=>sum+cCOGS(m,locKey),0)}))},
        ];
        const bowlCols=[T.blue,T.teal,T.coral,T.amber,"#8B5CF6","#EC4899","#6366F1","#10B981"];
        const bowlSeries=Object.entries(data.menu).filter(([,m])=>!m.category||m.category==="classic"||m.category==="byo").map(([b])=>b).map((b,i)=>({label:b,color:bowlCols[i%bowlCols.length],points:keys.map(k=>({label:k,y:unitsFor(b,groups[k])}))}));
        const top3=Object.entries(data.menu).filter(([,m])=>!m.category||m.category==="classic"||m.category==="byo").map(([b])=>b).map(b=>({b,u:unitsFor(b,entered)})).sort((a,x)=>x.u-a.u).slice(0,3);
        const profitSeries=top3.map((t,i)=>({label:`${t.b} profit`,color:bowlCols[i],points:keys.map(k=>({label:k,y:unitsFor(t.b,groups[k])*(blendedPrice(t.b)-bCost(t.b))}))}));
        return(
          <>
            <div style={{...card,marginBottom:16}}>
              <h3 style={{margin:"0 0 4px",fontSize:isMobile?15:18,fontWeight:800}}>COGS vs Sales trend</h3>
              <div style={{fontSize:12,color:T.muted,marginBottom:12}}>Grouped by {period} · {locKey==="all"?"both locations":data.locations[locKey]}</div>
              <MultiLine series={cogsSales} T={T}/>
            </div>
            <div style={{...card,marginBottom:16}}>
              <h3 style={{margin:"0 0 4px",fontSize:isMobile?15:18,fontWeight:800}}>Units sold per bowl</h3>
              <div style={{fontSize:12,color:T.muted,marginBottom:12}}>What sells best · needs bowl counts entered with monthly sales</div>
              <MultiLine series={bowlSeries} T={T} money={false}/>
            </div>
            <div style={{...card,marginBottom:16}}>
              <h3 style={{margin:"0 0 4px",fontSize:isMobile?15:18,fontWeight:800}}>Top 3 sellers · net profit</h3>
              <div style={{fontSize:12,color:T.muted,marginBottom:12}}>Best sellers ranked by what they actually earn · profit uses current recipe costs</div>
              <MultiLine series={profitSeries} T={T}/>
            </div>
          </>
        );
      })()}

      <div style={card}>
        {(()=>{window.__salesPeriodMonth=(()=>{
          const MNz=["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
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
          {Object.entries(data.menu).filter(([,md])=>!md.category||md.category==="classic"||md.category==="byo").map(([item,md])=>{
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
    </div>
  );
}

// ─── SCAN ────────────────────────────────────────────────────────────────────
function Scan({T,isMobile,card,img,setImg,scanRes,setScanRes,scanning,doScan,okScan,onFile,fileRef,scanLoc,setScanLoc,locations}){
  return(
    <div style={{maxWidth:580,margin:"0 auto"}}>
      <h2 style={{margin:"0 0 6px",fontSize:isMobile?20:26,fontWeight:800,letterSpacing:"-0.5px"}}>Scan Receipt or Invoice</h2>
      <p style={{margin:"0 0 16px",fontSize:isMobile?13:15,color:T.muted,lineHeight:1.6}}>AI extracts ingredients, prices, and supplier automatically. Duplicates are blocked. The photo is discarded after extraction — only the data is saved.</p>
      <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:20,flexWrap:"wrap"}}>
        <span style={{fontSize:12,color:T.muted,fontWeight:700}}>Delivery for:</span>
        {[{id:"all",l:"Shared"},{id:"loc1",l:locations.loc1},{id:"loc2",l:locations.loc2}].map(l=>(
          <button key={l.id} onClick={()=>setScanLoc(l.id)} style={{background:scanLoc===l.id?T.blue:"transparent",border:`1.5px solid ${scanLoc===l.id?T.blue:T.border}`,color:scanLoc===l.id?"#fff":T.slate,padding:"5px 12px",borderRadius:18,fontSize:12,cursor:"pointer",fontWeight:600}}>{l.l}</button>
        ))}
      </div>
      {!img?(
        <div onClick={()=>fileRef.current?.click()} style={{border:`2px dashed ${T.border}`,borderRadius:20,padding:isMobile?"52px 24px":"72px 40px",textAlign:"center",cursor:"pointer",background:T.card}}>
          <div style={{fontSize:isMobile?52:72,marginBottom:16}}>📸</div>
          <div style={{fontSize:isMobile?16:20,fontWeight:700,color:T.slate,marginBottom:6}}>Tap to upload receipt or invoice</div>
          <div style={{fontSize:isMobile?13:14,color:T.muted}}>Photo (JPG/PNG) or PDF · Paper receipts and emailed invoices</div>
          <input ref={fileRef} type="file" accept="image/*,application/pdf,.pdf" onChange={onFile} style={{display:"none"}}/>
        </div>
      ):(
        <div>
          <div style={{display:"flex",gap:16,marginBottom:16,background:T.card,border:`1px solid ${T.border}`,borderRadius:16,padding:16}}>
            {img.prev
              ?<img src={img.prev} alt="Receipt" style={{width:isMobile?90:120,borderRadius:12,border:`1px solid ${T.border}`,objectFit:"cover",flexShrink:0}}/>
              :<div style={{width:isMobile?90:120,height:isMobile?110:140,borderRadius:12,border:`1px solid ${T.border}`,background:T.bg,display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",flexShrink:0,gap:8}}><span style={{fontSize:40}}>📄</span><span style={{fontSize:11,color:T.muted,fontWeight:700}}>PDF</span></div>}
            <div style={{flex:1}}>
              <div style={{fontSize:12,color:T.muted,marginBottom:10}}>{img.name}</div>
              <button onClick={doScan} disabled={scanning} style={{width:"100%",background:T.blue,color:"#fff",border:"none",borderRadius:12,padding:isMobile?"13px":"15px",fontSize:isMobile?15:17,cursor:scanning?"not-allowed":"pointer",fontWeight:800,marginBottom:8,opacity:scanning?0.7:1}}>{scanning?"🔍 Analysing receipt...":"Extract Prices with AI · ~$0.02"}</button>
              <button onClick={()=>{setImg(null);setScanRes(null);}} style={{width:"100%",background:"transparent",border:`1px solid ${T.border}`,borderRadius:12,color:T.muted,padding:isMobile?"10px":"12px",fontSize:13,cursor:"pointer"}}>Use different photo</button>
            </div>
          </div>
          {scanning&&<div style={{background:T.blueL,borderRadius:14,padding:18,textAlign:"center",color:T.blue,fontSize:isMobile?14:16,fontWeight:700}}>🔍 Reading receipt and checking for duplicates...</div>}
          {scanRes&&!scanning&&(
            <div style={card}>
              <div style={{fontSize:isMobile?16:18,fontWeight:800,marginBottom:4}}>{scanRes.items?.length} items found</div>
              <div style={{fontSize:13,color:T.muted,marginBottom:14}}>{scanRes.supplier} · {scanRes.date}</div>
              {scanRes.items?.map((it,i)=>(
                <div key={i} style={{display:"flex",justifyContent:"space-between",padding:"9px 0",borderBottom:`1px solid ${T.border}`,fontSize:isMobile?13:15}}>
                  <span style={{fontWeight:600}}>{it.ingredient}</span>
                  <span style={{color:T.blue,fontWeight:700}}>${fmt(it.price)}/{it.unit}</span>
                </div>
              ))}
              <div style={{display:"flex",gap:10,marginTop:16}}>
                <button onClick={()=>okScan()} style={{flex:2,background:T.teal,color:"#fff",border:"none",borderRadius:12,padding:isMobile?"13px":"15px",fontSize:isMobile?14:16,cursor:"pointer",fontWeight:800}}>Save to Tracker</button>
                <button onClick={()=>setScanRes(null)} style={{flex:1,background:"transparent",border:`1px solid ${T.border}`,borderRadius:12,color:T.muted,padding:isMobile?"13px":"15px",fontSize:13,cursor:"pointer"}}>Discard</button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── INSIGHTS ────────────────────────────────────────────────────────────────
function Insights({T,isMobile,isDesktop,card,Tag,latMon,aiInsights,loadingInsights,generateInsights,insightChat,chatInput,setChatInput,chatLoading,sendChat}){
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
          <div style={{background:T.navy,borderRadius:16,padding:isMobile?"18px 20px":"24px 28px",marginBottom:16}}>
            <div style={{fontSize:10,color:"rgba(255,255,255,0.5)",textTransform:"uppercase",letterSpacing:"1.5px",fontWeight:700,marginBottom:8}}>✦ Generated {new Date().toLocaleDateString("en-CA",{day:"numeric",month:"short",year:"numeric"})} · based on {latMon} data</div>
            <div style={{fontSize:isMobile?18:24,fontWeight:800,color:T.bg,lineHeight:1.3}}>{aiInsights.headline}</div>
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
function MenuTab({T,isMobile,isDesktop,card,Tag,data,bCost,bFCP,bMargin,blendedPrice,priceFor,say,reload,selIng,setSelIng,checks,chkIng,chkAll,doCheck,doAllChecks,market}){
  const [sub,setSub]=useState(selIng?"ingredients":"recipes");
  const [histMonth,setHistMonth]=useState("live");
  const [sel,setSel]=useState(null);
  const [draft,setDraft]=useState(null); // {sizes:{small,medium,large}, ing:{small:{},medium:{},large:{}}}
  const [edSz,setEdSz]=useState("medium");
  const [addSel,setAddSel]=useState("");
  const [newBowl,setNewBowl]=useState("");
  const [saving,setSaving]=useState(false);
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
      {sub==="ingredients"&&<Ingredients {...{T,isMobile,isDesktop,card,Tag,data,selIng,setSelIng,checks,chkIng,chkAll,doCheck,doAllChecks,say,reload,market}}/>}
      {sub==="recipes"&&(<div>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:12,flexWrap:"wrap",gap:8}}>
        <div style={{fontSize:isMobile?13:14,color:T.slate,lineHeight:1.6,maxWidth:640}}>Your bowls with real per-size portions — tap a bowl, pick S / M / L, and enter what the kitchen actually uses for that size. Margins per size recalculate live. Costs update the moment a receipt lands.</div>
        <div style={{display:"flex",gap:8}}>
          <input value={newBowl} onChange={e=>setNewBowl(e.target.value)} onKeyDown={e=>e.key==="Enter"&&createBowl()} placeholder="New bowl name..." style={{...inp,width:150}}/>
          <button onClick={createBowl} disabled={!newBowl.trim()} style={{background:T.blue,color:"#fff",border:"none",borderRadius:20,padding:"8px 16px",fontSize:13,fontWeight:700,cursor:"pointer",opacity:newBowl.trim()?1:0.5,whiteSpace:"nowrap"}}>+ Add bowl</button>
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
        <div style={{display:"grid",gridTemplateColumns:isDesktop?"1fr 1fr":"1fr",gap:10}}>
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
                      <div style={{flex:1,fontSize:14,fontWeight:600}}>{ing}</div>
                      <input type="number" inputMode="decimal" step="0.01" value={qty} onChange={e=>setDraft(p=>{const v=e.target.value;if(m.category==="side"||m.category==="drink"){return{...p,ing:{small:{...p.ing.small,[ing]:v},medium:{...p.ing.medium,[ing]:v},large:{...p.ing.large,[ing]:v}}};}return{...p,ing:{...p.ing,[edSz]:{...p.ing[edSz],[ing]:v}}};})} style={{...inp,width:80,textAlign:"right"}}/>
                      <div style={{fontSize:12,color:T.muted,width:44}}>{baseU(data.ingredients[ing]?.[0]?.unit)}</div>
                      <div style={{fontSize:13,fontWeight:600,color:T.slate,width:64,textAlign:"right"}}>${fmt(gIL(ing)*(parseFloat(qty)||0))}</div>
                      <button onClick={()=>removeIng(ing)} title="Remove from all sizes" style={{background:"none",border:"none",color:T.coral,fontSize:16,cursor:"pointer",padding:"2px 6px"}}>×</button>
                    </div>
                  ))}
                  {Object.keys(draft.ing[edSz]).length===0&&<div style={{padding:"14px 0",fontSize:13,color:T.muted}}>No ingredients on the {SZL[edSz]} yet — add below (new ingredients are pre-filled on all three sizes as estimates; correct each size to what the kitchen actually uses).</div>}

                  <div style={{display:"flex",gap:8,marginTop:12,flexWrap:"wrap"}}>
                    <select value={addSel} onChange={e=>addIng(e.target.value)} style={{...inp,flex:1,minWidth:150}}>
                      <option value="">Add ingredient (all sizes)...</option>
                      {Object.keys(data.ingredients).filter(i=>!(i in draft.ing.medium)).map(i=><option key={i} value={i}>{i}</option>)}
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
