import { useState, useRef } from "react";

const LIGHT = { blue:"#2D6E9E", blueL:"#EBF4FA", teal:"#3A9E8A", tealL:"#EAF7F4", coral:"#E05C3A", coralL:"#FDF0EC", amber:"#C98B2A", amberL:"#FDF6E8", navy:"#1A3349", slate:"#4A6275", muted:"#8BA5B8", border:"#D4E4EF", bg:"#F7FAFC", card:"#FFFFFF" };
const DARK  = { blue:"#6BAED6", blueL:"#0D1E2E", teal:"#4CC9B0", tealL:"#0A1E1A", coral:"#E87B5A", coralL:"#2A1008", amber:"#D4A044", amberL:"#231808", navy:"#E2EEF5", slate:"#A0C0D4", muted:"#4A6E84", border:"#1A3045", bg:"#0A1520", card:"#0F1E2E" };

const DATA = {
  ingredients:{
    "Ahi Tuna":[{date:"2025-12-01",price:28.50,unit:"lb",supplier:"Pacific Foods"},{date:"2026-02-20",price:34.50,unit:"lb",supplier:"Pacific Foods"},{date:"2026-05-22",price:36.80,unit:"lb",supplier:"Pacific Foods"}],
    "Salmon":[{date:"2025-12-01",price:18.00,unit:"lb",supplier:"BC Seafood"},{date:"2026-03-08",price:21.00,unit:"lb",supplier:"BC Seafood"},{date:"2026-05-22",price:22.50,unit:"lb",supplier:"BC Seafood"}],
    "Sushi Rice":[{date:"2025-12-01",price:42.00,unit:"25kg",supplier:"Asia Grocery"},{date:"2026-05-01",price:48.00,unit:"25kg",supplier:"Asia Grocery"}],
    "Avocado":[{date:"2025-12-01",price:1.20,unit:"each",supplier:"Fresh Direct"},{date:"2026-03-15",price:2.10,unit:"each",supplier:"Fresh Direct"},{date:"2026-05-22",price:1.85,unit:"each",supplier:"Fresh Direct"}],
    "Edamame":[{date:"2025-12-01",price:8.50,unit:"kg",supplier:"Fresh Direct"},{date:"2026-05-22",price:8.80,unit:"kg",supplier:"Fresh Direct"}],
    "Cucumber":[{date:"2026-01-01",price:0.80,unit:"each",supplier:"Fresh Direct"},{date:"2026-05-22",price:0.90,unit:"each",supplier:"Fresh Direct"}],
    "Mango":[{date:"2026-02-01",price:1.50,unit:"each",supplier:"Fresh Direct"},{date:"2026-05-22",price:1.80,unit:"each",supplier:"Fresh Direct"}],
    "Sesame Oil":[{date:"2025-12-01",price:12.00,unit:"bottle",supplier:"Asia Grocery"},{date:"2026-03-10",price:13.50,unit:"bottle",supplier:"T&T"}],
  },
  suppliers:{
    "Pacific Foods":{type:"trade",contact:"Mike Chen",phone:"604-555-0101",email:"mike@pacificfoods.ca",terms:"Net 14",delivery:"Mon/Wed/Fri",notes:"Primary seafood account."},
    "BC Seafood":{type:"trade",contact:"Sarah Park",phone:"604-555-0182",email:"sarah@bcseafood.ca",terms:"Net 7",delivery:"Tue/Thu",notes:"Secondary seafood supplier."},
    "Asia Grocery":{type:"trade",contact:"David Lin",phone:"604-555-0234",email:"orders@asiagrocery.ca",terms:"Net 30",delivery:"Weekly Mon",notes:"Dry goods and pantry staples."},
    "Fresh Direct":{type:"trade",contact:"Emma Walsh",phone:"604-555-0310",email:"emma@freshdirect.ca",terms:"Net 7",delivery:"Daily",notes:"Produce. Most reliable for avocado."},
    "Costco":{type:"retail",notes:"Good for bulk items when prices are right. Cash."},
    "T&T":{type:"retail",notes:"Good for Asian pantry items. Cash."},
    "Save-On-Foods":{type:"retail",notes:"Backup produce. Cash."},
  },
  menu:{
    "Classic Tuna Bowl":{price:22.50,ing:{"Ahi Tuna":0.31,"Sushi Rice":0.22,"Avocado":0.5,"Cucumber":1,"Edamame":0.08,"Sesame Oil":0.02}},
    "Salmon Lover Bowl":{price:20.50,ing:{"Salmon":0.31,"Sushi Rice":0.22,"Avocado":0.5,"Cucumber":1,"Edamame":0.08,"Sesame Oil":0.02}},
    "Mango Tuna Bowl":{price:23.50,ing:{"Ahi Tuna":0.31,"Sushi Rice":0.22,"Mango":0.5,"Avocado":0.25,"Edamame":0.08,"Sesame Oil":0.02}},
    "Double Protein Bowl":{price:27.00,ing:{"Ahi Tuna":0.2,"Salmon":0.2,"Sushi Rice":0.22,"Avocado":0.5,"Cucumber":0.5,"Edamame":0.1,"Sesame Oil":0.02}},
  },
  sales:{
    "Apr 2026":{loc1:28400,loc2:21600,mix:{"Classic Tuna Bowl":{loc1:320,loc2:240},"Salmon Lover Bowl":{loc1:280,loc2:210},"Mango Tuna Bowl":{loc1:190,loc2:140},"Double Protein Bowl":{loc1:120,loc2:90}}},
    "May 2026":{loc1:31200,loc2:23800,mix:{"Classic Tuna Bowl":{loc1:350,loc2:260},"Salmon Lover Bowl":{loc1:300,loc2:220},"Mango Tuna Bowl":{loc1:210,loc2:155},"Double Protein Bowl":{loc1:135,loc2:100}}},
  },
  alerts:{"Ahi Tuna":32,"Avocado":1.90,"Salmon":20},
  receipts:[],
};

const gL  = e => e[e.length-1]?.price || 0;
const gPct= e => e.length<2 ? 0 : ((gL(e)-e[0].price)/e[0].price)*100;
const fmt = n => (n||0).toLocaleString("en-CA",{minimumFractionDigits:2,maximumFractionDigits:2});
const fmtK= n => n>=1000 ? `$${(n/1000).toFixed(1)}k` : `$${fmt(n)}`;
const MON = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];

function Spark({data,up,T}){
  if(!data||data.length<2) return <span style={{width:60,display:"inline-block"}}/>;
  const pp=data.map(d=>d.price),mn=Math.min(...pp),mx=Math.max(...pp),rng=mx-mn||1;
  const w=60,h=22,col=up?T.coral:T.teal;
  const pts=pp.map((p,i)=>`${(i/(pp.length-1))*w},${h-((p-mn)/rng)*(h-4)-2}`).join(" ");
  return(
    <svg width={w} height={h} style={{display:"block",flexShrink:0}}>
      <polyline points={pts} fill="none" stroke={col} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
      {pp.map((p,i)=>{const x=(i/(pp.length-1))*w,y=h-((p-mn)/rng)*(h-4)-2;return <circle key={i} cx={x} cy={y} r="2" fill={col}/>;} )}
    </svg>
  );
}

export default function App(){
  const [dark,setDark]=useState(false);
  const T=dark?DARK:LIGHT;
  const [data,setData]=useState(DATA);
  const [tab,setTab]=useState("dashboard");
  const [loc,setLoc]=useState("all");
  const [toast,setToast]=useState(null);
  const [selIng,setSelIng]=useState(null);
  const [selSup,setSelSup]=useState(null);
  const [checks,setChecks]=useState({});
  const [chkIng,setChkIng]=useState(null);
  const [img,setImg]=useState(null);
  const [scanning,setScanning]=useState(false);
  const [scanRes,setScanRes]=useState(null);
  const [dupModal,setDupModal]=useState(null);
  const fileRef=useRef(null);

  const say=(msg,err)=>{setToast({msg,err});setTimeout(()=>setToast(null),3500);};

  const card={background:T.card,border:`1px solid ${T.border}`,borderRadius:12,padding:"14px 16px"};
  const Tag=({c,bg,children})=><span style={{background:bg||T.blueL,color:c||T.blue,border:`1px solid ${(c||T.blue)}33`,padding:"2px 8px",borderRadius:20,fontSize:10,fontWeight:700}}>{children}</span>;

  // computed
  const gIL=n=>{const e=data.ingredients[n];return e&&e.length?gL(e):0;};
  const bCost=item=>{const m=data.menu[item];if(!m)return 0;return Object.entries(m.ing).reduce((s,[i,q])=>s+gIL(i)*q,0);};
  const bFCP=item=>{const m=data.menu[item];if(!m)return 0;return(bCost(item)/m.price)*100;};
  const movers=Object.entries(data.ingredients).map(([n,e])=>({n,ch:gPct(e),lat:gL(e),unit:e[0]?.unit})).sort((a,b)=>Math.abs(b.ch)-Math.abs(a.ch)).slice(0,6);
  const activeAlerts=Object.entries(data.alerts).filter(([i,t])=>{const e=data.ingredients[i];return e&&e.length&&gL(e)>t;});

  const cRev=(mon,l)=>{const s=data.sales[mon];if(!s)return 0;if(l==="loc1")return s.loc1;if(l==="loc2")return s.loc2;return(s.loc1||0)+(s.loc2||0);};
  const cCOGS=(mon,l)=>{
    const s=data.sales[mon];if(!s||!s.mix)return 0;
    return Object.entries(data.menu).reduce((t,[item])=>{
      const mix=s.mix[item];if(!mix)return t;
      const sold=l==="loc1"?(mix.loc1||0):l==="loc2"?(mix.loc2||0):((mix.loc1||0)+(mix.loc2||0));
      return t+bCost(item)*sold;
    },0);
  };

  const latMon=Object.keys(data.sales).reverse()[0];
  const locKey=loc==="all"?"all":loc;
  const rev=latMon?cRev(latMon,locKey):0;
  const cogs=latMon?cCOGS(latMon,locKey):0;
  const gp=rev-cogs;
  const fcp=rev?(cogs/rev)*100:0;

  // scan
  const onFile=e=>{const f=e.target.files[0];if(!f)return;const r=new FileReader();r.onload=ev=>setImg({b64:ev.target.result.split(",")[1],prev:ev.target.result,name:f.name});r.readAsDataURL(f);};
  const doScan=async()=>{
    if(!img)return;setScanning(true);setScanRes(null);
    try{
      const res=await fetch("https://api.anthropic.com/v1/messages",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({model:"claude-sonnet-4-20250514",max_tokens:800,messages:[{role:"user",content:[{type:"image",source:{type:"base64",media_type:"image/jpeg",data:img.b64}},{type:"text",text:'Parse this receipt. Return ONLY JSON: {"supplier":"name","date":"YYYY-MM-DD","items":[{"ingredient":"name","price":0.00,"unit":"lb"}]}. Normalise ingredient names. Skip taxes. If unreadable: {"error":"Cannot read"}'}]}]})});
      const out=await res.json();
      const txt=out.content?.find(b=>b.type==="text")?.text||"";
      const parsed=JSON.parse(txt.replace(/```json|```/g,"").trim());
      if(parsed.error){say(parsed.error,true);}
      else{
        const fp=`${parsed.supplier}|${parsed.date}|${parsed.items?.length}`;
        if((data.receipts||[]).includes(fp)){setDupModal(parsed);}
        else{setScanRes(parsed);say(`Found ${parsed.items?.length||0} items`);}
      }
    }catch(e){say("Could not parse receipt",true);}
    setScanning(false);
  };
  const okScan=(r=null)=>{
    const result=r||scanRes;if(!result?.items)return;
    const u=JSON.parse(JSON.stringify(data)),d=result.date||"2026-06-07";
    result.items.forEach(it=>{
      if(!u.ingredients[it.ingredient])u.ingredients[it.ingredient]=[];
      const already=u.ingredients[it.ingredient].some(e=>e.date===d&&e.supplier===result.supplier);
      if(!already)u.ingredients[it.ingredient].push({date:d,price:it.price,unit:it.unit||"unit",supplier:result.supplier||"Unknown"});
    });
    const fp=`${result.supplier}|${result.date}|${result.items.length}`;
    u.receipts=[...(u.receipts||[]),fp];
    if(!u.suppliers[result.supplier])u.suppliers[result.supplier]={type:"retail",notes:"Added from scan."};
    setData(u);setScanRes(null);setImg(null);setDupModal(null);setTab("dashboard");say("Receipt saved");
  };

  // price check
  const doCheck=async(ing,unit,price)=>{
    setChkIng(ing);
    setChecks(p=>({...p,[ing]:{status:"loading"}}));
    try{
      const r=await fetch("https://api.anthropic.com/v1/messages",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({model:"claude-sonnet-4-20250514",max_tokens:800,tools:[{type:"web_search_20250305",name:"web_search"}],messages:[{role:"user",content:`Search current retail price of "${ing}" per ${unit} in Vancouver BC Canada 2026 at Costco T&T H-Mart Save-On-Foods local markets. Return ONLY JSON no markdown: {"marketRange":{"low":0.00,"high":0.00},"sources":[{"store":"Name","price":0.00,"notes":"brief"}],"verdict":"good|high|very_high","recommendation":"one sentence"}`}]})});
      const out=await r.json();
      const txt=out.content?.find(b=>b.type==="text")?.text||"";
      const parsed=JSON.parse(txt.replace(/```json|```/g,"").trim());
      if(parsed.error)setChecks(p=>({...p,[ing]:{status:"err",msg:parsed.error}}));
      else setChecks(p=>({...p,[ing]:{status:"ok",data:parsed,paying:price,at:new Date().toLocaleDateString("en-CA")}}));
    }catch(e){setChecks(p=>({...p,[ing]:{status:"err",msg:"Search failed"}}));}
    setChkIng(null);
  };

  const TABS=[{id:"dashboard",lb:"Dashboard"},{id:"ingredients",lb:"Ingredients"},{id:"suppliers",lb:"Suppliers"},{id:"sales",lb:"Sales & P&L"},{id:"scan",lb:"📷 Scan"},{id:"insights",lb:"Insights"}];

  return(
    <div style={{minHeight:"100vh",background:T.bg,color:T.navy,fontFamily:"system-ui,-apple-system,sans-serif",fontSize:14}}>

      {/* toast */}
      {toast&&<div style={{position:"fixed",top:12,left:"50%",transform:"translateX(-50%)",zIndex:999,background:toast.err?T.coral:T.teal,color:"#fff",padding:"8px 16px",borderRadius:20,fontSize:12,fontWeight:700,whiteSpace:"nowrap",boxShadow:"0 4px 16px rgba(0,0,0,0.3)"}}>{toast.msg}</div>}

      {/* dup modal */}
      {dupModal&&(
        <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.6)",zIndex:1000,display:"flex",alignItems:"center",justifyContent:"center",padding:20}}>
          <div style={{background:T.card,border:`1px solid ${T.border}`,borderRadius:16,padding:22,maxWidth:340,width:"100%"}}>
            <div style={{fontSize:24,marginBottom:10}}>⚠️</div>
            <div style={{fontSize:15,fontWeight:700,marginBottom:6}}>Duplicate Receipt</div>
            <div style={{fontSize:12,color:T.slate,marginBottom:16,lineHeight:1.6}}>This receipt from {dupModal.supplier} on {dupModal.date} has already been saved. Saving again would create duplicate entries.</div>
            <div style={{display:"flex",gap:8}}>
              <button onClick={()=>setDupModal(null)} style={{flex:2,background:T.blue,color:"#fff",border:"none",borderRadius:8,padding:"10px",fontSize:13,fontWeight:700,cursor:"pointer"}}>Discard</button>
              <button onClick={()=>okScan(dupModal)} style={{flex:1,background:"transparent",color:T.muted,border:`1px solid ${T.border}`,borderRadius:8,padding:"10px",fontSize:11,cursor:"pointer"}}>Override</button>
            </div>
          </div>
        </div>
      )}

      {/* header */}
      <div style={{background:T.card,borderBottom:`1px solid ${T.border}`,padding:"0 10px",display:"flex",alignItems:"center",height:52,gap:6}}>
        {/* left — logo, shrinks if needed */}
        <div style={{display:"flex",alignItems:"center",gap:6,minWidth:0,flexShrink:1}}>
          <div style={{width:36,height:36,borderRadius:9,background:T.blue,display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0,overflow:"hidden"}}>
            <img src="data:image/png;base64,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" alt="Westcoast Poke" style={{width:32,height:32,objectFit:"contain"}}/>
          </div>
          <div style={{minWidth:0}}>
            <div style={{fontWeight:800,fontSize:12,color:T.blue,lineHeight:1,whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>Westcoast Poké</div>
            <div style={{fontSize:7,color:T.muted,textTransform:"uppercase",letterSpacing:"1px"}}>Cost Intelligence</div>
          </div>
        </div>
        {/* centre — 3 fixed-width pills */}
        <div style={{display:"flex",gap:4,alignItems:"center",flexShrink:0,margin:"0 auto"}}>
          {[{id:"all",l:"All"},{id:"loc1",l:"L1"},{id:"loc2",l:"L2"}].map(l=>(
            <button key={l.id} onClick={()=>setLoc(l.id)} style={{background:loc===l.id?T.blue:"transparent",border:`1px solid ${loc===l.id?T.blue:T.border}`,color:loc===l.id?"#fff":T.slate,width:38,height:28,borderRadius:14,fontSize:11,cursor:"pointer",fontWeight:700,flexShrink:0}}>{l.l}</button>
          ))}
        </div>
        {/* right — moon icon, fixed width */}
        <button onClick={()=>setDark(v=>!v)} style={{background:"none",border:"none",fontSize:18,cursor:"pointer",padding:0,lineHeight:1,flexShrink:0,width:28}}>
          {dark?"☀️":"🌙"}
        </button>
      </div>

      {/* alerts */}
      {activeAlerts.length>0&&<div style={{background:T.coralL,borderBottom:`1px solid ${T.coral}44`,padding:"6px 14px",fontSize:11,display:"flex",gap:6,alignItems:"center"}}><span>🔺</span><span style={{color:T.coral,fontWeight:700}}>Price alert:</span><span style={{color:T.slate}}>{activeAlerts.map(([i])=>i).join(" · ")}</span></div>}

      {/* nav */}
      <div style={{background:T.card,borderBottom:`1px solid ${T.border}`,display:"flex",alignItems:"center",padding:"0 4px",overflowX:"auto"}}>
        {TABS.map(t=>(
          <button key={t.id} onClick={()=>setTab(t.id)} style={{background:"none",border:"none",color:tab===t.id?T.blue:T.muted,padding:"11px 10px",fontSize:11,cursor:"pointer",borderBottom:tab===t.id?`2px solid ${T.blue}`:"2px solid transparent",fontWeight:tab===t.id?700:500,whiteSpace:"nowrap",flexShrink:0}}>{t.lb}</button>
        ))}
      </div>

      <div style={{padding:16,maxWidth:820,margin:"0 auto"}}>

        {/* DASHBOARD */}
        {tab==="dashboard"&&(
          <div>
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10,marginBottom:12}}>
              {[
                {lb:"Revenue",v:fmtK(rev),sub:latMon||"—",col:T.blue},
                {lb:"Food COGS",v:fmtK(cogs),sub:`${fcp.toFixed(1)}% of revenue`,col:fcp>30?T.coral:T.amber},
                {lb:"Gross Profit",v:fmtK(gp),sub:"After ingredients",col:T.teal},
                {lb:"Ingredients",v:Object.keys(data.ingredients).length,sub:`${Object.keys(data.suppliers).length} suppliers`,col:T.blue},
              ].map((k,i)=>(
                <div key={i} style={{...card,borderTop:`3px solid ${k.col}`}}>
                  <div style={{fontSize:9,color:T.muted,textTransform:"uppercase",letterSpacing:"0.8px",fontWeight:700,marginBottom:4}}>{k.lb}</div>
                  <div style={{fontSize:20,fontWeight:800,color:k.col}}>{k.v}</div>
                  <div style={{fontSize:10,color:T.muted,marginTop:2}}>{k.sub}</div>
                </div>
              ))}
            </div>

            {loc==="all"&&latMon&&(
              <div style={{...card,marginBottom:10}}>
                <div style={{fontSize:12,fontWeight:700,marginBottom:10}}>Location Comparison · {latMon}</div>
                {["loc1","loc2"].map((l,i)=>{
                  const lr=cRev(latMon,l),lc=cCOGS(latMon,l),lp=lr?(lc/lr)*100:0;
                  return(
                    <div key={l} style={{display:"flex",alignItems:"center",gap:10,padding:"7px 0",borderBottom:i===0?`1px solid ${T.border}`:"none"}}>
                      <div style={{fontSize:11,color:T.slate,width:50,fontWeight:600}}>Loc {i+1}</div>
                      <div style={{flex:1}}><div style={{height:5,background:T.blueL,borderRadius:3,overflow:"hidden"}}><div style={{height:"100%",width:`${Math.min(lp,100)}%`,background:lp>30?T.coral:T.teal,borderRadius:3}}/></div></div>
                      <div style={{fontSize:11,color:T.muted,width:60,textAlign:"right"}}>${fmt(lr)}</div>
                      <div style={{fontSize:11,fontWeight:700,color:lp>30?T.coral:T.teal,width:36,textAlign:"right"}}>{lp.toFixed(1)}%</div>
                    </div>
                  );
                })}
              </div>
            )}

            <div style={{...card,marginBottom:10}}>
              <div style={{fontSize:12,fontWeight:700,marginBottom:10}}>Price Movement <span style={{fontSize:10,color:T.muted,fontWeight:400}}>· shared purchasing</span></div>
              {movers.map((m,i)=>(
                <div key={m.n} onClick={()=>{setSelIng(m.n);setTab("ingredients");}} style={{display:"flex",alignItems:"center",gap:8,padding:"7px 0",borderBottom:i<movers.length-1?`1px solid ${T.border}`:"none",cursor:"pointer"}}>
                  <div style={{width:5,height:5,borderRadius:"50%",background:m.ch>15?T.coral:m.ch>5?T.amber:T.teal,flexShrink:0}}/>
                  <div style={{flex:1,fontSize:12,fontWeight:500}}>{m.n}</div>
                  <div style={{fontSize:10,color:T.muted}}>${m.lat.toFixed(2)}/{m.unit}</div>
                  <Spark data={data.ingredients[m.n]} up={m.ch>0} T={T}/>
                  <div style={{fontSize:11,fontWeight:700,color:m.ch>0?T.coral:T.teal,minWidth:40,textAlign:"right"}}>{m.ch>0?"+":""}{m.ch.toFixed(1)}%</div>
                </div>
              ))}
            </div>

            <button onClick={()=>setTab("scan")} style={{width:"100%",padding:12,background:T.card,border:`2px dashed ${T.border}`,borderRadius:12,color:T.muted,fontSize:12,cursor:"pointer",fontWeight:600}}>📷 Scan a new receipt</button>
          </div>
        )}

        {/* INGREDIENTS */}
        {tab==="ingredients"&&(
          <div>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:12}}>
              <div style={{fontSize:14,fontWeight:700}}>Ingredients ({Object.keys(data.ingredients).length})</div>
              <button onClick={async()=>{for(const[n,e]of Object.entries(data.ingredients))await doCheck(n,e[0]?.unit||"unit",gL(e));say("All checks done");}} style={{background:T.tealL,border:`1px solid ${T.teal}44`,color:T.teal,padding:"5px 10px",borderRadius:8,fontSize:11,cursor:"pointer",fontWeight:700}}>🔍 Check all prices</button>
            </div>
            <div style={{display:"grid",gap:8}}>
              {Object.entries(data.ingredients).map(([name,entries])=>{
                const lat=gL(entries),ch=gPct(entries),isSel=selIng===name,thr=data.alerts[name],ov=thr&&lat>thr,pc=checks[name];
                return(
                  <div key={name} onClick={()=>setSelIng(isSel?null:name)} style={{...card,borderColor:ov?T.coral:isSel?T.blue:T.border,cursor:"pointer"}}>
                    <div style={{display:"flex",alignItems:"center",gap:8}}>
                      <div style={{flex:1}}>
                        <div style={{fontSize:13,fontWeight:600,display:"flex",alignItems:"center",gap:6,flexWrap:"wrap"}}>
                          {name}
                          {ov&&<Tag c={T.coral} bg={T.coralL}>🔺 Alert</Tag>}
                          {pc?.status==="ok"&&<Tag c={pc.data?.verdict==="good"?T.teal:pc.data?.verdict==="high"?T.amber:T.coral} bg={pc.data?.verdict==="good"?T.tealL:pc.data?.verdict==="high"?T.amberL:T.coralL}>{pc.data?.verdict==="good"?"✓ Good":pc.data?.verdict==="high"?"↑ High":"⚠ Very high"}</Tag>}
                        </div>
                        <div style={{fontSize:10,color:T.muted}}>{entries[entries.length-1]?.supplier} · {entries[entries.length-1]?.date}</div>
                      </div>
                      <div style={{textAlign:"right",marginRight:6}}>
                        <div style={{fontSize:14,fontWeight:700}}>${fmt(lat)}<span style={{fontSize:9,color:T.muted,fontWeight:400}}>/{entries[0]?.unit}</span></div>
                        <div style={{fontSize:11,fontWeight:700,color:ch>0?T.coral:T.teal}}>{ch>0?"▲":"▼"} {Math.abs(ch).toFixed(1)}%</div>
                      </div>
                      <Spark data={entries} up={ch>0} T={T}/>
                    </div>

                    {isSel&&(
                      <div style={{marginTop:12,paddingTop:12,borderTop:`1px solid ${T.border}`}}>
                        {/* history */}
                        {entries.map((e,i)=>(
                          <div key={i} style={{display:"flex",justifyContent:"space-between",fontSize:10,color:T.muted,padding:"3px 0",borderBottom:`1px solid ${T.border}`}}>
                            <span>{e.date}</span><span>{e.supplier}</span><span style={{color:T.navy,fontWeight:600}}>${fmt(e.price)}/{e.unit}</span>
                          </div>
                        ))}

                        {/* price check */}
                        <div style={{marginTop:12}}>
                          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:8}}>
                            <div style={{fontSize:11,fontWeight:700}}>Vancouver Market Price Check</div>
                            <button onClick={e=>{e.stopPropagation();doCheck(name,entries[0]?.unit||"unit",lat);}} disabled={chkIng===name} style={{background:T.blueL,border:`1px solid ${T.border}`,borderRadius:8,color:T.blue,padding:"4px 10px",fontSize:10,cursor:"pointer",fontWeight:700,opacity:chkIng===name?0.5:1}}>{chkIng===name?"Searching...":pc?"🔄 Refresh":"🔍 Check now"}</button>
                          </div>
                          {pc?.status==="loading"&&<div style={{background:T.blueL,borderRadius:8,padding:"10px",fontSize:11,color:T.blue}}>Searching Vancouver retailers...</div>}
                          {pc?.status==="err"&&<div style={{background:T.coralL,borderRadius:8,padding:"10px",fontSize:11,color:T.coral}}>{pc.msg}</div>}
                          {pc?.status==="ok"&&(
                            <div style={{background:pc.data.verdict==="good"?T.tealL:pc.data.verdict==="high"?T.amberL:T.coralL,borderRadius:10,padding:12,border:`1px solid ${pc.data.verdict==="good"?T.teal:pc.data.verdict==="high"?T.amber:T.coral}33`}}>
                              <div style={{fontSize:12,fontWeight:700,color:pc.data.verdict==="good"?T.teal:pc.data.verdict==="high"?T.amber:T.coral,marginBottom:6}}>
                                {pc.data.verdict==="good"?"✓ Good price":pc.data.verdict==="high"?"↑ Above market":"⚠ Significantly above market"}
                                <span style={{fontSize:10,color:T.muted,fontWeight:400,marginLeft:8}}>Market: ${pc.data.marketRange?.low?.toFixed(2)}–${pc.data.marketRange?.high?.toFixed(2)}/{entries[0]?.unit}</span>
                              </div>
                              <div style={{background:T.card,borderRadius:8,marginBottom:8}}>
                                {pc.data.sources?.sort((a,b)=>a.price-b.price).map((src,si)=>{
                                  const sav=(pc.paying||lat)-src.price,cheap=sav>0;
                                  return(
                                    <div key={si} style={{display:"flex",alignItems:"center",gap:8,padding:"8px 10px",borderBottom:si<pc.data.sources.length-1?`1px solid ${T.border}`:"none"}}>
                                      <div style={{width:5,height:5,borderRadius:"50%",background:cheap?T.teal:T.border,flexShrink:0}}/>
                                      <div style={{flex:1}}>
                                        <div style={{fontSize:12,fontWeight:600}}>{src.store}</div>
                                        {src.notes&&<div style={{fontSize:9,color:T.muted}}>{src.notes}</div>}
                                      </div>
                                      <div style={{textAlign:"right"}}>
                                        <div style={{fontSize:12,fontWeight:700,color:cheap?T.teal:T.slate}}>${fmt(src.price)}/{entries[0]?.unit}</div>
                                        {cheap&&<div style={{fontSize:9,color:T.teal,fontWeight:600}}>Save ${fmt(sav)}</div>}
                                      </div>
                                    </div>
                                  );
                                })}
                              </div>
                              <div style={{fontSize:11,color:T.teal,fontWeight:600}}>💡 {pc.data.recommendation}</div>
                              <div style={{fontSize:9,color:T.muted,marginTop:4}}>Checked {pc.at} · Retail prices only · Verify before purchasing</div>
                            </div>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* SUPPLIERS */}
        {tab==="suppliers"&&(
          <div>
            <div style={{fontSize:14,fontWeight:700,marginBottom:12}}>Suppliers</div>
            {["trade","retail"].map(st=>{
              const sups=Object.entries(data.suppliers).filter(([,s])=>s.type===st);
              if(!sups.length)return null;
              return(
                <div key={st} style={{marginBottom:16}}>
                  <div style={{fontSize:10,color:T.muted,textTransform:"uppercase",letterSpacing:"1px",fontWeight:700,marginBottom:8}}>{st==="trade"?"Trade Accounts":"Regular Retail"}</div>
                  <div style={{display:"grid",gap:8}}>
                    {sups.map(([name,s])=>{
                      const isSel=selSup===name;
                      const ingList=Object.entries(data.ingredients).filter(([,ee])=>ee.some(e=>e.supplier===name)).map(([i])=>i);
                      return(
                        <div key={name} onClick={()=>setSelSup(isSel?null:name)} style={{...card,borderColor:isSel?T.blue:T.border,cursor:"pointer"}}>
                          <div style={{display:"flex",alignItems:"flex-start",justifyContent:"space-between"}}>
                            <div>
                              <div style={{fontSize:13,fontWeight:600,marginBottom:2}}>{name}</div>
                              <div style={{fontSize:10,color:T.muted}}>{st==="trade"?`${s.terms} · ${s.delivery}`:"Cash · Self-collect"}</div>
                            </div>
                            {ingList.length>0&&<Tag c={T.blue} bg={T.blueL}>{ingList.length} ingredient{ingList.length>1?"s":""}</Tag>}
                          </div>
                          {isSel&&(
                            <div style={{marginTop:12,paddingTop:12,borderTop:`1px solid ${T.border}`}}>
                              {st==="trade"&&(
                                <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:6,marginBottom:10}}>
                                  {[["Contact",s.contact],["Phone",s.phone],["Email",s.email],["Terms",s.terms],["Delivery",s.delivery]].filter(([,v])=>v).map(([k,v])=>(
                                    <div key={k}><div style={{fontSize:9,color:T.muted,textTransform:"uppercase",fontWeight:700,marginBottom:1}}>{k}</div><div style={{fontSize:11,color:T.slate}}>{v}</div></div>
                                  ))}
                                </div>
                              )}
                              {s.notes&&<div style={{fontSize:11,color:T.muted,fontStyle:"italic",marginBottom:8}}>{s.notes}</div>}
                              {ingList.length>0&&(
                                <div style={{display:"flex",flexWrap:"wrap",gap:5}}>
                                  {ingList.map(ing=>{
                                    const ee=data.ingredients[ing],myP=ee.filter(e=>e.supplier===name).slice(-1)[0]?.price,allP=gL(ee),cheaper=myP&&myP<=allP;
                                    return<Tag key={ing} c={cheaper?T.teal:T.coral} bg={cheaper?T.tealL:T.coralL}>{ing} ${myP?.toFixed(2)}</Tag>;
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
        )}

        {/* SALES & P&L */}
        {tab==="sales"&&(
          <div>
            <div style={{fontSize:14,fontWeight:700,marginBottom:12}}>Sales & P&L</div>
            <div style={{...card,marginBottom:12}}>
              <div style={{fontSize:11,fontWeight:700,color:T.slate,marginBottom:10}}>Menu Cost Analysis</div>
              {Object.entries(data.menu).map(([item,md])=>{
                const cost=bCost(item),fp=bFCP(item),mg=((md.price-cost)/md.price)*100;
                return(
                  <div key={item} style={{display:"flex",alignItems:"center",gap:10,padding:"8px 0",borderBottom:`1px solid ${T.border}`}}>
                    <div style={{flex:1}}>
                      <div style={{fontSize:12,fontWeight:600}}>{item}</div>
                      <div style={{fontSize:10,color:T.muted}}>Sell ${fmt(md.price)} · Cost ${fmt(cost)}</div>
                    </div>
                    <div style={{textAlign:"right"}}>
                      <Tag c={fp>30?T.coral:T.teal} bg={fp>30?T.coralL:T.tealL}>{fp.toFixed(1)}% cost</Tag>
                      <div style={{fontSize:10,color:T.muted,marginTop:3}}>{mg.toFixed(1)}% margin</div>
                    </div>
                  </div>
                );
              })}
            </div>
            {Object.entries(data.sales).map(([mon,s])=>{
              const lr1=s.loc1||0,lr2=s.loc2||0,total=lr1+lr2;
              return(
                <div key={mon} style={{...card,marginBottom:10}}>
                  <div style={{fontSize:13,fontWeight:700,marginBottom:10}}>{mon}</div>
                  <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8}}>
                    {[["Location 1",lr1],["Location 2",lr2],["Total Revenue",total]].map(([l,v])=>(
                      <div key={l} style={{background:T.bg,borderRadius:8,padding:"10px 12px",border:`1px solid ${T.border}`}}>
                        <div style={{fontSize:9,color:T.muted,textTransform:"uppercase",fontWeight:700,marginBottom:3}}>{l}</div>
                        <div style={{fontSize:16,fontWeight:800,color:T.blue}}>${fmt(v)}</div>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* SCAN */}
        {tab==="scan"&&(
          <div>
            <div style={{fontSize:14,fontWeight:700,marginBottom:4}}>Scan Receipt or Invoice</div>
            <div style={{fontSize:11,color:T.muted,marginBottom:14}}>AI extracts ingredients and prices automatically. Duplicates are blocked.</div>
            {!img?(
              <div onClick={()=>fileRef.current?.click()} style={{border:`2px dashed ${T.border}`,borderRadius:16,padding:"44px 20px",textAlign:"center",cursor:"pointer",background:T.card}}>
                <div style={{fontSize:32,marginBottom:10}}>📸</div>
                <div style={{fontSize:13,color:T.slate,fontWeight:600,marginBottom:4}}>Tap to upload receipt photo</div>
                <div style={{fontSize:11,color:T.muted}}>JPG or PNG</div>
                <input ref={fileRef} type="file" accept="image/*" onChange={onFile} style={{display:"none"}}/>
              </div>
            ):(
              <div>
                <div style={{display:"flex",gap:12,marginBottom:12}}>
                  <img src={img.prev} alt="Receipt" style={{width:90,borderRadius:10,border:`1px solid ${T.border}`,objectFit:"cover"}}/>
                  <div style={{flex:1}}>
                    <div style={{fontSize:11,color:T.muted,marginBottom:8}}>{img.name}</div>
                    <button onClick={doScan} disabled={scanning} style={{width:"100%",background:T.blue,color:"#fff",border:"none",borderRadius:10,padding:10,fontSize:13,cursor:"pointer",fontWeight:700,marginBottom:6,opacity:scanning?0.7:1}}>{scanning?"🔍 Analysing...":"Extract Prices with AI"}</button>
                    <button onClick={()=>{setImg(null);setScanRes(null);}} style={{width:"100%",background:"transparent",border:`1px solid ${T.border}`,borderRadius:10,color:T.muted,padding:7,fontSize:11,cursor:"pointer"}}>Use different photo</button>
                  </div>
                </div>
                {scanning&&<div style={{background:T.blueL,borderRadius:10,padding:12,textAlign:"center",color:T.blue,fontSize:12,fontWeight:600}}>🔍 Reading receipt and checking for duplicates...</div>}
                {scanRes&&!scanning&&(
                  <div style={card}>
                    <div style={{fontSize:13,fontWeight:700,marginBottom:4}}>{scanRes.items?.length} items found</div>
                    <div style={{fontSize:10,color:T.muted,marginBottom:10}}>{scanRes.supplier} · {scanRes.date}</div>
                    {scanRes.items?.map((it,i)=>(
                      <div key={i} style={{display:"flex",justifyContent:"space-between",padding:"6px 0",borderBottom:`1px solid ${T.border}`,fontSize:12}}>
                        <span style={{fontWeight:500}}>{it.ingredient}</span>
                        <span style={{color:T.blue,fontWeight:600}}>${fmt(it.price)}/{it.unit}</span>
                      </div>
                    ))}
                    <div style={{display:"flex",gap:8,marginTop:12}}>
                      <button onClick={()=>okScan()} style={{flex:2,background:T.teal,color:"#fff",border:"none",borderRadius:8,padding:10,fontSize:13,cursor:"pointer",fontWeight:700}}>Save to Tracker</button>
                      <button onClick={()=>setScanRes(null)} style={{flex:1,background:"transparent",border:`1px solid ${T.border}`,borderRadius:8,color:T.muted,padding:10,fontSize:11,cursor:"pointer"}}>Discard</button>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* INSIGHTS */}
        {tab==="insights"&&(
          <div>
            <div style={{fontSize:14,fontWeight:700,marginBottom:4}}>Insights</div>
            <div style={{fontSize:11,color:T.muted,marginBottom:14}}>Shared purchasing · revenue split by location</div>
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10,marginBottom:12}}>
              {Object.entries(data.sales).reverse()[0]&&["loc1","loc2"].map((l,i)=>{
                const mon=Object.keys(data.sales).reverse()[0];
                const lr=cRev(mon,l),lc=cCOGS(mon,l),lp=lr?(lc/lr)*100:0;
                return(
                  <div key={l} style={{...card,borderTop:`3px solid ${lp>30?T.coral:T.teal}`}}>
                    <div style={{fontSize:11,fontWeight:700,color:T.slate,marginBottom:4}}>Location {i+1}</div>
                    <div style={{fontSize:20,fontWeight:800,color:lp>30?T.coral:T.teal}}>{lp.toFixed(1)}%</div>
                    <div style={{fontSize:10,color:T.muted}}>food cost</div>
                    <div style={{fontSize:10,fontWeight:700,color:lp>30?T.coral:T.teal,marginTop:4}}>{lp>30?"⚠ Review":"✓ Healthy"}</div>
                  </div>
                );
              })}
            </div>
            {[
              {icon:"📈",sev:"high",title:"Ahi Tuna up 29% since tracking began",detail:"Biggest cost driver across your menu. Classic Tuna and Mango Tuna bowls are most exposed."},
              {icon:"🥑",sev:"medium",title:"Avocado price is volatile",detail:"Swung between $1.20 and $2.10. Buying in bulk when prices dip could reduce exposure."},
              {icon:"🐟",sev:"tip",title:"Salmon is your most stable protein",detail:"Moderate increases compared to tuna. Promoting salmon bowls when tuna spikes is practical."},
              {icon:"🍚",sev:"medium",title:"Sushi rice quietly climbing",detail:"Up 14% since December. Worth benchmarking T&T or a wholesale Asian grocer."},
              {icon:"🏪",sev:"tip",title:"Track whether Costco runs are cheaper",detail:"The app will show you over time whether retail runs are consistently better value."},
              {icon:"📅",sev:"tip",title:"Weekly scan habit pays off quickly",detail:"90 days of data is enough to spot seasonal patterns and negotiate proactively."},
            ].map((it,i)=>(
              <div key={i} style={{...card,marginBottom:8,borderLeft:`3px solid ${it.sev==="high"?T.coral:it.sev==="medium"?T.amber:T.border}`}}>
                <div style={{display:"flex",gap:10}}>
                  <div style={{fontSize:18}}>{it.icon}</div>
                  <div>
                    <div style={{fontSize:12,fontWeight:700,color:it.sev==="high"?T.coral:it.sev==="medium"?T.amber:T.navy,marginBottom:3}}>{it.title}</div>
                    <div style={{fontSize:11,color:T.slate,lineHeight:1.5}}>{it.detail}</div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

      </div>
    </div>
  );
}
