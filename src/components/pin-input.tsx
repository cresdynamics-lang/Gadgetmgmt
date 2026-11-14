"use client";

import { useEffect, useImperativeHandle, useRef, useState, type Ref } from "react";
import { Eye, EyeOff } from "lucide-react";

/** One semantic input preserves paste, autofill, selection and native editing. */
export function PinInput({id,label,disabled,inputRef,invalid=false}:{id:string;label:string;disabled?:boolean;inputRef?:Ref<HTMLInputElement>;invalid?:boolean}) {
  const [value,setValue]=useState("");
  const [visible,setVisible]=useState(false);
  const [focused,setFocused]=useState(false);
  const [position,setPosition]=useState(0);
  const control=useRef<HTMLInputElement|null>(null);
  useImperativeHandle(inputRef,()=>control.current!,[]);
  useEffect(()=>{const conceal=()=>{if(document.hidden)setVisible(false);};document.addEventListener("visibilitychange",conceal);return()=>document.removeEventListener("visibilitychange",conceal);},[]);
  return <div className="security-field pin-field" onBlur={event=>{if(!event.currentTarget.contains(event.relatedTarget))setVisible(false);}}>
    <label htmlFor={id}>{label}</label>
    <div className="pin-control">
      <input id={id} name={id} ref={control} className="pin-native" type={visible?"text":"password"} value={value} inputMode="numeric" autoComplete="off" pattern="[0-9]{6}" minLength={6} maxLength={6} required disabled={disabled} aria-invalid={invalid||undefined}
        onFocus={()=>setFocused(true)} onBlur={()=>setFocused(false)} onSelect={event=>setPosition(event.currentTarget.selectionStart??0)}
        onChange={event=>{setValue(event.target.value.replace(/[^0-9]/g,""));setPosition(event.target.selectionStart??0);}}
        onPointerDown={event=>{const rect=event.currentTarget.getBoundingClientRect();const index=Math.min(value.length,Math.max(0,Math.floor((event.clientX-rect.left)/rect.width*6)));requestAnimationFrame(()=>{control.current?.setSelectionRange(index,index);setPosition(index);});}}/>
      <div className="pin-boxes" aria-hidden="true">{Array.from({length:6},(_,index)=><span key={index} className={`pin-box${value[index]?" is-filled":""}${focused&&index===Math.min(position,5)?" is-current":""}${invalid?" is-invalid":""}`}>{value[index]?(visible?value[index]:"●"):""}</span>)}</div>
    </div>
    <button type="button" className="pin-visibility" disabled={disabled} aria-pressed={visible} onClick={()=>setVisible(current=>!current)}>{visible?<EyeOff size={18} aria-hidden="true"/>:<Eye size={18} aria-hidden="true"/>}{visible?"Hide PIN":"Show PIN"}</button>
  </div>;
}
