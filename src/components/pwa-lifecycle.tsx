"use client";
import { useEffect, useState, useSyncExternalStore } from "react";
import { PwaInstallPrompt } from "@/components/pwa-install-prompt";
import { registerNotificationWorker } from "@/lib/notification-events";

const subscribeConnection = (listener: () => void) => {
  window.addEventListener("online", listener); window.addEventListener("offline", listener);
  return () => { window.removeEventListener("online", listener); window.removeEventListener("offline", listener); };
};
export function PwaLifecycle() {
  const online = useSyncExternalStore(subscribeConnection, () => navigator.onLine, () => true);
  const [waiting, setWaiting] = useState<ServiceWorker | null>(null);
  const [dismissedUpdate,setDismissedUpdate]=useState<ServiceWorker|null>(null);
  const updateReady=Boolean(waiting&&waiting!==dismissedUpdate);
  const [notice, setNotice] = useState("");
  useEffect(() => {
    if (!window.isSecureContext || !("serviceWorker" in navigator)) return;
    let active = true;
    void registerNotificationWorker().then(registration => {
      const observe = () => { if (active) setWaiting(registration.waiting); };
      observe(); registration.addEventListener("updatefound", () => {
        registration.installing?.addEventListener("statechange", observe);
      });
      return registration.update();
    }).catch(() => { if (active) setNotice("App updates are unavailable. Your current session still works online."); });
    return () => { active = false; };
  }, []);
  useEffect(()=>{const restored=()=>setNotice("Connected again. Check any interrupted operation before submitting another transaction.");window.addEventListener("online",restored);return()=>window.removeEventListener("online",restored);},[]);
  useEffect(()=>{
    let scheduled=0;let tableId=0;
    const label=()=>{scheduled=0;for(const table of document.querySelectorAll<HTMLTableElement>(".workspace-content table")) {
      if(!table.dataset.tableId)table.dataset.tableId=`gadget-table-${++tableId}`;
      const heads=[...table.querySelectorAll<HTMLTableCellElement>("thead th")];
      heads.forEach((head,index)=>{if(!head.id)head.id=`${table.dataset.tableId}-${index}`;if(!head.scope)head.scope="col";});
      for(const row of table.querySelectorAll("tbody tr")){let index=0;for(const cell of row.querySelectorAll<HTMLTableCellElement>("td")){const heading=heads.slice(index,index+cell.colSpan);const text=heading.map(head=>head.textContent?.trim()).join(" / ");if(cell.dataset.label!==text)cell.dataset.label=text;const headers=heading.map(head=>head.id).join(" ");if(cell.headers!==headers)cell.headers=headers;index+=cell.colSpan;}}
    }};
    const observer=new MutationObserver(()=>{if(!scheduled)scheduled=requestAnimationFrame(label);});
    observer.observe(document.body,{subtree:true,childList:true});label();
    return()=>{observer.disconnect();cancelAnimationFrame(scheduled);};
  },[]);
  function update() {
    if (!waiting) return;
    navigator.serviceWorker.addEventListener("controllerchange", () => window.location.reload(), { once: true });
    waiting.postMessage({ type: "APPLY_UPDATE" });
  }
  return <><PwaInstallPrompt suspended={!online||Boolean(waiting)||Boolean(notice)}/>{(!online||updateReady||notice)&&<aside className="pwa-status" aria-label="App status"><p role="status">{!online ? "You’re offline. Transactions are not submitted or queued. Reconnect before saving." : updateReady ? "An app update is ready. Save your work before installing and restarting." : notice}</p>{online && updateReady && <div className="pwa-status-actions"><button type="button" onClick={()=>setDismissedUpdate(waiting)}>Cancel</button><button type="button" className="pwa-update-install" onClick={update}>Install update</button></div>}{online && notice && <button type="button" onClick={()=>setNotice("")}>Dismiss</button>}</aside>}</>;
}
export function PwaSettings() {
  const [message, setMessage] = useState("");
  const [theme, setTheme] = useState("system");
  useEffect(() => { const saved = localStorage.getItem("gadgethub-theme"); if (saved) queueMicrotask(()=>setTheme(saved)); }, []);
  function change(value: string) {
    setTheme(value); localStorage.setItem("gadgethub-theme",value);
    if (value === "system") delete document.documentElement.dataset.theme; else document.documentElement.dataset.theme=value;
  }
  return <section className="security-panel"><h3>Your installed workspace</h3><p className="security-detail">On iPhone, open Safari’s Share menu, then choose Add to Home Screen and Open as Web App. On other devices, use the browser’s Install app menu. Face ID and the device PIN are provided by your operating system.</p><label className="security-field">Appearance<select aria-label="Appearance" value={theme} onChange={event=>change(event.target.value)}><option value="system">Follow device</option><option value="light">Light</option><option value="dark">Dark</option></select></label><button className="security-secondary" onClick={()=>{const installed=window.matchMedia("(display-mode: standalone)").matches || Boolean((navigator as Navigator & {standalone?:boolean}).standalone); setMessage(installed ? "GadgetHub is running as an installed app." : "Use your browser’s Add to Home Screen or Install app menu. Installation is offered by your browser.");}}>Check installation</button>{message && <p role="status" className="security-notice">{message}</p>}<p className="security-detail">Shop data stays online. The offline screen never stores customer records, financial data, or pending payments.</p></section>;
}
