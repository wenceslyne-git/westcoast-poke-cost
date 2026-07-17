import { useState, useRef, useEffect } from "react";
import { LIGHT, DARK, DATA, gL, gPct, fmt, fmtK, useBreakpoint, Spark, PriceChart, WCP_LOGO } from "./data.jsx";
import { supabase, isOwner } from "./supabase.js";
import { loadAll, seedIfEmpty, saveReceipt, saveSales } from "./db.js";
import Login from "./Login.jsx";

const API_HEADERS = () => ({
  "Content-Type":"application/json",
  "x-api-key":import.meta.env.VITE_ANTHROPIC_KEY,
  "anthropic-version":"2023-06-01",
  "anthropic-dangerous-direct-browser-access":"true",
});
const MODEL="claude-sonnet-4-6";

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
  const [aiInsights,setAiInsights]=useState(null);
  const [loadingInsights,setLoadingInsights]=useState(false);
  const [insightChat,setInsightChat]=useState([]);
  const [chatInput,setChatInput]=useState("");
  const [chatLoading,setChatLoading]=useState(false);
  const fileRef=useRef(null);

  const say=(msg,err)=>{setToast({msg,err});setTimeout(()=>setToast(null),4000);};

  // ── computed ──
  const gIL=n=>{const e=data.ingredients[n];return e&&e.length?gL(e):0;};
  const bCost=item=>{const m=data.menu[item];if(!m)return 0;return Object.entries(m.ing).reduce((s,[i,q])=>s+gIL(i)*q,0);};
  const bFCP=item=>{const m=data.menu[item];if(!m)return 0;return(bCost(item)/m.price)*100;};
  const bMargin=item=>{const m=data.menu[item];if(!m)return 0;return((m.price-bCost(item))/m.price)*100;};

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
    biggestMover&&biggestMover.ch>10?{icon:"🔺",title:`Renegotiate ${biggestMover.n}`,body:`Up ${biggestMover.ch.toFixed(1)}% since tracking began. Check the market to see if alternate suppliers could save money.`,cta:"Check prices",fn:()=>{setSelIng(biggestMover.n);setTab("ingredients");},color:T.coral}:null,
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
    if(!img)return;setScanning(true);setScanRes(null);
    try{
      const fileBlock=img.isPdf
        ?{type:"document",source:{type:"base64",media_type:"application/pdf",data:img.b64}}
        :{type:"image",source:{type:"base64",media_type:img.mime||"image/jpeg",data:img.b64}};
      const res=await fetch("https://api.anthropic.com/v1/messages",{method:"POST",headers:API_HEADERS(),body:JSON.stringify({model:MODEL,max_tokens:800,messages:[{role:"user",content:[fileBlock,{type:"text",text:'Parse this supplier receipt or invoice for a poke restaurant in Vancouver. Return ONLY JSON no markdown: {"supplier":"name or Unknown","date":"YYYY-MM-DD","items":[{"ingredient":"normalised name","price":0.00,"unit":"lb"}]}. Price = unit price not line total. Skip taxes and fees. If unreadable: {"error":"Cannot read receipt clearly"}'}]}]})});
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
    setData(u);setScanRes(null);setImg(null);setModal(null);setTab("dashboard");
    try{
      await saveReceipt(result);
      say(`Saved ${saved} item${saved!==1?"s":""} to database`);
    }catch(e){
      console.error(e);
      say("Saved locally — database sync failed",true);
    }
  };

  // ── price check ──
  const doCheck=async(ing,unit,price)=>{
    setChkIng(ing);setChecks(p=>({...p,[ing]:{status:"loading"}}));
    try{
      const r=await fetch("https://api.anthropic.com/v1/messages",{method:"POST",headers:API_HEADERS(),body:JSON.stringify({model:MODEL,max_tokens:800,tools:[{type:"web_search_20250305",name:"web_search"}],messages:[{role:"user",content:`Search current retail price of "${ing}" per ${unit} in Vancouver BC Canada 2026 at Costco, T&T Supermarket, H-Mart, Save-On-Foods, local markets. Return ONLY JSON no markdown: {"marketRange":{"low":0.00,"high":0.00},"sources":[{"store":"Name","price":0.00,"notes":"brief"}],"verdict":"good|high|very_high","recommendation":"one actionable sentence"}. Verdict: good=at/below market, high=10-25% above, very_high=25%+ above. No data: {"error":"No reliable price data"}`}]})});
      const out=await r.json();
      const txt=out.content?.find(b=>b.type==="text")?.text||"";
      const parsed=JSON.parse(txt.replace(/```json|```/g,"").trim());
      if(parsed.error)setChecks(p=>({...p,[ing]:{status:"err",msg:parsed.error}}));
      else setChecks(p=>({...p,[ing]:{status:"ok",data:parsed,paying:price,at:new Date().toLocaleDateString("en-CA")}}));
    }catch(e){setChecks(p=>({...p,[ing]:{status:"err",msg:"Search failed. Try again."}}));}
    setChkIng(null);
  };

  const doAllChecks=async()=>{
    setChkAll(true);
    for(const[n,e]of Object.entries(data.ingredients))await doCheck(n,e[0]?.unit||"unit",gL(e));
    setChkAll(false);say("All price checks complete");
  };

  // ── AI insights ──
  const buildDataSummary=()=>JSON.stringify({
    period:latMon,
    locations:data.locations,
    revenue:{total:rev,loc1:latMon?cRev(latMon,"loc1"):0,loc2:latMon?cRev(latMon,"loc2"):0},
    cogsPct:{overall:fcp.toFixed(1),loc1:latMon&&cRev(latMon,"loc1")?(cCOGS(latMon,"loc1")/cRev(latMon,"loc1")*100).toFixed(1):0,loc2:latMon&&cRev(latMon,"loc2")?(cCOGS(latMon,"loc2")/cRev(latMon,"loc2")*100).toFixed(1):0},
    topMovers:movers.slice(0,5).map(m=>({ingredient:m.n,changePct:m.ch.toFixed(1),price:`$${m.lat.toFixed(2)}/${m.unit}`})),
    menu:Object.entries(data.menu).map(([name,m])=>({name,sell:m.price,cost:bCost(name).toFixed(2),foodCostPct:bFCP(name).toFixed(1)})),
    alerts:activeAlerts.map(([i,t])=>({ingredient:i,threshold:t,current:gL(data.ingredients[i]).toFixed(2)})),
  });

  const generateInsights=async()=>{
    setLoadingInsights(true);setAiInsights(null);
    try{
      const res=await fetch("https://api.anthropic.com/v1/messages",{method:"POST",headers:API_HEADERS(),body:JSON.stringify({model:MODEL,max_tokens:1500,messages:[{role:"user",content:`You are a food cost analyst for Westcoast Poké, a two-location poke restaurant in Vancouver BC. Data: ${buildDataSummary()}\n\nGive 4-5 specific actionable insights referencing actual numbers, bowls and ingredients from the data. Return ONLY JSON no markdown: {"headline":"one punchy sentence on the biggest issue or opportunity","insights":[{"priority":"high|medium|low","icon":"emoji","title":"short title with a number","detail":"2-3 sentences with specific numbers","action":"exactly what to do next"}]}`}]})});
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

  const TABS=[{id:"dashboard",label:"Dashboard"},{id:"ingredients",label:"Ingredients"},{id:"suppliers",label:"Suppliers"},{id:"sales",label:"Sales & P&L"},{id:"insights",label:"✦ Insights"}];

  // ── auth gate ──
  if(session===undefined) return <div style={{minHeight:"100vh",background:T.bg,display:"flex",alignItems:"center",justifyContent:"center",color:T.muted,fontFamily:"sans-serif"}}>Loading...</div>;
  if(!session||!isOwner(session.user?.email)) return <Login T={T}/>;

  return(
    <div style={{minHeight:"100vh",background:T.bg,color:T.navy,fontFamily:"-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif"}}>

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
      <div style={{background:T.card,borderBottom:`1px solid ${T.border}`,padding:isMobile?"0 14px":"0 28px",display:"flex",alignItems:"center",height:isMobile?52:64,gap:8,position:"sticky",top:0,zIndex:100}}>
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
          <button onClick={()=>setTab("scan")} style={{background:T.blue,border:"none",borderRadius:20,padding:isMobile?"6px 12px":"7px 16px",color:"#fff",fontSize:isMobile?12:13,fontWeight:700,cursor:"pointer",whiteSpace:"nowrap"}}>📷 {isMobile?"Scan":"Scan receipt"}</button>
          <button onClick={()=>setDark(v=>!v)} style={{background:"none",border:"none",fontSize:isMobile?18:20,cursor:"pointer",padding:4,lineHeight:1}}>{dark?"☀️":"🌙"}</button>
          <button onClick={signOut} title={session.user?.email} style={{background:"none",border:`1px solid ${T.border}`,borderRadius:20,color:T.muted,padding:isMobile?"5px 10px":"6px 14px",fontSize:isMobile?11:12,fontWeight:700,cursor:"pointer",whiteSpace:"nowrap"}}>Sign out</button>
        </div>
      </div>

      {activeAlerts.length>0&&(
        <div style={{background:T.coralL,borderBottom:`1px solid ${T.coral}33`,padding:isMobile?"9px 14px":"9px 28px",display:"flex",alignItems:"center",gap:10,fontSize:isMobile?12:14}}>
          <span>🔺</span><span style={{color:T.coral,fontWeight:700}}>Price alert:</span>
          <span style={{color:T.slate,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{activeAlerts.map(([i])=>i).join(" · ")}</span>
          <button onClick={()=>setTab("ingredients")} style={{marginLeft:"auto",background:"none",border:`1px solid ${T.coral}`,borderRadius:20,color:T.coral,padding:"3px 10px",fontSize:12,cursor:"pointer",fontWeight:700,whiteSpace:"nowrap",flexShrink:0}}>Review →</button>
        </div>
      )}

      <div style={{background:T.card,borderBottom:`1px solid ${T.border}`,padding:isMobile?"0 8px":"0 28px",display:"flex",overflowX:"auto"}}>
        {TABS.map(t=>(
          <button key={t.id} onClick={()=>setTab(t.id)} style={{background:"none",border:"none",color:tab===t.id?T.blue:T.muted,padding:isMobile?"11px 10px":"13px 16px",fontSize:isMobile?12:14,cursor:"pointer",borderBottom:tab===t.id?`2.5px solid ${T.blue}`:"2.5px solid transparent",fontWeight:tab===t.id?700:500,whiteSpace:"nowrap",flexShrink:0}}>{t.label}</button>
        ))}
      </div>

      <div style={{padding:isMobile?"16px":"28px 32px",maxWidth:MAXW,margin:"0 auto"}}>
        {tab==="dashboard"&&<Dashboard {...{T,isMobile,isDesktop,card,Tag,latMon,loc,locName,headline,rev,cogs,gp,fcp,revDelta,data,movers,actions,cRev,cCOGS,setSelIng,setTab}}/>}
        {tab==="ingredients"&&<Ingredients {...{T,isMobile,isDesktop,card,Tag,data,selIng,setSelIng,checks,chkIng,chkAll,doCheck,doAllChecks}}/>}
        {tab==="suppliers"&&<Suppliers {...{T,isMobile,isDesktop,card,Tag,data,selSup,setSelSup}}/>}
        {tab==="sales"&&<Sales {...{T,isMobile,isDesktop,card,Tag,data,loc,locKey,cRev,cCOGS,bCost,bFCP,bMargin,months,onSaveSales:async(month,l1,l2)=>{
          const u=JSON.parse(JSON.stringify(data));
          const existing=u.sales[month]||{mix:{}};
          u.sales[month]={loc1:l1,loc2:l2,mix:existing.mix||{}};
          setData(u);
          try{await saveSales(month,l1,l2,existing.mix||{});say(`${month} sales saved`);}
          catch(e){console.error(e);say("Save failed — try again",true);}
        }}}/>}
        {tab==="scan"&&<Scan {...{T,isMobile,card,img,setImg,scanRes,setScanRes,scanning,doScan,okScan,onFile,fileRef}}/>}
        {tab==="insights"&&<Insights {...{T,isMobile,isDesktop,card,Tag,latMon,aiInsights,loadingInsights,generateInsights,insightChat,chatInput,setChatInput,chatLoading,sendChat}}/>}
      </div>

      <style>{"@keyframes pulse{0%,100%{opacity:1}50%{opacity:0.4}} @keyframes bounce{0%,100%{transform:translateY(0)}50%{transform:translateY(-6px)}} *{box-sizing:border-box} button:active:not(:disabled){transform:scale(0.97)}"}</style>
    </div>
  );
}

// ─── DASHBOARD ───────────────────────────────────────────────────────────────
function Dashboard({T,isMobile,isDesktop,card,Tag,latMon,loc,locName,headline,rev,cogs,gp,fcp,revDelta,data,movers,actions,cRev,cCOGS,setSelIng,setTab}){
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
          <div style={{fontSize:isMobile?15:17,fontWeight:700,marginBottom:4}}>Price movement</div>
          <div style={{fontSize:12,color:T.muted,marginBottom:14}}>Shared purchasing across both locations</div>
          {movers.map((m,i)=>(
            <div key={m.n} onClick={()=>{setSelIng(m.n);setTab("ingredients");}} style={{display:"flex",alignItems:"center",gap:10,padding:"9px 0",borderBottom:i<movers.length-1?`1px solid ${T.border}`:"none",cursor:"pointer"}}>
              <div style={{width:7,height:7,borderRadius:"50%",background:m.ch>20?T.coral:m.ch>10?T.amber:m.ch>0?"#F59E0B":T.teal,flexShrink:0}}/>
              <div style={{flex:1,minWidth:0}}>
                <div style={{fontSize:isMobile?13:14,fontWeight:600,whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>{m.n}</div>
                <div style={{fontSize:10,color:T.muted,textTransform:"uppercase"}}>per {m.unit}</div>
              </div>
              <Spark data={m.entries} up={m.ch>0} T={T} W={isDesktop?85:65} H={28}/>
              <div style={{fontSize:isMobile?12:14,fontWeight:700,color:m.ch>0?T.coral:T.teal,minWidth:54,textAlign:"right"}}>{m.ch>0?"+":""}{m.ch.toFixed(1)}%</div>
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
function Ingredients({T,isMobile,isDesktop,card,Tag,data,selIng,setSelIng,checks,chkIng,chkAll,doCheck,doAllChecks}){
  return(
    <div>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:18,flexWrap:"wrap",gap:8}}>
        <h2 style={{margin:0,fontSize:isMobile?20:26,fontWeight:800,letterSpacing:"-0.5px"}}>Ingredients <span style={{fontSize:isMobile?14:16,color:T.muted,fontWeight:400}}>({Object.keys(data.ingredients).length})</span></h2>
        <button onClick={doAllChecks} disabled={chkAll} style={{background:T.tealL,border:`1px solid ${T.teal}44`,color:T.teal,padding:"8px 16px",borderRadius:20,fontSize:13,cursor:chkAll?"not-allowed":"pointer",fontWeight:700,opacity:chkAll?0.6:1}}>{chkAll?"🔍 Checking all...":"🔍 Check all prices"}</button>
      </div>
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
                  <div style={{fontSize:13,fontWeight:700,color:ch>0?T.coral:T.teal}}>{ch>0?"▲":"▼"} {Math.abs(ch).toFixed(1)}%</div>
                </div>
                <Spark data={entries} up={ch>0} T={T} W={isDesktop?90:70} H={32}/>
              </div>

              {isSel&&(
                <div style={{marginTop:16,paddingTop:16,borderTop:`1px solid ${T.border}`}} onClick={e=>e.stopPropagation()}>
                  <PriceChart data={entries} T={T}/>
                  <div style={{marginTop:12}}>
                    {entries.map((e,i)=>(
                      <div key={i} style={{display:"flex",justifyContent:"space-between",fontSize:13,color:T.muted,padding:"5px 0",borderBottom:`1px solid ${T.border}`}}>
                        <span>{e.date}</span><span>{e.supplier}</span><span style={{color:T.navy,fontWeight:600}}>${fmt(e.price)}/{e.unit}</span>
                      </div>
                    ))}
                  </div>
                  <div style={{marginTop:16}}>
                    <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:10}}>
                      <div style={{fontSize:14,fontWeight:700}}>Vancouver Market Price Check</div>
                      <button onClick={()=>doCheck(name,entries[0]?.unit||"unit",lat)} disabled={chkIng===name} style={{background:T.blueL,border:`1px solid ${T.border}`,borderRadius:20,color:T.blue,padding:"5px 12px",fontSize:12,cursor:chkIng===name?"not-allowed":"pointer",fontWeight:700,opacity:chkIng===name?0.5:1}}>{chkIng===name?"Searching...":pc?"🔄 Refresh":"🔍 Check now"}</button>
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
                                    <div style={{fontSize:14,fontWeight:600}}>{src.store}</div>
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
                          <div style={{fontSize:11,color:T.muted}}>Checked {pc.at} · Retail prices only</div>
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
    </div>
  );
}

// ─── SUPPLIERS ───────────────────────────────────────────────────────────────
function Suppliers({T,isMobile,isDesktop,card,Tag,data,selSup,setSelSup}){
  return(
    <div>
      <h2 style={{margin:"0 0 20px",fontSize:isMobile?20:26,fontWeight:800,letterSpacing:"-0.5px"}}>Suppliers</h2>
      {["trade","retail"].map(st=>{
        const sups=Object.entries(data.suppliers).filter(([,s])=>s.type===st);
        if(!sups.length)return null;
        return(
          <div key={st} style={{marginBottom:24}}>
            <div style={{fontSize:11,color:T.muted,textTransform:"uppercase",letterSpacing:"1.2px",fontWeight:700,marginBottom:10}}>{st==="trade"?"Trade Accounts":"Regular Retail · Cash"}</div>
            <div style={{display:"grid",gridTemplateColumns:isDesktop?"1fr 1fr":"1fr",gap:10}}>
              {sups.map(([name,s])=>{
                const isSel=selSup===name;
                const ingList=Object.entries(data.ingredients).filter(([,ee])=>ee.some(e=>e.supplier===name)).map(([i])=>i);
                return(
                  <div key={name} onClick={()=>setSelSup(isSel?null:name)} style={{...card,borderColor:isSel?T.blue:T.border,cursor:"pointer"}}>
                    <div style={{display:"flex",alignItems:"flex-start",gap:12}}>
                      <div style={{flex:1}}>
                        <div style={{fontSize:isMobile?15:17,fontWeight:700,marginBottom:3}}>{name}</div>
                        <div style={{fontSize:12,color:T.muted}}>{st==="trade"?`${s.terms} · ${s.delivery}`:"Cash · Self-collect"}</div>
                      </div>
                      {ingList.length>0&&<Tag c={T.blue} bg={T.blueL} sm>{ingList.length} ingredient{ingList.length>1?"s":""}</Tag>}
                    </div>
                    {isSel&&(
                      <div style={{marginTop:14,paddingTop:14,borderTop:`1px solid ${T.border}`}}>
                        {st==="trade"&&(
                          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10,marginBottom:12}}>
                            {[["Terms",s.terms],["Delivery",s.delivery],["Contact",s.contact],["Phone",s.phone],["Email",s.email]].filter(([,v])=>v).map(([k,v])=>(
                              <div key={k}><div style={{fontSize:10,color:T.muted,fontWeight:700,textTransform:"uppercase",marginBottom:2}}>{k}</div><div style={{fontSize:14,color:T.slate}}>{v}</div></div>
                            ))}
                          </div>
                        )}
                        {s.notes&&<div style={{fontSize:13,color:T.muted,fontStyle:"italic",marginBottom:10,background:T.bg,padding:"8px 12px",borderRadius:8}}>{s.notes}</div>}
                        {ingList.length>0&&(
                          <div style={{display:"flex",flexWrap:"wrap",gap:6}}>
                            {ingList.map(ing=>{
                              const ee=data.ingredients[ing];
                              const myL=ee.filter(e=>e.supplier===name).slice(-1)[0]?.price;
                              const allL=gL(ee);
                              const cheap=myL&&myL<=allL;
                              return <Tag key={ing} c={cheap?T.teal:T.coral} bg={cheap?T.tealL:T.coralL} sm>{ing} ${myL?.toFixed(2)}</Tag>;
                            })}
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
      })}
    </div>
  );
}

// ─── SALES & P&L ─────────────────────────────────────────────────────────────
function Sales({T,isMobile,isDesktop,card,Tag,data,loc,locKey,cRev,cCOGS,bCost,bFCP,bMargin,months,onSaveSales}){
  const [showForm,setShowForm]=useState(false);
  const [fMonth,setFMonth]=useState("");
  const [fL1,setFL1]=useState("");
  const [fL2,setFL2]=useState("");
  const [saving,setSaving]=useState(false);
  const monthOptions=(()=>{
    const opts=[];const now=new Date(2026,6);
    for(let i=0;i<12;i++){const d=new Date(now.getFullYear(),now.getMonth()-i);opts.push(`${["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"][d.getMonth()]} ${d.getFullYear()}`);}
    return opts;
  })();
  const submit=async()=>{
    if(!fMonth||!fL1||!fL2)return;
    setSaving(true);
    await onSaveSales(fMonth,parseFloat(fL1)||0,parseFloat(fL2)||0);
    setSaving(false);setShowForm(false);setFMonth("");setFL1("");setFL2("");
  };
  const inp={width:"100%",background:T.bg,border:`1px solid ${T.border}`,borderRadius:10,padding:"11px 14px",color:T.navy,fontSize:15,fontFamily:"inherit",outline:"none"};
  return(
    <div>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:20,flexWrap:"wrap",gap:10}}>
        <h2 style={{margin:0,fontSize:isMobile?20:26,fontWeight:800,letterSpacing:"-0.5px"}}>Sales & P&L</h2>
        <button onClick={()=>setShowForm(v=>!v)} style={{background:showForm?"transparent":T.blue,color:showForm?T.muted:"#fff",border:showForm?`1px solid ${T.border}`:"none",borderRadius:20,padding:"9px 18px",fontSize:13,fontWeight:700,cursor:"pointer"}}>{showForm?"Cancel":"+ Enter monthly sales"}</button>
      </div>

      {showForm&&(
        <div style={{...card,marginBottom:16,borderColor:T.blue}}>
          <div style={{fontSize:isMobile?15:17,fontWeight:700,marginBottom:14}}>Enter monthly revenue</div>
          <div style={{display:"grid",gridTemplateColumns:isMobile?"1fr":"1fr 1fr 1fr auto",gap:10,alignItems:"end"}}>
            <div>
              <div style={{fontSize:11,color:T.muted,fontWeight:700,marginBottom:5}}>MONTH</div>
              <select value={fMonth} onChange={e=>setFMonth(e.target.value)} style={inp}>
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
            <button onClick={submit} disabled={saving||!fMonth||!fL1||!fL2} style={{background:T.teal,color:"#fff",border:"none",borderRadius:10,padding:"12px 22px",fontSize:14,fontWeight:800,cursor:saving?"not-allowed":"pointer",opacity:saving||!fMonth||!fL1||!fL2?0.6:1,whiteSpace:"nowrap"}}>{saving?"Saving...":"Save"}</button>
          </div>
          {fMonth&&data.sales[fMonth]&&<div style={{marginTop:10,fontSize:12,color:T.amber,fontWeight:600}}>⚠ {fMonth} already has figures (${(data.sales[fMonth].loc1||0).toLocaleString()} / ${(data.sales[fMonth].loc2||0).toLocaleString()}) — saving will overwrite them.</div>}
        </div>
      )}
      {[...months].reverse().map(mon=>{
        const r=cRev(mon,locKey),c=cCOGS(mon,locKey),g=r-c,p=r?(c/r)*100:0;
        return(
          <div key={mon} style={{...card,marginBottom:16}}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:16}}>
              <div style={{fontSize:isMobile?16:20,fontWeight:800}}>{mon}</div>
              <Tag c={p>30?T.coral:T.teal} bg={p>30?T.coralL:T.tealL}>Food cost {p.toFixed(1)}%{p>30?" ⚠":""}</Tag>
            </div>
            <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:isMobile?8:12,marginBottom:loc==="all"?16:0}}>
              {[["Revenue",r,T.blue,T.blueL],["COGS",c,p>30?T.coral:T.amber,p>30?T.coralL:T.amberL],["Gross Profit",g,T.teal,T.tealL]].map(([l,v,col,bg])=>(
                <div key={l} style={{background:bg,borderRadius:10,padding:isMobile?"10px 12px":"14px 18px",border:`1px solid ${T.border}`}}>
                  <div style={{fontSize:10,color:T.inkL,fontWeight:700,textTransform:"uppercase",letterSpacing:"0.8px",marginBottom:5}}>{l}</div>
                  <div style={{fontSize:isMobile?18:24,fontWeight:900,color:col,letterSpacing:"-0.5px"}}>${fmt(v)}</div>
                </div>
              ))}
            </div>
            {loc==="all"&&(
              <div style={{borderTop:`1px solid ${T.border}`,paddingTop:14}}>
                {["loc1","loc2"].map((l,i)=>{
                  const lr=cRev(mon,l),lc=cCOGS(mon,l),lp=lr?(lc/lr)*100:0;
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
          </div>
        );
      })}
      <div style={card}>
        <h3 style={{margin:"0 0 16px",fontSize:isMobile?16:20,fontWeight:800}}>Menu Cost Analysis <span style={{fontSize:12,color:T.muted,fontWeight:400}}>· Medium size bowls</span></h3>
        <div style={{display:"grid",gridTemplateColumns:isDesktop?"1fr 1fr":"1fr",columnGap:32}}>
          {Object.entries(data.menu).map(([item,md])=>{
            const cost=bCost(item),fp=bFCP(item),mg=bMargin(item);
            return(
              <div key={item} style={{display:"flex",alignItems:"center",gap:12,padding:"11px 0",borderBottom:`1px solid ${T.border}`}}>
                <div style={{flex:1}}>
                  <div style={{fontSize:isMobile?13:15,fontWeight:700}}>{item}</div>
                  <div style={{fontSize:12,color:T.muted}}>Sell ${fmt(md.price)} · Cost ${fmt(cost)}</div>
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
function Scan({T,isMobile,card,img,setImg,scanRes,setScanRes,scanning,doScan,okScan,onFile,fileRef}){
  return(
    <div style={{maxWidth:580,margin:"0 auto"}}>
      <h2 style={{margin:"0 0 6px",fontSize:isMobile?20:26,fontWeight:800,letterSpacing:"-0.5px"}}>Scan Receipt or Invoice</h2>
      <p style={{margin:"0 0 24px",fontSize:isMobile?13:15,color:T.muted,lineHeight:1.6}}>AI extracts ingredients, prices, and supplier automatically. Duplicates are blocked. The photo is discarded after extraction — only the data is saved.</p>
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
              <button onClick={doScan} disabled={scanning} style={{width:"100%",background:T.blue,color:"#fff",border:"none",borderRadius:12,padding:isMobile?"13px":"15px",fontSize:isMobile?15:17,cursor:scanning?"not-allowed":"pointer",fontWeight:800,marginBottom:8,opacity:scanning?0.7:1}}>{scanning?"🔍 Analysing receipt...":"Extract Prices with AI"}</button>
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
            <div style={{fontSize:10,color:"rgba(255,255,255,0.5)",textTransform:"uppercase",letterSpacing:"1.5px",fontWeight:700,marginBottom:8}}>✦ AI ANALYSIS · {latMon}</div>
            <div style={{fontSize:isMobile?18:24,fontWeight:800,color:T.bg,lineHeight:1.3}}>{aiInsights.headline}</div>
          </div>
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
        </div>
      )}
    </div>
  );
}
