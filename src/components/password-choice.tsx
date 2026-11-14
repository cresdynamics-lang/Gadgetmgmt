"use client";
import { useId, useState } from "react";
import { RefreshCw } from "lucide-react";
import { generateAccountPassword } from "@/lib/account-password";
import { SecretInput } from "./secret-input";

export function PasswordChoice({label,value,onChange,disabled}:{label:string;value:string;onChange:(value:string)=>void;disabled?:boolean}) {
  const id=useId();const [generated,setGenerated]=useState(false);
  return <div className="security-field security-stack"><label htmlFor={id}>{label}</label><SecretInput id={id} name="password" value={value} onChange={event=>{onChange(event.target.value);setGenerated(false);}} required minLength={12} maxLength={72} autoComplete="new-password" disabled={disabled}/><button type="button" className="security-link gap-2 justify-self-start" disabled={disabled} onClick={()=>{onChange(generateAccountPassword());setGenerated(true);}}><RefreshCw size={16} aria-hidden="true"/>Generate password</button><p className="security-detail" role={generated?"status":undefined}>{generated?"Secure password generated.":"12 characters minimum, or generate a password."}</p></div>;
}
