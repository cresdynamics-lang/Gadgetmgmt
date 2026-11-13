"use client";
import Image from "next/image";
import { useEffect, useState } from "react";

type InstallEvent=Event & {prompt:()=>Promise<void>;userChoice:Promise<{outcome:"accepted"|"dismissed"}>};
const dismissKey="gadgethub-install-dismissed-until";
export function PwaInstallPrompt({suspended=false}:{suspended?:boolean}) {
  const [event,setEvent]=useState<InstallEvent|null>(null);
  const [eligible,setEligible]=useState(false);
  const [ios,setIos]=useState(false);
  const [instructions,setInstructions]=useState(false);
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState("");
  useEffect(()=>{
    const mode=window.matchMedia("(display-mode: standalone)");
    const isInstalled=()=>mode.matches||Boolean((navigator as Navigator & {standalone?:boolean}).standalone);
    const isIos=/iPad|iPhone|iPod/.test(navigator.userAgent)||(navigator.platform==="MacIntel"&&navigator.maxTouchPoints>1);
    let dismissed=false;try{dismissed=Number(localStorage.getItem(dismissKey))>Date.now();}catch{}
    queueMicrotask(()=>{setIos(isIos);setEligible(!isInstalled()&&!dismissed);});
    const available=(value:Event)=>{value.preventDefault();if(!isInstalled())setEvent(value as InstallEvent);};
    const installed=()=>{setEligible(false);setEvent(null);};
    window.addEventListener("beforeinstallprompt",available);window.addEventListener("appinstalled",installed);mode.addEventListener("change",installed);
    return()=>{window.removeEventListener("beforeinstallprompt",available);window.removeEventListener("appinstalled",installed);mode.removeEventListener("change",installed);};
  },[]);
  function dismiss(){setEligible(false);try{localStorage.setItem(dismissKey,String(Date.now()+7*86400000));}catch{}}
  async function install(){
    if(ios){setInstructions(true);return;}
    if(!event)return;setBusy(true);setError("");
    try{await event.prompt();const choice=await event.userChoice;setEvent(null);if(choice.outcome==="dismissed")dismiss();else setEligible(false);}
    catch{setError("The browser could not open installation. Use its menu to install, or try again later.");setEvent(null);}
    finally{setBusy(false);}
  }
  if(suspended||!eligible||(!ios&&!event&&!error))return null;
  return <section className="pwa-install" aria-label="Install GadgetHub"><div className="pwa-install-heading"><Image src="/brand/icon-black.png" alt="" width={44} height={44} unoptimized/><div><h2>GadgetHub, one tap away</h2><p>Add your workspace to your Home Screen.</p></div><button type="button" aria-label="Dismiss installation prompt" onClick={dismiss}>×</button></div>{instructions?<div className="pwa-install-instructions"><p>In Safari, open the <strong>Share</strong> menu (or <strong>More → Share</strong>), then choose <strong>Add to Home Screen</strong>. Keep <strong>Open as Web App</strong> on, if shown, and tap <strong>Add</strong>.</p><button type="button" onClick={dismiss}>Got it</button></div>:<div className="pwa-install-actions"><button type="button" onClick={dismiss}>Not now</button>{(ios||event)&&<button type="button" onClick={()=>void install()} disabled={busy}>{busy?"Opening…":ios?"How to install":"Install app"}</button>}</div>}{error&&<p role="alert">{error}</p>}</section>;
}
